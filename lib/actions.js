// Shared deterministic mutations for tools, slash commands and the local board.
import {
  addCard, moveCard, appendLog, updateCard, archiveCard, restoreCard, resolveLog,
  setGateDone, addStage, updateStage, removeStage,
} from './delivery.js'

const fields = {
  card: ['title', 'stage', 'owner', 'due', 'acceptance', 'dod'],
  move: ['card_id', 'to_stage', 'owner', 'note'],
  update: ['card_id', 'title', 'owner', 'due', 'acceptance', 'dod'],
  archive: ['card_id'], restore: ['card_id'],
  log: ['type', 'text', 'card_id'],
  resolve: ['log_index'],
  gate: ['stage_id', 'gate_index', 'done'],
  stage_add: ['name', 'role', 'gates', 'id', 'after', 'wip_limit'],
  stage_update: ['stage_id', 'name', 'role', 'gates', 'wip_limit'],
  stage_remove: ['stage_id', 'migrate_to'],
}

export function applyAction(state, action, args) {
  if (!fields[action]) throw new Error(`unknown delivery action: ${action}`)
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be a JSON object')
  for (const key of Object.keys(args)) {
    if (!fields[action].includes(key)) throw new Error(`unsupported ${action} field: ${key}`)
  }
  for (const key of ['card_id', 'title', 'stage', 'to_stage', 'owner', 'note', 'text', 'type', 'stage_id', 'name', 'role', 'id', 'after', 'migrate_to']) {
    if (args[key] !== undefined && typeof args[key] !== 'string') throw new Error(`${key} must be a string`)
  }
  for (const key of ['acceptance', 'dod', 'gates']) {
    if (args[key] !== undefined && (!Array.isArray(args[key]) || args[key].some((item) => typeof item !== 'string'))) throw new Error(`${key} must be an array of strings`)
  }
  if (args.log_index !== undefined && (!Number.isInteger(args.log_index) || args.log_index < 0)) {
    throw new Error('log_index must be a non-negative integer')
  }
  if (args.gate_index !== undefined && (!Number.isInteger(args.gate_index) || args.gate_index < 0)) {
    throw new Error('gate_index must be a non-negative integer')
  }
  if (args.done !== undefined && typeof args.done !== 'boolean') throw new Error('done must be a boolean')
  if (args.wip_limit !== undefined && args.wip_limit !== null) {
    if (!Number.isInteger(args.wip_limit) || args.wip_limit < 1) throw new Error('wip_limit must be a positive integer or null')
  }

  if (action === 'card') return addCard(state, args)
  if (action === 'move') {
    return moveCard(state, { cardId: args.card_id, toStage: args.to_stage, owner: args.owner ?? null, note: args.note ?? '' })
  }
  if (action === 'update') {
    const { card_id, ...patch } = args
    return updateCard(state, { cardId: card_id, ...patch })
  }
  if (action === 'archive') return archiveCard(state, { cardId: args.card_id })
  if (action === 'restore') return restoreCard(state, { cardId: args.card_id })
  if (action === 'resolve') return resolveLog(state, { index: args.log_index })
  if (action === 'gate') {
    return setGateDone(state, { stageId: args.stage_id, gateIndex: args.gate_index, done: args.done })
  }
  if (action === 'stage_add') {
    return addStage(state, { name: args.name, role: args.role, gates: args.gates, id: args.id, after: args.after, wipLimit: args.wip_limit })
  }
  if (action === 'stage_update') {
    const { stage_id, wip_limit, ...patch } = args
    return updateStage(state, { stageId: stage_id, ...patch, wipLimit: wip_limit })
  }
  if (action === 'stage_remove') {
    return removeStage(state, { stageId: args.stage_id, migrateTo: args.migrate_to })
  }
  return appendLog(state, { type: args.type, text: args.text, cardId: args.card_id ?? null })
}
