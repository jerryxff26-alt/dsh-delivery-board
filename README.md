# dsh-delivery-board

**delivery board** · DeepSeek Harness plugin.

BMAD-style skills solve "one person directing a swarm of agents"; dsh-delivery-board solves "**a whole team looking at the same delivery board**": role pipeline + card flow + handoff audit + visual board.

## Usage (plain language is enough)

```bash
dsh plugin --profile web add dsh-delivery-board   # install (once published to npm)
dsh --profile web --dump-config                    # verify the plugin row is mounted
```

- "Set up a delivery project for ACME with the governance template" → `delivery_init`
- "Add a card in Analyze: SSO login, acceptance criteria: SSO supported, owner: wang" → `delivery_card`
- "Hand off c1 to Design, new owner: qiang" → `delivery_move` (records a handoff audit log automatically)
- "Show the delivery board" → `delivery_board` (quick text view)
- "Generate the HTML board" → `delivery_board_html` (pretty Trello-style page — open in a browser, share with the team)
- "Generate the client weekly report" → `delivery_weekly`

## Pipeline templates

| Template | Stages | Gates |
|---|---|---|
| `default` (ToB Delivery Pipeline) | Client Requirements → BA Analysis → TL Design → Development → Testing → DevSecOps Launch → Live | 1–2 per stage (e.g. acceptance criteria frozen, security scan passed) |
| `governance` (Governance Pipeline) | Plan → Analyze → Design → Build → Test → Deploy → Live | Governance / quality / risk / security focused (e.g. rollback plan ready) |

Fully custom stages are supported via the `stages` parameter. Gates are display-only in v1 (human-confirmed); enforced gates are on the roadmap.

## Team collaboration

`delivery.json` lives in the team's shared git repo (offline-friendly) — `git pull/push` is the sync. The HTML board is a single self-contained file, so teammates without dsh can view it too.

## Tools

| Tool | What it does |
|---|---|
| `delivery_init` | Initialize a project (customer + template/custom stages) |
| `delivery_card` | Add a card: title, stage, owner, due date, acceptance criteria, DoD |
| `delivery_move` | Hand a card across stages (auto audit log, owner can change) |
| `delivery_board` | Quick text board |
| `delivery_board_html` | Pretty standalone HTML kanban (with copy-handoff-command buttons) |
| `delivery_log` | Updates: progress / risk / blocker / decision |
| `delivery_weekly` | Client weekly report (Markdown) |

## Development

```bash
node --test test/delivery.test.mjs test/board-html.test.mjs
node --check index.js && node --check lib/*.js
```

Smoke test (needs dsh v0.2): after `dsh plugin add`, call `delivery_init` → `delivery_card` → `delivery_move` → `delivery_board_html` in a session, then open the generated HTML in a browser to check the styling.

## Implementation notes

- Plugin contract `name / inject / Config / apply`, tools via `defineTool` — per the official docs and the community tested guide.
- Domain logic (`lib/delivery.js`) and the HTML renderer (`lib/board-html.js`) are pure functions, decoupled from dsh.
- All `ctx.fs` touchpoints are isolated in `lib/store.js` — the only file to change when dsh ships breaking changes.
- The HTML renderer escapes user content (XSS-safe), covered by tests.

## Roadmap

- phase 2: client plugin — draggable kanban embedded in the dsh Web UI / desktop app
- later: enforced gate checklists, multi-project rollup views
- later: i18n — multilingual UI (board, reports, tool messages)

## Known limitations

- dsh v0.2 just shipped and is still developer preview: pin the `@deepseek-ai/*` peer versions after the first smoke test.
- No Gantt scheduling (Luke-Yong already built one), no realtime multi-user sync (dsh is single-machine by architecture).

## License

MIT
