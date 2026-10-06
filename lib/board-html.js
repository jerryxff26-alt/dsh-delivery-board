// dsh-delivery-board HTML board renderer — pure function, outputs a self-contained
// HTML page (no external assets, viewable offline).
// Trello-style stage columns + stage colors + gate chips + risk section + handoff audit timeline.
// The board renders delivery.json: card moves happen back in the dsh session;
// each card has a button that copies the corresponding dsh command.

const PALETTE = ['#4f8ff7', '#9b6bf3', '#f5a623', '#22b07d', '#f25c5c', '#00b8d4', '#8a9ba8']

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TEMPLATE_LABELS = { default: 'ToB Delivery Pipeline', governance: 'Governance Pipeline', custom: 'Custom Pipeline' }

export function renderBoardHtml(state) {
  const today = todayStr()
  const total = state.cards.length
  const risks = state.logs.filter((l) => l.type === 'risk' || l.type === 'blocker')
  const handoffs = state.logs.filter((l) => l.type === 'handoff').slice(-20).reverse()

  const columns = state.pipeline
    .map((stage, si) => {
      const color = PALETTE[si % PALETTE.length]
      const cards = state.cards.filter((c) => c.stage === stage.id)
      const next = state.pipeline[si + 1]
      const cardsHtml = cards.length
        ? cards
            .map((c) => {
              const overdue = c.due && c.due < today
              const cmd = next
                ? `Please hand off card ${c.id} "${c.title}" to ${next.name}`
                : `Card ${c.id} is already in the final stage`
              return `<div class="card">
                <div class="card-title">${esc(c.title)}</div>
                <div class="card-meta">
                  <span class="cid">${esc(c.id)}</span>
                  ${c.owner ? `<span class="owner">@${esc(c.owner)}</span>` : ''}
                  ${c.due ? `<span class="due${overdue ? ' overdue' : ''}">${overdue ? '⚠ overdue · ' : ''}due ${esc(c.due)}</span>` : ''}
                </div>
                ${c.acceptance.length ? `<details><summary>Acceptance criteria (${c.acceptance.length})</summary><ul>${c.acceptance.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
                ${c.dod.length ? `<details><summary>DoD (${c.dod.length})</summary><ul>${c.dod.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
                ${next ? `<button class="copybtn" data-cmd="${esc(cmd)}">Copy handoff command</button>` : ''}
              </div>`
            })
            .join('')
        : `<div class="empty">(empty)</div>`
      return `<section class="col">
        <header style="border-top-color:${color}">
          <div class="col-name">${esc(stage.name)} <span class="count">${cards.length}</span></div>
          ${stage.role && stage.role !== '—' ? `<div class="col-role">${esc(stage.role)}</div>` : ''}
          ${stage.gates.length ? `<div class="gates">${stage.gates.map((g) => `<span class="gate">gate · ${esc(g)}</span>`).join('')}</div>` : ''}
        </header>
        <div class="col-body">${cardsHtml}</div>
      </section>`
    })
    .join('')

  const riskHtml = risks.length
    ? `<section class="risks"><h2>⚠ Open risks / blockers (${risks.length})</h2><ul>${risks.slice(-8).map((r) => `<li><b>[${esc(r.type)}]</b> ${esc(r.text)}</li>`).join('')}</ul></section>`
    : ''

  const auditHtml = handoffs.length
    ? `<section class="audit"><h2>Handoff audit trail (latest ${handoffs.length})</h2><ul class="timeline">${handoffs.map((h) => `<li><span class="ts">${esc(h.ts.slice(0, 16).replace('T', ' '))}</span> ${esc(h.text)}</li>`).join('')}</ul></section>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(state.customer)} · Delivery Board</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f1f3f5; color: #222; }
  .topbar { background: #1a1d21; color: #fff; padding: 18px 28px; }
  .topbar h1 { margin: 0; font-size: 22px; }
  .topbar .sub { margin-top: 6px; font-size: 13px; color: #aab2bd; }
  .board { display: flex; gap: 14px; padding: 20px 28px; overflow-x: auto; align-items: flex-start; }
  .col { background: #e9ecef; border-radius: 12px; min-width: 270px; max-width: 320px; flex: 1; }
  .col header { background: #fff; border-top: 4px solid #888; border-radius: 12px 12px 0 0; padding: 12px 14px; }
  .col-name { font-weight: 700; font-size: 15px; }
  .count { background: #dee2e6; border-radius: 10px; padding: 1px 9px; font-size: 12px; margin-left: 6px; }
  .col-role { font-size: 12px; color: #868e96; margin-top: 3px; }
  .gates { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 5px; }
  .gate { font-size: 11px; background: #fff3bf; border: 1px solid #ffd43b; color: #7a5b00; border-radius: 8px; padding: 2px 8px; }
  .col-body { padding: 10px; display: flex; flex-direction: column; gap: 10px; max-height: 62vh; overflow-y: auto; }
  .card { background: #fff; border-radius: 10px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); border-left: 4px solid #4f8ff7; }
  .card-title { font-weight: 600; font-size: 14px; margin-bottom: 8px; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; color: #666; margin-bottom: 6px; }
  .cid { background: #f1f3f5; border-radius: 6px; padding: 1px 7px; font-family: monospace; }
  .owner { color: #1971c2; }
  .due.overdue { color: #e03131; font-weight: 700; }
  details { font-size: 12px; color: #495057; margin: 4px 0; }
  details ul { margin: 4px 0 4px 16px; padding: 0; }
  summary { cursor: pointer; color: #1971c2; }
  .copybtn { margin-top: 8px; font-size: 12px; border: 1px solid #4f8ff7; color: #4f8ff7; background: #fff; border-radius: 8px; padding: 5px 10px; cursor: pointer; }
  .copybtn:hover { background: #4f8ff7; color: #fff; }
  .copybtn.done { background: #22b07d; border-color: #22b07d; color: #fff; }
  .empty { color: #adb5bd; font-size: 13px; text-align: center; padding: 18px 0; }
  .risks, .audit { margin: 0 28px 20px; background: #fff; border-radius: 12px; padding: 16px 20px; }
  .risks { border-left: 5px solid #f25c5c; }
  .risks h2, .audit h2 { margin: 0 0 10px; font-size: 16px; }
  .risks ul, .audit ul { margin: 0; padding-left: 18px; font-size: 13px; }
  .risks li, .audit li { margin: 5px 0; }
  .ts { color: #868e96; font-family: monospace; font-size: 12px; margin-right: 6px; }
  footer { padding: 0 28px 28px; font-size: 12px; color: #868e96; }
</style>
</head>
<body>
  <div class="topbar">
    <h1>${esc(state.customer)} · Delivery Board</h1>
    <div class="sub">${esc(TEMPLATE_LABELS[state.template] || state.template)} | ${total} card(s) | generated ${esc(state.updatedAt.slice(0, 16).replace('T', ' '))}</div>
  </div>
  <div class="board">${columns}</div>
  ${riskHtml}
  ${auditHtml}
  <footer>This board is rendered from delivery.json by dsh-delivery-board. Move cards back in your dsh session (use the "Copy handoff command" button on a card). Keep the data file in the team's shared git repo.</footer>
<script>
document.querySelectorAll('.copybtn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const text = btn.getAttribute('data-cmd');
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    btn.textContent = 'Copied ✓'; btn.classList.add('done');
    setTimeout(() => { btn.textContent = 'Copy handoff command'; btn.classList.remove('done'); }, 1600);
  });
});
</script>
</body>
</html>`
}
