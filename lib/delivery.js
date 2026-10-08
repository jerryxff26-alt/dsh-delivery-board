// dsh-delivery-board domain logic — pure functions, no dsh dependencies, testable with node --test.
//
// Model: a delivery pipeline; cards flow across stages; cross-stage handoffs
// automatically record an audit log. Teams collaborate through delivery.json
// in a shared git repo (offline-friendly).
// Cards carry structured specs (acceptance criteria + DoD); stages carry
// governance gates (display-only in v1).
//
// state shape:
// {
//   version: 3,
//   customer: 'name',
//   template: 'default' | 'governance' | 'custom',
//   pipeline: [{ id, name, role, gates: [..] }],
//   cards: [{ id, title, stage, owner, due, acceptance: [..], dod: [..], createdAt, archivedAt? }],
//   lastCardNumber?: number, // high-water mark; IDs survive external card removals
//   logs: [{ ts, type: 'progress'|'risk'|'blocker'|'decision'|'handoff', text, cardId }],
//   createdAt, updatedAt,
// }

export const LOG_TYPES = ['progress', 'risk', 'blocker', 'decision', 'handoff']

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

export const TEMPLATES = {
  default: { name: 'ToB Delivery Pipeline', stages: DEFAULT_STAGES },
  governance: { name: 'Governance Pipeline', stages: GOVERNANCE_STAGES },
}

const now = () => new Date().toISOString()

function normalizeStages(stages) {
  return stages.map((s, i) => ({
    id: s.id ?? `s${i + 1}`,
    name: String(s.name).trim(),
    role: s.role ?? '',
    gates: Array.isArray(s.gates) ? s.gates.map((g) => String(g)) : [],
  }))
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
  const card = state.cards.find((c) => c.id === cardId)
  if (!card) throw new Error(`unknown card: ${cardId}`)
  return card
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
  if (!stageIds(state).has(stage)) throw new Error(`unknown stage: ${stage}`)
  const cardNumber = nextCardNumber(state)
  const card = {
    id: `c${cardNumber}`,
    title: String(title).trim(),
    stage,
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
  if (!stageIds(state).has(toStage)) throw new Error(`unknown stage: ${toStage}`)
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
    cardId,
  }
  return {
    ...state,
    updatedAt: ts,
    cards: state.cards.map((c) => (c.id === cardId ? moved : c)),
    logs: [...state.logs, entry],
  }
}

export function appendLog(state, { type, text, cardId = null }) {
  if (!LOG_TYPES.includes(type)) throw new Error(`invalid log type: ${type}`)
  if (!text || !String(text).trim()) throw new Error('text is required')
  const entry = { ts: now(), type, text: String(text).trim(), cardId }
  return { ...state, updatedAt: entry.ts, logs: [...state.logs, entry] }
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
    lines.push(`## ${stage.name}${stage.role && stage.role !== '—' ? ` (${stage.role})` : ''} · ${cards.length}${archived ? ` (${archived} archived)` : ''}`)
    if (stage.gates.length) lines.push(`  Gates: ${stage.gates.join(' / ')}`)
    if (!cards.length) {
      lines.push('  (empty)')
    } else {
      for (const c of cards) {
        lines.push(`  - [${c.id}] ${c.title}${c.owner ? ` @${c.owner}` : ''}${c.due ? ` (due ${c.due})` : ''}${isArchived(c) ? ' [archived]' : ''}`)
      }
    }
    lines.push('')
  }
  const risks = state.logs.filter((l) => l.type === 'risk' || l.type === 'blocker')
  if (risks.length) {
    lines.push(`## Open risks / blockers · ${risks.length}`)
    for (const r of risks.slice(-5)) lines.push(`  ! [${r.type}] ${r.text}`)
    lines.push('')
  }
  lines.push(`Last updated: ${state.updatedAt}`)
  return lines.join('\n')
}

function localDateLabel(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function renderWeekly(state, weekLabel = '', weekStart) {
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
  const risks = state.logs.filter((l) => l.type === 'risk' || l.type === 'blocker')
  const handoffs = state.logs.filter((l) => l.type === 'handoff' && new Date(l.ts) >= start && new Date(l.ts) < end)
  const lines = [
    `# ${state.customer} Delivery Weekly (${label})`,
    '',
    `Reporting period: ${period} (local time); pipeline counts are the current active snapshot.`,
    '',
    '## Pipeline progress',
    ...state.pipeline.map((s) => {
      const n = state.cards.filter((c) => c.stage === s.id && !isArchived(c)).length
      return `- ${s.name}: ${n} card(s)`
    }),
    '',
    '## Handoffs this week',
    ...(handoffs.length ? handoffs.map((l) => `- ${l.text}`) : ['- none']),
    '',
    '## Risks & blockers',
    ...(risks.length ? risks.map((l) => `- ${l.text}`) : ['- none']),
    '',
    '## Next week',
    '<!-- TODO -->',
    '',
  ]
  return lines.join('\n')
}
