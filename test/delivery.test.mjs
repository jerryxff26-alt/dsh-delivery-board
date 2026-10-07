import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createProject,
  addCard,
  moveCard,
  archiveCard,
  restoreCard,
  updateCard,
  appendLog,
  renderBoard,
  renderWeekly,
  TEMPLATES,
} from '../lib/delivery.js'

test('createProject uses the default ToB pipeline with gates', () => {
  const s = createProject({ customer: 'ACME' })
  assert.equal(s.customer, 'ACME')
  assert.equal(s.template, 'default')
  assert.deepEqual(
    s.pipeline.map((p) => p.id),
    TEMPLATES.default.stages.map((p) => p.id),
  )
  const dev = s.pipeline.find((p) => p.id === 'devsecops')
  assert.ok(dev.gates.includes('Security scan passed'))
})

test('createProject supports the governance template', () => {
  const s = createProject({ customer: 'ACME', template: 'governance' })
  assert.equal(s.template, 'governance')
  assert.deepEqual(
    s.pipeline.map((p) => p.id),
    ['plan', 'analyze', 'design', 'build', 'test', 'deploy', 'live'],
  )
  const deploy = s.pipeline.find((p) => p.id === 'deploy')
  assert.ok(deploy.gates.includes('Security gate passed'))
  assert.ok(deploy.gates.includes('Rollback plan ready'))
})

test('createProject accepts custom stages and rejects bad input', () => {
  const s = createProject({
    customer: 'ACME',
    stages: [{ name: 'Discovery', gates: ['Confirmed'] }],
  })
  assert.equal(s.template, 'custom')
  assert.deepEqual(s.pipeline[0].gates, ['Confirmed'])
  assert.throws(() => createProject({ customer: '  ' }), /customer is required/)
  assert.throws(() => createProject({ customer: 'A', template: 'nope' }), /unknown template/)
})

test('addCard stores acceptance criteria and DoD', () => {
  let s = createProject({ customer: 'ACME' })
  s = addCard(s, {
    title: 'SSO login',
    stage: 'ba',
    owner: 'wang',
    due: '2026-10-20',
    acceptance: ['SSO supported', 'Legacy accounts compatible'],
    dod: 'PRD reviewed\nTest cases written',
  })
  const c = s.cards[0]
  assert.equal(c.id, 'c1')
  assert.deepEqual(c.acceptance, ['SSO supported', 'Legacy accounts compatible'])
  assert.deepEqual(c.dod, ['PRD reviewed', 'Test cases written'])
  assert.throws(() => addCard(s, { title: 'x', stage: 'nope' }), /unknown stage/)
  assert.throws(() => addCard(s, { title: ' ', stage: 'dev' }), /title is required/)
})

test('moveCard hands off across stages and logs the audit trail', () => {
  let s = createProject({ customer: 'ACME' })
  s = addCard(s, { title: 'SSO login', stage: 'ba', owner: 'wang' })
  s = moveCard(s, { cardId: 'c1', toStage: 'tl', owner: 'qiang', note: 'PRD reviewed' })
  const card = s.cards[0]
  assert.equal(card.stage, 'tl')
  assert.equal(card.owner, 'qiang')
  const last = s.logs[s.logs.length - 1]
  assert.equal(last.type, 'handoff')
  assert.ok(last.text.includes('BA Analysis'))
  assert.ok(last.text.includes('TL Design'))
  assert.ok(last.text.includes('PRD reviewed'))
  assert.throws(() => moveCard(s, { cardId: 'c9', toStage: 'dev' }), /unknown card/)
  assert.throws(() => moveCard(s, { cardId: 'c1', toStage: 'nope' }), /unknown stage/)
})

test('appendLog validates type and text', () => {
  const s = createProject({ customer: 'ACME' })
  assert.throws(() => appendLog(s, { type: 'nope', text: 'x' }), /invalid log type/)
  assert.throws(() => appendLog(s, { type: 'risk', text: ' ' }), /text is required/)
  const s2 = appendLog(s, { type: 'risk', text: 'Tight schedule', cardId: 'c1' })
  assert.equal(s2.logs[0].cardId, 'c1')
  assert.equal(s.logs.length, 0) // immutable
})

test('renderBoard shows gates and risks', () => {
  let s = createProject({ customer: 'ACME' })
  s = addCard(s, { title: 'SSO login', stage: 'dev', owner: 'li', due: '2026-10-25' })
  s = appendLog(s, { type: 'blocker', text: 'Waiting on client UAT env' })
  const board = renderBoard(s)
  assert.ok(board.includes('# ACME Delivery Board'))
  assert.ok(board.includes('## Development'))
  assert.ok(board.includes('Gates: DoD met'))
  assert.ok(board.includes('[c1] SSO login @li'))
  assert.ok(board.includes('Waiting on client UAT env'))
})

test('renderWeekly covers handoffs and risks', () => {
  let s = createProject({ customer: 'ACME' })
  s = addCard(s, { title: 'SSO login', stage: 'ba' })
  s = moveCard(s, { cardId: 'c1', toStage: 'dev' })
  s = appendLog(s, { type: 'risk', text: 'Understaffed' })
  const md = renderWeekly(s, 'Week of Oct 12')
  assert.ok(md.includes('# ACME Delivery Weekly (Week of Oct 12)'))
  assert.ok(md.includes('## Handoffs this week'))
  assert.ok(md.includes('BA Analysis → Development'))
  assert.ok(md.includes('Understaffed'))
})

test('weekly report filters handoffs to a real seven-day reporting window', () => {
  const state = createProject({ customer: 'ACME' })
  state.logs = [
    { ts: '2026-01-01T00:00:00Z', type: 'handoff', text: 'historical handoff' },
    { ts: new Date('2026-10-05T00:00:00').toISOString(), type: 'handoff', text: 'first day handoff' },
    { ts: new Date('2026-10-11T23:59:59').toISOString(), type: 'handoff', text: 'last day handoff' },
    { ts: new Date('2026-10-12T00:00:00').toISOString(), type: 'handoff', text: 'next week handoff' },
    { ts: '2026-01-01T00:00:00Z', type: 'blocker', text: 'unresolved blocker' },
  ]
  const report = renderWeekly(state, 'Test period', '2026-10-05')
  assert.match(report, /2026-10-05.*2026-10-11/)
  assert.match(report, /first day handoff/)
  assert.match(report, /last day handoff/)
  assert.doesNotMatch(report, /historical handoff|next week handoff/)
  assert.match(report, /unresolved blocker/)
  assert.throws(() => renderWeekly(state, '', '2026-02-30'), /week_start/)
  assert.throws(() => renderWeekly(state, '', 'not-a-date'), /week_start/)
})

test('archiveCard hides archived cards by default and includes explicit marks and counts on request', () => {
  let state = createProject({ customer: 'ACME' })
  state = addCard(state, { title: 'Archived feature', stage: 'dev', owner: 'li', due: '2026-10-25' })
  state = addCard(state, { title: 'Active feature', stage: 'dev' })
  state = appendLog(state, { type: 'risk', text: 'Original risk', cardId: 'c1' })
  const original = structuredClone(state)
  const archived = archiveCard(state, { cardId: 'c1' })

  assert.deepEqual(state, original)
  assert.equal(archived.version, 3)
  assert.equal(archived.cards.length, 2)
  assert.equal(archived.cards[1], state.cards[1])
  assert.equal(archived.cards[0].archivedAt, archived.updatedAt)
  assert.equal(new Date(archived.cards[0].archivedAt).toISOString(), archived.cards[0].archivedAt)
  assert.deepEqual(archived.logs.slice(0, -1), state.logs)
  assert.equal(archived.logs.at(-1).type, 'decision')
  assert.equal(archived.logs.at(-1).cardId, 'c1')
  assert.equal(archived.logs.at(-1).ts, archived.cards[0].archivedAt)
  assert.match(archived.logs.at(-1).text, /archived/)

  const activeBoard = renderBoard(archived)
  assert.doesNotMatch(activeBoard, /Archived feature|\[c1\]/)
  assert.match(activeBoard, /\[c2\] Active feature/)
  assert.match(activeBoard, /## Development \(Dev\) · 1\n/)
  assert.match(activeBoard, /Original risk/)
  assert.equal(renderBoard(archived, { includeArchived: false }), activeBoard)

  const fullBoard = renderBoard(archived, { includeArchived: true })
  assert.match(fullBoard, /Cards: 1 active \/ 1 archived/)
  assert.match(fullBoard, /## Development \(Dev\) · 2 \(1 archived\)/)
  assert.match(fullBoard, /\[c1\] Archived feature @li \(due 2026-10-25\) \[archived\]/)
  assert.match(fullBoard, /\[c2\] Active feature/)
})

test('restoreCard retains identity, all card fields and the complete history', () => {
  let state = createProject({ customer: 'ACME' })
  state = addCard(state, {
    title: 'SSO login', stage: 'ba', owner: 'wang', due: '2026-10-20',
    acceptance: ['SSO supported'], dod: ['Test cases written'],
  })
  state = moveCard(state, { cardId: 'c1', toStage: 'dev', owner: 'li', note: 'Design approved' })
  state = appendLog(state, { type: 'blocker', text: 'Client approval pending', cardId: 'c1' })
  const card = structuredClone(state.cards[0])
  const original = structuredClone(state)
  const archived = archiveCard(state, { cardId: 'c1' })
  const archivedSnapshot = structuredClone(archived)
  const restored = restoreCard(archived, { cardId: 'c1' })

  assert.deepEqual(state, original)
  assert.deepEqual(archived, archivedSnapshot)
  assert.equal(restored.version, 3)
  assert.deepEqual(restored.cards, [{ ...card, archivedAt: null }])
  assert.deepEqual(restored.logs.slice(0, -2), state.logs)
  assert.deepEqual(restored.logs.slice(0, -1), archived.logs)
  assert.equal(restored.logs.at(-1).type, 'decision')
  assert.equal(restored.logs.at(-1).cardId, 'c1')
  assert.match(restored.logs.at(-1).text, /restored/)
  assert.match(renderBoard(restored), /\[c1\] SSO login @li/)
  assert.doesNotMatch(renderBoard(restored), /\[archived\]/)
})

test('archive and restore are idempotent and audit only actual transitions', () => {
  const state = addCard(createProject({ customer: 'ACME' }), { title: 'Feature', stage: 'dev' })
  assert.equal(restoreCard(state, { cardId: 'c1' }), state)
  const archived = archiveCard(state, { cardId: 'c1' })
  assert.equal(archived.logs.length, 1)
  assert.equal(archiveCard(archived, { cardId: 'c1' }), archived)
  const restored = restoreCard(archived, { cardId: 'c1' })
  assert.equal(restored.logs.length, 2)
  assert.equal(restoreCard(restored, { cardId: 'c1' }), restored)
  const rearchived = archiveCard(restored, { cardId: 'c1' })
  assert.equal(rearchived.logs.length, 3)
  assert.deepEqual(rearchived.logs.map((l) => l.type), ['decision', 'decision', 'decision'])
  assert.equal(rearchived.cards[0].id, 'c1')
})

test('moving or updating archived cards requires restoration first', () => {
  const initial = addCard(createProject({ customer: 'ACME' }), { title: 'Feature', stage: 'ba' })
  const archived = archiveCard(initial, { cardId: 'c1' })
  const snapshot = structuredClone(archived)
  assert.throws(() => moveCard(archived, { cardId: 'c1', toStage: 'dev', owner: 'li' }), /archived.*restore.*first/)
  assert.throws(() => moveCard(archived, { cardId: 'c1', toStage: 'nope' }), /archived.*restore.*first/)
  for (const changes of [
    {}, { title: 'Changed' }, { owner: 'li' }, { due: null },
    { acceptance: ['Approved'] }, { dod: ['Ready'] }, { due: 'not-a-date' },
  ]) {
    assert.throws(() => updateCard(archived, { cardId: 'c1', ...changes }), /archived.*restore.*first/)
  }
  assert.deepEqual(archived, snapshot)
  const restored = restoreCard(archived, { cardId: 'c1' })
  const edited = updateCard(restored, { cardId: 'c1', title: 'Changed' })
  assert.equal(edited.cards[0].title, 'Changed')
  assert.equal(moveCard(edited, { cardId: 'c1', toStage: 'dev' }).cards[0].stage, 'dev')
})

test('archive, restore and update reject unknown card IDs without changing state', () => {
  const state = addCard(createProject({ customer: 'ACME' }), { title: 'Feature', stage: 'dev' })
  const snapshot = structuredClone(state)
  for (const operation of [archiveCard, restoreCard, updateCard]) {
    assert.throws(() => operation(state, { cardId: 'c99', title: 'Changed' }), /unknown card: c99/)
  }
  assert.deepEqual(state, snapshot)
})

test('addCard allocates above the numeric maximum, including archived cards and gaps', () => {
  let state = createProject({ customer: 'ACME' })
  state = addCard(state, { title: 'First', stage: 'dev' })
  state = addCard(state, { title: 'Second', stage: 'dev' })
  state = addCard(state, { title: 'Third', stage: 'dev' })
  state = archiveCard(state, { cardId: 'c3' })
  state = { ...state, cards: state.cards.filter((c) => c.id !== 'c2') }
  state = addCard(state, { title: 'Fourth', stage: 'dev' })
  assert.deepEqual(state.cards.map((c) => c.id), ['c1', 'c3', 'c4'])
  assert.equal(state.cards[1].archivedAt != null, true)

  // A legacy state without a sequence still uses numeric, not lexical, order.
  const legacy = createProject({ customer: 'ACME' })
  legacy.cards = [
    { ...state.cards[0], id: 'c9' },
    { ...state.cards[0], id: 'c10' },
    { ...state.cards[0], id: 'external-id' },
  ]
  assert.equal(addCard(legacy, { title: 'Eleventh', stage: 'dev' }).cards.at(-1).id, 'c11')
})

test('addCard does not reuse IDs when the highest card or all cards are removed externally', () => {
  let state = createProject({ customer: 'ACME' })
  state = addCard(state, { title: 'First', stage: 'dev' })
  state = addCard(state, { title: 'Second', stage: 'dev' })
  state = { ...state, cards: state.cards.filter((c) => c.id !== 'c2') }
  state = addCard(state, { title: 'Third', stage: 'dev' })
  assert.equal(state.cards.at(-1).id, 'c3')
  state = { ...state, cards: [] }
  assert.equal(addCard(state, { title: 'Fourth', stage: 'dev' }).cards[0].id, 'c4')
})

test('addCard reserves IDs recorded in legacy history after external removals', () => {
  let state = createProject({ customer: 'ACME' })
  state = appendLog(state, { type: 'handoff', text: 'Removed card history', cardId: 'c12' })
  state = appendLog(state, { type: 'risk', text: 'Unlinked risk' })
  const added = addCard(state, { title: 'New feature', stage: 'dev' })
  assert.equal(added.cards[0].id, 'c13')
  assert.deepEqual(added.logs, state.logs)
})

test('weekly snapshots exclude archived cards while keeping in-window handoffs and historical risks', () => {
  let state = createProject({ customer: 'ACME' })
  state = addCard(state, { title: 'Completed feature', stage: 'dev' })
  state = addCard(state, { title: 'Active feature', stage: 'dev' })
  state.logs = [
    { ts: new Date('2026-10-06T12:00:00').toISOString(), type: 'handoff', text: 'Completed feature handoff', cardId: 'c1' },
    { ts: '2026-01-01T00:00:00Z', type: 'handoff', text: 'Old handoff', cardId: 'c1' },
    { ts: '2026-01-01T00:00:00Z', type: 'risk', text: 'Historical unresolved risk', cardId: 'c1' },
  ]
  const history = structuredClone(state.logs)
  const archived = archiveCard(state, { cardId: 'c1' })
  const report = renderWeekly(archived, 'Test period', '2026-10-05')
  assert.match(report, /- Development: 1 card\(s\)/)
  assert.match(report, /2026-10-05.*2026-10-11/)
  assert.match(report, /Completed feature handoff/)
  assert.match(report, /Historical unresolved risk/)
  assert.doesNotMatch(report, /Old handoff/)
  assert.deepEqual(archived.logs.slice(0, -1), history)
  assert.match(renderWeekly(restoreCard(archived, { cardId: 'c1' }), '', '2026-10-05'), /- Development: 2 card\(s\)/)
})

test('updateCard edits partial fields immutably without moving cards or changing identity', () => {
  let state = createProject({ customer: 'ACME' })
  state = addCard(state, {
    title: 'Feature', stage: 'ba', owner: 'wang', due: '2026-10-20',
    acceptance: ['Original criterion'], dod: ['Original DoD'],
  })
  state = addCard(state, { title: 'Other feature', stage: 'dev' })
  state = appendLog(state, { type: 'progress', text: 'Spec ready', cardId: 'c1' })
  const snapshot = structuredClone(state)
  const edited = updateCard(state, { cardId: 'c1', title: '  Updated feature  ' })
  assert.deepEqual(state, snapshot)
  assert.notEqual(edited, state)
  assert.notEqual(edited.cards, state.cards)
  assert.notEqual(edited.cards[0], state.cards[0])
  assert.equal(edited.cards[1], state.cards[1])
  assert.deepEqual(edited.cards[0], { ...state.cards[0], title: 'Updated feature' })
  assert.deepEqual(edited.logs.slice(0, -1), state.logs)
  assert.equal(edited.logs.at(-1).type, 'decision')
  assert.equal(edited.logs.at(-1).cardId, 'c1')
  assert.equal(edited.logs.at(-1).ts, edited.updatedAt)
  assert.match(edited.logs.at(-1).text, /updated: title/)

  const allFields = updateCard(edited, {
    cardId: 'c1', owner: '  li  ', due: '2028-02-29',
    acceptance: '  New criterion  \n\nSecond criterion', dod: ['  Ready  ', '', 'Tested'],
  })
  assert.deepEqual(allFields.cards[0], {
    ...edited.cards[0], owner: 'li', due: '2028-02-29',
    acceptance: ['New criterion', 'Second criterion'], dod: ['Ready', 'Tested'],
  })
  assert.equal(allFields.logs.length, edited.logs.length + 1)
  assert.match(allFields.logs.at(-1).text, /updated: owner, due, acceptance, dod/)
})

test('updateCard supports explicit clears and leaves omitted or undefined fields unchanged', () => {
  const state = addCard(createProject({ customer: 'ACME' }), {
    title: 'Feature', stage: 'dev', owner: 'li', due: '2026-10-20',
    acceptance: ['Confirmed'], dod: ['Tested'],
  })
  const cleared = updateCard(state, { cardId: 'c1', owner: null, due: null, acceptance: null, dod: [] })
  assert.deepEqual(cleared.cards[0], { ...state.cards[0], owner: '', due: null, acceptance: [], dod: [] })
  assert.equal(cleared.logs.length, 1)
  assert.equal(updateCard(state, { cardId: 'c1' }), state)
  assert.equal(updateCard(state, { cardId: 'c1', title: undefined, owner: undefined, due: undefined, acceptance: undefined, dod: undefined }), state)
  assert.equal(updateCard(state, {
    cardId: 'c1', title: ' Feature ', owner: ' li ', due: '2026-10-20', acceptance: 'Confirmed', dod: ['Tested'],
  }), state)
  assert.equal(state.logs.length, 0)
})

test('updateCard rejects empty titles and ignores fields outside its editable API', () => {
  const state = addCard(createProject({ customer: 'ACME' }), { title: 'Feature', stage: 'ba' })
  for (const title of ['', '  ', null]) {
    assert.throws(() => updateCard(state, { cardId: 'c1', title }), /title is required/)
  }
  assert.equal(updateCard(state, {
    cardId: 'c1', id: 'c9', stage: 'dev', archivedAt: new Date().toISOString(), createdAt: 'changed',
  }), state)
})

test('addCard and updateCard consistently reject invalid due dates and accept actual calendar dates', () => {
  const initial = createProject({ customer: 'ACME' })
  const state = addCard(initial, { title: 'Feature', stage: 'dev', due: '2026-10-20' })
  const snapshot = structuredClone(state)
  for (const due of [
    '', 'not-a-date', '2026-02-29', '2026-02-30', '2026-04-31', '1900-02-29',
    '2026-13-01', '2026-00-10', '2026-10-00', '2026-1-01',
    '2026-10-20T00:00:00Z', ' 2026-10-20 ', 0, false, ['2026-10-20'], {},
  ]) {
    assert.throws(() => addCard(initial, { title: 'Bad date', stage: 'dev', due }), /due.*valid date.*YYYY-MM-DD/)
    assert.throws(() => updateCard(state, { cardId: 'c1', title: 'Changed', due }), /due.*valid date.*YYYY-MM-DD/)
  }
  assert.deepEqual(state, snapshot)
  assert.deepEqual(initial.cards, [])
  assert.equal(addCard(initial, { title: 'Leap day', stage: 'dev', due: '2000-02-29' }).cards[0].due, '2000-02-29')
  assert.equal(updateCard(state, { cardId: 'c1', due: '2028-02-29' }).cards[0].due, '2028-02-29')
  assert.equal(addCard(initial, { title: 'No due date', stage: 'dev', due: null }).cards[0].due, null)
  assert.equal(addCard(initial, { title: 'Default due date', stage: 'dev' }).cards[0].due, null)
})

test('version 3 cards missing archivedAt or using null remain active without migration', () => {
  let state = createProject({ customer: 'ACME' })
  state = addCard(state, { title: 'Legacy feature', stage: 'dev' })
  state = addCard(state, { title: 'Null archive feature', stage: 'dev' })
  state.cards[1] = { ...state.cards[1], archivedAt: null }
  delete state.lastCardNumber
  const snapshot = structuredClone(state)

  assert.equal(Object.hasOwn(state.cards[0], 'archivedAt'), false)
  assert.match(renderBoard(state), /\[c1\] Legacy feature/)
  assert.match(renderBoard(state), /\[c2\] Null archive feature/)
  assert.match(renderBoard(state), /## Development \(Dev\) · 2\n/)
  assert.match(renderBoard(state, { includeArchived: true }), /Cards: 2 active \/ 0 archived/)
  assert.match(renderWeekly(state, '', '2026-10-05'), /- Development: 2 card\(s\)/)
  assert.equal(restoreCard(state, { cardId: 'c1' }), state)
  assert.equal(restoreCard(state, { cardId: 'c2' }), state)
  assert.equal(updateCard(state, { cardId: 'c1', owner: 'li' }).cards[0].owner, 'li')
  assert.equal(moveCard(state, { cardId: 'c2', toStage: 'test' }).cards[1].stage, 'test')
  assert.equal(addCard(state, { title: 'Next feature', stage: 'dev' }).cards.at(-1).id, 'c3')
  assert.equal(archiveCard(state, { cardId: 'c2' }).cards[1].archivedAt != null, true)
  assert.deepEqual(state, snapshot)
  assert.equal(state.version, 3)
})
