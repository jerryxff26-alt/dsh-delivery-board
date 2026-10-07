# dsh-delivery-board

**delivery board** · DeepSeek Harness plugin.

dsh-delivery-board gives ToB delivery teams **a shared delivery board**: role pipeline + card flow + handoff audit + visual board.

## Usage (direct commands or plain language)

```bash
dsh plugin --profile web add dsh-delivery-board   # install (once published to npm)
dsh --profile web --dump-config                    # verify the plugin row is mounted
```

For routine operations, type `/delivery` in DSH's input to find the native command. The slash command is **`/delivery`**, not `/delivery_board`; `delivery_board` is the model-facing tool name. Direct commands use the same validated tools without creating model messages.

```text
/delivery help
/delivery init {"customer":"Demo","template":"governance"}
/delivery card {"title":"API integration","stage":"build","owner":"Alice"}
/delivery board
/delivery open
/delivery move c1 test
/delivery update {"card_id":"c1","owner":"Bob","due":"2026-10-20"}
/delivery archive c1
/delivery restore c1
/delivery weekly 2026-10-05
/delivery html
```

Use `/delivery board --archived` to include archives in text output. `init`, `card`, `update` and `log` accept JSON objects; `move` also accepts JSON for owner changes and handoff notes.

Plain language remains useful for planning and drafting content:

- "Set up a delivery project for ACME with the governance template" → `delivery_init`
- "Add a card in Analyze: SSO login, acceptance criteria: SSO supported, owner: wang" → `delivery_card`
- "Hand off c1 to Design, new owner: qiang" → `delivery_move` (records a handoff audit log automatically)
- "Show the delivery board" → `delivery_board` (quick text view)
- "Open the editable board" → `delivery_open` (returns a local interactive URL)
- "Generate the HTML board" → `delivery_board_html` (read-only offline snapshot)
- "Generate the client weekly report" → `delivery_weekly`

`delivery_init` itself does not call a model. It copies a template or accepts model/user-supplied custom `stages`, validates the input and creates an empty project. Cards are added separately. The plugin supplies tool-use guidance to DSH's system prompt, not a dedicated PRD-to-plan generation workflow.

## Local desktop development

For the installed macOS desktop app (tested with **DSH 0.2.0-rc.2**):

```bash
DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH_CLI" plugin --profile desktop add "link:$PWD" --offline --ignore-scripts
```

Fully quit and reopen DSH after installing the local plugin **and after changing its source**. Refreshing the plugin list alone did not activate newly linked code in the tested desktop version. In **Plugins → dsh-delivery-board**, verify the component is **Running**, not just enabled. Use a separate workspace for smoke-test data.

`--dump-config` applies to CLI-managed profiles such as `web`; the Electron-managed `desktop` profile rejects it. Use the desktop plugin panel to verify that profile.

## Pipeline templates

| Template | Stages | Gates |
|---|---|---|
| `default` (ToB Delivery Pipeline) | Client Requirements → BA Analysis → TL Design → Development → Testing → DevSecOps Launch → Live | 1–2 per stage (e.g. acceptance criteria frozen, security scan passed) |
| `governance` (Governance Pipeline) | Plan → Analyze → Design → Build → Test → Deploy → Live | Governance / quality / risk / security focused (e.g. rollback plan ready) |

Fully custom stages are supported via the `stages` parameter. Gates are display-only in v1 (human-confirmed); enforced gates are on the roadmap.

## Editable local board vs offline HTML

- `/delivery open`: open the **returned URL** in a browser. Drag cards between stages, use the stage dropdown as an alternative, create/edit cards, and archive/restore them. A successful save updates the same workspace JSON and the relevant audit history.
- `/delivery html`: export a standalone **read-only** HTML file. Search, owner filtering, archive viewing and copying handoff commands work offline; opening a file directly does not grant filesystem write access. Output must use `.html` or `.htm` and cannot resolve to the metadata file.
- The live service starts on demand, binds only to `127.0.0.1` on an ephemeral port, and exposes an unguessable capability path. The URL grants access to this board on this machine: do not distribute it as a team/shared URL. It expires when the plugin unloads or DSH exits; open the board again to get a fresh URL.
- The capability is pinned to the workspace and data filename used at opening. It serves no arbitrary files and accepts card actions, not whole-document replacement.
- The page reports saving/saved/failed. If another tab, command or external edit changes the JSON, an old page cannot silently overwrite it: select **刷新** and retry. This is conflict protection, not automatic merge or live push synchronization.

## Archival and growing boards

Archive hides a card from active columns without deleting its ID, original stage, metadata or history. Restore returns it to that stage. Archived cards must be restored before editing or moving. Both archive and restore are idempotent; only actual changes add audit entries.

Metadata stays at version 3 with an optional `archivedAt` timestamp; missing or null means active. New card IDs are allocated above existing and historical IDs, including archived cards. Archive does not resolve a blocker or risk.

Each stage and the archive list initially renders up to **30 cards**, with **加载更多**. Search by ID/title/owner and filter by owner across the entire current JSON, not just the first page. The latest 20 handoff/decision events are displayed, while all events remain in JSON. This bounds initial DOM work, not data size: the entire JSON is still read and retained, so there is no unlimited-scale guarantee. Automatic bulk archiving and a separate historical datastore are deferred.

## Team collaboration

`delivery.json` lives in the team's shared git repo (offline-friendly) — `git pull/push` is the sync. The read-only HTML snapshot is a single self-contained file, so teammates without DSH can view it too. The live loopback URL is machine-local and is not team synchronization. Concurrent Git changes still require normal conflict review and merge.

## Tools

| Tool | What it does |
|---|---|
| `delivery_init` | Initialize a project (customer + template/custom stages) |
| `delivery_card` | Add a card: title, stage, owner, due date, acceptance criteria, DoD |
| `delivery_move` | Hand a card across stages (auto audit log, owner can change) |
| `delivery_board` | Quick text board; excludes archived cards unless requested |
| `delivery_open` | Editable local board URL (drag, create/edit, archive/restore) |
| `delivery_update` | Edit title, owner, due, acceptance and DoD without moving |
| `delivery_archive` | Hide a card without deleting data/history |
| `delivery_restore` | Return an archived card to its original stage |
| `delivery_board_html` | Read-only standalone HTML snapshot with filters and handoff commands |
| `delivery_log` | Updates: progress / risk / blocker / decision |
| `delivery_weekly` | Client weekly report (Markdown) |

## Development

```bash
npm run check
npm test                 # domain, HTML, commands, storage and HTTP/lifecycle fixtures
npm run test:desktop     # real SDK from the installed macOS desktop app
```

`test:desktop` uses the installed app's Electron runtime and real `defineTool`; filesystem and prompt services are test fixtures. It does not install or copy SDK packages, read credentials, or start the desktop UI. For a non-default app location, set `DSH_DESKTOP_APP` to its `.app` directory. This complements, rather than replaces, the desktop UI smoke test.

Desktop smoke test: in an empty test workspace, run `/delivery help`, initialize with `/delivery init {...}`, add a card and use `/delivery open`. Move/edit/archive/restore in the returned board and inspect the actual JSON plus native command results. Model-facing smoke test: call `delivery_board` (expected initialization error), then `delivery_init` → `delivery_card` → `delivery_move` → `delivery_log` → `delivery_board` → `delivery_board_html` → `delivery_weekly`. Verify the saved JSON, stage/owner changes, handoff audit and generated HTML. Repeat initialization and invalid-stage moves must fail without changing state.

## Implementation notes

- Plugin contract `name / inject / Config / apply`, tools via `defineTool` — per the official docs and the community tested guide.
- Domain logic (`lib/delivery.js`) and the HTML renderer (`lib/board-html.js`) are pure functions, decoupled from dsh.
- DSH v0.2 tool output renderers return `ContentBlock[]`, e.g. `[{ type: "text", text: value.text }]`; a string causes `content.some is not a function` after execution.
- All metadata mutations go through `lib/store.js`; HTML exports resolve and compare canonical targets before writing through `ctx.fs`. The write contract is `writeText(target, content, expected?, signal?)`; cancellation belongs in the fourth argument.
- Weekly handoffs cover seven local-calendar days: `week_start` selects the inclusive first date (`YYYY-MM-DD`); omission uses Monday of the current week. `week_label` changes only the title. Pipeline counts are the current snapshot; risks/blockers remain cumulative because v1 has no resolution status.
- The HTML renderer escapes user content (XSS-safe), covered by tests.

## Roadmap

- phase 2: embed the existing editable board into DSH, rather than opening its local URL
- later: enforced gate checklists, multi-project rollup views
- later: i18n — multilingual UI (board, reports, tool messages)

## Known limitations

- DSH is developer preview. SDK peers are pinned to the tested `@deepseek-ai/dsh-tools@0.2.0-rc.2` and `@deepseek-ai/schemastery@~3.18.4`; re-run the SDK and desktop smoke tests before updating the runtime.
- No Gantt scheduling, Jira/Trello API integration, automatic bulk archive, enforced workflow gates or realtime multi-user synchronization.
- Browser drag/drop and accessible dropdown controls were checked in the local regression harness; this is not a full keyboard, mobile or WCAG compliance claim.
- Validation and evidence scope: see [2026-10-07 interaction-upgrade report](docs/interaction-upgrade-2026-10-07.md). Real SDK tests and a browser fixture do not replace an actual DSH desktop command-dispatch check.

## License

MIT
