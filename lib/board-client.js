// Embedded as source in the standalone HTML; only the live board may persist.
export function boardClient(boot) {
  let state = boot.state
  let revision = boot.revision
  let busy = false
  let dragged = null
  let editingId = null
  const ui = { interactive: Boolean(boot.endpoint), query: '', owner: '', view: 'active', limits: {}, archiveLimit: 30 }
  const $ = (selector) => document.querySelector(selector)
  const board = $('#board')
  const archive = $('#archive')
  const form = $('#card-form')
  const dialog = $('#card-dialog')
  const status = $('#save-status')
  const interactiveHit = 'button, a, input, select, textarea, summary, label, .copybtn'

  function feedback(text, error = false) {
    status.textContent = text
    status.classList.toggle('error', error)
  }
  function clearDrag() {
    dragged = null
    board.querySelectorAll('.drag-over, .dragging').forEach((item) => item.classList.remove('drag-over', 'dragging'))
  }
  function draw() {
    board.innerHTML = renderColumns(state, ui)
    archive.innerHTML = renderArchive(state, ui)
    board.hidden = ui.view !== 'active'
    archive.hidden = ui.view !== 'archive'
    const activeCount = state.cards.filter((card) => card.archivedAt == null).length
    $('#summary-count').textContent = `${activeCount} active card(s)`
    $('#active-view').textContent = `Active cards (${activeCount})`
    $('#archive-view').textContent = `Archived (${state.cards.length - activeCount})`
    $('#active-view').setAttribute('aria-pressed', String(ui.view === 'active'))
    $('#archive-view').setAttribute('aria-pressed', String(ui.view === 'archive'))
    $('#last-updated').textContent = `Updated: ${formatTimestamp(state.updatedAt)}`
    $('#activity').innerHTML = renderActivity(state)
    const owners = [...new Set(state.cards.map((card) => card.owner).filter(Boolean))].sort()
    $('#owner-filter').innerHTML = '<option value="">All owners</option>' + owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join('')
    $('#owner-filter').value = ui.owner
    document.querySelectorAll('[data-live]').forEach((control) => { control.disabled = busy || !ui.interactive })
    document.querySelectorAll('[data-action]').forEach((control) => { control.disabled = busy })
    document.querySelectorAll('[draggable="true"]').forEach((card) => { card.draggable = !busy })
  }
  async function request(path, options = {}) {
    const response = await fetch(`${boot.endpoint}/${path}`, { cache: 'no-store', ...options })
    const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(body.error ?? 'Save failed'), { status: response.status })
    return body
  }
  async function save(action, args) {
    if (busy || !ui.interactive) return false
    busy = true
    feedback('Saving…')
    draw()
    try {
      const result = await request('action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, args, revision }) })
      state = result.state
      revision = result.revision
      feedback(`Saved · ${formatTimestamp(new Date().toISOString())}`)
      return true
    } catch (error) {
      feedback(error.status === 409 ? 'Not saved: Data has changed. Click "Refresh" and try again.' : `Not saved: ${error.message}`, true)
      return false
    } finally { busy = false; draw() }
  }
  $('#search').addEventListener('input', (event) => { ui.query = event.target.value; ui.limits = {}; ui.archiveLimit = 30; draw() })
  $('#owner-filter').addEventListener('change', (event) => { ui.owner = event.target.value; ui.limits = {}; ui.archiveLimit = 30; draw() })
  $('#active-view').addEventListener('click', () => { ui.view = 'active'; draw() })
  $('#archive-view').addEventListener('click', () => { ui.view = 'archive'; draw() })
  $('#refresh').addEventListener('click', async () => {
    if (busy || !ui.interactive) return
    busy = true; draw(); feedback('Refreshing…')
    try { const result = await request('state'); state = result.state; revision = result.revision; feedback('Refreshed · Synced with JSON') }
    catch (error) { feedback(`Refresh failed: ${error.message}`, true) }
    finally { busy = false; draw() }
  })

  function showEditor(card = null) {
    editingId = card?.id ?? null
    $('#dialog-title').textContent = card ? `Edit ${card.id}` : 'New card'
    form.elements.title.value = card?.title ?? ''
    form.elements.owner.value = card?.owner ?? ''
    form.elements.due.value = card?.due ?? ''
    form.elements.acceptance.value = (card?.acceptance ?? []).join('\n')
    form.elements.dod.value = (card?.dod ?? []).join('\n')
    form.elements.stage.innerHTML = state.pipeline.map((stage) => `<option value="${escapeHtml(stage.id)}">${escapeHtml(stage.name)}</option>`).join('')
    form.elements.stage.value = card?.stage ?? state.pipeline[0].id
    form.elements.stage.disabled = false
    $('#form-error').textContent = ''
    dialog.showModal()
    form.elements.title.focus()
  }
  $('#new-card').addEventListener('click', () => showEditor())
  $('#cancel-edit').addEventListener('click', () => dialog.close())
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (busy) return
    const stage = form.elements.stage.value
    const fields = { title: form.elements.title.value, owner: form.elements.owner.value, due: form.elements.due.value || null, acceptance: form.elements.acceptance.value.split('\n').filter((line) => line.trim()), dod: form.elements.dod.value.split('\n').filter((line) => line.trim()) }
    $('#submit-edit').disabled = true
    let saved = false
    if (editingId) {
      const previous = state.cards.find((card) => card.id === editingId)
      saved = await save('update', { card_id: editingId, ...fields })
      if (saved && previous && previous.stage !== stage) {
        saved = await save('move', { card_id: editingId, to_stage: stage, note: 'Board card editor' })
      }
    } else {
      saved = await save('card', { ...fields, stage })
    }
    $('#submit-edit').disabled = false
    if (saved) dialog.close()
    else $('#form-error').textContent = status.textContent
  })

  document.addEventListener('click', async (event) => {
    const more = event.target.closest('[data-more]')
    if (more) {
      const stage = more.dataset.more
      if (stage === 'archive') ui.archiveLimit += 30
      else ui.limits[stage] = (ui.limits[stage] ?? 30) + 30
      draw(); return
    }
    const copy = event.target.closest('.copybtn')
    if (copy) {
      try { await navigator.clipboard.writeText(copy.dataset.cmd); copy.textContent = '/delivery command copied' }
      catch { feedback('Copy failed: Run /delivery help in DSH to see commands.', true) }
      return
    }
    const button = event.target.closest('[data-action]')
    if (!button || busy) return
    const cardId = button.closest('[data-card-id]').dataset.cardId
    if (button.dataset.action === 'edit') showEditor(state.cards.find((card) => card.id === cardId))
    else await save(button.dataset.action, { card_id: cardId })
  })
  board.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-card-id]')
    if (!card || busy || !ui.interactive || event.target.closest(interactiveHit)) { event.preventDefault(); return }
    dragged = card.dataset.cardId
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', dragged)
    card.classList.add('dragging')
  })
  board.addEventListener('dragover', (event) => {
    const column = event.target.closest('[data-stage]')
    if (!column || !dragged || busy) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    board.querySelectorAll('.drag-over').forEach((item) => item.classList.remove('drag-over'))
    column.classList.add('drag-over')
  })
  board.addEventListener('dragleave', (event) => {
    const column = event.target.closest('[data-stage]')
    if (!column) return
    const next = event.relatedTarget instanceof Element ? event.relatedTarget : null
    if (next && column.contains(next)) return
    column.classList.remove('drag-over')
  })
  board.addEventListener('drop', async (event) => {
    const column = event.target.closest('[data-stage]')
    event.preventDefault()
    const cardId = dragged
    clearDrag()
    if (!column || !cardId || busy) return
    const target = column.dataset.stage
    if (state.cards.find((card) => card.id === cardId)?.stage !== target) await save('move', { card_id: cardId, to_stage: target, note: 'Board drag-and-drop' })
  })
  board.addEventListener('dragend', () => { clearDrag() })
  draw()
}
