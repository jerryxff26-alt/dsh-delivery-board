// Synthetic demo board for screenshots / timeline regression. Fictional data only.
// Timestamps are anchored relative to `now` so the calendar axis always shows a
// sensible window around "today".
import { createProject, addCard, moveCard, appendLog, archiveCard, setGateDone } from '../../lib/delivery.js'

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
  let s = createProject({ customer: 'ACME Retail', template: 'governance' })
  s = { ...s, pipeline: s.pipeline.map((stage) => (stage.id === 'build' ? { ...stage, wipLimit: 2 } : stage.id === 'test' ? { ...stage, wipLimit: 2 } : stage)) }
  const stamps = [] // [logIndex, iso]
  const cardTimes = {}
  const plan = [
    { title: 'SSO login (SAML + OIDC)', owner: 'alice', due: 4, created: -34, moves: [['analyze', -30], ['design', -24], ['build', -15]] },
    { title: 'Order export API', owner: 'bob', due: -2, created: -28, moves: [['analyze', -26], ['design', -21], ['build', -12]] },
    { title: 'Audit log retention policy', owner: 'carol', due: 9, created: -20, moves: [['analyze', -17], ['design', -12], ['build', -8], ['test', -3]] },
    { title: 'Payment gateway failover', owner: 'dave', due: 12, created: -16, moves: [['analyze', -13], ['design', -6], ['build', -2]] },
    { title: 'Inventory sync webhooks', owner: 'alice', due: 16, created: -9, moves: [['analyze', -5]] },
    { title: 'Store locator revamp', owner: 'erin', due: 25, created: -3, moves: [] },
    { title: 'Data residency review', owner: '', due: null, created: -1, moves: [] },
    { title: 'Loyalty points ledger', owner: 'bob', due: -6, created: -45, moves: [['analyze', -42], ['design', -37], ['build', -29], ['test', -19], ['deploy', -11], ['live', -7]] },
    { title: 'Mobile push notifications', owner: 'carol', due: 2, created: -38, moves: [['analyze', -35], ['design', -30], ['build', -22], ['test', -12], ['deploy', -4]] },
    { title: 'Legacy CSV importer', owner: 'dave', due: -18, created: -52, moves: [['analyze', -49], ['design', -45], ['build', -38], ['test', -30], ['deploy', -25], ['live', -21]], archive: -14 },
  ]
  plan.forEach((item, i) => {
    s = addCard(s, { title: item.title, stage: 'plan', owner: item.owner, due: item.due == null ? null : dateOnly(item.due), acceptance: ['Acceptance criteria agreed'], dod: ['Reviewed', 'Documented'] })
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
  s = appendLog(s, { type: 'risk', text: 'Gateway vendor SLA not yet signed', cardId: 'c4' })
  stamps.push([s.logs.length - 1, at(-1, 16)])
  s = setGateDone(s, { stageId: 'build', gateIndex: 0, done: true })
  const logs = s.logs.map((entry, i) => {
    const hit = stamps.find(([index]) => index === i)
    return hit ? { ...entry, ts: hit[1] } : entry
  })
  return {
    ...s,
    createdAt: at(-55, 9),
    updatedAt: at(0, 9),
    cards: s.cards.map((c) => ({ ...c, createdAt: cardTimes[c.id] })),
    logs: [...logs].sort((a, b) => String(a.ts).localeCompare(String(b.ts))),
  }
}
