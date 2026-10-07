// Shared escaped markup, used both for the initial HTML and browser refreshes.
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function formatTimestamp(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false, timeZoneName: 'short' }) : String(value ?? '')
}

export function cardMatches(card, ui) {
  const query = ui.query.trim().toLocaleLowerCase()
  return (!ui.owner || card.owner === ui.owner) && (!query || `${card.id} ${card.title} ${card.owner ?? ''}`.toLocaleLowerCase().includes(query))
}

export function renderCard(card, state, interactive) {
  const esc = escapeHtml
  const archived = card.archivedAt != null
  const stageIndex = state.pipeline.findIndex((stage) => stage.id === card.stage)
  const next = state.pipeline[stageIndex + 1]
  const date = new Date()
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const overdue = !archived && card.due && card.due < today
  const blocker = state.logs.some((entry) => entry.type === 'blocker' && entry.cardId === card.id)
  const command = next ? `/delivery move ${card.id} ${next.id}` : ''
  return `<article class="card${archived ? ' archived-card' : ''}" data-card-id="${esc(card.id)}" draggable="${interactive && !archived}" aria-label="${esc(card.id)} ${esc(card.title)}">
    <div class="card-title">${esc(card.title)}</div>
    <div class="card-meta"><span class="cid">${esc(card.id)}</span>${card.owner ? `<span class="owner">@${esc(card.owner)}</span>` : '<span class="unassigned">未分配</span>'}${card.due ? `<span class="due${overdue ? ' overdue' : ''}">${overdue ? '⚠ overdue · ' : ''}due ${esc(card.due)}</span>` : ''}${blocker ? '<span class="blocked">[blocker]</span>' : ''}</div>
    ${archived ? `<div class="archive-meta">${esc(state.pipeline[stageIndex]?.name)} · 归档于 ${esc(formatTimestamp(card.archivedAt))}</div>` : ''}
    ${(card.acceptance ?? []).length ? `<details><summary>Acceptance criteria (${card.acceptance.length})</summary><ul>${card.acceptance.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${(card.dod ?? []).length ? `<details><summary>DoD (${card.dod.length})</summary><ul>${card.dod.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${interactive && !archived ? `<label class="move-label">移动到 <select class="stage-select" aria-label="移动 ${esc(card.id)} 到阶段">${state.pipeline.map((stage) => `<option value="${esc(stage.id)}"${stage.id === card.stage ? ' selected' : ''}>${esc(stage.name)}</option>`).join('')}</select></label><div class="card-actions"><button data-action="edit" aria-label="编辑 ${esc(card.id)}">编辑</button><button data-action="archive" aria-label="归档 ${esc(card.id)}">归档</button><span class="drag-hint">可拖动到其他阶段</span></div>` : ''}
    ${interactive && archived ? `<button data-action="restore" aria-label="恢复 ${esc(card.id)}">恢复到原阶段</button>` : ''}
    ${!archived && next ? `<button class="copybtn" data-cmd="${esc(command)}" aria-label="复制 ${esc(card.id)} 交接命令">Copy handoff command</button>` : ''}
  </article>`
}

export function renderColumns(state, ui) {
  const esc = escapeHtml
  const colors = ['#4f8ff7', '#9b6bf3', '#f5a623', '#22b07d', '#f25c5c', '#00b8d4', '#8a9ba8']
  return state.pipeline.map((stage, index) => {
    const total = state.cards.filter((card) => card.stage === stage.id && card.archivedAt == null)
    const cards = total.filter((card) => cardMatches(card, ui))
    const limit = ui.limits[stage.id] ?? 30
    const shown = cards.slice(0, limit)
    return `<section class="col" data-stage="${esc(stage.id)}" aria-label="${esc(stage.name)} 阶段">
      <header style="border-top-color:${colors[index % colors.length]}"><div class="col-name">${esc(stage.name)} <span class="count">${cards.length}${cards.length !== total.length ? `/${total.length}` : ''}</span></div><div class="col-role">${esc(stage.role && stage.role !== '—' ? stage.role : '')} <span class="stage-id">${esc(stage.id)}</span></div>${stage.gates.length ? `<details class="gates"><summary>Gates (${stage.gates.length})</summary>${stage.gates.map((gate) => `<span class="gate">gate · ${esc(gate)}</span>`).join('')}</details>` : ''}</header>
      <div class="col-body">${shown.length ? shown.map((card) => renderCard(card, state, ui.interactive)).join('') : `<div class="empty">${total.length ? '没有匹配卡片' : '(empty)'}</div>`}${cards.length > limit ? `<button class="load-more" data-more="${esc(stage.id)}">加载更多（${shown.length}/${cards.length}）</button>` : ''}</div>
    </section>`
  }).join('')
}

export function renderArchive(state, ui) {
  const cards = state.cards.filter((card) => card.archivedAt != null && cardMatches(card, ui)).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)))
  const limit = ui.archiveLimit ?? 30
  return `<h2>已归档 · ${cards.length}</h2><p>归档只隐藏卡片，保留编号、原阶段、验收标准和历史记录；恢复后可继续编辑。</p><div class="archive-grid">${cards.length ? cards.slice(0, limit).map((card) => renderCard(card, state, ui.interactive)).join('') : '<p class="empty">没有匹配的归档卡片</p>'}</div>${cards.length > limit ? `<button data-more="archive">加载更多（${Math.min(limit, cards.length)}/${cards.length}）</button>` : ''}`
}

export function renderActivity(state) {
  const events = state.logs.filter((entry) => ['handoff', 'decision'].includes(entry.type)).slice(-20).reverse()
  return events.length ? `<details class="audit"><summary>Handoff audit trail / 操作记录（最新 ${events.length} 条）</summary><ul class="timeline">${events.map((entry) => `<li><span class="ts">${escapeHtml(formatTimestamp(entry.ts))}</span> ${escapeHtml(entry.text)}</li>`).join('')}</ul></details>` : ''
}
