// Same kanban renderer for offline snapshots and the live, local JSON bridge.
import { escapeHtml, formatTimestamp, cardMatches, renderCard, renderColumns, renderArchive, renderActivity } from './board-view.js'
import { boardClient } from './board-client.js'

const TEMPLATE_LABELS = { default: 'ToB Delivery Pipeline', governance: 'Governance Pipeline', custom: 'Custom Pipeline' }
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function renderBoardHtml(state, options = {}) {
  const esc = escapeHtml
  const interactive = Boolean(options.endpoint)
  const ui = { interactive, query: '', owner: '', view: 'active', limits: {}, archiveLimit: 30 }
  const risks = state.logs.filter((entry) => ['risk', 'blocker'].includes(entry.type))
  const active = state.cards.filter((card) => card.archivedAt == null).length
  const boot = { state, endpoint: options.endpoint ?? '', revision: options.revision ?? '' }
  const clientSource = [escapeHtml, formatTimestamp, cardMatches, renderCard, renderColumns, renderArchive, renderActivity].map((fn) => fn.toString()).join('\n')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(state.customer)} · Delivery Board</title>
<style>
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f1f3f5; color: #222; }
  .topbar { background: #1a1d21; color: #fff; padding: 12px 16px; }
  .heading { display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .topbar h1 { margin: 0; font-size: 18px; }
  .topbar .sub { margin-top: 4px; font-size: 12px; color: #c3cad4; }
  .save-status { font-size: 12px; color: #c9eddb; max-width: 520px; }
  .save-status.error { color: #ffb9b4; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 16px 0; }
  input, select, textarea, button { font: inherit; }
  button, select, input { min-height: 30px; font-size: 12px; }
  button { padding: 4px 9px; border: 1px solid #bac2cc; background: #fff; border-radius: 5px; cursor: pointer; color: #263543; }
  button:hover:not(:disabled) { background: #e9f1fd; border-color: #4f8ff7; }
  button:disabled { opacity: .55; cursor: default; }
  button[aria-pressed="true"] { background: #e2edfd; border-color: #4f8ff7; color: #204e91; }
  :focus-visible { outline: 3px solid #2369c5; outline-offset: 2px; }
  input, select, textarea { padding: 4px 7px; border: 1px solid #b6c0ca; border-radius: 5px; background: #fff; color: #222; }
  #search { width: min(240px, 100%); }
  .board { display: flex; gap: 8px; padding: 12px 14px; overflow-x: auto; align-items: flex-start; }
  .col { background: #e9ecef; border-radius: 10px; flex: 1 1 0; min-width: 148px; max-width: none; }
  .col header { background: #fff; border-top: 3px solid #888; border-radius: 10px 10px 0 0; padding: 8px 9px; }
  .col-name { font-weight: 700; font-size: 12px; line-height: 1.3; }
  .count { background: #dee2e6; border-radius: 9px; padding: 0 6px; font-size: 10px; margin-left: 4px; font-weight: 600; }
  .col-role { font-size: 10px; color: #586574; margin-top: 2px; display: flex; justify-content: space-between; gap: 4px; }
  .stage-id { font-family: ui-monospace, monospace; font-size: 9px; opacity: .85; }
  .gates { margin-top: 4px; font-size: 10px; }
  .gate { display: inline-block; font-size: 9px; background: #fff5bf; color: #6b5810; border: 1px solid #e5d36c; border-radius: 4px; padding: 1px 4px; margin-top: 2px; }
  .col-body { padding: 6px; min-height: 88px; }
  .drag-over { outline: 2px dashed #4f8ff7; outline-offset: -2px; background: #dce9ff; }
  .dragging { opacity: .45; }
  .card { background: #fff; border-radius: 8px; padding: 8px; margin-bottom: 6px; border-left: 3px solid #4f8ff7; box-shadow: 0 1px 3px #00000010; overflow-wrap: anywhere; }
  .card[draggable="true"] { cursor: grab; }
  .card-title { font-size: 12px; font-weight: 650; margin-bottom: 5px; line-height: 1.35; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 4px; font-size: 10px; color: #53606f; }
  .cid { background: #f1f3f5; border-radius: 3px; padding: 0 4px; font-family: ui-monospace, monospace; font-size: 9px; }
  .owner { color: #285eab; }
  .due.overdue, .blocked { color: #a32929; font-weight: 600; }
  .card details { font-size: 10px; margin-top: 5px; color: #354b67; }
  summary { cursor: pointer; min-height: 18px; }
  .card ul { padding-left: 14px; margin: 3px 0; }
  .card li { margin: 2px 0; }
  .card-actions { display: flex; gap: 4px; margin-top: 6px; align-items: center; flex-wrap: wrap; }
  .card-actions button { min-height: 26px; padding: 2px 7px; font-size: 11px; }
  .drag-hint { font-size: 10px; color: #586574; user-select: none; }
  .card.dragging { cursor: grabbing; box-shadow: 0 6px 14px #00000022; }
  .col.drag-over .col-body { background: #dce9ff; }
  .col.drag-over { outline: 2px dashed #4f8ff7; outline-offset: -2px; background: #e8f0ff; }
  .copybtn { margin-top: 5px; font-size: 10px; color: #285eab; border-color: #789bcd; min-height: 26px; padding: 2px 7px; }
  .empty { color: #647181; text-align: center; font-size: 11px; padding: 14px 0; }
  .risks, .audit, .archive-panel { margin: 0 14px 12px; padding: 12px 14px; background: #fff; border-radius: 10px; }
  .risks { border-left: 3px solid #e35f65; }
  .risks h2, .archive-panel h2 { margin: 0 0 6px; font-size: 14px; }
  .risks ul, .timeline { margin: 0; padding-left: 16px; font-size: 12px; }
  .risks li, .timeline li { margin: 6px 0; }
  .audit summary { font-size: 13px; font-weight: 600; }
  .ts { font-family: ui-monospace, monospace; color: #586574; font-size: 10px; margin-right: 6px; }
  .archive-panel { margin-top: 14px; }
  .archive-panel p { color: #586574; font-size: 12px; }
  .archive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .archive-meta { margin-top: 6px; font-size: 10px; color: #586574; }
  .archived-card { border-left-color: #7c8794; }
  footer { padding: 0 14px 18px; font-size: 11px; color: #586574; }
  dialog { border: 1px solid #b6c0ca; border-radius: 10px; width: min(520px, calc(100vw - 24px)); max-height: 90vh; padding: 20px; }
  dialog::backdrop { background: #17212e77; }
  dialog h2 { margin-top: 0; font-size: 16px; }
  dialog label { display: block; font-size: 12px; margin-bottom: 10px; }
  dialog input, dialog select, dialog textarea { display: block; width: 100%; margin-top: 4px; }
  dialog textarea { min-height: 64px; resize: vertical; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  #form-error { color: #a32929; font-size: 12px; }
  @media (min-width: 1600px) {
    .col { min-width: 168px; }
    .board { gap: 10px; padding: 16px 20px; }
    .card-title { font-size: 13px; }
    .col-name { font-size: 13px; }
  }
  @media (max-width: 1100px) {
    .col { min-width: 140px; }
  }
  @media (max-width: 900px) {
    .col { flex: 0 0 auto; min-width: 168px; max-width: 220px; }
  }
  @media (max-width: 600px) {
    .topbar, .toolbar { padding-left: 12px; padding-right: 12px; }
    .board { padding-left: 10px; padding-right: 10px; }
    .risks, .audit, .archive-panel { margin-left: 10px; margin-right: 10px; }
    .topbar h1 { font-size: 16px; }
    .col { min-width: 180px; }
  }
</style>
</head>
<body>
<header class="topbar"><div class="heading"><h1>${esc(state.customer)} · Delivery Board</h1><span id="save-status" class="save-status" role="status" aria-live="polite">${interactive ? 'Saved · Live local board' : 'Read-only HTML snapshot · Use /delivery open to edit'}</span></div><div class="sub">${esc(TEMPLATE_LABELS[state.template] ?? 'Custom Pipeline')} | <span id="summary-count">${active} active card(s)</span> | <span id="last-updated">Updated: ${esc(formatTimestamp(state.updatedAt))}</span></div></header>
<nav class="toolbar" aria-label="Board filters and actions"><input id="search" type="search" aria-label="Search cards" placeholder="Search ID, title or owner"><select id="owner-filter" aria-label="Filter by owner"><option value="">All owners</option></select><button id="active-view" aria-pressed="true">Active cards (${active})</button><button id="archive-view" aria-pressed="false">Archived (${state.cards.length - active})</button><button id="refresh" data-live${interactive ? '' : ' disabled'}>Refresh</button><button id="new-card" data-live${interactive ? '' : ' disabled'}>New card</button></nav>
<main><div id="board" class="board">${renderColumns(state, ui)}</div><section id="archive" class="archive-panel" hidden></section>
${risks.length ? `<section class="risks"><h2>⚠ Open risks / blockers (${risks.length})</h2><ul>${risks.slice(-8).map((entry) => `<li><b>[${esc(entry.type)}]</b> ${esc(entry.text)}</li>`).join('')}</ul></section>` : ''}
<div id="activity">${renderActivity(state)}</div></main>
<footer>${interactive ? 'Drag a card into another stage column to move it (handoff is recorded when the stage changes). Prefer Edit → Stage if you need a non-drag fallback. Changes appear after saving. Data is saved to JSON in the current session’s working directory; archiving keeps history.' : 'This is an offline, read-only snapshot. Filters and archive views do not change files. Run /delivery open in DSH to open the editable live board.'}</footer>
<dialog id="card-dialog" aria-labelledby="dialog-title"><form id="card-form"><h2 id="dialog-title">Edit card</h2><label>Title<input name="title" required maxlength="500"></label><label>Owner<input name="owner" maxlength="200"></label><label>Due date<input name="due" type="date"></label><label>Stage<select name="stage" aria-label="Card stage"></select></label><label>Acceptance criteria (one per line)<textarea name="acceptance"></textarea></label><label>DoD (one per line)<textarea name="dod"></textarea></label><p id="form-error" role="alert"></p><div class="form-actions"><button type="button" id="cancel-edit">Cancel</button><button type="submit" id="submit-edit">Save card</button></div></form></dialog>
<script>(() => { ${clientSource}\n(${boardClient.toString()})(${scriptJson(boot)}); })();</script>
</body>
</html>`
}
