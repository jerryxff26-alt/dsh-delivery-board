import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createProject, addCard, moveCard, appendLog } from '../lib/delivery.js'
import { renderBoardHtml } from '../lib/board-html.js'

function sampleState() {
  let s = createProject({ customer: 'ACME <Group>', template: 'governance' })
  s = addCard(s, {
    title: 'SSO login<script>alert(1)</script>',
    stage: 'analyze',
    owner: 'wang',
    due: '2020-01-01', // overdue on purpose
    acceptance: ['SSO supported'],
    dod: ['PRD reviewed'],
  })
  s = moveCard(s, { cardId: 'c1', toStage: 'design', note: 'PRD reviewed' })
  s = appendLog(s, { type: 'risk', text: 'Understaffed' })
  return s
}

test('renderBoardHtml produces a complete standalone page', () => {
  const html = renderBoardHtml(sampleState())
  assert.ok(html.includes('<!DOCTYPE html>'))
  assert.ok(html.includes('ACME &lt;Group&gt; · Delivery Board'))
  assert.ok(html.includes('Governance Pipeline'))
  assert.ok(html.includes('Copy handoff command'))
  assert.ok(html.includes('</html>'))
})

test('renderBoardHtml escapes user content (XSS safe)', () => {
  const html = renderBoardHtml(sampleState())
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
})

test('renderBoardHtml shows stages, gates, risks and audit trail', () => {
  const html = renderBoardHtml(sampleState())
  assert.ok(html.includes('Analyze'))
  assert.ok(html.includes('gate · Acceptance criteria frozen'))
  assert.ok(html.includes('Open risks / blockers'))
  assert.ok(html.includes('Understaffed'))
  assert.ok(html.includes('Handoff audit trail'))
  assert.ok(html.includes('PRD reviewed'))
})

test('renderBoardHtml marks overdue cards', () => {
  const html = renderBoardHtml(sampleState())
  assert.ok(html.includes('overdue'))
  assert.ok(html.includes('⚠'))
})

test('renderBoardHtml handles empty projects', () => {
  const html = renderBoardHtml(createProject({ customer: 'Empty' }))
  assert.ok(html.includes('(empty)'))
  assert.ok(!html.includes('Open risks'))
})
