// Shared escaped markup, used both for the initial HTML and browser refreshes.
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function formatTimestamp(value) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('en-US', { hour12: false, timeZoneName: 'short' }) : String(value ?? '')
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
    <div class="card-meta"><span class="cid">${esc(card.id)}</span>${card.owner ? `<span class="owner">@${esc(card.owner)}</span>` : '<span class="unassigned">Unassigned</span>'}${card.due ? `<span class="due${overdue ? ' overdue' : ''}">${overdue ? '⚠ overdue · ' : ''}due ${esc(card.due)}</span>` : ''}${blocker ? '<span class="blocked">[blocker]</span>' : ''}</div>
    ${archived ? `<div class="archive-meta">${esc(state.pipeline[stageIndex]?.name)} · archived on ${esc(formatTimestamp(card.archivedAt))}</div>` : ''}
    ${(card.acceptance ?? []).length ? `<details><summary>Acceptance criteria (${card.acceptance.length})</summary><ul>${card.acceptance.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${(card.dod ?? []).length ? `<details><summary>DoD (${card.dod.length})</summary><ul>${card.dod.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${interactive && !archived ? `<label class="move-label">Move to <select class="stage-select" aria-label="Move ${esc(card.id)} to stage">${state.pipeline.map((stage) => `<option value="${esc(stage.id)}"${stage.id === card.stage ? ' selected' : ''}>${esc(stage.name)}</option>`).join('')}</select></label><div class="card-actions"><button data-action="edit" aria-label="Edit ${esc(card.id)}">Edit</button><button data-action="archive" aria-label="Archive ${esc(card.id)}">Archive</button><span class="drag-hint">Drag to another stage</span></div>` : ''}
    ${interactive && archived ? `<button data-action="restore" aria-label="Restore ${esc(card.id)}">Restore to original stage</button>` : ''}
    ${!archived && next ? `<button class="copybtn" data-cmd="${esc(command)}" aria-label="Copy ${esc(card.id)} handoff command">Copy handoff command</button>` : ''}
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
    return `<section class="col" data-stage="${esc(stage.id)}" aria-label="${esc(stage.name)} stage">
      <header style="border-top-color:${colors[index % colors.length]}"><div class="col-name">${esc(stage.name)} <span class="count">${cards.length}${cards.length !== total.length ? `/${total.length}` : ''}</span></div><div class="col-role">${esc(stage.role && stage.role !== '—' ? stage.role : '')} <span class="stage-id">${esc(stage.id)}</span></div>${stage.gates.length ? `<details class="gates"><summary>Gates (${stage.gates.length})</summary>${stage.gates.map((gate) => `<span class="gate">gate · ${esc(gate)}</span>`).join('')}</details>` : ''}</header>
      <div class="col-body">${shown.length ? shown.map((card) => renderCard(card, state, ui.interactive)).join('') : `<div class="empty">${total.length ? 'No matching cards' : '(empty)'}</div>`}${cards.length > limit ? `<button class="load-more" data-more="${esc(stage.id)}">Load more (${shown.length}/${cards.length})</button>` : ''}</div>
    </section>`
  }).join('')
}

export function renderArchive(state, ui) {
  const cards = state.cards.filter((card) => card.archivedAt != null && cardMatches(card, ui)).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)))
  const limit = ui.archiveLimit ?? 30
  return `<h2>Archived · ${cards.length}</h2><p>Archiving hides cards but keeps their IDs, original stages, acceptance criteria and history. Restore a card to keep editing.</p><div class="archive-grid">${cards.length ? cards.slice(0, limit).map((card) => renderCard(card, state, ui.interactive)).join('') : '<p class="empty">No matching archived cards</p>'}</div>${cards.length > limit ? `<button data-more="archive">Load more (${Math.min(limit, cards.length)}/${cards.length})</button>` : ''}`
}

export function renderActivity(state) {
  const events = state.logs.filter((entry) => ['handoff', 'decision'].includes(entry.type)).slice(-20).reverse()
  return events.length ? `<details class="audit"><summary>Handoff audit trail / Activity (latest ${events.length})</summary><ul class="timeline">${events.map((entry) => `<li><span class="ts">${escapeHtml(formatTimestamp(entry.ts))}</span> ${escapeHtml(entry.text)}</li>`).join('')}</ul></details>` : ''
}
