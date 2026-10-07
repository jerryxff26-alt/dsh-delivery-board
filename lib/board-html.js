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
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(state.customer)} · Delivery Board</title>
<style>
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f1f3f5; color: #222; }
  .topbar { background: #1a1d21; color: #fff; padding: 18px 28px; }
  .heading { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .topbar h1 { margin: 0; font-size: 22px; }
  .topbar .sub { margin-top: 6px; font-size: 13px; color: #c3cad4; }
  .save-status { font-size: 13px; color: #c9eddb; max-width: 600px; }
  .save-status.error { color: #ffb9b4; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px 28px 0; }
  input, select, textarea, button { font: inherit; }
  button, select, input { min-height: 36px; }
  button { padding: 6px 12px; border: 1px solid #bac2cc; background: #fff; border-radius: 6px; cursor: pointer; color: #263543; }
  button:hover:not(:disabled) { background: #e9f1fd; border-color: #4f8ff7; }
  button:disabled { opacity: .55; cursor: default; }
  button[aria-pressed="true"] { background: #e2edfd; border-color: #4f8ff7; color: #204e91; }
  :focus-visible { outline: 3px solid #2369c5; outline-offset: 2px; }
  input, select, textarea { padding: 6px 8px; border: 1px solid #b6c0ca; border-radius: 5px; background: #fff; color: #222; }
  #search { width: min(300px, 100%); }
  .board { display: flex; gap: 14px; padding: 20px 28px; overflow-x: auto; align-items: flex-start; }
  .col { background: #e9ecef; border-radius: 12px; min-width: 270px; max-width: 320px; flex: 1; }
  .col header { background: #fff; border-top: 4px solid #888; border-radius: 12px 12px 0 0; padding: 12px 14px; }
  .col-name { font-weight: 700; font-size: 15px; }
  .count { background: #dee2e6; border-radius: 10px; padding: 1px 9px; font-size: 12px; margin-left: 6px; }
  .col-role { font-size: 12px; color: #586574; margin-top: 3px; display: flex; justify-content: space-between; gap: 8px; }
  .stage-id { font-family: ui-monospace, monospace; }
  .gates { margin-top: 8px; font-size: 12px; }
  .gate { display: inline-block; font-size: 11px; background: #fff5bf; color: #6b5810; border: 1px solid #e5d36c; border-radius: 6px; padding: 2px 6px; margin-top: 4px; }
  .col-body { padding: 10px; min-height: 120px; }
  .drag-over { outline: 3px dashed #4f8ff7; outline-offset: -3px; background: #dce9ff; }
  .dragging { opacity: .45; }
  .card { background: #fff; border-radius: 10px; padding: 12px; margin-bottom: 10px; border-left: 4px solid #4f8ff7; box-shadow: 0 1px 4px #00000010; overflow-wrap: anywhere; }
  .card[draggable="true"] { cursor: grab; }
  .card-title { font-size: 14px; font-weight: 650; margin-bottom: 8px; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; color: #53606f; }
  .cid { background: #f1f3f5; border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, monospace; }
  .owner { color: #285eab; }
  .due.overdue, .blocked { color: #a32929; font-weight: 600; }
  .card details { font-size: 12px; margin-top: 8px; color: #354b67; }
  summary { cursor: pointer; min-height: 24px; }
  .card ul { padding-left: 18px; margin: 5px 0; }
  .card li { margin: 4px 0; }
  .move-label { white-space: nowrap; display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 10px; }
  .stage-select { flex: 1; width: auto; min-width: 0; }
  .card-actions { display: flex; gap: 6px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
  .drag-hint { font-size: 11px; color: #586574; }
  .copybtn { margin-top: 8px; font-size: 11px; color: #285eab; border-color: #789bcd; }
  .empty { color: #647181; text-align: center; font-size: 13px; padding: 22px 0; }
  .risks, .audit, .archive-panel { margin: 0 28px 16px; padding: 16px 20px; background: #fff; border-radius: 12px; }
  .risks { border-left: 4px solid #e35f65; }
  .risks h2, .archive-panel h2 { margin: 0 0 8px; font-size: 16px; }
  .risks ul, .timeline { margin: 0; padding-left: 18px; font-size: 13px; }
  .risks li, .timeline li { margin: 8px 0; }
  .audit summary { font-size: 15px; font-weight: 600; }
  .ts { font-family: ui-monospace, monospace; color: #586574; font-size: 11px; margin-right: 8px; }
  .archive-panel { margin-top: 20px; }
  .archive-panel p { color: #586574; font-size: 13px; }
  .archive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
  .archive-meta { margin-top: 8px; font-size: 12px; color: #586574; }
  .archived-card { border-left-color: #7c8794; }
  footer { padding: 0 28px 24px; font-size: 12px; color: #586574; }
  dialog { border: 1px solid #b6c0ca; border-radius: 10px; width: min(520px, calc(100vw - 24px)); max-height: 90vh; padding: 22px; }
  dialog::backdrop { background: #17212e77; }
  dialog h2 { margin-top: 0; font-size: 18px; }
  dialog label { display: block; font-size: 13px; margin-bottom: 12px; }
  dialog input, dialog select, dialog textarea { display: block; width: 100%; margin-top: 4px; }
  dialog textarea { min-height: 70px; resize: vertical; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; }
  #form-error { color: #a32929; font-size: 13px; }
  @media (max-width: 600px) { .topbar, .toolbar { padding-left: 16px; padding-right: 16px; } .board { padding-left: 16px; padding-right: 16px; } .risks, .audit, .archive-panel { margin-left: 16px; margin-right: 16px; } .topbar h1 { font-size: 19px; } }
</style>
</head>
<body>
<header class="topbar"><div class="heading"><h1>${esc(state.customer)} · Delivery Board</h1><span id="save-status" class="save-status" role="status" aria-live="polite">${interactive ? '已保存 · 本机实时看板' : '只读 HTML 快照 · 使用 /delivery open 编辑'}</span></div><div class="sub">${esc(TEMPLATE_LABELS[state.template] ?? state.template)} | <span id="summary-count">${active} active card(s)</span> | <span id="last-updated">数据更新：${esc(formatTimestamp(state.updatedAt))}</span></div></header>
<nav class="toolbar" aria-label="看板筛选和操作"><input id="search" type="search" aria-label="搜索卡片" placeholder="搜索编号、标题或负责人"><select id="owner-filter" aria-label="筛选负责人"><option value="">全部负责人</option></select><button id="active-view" aria-pressed="true">活动卡片 (${active})</button><button id="archive-view" aria-pressed="false">已归档 (${state.cards.length - active})</button><button id="refresh" data-live${interactive ? '' : ' disabled'}>刷新</button><button id="new-card" data-live${interactive ? '' : ' disabled'}>新增卡片</button></nav>
<main><div id="board" class="board">${renderColumns(state, ui)}</div><section id="archive" class="archive-panel" hidden></section>
${risks.length ? `<section class="risks"><h2>⚠ Open risks / blockers (${risks.length})</h2><ul>${risks.slice(-8).map((entry) => `<li><b>[${esc(entry.type)}]</b> ${esc(entry.text)}</li>`).join('')}</ul></section>` : ''}
<div id="activity">${renderActivity(state)}</div></main>
<footer>${interactive ? '拖动或使用阶段下拉框移动卡片，保存成功后才更新页面。数据写入当前会话工作目录的 JSON；归档不删除历史。' : '这是离线只读快照。筛选和归档查看不修改文件；在 DSH 中运行 /delivery open 打开可保存的实时看板。'}</footer>
<dialog id="card-dialog" aria-labelledby="dialog-title"><form id="card-form"><h2 id="dialog-title">编辑卡片</h2><label>标题<input name="title" required maxlength="500"></label><label>负责人<input name="owner" maxlength="200"></label><label>到期日<input name="due" type="date"></label><label>阶段<select name="stage"></select></label><label>验收标准（每行一条）<textarea name="acceptance"></textarea></label><label>DoD（每行一条）<textarea name="dod"></textarea></label><p id="form-error" role="alert"></p><div class="form-actions"><button type="button" id="cancel-edit">取消</button><button type="submit" id="submit-edit">保存卡片</button></div></form></dialog>
<script>(() => { ${clientSource}\n(${boardClient.toString()})(${scriptJson(boot)}); })();</script>
</body>
</html>`
}
