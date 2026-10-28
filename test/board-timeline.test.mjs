import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createProject, addCard, archiveCard, moveCard, appendLog } from '../lib/delivery.js'
import { renderBoardHtml } from '../lib/board-html.js'
import { boardStrings, cardTimeline, renderTimeline, renderColumns, renderCard, stageColor } from '../lib/board-view.js'
import { demoState } from './fixtures/demo-state.mjs'

const NOW = new Date(2026, 9, 26, 9, 0, 0).getTime() // local Mon 2026-10-26 09:00
const HAN = /[\u3400-\u9fff]/

function at(daysAgo) {
  return new Date(NOW - daysAgo * 86400000).toISOString()
}

function timedState() {
  let s = createProject({ customer: 'ACME', template: 'governance' })
  s = addCard(s, { title: 'Shipped one', stage: 'plan', owner: 'bob', due: '2026-10-20' })
  s = addCard(s, { title: 'Late one', stage: 'plan', owner: 'amy', due: '2026-10-01' })
  s = addCard(s, { title: 'Future <b>xss</b>', stage: 'plan', due: '2026-11-15' })
  s = addCard(s, { title: 'Old archived', stage: 'plan' })
  const last = s.pipeline[s.pipeline.length - 1]
  for (const stage of s.pipeline.slice(1)) s = moveCard(s, { cardId: 'c1', toStage: stage.id })
  s = moveCard(s, { cardId: 'c2', toStage: s.pipeline[1].id })
  s = archiveCard(s, { cardId: 'c4' })
  // Pin every timestamp relative to NOW so the calendar layout is deterministic.
  const created = { c1: 30, c2: 20, c3: 3, c4: 40 }
  s.cards = s.cards.map((card) => ({ ...card, createdAt: at(created[card.id]), ...(card.id === 'c4' ? { archivedAt: at(10) } : {}) }))
  let step = 0
  s.logs = s.logs.map((entry) => entry.cardId === 'c1' && entry.type === 'handoff' ? { ...entry, ts: at(25 - 3 * step++) } : entry.cardId === 'c2' && entry.type === 'handoff' ? { ...entry, ts: at(5) } : entry)
  return { s, last }
}

test('en and zh string tables have identical keys', () => {
  const en = Object.keys(boardStrings('en-US')).sort()
  const zh = Object.keys(boardStrings('zh-CN')).sort()
  assert.deepEqual(zh, en)
  for (const key of en) assert.equal(typeof boardStrings('zh-CN')[key], typeof boardStrings('en-US')[key], key)
})

test('cardTimeline derives stage segments and a shipped date from handoff logs', () => {
  const { s, last } = timedState()
  const c1 = cardTimeline(s.cards.find((c) => c.id === 'c1'), s, NOW)
  assert.equal(c1.start, Date.parse(at(30)))
  assert.equal(c1.segments[0].stage, 'plan')
  assert.equal(c1.segments[0].end, Date.parse(at(25)))
  assert.equal(c1.segments.length, s.pipeline.length - 1)
  assert.ok(c1.shipped != null, 'terminal handoff marks the card shipped')
  assert.ok(c1.segments.every((seg) => seg.stage !== last.id))
  const c2 = cardTimeline(s.cards.find((c) => c.id === 'c2'), s, NOW)
  assert.equal(c2.shipped, null)
  assert.equal(c2.segments.at(-1).end, NOW, 'open segment runs to now')
  const c4 = cardTimeline(s.cards.find((c) => c.id === 'c4'), s, NOW)
  assert.equal(c4.archivedAt, Date.parse(at(10)))
  assert.equal(c4.segments.at(-1).end, c4.archivedAt)
})

test('renderTimeline draws a calendar axis with today, gridlines and markers', () => {
  const { s } = timedState()
  const html = renderTimeline(s, { now: NOW, locale: 'en-US', strings: boardStrings('en-US'), query: '', owner: '', interactive: true })
  assert.match(html, /class="tl-today"/)
  assert.match(html, /Today · Oct 26/)
  assert.match(html, /class="tl-month/)
  assert.match(html, /Nov 2026/)
  assert.ok((html.match(/class="tl-line week/g) ?? html.match(/tl-week/g) ?? []).length >= 4, 'weekly gridlines')
  assert.match(html, /class="tl-due overdue"/, 'overdue due marker for c2')
  assert.match(html, /class="tl-ship"/, 'shipped marker for c1')
  assert.match(html, /class="tl-arch"/, 'archived marker for c4')
  assert.match(html, /data-action="edit"/)
  assert.ok(!html.includes('<b>xss</b>'))
  assert.match(html, /Future &lt;b&gt;xss&lt;\/b&gt;/)
  assert.ok(!HAN.test(html), 'en timeline has no Han characters')
  // Shipped card is not flagged overdue even though its due date passed.
  const shippedRow = html.split('data-card-id="c1"')[1].split('class="tl-row')[0]
  assert.ok(!shippedRow.includes('overdue'))
})

test('renderTimeline localizes to zh and handles undated and empty states', () => {
  let s = createProject({ customer: 'ACME', template: 'governance' })
  s = addCard(s, { title: 'No dates', stage: 'plan' })
  s.cards = s.cards.map((card) => ({ ...card, createdAt: undefined }))
  s.logs = []
  const zh = renderTimeline(s, { now: NOW, locale: 'zh-CN', strings: boardStrings('zh-CN'), query: '', owner: '' })
  assert.match(zh, /tl-empty/)
  assert.match(zh, /tl-undated/)
  assert.match(zh, /No dates/)
  assert.ok(HAN.test(zh))
  const { s: full } = timedState()
  const filtered = renderTimeline(full, { now: NOW, locale: 'en-US', strings: boardStrings('en-US'), query: 'nothing-matches', owner: '' })
  assert.match(filtered, /tl-empty/)
})

test('board page ships a Timeline switch and a hidden client-rendered timeline', () => {
  const { s } = timedState()
  const html = renderBoardHtml(s, { endpoint: '/api/state', revision: 'r1', locale: 'en-US' })
  assert.match(html, /id="timeline-view"/)
  assert.match(html, /<section id="timeline" class="timeline-panel"[^>]*hidden><\/section>/)
  assert.match(html, /function renderTimeline/)
  assert.match(html, /function cardTimeline/)
  assert.match(html, /prefers-color-scheme: dark/)
  const zh = renderBoardHtml(s, { locale: 'zh-CN' })
  assert.match(zh, /时间线/)
})

test('board boot only bakes in an explicit locale so the browser can choose', () => {
  const { s } = timedState()
  const html = renderBoardHtml(s, { endpoint: '/api/state', revision: 'r1' })
  assert.match(html, /"locale":null/)
  assert.match(renderBoardHtml(s, { locale: 'zh-CN' }), /"locale":"zh-CN"/)
})

test('columns over a WIP limit show a quiet warn-only note (no screaming badge)', () => {
  let s = createProject({ customer: 'WIP', template: 'lite' })
  s = { ...s, pipeline: s.pipeline.map((stage) => (stage.id === 'doing' ? { ...stage, wipLimit: 1 } : stage)) }
  s = addCard(s, { title: 'One', stage: 'doing' })
  s = addCard(s, { title: 'Two', stage: 'doing' })
  const ui = { interactive: true, query: '', owner: '', limits: {}, strings: boardStrings('en-US') }
  const html = renderColumns(s, ui)
  assert.match(html, /class="wip-note"/)
  assert.match(html, /Over WIP/)
  assert.equal((html.match(/class="wip-note"/g) ?? []).length, 1)
  // Quiet columns: no per-stage rainbow style attribute
  assert.doesNotMatch(html, /style="--stage:/)
  assert.equal(stageColor(0), stageColor(3))
})

test('renderCard keeps drag affordances and localized summaries', () => {
  const { s } = timedState()
  const card = s.cards.find((c) => c.id === 'c2')
  const en = renderCard(card, s, true, boardStrings('en-US'))
  assert.match(en, /draggable="true"/)
  assert.match(en, /is-overdue/)
  assert.ok(!HAN.test(en))
  const zh = renderCard(card, s, true, boardStrings('zh-CN'))
  assert.match(zh, /卡片操作/)
  assert.match(zh, /class="due overdue"/)
  assert.ok(HAN.test(zh))
  const shipped = renderCard(s.cards.find((c) => c.id === 'c1'), s, true, boardStrings('en-US'))
  assert.ok(!shipped.includes('is-overdue'))
})
