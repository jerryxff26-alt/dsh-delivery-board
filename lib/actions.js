// Shared deterministic mutations for tools, slash commands and the local board.
import { addCard, moveCard, appendLog, updateCard, archiveCard, restoreCard } from './delivery.js'

const fields = {
  card: ['title', 'stage', 'owner', 'due', 'acceptance', 'dod'],
  move: ['card_id', 'to_stage', 'owner', 'note'],
  update: ['card_id', 'title', 'owner', 'due', 'acceptance', 'dod'],
  archive: ['card_id'], restore: ['card_id'],
  log: ['type', 'text', 'card_id'],
}

export function applyAction(state, action, args) {
  if (!fields[action]) throw new Error(`unknown delivery action: ${action}`)
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('arguments must be a JSON object')
  for (const key of Object.keys(args)) {
    if (!fields[action].includes(key)) throw new Error(`unsupported ${action} field: ${key}`)
  }
  for (const key of ['card_id', 'title', 'stage', 'to_stage', 'owner', 'note', 'text', 'type']) {
    if (args[key] !== undefined && typeof args[key] !== 'string') throw new Error(`${key} must be a string`)
  }
  for (const key of ['acceptance', 'dod']) {
    if (args[key] !== undefined && (!Array.isArray(args[key]) || args[key].some((item) => typeof item !== 'string'))) throw new Error(`${key} must be an array of strings`)
  }
  if (action === 'card') return addCard(state, args)
  if (action === 'move') {
    // moveCard returns the same state for same-stage no-ops and records a
    // decision (not a handoff) for same-stage owner changes.
    return moveCard(state, { cardId: args.card_id, toStage: args.to_stage, owner: args.owner ?? null, note: args.note ?? '' })
  }
  if (action === 'update') {
    const { card_id, ...patch } = args
    return updateCard(state, { cardId: card_id, ...patch })
  }
  if (action === 'archive') return archiveCard(state, { cardId: args.card_id })
  if (action === 'restore') return restoreCard(state, { cardId: args.card_id })
  return appendLog(state, { type: args.type, text: args.text, cardId: args.card_id ?? null })
}
