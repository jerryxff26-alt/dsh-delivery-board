// Same kanban renderer for offline snapshots and the live, local JSON bridge.
import {
  escapeHtml, formatTimestamp, cardMatches, renderCard, renderColumns, renderArchive, renderActivity, renderRisks, renderGateList, renderBoardGates,
  cardTimeline, renderTimeline,
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
    renderGateList, renderBoardGates, renderCard, renderColumns, renderArchive, renderActivity, renderRisks, cardTimeline, renderTimeline,
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
    --bg: #fbfbfa; --surface: #ffffff; --surface-2: #f4f4f2; --surface-3: #ebebe8;
    --border: #ececea; --border-strong: #dddcd7;
    --text: #111110; --text-2: #5f5e5a; --text-3: #8e8d87;
    --accent: #171717; --accent-hover: #000000; --accent-soft: #f0f0ef; --accent-ring: #171717;
    --danger: #c23b32; --danger-soft: #fbf0ef; --danger-border: #ecc4c0;
    --warn: #9a6700; --warn-soft: #fff8eb; --warn-border: #ecd3a0;
    --ok: #1f7a4d; --ok-soft: #eaf6f0;
    --shadow-sm: 0 1px 2px rgb(17 17 16 / .04);
    --shadow-md: 0 6px 18px -10px rgb(17 17 16 / .14), 0 1px 3px rgb(17 17 16 / .04);
    --shadow-lg: 0 18px 44px -18px rgb(17 17 16 / .28);
    --radius: 8px; --radius-sm: 6px;
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0e0f12; --surface: #16181d; --surface-2: #1c1f26; --surface-3: #262a33;
      --border: #262a33; --border-strong: #343945;
      --text: #eceef2; --text-2: #9aa3b2; --text-3: #6f7888;
      --accent: #eceef2; --accent-hover: #ffffff; --accent-soft: #1c1f26; --accent-ring: #eceef2;
      --danger: #ff9d96; --danger-soft: #3a2221; --danger-border: #6a3532;
      --warn: #ffc56d; --warn-soft: #32260f; --warn-border: #6e5218;
      --ok: #79d6ab; --ok-soft: #153024;
      --shadow-sm: 0 1px 2px rgb(0 0 0 / .4); --shadow-md: 0 8px 22px -10px rgb(0 0 0 / .55); --shadow-lg: 0 20px 48px -16px rgb(0 0 0 / .7);
    }
  }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; font-family: var(--font); font-size: 13px; line-height: 1.45; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; }
  .topbar { background: transparent; border-bottom: 0; padding: 22px 28px 6px; }
  .heading { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .topbar h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -.03em; line-height: 1.25; }
  .topbar .sub { margin-top: 8px; font-size: 12px; color: var(--text-3); display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .topbar .sub .sep { color: var(--border-strong); }
  .save-status { font-size: 11.5px; color: var(--text-3); background: transparent; padding: 2px 0; font-weight: 500; min-height: 1em; }
  .save-status.error { color: var(--danger); background: transparent; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 28px 14px; border-bottom: 0; position: sticky; top: 0; z-index: 5; backdrop-filter: blur(10px); background: color-mix(in srgb, var(--bg) 88%, transparent); }
  .toolbar .spacer { flex: 1 1 auto; }
  input, select, textarea, button { font: inherit; color: inherit; }
  button, select, input { min-height: 32px; font-size: 12.5px; }
  button { padding: 5px 11px; border: 1px solid transparent; background: transparent; border-radius: var(--radius-sm); cursor: pointer; color: var(--text-2); font-weight: 500; transition: background-color .12s, border-color .12s, color .12s, box-shadow .12s; }
  button:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
  button:active:not(:disabled) { transform: translateY(.5px); }
  button:disabled { opacity: .45; cursor: not-allowed; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: none; }
  @media (prefers-color-scheme: dark) { button.primary { color: #10131a; } }
  button.primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); color: #fff; }
  @media (prefers-color-scheme: dark) { button.primary:hover:not(:disabled) { color: #10131a; } }
  :focus-visible { outline: 2px solid var(--accent-ring); outline-offset: 2px; }
  input, select, textarea { padding: 5px 9px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
  input:hover, select:hover, textarea:hover { border-color: var(--border-strong); }
  #search { width: min(220px, 100%); padding-left: 28px; border-color: transparent; background: var(--surface-2) no-repeat 9px 50% / 13px url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%238e8d87' stroke-width='1.8'%3E%3Ccircle cx='7' cy='7' r='5'/%3E%3Cpath d='m11 11 3.5 3.5'/%3E%3C/svg%3E"); }
  #owner-filter { border-color: transparent; background: var(--surface-2); color: var(--text-2); }
  .seg { display: inline-flex; padding: 2px; background: var(--surface-2); border: 0; border-radius: 9px; gap: 2px; }
  .seg button { border: 0; background: transparent; min-height: 28px; padding: 4px 11px; color: var(--text-2); border-radius: 7px; }
  .seg button:hover:not(:disabled) { background: color-mix(in srgb, var(--surface-3) 80%, transparent); color: var(--text); }
  .seg button[aria-pressed="true"] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); font-weight: 600; }
  @media (prefers-color-scheme: dark) { .seg button[aria-pressed="true"] { background: var(--surface-3); } }
  .toolbar-more { position: relative; }
  .toolbar-more > summary { list-style: none; min-height: 32px; min-width: 32px; display: grid; place-items: center; border-radius: var(--radius-sm); color: var(--text-3); cursor: pointer; font-size: 16px; line-height: 1; padding: 0 8px; }
  .toolbar-more > summary::-webkit-details-marker { display: none; }
  .toolbar-more > summary:hover, .toolbar-more[open] > summary { background: var(--surface-2); color: var(--text); }
  .toolbar-more-panel { position: absolute; right: 0; top: calc(100% + 4px); min-width: 160px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-md); z-index: 6; display: flex; flex-direction: column; gap: 2px; }
  .toolbar-more-panel button { min-height: 28px; justify-content: flex-start; text-align: left; width: 100%; color: var(--text-2); }
  .board { display: flex; gap: 18px; padding: 8px 28px 20px; overflow-x: auto; align-items: flex-start; scroll-padding: 28px; }
  .col { background: transparent; border: 0; border-radius: 0; flex: 1 1 0; min-width: 220px; display: flex; flex-direction: column; }
  .col header { background: transparent; border-radius: 0; padding: 2px 2px 12px; border-bottom: 0; box-shadow: none; }
  .col-name { font-weight: 550; font-size: 12px; line-height: 1.3; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; color: var(--text-2); }
  .col-title { letter-spacing: -.01em; font-weight: 600; color: var(--text); font-size: 13px; }
  .count { background: transparent; color: var(--text-3); border-radius: 0; padding: 0; font-size: 11px; font-weight: 500; line-height: 1; font-family: var(--mono); }
  .wip-note { margin-top: 6px; font-size: 11px; color: var(--text-3); background: transparent; border-radius: 0; padding: 0; }
  .col.wip-over .wip-note { color: var(--warn); }
  .gates { margin-top: 6px; font-size: 11px; color: var(--text-3); }
  .gates summary { font-weight: 500; color: var(--text-3); list-style-position: inside; }
  .gate-progress { float: right; font-family: var(--mono); font-size: 10px; color: var(--text-3); }
  .gate { display: inline-block; font-size: 10.5px; background: var(--surface-2); color: var(--text-2); border-radius: 4px; padding: 1px 6px; margin: 3px 3px 0 0; }
  .gate.done { background: var(--ok-soft); color: var(--ok); }
  .gate-check { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; margin: 4px 0; color: var(--text-2); cursor: pointer; line-height: 1.35; }
  .gate-check.done span { color: var(--text-3); text-decoration: line-through; text-decoration-color: var(--border-strong); }
  .gate-check input { min-height: 14px; width: 14px; height: 14px; margin: 1px 0 0; accent-color: var(--accent); flex: none; }
  .board-gates { margin: 0 28px 10px; padding: 8px 0; color: var(--text-3); font-size: 12px; }
  .board-gates > summary { cursor: pointer; font-weight: 500; color: var(--text-3); list-style-position: inside; }
  .board-gates[open] > summary { margin-bottom: 8px; }
  .board-gate-stage { margin: 0 0 10px; padding: 8px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .board-gate-name { font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 4px; }
  .col-body { padding: 0; min-height: 112px; display: flex; flex-direction: column; gap: 10px; }
  .dragging { opacity: .5; }
  .card { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 14px 12px; box-shadow: none; overflow-wrap: anywhere; transition: box-shadow .14s, border-color .14s, transform .14s; }
  .card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-sm); }
  .card:focus-within { border-color: var(--border-strong); }
  .card.is-blocked { border-left: 2px solid var(--danger); }
  .card[draggable="true"] { cursor: grab; }
  .card-title { font-size: 14.5px; font-weight: 600; margin: 0 0 12px; line-height: 1.4; color: var(--text); letter-spacing: -.015em; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; color: var(--text-3); }
  .cid { color: var(--text-3); font-family: var(--mono); font-size: 10px; line-height: 16px; }
  .owner { display: inline-flex; align-items: center; gap: 5px; color: var(--text-2); font-weight: 500; }
  .avatar { width: 16px; height: 16px; border-radius: 50%; background: var(--surface-2); color: var(--text-2); display: inline-grid; place-items: center; font-size: 9px; font-weight: 700; }
  .unassigned { color: var(--text-3); font-style: italic; }
  .due { color: var(--text-3); font-variant-numeric: tabular-nums; }
  .due.overdue { color: var(--danger); font-weight: 600; }
  .blocked-meta { font-size: 11px; color: var(--danger); font-weight: 500; opacity: .85; }
  .overdue { color: var(--danger); font-weight: 600; }
  summary { cursor: pointer; min-height: 18px; border-radius: 4px; }
  summary:hover { color: var(--text); }
  .card-menu { position: absolute; top: 8px; right: 8px; z-index: 5; margin: 0; }
  .card-menu > summary { list-style: none; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; color: var(--text-2); font-size: 16px; line-height: 1; opacity: 0; cursor: pointer; user-select: none; }
  .card-menu > summary::-webkit-details-marker { display: none; }
  .card:hover .card-menu > summary, .card:focus-within .card-menu > summary, .card-menu[open] > summary { opacity: 1; }
  .card-menu > summary:hover, .card-menu[open] > summary { background: var(--surface-2); color: var(--text); }
  .card-menu-panel { position: absolute; right: 0; top: calc(100% + 4px); min-width: 148px; padding: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-md); z-index: 6; display: flex; flex-direction: column; gap: 2px; }
  .card-menu-panel button { min-height: 28px; justify-content: flex-start; text-align: left; border-color: transparent; background: transparent; color: var(--text-2); font-size: 12px; padding: 4px 8px; width: 100%; }
  .card-menu-panel button:hover:not(:disabled) { background: var(--surface-2); color: var(--text); border-color: transparent; }
  .card-menu-panel .copybtn { color: var(--accent) !important; margin-left: 0; }
  .card-actions { display: flex; gap: 4px; margin-top: 10px; padding-top: 0; border-top: 0; align-items: center; flex-wrap: wrap; }
  .card-actions.visible { margin-top: 10px; }
  .card-actions button { min-height: 26px; padding: 2px 8px; font-size: 11.5px; border-color: transparent; background: transparent; color: var(--text-2); }
  .card-actions button:hover:not(:disabled) { background: var(--surface-2); border-color: var(--border); color: var(--text); }
  .card.dragging { cursor: grabbing; box-shadow: var(--shadow-lg); transform: rotate(.4deg); }
  .col.drag-over { outline: 1.5px dashed color-mix(in srgb, var(--accent) 40%, var(--border)); outline-offset: 4px; border-radius: var(--radius); background: color-mix(in srgb, var(--accent-soft) 55%, transparent); }
  .col.drag-over .col-body { background: transparent; }
  .copybtn { color: var(--accent) !important; }
  .copybtn:hover:not(:disabled) { background: var(--accent-soft) !important; border-color: transparent !important; }
  .load-more { width: 100%; border-style: dashed; color: var(--text-2); background: transparent; }
  .empty { color: var(--text-3); text-align: center; font-size: 12px; padding: 32px 10px; border: 0; border-radius: var(--radius); background: transparent; }
  .panel, .risks, .audit, .archive-panel, .timeline-panel { margin: 0 28px 12px; padding: 12px 14px; background: transparent; border: 0; border-radius: 0; box-shadow: none; }
  .risks { padding: 4px 0 12px; border-top: 1px solid var(--border); border-left: 0; }
  .risks > summary { font-size: 12px; font-weight: 500; color: var(--text-3); }
  .risks[open] > summary { margin-bottom: 4px; }
  .archive-panel h2, .timeline-panel h2 { margin: 0 0 8px; font-size: 13.5px; font-weight: 600; letter-spacing: -.005em; color: var(--text); }
  .risks ul { margin: 0; padding: 0; list-style: none; font-size: 12.5px; }
  .risks li { margin: 0; padding: 5px 0; border-top: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text-2); }
  .risks li + li { border-top: 1px solid var(--border); }
  .risk-type { font-size: 11px; color: var(--text-3); font-weight: 550; font-family: var(--mono); }
  .risks button { margin-left: auto; min-height: 26px; padding: 2px 9px; font-size: 11.5px; }
  .audit { margin-top: 4px; padding: 4px 0 12px; border-top: 0; }
  .audit summary { font-size: 12px; font-weight: 500; color: var(--text-3); }
  .timeline { margin: 8px 0 0; padding-left: 0; list-style: none; font-size: 12.5px; }
  .timeline li { margin: 0; padding: 6px 0 6px 14px; border-left: 2px solid var(--border); position: relative; }
  .timeline li::before { content: ""; position: absolute; left: -5px; top: 12px; width: 8px; height: 8px; border-radius: 50%; background: var(--surface); border: 2px solid var(--accent); }
  .ts { font-family: var(--mono); color: var(--text-3); font-size: 11px; margin-right: 8px; }
  .archive-panel { margin-top: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; }
  .archive-panel p { color: var(--text-3); font-size: 12px; margin: 0 0 12px; }
  .archive-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
  .archive-meta { margin-top: 6px; font-size: 11px; color: var(--text-3); }
  .archived-card { opacity: .92; }
  .timeline-panel { margin-top: 16px; padding: 0; overflow: hidden; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .tl-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px 24px; flex-wrap: wrap; padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
  .tl-help { margin: 0; color: var(--text-3); font-size: 12px; max-width: 640px; }
  .tl-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 2px 0 0; padding: 0; list-style: none; font-size: 11.5px; color: var(--text-2); }
  .tl-legend li { display: inline-flex; align-items: center; gap: 5px; }
  .tl-key.seg { width: 22px; height: 8px; border-radius: 4px; background: var(--accent); opacity: .7; }
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
  .tl-corner { display: flex; align-items: flex-end; font-size: 11px; font-weight: 600; color: var(--text-3); letter-spacing: 0; z-index: 4; text-transform: none; }
  .tl-scale { position: relative; height: 46px; }
  .tl-months, .tl-weeks { position: absolute; left: 0; right: 0; height: 22px; }
  .tl-months { top: 2px; }
  .tl-weeks { top: 24px; }
  .tl-month { position: absolute; top: 3px; padding-left: 6px; font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; border-left: 1px solid var(--border-strong); line-height: 16px; }
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
  .tl-row .tl-label .cid { grid-row: 1 / 3; align-self: center; opacity: .7; }
  .tl-title { font-size: 12.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: left; }
  button.tl-title { border: 0; background: transparent; padding: 0; min-height: 0; border-radius: 3px; }
  button.tl-title:hover:not(:disabled) { background: transparent; color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .tl-sub { grid-column: 2; font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tl-group .tl-label { display: flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 600; color: var(--text-2); letter-spacing: 0; text-transform: none; padding-top: 12px; padding-bottom: 4px; }
  .tl-group { border-bottom: 1px solid var(--border); }
  .tl-track { position: relative; z-index: 1; }
  .tl-seg { position: absolute; top: 50%; height: 16px; margin-top: -8px; background: var(--accent); opacity: .28; border-radius: 3px; }
  .tl-seg + .tl-seg { border-left: 2px solid var(--surface); }
  .tl-seg.current { opacity: 1; height: 20px; margin-top: -10px; border-radius: 4px; box-shadow: var(--shadow-sm); background-image: linear-gradient(90deg, transparent calc(100% - 12px), rgb(255 255 255 / .28)); }
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
  .tl-undated h3 { margin: 0 0 2px; font-size: 12.5px; font-weight: 600; }
  .tl-undated p { margin: 0 0 8px; font-size: 11.5px; color: var(--text-3); }
  .tl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .tl-chip { display: inline-flex; gap: 6px; align-items: center; background: var(--surface); border: 1px dashed var(--border-strong); border-radius: 999px; padding: 2px 10px 2px 4px; font-size: 12px; }
  dialog { border: 1px solid var(--border); border-radius: var(--radius); width: min(560px, calc(100vw - 24px)); max-height: 90vh; padding: 24px 24px 20px; background: var(--surface); color: var(--text); box-shadow: var(--shadow-lg); }
  dialog::backdrop { background: rgb(16 18 24 / .45); backdrop-filter: blur(3px); }
  dialog h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; letter-spacing: -.01em; }
  dialog label { display: block; font-size: 12px; font-weight: 600; color: var(--text-2); margin-bottom: 14px; }
  dialog input, dialog select, dialog textarea { display: block; width: 100%; margin-top: 6px; font-weight: 400; color: var(--text); }
  dialog textarea { min-height: 72px; resize: vertical; }
  .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  #form-error, #log-form-error { color: var(--danger); font-size: 12px; }
  @media (min-width: 1600px) {
    .col { min-width: 240px; }
    .board { gap: 20px; padding: 10px 32px 24px; }
  }
  @media (max-width: 1100px) { .col { min-width: 200px; } }
  @media (max-width: 900px) { .col { flex: 0 0 auto; width: 240px; } .tl-grid { --label: 200px; } }
  @media (max-width: 600px) {
    .topbar, .toolbar { padding-left: 14px; padding-right: 14px; }
    .board { padding-left: 14px; padding-right: 14px; }
    .risks, .audit, .archive-panel, .timeline-panel, .board-gates { margin-left: 14px; margin-right: 14px; }
    .topbar h1 { font-size: 16px; }
    .col { width: 82vw; }
    .tl-grid { --label: 150px; }
  }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  @media print { .toolbar, .card-menu, .toolbar-more { display: none !important; } body { background: #fff; } }
</style>

</head>
<body>
<header class="topbar"><div class="heading"><h1>${esc(state.customer)} · Delivery Board</h1><span id="save-status" class="save-status" role="status" aria-live="polite">${esc(interactive ? strings.liveStatus : strings.readonlyStatus)}</span></div><div class="sub"><span>${esc(TEMPLATE_LABELS[state.template] ?? 'Custom Pipeline')}</span><span class="sep" aria-hidden="true">·</span><span id="summary-count">${esc(strings.activeCount(active))}</span></div></header>
<nav class="toolbar" aria-label="Board filters and actions"><input id="search" type="search" aria-label="${esc(strings.searchPlaceholder)}" placeholder="${esc(strings.searchPlaceholder)}"><select id="owner-filter" aria-label="${esc(strings.allOwners)}"><option value="">${esc(strings.allOwners)}</option></select><div class="seg" role="group" id="view-switch" aria-label="${esc(strings.viewsLabel)}"><button id="active-view" aria-pressed="true">${esc(strings.viewActive)}</button><button id="timeline-view" aria-pressed="false">${esc(strings.viewTimeline)}</button><button id="archive-view" aria-pressed="false">${esc(strings.viewArchive)}</button></div><span class="spacer"></span><button id="new-card" class="primary" data-live${interactive ? '' : ' disabled'}>${esc(strings.newCard)}</button><details class="toolbar-more"><summary aria-label="${esc(strings.moreMenu ?? 'More')}">⋯</summary><div class="toolbar-more-panel" role="menu"><button id="refresh" data-live${interactive ? '' : ' disabled'} role="menuitem">${esc(strings.refresh)}</button><button id="new-log" data-live${interactive ? '' : ' disabled'} role="menuitem">${esc(strings.newLog)}</button></div></details></nav>
<main><div id="board" class="board">${renderColumns(state, ui)}</div><div id="board-gates">${renderBoardGates(state, interactive, strings)}</div><section id="timeline" class="timeline-panel" aria-label="${esc(strings.viewTimeline)}" hidden></section><section id="archive" class="archive-panel" hidden></section>
<div id="risks">${renderRisks(state, interactive, strings)}</div>
<div id="activity">${renderActivity(state, strings)}</div></main>
<dialog id="card-dialog" aria-labelledby="dialog-title"><form id="card-form"><h2 id="dialog-title">Edit card</h2><label>Title<input name="title" required maxlength="500"></label><label>Owner<input name="owner" maxlength="200"></label><label>Due date<input name="due" type="date"></label><label>Stage<select name="stage" aria-label="Card stage"></select></label><label>Acceptance criteria (one per line)<textarea name="acceptance"></textarea></label><label>DoD (one per line)<textarea name="dod"></textarea></label><p id="form-error" role="alert"></p><div class="form-actions"><button type="button" id="cancel-edit">Cancel</button><button type="submit" id="submit-edit" class="primary">Save card</button></div></form></dialog>
<dialog id="log-dialog" aria-labelledby="log-dialog-title"><form id="log-form"><h2 id="log-dialog-title">Log risk / blocker</h2><label>Type<select name="type" aria-label="Log type"><option value="risk">risk</option><option value="blocker">blocker</option></select></label><label>Text<textarea name="text" required maxlength="2000"></textarea></label><label>Related card (optional)<select name="card_id" aria-label="Related card"><option value="">None</option></select></label><p id="log-form-error" role="alert"></p><div class="form-actions"><button type="button" id="cancel-log">Cancel</button><button type="submit" id="submit-log" class="primary">Save log</button></div></form></dialog>
<script>(() => { ${clientSource}\n(${boardClient.toString()})(${scriptJson(boot)}); })();</script>
</body>
</html>`
}
