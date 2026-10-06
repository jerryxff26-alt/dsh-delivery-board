import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  createProject,
  addCard,
  moveCard,
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
