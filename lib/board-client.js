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

  function feedback(text, error = false) {
    status.textContent = text
    status.classList.toggle('error', error)
  }
  function draw() {
    board.innerHTML = renderColumns(state, ui)
    archive.innerHTML = renderArchive(state, ui)
    board.hidden = ui.view !== 'active'
    archive.hidden = ui.view !== 'archive'
    const activeCount = state.cards.filter((card) => card.archivedAt == null).length
    $('#summary-count').textContent = `${activeCount} active card(s)`
    $('#active-view').textContent = `活动卡片 (${activeCount})`
    $('#archive-view').textContent = `已归档 (${state.cards.length - activeCount})`
    $('#active-view').setAttribute('aria-pressed', String(ui.view === 'active'))
    $('#archive-view').setAttribute('aria-pressed', String(ui.view === 'archive'))
    $('#last-updated').textContent = `数据更新：${formatTimestamp(state.updatedAt)}`
    $('#activity').innerHTML = renderActivity(state)
    const owners = [...new Set(state.cards.map((card) => card.owner).filter(Boolean))].sort()
    $('#owner-filter').innerHTML = '<option value="">全部负责人</option>' + owners.map((owner) => `<option value="${escapeHtml(owner)}">${escapeHtml(owner)}</option>`).join('')
    $('#owner-filter').value = ui.owner
    document.querySelectorAll('[data-live], .stage-select').forEach((control) => { control.disabled = busy || !ui.interactive })
    document.querySelectorAll('[data-action]').forEach((control) => { control.disabled = busy })
    document.querySelectorAll('[draggable="true"]').forEach((card) => { card.draggable = !busy })
  }
  async function request(path, options = {}) {
    const response = await fetch(`${boot.endpoint}/${path}`, { cache: 'no-store', ...options })
    const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(body.error ?? '保存失败'), { status: response.status })
    return body
  }
  async function save(action, args) {
    if (busy || !ui.interactive) return false
    busy = true
    feedback('保存中…')
    draw()
    try {
      const result = await request('action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, args, revision }) })
      state = result.state
      revision = result.revision
      feedback(`已保存 · ${formatTimestamp(new Date().toISOString())}`)
      return true
    } catch (error) {
      feedback(error.status === 409 ? '未保存：数据已变化，请点击“刷新”后重试。' : `未保存：${error.message}`, true)
      return false
    } finally { busy = false; draw() }
  }
  $('#search').addEventListener('input', (event) => { ui.query = event.target.value; ui.limits = {}; ui.archiveLimit = 30; draw() })
  $('#owner-filter').addEventListener('change', (event) => { ui.owner = event.target.value; ui.limits = {}; ui.archiveLimit = 30; draw() })
  $('#active-view').addEventListener('click', () => { ui.view = 'active'; draw() })
  $('#archive-view').addEventListener('click', () => { ui.view = 'archive'; draw() })
  $('#refresh').addEventListener('click', async () => {
    if (busy || !ui.interactive) return
    busy = true; draw(); feedback('刷新中…')
    try { const result = await request('state'); state = result.state; revision = result.revision; feedback('已刷新 · 数据与 JSON 一致') }
    catch (error) { feedback(`刷新失败：${error.message}`, true) }
    finally { busy = false; draw() }
  })

  function showEditor(card = null) {
    editingId = card?.id ?? null
    $('#dialog-title').textContent = card ? `编辑 ${card.id}` : '新增卡片'
    form.elements.title.value = card?.title ?? ''
    form.elements.owner.value = card?.owner ?? ''
    form.elements.due.value = card?.due ?? ''
    form.elements.acceptance.value = (card?.acceptance ?? []).join('\n')
    form.elements.dod.value = (card?.dod ?? []).join('\n')
    form.elements.stage.innerHTML = state.pipeline.map((stage) => `<option value="${escapeHtml(stage.id)}">${escapeHtml(stage.name)}</option>`).join('')
    form.elements.stage.value = card?.stage ?? state.pipeline[0].id
    form.elements.stage.disabled = Boolean(card)
    $('#form-error').textContent = ''
    dialog.showModal()
    form.elements.title.focus()
  }
  $('#new-card').addEventListener('click', () => showEditor())
  $('#cancel-edit').addEventListener('click', () => dialog.close())
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (busy) return
    const args = { title: form.elements.title.value, owner: form.elements.owner.value, due: form.elements.due.value || null, acceptance: form.elements.acceptance.value.split('\n').filter((line) => line.trim()), dod: form.elements.dod.value.split('\n').filter((line) => line.trim()) }
    if (editingId) args.card_id = editingId
    else args.stage = form.elements.stage.value
    $('#submit-edit').disabled = true
    const saved = await save(editingId ? 'update' : 'card', args)
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
      try { await navigator.clipboard.writeText(copy.dataset.cmd); copy.textContent = '已复制 /delivery 命令' }
      catch { feedback('复制失败：请在 DSH 中使用 /delivery help 查看命令。', true) }
      return
    }
    const button = event.target.closest('[data-action]')
    if (!button || busy) return
    const cardId = button.closest('[data-card-id]').dataset.cardId
    if (button.dataset.action === 'edit') showEditor(state.cards.find((card) => card.id === cardId))
    else await save(button.dataset.action, { card_id: cardId })
  })
  board.addEventListener('change', async (event) => {
    if (!event.target.matches('.stage-select')) return
    const cardId = event.target.closest('[data-card-id]').dataset.cardId
    await save('move', { card_id: cardId, to_stage: event.target.value, note: 'Board stage selector' })
  })
  board.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-card-id]')
    if (!card || busy || !ui.interactive) { event.preventDefault(); return }
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
  board.addEventListener('drop', async (event) => {
    const column = event.target.closest('[data-stage]')
    event.preventDefault()
    const cardId = dragged
    dragged = null
    board.querySelectorAll('.drag-over, .dragging').forEach((item) => item.classList.remove('drag-over', 'dragging'))
    if (!column || !cardId || busy) return
    const target = column.dataset.stage
    if (state.cards.find((card) => card.id === cardId)?.stage !== target) await save('move', { card_id: cardId, to_stage: target, note: 'Board drag-and-drop' })
  })
  board.addEventListener('dragend', () => { dragged = null; board.querySelectorAll('.drag-over, .dragging').forEach((item) => item.classList.remove('drag-over', 'dragging')) })
  draw()
}
