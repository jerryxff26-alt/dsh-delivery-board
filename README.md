# dsh-delivery-board

[English](README.md) · [中文](README.zh.md)

> **In-repo delivery board for humans and agents** — stages, handoffs, WIP, weekly report, and a local Timeline UI, all backed by one file in your git repo.

![Synthetic demo: stage board → drag handoff → calendar Timeline → dark mode → install](docs/demo/demo.gif)

*~22s silent walkthrough of the live board (v0.3.0 UI · English overlays · synthetic data). [MP4](docs/demo/demo.mp4) if you prefer download over the inline GIF.*

## 30-second quickstart

**Standalone (no DeepSeek Harness required):**

```bash
npx dsh-delivery-board init ACME lite
npx dsh-delivery-board card '{"title":"API integration","stage":"doing","owner":"Ada"}'
npx dsh-delivery-board open    # loopback board + Timeline; Ctrl+C to stop
npx dsh-delivery-board weekly
```

**As a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) plugin** (skill-backed `/delivery` workflow):

```bash
dsh plugin --profile web add github:jerryxff26-alt/dsh-delivery-board
```

Desktop app: install the same GitHub spec from the plugin manager. (CLI install above is the verified path; desktop plugin-manager flow has not been separately verified.) Tested with DSH **0.2.1-rc.2** (also compatible with **0.2.0-rc.2**). No runtime dependencies.

## Why it exists

From Plan through requirements, design, build, test, and go-live, if delivery state is not alongside the code, people and agents struggle to stay aligned: who owns what, what “done” means, and where work is stuck often live only in handoffs and verbal sync.

**dsh-delivery-board** writes the stage pipeline, handoff trail, and client weekly report into in-repo delivery state (`delivery.json` by default). The kanban board, calendar Timeline, audit log, and weekly Markdown report are projections of that same state — not a separate SaaS. PMs, engineers, QA, and AI agents share one Source of Truth that travels with the repo.

## Compared to alternatives

| Need | This project | Typical SaaS kanban | Markdown checklists alone |
| --- | --- | --- | --- |
| Lives in the git repo | Yes (`delivery.json`) | Usually a remote workspace | Yes, but no structured handoffs / WIP |
| Handoff audit + weekly client report | Built-in | Needs custom fields / exports | Manual |
| Local editable UI + Timeline | Loopback board | Full web app | No |
| Works with AI coding agents | DSH skill + tools; CLI for any agent/shell | Often via API / MCP | Prompt-only |
| Scope | Delivery context for one repo | Org-wide PM suite | Lightweight notes |

It is intentionally **not** a rebuild of Jira, Linear, or Notion — those are excellent for org-scale planning. This keeps only the delivery context the current repository actually needs, offline-friendly and reviewable in PRs.

If this saves your team a standup or a messy weekly paste, a [⭐ star](https://github.com/jerryxff26-alt/dsh-delivery-board) helps others find it — thank you.

## Design principles

- **Delivery state is a first-class citizen** — stages, owners, acceptance criteria (AC), Definition of Done (DoD), handoffs, and blockers live in the repo and evolve with Git.
- **Views are projections** — the local board, handoff audit, client weekly report, and offline HTML are all projections of the same delivery state.
- **Operate via CLI or DSH** — advance stages, fill in AC, log blockers, and generate weekly reports with `npx dsh-delivery-board …`, `/delivery`, or plain language; you do not treat JSON as the day-to-day editing UI.
- **Clear boundaries** — this is not a rebuild of an enterprise project-management platform; it keeps in the codebase only the delivery context the current repo actually needs.

## What you get

- **Stage pipeline + cards** — each card has an owner, due date, acceptance criteria and Definition of Done (DoD). Stages can be added, renamed or removed after init (removing refuses while cards remain unless you migrate them).
- **Handoff audit trail** — moving a card to another stage records who handed what to whom, automatically.
- **Weekly report** — a Markdown client report: pipeline snapshot, **shipped this week** (arrived at the terminal stage or archived), handoffs, open risks, and **risks resolved this week**. Optional `next_week` notes appear as **Next bets** (omitted when empty).
- **Soft WIP limits** — optional per-stage `wipLimit` (Kanban-style). The board and move responses warn when a stage is over; moves are never blocked.
- **Local editable board** — ask `/delivery Open the editable board`; the tool serves a mouse drag-and-drop board on `127.0.0.1` that saves back to the same delivery state. Archive/restore, risk/blocker logging, and trackable gate checklists are available on the board. Accessibility fallback: Edit → Stage. Board chrome follows the browser locale (zh-CN when appropriate).
- **Timeline view** — a calendar-axis Gantt of every card: bars follow real dates (created → each stage handoff → shipped / archived / today), with a today line, week and month gridlines, ◆ due markers (red when overdue), and a tray for cards with no dates yet. Same search and owner filters as the kanban; click a title to edit. Light and dark themes follow the OS.
- **Offline HTML snapshot** — a single read-only file teammates without DSH can open.

![Full-width editable delivery board showing the lite four-column pipeline with synthetic ACME cards](docs/screenshots/board.jpg)

![Timeline view: calendar-axis bars per card colored by stage, with today line, week/month gridlines, due and shipped markers](docs/screenshots/timeline.jpg)

<details>
<summary>Card editor, archive and dark-mode views</summary>

![Timeline view in dark mode with Chinese chrome](docs/screenshots/timeline-dark-zh.jpg)

![Card editor showing title, owner, due date, stage, acceptance criteria and Definition of Done](docs/screenshots/card-editor.jpg)

![Archive view with preserved card details and restore-to-original-stage buttons](docs/screenshots/archive.jpg)

</details>

*Screenshots captured at a normal laptop viewport (~1440×900) from a synthetic ACME **lite** board (Backlog → Doing → Review → Live) so the README shows the quiet general-purpose UI.*

## Standalone CLI

Same domain as the plugin (stages, handoffs, soft WIP, weekly report, local board + Timeline). State file defaults to `delivery.json` in the current directory (`--cwd` / `--file` to override).

```bash
npx dsh-delivery-board help
npx dsh-delivery-board init Demo lite
npx dsh-delivery-board board
npx dsh-delivery-board open
npx dsh-delivery-board weekly 2026-10-20
npx dsh-delivery-board html
```

Command shape matches `/delivery-admin` in the DSH plugin. `open` keeps the process alive until Ctrl+C.

## Usage

### Primary path (usual four steps)

1. **Initialize** — `lite` template (or `/delivery Initialize a lite board for ACME`)
2. **Create a card** — outcome + stage (CLI `card` / `/delivery Add a card…`)
3. **Hand off** — move across stages (`move` / `/delivery Hand off…`); open the local board when you want drag-and-drop
4. **Weekly / open** — `weekly` for the client report, `open` for the live board

`/delivery` = model-led skill (normal day-to-day). `/delivery-admin` = deterministic, no-model escape hatch. Prefer `/delivery` unless you need a scriptable command.

**Quiet board / ready for daily use (v0.3.0):** Polish-freeze. Touch gets a quiet always-visible ⋯ overlay (`hover: none` only); desktop stays hover. Timeline + Archive + editor share the same near-black / 8px / hairline language. Archive cards match active chrome (title+meta; Restore in ⋯). Handoff audit logs **only actual stage moves** (A→C is one line; intentional skips are not logged as intermediate hops).

**Title+meta cards (v0.2.7):** Kanban cards at rest show only title and meta (owner/due/blocked) — no reserved ID/drag/⋯ strip. The ⋯ menu is an absolute hover/focus overlay. Cursor grab is the drag affordance; IDs stay in aria/edit/copy. Touch screenshots stay clean (no forced chrome). Zero CDN fonts / no new deps.

**Quiet premium UI (v0.2.6):** Near-black Linear-like primary (no SaaS purple), flatter 8px hairline cards, Active/Timeline/Archive segments without counts, quiet Saved status, short subtitle (template · N cards), blocked as meta/left hairline, Risks collapsed by default.

**Calmer board UI (v0.2.4):** softer palette, thin muted stage accents, roomier cards, AC/DoD as quiet chips, Edit/Archive/Copy behind a ⋯ menu.

**Less friction (v0.2.3):** stages/cards accept **id or name/title** (case-insensitive, unique; errors list candidates). Positional CLI works: `init ACME lite`, `card API doing Ada`, `move API review`. Board gates & audit start collapsed; open risks stay visible.

### Model-led skill (normal workflow)

The plugin bundles and registers a **`delivery` skill**. Type `/delivery` followed by the outcome you want; DSH loads its instructions into the model instead of parsing a direct command. No separate skill copy/install is needed. Plain-language requests can also discover the skill through DSH's skill catalog.

```text
/delivery Review this repository and propose a delivery plan for ACME from its requirements and tests.
/delivery Create the cards from the approved plan; leave unknown owners and dates unset.
/delivery Hand off the API integration card to Test, assign Morgan, and summarize the available evidence.
/delivery Open the editable board.
/delivery Prepare the client weekly report for the week starting 2026-10-05.
```

The skill reads relevant repository context, identifies gaps, and generates stages, card content, acceptance criteria and DoD. It proposes a substantial plan before bulk creation. The existing `delivery_*` tools then validate inputs, save state, record handoffs and render views. **The model reasons; the tools persist.** `delivery_init` itself still creates an empty project deterministically; the skill orchestrates card creation after plan approval.

This is a **skill backed by the existing plugin**, not a prompt that edits JSON directly. The JSON schema, board UI and model-facing tool names are unchanged. Project-local skills can override the packaged skill using DSH's normal skill precedence.

### Advanced direct controls (no model call)

The former native `/delivery` command is now **`/delivery-admin`**, so it cannot intercept skill prompts. Existing direct command examples or scripts must change their prefix; delivery data does not need migration.

<details>
<summary>Show deterministic command syntax</summary>

```text
/delivery-admin help
/delivery-admin init Demo lite
/delivery-admin card "API integration" doing Alice
/delivery-admin board
/delivery-admin open
/delivery-admin move "API integration" review
/delivery-admin update {"card_id":"c1","owner":"Bob","due":"2026-10-20"}
/delivery-admin archive c1
/delivery-admin restore c1
/delivery-admin weekly 2026-10-05
/delivery-admin html
```

`board --archived` includes archived cards. `init`, `card`, `update` and `log` take JSON objects; `move` also accepts JSON for owner changes and handoff notes. These advanced commands still delegate to the same validated tools.

</details>

For linked desktop development, fully quit and reopen DSH after updating the plugin. It needs DSH's `skills` service and `tool-skill` loader (supported by the tested 0.2.1-rc.2 runtime). Confirm the plugin shows **Running**. `/delivery <request>` is handled as a skill; `/delivery-admin` uses the direct command handler.

## Pipeline templates

| Template | Stages | Gates |
|---|---|---|
| **`lite` (Lite Pipeline)** — recommended quickstart | Backlog → Doing → Review → Live | None |
| `default` (ToB Delivery Pipeline) | Client Requirements → BA Analysis → TL Design → Development → Testing → DevSecOps Launch → Live | 1–2 per stage (e.g. acceptance criteria frozen, security scan passed) |
| `governance` (Governance Pipeline) | Plan → Analyze → Design → Build → Test → Deploy → Live | Quality / risk / security sign-offs (e.g. rollback plan ready) |

Fully custom stages are supported via the `stages` parameter. Gates are trackable checklists (persisted as gateDone); they do not hard-block card moves. Prefer `lite` unless you need the longer ToB or governance pipelines.

## Tools

**Daily loop** (prefer these):

| Tool | What it does |
|---|---|
| `delivery_init` | Initialize a project (prefer `lite`; or `default` / `governance` / custom stages) |
| `delivery_card` | Add a card: title, stage, owner, due date, acceptance criteria, DoD |
| `delivery_move` | Move a card to another stage (records a handoff; owner can change). Same-stage owner changes are recorded as a decision, not a handoff |
| `delivery_board` | Quick text board; excludes archived cards unless requested |
| `delivery_open` | Editable local board URL (drag, create/edit) |
| `delivery_update` | Edit title, owner, due, acceptance and DoD without moving |
| `delivery_log` | Log progress / risk / blocker / decision |
| `delivery_weekly` | Client weekly report (Markdown): shipped / handoffs / open & resolved risks / next bets |

**Advanced** (still registered; use when you explicitly need them):

| Tool | What it does |
|---|---|
| `delivery_archive` / `delivery_restore` | Hide a card without deleting history / return it to its original stage |
| `delivery_board_html` | Read-only standalone HTML snapshot |
| `delivery_resolve` | Mark an open risk/blocker log entry resolved by index |
| `delivery_gate` | Toggle/set a stage gate checklist item (trackable, not a hard blocker) |
| `delivery_stage_add` / `delivery_stage_update` / `delivery_stage_remove` | Evolve the pipeline after init (remove requires `migrate_to` if cards remain; stages accept optional soft `wip_limit`) |

## Editable local board vs offline HTML

- `delivery_open` (via the skill, or `/delivery-admin open`) returns a URL. **Drag cards** between stage columns to move them (primary UX); use **Edit → Stage** as the accessibility fallback. Create/edit cards, archive/restore. Saves go to the same in-repo delivery state and audit history.
- The live server starts on demand, binds only to `127.0.0.1` on an ephemeral port and uses an unguessable capability path. Treat the URL as private to your machine; it expires when the plugin unloads or DSH exits.
- If another tab, command or external edit changes the state file, a stale page cannot silently overwrite it: press **Refresh** and retry (conflict protection, not live sync).
- `/delivery-admin html` writes a read-only `.html`/`.htm` file with search, owner filter and archive view; it cannot overwrite the data file.

## Team collaboration

Commit `delivery.json` (the on-disk delivery state) to the team's shared git repo; `git pull`/`push` is the sync. Concurrent edits still need normal Git conflict review. Each stage renders up to 30 cards initially with **Load more**; search and owner filters cover the whole file.

## Development

```bash
npm install
npm run check
npm test               # domain, HTML, commands, storage, HTTP, plugin and skill tests (real SDK from npm)
npm run test:desktop   # optional: plugin tests plus real skill registry/loader/routing tests from the installed macOS SDK
```

Local desktop development (macOS, tested with DSH 0.2.1-rc.2):

```bash
DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH_CLI" plugin --profile desktop add "link:$PWD" --offline --ignore-scripts
```

Fully quit and reopen DSH after installing or changing a linked plugin, then check **Plugins → dsh-delivery-board** shows **Running**. `--dump-config` works for CLI-managed profiles such as `web`, not for the desktop profile. Set `DSH_DESKTOP_APP` if the app lives elsewhere.

Implementation notes:

- Plugin contract `name / inject / Config / apply`; tools via `defineTool`; the bundled `skills/delivery/SKILL.md` is registered through `ctx.skills.register`. Tool output renderers return `ContentBlock[]`.
- Domain logic (`lib/delivery.js`) and the HTML renderer (`lib/board-html.js`) are pure functions; all writes go through `lib/store.js`. The DSH plugin uses `ctx.fs`; the standalone CLI uses `lib/node-fs.js` + `lib/standalone.js` with the same store contract.
- Weekly reports cover seven local-calendar days starting at `week_start` (default: Monday of the current week). **Shipped** = handoffs into the terminal pipeline stage or archives in that window; open risks are listed; **Risks resolved this week** uses `resolvedAt` in the window. Pass `next_week` notes to include a **Next bets** section (omitted when empty).
- Stage gates are **trackable checklists** persisted on each stage (`gateDone`); they do **not** block card moves.
- Soft **WIP limits** (`wipLimit` / tool field `wip_limit`) are optional per stage; over-limit stages warn on the board and after moves, but never refuse a move.
- Pipeline stages can be added/updated/removed after init via tools or `/delivery-admin`. Removing a stage with cards requires `migrate_to`.
- User content in HTML is escaped (covered by tests).

## Practice notes (lightweight)

Drawn from delivery practices that fit an in-repo board without becoming a PM suite:

- **Kanban soft WIP** — set `wip_limit` on busy stages so overload is visible.
- **Weekly shipped / next bets** — Shape Up-flavored cadence: what landed, what burned down, what you are betting on next (still just Markdown + YAML/JSON state).

## Won't build

Hard product boundary — this stays a local, in-repo delivery board:

- Hard-blocking gates or hard WIP (no process engine)
- Multi-project / multi-workspace rollup or org portfolio
- Cloud notifications, email/IM push, accounts, or SSO
- Custom-field sprawl / multiple issue-type systems
- Dual Track discovery↔delivery modules, DoR, or appetite as productized methodology packs
- Realtime multi-user CRDT sync, Gantt resource loading, burn-down suites
- Promoting every admin subcommand into a first-class agent tool

## Possible later (not promises)

- Embed the editable board inside DSH (standalone CLI already ships)
- Fuller i18n for reports and tool messages (board chrome already follows browser locale)

## Known limitations

- **Standalone CLI** needs only Node ≥20 (`npx dsh-delivery-board`). The DSH plugin path is a developer preview: `engines.dsh >=0.2.0-rc.2 <0.3.0`; peers `@deepseek-ai/dsh-tools >=0.2.0-rc.2 <0.3.0`, `@deepseek-ai/schemastery ~3.18.5` (host-provided, optional). Smoke-tested on DSH 0.2.1-rc.2; previously verified on 0.2.0-rc.2.
- No Gantt scheduling, automatic bulk archive, hard move-blocking gates/WIP, or realtime multi-user sync.
- Drag/drop (and Edit → Stage fallback) are checked in a local browser harness; no full keyboard/mobile/WCAG claim.
- Gate checklists and WIP limits are trackable soft signals only; moving a card does not require gates to be checked or WIP to be under limit.
- Empty columns and uninitialized projects point at **one** next step (`init` / `delivery_init` / `/delivery …`, or **New card** on the board).

## License

[MIT](LICENSE) © 2026 jerryxff26-alt
