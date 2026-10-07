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

test('offline snapshots are visibly read-only and live boards have accessible move and edit controls', () => {
  const state = sampleState()
  assert.match(renderBoardHtml(state), /只读 HTML 快照/)
  assert.match(renderBoardHtml(state), /draggable="false"/)
  const live = renderBoardHtml(state, { endpoint: '/board/test', revision: 'revision' })
  assert.match(live, /draggable="true"/)
  assert.match(live, /aria-label="移动 c1 到阶段"/)
  assert.match(live, /aria-label="编辑 c1"/)
  assert.match(live, /aria-live="polite"/)
})

test('large boards render only thirty cards per column initially and expose load-more', () => {
  let state = createProject({ customer: 'Large', template: 'governance' })
  for (let i = 0; i < 1000; i++) state = addCard(state, { title: `Task ${i}`, stage: 'build' })
  const markup = renderBoardHtml(state).split('<script>')[0]
  assert.equal((markup.match(/<article class="card/g) ?? []).length, 30)
  assert.match(markup, /加载更多（30\/1000）/)
  assert.match(markup, /活动卡片 \(1000\)/)
})

test('archived cards are not rendered in the initial active view', () => {
  const state = sampleState()
  state.cards[0].archivedAt = '2026-10-07T03:00:00Z'
  const markup = renderBoardHtml(state).split('<script>')[0]
  assert.equal((markup.match(/<article class="card/g) ?? []).length, 0)
  assert.match(markup, /已归档 \(1\)/)
})

test('bootstrap data cannot close the script or introduce executable user markup', async () => {
  const state = sampleState()
  state.customer = '</script><script>window.pwned=1</script>'
  const html = renderBoardHtml(state)
  assert.equal((html.match(/<script>/g) ?? []).length, 1)
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1)
  const { Script } = await import('node:vm')
  assert.doesNotThrow(() => new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]))
})
