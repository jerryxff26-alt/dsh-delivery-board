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
//   cards: [{ id, title, stage, owner, due, acceptance: [..], dod: [..], createdAt }],
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
// Plan → Analyze → Design → Build → Test → Deploy, with governance gates
// emphasizing governance / quality / risk / security.
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

export function addCard(state, { title, stage, owner = '', due = null, acceptance, dod }) {
  if (!title || !String(title).trim()) throw new Error('title is required')
  if (!stageIds(state).has(stage)) throw new Error(`unknown stage: ${stage}`)
  const card = {
    id: `c${state.cards.length + 1}`,
    title: String(title).trim(),
    stage,
    owner: String(owner ?? '').trim(),
    due: due ?? null,
    acceptance: normalizeList(acceptance),
    dod: normalizeList(dod),
    createdAt: now(),
  }
  return { ...state, updatedAt: card.createdAt, cards: [...state.cards, card] }
}

// Moving a card = cross-stage handoff: automatically records a handoff log
// (audit trail); owner can change hands at the same time.
export function moveCard(state, { cardId, toStage, owner = null, note = '' }) {
  if (!stageIds(state).has(toStage)) throw new Error(`unknown stage: ${toStage}`)
  const card = state.cards.find((c) => c.id === cardId)
  if (!card) throw new Error(`unknown card: ${cardId}`)
  const from = state.pipeline.find((s) => s.id === card.stage)
  const to = state.pipeline.find((s) => s.id === toStage)
  const ts = now()
  const moved = { ...card, stage: toStage, owner: owner ?? card.owner }
  const entry = {
    ts,
    type: 'handoff',
    text: `"${card.title}" moved from ${from.name} → ${to.name}` + (note ? `: ${note}` : ''),
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
export function renderBoard(state) {
  const lines = [`# ${state.customer} Delivery Board`, '']
  for (const stage of state.pipeline) {
    const cards = state.cards.filter((c) => c.stage === stage.id)
    lines.push(`## ${stage.name}${stage.role && stage.role !== '—' ? ` (${stage.role})` : ''} · ${cards.length}`)
    if (stage.gates.length) lines.push(`  Gates: ${stage.gates.join(' / ')}`)
    if (!cards.length) {
      lines.push('  (empty)')
    } else {
      for (const c of cards) {
        lines.push(`  - [${c.id}] ${c.title}${c.owner ? ` @${c.owner}` : ''}${c.due ? ` (due ${c.due})` : ''}`)
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

export function renderWeekly(state, weekLabel = '') {
  const label = weekLabel || 'this week'
  const risks = state.logs.filter((l) => l.type === 'risk' || l.type === 'blocker')
  const handoffs = state.logs.filter((l) => l.type === 'handoff')
  const lines = [
    `# ${state.customer} Delivery Weekly (${label})`,
    '',
    '## Pipeline progress',
    ...state.pipeline.map((s) => {
      const n = state.cards.filter((c) => c.stage === s.id).length
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
