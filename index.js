// dsh-delivery-board — ToB delivery collaboration plugin (host tool plugin)
//
// Positioning: delivery board. BMAD-style skills solve "one person directing
// a swarm of agents"; this plugin solves "a whole team looking at the same delivery
// board": role pipeline + card flow + handoff audit + visual board.
// State lives in delivery.json inside the team's shared git repo (offline-friendly).
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
  addCard,
  moveCard,
  appendLog,
  renderBoard,
  renderWeekly,
  LOG_TYPES,
  TEMPLATES,
} from './lib/delivery.js'
import { renderBoardHtml } from './lib/board-html.js'
import { readState, writeState, stateExists } from './lib/store.js'

export const name = 'delivery-board'

export const inject = ['tools', 'fs', 'systemPrompt']

export const Config = z.object({
  fileName: z.string().default('delivery.json'),
  boardFile: z.string().default('delivery-board.html'),
})

// Uniform output: execute returns { text }, render turns it into model-visible text
const textOutput = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string', required: true } },
    additionalProperties: false,
  },
  render: (_args, value) => value.text,
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
  ctx.systemPrompt.section({
    name: 'delivery-board',
    order: 100,
    text: [
      'ToB delivery collaboration plugin (dsh-delivery-board) — the team\'s delivery board.',
      'Templates: "default" (Client Requirements → BA Analysis → TL Design → Development → Testing → DevSecOps Launch → Live) or "governance" (governance-style pipeline: Plan → Analyze → Design → Build → Test → Deploy, each stage with governance gates).',
      'Use delivery_init once per project. Use delivery_card to add work cards (with acceptance criteria + DoD).',
      'Use delivery_move to hand cards across stages (owner can change; a handoff audit log is recorded automatically).',
      'Use delivery_board for a quick text board; delivery_board_html to generate a pretty standalone HTML kanban (open in a browser, share with the team).',
      'Use delivery_log for progress/risks/blockers/decisions; delivery_weekly for the client report.',
      `State lives in ${config.fileName} at the session workspace root — keep it in the team's shared git repo so everyone sees the same board.`,
    ].join('\n'),
  })

  ctx.tools.register(
    defineTool({
      name: 'delivery_init',
      description: 'Initialize a client delivery project: customer + pipeline template (default / governance) or custom stages',
      parameters: {
        customer: { type: 'string', description: 'Customer name', required: true },
        template: {
          type: 'string',
          enum: Object.keys(TEMPLATES),
          description: 'Pipeline template: default = ToB delivery pipeline, governance = governance governance pipeline',
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
            },
            additionalProperties: false,
          },
        },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        if (await stateExists(ctx, exec, config.fileName)) {
          throw new Error(`A delivery project already exists (${config.fileName}). Delete the file first to start over.`)
        }
        const state = createProject({
          customer: args.customer,
          template: args.template ?? 'default',
          stages: args.stages,
        })
        await writeState(ctx, exec, config.fileName, state)
        const names = state.pipeline.map((s) => s.name).join(' → ')
        return ok(`Delivery project initialized: ${state.customer} (${TEMPLATES[state.template]?.name ?? 'Custom Pipeline'})\nPipeline: ${names}`)
      },
    }),
  )

  ctx.tools.register(
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
        const state = await loadOrThrow(ctx, exec, config.fileName)
        const next = addCard(state, {
          title: args.title,
          stage: args.stage,
          owner: args.owner ?? '',
          due: args.due ?? null,
          acceptance: args.acceptance,
          dod: args.dod,
        })
        await writeState(ctx, exec, config.fileName, next)
        const card = next.cards[next.cards.length - 1]
        return ok(`Card created [${card.id}] ${card.title} → ${args.stage}`)
      },
    }),
  )

  ctx.tools.register(
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
        const state = await loadOrThrow(ctx, exec, config.fileName)
        const next = moveCard(state, {
          cardId: args.card_id,
          toStage: args.to_stage,
          owner: args.owner ?? null,
          note: args.note ?? '',
        })
        await writeState(ctx, exec, config.fileName, next)
        const last = next.logs[next.logs.length - 1]
        return ok(`Handed off: ${last.text}`)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'delivery_board',
      description: 'Quick text board: cards per stage + gates + open risks',
      parameters: {},
      output: textOutput,
      isConcurrencySafe: () => true,
      async execute(_args, exec) {
        const state = await loadOrThrow(ctx, exec, config.fileName)
        return ok(renderBoard(state))
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'delivery_board_html',
      description: 'Generate a pretty standalone HTML kanban board (open in a browser, share with the team)',
      parameters: {
        output: { type: 'string', description: 'Output filename (optional, defaults to delivery-board.html)' },
      },
      output: textOutput,
      isConcurrencySafe: () => false,
      async execute(args, exec) {
        const state = await loadOrThrow(ctx, exec, config.fileName)
        const html = renderBoardHtml(state)
        const outFile = args.output || config.boardFile
        const target = await ctx.fs.resolve(outFile, {
          cwd: exec?.agent?.session?.header?.cwd,
          signal: exec?.signal,
        })
        await ctx.fs.writeText(target, html, { signal: exec?.signal })
        return ok(`HTML board generated: ${outFile} (workspace root — open it in a browser to view/share)`)
      },
    }),
  )

  ctx.tools.register(
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
        const state = await loadOrThrow(ctx, exec, config.fileName)
        const next = appendLog(state, {
          type: args.type,
          text: args.text,
          cardId: args.card_id ?? null,
        })
        await writeState(ctx, exec, config.fileName, next)
        return ok(`Logged [${args.type}]: ${args.text}`)
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'delivery_weekly',
      description: 'Draft the client weekly report (Markdown): pipeline progress, handoffs, risks, next week',
      parameters: {
        week_label: { type: 'string', description: 'Week label (optional, e.g. "Week of Oct 12")' },
      },
      output: textOutput,
      isConcurrencySafe: () => true,
      async execute(args, exec) {
        const state = await loadOrThrow(ctx, exec, config.fileName)
        return ok(renderWeekly(state, args.week_label ?? ''))
      },
    }),
  )
}
