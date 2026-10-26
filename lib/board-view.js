// Shared escaped markup, used both for the initial HTML and browser refreshes.

export function boardUiTables() {
  return {
    en: {
      allOwners: 'All owners',
      activeCards: (n) => `Active cards (${n})`,
      archived: (n) => `Archived (${n})`,
      refresh: 'Refresh',
      newCard: 'New card',
      newLog: 'Log risk / blocker',
      searchPlaceholder: 'Search ID, title or owner',
      updated: (ts) => `Updated: ${ts}`,
      activeCount: (n) => `${n} active card(s)`,
      liveStatus: 'Saved · Live local board',
      readonlyStatus: 'Read-only HTML snapshot · Use /delivery-admin open to edit',
      liveFooter: 'Drag a card into another stage column to move it (handoff is recorded when the stage changes). Prefer Edit → Stage if you need a non-drag fallback. Changes appear after saving. Delivery state is saved in the current session\'s working directory; archiving keeps history. Gate checklists and WIP limits are trackable soft signals, not hard blockers.',
      readonlyFooter: 'This is an offline, read-only snapshot. Filters and archive views do not change files. Run /delivery-admin open in DSH to open the editable live board.',
      gates: (n) => `Gates (${n})`,
      gatePrefix: 'gate · ',
      openRisks: (n) => `⚠ Open risks / blockers (${n})`,
      resolve: 'Resolve',
      audit: (n) => `Handoff audit trail / Activity (latest ${n})`,
      archiveTitle: (n) => `Archived · ${n}`,
      archiveHelp: 'Archiving hides cards but keeps their IDs, original stages, acceptance criteria and history. Restore a card to keep editing.',
      empty: '(empty)',
      noMatch: 'No matching cards',
      noMatchArchive: 'No matching archived cards',
      loadMore: (a, b) => `Load more (${a}/${b})`,
      edit: 'Edit',
      archiveBtn: 'Archive',
      restoreBtn: 'Restore to original stage',
      dragHint: 'Drag to move',
      copyHandoff: 'Copy handoff command',
      overdue: '⚠ overdue · ',
      due: 'due ',
      unassigned: 'Unassigned',
      blocker: '[blocker]',
      archivedOn: 'archived on',
      wipOver: 'WIP over',
      wipLabel: (n, limit) => `WIP ${n}/${limit}`,
    },
    zh: {
      allOwners: '全部负责人',
      activeCards: (n) => `进行中 (${n})`,
      archived: (n) => `已归档 (${n})`,
      refresh: '刷新',
      newCard: '新建卡片',
      newLog: '记录风险 / 阻塞',
      searchPlaceholder: '搜索 ID、标题或负责人',
      updated: (ts) => `更新于：${ts}`,
      activeCount: (n) => `${n} 张进行中卡片`,
      liveStatus: '已保存 · 本地可编辑看板',
      readonlyStatus: '只读 HTML 快照 · 用 /delivery-admin open 打开可编辑看板',
      liveFooter: '把卡片拖到其他阶段列即可移动（跨阶段会记录交接）。也可用「编辑 → 阶段」。保存后写入当前会话工作目录中的交付状态；归档保留历史。关卡清单与 WIP 上限为可跟踪软信号，不会强制拦截移动。',
      readonlyFooter: '这是离线只读快照。筛选与归档视图不会改文件。在 DSH 中运行 /delivery-admin open 打开可编辑看板。',
      gates: (n) => `关卡 (${n})`,
      gatePrefix: '关卡 · ',
      openRisks: (n) => `⚠ 未关闭风险 / 阻塞 (${n})`,
      resolve: '标记已解决',
      audit: (n) => `交接审计 / 活动（最近 ${n} 条）`,
      archiveTitle: (n) => `已归档 · ${n}`,
      archiveHelp: '归档会隐藏卡片，但保留 ID、原阶段、验收标准与历史。恢复后可继续编辑。',
      empty: '（空）',
      noMatch: '无匹配卡片',
      noMatchArchive: '无匹配的已归档卡片',
      loadMore: (a, b) => `加载更多 (${a}/${b})`,
      edit: '编辑',
      archiveBtn: '归档',
      restoreBtn: '恢复到原阶段',
      dragHint: '拖拽移动',
      copyHandoff: '复制交接命令',
      overdue: '⚠ 已逾期 · ',
      due: '截止 ',
      unassigned: '未分配',
      blocker: '[阻塞]',
      archivedOn: '归档于',
      wipOver: 'WIP 超限',
      wipLabel: (n, limit) => `WIP ${n}/${limit}`,
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
  const overdue = !archived && card.due && card.due < today
  const blocker = state.logs.some((entry) => entry.type === 'blocker' && entry.cardId === card.id && entry.resolvedAt == null)
  const command = next ? `/delivery-admin move ${card.id} ${next.id}` : ''
  return `<article class="card${archived ? ' archived-card' : ''}" data-card-id="${esc(card.id)}" draggable="${interactive && !archived}" aria-label="${esc(card.id)} ${esc(card.title)}">
    <div class="card-title">${esc(card.title)}</div>
    <div class="card-meta"><span class="cid">${esc(card.id)}</span>${card.owner ? `<span class="owner">@${esc(card.owner)}</span>` : `<span class="unassigned">${esc(t.unassigned)}</span>`}${card.due ? `<span class="due${overdue ? ' overdue' : ''}">${overdue ? t.overdue : ''}${t.due}${esc(card.due)}</span>` : ''}${blocker ? `<span class="blocked">${esc(t.blocker)}</span>` : ''}</div>
    ${archived ? `<div class="archive-meta">${esc(state.pipeline[stageIndex]?.name)} · ${esc(t.archivedOn)} ${esc(formatTimestamp(card.archivedAt))}</div>` : ''}
    ${(card.acceptance ?? []).length ? `<details><summary>Acceptance criteria (${card.acceptance.length})</summary><ul>${card.acceptance.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${(card.dod ?? []).length ? `<details><summary>DoD (${card.dod.length})</summary><ul>${card.dod.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${interactive && !archived ? `<div class="card-actions"><button data-action="edit" aria-label="${esc(t.edit)} ${esc(card.id)}">${esc(t.edit)}</button><button data-action="archive" aria-label="${esc(t.archiveBtn)} ${esc(card.id)}">${esc(t.archiveBtn)}</button><span class="drag-hint" title="${esc(t.dragHint)}">${esc(t.dragHint)}</span></div>` : ''}
    ${interactive && archived ? `<button data-action="restore" aria-label="${esc(t.restoreBtn)} ${esc(card.id)}">${esc(t.restoreBtn)}</button>` : ''}
    ${!archived && next ? `<button class="copybtn" data-cmd="${esc(command)}" aria-label="${esc(t.copyHandoff)}">${esc(t.copyHandoff)}</button>` : ''}
  </article>`
}

export function renderGateList(stage, interactive, strings) {
  const esc = escapeHtml
  const t = strings ?? boardStrings()
  if (!stage.gates.length) return ''
  const items = stage.gates.map((gate, index) => {
    const checked = stage.gateDone?.[index] === true
    if (interactive) {
      return `<label class="gate-check"><input type="checkbox" data-action="gate" data-stage="${esc(stage.id)}" data-gate-index="${index}" ${checked ? 'checked' : ''}> ${esc(gate)}</label>`
    }
    return `<span class="gate">${checked ? '✓ ' : ''}${esc(t.gatePrefix)}${esc(gate)}</span>`
  }).join('')
  return `<details class="gates" open><summary>${esc(t.gates(stage.gates.length))}</summary>${items}</details>`
}

export function renderColumns(state, ui) {
  const esc = escapeHtml
  const t = ui.strings ?? boardStrings(ui.locale)
  const colors = ['#4f8ff7', '#9b6bf3', '#f5a623', '#22b07d', '#f25c5c', '#00b8d4', '#8a9ba8']
  return state.pipeline.map((stage, index) => {
    const total = state.cards.filter((card) => card.stage === stage.id && card.archivedAt == null)
    const cards = total.filter((card) => cardMatches(card, ui))
    const limit = ui.limits[stage.id] ?? 30
    const shown = cards.slice(0, limit)
    const wipOver = stage.wipLimit != null && total.length > stage.wipLimit
    const wipBadge = stage.wipLimit != null
      ? ` <span class="wip${wipOver ? ' over' : ''}" title="${esc(wipOver ? t.wipOver : t.wipLabel(total.length, stage.wipLimit))}">${esc(t.wipLabel(total.length, stage.wipLimit))}${wipOver ? ' ⚠' : ''}</span>`
      : ''
    return `<section class="col${wipOver ? ' wip-over' : ''}" data-stage="${esc(stage.id)}" aria-label="${esc(stage.name)} stage">
      <header style="border-top-color:${colors[index % colors.length]}"><div class="col-name">${esc(stage.name)} <span class="count">${cards.length}${cards.length !== total.length ? `/${total.length}` : ''}</span>${wipBadge}</div><div class="col-role">${esc(stage.role && stage.role !== '—' ? stage.role : '')} <span class="stage-id">${esc(stage.id)}</span></div>${renderGateList(stage, ui.interactive, t)}</header>
      <div class="col-body">${shown.length ? shown.map((card) => renderCard(card, state, ui.interactive, t)).join('') : `<div class="empty">${total.length ? esc(t.noMatch) : esc(t.empty)}</div>`}${cards.length > limit ? `<button class="load-more" data-more="${esc(stage.id)}">${esc(t.loadMore(shown.length, cards.length))}</button>` : ''}</div>
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
  return `<section class="risks"><h2>${esc(t.openRisks(open.length))}</h2><ul>${shown.map(({ entry, index }) => {
    const resolve = interactive
      ? ` <button data-action="resolve" data-log-index="${index}" aria-label="${esc(t.resolve)} ${index}">${esc(t.resolve)}</button>`
      : ''
    return `<li><b>[${esc(entry.type)}]</b> ${esc(entry.text)}${entry.cardId ? ` <span class="cid">${esc(entry.cardId)}</span>` : ''}${resolve}</li>`
  }).join('')}</ul></section>`
}
