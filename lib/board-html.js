// Same kanban renderer for offline snapshots and the live, local JSON bridge.
import {
  escapeHtml, formatTimestamp, cardMatches, renderCard, renderColumns, renderArchive, renderActivity, renderRisks, renderGateList,
  stageColor, cardTimeline, renderTimeline,
  resolveBoardLocale, boardStrings, boardUiTables,
} from './board-view.js'
import { boardClient } from './board-client.js'

const TEMPLATE_LABELS = { lite: 'Lite Pipeline', default: 'ToB Delivery Pipeline', governance: 'Governance Pipeline', custom: 'Custom Pipeline' }
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function renderBoardHtml(state, options = {}) {
  const esc = escapeHtml
  const interactive = Boolean(options.endpoint)
  const locale = resolveBoardLocale(options.locale)
  const strings = boardStrings(locale)
  const ui = { interactive, query: '', owner: '', view: 'active', limits: {}, archiveLimit: 30, locale, strings }
  const active = state.cards.filter((card) => card.archivedAt == null).length
  // Only an explicit locale is baked in; otherwise the browser's navigator.language decides
  // (Node >= 21 also exposes navigator, so the server-side default must not leak into boot).
  const boot = { state, endpoint: options.endpoint ?? '', revision: options.revision ?? '', locale: options.locale ?? null }
  const clientSource = [
    boardUiTables, resolveBoardLocale, boardStrings, escapeHtml, formatTimestamp, cardMatches,
    renderGateList, renderCard, renderColumns, renderArchive, renderActivity, renderRisks, stageColor, cardTimeline, renderTimeline,
  ].map((fn) => fn.toString()).join('\n')
  const lang = locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${esc(state.customer)} · Delivery Board</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f7f7f5; --surface: #ffffff; --surface-2: #f1f1ee; --surface-3: #e8e8e4;
    --border: #e6e6e1; --border-strong: #d0d0c9;
    --text: #1a1a18; --text-2: #5c5c56; --text-3: #8a8a82;
    --accent: #3d6be0; --accent-hover: #2f56c4; --accent-soft: #eef2fc; --accent-ring: #3d6be0;
    --danger: #c23b32; --danger-soft: #fbf0ef; --danger-border: #ecc4c0;
    --warn: #9a6700; --warn-soft: #fff8eb; --warn-border: #ecd3a0;
    --ok: #1f7a4d; --ok-soft: #eaf6f0;
    --shadow-sm: 0 1px 2px rgb(26 26 24 / .04);
    --shadow-md: 0 4px 14px -6px rgb(26 26 24 / .12), 0 1px 3px rgb(26 26 24 / .05);
    --shadow-lg: 0 16px 40px -16px rgb(26 26 24 / .28);
    --radius: 10px; --radius-sm: 7px;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #12141a; --surface: #1a1d24; --surface-2: #21252e; --surface-3: #2a2f3a;
      --border: #2c323e; --border-strong: #3c4452;
      --text: #eceef2; --text-2: #a8b0bd; --text-3: #7d8796;
      --accent: #8aabff; --accent-hover: #a8c1ff; --accent-soft: #1c2740; --accent-ring: #8aabff;
      --danger: #ff9d96; --danger-soft: #3a2221; --danger-border: #6a3532;
      --warn: #ffc56d; --warn-soft: #32260f; --warn-border: #6e5218;
      --ok: #79d6ab; --ok-soft: #153024;
      --shadow-sm: 0 1px 2px rgb(0 0 0 / .35); --shadow-md: 0 6px 18px -8px rgb(0 0 0 / .55); --shadow-lg: 0 18px 44px -14px rgb(0 0 0 / .65);
    }
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; font-family: var(--font); font-size: 13px; line-height: 1.45; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  .topbar { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 22px 12px; }
  .heading { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .topbar h1 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: -.02em; display: flex; align-items: center; gap: 10px; }
  .topbar h1::before { content: ""; width: 3px; height: 18px; border-radius: 2px; background: var(--accent); flex: none; opacity: .85; }
  .topbar .sub { margin-top: 5px; font-size: 12px; color: var(--text-3); display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .topbar .sub .sep { color: var(--border-strong); }
  .save-status { font-size: 11.5px; color: var(--ok); background: var(--ok-soft); border-radius: 999px; padding: 3px 10px; max-width: 560px; font-weight: 500; }
  .save-status.error { color: var(--danger); background: var(--danger-soft); }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 22px; background: color-mix(in srgb, var(--surface) 92%, var(--bg)); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; backdrop-filter: blur(8px); }
  .toolbar .spacer { flex: 1 1 auto; }
  input, select, textarea, button { font: inherit; color: inherit; }
  button, select, input { min-height: 32px; font-size: 12.5px; }
  button { padding: 5px 11px; border: 1px solid var(--border-strong); background: var(--surface); border-radius: var(--radius-sm); cursor: pointer; color: var(--text); font-weight: 500; transition: background-color .12s, border-color .12s, color .12s, box-shadow .12s; }
  button:hover:not(:disabled) { background: var(--surface-2); border-color: var(--text-3); }
  button:active:not(:disabled) { transform: translateY(.5px); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: none; }
  @media (prefers-color-scheme: dark) { button.primary { color: #10131a; } }
  button.primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
  :focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
  input, select, textarea { padding: 5px 9px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface); }
  input:hover, select:hover, textarea:hover { border-color: var(--text-3); }
  #search { width: min(240px, 100%); padding-left: 28px; background: var(--surface) no-repeat 9px 50% / 13px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238a8a82' stroke-width='1.8'%3E%3Ccircle cx='7' cy='7' r='5'/%3E%3Cpath d='m11 11 3.5 3.5'/%3E%3C/svg%3E"); }
  .seg { display: inline-flex; padding: 2px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; gap: 2px; }
  .seg button { border: 0; background: transparent; min-height: 28px; padding: 4px 11px; color: var(--text-2); border-radius: 6px; }
  .seg button:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
  .seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); font-weight: 600; }
  @media (prefers-color-scheme: dark) { .seg button[aria-pressed="true"] { background: var(--surface-3); } }
  .board { display: flex; gap: 14px; padding: 18px 22px; overflow-x: auto; align-items: flex-start; scroll-padding: 22px; }
  .col { --stage: #7a8494; background: transparent; border: 0; border-radius: 0; flex: 1 1 0; min-width: 210px; display: flex; flex-direction: column; }
  .col header { background: transparent; border-radius: 0; padding: 4px 2px 10px; border-bottom: 0; box-shadow: inset 0 2px 0 var(--stage); }
  .col-name { font-weight: 600; font-size: 13px; line-height: 1.3; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; padding-top: 8px; }
  .col-title { letter-spacing: -.01em; }
  .stage-dot { display: none; }
  .count { background: var(--surface-3); color: var(--text-2); border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 600; line-height: 18px; }
  .wip { background: var(--accent-soft); color: var(--accent); border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 600; line-height: 18px; }
  .wip.at { background: var(--surface-3); color: var(--text-2); }
  .wip.over, .col.wip-over .wip { background: var(--warn-soft); color: var(--warn); box-shadow: inset 0 0 0 1px var(--warn-border); }
  .col.wip-over header { box-shadow: inset 0 2px 0 var(--warn-border); }
  .wip-note { margin-top: 6px; font-size: 11px; color: var(--warn); background: var(--warn-soft); border-radius: var(--radius-sm); padding: 3px 7px; }
  .col-role { font-size: 11px; color: var(--text-3); margin-top: 2px; opacity: .8; }
  .stage-id { display: none; }
  .gates { margin-top: 6px; font-size: 11px; color: var(--text-3); }
  .gates summary { font-weight: 500; color: var(--text-3); list-style-position: inside; }
  .gate-progress { float: right; font-family: var(--mono); font-size: 10px; color: var(--text-3); }
  .gate { display: inline-block; font-size: 10.5px; background: var(--surface-2); color: var(--text-2); border-radius: 4px; padding: 1px 6px; margin: 3px 3px 0 0; }
  .gate.done { background: var(--ok-soft); color: var(--ok); }
  .gate-check { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; margin: 4px 0; color: var(--text-2); cursor: pointer; line-height: 1.35; }
  .gate-check.done span { color: var(--text-3); text-decoration: line-through; text-decoration-color: var(--border-strong); }
  .gate-check input { min-height: 14px; width: 14px; height: 14px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
  .col-body { padding: 2px 0 0; min-height: 112px; display: flex; flex-direction: column; gap: 10px; }
  .dragging { opacity: .5; }
  .card { --stage: var(--accent); position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 12px 12px 14px; box-shadow: var(--shadow-sm); overflow-wrap: anywhere; transition: box-shadow .14s, border-color .14s, transform .14s; }
  .card::before { content: ""; position: absolute; left: 0; top: 10px; bottom: 10px; width: 2px; border-radius: 0 2px 2px 0; background: var(--stage); opacity: .7; }
  .card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-md); }
  .card:focus-within { border-color: var(--border-strong); }
  .card.is-overdue::before, .card.is-blocked::before { background: var(--danger); opacity: 1; }
  .card[draggable="true"] { cursor: grab; }
  .card-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; min-height: 20px; }
  .drag-hint { margin-left: auto; font-size: 12px; color: var(--text-3); user-select: none; opacity: 0; letter-spacing: -1px; }
  .card:hover .drag-hint, .card:focus-within .drag-hint { opacity: .55; }
  .card-title { font-size: 13.5px; font-weight: 650; margin-bottom: 8px; line-height: 1.35; color: var(--text); letter-spacing: -.01em; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 11.5px; color: var(--text-3); }
  .cid { background: transparent; color: var(--text-3); border: 0; border-radius: 4px; padding: 0; font-family: var(--mono); font-size: 10.5px; line-height: 16px; opacity: .85; }
  .owner { display: inline-flex; align-items: center; gap: 5px; color: var(--text-2); font-weight: 500; }
  .avatar { width: 16px; height: 16px; border-radius: 50%; background: var(--surface-2); color: var(--text-2); display: inline-grid; place-items: center; font-size: 9px; font-weight: 700; }
  .unassigned { color: var(--text-3); font-style: italic; }
  .chip { white-space: nowrap; display: inline-flex; align-items: center; border-radius: 999px; padding: 0 7px; line-height: 18px; font-size: 11px; background: var(--surface-2); color: var(--text-2); border: 1px solid transparent; }
  .chip-quiet { background: var(--surface-2); color: var(--text-3); border-color: transparent; font-weight: 500; cursor: pointer; }
  .chip-danger, .due.overdue, .blocked, .overdue-flag { background: var(--danger-soft); color: var(--danger); border-color: transparent; font-weight: 600; }
  .overdue { color: var(--danger); font-weight: 600; }
  .card-extras { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
  .card-extra { margin: 0; }
  .card-extra > summary { list-style: none; }
  .card-extra > summary::-webkit-details-marker { display: none; }
  .card-extra[open] > summary { margin-bottom: 4px; }
  .card-extra ul { padding-left: 16px; margin: 4px 0 0; color: var(--text-2); font-size: 11.5px; width: 100%; }
  .card-extra li { margin: 2px 0; }
  summary { cursor: pointer; min-height: 18px; border-radius: 4px; }
  summary:hover { color: var(--text); }
  .card-menu { position: relative; margin: 0 0 0 2px; flex: none; }
  .card-menu > summary { list-style: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; color: var(--text-2); font-size: 16px; line-height: 1; opacity: 0; cursor: pointer; user-select: none; }
  .card-menu > summary::-webkit-details-marker { display: none; }
  .card:hover .card-menu > summary, .card:focus-within .card-menu > summary, .card-menu[open] > summary { opacity: 1; }
  .card-menu > summary:hover, .card-menu[open] > summary { background: var(--surface-2); color: var(--text); }
  .card-menu-panel { position: absolute; right: 0; top: calc(100% + 4px); min-width: 148px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-md); z-index: 6; display: flex; flex-direction: column; gap: 2px; }
  .card-menu-panel button { min-height: 28px; justify-content: flex-start; text-align: left; border-color: transparent; background: transparent; color: var(--text-2); font-size: 12px; padding: 4px 8px; width: 100%; }
  .card-menu-panel button:hover:not(:disabled) { background: var(--surface-2); color: var(--text); border-color: transparent; }
  .card-menu-panel .copybtn { color: var(--accent) !important; margin-left: 0; }
  .card-actions { display: flex; gap: 4px; margin-top: 10px; padding-top: 0; border-top: 0; align-items: center; flex-wrap: wrap; }
  .card-actions.visible { margin-top: 10px; }
  .card-actions button { min-height: 26px; padding: 2px 8px; font-size: 11.5px; border-color: transparent; background: transparent; color: var(--text-2); }
  .card-actions button:hover:not(:disabled) { background: var(--surface-2); border-color: var(--border); color: var(--text); }
  .card.dragging { cursor: grabbing; box-shadow: var(--shadow-lg); transform: rotate(.6deg); }
  .col.drag-over { outline: 2px dashed var(--accent); outline-offset: 2px; border-radius: 10px; background: var(--accent-soft); }
  .col.drag-over .col-body { background: transparent; }
  .copybtn { color: var(--accent) !important; }
  .copybtn:hover:not(:disabled) { background: var(--accent-soft) !important; border-color: transparent !important; }
  .load-more { width: 100%; border-style: dashed; color: var(--text-2); background: transparent; }
  .empty { color: var(--text-3); text-align: center; font-size: 12px; padding: 28px 10px; border: 1.5px dashed var(--border); border-radius: 12px; background: color-mix(in srgb, var(--surface) 55%, transparent); }
  .panel, .risks, .audit, .archive-panel, .timeline-panel { margin: 0 22px 14px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow-sm); }
  .risks { border-left: 2px solid color-mix(in srgb, var(--danger) 55%, var(--border)); }
  .risks h2, .archive-panel h2, .timeline-panel h2 { margin: 0 0 8px; font-size: 13.5px; font-weight: 650; letter-spacing: -.005em; color: var(--text); }
  .risks ul { margin: 0; padding: 0; list-style: none; font-size: 12.5px; }
  .risks li { margin: 0; padding: 7px 0; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .risks li:first-child { border-top: 0; }
  .risks li b { font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--danger); background: var(--danger-soft); border-radius: 4px; padding: 1px 6px; font-weight: 650; }
  .risks button { margin-left: auto; min-height: 26px; padding: 2px 9px; font-size: 11.5px; }
  .audit summary { font-size: 12.5px; font-weight: 550; color: var(--text-2); }
  .timeline { margin: 8px 0 0; padding-left: 0; list-style: none; font-size: 12.5px; }
  .timeline li { margin: 0; padding: 6px 0 6px 14px; border-left: 2px solid var(--border); position: relative; }
  .timeline li::before { content: ""; position: absolute; left: -5px; top: 12px; width: 8px; height: 8px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); }
  .ts { font-family: var(--mono); color: var(--text-3); font-size: 11px; margin-right: 8px; }
  .archive-panel { margin-top: 16px; }
  .archive-panel p { color: var(--text-3); font-size: 12px; margin: 0 0 12px; }
  .archive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .archive-meta { margin-top: 6px; font-size: 11px; color: var(--text-3); }
  .archived-card { --stage: #7a8494; opacity: .92; }
  .timeline-panel { margin-top: 16px; padding: 0; overflow: hidden; }
  .tl-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px 24px; flex-wrap: wrap; padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
  .tl-help { margin: 0; color: var(--text-3); font-size: 12px; max-width: 640px; }
  .tl-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 2px 0 0; padding: 0; list-style: none; font-size: 11.5px; color: var(--text-2); }
  .tl-legend li { display: inline-flex; align-items: center; gap: 5px; }
  .tl-key.seg { width: 22px; height: 8px; border-radius: 4px; background: linear-gradient(90deg, #8a7aa8 0 40%, #a88968 40% 70%, #5f9278 70%); }
  .tl-key.due { color: var(--text-2); font-size: 11px; }
  .tl-key.due.overdue { color: var(--danger); }
  .tl-key.ship { color: var(--ok); font-weight: 700; }
  .tl-key.arch { color: var(--text-3); font-size: 9px; }
  .tl-key.today { width: 2px; height: 12px; background: var(--danger); border-radius: 1px; }
  .tl-clipped { margin: 8px 16px 0; font-size: 11.5px; color: var(--text-3); }
  .tl-scroll { overflow-x: auto; overscroll-behavior-x: contain; }
  .tl-grid { --label: 260px; min-width: calc(var(--label) + var(--tl-width)); position: relative; }
  .tl-axis, .tl-row, .tl-group { display: grid; grid-template-columns: var(--label) var(--tl-width); }
  .tl-label { position: sticky; left: 0; z-index: 2; background: var(--surface); border-right: 1px solid var(--border); padding: 6px 12px; min-width: 0; }
  .tl-axis { position: sticky; top: 0; z-index: 3; background: var(--surface); border-bottom: 1px solid var(--border); }
  .tl-corner { display: flex; align-items: flex-end; font-size: 11px; font-weight: 600; color: var(--text-3); text-transform: uppercase; letter-spacing: .05em; z-index: 4; }
  .tl-scale { position: relative; height: 46px; }
  .tl-months, .tl-weeks { position: absolute; left: 0; right: 0; height: 22px; }
  .tl-months { top: 2px; }
  .tl-weeks { top: 24px; }
  .tl-month { position: absolute; top: 3px; padding-left: 6px; font-size: 12px; font-weight: 650; color: var(--text); white-space: nowrap; border-left: 1px solid var(--border-strong); line-height: 16px; }
  .tl-week { position: absolute; top: 2px; padding-left: 4px; font-size: 10.5px; color: var(--text-3); white-space: nowrap; font-family: var(--mono); }
  .tl-today-tag { position: absolute; bottom: -1px; transform: translateX(-50%); background: var(--danger); color: #fff; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px 4px 0 0; white-space: nowrap; z-index: 2; }
  @media (prefers-color-scheme: dark) { .tl-today-tag { color: #1a0d0d; } }
  .tl-body { position: relative; }
  .tl-lines { position: absolute; top: 0; bottom: 0; left: var(--label); width: var(--tl-width); pointer-events: none; z-index: 0; }
  .tl-line { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--border); }
  .tl-line.month { background: var(--border-strong); }
  .tl-weekend { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--surface-2) 70%, transparent); }
  .tl-today { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--danger); opacity: .85; z-index: 1; }
  .tl-row { min-height: 44px; border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent); }
  .tl-row:hover .tl-label, .tl-row:hover .tl-track { background: color-mix(in srgb, var(--accent-soft) 45%, transparent); }
  .tl-row:hover .tl-label { background: color-mix(in srgb, var(--accent-soft) 45%, var(--surface)); }
  .tl-row .tl-label { display: grid; grid-template-columns: auto 1fr; column-gap: 7px; align-items: center; }
  .tl-row .tl-label .cid { grid-row: 1 / 3; align-self: center; }
  .tl-title { font-size: 12.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
  button.tl-title { border: 0; background: transparent; padding: 0; min-height: 0; border-radius: 3px; }
  button.tl-title:hover:not(:disabled) { background: transparent; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .tl-sub { grid-column: 2; font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-group .tl-label { display: flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 650; color: var(--text-2); text-transform: uppercase; letter-spacing: .04em; padding-top: 12px; padding-bottom: 4px; }
  .tl-group { border-bottom: 1px solid var(--border); }
  .tl-track { position: relative; z-index: 1; }
  .tl-seg { position: absolute; top: 50%; height: 16px; margin-top: -8px; background: var(--stage); opacity: .38; border-radius: 3px; }
  .tl-seg + .tl-seg { border-left: 2px solid var(--surface); }
  .tl-seg.current { opacity: 1; }
  .tl-seg.current { height: 20px; margin-top: -10px; border-radius: 4px; box-shadow: var(--shadow-sm); background-image: linear-gradient(90deg, transparent calc(100% - 12px), rgb(255 255 255 / .28)); }
  .tl-seg-text { display: block; padding: 0 7px; color: #fff; font-size: 11px; font-weight: 600; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-row:not(.archived) .tl-seg:not(.current) .tl-seg-text { line-height: 16px; }
  .tl-row.archived .tl-seg { opacity: .3; }
  .tl-row.archived .tl-title { color: var(--text-3); font-weight: 500; }
  .tl-due { position: absolute; top: 50%; transform: translate(-50%, -52%); font-size: 13px; color: var(--text); text-shadow: 0 0 0 var(--surface), 0 0 3px var(--surface); z-index: 2; line-height: 1; }
  .tl-due.overdue { color: var(--danger); }
  .tl-ship { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 18px; height: 18px; border-radius: 50%; background: var(--ok); color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; z-index: 2; box-shadow: 0 0 0 2px var(--surface); }
  @media (prefers-color-scheme: dark) { .tl-ship, .tl-seg-text { color: #0e1116; } .tl-seg.current .tl-seg-text { color: #fff; } }
  .tl-arch { position: absolute; top: 50%; transform: translate(-50%, -50%); font-size: 9px; color: var(--text-3); z-index: 2; }
  .tl-nostart { position: absolute; top: 50%; transform: translateY(-50%); font-size: 10.5px; color: var(--text-3); font-style: italic; white-space: nowrap; border-bottom: 1px dashed var(--border-strong); width: 112px; text-align: right; padding-right: 4px; }
  .tl-empty { margin: 16px; }
  .tl-undated { padding: 12px 16px 16px; border-top: 1px solid var(--border); background: var(--surface-2); }
  .tl-undated h3 { margin: 0 0 2px; font-size: 12.5px; font-weight: 650; }
  .tl-undated p { margin: 0 0 8px; font-size: 11.5px; color: var(--text-3); }
  .tl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .tl-chip { display: inline-flex; gap: 6px; align-items: center; background: var(--surface); border: 1px dashed var(--border-strong); border-radius: 999px; padding: 2px 10px 2px 4px; font-size: 12px; }
  footer { padding: 4px 22px 24px; font-size: 11.5px; color: var(--text-3); max-width: 1100px; }
  dialog { border: 1px solid var(--border); border-radius: 14px; width: min(560px, calc(100vw - 24px)); max-height: 90vh; padding: 24px 24px 20px; background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
  dialog::backdrop { background: rgb(16 18 24 / .45); backdrop-filter: blur(3px); }
  dialog h2 { margin: 0 0 16px; font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
  dialog label { display: block; font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 14px; }
  dialog input, dialog select, dialog textarea { display: block; width: 100%; margin-top: 6px; font-weight: 400; color: var(--text); }
  dialog textarea { min-height: 72px; resize: vertical; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  #form-error, #log-form-error { color: var(--danger); font-size: 12px; }
  @media (hover: none) {
    .card-menu > summary, .drag-hint { opacity: 1; }
  }
  @media (min-width: 1600px) {
    .col { min-width: 230px; }
    .board { gap: 16px; padding: 20px 28px; }
  }
  @media (max-width: 1100px) { .col { min-width: 196px; } }
  @media (max-width: 900px) { .col { flex: 0 0 auto; width: 240px; } .tl-grid { --label: 200px; } }
  @media (max-width: 600px) {
    .topbar, .toolbar { padding-left: 12px; padding-right: 12px; }
    .board { padding-left: 12px; padding-right: 12px; }
    .risks, .audit, .archive-panel, .timeline-panel { margin-left: 12px; margin-right: 12px; }
    .topbar h1 { font-size: 15px; }
    .col { width: 82vw; }
    .tl-grid { --label: 150px; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  @media print { .toolbar, .card-menu, .drag-hint { display: none !important; } body { background: #fff; } }
</style>
</head>
<body>
<header class="topbar"><div class="heading"><h1>${esc(state.customer)} · Delivery Board</h1><span id="save-status" class="save-status" role="status" aria-live="polite">${esc(interactive ? strings.liveStatus : strings.readonlyStatus)}</span></div><div class="sub"><span>${esc(TEMPLATE_LABELS[state.template] ?? 'Custom Pipeline')}</span><span class="sep" aria-hidden="true">·</span><span id="summary-count">${esc(strings.activeCount(active))}</span><span class="sep" aria-hidden="true">·</span><span id="last-updated">${esc(strings.updated(formatTimestamp(state.updatedAt, locale)))}</span></div></header>
<nav class="toolbar" aria-label="Board filters and actions"><input id="search" type="search" aria-label="${esc(strings.searchPlaceholder)}" placeholder="${esc(strings.searchPlaceholder)}"><select id="owner-filter" aria-label="${esc(strings.allOwners)}"><option value="">${esc(strings.allOwners)}</option></select><div class="seg" role="group" id="view-switch" aria-label="${esc(strings.viewsLabel)}"><button id="active-view" aria-pressed="true">${esc(strings.activeCards(active))}</button><button id="timeline-view" aria-pressed="false">${esc(strings.viewTimeline)}</button><button id="archive-view" aria-pressed="false">${esc(strings.archived(state.cards.length - active))}</button></div><span class="spacer"></span><button id="refresh" data-live${interactive ? '' : ' disabled'}>${esc(strings.refresh)}</button><button id="new-log" data-live${interactive ? '' : ' disabled'}>${esc(strings.newLog)}</button><button id="new-card" class="primary" data-live${interactive ? '' : ' disabled'}>${esc(strings.newCard)}</button></nav>
<main><div id="board" class="board">${renderColumns(state, ui)}</div><section id="timeline" class="timeline-panel" aria-label="${esc(strings.viewTimeline)}" hidden></section><section id="archive" class="archive-panel" hidden></section>
<div id="risks">${renderRisks(state, interactive, strings)}</div>
<div id="activity">${renderActivity(state, strings)}</div></main>
<footer id="board-footer">${esc(interactive ? strings.liveFooter : strings.readonlyFooter)}</footer>
<dialog id="card-dialog" aria-labelledby="dialog-title"><form id="card-form"><h2 id="dialog-title">Edit card</h2><label>Title<input name="title" required maxlength="500"></label><label>Owner<input name="owner" maxlength="200"></label><label>Due date<input name="due" type="date"></label><label>Stage<select name="stage" aria-label="Card stage"></select></label><label>Acceptance criteria (one per line)<textarea name="acceptance"></textarea></label><label>DoD (one per line)<textarea name="dod"></textarea></label><p id="form-error" role="alert"></p><div class="form-actions"><button type="button" id="cancel-edit">Cancel</button><button type="submit" id="submit-edit" class="primary">Save card</button></div></form></dialog>
<dialog id="log-dialog" aria-labelledby="log-dialog-title"><form id="log-form"><h2 id="log-dialog-title">Log risk / blocker</h2><label>Type<select name="type" aria-label="Log type"><option value="risk">risk</option><option value="blocker">blocker</option></select></label><label>Text<textarea name="text" required maxlength="2000"></textarea></label><label>Related card (optional)<select name="card_id" aria-label="Related card"><option value="">None</option></select></label><p id="log-form-error" role="alert"></p><div class="form-actions"><button type="button" id="cancel-log">Cancel</button><button type="submit" id="submit-log" class="primary">Save log</button></div></form></dialog>
<script>(() => { ${clientSource}\n(${boardClient.toString()})(${scriptJson(boot)}); })();</script>
</body>
</html>`
}
