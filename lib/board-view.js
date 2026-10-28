export function boardUiTables() {
  return {
    en: {
      allOwners: 'All owners',
      viewActive: 'Active',
      viewArchive: 'Archive',
      refresh: 'Refresh',
      newCard: 'New card',
      newLog: 'Log risk',
      searchPlaceholder: 'Search ID, title or owner',
      activeCount: (n) => `${n} cards`,
      liveStatus: '',
      readonlyStatus: 'Read-only',
      saved: 'Saved',
      gates: (n) => `Gates · ${n}`,
      gatePrefix: 'gate · ',
      openRisks: (n) => `Risks (${n})`,
      resolve: 'Resolve',
      audit: (n) => `Activity · ${n}`,
      archiveTitle: (n) => `Archived · ${n}`,
      archiveHelp: 'Archiving hides cards but keeps their IDs, original stages, acceptance criteria and history. Restore a card to keep editing.',
      empty: 'Drop a card here · New card',
      emptyReadonly: 'No cards in this stage',
      noMatch: 'No matching cards',
      noMatchArchive: 'No matching archived cards',
      loadMore: (a, b) => `Load more (${a}/${b})`,
      edit: 'Edit',
      archiveBtn: 'Archive',
      restoreBtn: 'Restore to original stage',
      dragHint: 'Drag to move',
      cardMenu: 'Card actions',
      moreMenu: 'More',
      copyHandoff: 'Copy handoff',
      due: 'due ',
      unassigned: 'Unassigned',
      blocker: 'blocked',
      archivedOn: 'archived on',
      wipLabel: (n, limit) => `WIP ${n}/${limit}`,
      wipSoft: 'Over WIP',
      viewTimeline: 'Timeline',
      viewsLabel: 'Board views',
      timelineTitle: (n) => `Timeline · ${n} card(s)`,
      timelineHelp: 'Calendar axis: each bar runs from the card\'s creation through its stage handoffs to shipped, archived or today. ◆ marks the due date.',
      timelineCard: 'Card',
      legend: 'Legend',
      legendStage: 'Stage span',
      today: 'Today',
      legendDue: 'Due',
      legendOverdue: 'Overdue',
      legendShipped: 'Shipped',
      legendArchived: 'Archived',
      timelineArchived: 'Archived',
      undated: (n) => `No dates yet (${n})`,
      undatedHelp: 'These cards have no creation, handoff or due date to place on the calendar.',
      noStart: 'no start date',
      timelineEmpty: 'No cards to place on the timeline',
      daysSpan: (n) => `${n}d`,
      shippedOn: 'shipped',
      dueOn: 'due',
      clipped: 'Earlier history is outside the visible window',
    },
    zh: {
      allOwners: '全部负责人',
      viewActive: '进行中',
      viewArchive: '归档',
      refresh: '刷新',
      newCard: '新建卡片',
      newLog: '记录风险',
      searchPlaceholder: '搜索 ID、标题或负责人',
      activeCount: (n) => `${n} 张卡片`,
      liveStatus: '',
      readonlyStatus: '只读',
      saved: '已保存',
      gates: (n) => `关卡 · ${n}`,
      gatePrefix: '关卡 · ',
      openRisks: (n) => `风险 (${n})`,
      resolve: '标记已解决',
      audit: (n) => `活动 · ${n}`,
      archiveTitle: (n) => `已归档 · ${n}`,
      archiveHelp: '归档会隐藏卡片，但保留 ID、原阶段、验收标准与历史。恢复后可继续编辑。',
      empty: '拖入卡片，或点「新建卡片」',
      emptyReadonly: '本列暂无卡片',
      noMatch: '无匹配卡片',
      noMatchArchive: '无匹配的已归档卡片',
      loadMore: (a, b) => `加载更多 (${a}/${b})`,
      edit: '编辑',
      archiveBtn: '归档',
      restoreBtn: '恢复到原阶段',
      dragHint: '拖拽移动',
      cardMenu: '卡片操作',
      moreMenu: '更多',
      copyHandoff: '复制交接',
      due: '截止 ',
      unassigned: '未分配',
      blocker: '阻塞',
      archivedOn: '归档于',
      wipLabel: (n, limit) => `WIP ${n}/${limit}`,
      wipSoft: '超出 WIP',
      viewTimeline: '时间线',
      viewsLabel: '看板视图',
      timelineTitle: (n) => `时间线 · ${n} 张卡片`,
      timelineHelp: '日历轴：每条进度条从卡片创建开始，经过各阶段交接，到上线、归档或今天为止。◆ 表示截止日期。',
      timelineCard: '卡片',
      legend: '图例',
      legendStage: '阶段区间',
      today: '今天',
      legendDue: '截止',
      legendOverdue: '已逾期',
      legendShipped: '已上线',
      legendArchived: '已归档',
      timelineArchived: '已归档',
      undated: (n) => `暂无日期 (${n})`,
      undatedHelp: '这些卡片没有可放到日历上的创建、交接或截止日期。',
      noStart: '无开始日期',
      timelineEmpty: '暂无可显示在时间线上的卡片',
      daysSpan: (n) => `${n} 天`,
      shippedOn: '上线',
      dueOn: '截止',
      clipped: '更早的历史不在当前可见范围内',
    },
  }
}

export function resolveBoardLocale(explicit) {
  if (explicit) return explicit
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language
  return 'en-US'
}

export function boardStrings(locale) {
  const tag = resolveBoardLocale(locale).toLowerCase()
  const tables = boardUiTables()
  return tag.startsWith('zh') ? tables.zh : tables.en
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function formatTimestamp(value, locale) {
  const date = new Date(value)
  const loc = resolveBoardLocale(locale)
  return Number.isFinite(date.getTime()) ? date.toLocaleString(loc, { hour12: false, timeZoneName: 'short' }) : String(value ?? '')
}

export function cardMatches(card, ui) {
  const query = ui.query.trim().toLocaleLowerCase()
  return (!ui.owner || card.owner === ui.owner) && (!query || `${card.id} ${card.title} ${card.owner ?? ''}`.toLocaleLowerCase().includes(query))
}

export function renderCard(card, state, interactive, strings) {
  const esc = escapeHtml
  const t = strings ?? boardStrings()
  const archived = card.archivedAt != null
  const stageIndex = state.pipeline.findIndex((stage) => stage.id === card.stage)
  const next = state.pipeline[stageIndex + 1]
  const date = new Date()
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const overdue = Boolean(!archived && next && card.due && card.due < today)
  const blocker = state.logs.some((entry) => entry.type === 'blocker' && entry.cardId === card.id && entry.resolvedAt == null)
  const command = next ? `/delivery-admin move ${card.id} ${next.id}` : ''
  const initial = card.owner ? [...String(card.owner)][0].toLocaleUpperCase() : ''
  // Face: title + owner + due only. AC/DoD stay in the edit dialog.
  const copy = !archived && next
    ? `<button class="copybtn" data-cmd="${esc(command)}" aria-label="${esc(t.copyHandoff)}" title="${esc(command)}">${esc(t.copyHandoff)}</button>`
    : ''
  const actions = interactive && !archived
    ? `<details class="card-menu"><summary aria-label="${esc(t.cardMenu ?? 'Card actions')}">⋯</summary><div class="card-menu-panel" role="menu"><button data-action="edit" role="menuitem" aria-label="${esc(t.edit)} ${esc(card.id)}">${esc(t.edit)}</button><button data-action="archive" role="menuitem" aria-label="${esc(t.archiveBtn)} ${esc(card.id)}">${esc(t.archiveBtn)}</button>${copy}</div></details>`
    : interactive && archived
      ? `<div class="card-actions visible"><button data-action="restore" aria-label="${esc(t.restoreBtn)} ${esc(card.id)}">${esc(t.restoreBtn)}</button></div>`
      : !interactive && copy
        ? `<details class="card-menu"><summary aria-label="${esc(t.cardMenu ?? 'Card actions')}">⋯</summary><div class="card-menu-panel" role="menu">${copy}</div></details>`
        : ''
  return `<article class="card${archived ? ' archived-card' : ''}${overdue ? ' is-overdue' : ''}${blocker ? ' is-blocked' : ''}" data-card-id="${esc(card.id)}" draggable="${interactive && !archived}" aria-label="${esc(card.id)} ${esc(card.title)}">
    <div class="card-top"><span class="cid">${esc(card.id)}</span>${interactive && !archived ? `<span class="drag-hint" title="${esc(t.dragHint)}" aria-hidden="true">⠿</span>` : ''}${actions}</div>
    <div class="card-title">${esc(card.title)}</div>
    <div class="card-meta">${card.owner ? `<span class="owner"><span class="avatar" aria-hidden="true">${esc(initial)}</span>${esc(card.owner)}</span>` : `<span class="unassigned">${esc(t.unassigned)}</span>`}${card.due ? `<span class="due${overdue ? ' overdue' : ''}">${esc(card.due)}</span>` : ''}${blocker ? `<span class="blocked-meta">${esc(t.blocker)}</span>` : ''}</div>
    ${archived ? `<div class="archive-meta">${esc(state.pipeline[stageIndex]?.name)} · ${esc(t.archivedOn)} ${esc(formatTimestamp(card.archivedAt))}</div>` : ''}
  </article>`
}

export function renderGateList(stage, interactive, strings) {
  const esc = escapeHtml
  const t = strings ?? boardStrings()
  if (!stage.gates.length) return ''
  const done = stage.gates.filter((_, index) => stage.gateDone?.[index] === true).length
  const items = stage.gates.map((gate, index) => {
    const checked = stage.gateDone?.[index] === true
    if (interactive) {
      return `<label class="gate-check${checked ? ' done' : ''}"><input type="checkbox" data-action="gate" data-stage="${esc(stage.id)}" data-gate-index="${index}" ${checked ? 'checked' : ''}> <span>${esc(gate)}</span></label>`
    }
    return `<span class="gate${checked ? ' done' : ''}">${checked ? '✓ ' : ''}${esc(t.gatePrefix)}${esc(gate)}</span>`
  }).join('')
  return `<details class="gates"><summary>${esc(t.gates(stage.gates.length))} <span class="gate-progress" aria-hidden="true">${done}/${stage.gates.length}</span></summary>${items}</details>`
}

export function renderColumns(state, ui) {
  const esc = escapeHtml
  const t = ui.strings ?? boardStrings(ui.locale)
  return state.pipeline.map((stage) => {
    const total = state.cards.filter((card) => card.stage === stage.id && card.archivedAt == null)
    const cards = total.filter((card) => cardMatches(card, ui))
    const limit = ui.limits[stage.id] ?? 30
    const shown = cards.slice(0, limit)
    const wipOver = stage.wipLimit != null && total.length > stage.wipLimit
    // Columns stay identical: name + count only. Role/gates live elsewhere; WIP only when over.
    return `<section class="col${wipOver ? ' wip-over' : ''}" data-stage="${esc(stage.id)}" aria-label="${esc(stage.name)} stage" title="${esc(stage.id)}">
      <header><div class="col-name"><span class="col-title">${esc(stage.name)}</span><span class="count">${cards.length}${cards.length !== total.length ? `/${total.length}` : ''}</span></div>${wipOver ? `<div class="wip-note" role="note">${esc(t.wipSoft)} · ${esc(t.wipLabel(total.length, stage.wipLimit))}</div>` : ''}</header>
      <div class="col-body">${shown.length ? shown.map((card) => renderCard(card, state, ui.interactive, t)).join('') : `<div class="empty">${total.length ? esc(t.noMatch) : esc(ui.interactive ? t.empty : (t.emptyReadonly ?? t.empty))}</div>`}${cards.length > limit ? `<button class="load-more" data-more="${esc(stage.id)}">${esc(t.loadMore(shown.length, cards.length))}</button>` : ''}</div>
    </section>`
  }).join('')
}

export function renderArchive(state, ui) {
  const t = ui.strings ?? boardStrings(ui.locale)
  const cards = state.cards.filter((card) => card.archivedAt != null && cardMatches(card, ui)).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)))
  const limit = ui.archiveLimit ?? 30
  return `<h2>${escapeHtml(t.archiveTitle(cards.length))}</h2><p>${escapeHtml(t.archiveHelp)}</p><div class="archive-grid">${cards.length ? cards.slice(0, limit).map((card) => renderCard(card, state, ui.interactive, t)).join('') : `<p class="empty">${escapeHtml(t.noMatchArchive)}</p>`}</div>${cards.length > limit ? `<button data-more="archive">${escapeHtml(t.loadMore(Math.min(limit, cards.length), cards.length))}</button>` : ''}`
}

export function renderActivity(state, strings) {
  const t = strings ?? boardStrings()
  const events = state.logs.filter((entry) => ['handoff', 'decision'].includes(entry.type)).slice(-20).reverse()
  return events.length ? `<details class="audit"><summary>${escapeHtml(t.audit(events.length))}</summary><ul class="timeline">${events.map((entry) => `<li><span class="ts">${escapeHtml(formatTimestamp(entry.ts))}</span> ${escapeHtml(entry.text)}</li>`).join('')}</ul></details>` : ''
}

export function renderRisks(state, interactive = false, strings) {
  const t = strings ?? boardStrings()
  const open = []
  state.logs.forEach((entry, index) => {
    if ((entry.type === 'risk' || entry.type === 'blocker') && entry.resolvedAt == null) open.push({ entry, index })
  })
  if (!open.length) return ''
  const shown = open.slice(-8)
  const esc = escapeHtml
  return `<details class="risks"><summary>${esc(t.openRisks(open.length))}</summary><ul>${shown.map(({ entry, index }) => {
    const resolve = interactive
      ? ` <button data-action="resolve" data-log-index="${index}" aria-label="${esc(t.resolve)} ${index}">${esc(t.resolve)}</button>`
      : ''
    return `<li><span class="risk-type">${esc(entry.type)}</span> ${esc(entry.text)}${entry.cardId ? ` <span class="cid">${esc(entry.cardId)}</span>` : ''}${resolve}</li>`
  }).join('')}</ul></details>`
}

/** Collapsed under-board gates (kept off column headers for a quiet kanban). */
export function renderBoardGates(state, interactive = false, strings) {
  const t = strings ?? boardStrings()
  const stages = state.pipeline.filter((stage) => stage.gates?.length)
  if (!stages.length) return ''
  const total = stages.reduce((n, stage) => n + stage.gates.length, 0)
  const esc = escapeHtml
  const body = stages.map((stage) => {
    const list = renderGateList(stage, interactive, t)
    return list ? `<div class="board-gate-stage"><div class="board-gate-name">${esc(stage.name)}</div>${list}</div>` : ''
  }).filter(Boolean).join('')
  return body ? `<details class="board-gates"><summary>${esc(t.gates(total))}</summary>${body}</details>` : ''
}

// Calendar-axis timeline. Derives each card's dated spans from existing data only
// (createdAt, handoff log timestamps, due, archivedAt); no data format changes.
export function cardTimeline(card, state, nowMs) {
  const day = 86400000
  const parse = (value) => {
    const ms = Date.parse(value ?? '')
    return Number.isFinite(ms) ? ms : null
  }
  const parseDay = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''))
    if (!match) return null
    const ms = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  const byLongestName = [...state.pipeline].sort((a, b) => b.name.length - a.name.length)
  const findStage = (text, pattern) => byLongestName.find((stage) => pattern(stage.name).test(text))?.id ?? null
  const quote = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const moves = state.logs
    .filter((entry) => entry.type === 'handoff' && entry.cardId === card.id && parse(entry.ts) != null)
    .map((entry) => ({
      ts: parse(entry.ts),
      from: findStage(entry.text, (name) => new RegExp(`moved from ${quote(name)} → `)),
      to: findStage(entry.text, (name) => new RegExp(`→ ${quote(name)}(?::|$)`)),
    }))
    .sort((a, b) => a.ts - b.ts)
  const terminal = state.pipeline[state.pipeline.length - 1]?.id
  const created = parse(card.createdAt)
  const archivedAt = parse(card.archivedAt)
  const due = parseDay(card.due)
  const start = created ?? (moves.length ? moves[0].ts : null)
  const segments = []
  let shipped = null
  if (start != null) {
    let current = moves[0]?.from ?? (moves.length ? null : card.stage)
    let from = start
    for (const move of moves) {
      if (move.ts < from) continue
      if (current) segments.push({ stage: current, start: from, end: move.ts })
      current = move.to
      from = move.ts
      if (current === terminal) shipped = move.ts
    }
    if (current === terminal && card.stage === terminal) {
      shipped = shipped ?? from
    } else {
      if (current !== terminal) shipped = null
      const end = archivedAt ?? nowMs
      if (current) segments.push({ stage: current, start: from, end: Math.max(end, from + day / 24) })
    }
  }
  return { start, due, shipped, archivedAt, segments, created }
}

export function renderTimeline(state, ui) {
  const esc = escapeHtml
  const t = ui.strings ?? boardStrings(ui.locale)
  const loc = resolveBoardLocale(ui.locale)
  const day = 86400000
  const nowMs = ui.now ?? Date.now()
  const midnight = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
  const addDays = (ms, n) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime() }
  const todayMs = midnight(nowMs)
  const stageIndex = new Map(state.pipeline.map((stage, index) => [stage.id, index]))
  const terminal = state.pipeline[state.pipeline.length - 1]?.id
  const cards = state.cards.filter((card) => cardMatches(card, ui))
  const rows = cards.map((card) => ({ card, tl: cardTimeline(card, state, nowMs) }))
  const dated = rows.filter((row) => row.tl.start != null || row.tl.due != null)
  const undated = rows.filter((row) => row.tl.start == null && row.tl.due == null)
  const head = `<div class="tl-head"><div><h2>${esc(t.timelineTitle(cards.length))}</h2><p class="tl-help">${esc(t.timelineHelp)}</p></div>${renderLegend()}</div>`
  if (!dated.length) {
    return `${head}<div class="empty tl-empty">${esc(t.timelineEmpty)}</div>${renderUndated()}`
  }
  const points = [todayMs]
  for (const { tl } of dated) {
    if (tl.start != null) points.push(tl.start)
    if (tl.due != null) points.push(tl.due)
    if (tl.archivedAt != null) points.push(tl.archivedAt)
  }
  let rangeStart = midnight(Math.min(...points))
  let rangeEnd = midnight(Math.max(...points))
  // Pad, then snap the start to a Monday so week gridlines line up.
  rangeStart = addDays(rangeStart, -2)
  rangeStart = addDays(rangeStart, -((new Date(rangeStart).getDay() + 6) % 7))
  rangeEnd = addDays(rangeEnd, 8)
  const maxDays = 370
  let clipped = false
  if ((rangeEnd - rangeStart) / day > maxDays) {
    rangeStart = midnight(addDays(Math.max(rangeEnd, addDays(todayMs, 30)), -maxDays))
    rangeStart = addDays(rangeStart, -((new Date(rangeStart).getDay() + 6) % 7))
    clipped = true
  }
  const totalDays = Math.round((rangeEnd - rangeStart) / day)
  const dayWidth = totalDays <= 75 ? 26 : totalDays <= 160 ? 12 : 5
  const width = totalDays * dayWidth
  const x = (ms) => Math.max(0, Math.min(width, ((ms - rangeStart) / day) * dayWidth))
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(loc, { month: 'short', day: 'numeric' })
  const lines = []
  const months = []
  const weeks = []
  for (let ms = rangeStart; ms < rangeEnd; ms = addDays(ms, 1)) {
    const date = new Date(ms)
    const left = x(ms)
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    if (date.getDate() === 1 || (ms === rangeStart && daysInMonth - date.getDate() >= 9)) {
      if (date.getDate() === 1) lines.push(`<span class="tl-line month" style="left:${left}px"></span>`)
      months.push(`<span class="tl-month" style="left:${left}px">${esc(date.toLocaleDateString(loc, { year: 'numeric', month: 'short' }))}</span>`)
    }
    if (date.getDay() === 1) {
      if (date.getDate() !== 1) lines.push(`<span class="tl-line week" style="left:${left}px"></span>`)
      if (dayWidth >= 10) weeks.push(`<span class="tl-week" style="left:${left}px">${esc(fmtDay(ms))}</span>`)
    } else if (dayWidth >= 20 && date.getDay() % 6 === 0) {
      lines.push(`<span class="tl-weekend" style="left:${left}px;width:${dayWidth}px"></span>`)
    }
  }
  const todayLeft = x(todayMs + day / 2)
  const order = (row) => {
    if (row.card.archivedAt != null) return 1e6
    return stageIndex.get(row.card.stage) ?? 9e5
  }
  dated.sort((a, b) => order(a) - order(b) || (a.tl.start ?? a.tl.due) - (b.tl.start ?? b.tl.due))
  const groups = []
  for (const row of dated) {
    const key = row.card.archivedAt != null ? '__archived' : row.card.stage
    let group = groups.find((item) => item.key === key)
    if (!group) {
      const stage = state.pipeline.find((item) => item.id === key)
      group = { key, name: key === '__archived' ? t.timelineArchived : stage?.name ?? key, rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  const nameOf = (id) => state.pipeline.find((stage) => stage.id === id)?.name ?? id
  const body = groups.map((group) => `<div class="tl-group" role="row"><div class="tl-label tl-group-label" role="rowheader">${esc(group.name)} <span class="count">${group.rows.length}</span></div><div class="tl-track" aria-hidden="true"></div></div>` + group.rows.map(({ card, tl }) => {
    const archived = card.archivedAt != null
    const overdue = !archived && card.stage !== terminal && tl.due != null && tl.due < todayMs
    const segs = tl.segments.map((seg, index) => {
      const left = x(seg.start)
      const w = Math.max(3, x(seg.end) - left)
      const last = index === tl.segments.length - 1
      const days = Math.max(1, Math.round((seg.end - seg.start) / day))
      const label = `${nameOf(seg.stage)} · ${fmtDay(seg.start)} → ${fmtDay(seg.end)} (${t.daysSpan(days)})`
      return `<span class="tl-seg${last && !archived && tl.shipped == null ? ' current' : ''}" style="left:${left}px;width:${w}px" title="${esc(label)}">${last && w > 64 ? `<span class="tl-seg-text">${esc(nameOf(seg.stage))}</span>` : ''}</span>`
    }).join('')
    const dueMark = tl.due != null ? `<span class="tl-due${overdue ? ' overdue' : ''}" style="left:${x(tl.due + day / 2)}px" title="${esc(`${overdue ? t.legendOverdue : t.legendDue} · ${card.due}`)}">◆</span>` : ''
    const shipMark = tl.shipped != null ? `<span class="tl-ship" style="left:${x(tl.shipped)}px" title="${esc(`${t.legendShipped} · ${fmtDay(tl.shipped)}`)}">✓</span>` : ''
    const archMark = archived && tl.archivedAt != null ? `<span class="tl-arch" style="left:${x(tl.archivedAt)}px" title="${esc(`${t.legendArchived} · ${fmtDay(tl.archivedAt)}`)}">■</span>` : ''
    const noStart = tl.start == null ? `<span class="tl-nostart" style="left:${Math.max(0, x(tl.due) - 120)}px">${esc(t.noStart)}</span>` : ''
    const title = ui.interactive && !archived
      ? `<button class="tl-title" data-action="edit" aria-label="${esc(t.edit)} ${esc(card.id)}">${esc(card.title)}</button>`
      : `<span class="tl-title">${esc(card.title)}</span>`
    const stageName = tl.shipped != null ? `${t.shippedOn} ${fmtDay(tl.shipped)}` : tl.due != null ? `${t.dueOn} ${card.due}` : ''
    return `<div class="tl-row${archived ? ' archived' : ''}${overdue ? ' is-overdue' : ''}" role="row" data-card-id="${esc(card.id)}"><div class="tl-label" role="rowheader"><span class="cid">${esc(card.id)}</span>${title}<span class="tl-sub">${card.owner ? `@${esc(card.owner)}` : esc(t.unassigned)}${stageName ? ` · <span class="${overdue ? 'overdue' : ''}">${esc(stageName)}</span>` : ''}</span></div><div class="tl-track" role="cell">${segs}${noStart}${dueMark}${shipMark}${archMark}</div></div>`
  }).join('')).join('')
  return `${head}${clipped ? `<p class="tl-clipped">◂ ${esc(t.clipped)}</p>` : ''}<div class="tl-scroll" tabindex="0" role="region" aria-label="${esc(t.viewTimeline)}"><div class="tl-grid" role="table" style="--tl-width:${width}px;--day:${dayWidth}px">
    <div class="tl-axis" role="row"><div class="tl-label tl-corner" role="columnheader">${esc(t.timelineCard)}</div><div class="tl-track tl-scale" role="columnheader"><div class="tl-months">${months.join('')}</div><div class="tl-weeks">${weeks.join('')}</div><span class="tl-today-tag" style="left:${todayLeft}px">${esc(t.today)} · ${esc(fmtDay(todayMs))}</span></div></div>
    <div class="tl-body"><div class="tl-lines" aria-hidden="true">${lines.join('')}<span class="tl-today" style="left:${todayLeft}px"></span></div>${body}</div>
  </div></div>${renderUndated()}`

  function renderLegend() {
    return `<ul class="tl-legend" aria-label="${esc(t.legend)}"><li><span class="tl-key seg" aria-hidden="true"></span>${esc(t.legendStage)}</li><li><span class="tl-key due" aria-hidden="true">◆</span>${esc(t.legendDue)}</li><li><span class="tl-key due overdue" aria-hidden="true">◆</span>${esc(t.legendOverdue)}</li><li><span class="tl-key ship" aria-hidden="true">✓</span>${esc(t.legendShipped)}</li><li><span class="tl-key arch" aria-hidden="true">■</span>${esc(t.legendArchived)}</li><li><span class="tl-key today" aria-hidden="true"></span>${esc(t.today)}</li></ul>`
  }
  function renderUndated() {
    if (!undated.length) return ''
    return `<section class="tl-undated"><h3>${esc(t.undated(undated.length))}</h3><p>${esc(t.undatedHelp)}</p><div class="tl-chips">${undated.map(({ card }) => `<span class="tl-chip" data-card-id="${esc(card.id)}"><span class="cid">${esc(card.id)}</span>${esc(card.title)}</span>`).join('')}</div></section>`
  }
}
