// dsh-delivery-board domain logic — pure functions, no dsh dependencies, testable with node --test.
//
// Model: a delivery pipeline; cards flow across stages; cross-stage handoffs
// automatically record an audit log. Teams collaborate through shared delivery
// state in a git repo (offline-friendly; default file name configurable).
// Cards carry structured specs (acceptance criteria + DoD); stages carry
// governance gate checklists (trackable, not hard blockers).
//
// state shape:
// {
//   version: 3,
//   customer: 'name',
//   template: 'lite' | 'default' | 'governance' | 'custom',
//   pipeline: [{ id, name, role, gates: [string], gateDone?: [boolean], wipLimit?: number }],
//   cards: [{ id, title, stage, owner, due, acceptance: [..], dod: [..], createdAt, archivedAt? }],
//   lastCardNumber?: number, // high-water mark; IDs survive external card removals
//   logs: [{ ts, type: 'progress'|'risk'|'blocker'|'decision'|'handoff', text, cardId, resolvedAt? }],
//   createdAt, updatedAt,
// }
// Soft WIP limits (optional wipLimit on a stage) warn on the board / after moves; they do not block.
// Weekly report derives shipped + risk burn-down for the window; next_week notes are framed as next bets.


export const LOG_TYPES = ['progress', 'risk', 'blocker', 'decision', 'handoff']

/** Risk/blocker entries without resolvedAt are open (backward compatible). */
export function isOpenRisk(entry) {
  return (entry?.type === 'risk' || entry?.type === 'blocker') && entry.resolvedAt == null
}

export function openRisks(state) {
  return state.logs.filter(isOpenRisk)
}

/** Soft Kanban WIP: positive integer or undefined (no limit). Does not block moves. */
export function normalizeWipLimit(value) {
  if (value === undefined || value === null || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1) throw new Error('wipLimit must be a positive integer')
  return n
}

export function activeCardsInStage(state, stageId) {
  return state.cards.filter((c) => c.stage === stageId && c.archivedAt == null)
}

/** Returns null when the stage has no WIP limit; otherwise { limit, count, over }. */
export function stageWip(state, stageId) {
  const stage = state.pipeline.find((s) => s.id === stageId)
  if (!stage || stage.wipLimit == null) return null
  const count = activeCardsInStage(state, stageId).length
  return { limit: stage.wipLimit, count, over: count > stage.wipLimit }
}

export function wipWarnings(state) {
  return state.pipeline
    .map((stage) => {
      const status = stageWip(state, stage.id)
      if (!status?.over) return null
      return `${stage.name} (${stage.id}): ${status.count}/${status.limit} WIP (soft limit exceeded)`
    })
    .filter(Boolean)
}

// Default template: ToB delivery pipeline
const DEFAULT_STAGES = [
  { id: 'client', name: 'Client Requirements', role: 'Client', gates: ['Scope confirmed'] },
  { id: 'ba', name: 'BA Analysis', role: 'BA', gates: ['Acceptance criteria frozen'] },
  { id: 'tl', name: 'TL Design', role: 'TL', gates: ['Design review passed'] },
  { id: 'dev', name: 'Development', role: 'Dev', gates: ['DoD met'] },
  { id: 'test', name: 'Testing', role: 'QA', gates: ['Test pass rate met'] },
  { id: 'devsecops', name: 'DevSecOps Launch', role: 'DevSecOps', gates: ['Security scan passed', 'Release approved'] },
  { id: 'live', name: 'Live', role: '—', gates: [] },
]

// Governance template: a generic, gate-heavy delivery pipeline
// (Plan → Analyze → Design → Build → Test → Deploy) whose gates emphasize
// quality, risk and security sign-off.
const GOVERNANCE_STAGES = [
  { id: 'plan', name: 'Plan', role: 'PM', gates: ['Goals/scope/stakeholders aligned', 'Initiation approved'] },
  { id: 'analyze', name: 'Analyze', role: 'BA', gates: ['Requirements spec confirmed', 'Acceptance criteria frozen'] },
  { id: 'design', name: 'Design', role: 'TL', gates: ['Architecture review passed', 'Technical risks assessed'] },
  { id: 'build', name: 'Build', role: 'Dev', gates: ['Code review passed', 'DoD met'] },
  { id: 'test', name: 'Test', role: 'QA', gates: ['Test plan executed', 'Defects converged'] },
  { id: 'deploy', name: 'Deploy', role: 'DevSecOps', gates: ['Security gate passed', 'Release approved', 'Rollback plan ready'] },
  { id: 'live', name: 'Live', role: '—', gates: [] },
]

// Lite template: short local default (few/no gates). Prefer for 30s quickstart.
const LITE_STAGES = [
  { id: 'backlog', name: 'Backlog', role: '—', gates: [] },
  { id: 'doing', name: 'Doing', role: 'Dev', gates: [] },
  { id: 'review', name: 'Review', role: 'QA', gates: [] },
  { id: 'live', name: 'Live', role: '—', gates: [] },
]

export const TEMPLATES = {
  lite: { name: 'Lite Pipeline', stages: LITE_STAGES },
  default: { name: 'ToB Delivery Pipeline', stages: DEFAULT_STAGES },
  governance: { name: 'Governance Pipeline', stages: GOVERNANCE_STAGES },
}


/** Case-insensitive unique match on stage id or name; errors list candidates. */
export function resolveStageRef(state, ref) {
  const raw = String(ref ?? '').trim()
  if (!raw) throw new Error('stage is required')
  const exactId = state.pipeline.find((s) => s.id === raw)
  if (exactId) return exactId
  const lower = raw.toLowerCase()
  const matches = []
  const seen = new Set()
  for (const stage of state.pipeline) {
    if (stage.id.toLowerCase() === lower || stage.name.toLowerCase() === lower) {
      if (!seen.has(stage.id)) {
        seen.add(stage.id)
        matches.push(stage)
      }
    }
  }
  if (matches.length === 1) return matches[0]
  const candidates = state.pipeline.map((s) => `${s.id} (${s.name})`).join(', ')
  if (matches.length > 1) {
    throw new Error(`ambiguous stage "${raw}": ${matches.map((s) => `${s.id} (${s.name})`).join(', ')}`)
  }
  throw new Error(`unknown stage: ${raw}. Candidates: ${candidates || '(none)'}`)
}

/** Case-insensitive unique match on card id or title; errors list candidates. */
export function resolveCardRef(state, ref) {
  const raw = String(ref ?? '').trim()
  if (!raw) throw new Error('card is required')
  const exactId = state.cards.find((c) => c.id === raw)
  if (exactId) return exactId
  const lower = raw.toLowerCase()
  const matches = []
  const seen = new Set()
  for (const card of state.cards) {
    if (card.id.toLowerCase() === lower || card.title.toLowerCase() === lower) {
      if (!seen.has(card.id)) {
        seen.add(card.id)
        matches.push(card)
      }
    }
  }
  if (matches.length === 1) return matches[0]
  const active = state.cards.filter((c) => c.archivedAt == null)
  const pool = active.length ? active : state.cards
  const candidates = pool.slice(0, 12).map((c) => `${c.id} (${c.title})`).join(', ')
  if (matches.length > 1) {
    throw new Error(`ambiguous card "${raw}": ${matches.map((c) => `${c.id} (${c.title})`).join(', ')}`)
  }
  throw new Error(`unknown card: ${raw}. Candidates: ${candidates || '(none)'}`)
}


const now = () => new Date().toISOString()

function normalizeStages(stages) {
  return stages.map((s, i) => {
    const gates = Array.isArray(s.gates) ? s.gates.map((g) => String(g)) : []
    const stage = {
      id: s.id ?? `s${i + 1}`,
      name: String(s.name).trim(),
      role: s.role ?? '',
      gates,
    }
    if (Array.isArray(s.gateDone)) {
      stage.gateDone = gates.map((_, gi) => s.gateDone[gi] === true)
    }
    const wip = normalizeWipLimit(s.wipLimit)
    if (wip != null) stage.wipLimit = wip
    return stage
  })
}

function findStage(state, stageId) {
  return resolveStageRef(state, stageId)
}

function markCustom(state) {
  return state.template === 'custom' ? state : { ...state, template: 'custom' }
}

function uniqueStageId(state, preferred) {
  const used = stageIds(state)
  let base = String(preferred || 'stage').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'stage'
  if (!used.has(base)) return base
  let n = 2
  while (used.has(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

function gateDoneList(stage) {
  return stage.gates.map((_, i) => stage.gateDone?.[i] === true)
}

/** Toggle or set a stage gate checklist item. Missing gateDone means all unchecked. Not a hard move blocker. */
export function setGateDone(state, { stageId, gateIndex, done }) {
  const stage = findStage(state, stageId)
  if (!Number.isInteger(gateIndex) || gateIndex < 0 || gateIndex >= stage.gates.length) {
    throw new Error(`unknown gate index: ${gateIndex}`)
  }
  const gateDone = gateDoneList(stage)
  const next = done === undefined ? !gateDone[gateIndex] : Boolean(done)
  if (gateDone[gateIndex] === next) return state
  gateDone[gateIndex] = next
  return {
    ...state,
    updatedAt: now(),
    pipeline: state.pipeline.map((s) => (s.id === stageId ? { ...s, gateDone } : s)),
  }
}

/** Insert a stage after `after` (stage id), or append when omitted. Marks template custom. */
export function addStage(state, { name, role = '', gates = [], id, after, wipLimit }) {
  if (!name || !String(name).trim()) throw new Error('name is required')
  const stageName = String(name).trim()
  const stageId = id != null ? String(id).trim() : uniqueStageId(state, stageName)
  if (!stageId) throw new Error('id is required')
  if (stageIds(state).has(stageId)) throw new Error(`stage already exists: ${stageId}`)
  let insertAt = state.pipeline.length
  if (after !== undefined && after !== null && after !== '') {
    const afterId = resolveStageRef(state, after).id
    const idx = state.pipeline.findIndex((s) => s.id === afterId)
    insertAt = idx + 1
  }
  const stage = {
    id: stageId,
    name: stageName,
    role: String(role ?? '').trim(),
    gates: normalizeList(gates),
  }
  const wip = normalizeWipLimit(wipLimit)
  if (wip != null) stage.wipLimit = wip
  const pipeline = [...state.pipeline.slice(0, insertAt), stage, ...state.pipeline.slice(insertAt)]
  const ts = now()
  const next = markCustom({ ...state, updatedAt: ts, pipeline })
  return {
    ...next,
    logs: [...state.logs, { ts, type: 'decision', text: `Stage "${stage.name}" (${stage.id}) added`, cardId: null }],
  }
}

/** Rename / retarget role / replace gate labels on a stage. Resizes gateDone by index. */
export function updateStage(state, { stageId, name, role, gates, wipLimit }) {
  const stage = findStage(state, stageId)
  const changes = {}
  let clearWip = false
  if (name !== undefined) {
    if (!name || !String(name).trim()) throw new Error('name is required')
    changes.name = String(name).trim()
  }
  if (role !== undefined) changes.role = String(role ?? '').trim()
  if (gates !== undefined) {
    const nextGates = normalizeList(gates)
    changes.gates = nextGates
    const prevDone = gateDoneList(stage)
    changes.gateDone = nextGates.map((_, i) => prevDone[i] === true)
  }
  if (wipLimit !== undefined) {
    if (wipLimit === null || wipLimit === '') {
      clearWip = stage.wipLimit != null
    } else {
      const wip = normalizeWipLimit(wipLimit)
      if (stage.wipLimit !== wip) changes.wipLimit = wip
    }
  }
  const fields = Object.keys(changes).filter((key) => {
    if (key === 'gates' || key === 'gateDone') {
      const previous = stage[key] ?? (key === 'gateDone' ? gateDoneList(stage) : [])
      const next = changes[key]
      return previous.length !== next.length || previous.some((value, i) => value !== next[i])
    }
    return stage[key] !== changes[key]
  })
  if (clearWip) fields.push('wipLimit')
  if (!fields.length) return state
  const ts = now()
  const next = markCustom({
    ...state,
    updatedAt: ts,
    pipeline: state.pipeline.map((s) => {
      if (s.id !== stageId) return s
      const merged = { ...s, ...changes }
      if (clearWip) delete merged.wipLimit
      return merged
    }),
  })
  const label = fields.filter((f) => f !== 'gateDone').join(', ') || 'gates'
  return {
    ...next,
    logs: [...state.logs, { ts, type: 'decision', text: `Stage "${changes.name ?? stage.name}" (${stageId}) updated: ${label}`, cardId: null }],
  }
}

/**
 * Remove a stage. Safe default: refuse if any cards (active or archived) still sit on it.
 * Pass migrateTo to move those cards to another stage first (no handoff log; decision only).
 */
export function removeStage(state, { stageId, migrateTo }) {
  stageId = resolveStageRef(state, stageId).id
  if (state.pipeline.length <= 1) throw new Error('cannot remove the last stage')
  const stuck = state.cards.filter((c) => c.stage === stageId)
  if (stuck.length && (migrateTo === undefined || migrateTo === null || migrateTo === '')) {
    throw new Error(`stage ${stageId} still has ${stuck.length} card(s); pass migrate_to to move them before removing`)
  }
  let cards = state.cards
  let migrateNote = ''
  if (stuck.length) {
    const targetId = resolveStageRef(state, migrateTo).id
    if (targetId === stageId) throw new Error('migrate_to must be a different stage')
    cards = state.cards.map((c) => (c.stage === stageId ? { ...c, stage: targetId } : c))
    migrateNote = `; ${stuck.length} card(s) moved to ${targetId}`
  }
  const removed = state.pipeline.find((s) => s.id === stageId)
  const pipeline = state.pipeline.filter((s) => s.id !== stageId)
  const ts = now()
  const next = markCustom({ ...state, updatedAt: ts, pipeline, cards })
  return {
    ...next,
    logs: [...state.logs, {
      ts, type: 'decision', cardId: null,
      text: `Stage "${removed.name}" (${stageId}) removed${migrateNote}`,
    }],
  }
}

function normalizeList(v) {
  if (v == null) return []
  return (Array.isArray(v) ? v : String(v).split('\n')).map((x) => String(x).trim()).filter(Boolean)
}

export function createProject({ customer, template = 'default', stages }) {
  if (!customer || typeof customer !== 'string' || !customer.trim()) {
    throw new Error('customer is required')
  }
  let pipeline
  let tpl = template
  if (stages?.length) {
    pipeline = normalizeStages(stages)
    tpl = 'custom'
  } else {
    if (!TEMPLATES[template]) throw new Error(`unknown template: ${template}`)
    pipeline = normalizeStages(TEMPLATES[template].stages)
  }
  const ts = now()
  return {
    version: 3,
    customer: customer.trim(),
    template: tpl,
    pipeline,
    cards: [],
    logs: [],
    createdAt: ts,
    updatedAt: ts,
  }
}

function stageIds(state) {
  return new Set(state.pipeline.map((s) => s.id))
}

function isArchived(card) {
  return card.archivedAt != null
}

function findCard(state, cardId) {
  return resolveCardRef(state, cardId)
}

function requireActive(card) {
  if (isArchived(card)) throw new Error(`card ${card.id} is archived; restore it first`)
}

function normalizeDue(due) {
  if (due == null) return null
  const parsed = typeof due === 'string' ? new Date(`${due}T00:00:00Z`) : new Date(NaN)
  if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== due) {
    throw new Error('due must be a valid date in YYYY-MM-DD format')
  }
  return due
}

function nextCardNumber(state) {
  // Legacy states need no migration. Logs also reserve IDs of removed cards.
  let max = state.lastCardNumber ?? 0
  for (const id of [...state.cards.map((c) => c.id), ...state.logs.map((l) => l.cardId)]) {
    const match = /^c(\d+)$/.exec(id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

function recordCardDecision(state, card, text, ts = now()) {
  return {
    ...state,
    updatedAt: ts,
    cards: state.cards.map((c) => (c.id === card.id ? card : c)),
    logs: [...state.logs, { ts, type: 'decision', text, cardId: card.id }],
  }
}

export function addCard(state, { title, stage, owner = '', due = null, acceptance, dod }) {
  if (!title || !String(title).trim()) throw new Error('title is required')
  const stageId = resolveStageRef(state, stage).id
  const cardNumber = nextCardNumber(state)
  const card = {
    id: `c${cardNumber}`,
    title: String(title).trim(),
    stage: stageId,
    owner: String(owner ?? '').trim(),
    due: normalizeDue(due),
    acceptance: normalizeList(acceptance),
    dod: normalizeList(dod),
    createdAt: now(),
  }
  return { ...state, lastCardNumber: cardNumber, updatedAt: card.createdAt, cards: [...state.cards, card] }
}

export function archiveCard(state, { cardId }) {
  const card = findCard(state, cardId)
  if (isArchived(card)) return state
  const ts = now()
  return recordCardDecision(state, { ...card, archivedAt: ts }, `"${card.title}" archived`, ts)
}

export function restoreCard(state, { cardId }) {
  const card = findCard(state, cardId)
  if (!isArchived(card)) return state
  return recordCardDecision(state, { ...card, archivedAt: null }, `"${card.title}" restored`)
}

export function updateCard(state, { cardId, title, owner, due, acceptance, dod }) {
  const card = findCard(state, cardId)
  requireActive(card)
  const changes = {}
  if (title !== undefined) {
    if (!title || !String(title).trim()) throw new Error('title is required')
    changes.title = String(title).trim()
  }
  if (owner !== undefined) changes.owner = String(owner ?? '').trim()
  if (due !== undefined) changes.due = normalizeDue(due)
  if (acceptance !== undefined) changes.acceptance = normalizeList(acceptance)
  if (dod !== undefined) changes.dod = normalizeList(dod)
  const fields = Object.keys(changes).filter((key) => {
    if (key === 'acceptance' || key === 'dod') {
      const previous = card[key] ?? []
      return previous.length !== changes[key].length || previous.some((value, i) => value !== changes[key][i])
    }
    return card[key] !== changes[key]
  })
  if (!fields.length) return state
  return recordCardDecision(state, { ...card, ...changes }, `"${card.title}" updated: ${fields.join(', ')}`)
}

// Moving a card = cross-stage handoff: automatically records a handoff log
// (audit trail); owner can change hands at the same time. When the target
// stage equals the current stage there is no handoff: an owner change (or a
// note) is recorded as a decision entry instead, so it never shows up as a
// "Development → Development" handoff in the weekly report.
export function moveCard(state, { cardId, toStage, owner = null, note = '' }) {
  const card = findCard(state, cardId)
  requireActive(card)
  toStage = resolveStageRef(state, toStage).id
  const from = state.pipeline.find((s) => s.id === card.stage)
  const to = state.pipeline.find((s) => s.id === toStage)
  const nextOwner = owner == null ? card.owner : String(owner).trim()
  const cleanNote = String(note ?? '').trim()
  const ts = now()
  if (toStage === card.stage) {
    const ownerChanged = nextOwner !== card.owner
    if (!ownerChanged && !cleanNote) return state
    const text = (ownerChanged
      ? `"${card.title}" owner changed: ${card.owner || '(none)'} → ${nextOwner || '(none)'} (stage unchanged: ${to.name})`
      : `"${card.title}" note (stage unchanged: ${to.name})`) + (cleanNote ? `: ${cleanNote}` : '')
    return recordCardDecision(state, { ...card, owner: nextOwner }, text, ts)
  }
  const moved = { ...card, stage: toStage, owner: nextOwner }
  const entry = {
    ts,
    type: 'handoff',
    text: `"${card.title}" moved from ${from.name} → ${to.name}` + (cleanNote ? `: ${cleanNote}` : ''),
    cardId: card.id,
  }
  return {
    ...state,
    updatedAt: ts,
    cards: state.cards.map((c) => (c.id === card.id ? moved : c)),
    logs: [...state.logs, entry],
  }
}

export function appendLog(state, { type, text, cardId = null }) {
  if (!LOG_TYPES.includes(type)) throw new Error(`invalid log type: ${type}`)
  if (!text || !String(text).trim()) throw new Error('text is required')
  let resolved = null
  if (cardId != null && cardId !== '') {
    const raw = String(cardId).trim()
    try {
      resolved = resolveCardRef(state, raw).id
    } catch (err) {
      // Keep orphan / legacy ids so history still reserves numbers after external removals.
      if (/^ambiguous card/.test(err.message)) throw err
      resolved = raw
    }
  }
  const entry = { ts: now(), type, text: String(text).trim(), cardId: resolved }
  return { ...state, updatedAt: entry.ts, logs: [...state.logs, entry] }
}

// Mark a risk/blocker as resolved. Missing resolvedAt on legacy entries means open.
// index is the position in state.logs (stable for concurrent readers with revision guards).
export function resolveLog(state, { index }) {
  if (!Number.isInteger(index) || index < 0 || index >= state.logs.length) {
    throw new Error(`unknown log index: ${index}`)
  }
  const entry = state.logs[index]
  if (entry.type !== 'risk' && entry.type !== 'blocker') {
    throw new Error(`log ${index} is not a risk or blocker`)
  }
  if (entry.resolvedAt != null) return state
  const ts = now()
  return {
    ...state,
    updatedAt: ts,
    logs: state.logs.map((log, i) => (i === index ? { ...log, resolvedAt: ts } : log)),
  }
}

// Text board (quick glance in chat; the pretty version is delivery_board_html)
export function renderBoard(state, options = {}) {
  const lines = [`# ${state.customer} Delivery Board`, '']
  if (options.includeArchived) {
    const archived = state.cards.filter(isArchived).length
    lines.push(`Cards: ${state.cards.length - archived} active / ${archived} archived`, '')
  }
  for (const stage of state.pipeline) {
    const cards = state.cards.filter((c) => c.stage === stage.id && (options.includeArchived || !isArchived(c)))
    const archived = cards.filter(isArchived).length
    const activeCount = cards.filter((c) => !isArchived(c)).length
    const wip = stage.wipLimit != null ? ` · WIP ${activeCount}/${stage.wipLimit}${activeCount > stage.wipLimit ? ' ⚠ over' : ''}` : ''
    lines.push(`## ${stage.name}${stage.role && stage.role !== '—' ? ` (${stage.role})` : ''} · ${cards.length}${archived ? ` (${archived} archived)` : ''}${wip}`)
    if (stage.gates.length) {
      const done = gateDoneList(stage)
      lines.push(`  Gates: ${stage.gates.map((g, i) => `${done[i] ? '[x]' : '[ ]'} ${g}`).join(' / ')}`)
    }
    if (!cards.length) {
      lines.push('  (empty — add a card, or drag one here)')
    } else {
      for (const c of cards) {
        lines.push(`  - [${c.id}] ${c.title}${c.owner ? ` @${c.owner}` : ''}${c.due ? ` (due ${c.due})` : ''}${isArchived(c) ? ' [archived]' : ''}`)
      }
    }
    lines.push('')
  }
  const risks = openRisks(state)
  if (risks.length) {
    lines.push(`## Open risks / blockers · ${risks.length}`)
    for (const r of risks.slice(-5)) lines.push(`  ! [${r.type}] ${r.text}`)
    lines.push('')
  }
  const overs = wipWarnings(state)
  if (overs.length) {
    lines.push(`## Soft WIP warnings · ${overs.length}`)
    for (const w of overs) lines.push(`  ! ${w}`)
    lines.push('')
  }
  lines.push(`Last updated: ${state.updatedAt}`)
  return lines.join('\n')
}

function localDateLabel(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function inWindow(iso, start, end) {
  const t = new Date(iso)
  return Number.isFinite(t.getTime()) && t >= start && t < end
}

/** Cards that reached the terminal stage or were archived during the reporting window. */
export function shippedInWindow(state, start, end) {
  const terminal = state.pipeline[state.pipeline.length - 1]
  const items = []
  const seen = new Set()
  for (const log of state.logs) {
    if (!inWindow(log.ts, start, end) || !log.cardId) continue
    if (log.type === 'handoff' && terminal && log.text.includes(`→ ${terminal.name}`)) {
      if (seen.has(`ship:${log.cardId}`)) continue
      seen.add(`ship:${log.cardId}`)
      const card = state.cards.find((c) => c.id === log.cardId)
      items.push(`- [${log.cardId}] ${card?.title ?? log.cardId} → ${terminal.name}`)
      continue
    }
    if (log.type === 'decision') {
      const match = /"([^"]+)" archived/.exec(log.text)
      if (!match) continue
      if (seen.has(`arch:${log.cardId}`)) continue
      seen.add(`arch:${log.cardId}`)
      items.push(`- [${log.cardId}] ${match[1]} (archived)`)
    }
  }
  return items
}

export function risksResolvedInWindow(state, start, end) {
  return state.logs.filter((l) => (
    (l.type === 'risk' || l.type === 'blocker')
    && l.resolvedAt != null
    && inWindow(l.resolvedAt, start, end)
  ))
}

export function renderWeekly(state, weekLabel = '', weekStart, nextWeek = '') {
  let start
  if (weekStart !== undefined) {
    const parsed = new Date(`${weekStart}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== weekStart) {
      throw new Error('week_start must be a valid date in YYYY-MM-DD format')
    }
    start = new Date(`${weekStart}T00:00:00`)
  } else {
    start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (start.getDay() + 6) % 7)
  }
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const lastDay = new Date(end)
  lastDay.setDate(lastDay.getDate() - 1)
  const period = `${localDateLabel(start)} – ${localDateLabel(lastDay)}`
  const label = weekLabel || period
  const risks = openRisks(state)
  const handoffs = state.logs.filter((l) => l.type === 'handoff' && inWindow(l.ts, start, end))
  const shipped = shippedInWindow(state, start, end)
  const burned = risksResolvedInWindow(state, start, end)
  const nextNotes = normalizeList(nextWeek)
  const lines = [
    `# ${state.customer} Delivery Weekly (${label})`,
    '',
    `Reporting period: ${period} (local time); pipeline counts are the current active snapshot.`,
    '',
    '## Pipeline progress',
    ...state.pipeline.map((s) => {
      const n = state.cards.filter((c) => c.stage === s.id && !isArchived(c)).length
      const wip = s.wipLimit != null ? ` (WIP ${n}/${s.wipLimit}${n > s.wipLimit ? ' over' : ''})` : ''
      return `- ${s.name}: ${n} card(s)${wip}`
    }),
    '',
    '## Shipped this week',
    ...(shipped.length ? shipped : ['- none']),
    '',
    '## Handoffs this week',
    ...(handoffs.length ? handoffs.map((l) => `- ${l.text}`) : ['- none']),
    '',
    '## Risks & blockers',
    ...(risks.length ? risks.map((l) => `- ${l.text}`) : ['- none']),
    '',
    '## Risks resolved this week',
    ...(burned.length ? burned.map((l) => `- [${l.type}] ${l.text}`) : ['- none']),
    '',
  ]
  if (nextNotes.length) {
    lines.push('## Next bets', ...nextNotes.map((note) => `- ${note}`), '')
  }
  return lines.join('\n')
}
