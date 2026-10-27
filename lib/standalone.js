// Shared standalone runner: same domain mutations as the DSH plugin, Node fs + local board.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  createProject,
  renderBoard,
  renderWeekly,
  wipWarnings,
  TEMPLATES,
} from './delivery.js'
import { renderBoardHtml } from './board-html.js'
import {
  readState,
  initializeState,
  mutateState,
  resolveTarget,
} from './store.js'
import { applyAction } from './actions.js'
import { createBoardManager } from './board-server.js'
import { createStandaloneCtx } from './node-fs.js'
import { parseDeliveryCommand, commandHelp } from './commands.js'

export { parseDeliveryCommand, commandHelp }

export function createStandaloneSession({ cwd = process.cwd(), fileName = 'delivery.json', boardFile = 'delivery-board.html' } = {}) {
  const root = path.resolve(cwd)
  const ctx = createStandaloneCtx(root)
  const config = { fileName, boardFile }
  const boards = createBoardManager(ctx, config, { keepAlive: true })
  const exec = {
    workspaceCwd: root,
    agent: { session: { id: 'standalone-cli', header: { cwd: root } } },
  }

  async function loadOrThrow() {
    const state = await readState(ctx, exec, config.fileName)
    if (!state) {
      throw new Error(`No delivery project yet. Initialize one with init first (data file: ${config.fileName}).`)
    }
    return state
  }

  async function run(action, args = {}) {
    if (action === 'help') return commandHelp.replaceAll('/delivery-admin', 'dsh-delivery-board')

    if (action === 'init') {
      const state = await initializeState(ctx, exec, config.fileName, () => createProject({
        customer: args.customer,
        template: args.template ?? 'default',
        stages: args.stages,
      }))
      const names = state.pipeline.map((s) => s.name).join(' → ')
      return `Delivery project initialized: ${state.customer} (${TEMPLATES[state.template]?.name ?? 'Custom Pipeline'})\nPipeline: ${names}\nFile: ${path.join(root, config.fileName)}`
    }

    if (action === 'board') {
      const state = await loadOrThrow()
      return renderBoard(state, { includeArchived: args.include_archived ?? false })
    }

    if (action === 'weekly') {
      const state = await loadOrThrow()
      return renderWeekly(state, args.week_label ?? '', args.week_start, args.next_week ?? '')
    }

    if (action === 'html') {
      const state = await loadOrThrow()
      const outFile = args.output || config.boardFile
      if (!/\.html?$/i.test(outFile)) throw new Error('HTML output must use a .html or .htm extension.')
      const stateTarget = await resolveTarget(ctx, exec, config.fileName)
      const outAbs = path.resolve(root, outFile)
      if (outAbs === stateTarget.targetKey) throw new Error('HTML output cannot overwrite the delivery state file.')
      await writeFile(outAbs, renderBoardHtml(state), 'utf8')
      return `HTML board generated: ${outFile}`
    }

    if (action === 'open') {
      await loadOrThrow()
      const url = await boards.open(exec)
      return {
        text: `Interactive delivery board: ${url}\nLoopback-only; Ctrl+C to stop. Saves back to ${config.fileName}.`,
        keepAlive: true,
        close: () => boards.close(),
      }
    }

    if (action === 'card') {
      const { state: next } = await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'card', args))
      const card = next.cards[next.cards.length - 1]
      return `Card created [${card.id}] ${card.title} → ${args.stage}`
    }

    if (action === 'move') {
      let moved = false
      const { state: next } = await mutateState(ctx, exec, config.fileName, (state) => {
        const result = applyAction(state, 'move', args)
        moved = result !== state
        return result
      })
      if (!moved) return `No changes: ${args.card_id} is already in ${args.to_stage}.`
      const last = next.logs[next.logs.length - 1]
      const warn = wipWarnings(next).filter((w) => w.includes(`(${args.to_stage})`))
      const base = last.type === 'handoff' ? `Handed off: ${last.text}` : `Updated (no handoff): ${last.text}`
      return warn.length ? `${base}\nSoft WIP warning: ${warn.join('; ')}` : base
    }

    if (action === 'update') {
      const patch = args.due === '' ? { ...args, due: null } : args
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'update', patch))
      return `Card updated [${args.card_id}]`
    }

    if (action === 'log') {
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'log', args))
      return `Logged [${args.type}]: ${args.text}`
    }

    if (action === 'resolve') {
      const index = args.log_index
      if (!Number.isInteger(index) || index < 0) throw new Error('log_index must be a non-negative integer')
      let entry
      await mutateState(ctx, exec, config.fileName, (state) => {
        entry = state.logs[index]
        return applyAction(state, 'resolve', { log_index: index })
      })
      return `Resolved [${entry?.type ?? 'log'}] at index ${index}: ${entry?.text ?? ''}`
    }

    if (action === 'gate') {
      if (!Number.isInteger(args.gate_index) || args.gate_index < 0) throw new Error('gate_index must be a non-negative integer')
      let label
      await mutateState(ctx, exec, config.fileName, (state) => {
        const stage = state.pipeline.find((s) => s.id === args.stage_id)
        label = stage?.gates?.[args.gate_index]
        return applyAction(state, 'gate', args)
      })
      return `Gate updated on ${args.stage_id}: ${label ?? args.gate_index}`
    }

    if (action === 'stage_add') {
      let addedId
      const { state } = await mutateState(ctx, exec, config.fileName, (state) => {
        const before = new Set(state.pipeline.map((s) => s.id))
        const next = applyAction(state, 'stage_add', args)
        addedId = next.pipeline.find((s) => !before.has(s.id))?.id
        return next
      })
      const added = state.pipeline.find((s) => s.id === addedId)
      return `Stage added [${added.id}] ${added.name}`
    }

    if (action === 'stage_update') {
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'stage_update', args))
      return `Stage updated [${args.stage_id}]`
    }

    if (action === 'stage_remove') {
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, 'stage_remove', args))
      return `Stage removed [${args.stage_id}]`
    }

    if (action === 'archive' || action === 'restore') {
      await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, action, args))
      return `Card ${action === 'archive' ? 'archived' : 'restored'} [${args.card_id}]`
    }

    throw new Error(`Unknown delivery command: ${action}. Run dsh-delivery-board help.`)
  }

  return { ctx, exec, config, boards, run, close: () => boards.close() }
}
