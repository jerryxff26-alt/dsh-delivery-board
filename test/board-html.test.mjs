import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createProject, addCard, archiveCard, moveCard, appendLog, resolveLog } from '../lib/delivery.js'
import { renderBoardHtml } from '../lib/board-html.js'
import { formatTimestamp, renderColumns, renderArchive, renderRisks, boardStrings } from '../lib/board-view.js'

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
  assert.ok(html.includes('Copy handoff'))
  assert.ok(html.includes('</html>'))
})

test('renderBoardHtml escapes user content (XSS safe)', () => {
  const html = renderBoardHtml(sampleState())
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
})

test('renderBoardHtml shows stages, risks and audit trail; gates live under the board', () => {
  const html = renderBoardHtml(sampleState())
  assert.ok(html.includes('Analyze'))
  assert.ok(html.includes('Acceptance criteria frozen'))
  assert.ok(html.includes('class="board-gates"'))
  assert.ok(html.includes('Risks ('))
  assert.ok(html.includes('Understaffed'))
  assert.ok(html.includes('Activity ·'))
  assert.ok(html.includes('PRD reviewed'))
  const body = html.split('<script>')[0]
  assert.doesNotMatch(body, /class="col-role"/)
  // Column headers are name + count only (gates moved under #board-gates)
  assert.match(body, /id="board-gates"/)
  assert.match(body, /class="board-gates"/)
})

test('renderBoardHtml marks overdue cards', () => {
  const html = renderBoardHtml(sampleState())
  assert.ok(html.includes('is-overdue'))
  assert.ok(html.includes('overdue'))
})

test('renderBoardHtml handles empty projects', () => {
  const html = renderBoardHtml(createProject({ customer: 'Empty', template: 'lite' }))
  const body = html.split('<script>')[0]
  // Offline/read-only empty columns use soft emptyReadonly copy (not bare "(empty)").
  assert.ok(body.includes('No cards in this stage'))
  assert.ok(!body.includes('(empty)'))
  assert.ok(!body.includes('Open risks'))
  assert.equal(body.includes('id="risks"'), true)
})

test('live board empty columns emphasize New card', () => {
  const live = renderBoardHtml(createProject({ customer: 'Empty', template: 'lite' }), {
    endpoint: '/board/test',
    revision: 'revision',
  })
  const body = live.split('<script>')[0]
  assert.ok(body.includes('Drop a card here · New card'))
  assert.ok(body.includes('New card'))
  assert.ok(body.includes('Lite Pipeline'))
})

test('offline snapshots are visibly read-only and live boards prioritize drag over card-face stage selects', () => {
  const state = sampleState()
  assert.match(renderBoardHtml(state), /Read-only/)
  assert.match(renderBoardHtml(state), /draggable="false"/)
  const live = renderBoardHtml(state, { endpoint: '/board/test', revision: 'revision' })
  assert.match(live, /draggable="true"/)
  assert.match(live, /aria-label="Edit c1"/)
  assert.match(live, /aria-live="polite"/)
  assert.match(live, /cursor: grab/)
  assert.match(live, /Board drag-and-drop/)
  assert.match(live, /aria-label="Card stage"/)
  assert.doesNotMatch(live.split('<script>')[0], /Live local board|Drag a card into another stage/)
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
  assert.match(markup, />Active</)
  assert.match(markup, /1000 cards/)
})

test('archived cards are not rendered in the initial active view', () => {
  const state = sampleState()
  state.cards[0].archivedAt = '2026-10-07T03:00:00Z'
  const markup = renderBoardHtml(state).split('<script>')[0]
  assert.equal((markup.match(/<article class="card/g) ?? []).length, 0)
  assert.match(markup, />Archive</)
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
    // Visible chrome stays English under en locale; the script may embed a zh dictionary for runtime switching.
    assert.doesNotMatch(html.split('<script>')[0], chinese)
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
  assert.equal(formatTimestamp(timestamp, 'en-US'), new Date(timestamp).toLocaleString('en-US', { hour12: false, timeZoneName: 'short' }))
  assert.equal(formatTimestamp(timestamp, 'zh-CN'), new Date(timestamp).toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' }))
  assert.match(boardStrings('zh-CN').refresh, /刷新/)
  assert.match(renderBoardHtml(state, { locale: 'zh-CN' }), /lang="zh-CN"/)
  assert.match(renderBoardHtml(state, { locale: 'zh-CN' }), /刷新/)
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

test('live board exposes log risk UI and hides resolved risks', () => {
  let state = sampleState()
  const live = renderBoardHtml(state, { endpoint: '/board/test', revision: 'revision' })
  assert.match(live, /Log risk/)
  assert.match(live, /id="log-dialog"/)
  assert.match(live, /id="new-log"/)
  assert.match(live, /class="toolbar-more"/)
  assert.match(live, /Understaffed/)
  assert.match(live, /data-action="resolve"/)
  assert.match(live, /save\('log'/)
  assert.match(live, /save\('resolve'/)

  const riskIndex = state.logs.findIndex((entry) => entry.type === 'risk')
  state = resolveLog(state, { index: riskIndex })
  const after = renderBoardHtml(state, { endpoint: '/board/test', revision: 'revision' }).split('<script>')[0]
  assert.doesNotMatch(after, /Understaffed/)
  assert.doesNotMatch(after, /Risks \(/)
  assert.equal(renderRisks(state, true), '')
})

test('live board renders trackable gate checkboxes', () => {
  const state = sampleState()
  const live = renderBoardHtml(state, { endpoint: '/board/test', revision: 'revision' })
  assert.match(live, /gate-check/)
  assert.match(live, /data-action="gate"/)
  assert.match(live, /save\('gate'/)
  assert.doesNotMatch(live.split('<script>')[0], /Delivery state is saved|Drag a card into another stage|board-footer/)
})

test('under-board gates, audit and risks stay collapsed by default', () => {
  const s = createProject({ customer: 'X', template: 'default' })
  const html = renderBoardHtml(s)
  assert.match(html, /<details class="board-gates"><summary>/)
  assert.doesNotMatch(html, /<details class="board-gates" open>/)
  assert.match(html, /<details class="gates"><summary>/)
  assert.doesNotMatch(html, /<details class="gates" open>/)
  assert.match(html, /<details class="audit">/)
  assert.doesNotMatch(html, /<details class="audit" open>/)
})

test('v0.3.0 polish-freeze: title+meta face, touch ⋯ overlay, quiet secondary views', () => {
  let state = sampleState()
  state = appendLog(state, { type: 'blocker', text: 'Waiting', cardId: 'c1' })
  state = addCard(state, { title: 'Ship notes', stage: 'build', owner: 'dana' })
  state = archiveCard(state, { cardId: 'c2' })
  const live = renderBoardHtml(state, { endpoint: '/board/test', revision: 'revision' })
  const body = live.split('<script>')[0]
  assert.match(body, /class="card-menu"/)
  assert.match(body, /aria-label="Card actions"/)
  assert.doesNotMatch(body, /class="card-top"/)
  assert.doesNotMatch(body, /class="drag-hint"/)
  assert.match(body, /\.card-menu \{ position: absolute/)
  // Touch: quiet always-visible ⋯; desktop stays opacity 0 until hover.
  assert.match(body, /@media \(hover: none\)/)
  assert.match(body, /\.card-menu > summary \{ opacity: \.55/)
  assert.doesNotMatch(body, /class="card-actions"/)
  assert.doesNotMatch(body, /class="card-extras"/)
  assert.doesNotMatch(body, /class="chip/)
  assert.doesNotMatch(body, /\d+ criteria/)
  assert.match(body, /name="acceptance"/)
  assert.match(body, /name="dod"/)
  assert.doesNotMatch(body, /style="--stage:/)
  assert.match(body, /--accent: #171717/)
  assert.doesNotMatch(body, /#5c6ac4/)
  assert.match(body, /border-radius: var\(--radius\)/)
  assert.match(body, /box-shadow: none/)
  assert.doesNotMatch(body, /class="col-role"/)
  assert.match(body, /class="toolbar-more"/)
  assert.match(body, /id="board-gates"/)
  assert.match(body, />Active</)
  assert.match(body, />Timeline</)
  assert.match(body, />Archive</)
  assert.doesNotMatch(body, /Active cards|Archived \(/)
  assert.doesNotMatch(body, /last-updated|Updated:/)
  assert.doesNotMatch(body, /Live local board/)
  assert.match(body, /class="blocked-meta"/)
  assert.doesNotMatch(body, /meta-flag/)
  assert.match(body, /<details class="risks">/)
  assert.doesNotMatch(body, /<details class="risks" open>/)
  assert.doesNotMatch(body, /font-weight: 650/)
  // Archive cards share title+meta + menu overlay (Restore in ⋯, not a face strip).
  const archive = renderArchive(state, { interactive: true, query: '', owner: '', archiveLimit: 30, strings: boardStrings() })
  assert.match(archive, /class="card-menu"/)
  assert.match(archive, /data-action="restore"/)
  assert.doesNotMatch(archive, /class="card-actions"/)
  // Secondary views: no heavy surface panel chrome on archive/timeline wrappers.
  assert.match(body, /\.archive-panel \{[^}]*background: transparent/)
  assert.match(body, /\.timeline-panel \{[^}]*background: transparent/)
})
