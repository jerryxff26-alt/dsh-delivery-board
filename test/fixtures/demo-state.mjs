// Synthetic demo board for screenshots / timeline regression. Fictional data only.
// Timestamps are anchored relative to `now` so the calendar axis always shows a
// sensible window around "today". v0.2.5+: lite 4-column for a clean README shot.
import { createProject, addCard, moveCard, appendLog, archiveCard } from '../../lib/delivery.js'

export function demoState(now = new Date()) {
  const day = 86400000
  const at = (offsetDays, hour = 10) => {
    const d = new Date(now.getTime() + offsetDays * day)
    d.setHours(hour, 0, 0, 0)
    return d.toISOString()
  }
  const dateOnly = (offsetDays) => {
    const d = new Date(now.getTime() + offsetDays * day)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  let s = createProject({ customer: 'ACME Retail', template: 'lite' })
  const stamps = []
  const cardTimes = {}
  // Stages: backlog → doing → review → live
  const plan = [
    { title: 'SSO login (SAML + OIDC)', owner: 'Alice', due: 4, created: -18, moves: [['doing', -10]] },
    { title: 'Order export API', owner: 'Bob', due: -2, created: -16, moves: [['doing', -12], ['review', -3]] },
    { title: 'Inventory sync webhooks', owner: 'Alice', due: 9, created: -9, moves: [['doing', -5]] },
    { title: 'Store locator revamp', owner: 'Erin', due: 16, created: -4, moves: [] },
    { title: 'Data residency review', owner: '', due: null, created: -1, moves: [] },
    { title: 'Payment failover', owner: 'Dave', due: 12, created: -14, moves: [['doing', -8], ['review', -2]] },
    { title: 'Loyalty points ledger', owner: 'Bob', due: -6, created: -28, moves: [['doing', -22], ['review', -14], ['live', -7]] },
    { title: 'Mobile push notifications', owner: 'Carol', due: 2, created: -20, moves: [['doing', -15], ['review', -6]] },
    { title: 'Legacy CSV importer', owner: 'Dave', due: -18, created: -40, moves: [['doing', -34], ['review', -26], ['live', -21]], archive: -14 },
  ]
  plan.forEach((item, i) => {
    s = addCard(s, { title: item.title, stage: 'backlog', owner: item.owner, due: item.due == null ? null : dateOnly(item.due), acceptance: ['Acceptance criteria agreed'], dod: ['Reviewed'] })
    const id = `c${i + 1}`
    cardTimes[id] = at(item.created, 9)
    for (const [stage, offset] of item.moves) {
      s = moveCard(s, { cardId: id, toStage: stage })
      stamps.push([s.logs.length - 1, at(offset, 15)])
    }
    if (item.archive != null) {
      s = archiveCard(s, { cardId: id })
      s = { ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, archivedAt: at(item.archive, 17) } : c)) }
      stamps.push([s.logs.length - 1, at(item.archive, 17)])
    }
  })
  s = appendLog(s, { type: 'blocker', text: 'Waiting for UAT tenant credentials', cardId: 'c2' })
  stamps.push([s.logs.length - 1, at(-3, 11)])
  s = appendLog(s, { type: 'risk', text: 'Gateway vendor SLA not yet signed', cardId: 'c6' })
  stamps.push([s.logs.length - 1, at(-1, 16)])
  const logs = s.logs.map((entry, i) => {
    const hit = stamps.find(([index]) => index === i)
    return hit ? { ...entry, ts: hit[1] } : entry
  })
  return {
    ...s,
    createdAt: at(-45, 9),
    updatedAt: at(0, 9),
    cards: s.cards.map((c) => ({ ...c, createdAt: cardTimes[c.id] })),
    logs: [...logs].sort((a, b) => String(a.ts).localeCompare(String(b.ts))),
  }
}
