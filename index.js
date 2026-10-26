// dsh-delivery-board — ToB delivery collaboration plugin (host tool plugin)
//
// A shared delivery board for ToB delivery teams: role pipeline, card flow,
// handoff audit trail, weekly report and a local visual board.
// Shared delivery state lives in the team's git repo (offline-friendly; default file configurable).
//
// Plugin contract (per deepseek-ai/deepseek-harness official docs and the community
// tested guide):
//   - exports name / inject / Config / apply; name matches the cordis.patch.yml row id
//   - tools registered via ctx.tools.register(defineTool({...}))
//   - file IO goes through ctx.fs (inherits session workspace / sandbox / observation policy)

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

import {
  createProject,
  renderBoard,
  renderWeekly,
  wipWarnings,
  LOG_TYPES,
  TEMPLATES,
} from './lib/delivery.js'
import { renderBoardHtml } from './lib/board-html.js'
import { readState, initializeState, mutateState, resolveTarget } from './lib/store.js'
import { applyAction } from './lib/actions.js'
import { createBoardManager } from './lib/board-server.js'
import { registerDeliveryCommand } from './lib/commands.js'
import { loadDeliverySkill } from './lib/skill.js'

export const name = 'delivery-board'

export const inject = ['tools', 'fs', 'systemPrompt', 'commands', 'skills']

export const Config = z.object({
  fileName: z.string().default('delivery.json'),
  boardFile: z.string().default('delivery-board.html'),
})

// DSH output.render returns ContentBlock[], not a plain string.
const textOutput = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string', required: true } },
    additionalProperties: false,
  },
  render: (_args, value) => [{ type: 'text', text: value.text }],
}

const ok = (text) => ({ text })

async function loadOrThrow(ctx, exec, fileName) {
  const state = await readState(ctx, exec, fileName)
  if (!state) {
    throw new Error(`No delivery project yet. Initialize one with delivery_init first (data file: ${fileName}).`)
  }
  return state
}

export function apply(ctx, config) {
  const registered = new Map()
  const register = (tool) => { registered.set(tool.name, tool); ctx.tools.register(tool) }
  const boards = createBoardManager(ctx, config)
  ctx.skills.register(loadDeliverySkill())
  ctx.systemPrompt.section({
    name: 'delivery-board',
    order: 100,
    text: [
      'Codebase-native delivery: use the delivery skill for repository-grounded planning, acceptance criteria, handoffs and reporting.',
      'The /delivery skill is model-led. Load it before delivery task actions when it is available in the skill catalog; explicit /delivery invocations already include its instructions.',
      'Use the delivery_* tools to read and mutate shared delivery state. /delivery-admin help is the advanced, deterministic command escape hatch, not the normal skill workflow.',
      `Delivery state is stored at the session workspace root (default file ${config.fileName}). ${config.boardFile} is a read-only export; delivery_open returns the editable machine-local board URL.`,
    ].join('\n'),
  })

  register(
    defineTool({
      name: 'delivery_init',
      description: 'Initialize a client delivery project: customer + pipeline template (default / governance) or custom stages',
      parameters: {
        customer: { type: 'string', description: 'Customer name', required: true },
        template: {
          type: 'string',
          enum: Object.keys(TEMPLATES),
          description: 'Pipeline template: default = ToB delivery pipeline, governance = governance-style pipeline with sign-off gates',
        },
        stages: {
          type: 'array',
          description: 'Custom stages (optional; overrides the template when provided)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Stage name', required: true },
              role: { type: 'string', description: 'Owning role' },
              gates: { type: 'array', items: { type: 'string' }, description: 'Governance gate checklist' },
              wipLimit: { type: 'number', description: 'Optional soft WIP limit (positive integer; warn-only)' },
            },
            additionalProperties: false,
          },
        },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const state = await initializeState(ctx, exec, config.fileName, () => createProject({
          customer: args.customer,
          template: args.template ?? 'default',
          stages: args.stages,
        }))
        const names = state.pipeline.map((s) => s.name).join(' → ')
        return ok(`Delivery project initialized: ${state.customer} (${TEMPLATES[state.template]?.name ?? 'Custom Pipeline'})\nPipeline: ${names}`)
      },
    }),
  )

  register(
    defineTool({
      name: 'delivery_card',
      description: 'Add a work card: title, stage, owner, due date, acceptance criteria, DoD',
      parameters: {
        title: { type: 'string', description: 'Card title', required: true },
        stage: { type: 'string', description: 'Stage id', required: true },
        owner: { type: 'string', description: 'Owner (optional)' },
        due: { type: 'string', description: 'Due date YYYY-MM-DD (optional)' },
        acceptance: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria (optional)' },
        dod: { type: 'array', items: { type: 'string' }, description: 'Definition of Done (optional)' },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const { state: next } = await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'card', args))
        const card = next.cards[next.cards.length - 1]
        return ok(`Card created [${card.id}] ${card.title} → ${args.stage}`)
      },
    }),
  )

  register(
    defineTool({
      name: 'delivery_move',
      description: 'Hand a card to another stage (records a handoff audit log; owner can change)',
      parameters: {
        card_id: { type: 'string', description: 'Card id (e.g. c1)', required: true },
        to_stage: { type: 'string', description: 'Target stage id', required: true },
        owner: { type: 'string', description: 'New owner after handoff (optional)' },
        note: { type: 'string', description: 'Handoff note (optional)' },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        let moved = false
        const { state: next } = await mutateState(ctx, exec, config.fileName, (state) => {
          const result = applyAction(state, 'move', args)
          moved = result !== state
          return result
        })
        if (!moved) return ok(`No changes: ${args.card_id} is already in ${args.to_stage}.`)
        const last = next.logs[next.logs.length - 1]
        const warn = wipWarnings(next).filter((w) => w.includes(`(${args.to_stage})`))
        const base = last.type === 'handoff' ? `Handed off: ${last.text}` : `Updated (no handoff): ${last.text}`
        return ok(warn.length ? `${base}\nSoft WIP warning: ${warn.join('; ')}` : base)
      },
    }),
  )

  register(
    defineTool({
      name: 'delivery_board',
      description: 'Quick text board: cards per stage + gates + soft WIP + open risks',
      parameters: { include_archived: { type: 'boolean', description: 'Include archived cards (default false)' } },
      output: textOutput,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const state = await loadOrThrow(ctx, exec, config.fileName)
        return ok(renderBoard(state, { includeArchived: args.include_archived ?? false }))
      },
    }),
  )

  register(
    defineTool({
      name: 'delivery_board_html',
      description: 'Export a read-only, offline HTML kanban snapshot; use delivery_open to edit and save in the browser',
      parameters: {
        output: { type: 'string', description: 'Output filename (optional, defaults to delivery-board.html)' },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const state = await loadOrThrow(ctx, exec, config.fileName)
        const outFile = args.output || config.boardFile
        const stateTarget = await resolveTarget(ctx, exec, config.fileName)
        const outputTarget = await resolveTarget(ctx, exec, outFile)
        if (outputTarget.targetKey === stateTarget.targetKey) {
          throw new Error('HTML output cannot overwrite the delivery state file.')
        }
        if (!/\.html?$/i.test(outFile)) throw new Error('HTML output must use a .html or .htm extension.')
        const html = renderBoardHtml(state)
        await ctx.fs.writeText(outputTarget, html, undefined, exec?.signal)
        return ok(`HTML board generated: ${outFile} (workspace root — open it in a browser to view/share)`)
      },
    }),
  )

  register(
    defineTool({
      name: 'delivery_log',
      description: 'Log an update: progress / risk / blocker / decision',
      parameters: {
        type: { type: 'string', enum: LOG_TYPES, description: 'Update type', required: true },
        text: { type: 'string', description: 'Content', required: true },
        card_id: { type: 'string', description: 'Related card id (optional)' },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'log', args))
        return ok(`Logged [${args.type}]: ${args.text}`)
      },
    }),
  )

  register(
    defineTool({
      name: 'delivery_resolve',
      description: 'Mark an open risk or blocker log entry as resolved by its index in the delivery state logs',
      parameters: {
        log_index: { type: 'number', description: 'Zero-based index into the logs array', required: true },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const index = args.log_index
        if (!Number.isInteger(index) || index < 0) throw new Error('log_index must be a non-negative integer')
        let entry
        await mutateState(ctx, exec, config.fileName, (state) => {
          entry = state.logs[index]
          return applyAction(state, 'resolve', { log_index: index })
        })
        return ok(`Resolved [${entry?.type ?? 'log'}] at index ${index}: ${entry?.text ?? ''}`)
      },
    }),
  )

  register(
    defineTool({
      name: 'delivery_weekly',
      description: 'Draft the client weekly report (Markdown): pipeline, shipped this week, handoffs, open/resolved risks; optional next bets via next_week',
      parameters: {
        week_label: { type: 'string', description: 'Report title label (optional; does not select the reporting dates)' },
        week_start: { type: 'string', description: 'First reporting date YYYY-MM-DD (inclusive, seven days in local time; defaults to Monday of the current week)' },
        next_week: { type: 'string', description: 'Optional next bets / next-week notes (string or newline-separated list). When omitted or empty, the Next bets section is omitted.' },
      },
      output: textOutput,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const state = await loadOrThrow(ctx, exec, config.fileName)
        return ok(renderWeekly(state, args.week_label ?? '', args.week_start, args.next_week ?? ''))
      },
    }),
  )

  register(defineTool({
    name: 'delivery_open',
    description: 'Open an interactive loopback-only board: drag/move/edit/archive/restore/log/gate checklists save to delivery state',
    parameters: {}, output: textOutput, isConcurrencySafe: () => false,
    async execute(_args, exec) {
      const url = await boards.open(exec)
      return ok(`Interactive delivery board: ${url}\nThis local URL can read and edit this workspace only. Keep it private; it expires when DSH exits or this plugin stops.`)
    },
  }))

  register(defineTool({
    name: 'delivery_update', description: 'Edit active card metadata; omitted fields are preserved',
    parameters: {
      card_id: { type: 'string', required: true, description: 'Card id' },
      title: { type: 'string', description: 'New title' },
      owner: { type: 'string', description: 'New owner; empty string clears' },
      due: { type: 'string', description: 'New due date YYYY-MM-DD; empty string clears' },
      acceptance: { type: 'array', items: { type: 'string' }, description: 'Replace acceptance criteria' },
      dod: { type: 'array', items: { type: 'string' }, description: 'Replace DoD checklist' },
    }, output: textOutput, isConcurrencySafe: () => false,
    async execute(args, exec) {
      const patch = args.due === '' ? { ...args, due: null } : args
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'update', patch))
      return ok(`Card updated [${args.card_id}]`)
    },
  }))

  register(defineTool({
    name: 'delivery_gate',
    description: 'Toggle or set a stage gate checklist item (trackable; does not block moves)',
    parameters: {
      stage_id: { type: 'string', required: true, description: 'Stage id' },
      gate_index: { type: 'number', required: true, description: 'Zero-based index into the stage gates list' },
      done: { type: 'boolean', description: 'Explicit checked state; omit to toggle' },
    },
    output: textOutput, isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!Number.isInteger(args.gate_index) || args.gate_index < 0) throw new Error('gate_index must be a non-negative integer')
      let label
      await mutateState(ctx, exec, config.fileName, (state) => {
        const stage = state.pipeline.find((s) => s.id === args.stage_id)
        label = stage?.gates?.[args.gate_index]
        return applyAction(state, 'gate', args)
      })
      return ok(`Gate updated on ${args.stage_id}: ${label ?? args.gate_index}`)
    },
  }))

  register(defineTool({
    name: 'delivery_stage_add',
    description: 'Add a pipeline stage after init (marks template custom). Optional after=stage_id to insert.',
    parameters: {
      name: { type: 'string', required: true, description: 'Stage name' },
      role: { type: 'string', description: 'Owning role' },
      gates: { type: 'array', items: { type: 'string' }, description: 'Gate checklist labels' },
      id: { type: 'string', description: 'Optional stage id (auto-generated from name when omitted)' },
      after: { type: 'string', description: 'Insert after this stage id (append when omitted)' },
      wip_limit: { type: 'number', description: 'Optional soft WIP limit (positive integer; warn-only, does not block moves)' },
    },
    output: textOutput, isConcurrencySafe: () => false,
    async execute(args, exec) {
      let addedId
      const { state } = await mutateState(ctx, exec, config.fileName, (state) => {
        const before = new Set(state.pipeline.map((s) => s.id))
        const next = applyAction(state, 'stage_add', args)
        addedId = next.pipeline.find((s) => !before.has(s.id))?.id
        return next
      })
      const added = state.pipeline.find((s) => s.id === addedId)
      return ok(`Stage added [${added.id}] ${added.name}`)
    },
  }))

  register(defineTool({
    name: 'delivery_stage_update',
    description: 'Rename a stage or replace its role / gate labels after init',
    parameters: {
      stage_id: { type: 'string', required: true, description: 'Stage id' },
      name: { type: 'string', description: 'New stage name' },
      role: { type: 'string', description: 'New owning role' },
      gates: { type: 'array', items: { type: 'string' }, description: 'Replace gate checklist labels (check state kept by index)' },
      wip_limit: { type: 'number', description: 'Soft WIP limit (positive integer). Pass null to clear.' },
    },
    output: textOutput, isConcurrencySafe: () => false,
    async execute(args, exec) {
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'stage_update', args))
      return ok(`Stage updated [${args.stage_id}]`)
    },
  }))

  register(defineTool({
    name: 'delivery_stage_remove',
    description: 'Remove a pipeline stage. Refuses if cards remain on it unless migrate_to is set.',
    parameters: {
      stage_id: { type: 'string', required: true, description: 'Stage id to remove' },
      migrate_to: { type: 'string', description: 'Move cards on the removed stage to this stage id first' },
    },
    output: textOutput, isConcurrencySafe: () => false,
    async execute(args, exec) {
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'stage_remove', args))
      return ok(`Stage removed [${args.stage_id}]`)
    },
  }))

  for (const action of ['archive', 'restore']) {
    register(defineTool({
      name: `delivery_${action}`,
      description: action === 'archive' ? 'Archive a card without deleting its metadata or history' : 'Restore an archived card to its previous stage',
      parameters: { card_id: { type: 'string', required: true, description: 'Card id' } },
      output: textOutput, isConcurrencySafe: () => false,
      async execute(args, exec) {
        await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, action, args))
        return ok(`Card ${action === 'archive' ? 'archived' : 'restored'} [${args.card_id}]`)
      },
    }))
  }

  registerDeliveryCommand(ctx, async (action, args, exec) => {
    const tool = registered.get(action === 'html' ? 'delivery_board_html' : `delivery_${action}`)
    return (await tool.execute(args, exec)).text
  })

}
