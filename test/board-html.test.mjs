import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createProject, addCard, archiveCard, moveCard, appendLog } from '../lib/delivery.js'
import { renderBoardHtml } from '../lib/board-html.js'
import { formatTimestamp, renderColumns, renderArchive } from '../lib/board-view.js'

function sampleState() {
  let s = createProject({ customer: 'ACME <Group>', template: 'governance' })
  s = addCard(s, {
    title: 'SSO login<script>alert(1)</script>',
    stage: 'analyze',
    owner: 'carol',
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

test('offline snapshots are visibly read-only and live boards prioritize drag over card-face stage selects', () => {
  const state = sampleState()
  assert.match(renderBoardHtml(state), /Read-only HTML snapshot/)
  assert.match(renderBoardHtml(state), /draggable="false"/)
  const live = renderBoardHtml(state, { endpoint: '/board/test', revision: 'revision' })
  assert.match(live, /draggable="true"/)
  assert.match(live, /aria-label="Edit c1"/)
  assert.match(live, /aria-live="polite"/)
  assert.match(live, /Drag to move/)
  assert.match(live, /Board drag-and-drop/)
  assert.match(live, /aria-label="Card stage"/)
  // Stage moves on the card face use drag; no prominent per-card Move-to dropdown.
  const body = live.split('<script>')[0]
  assert.doesNotMatch(body, /class="move-label"/)
  assert.doesNotMatch(body, /class="stage-select"/)
  assert.match(body, /name="stage"/)
})

test('live board client wires pointer drag handlers and editor stage fallback', () => {
  const live = renderBoardHtml(sampleState(), { endpoint: '/board/test', revision: 'revision' })
  assert.match(live, /addEventListener\('dragstart'/)
  assert.match(live, /addEventListener\('dragover'/)
  assert.match(live, /addEventListener\('drop'/)
  assert.match(live, /addEventListener\('dragend'/)
  assert.match(live, /note: 'Board drag-and-drop'/)
  assert.match(live, /note: 'Board card editor'/)
  assert.match(live, /classList\.add\('drag-over'\)/)
  assert.match(live, /classList\.add\('dragging'\)/)
})

test('large boards render only thirty cards per column initially and expose load-more', () => {
  let state = createProject({ customer: 'Large', template: 'governance' })
  for (let i = 0; i < 1000; i++) state = addCard(state, { title: `Task ${i}`, stage: 'build' })
  const markup = renderBoardHtml(state).split('<script>')[0]
  assert.equal((markup.match(/<article class="card/g) ?? []).length, 30)
  assert.match(markup, /Load more \(30\/1000\)/)
  assert.match(markup, /Active cards \(1000\)/)
})

test('archived cards are not rendered in the initial active view', () => {
  const state = sampleState()
  state.cards[0].archivedAt = '2026-10-07T03:00:00Z'
  const markup = renderBoardHtml(state).split('<script>')[0]
  assert.equal((markup.match(/<article class="card/g) ?? []).length, 0)
  assert.match(markup, /Archived \(1\)/)
})

test('English demo data keeps live, read-only and dynamic UI labels free of Chinese characters', () => {
  let state = sampleState()
  state = addCard(state, { title: 'Unassigned task', stage: 'design' })
  for (const title of ['Completed task', 'Another completed task']) {
    state = addCard(state, { title, stage: 'design' })
    state = archiveCard(state, { cardId: state.cards.at(-1).id })
  }
  const chinese = /\p{Script=Han}/u
  for (const interactive of [false, true]) {
    const html = renderBoardHtml(state, interactive ? { endpoint: '/board/test', revision: 'revision' } : {})
    assert.match(html, /<html lang="en">/)
    // The full page also embeds browser-only save, refresh, editor and copy labels.
    assert.doesNotMatch(html, chinese)
    assert.match(html, /Unassigned/)
    const ui = { interactive, query: '', owner: '', limits: { design: 1 }, archiveLimit: 1 }
    const columns = renderColumns(state, ui)
    const archive = renderArchive(state, ui)
    assert.doesNotMatch(columns + archive, chinese)
    assert.match(columns, /Load more \(1\/2\)/)
    assert.match(archive, /Load more \(1\/2\)/)
    assert.match(archive, /archived on/)
    if (interactive) assert.match(archive, /Restore to original stage/)
    const filtered = { ...ui, query: 'no matching title' }
    const emptyColumns = renderColumns(state, filtered)
    const emptyArchive = renderArchive(state, filtered)
    assert.doesNotMatch(emptyColumns + emptyArchive, chinese)
    assert.match(emptyColumns, /No matching cards/)
    assert.match(emptyArchive, /No matching archived cards/)
  }
  const timestamp = '2026-10-07T03:00:00Z'
  assert.equal(formatTimestamp(timestamp), new Date(timestamp).toLocaleString('en-US', { hour12: false, timeZoneName: 'short' }))
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
