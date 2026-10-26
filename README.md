# dsh-delivery-board

[English](README.md) · [中文](README.zh.md)

> **Codebase-native delivery context.**  
> Delivery state lives with the source: humans and models share one context.

From Plan through requirements, design, build, test, and go-live, if delivery state is not alongside the code, people and agents struggle to stay aligned: who owns what, what “done” means, and where work is stuck often live only in handoffs and verbal sync.

**dsh-delivery-board** is a skill-backed [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) plugin that writes the stage pipeline, handoff trail, and client weekly report into in-repo delivery state. The board, audit, and weekly report are projections of that same state — not a separate service.

The goal is clear: run the full delivery lifecycle from the codebase, so PMs, engineers, QA, and AI agents share one Source of Truth.

```bash
dsh plugin --profile web add github:jerryxff26-alt/dsh-delivery-board
```

Desktop app: install the same GitHub spec, `github:jerryxff26-alt/dsh-delivery-board`, from the plugin manager. (The CLI command above is the verified path; the desktop plugin-manager flow has not been separately verified.)

Tested with DSH **0.2.1-rc.2** (developer preview; also compatible with **0.2.0-rc.2**). No runtime dependencies. Declares `engines.dsh` for DSH 0.2.1+ compatibility checks.

## Demo

![Synthetic demo: pain → stage board → handoff audit → weekly HTML → install](docs/demo/demo.gif)

*~19s silent walkthrough of board/report views (English overlays · synthetic data), not a model-led planning recording. [MP4](docs/demo/demo.mp4) if you prefer download over the inline GIF.*

## Design principles

- **Delivery state is a first-class citizen** — stages, owners, acceptance criteria (AC), Definition of Done (DoD), handoffs, and blockers live in the repo and evolve with Git.
- **Views are projections** — the local board, handoff audit, client weekly report, and offline HTML are all projections of the same delivery state.
- **Operate through DSH** — advance stages, fill in AC, log blockers, and generate weekly reports with `/delivery` or plain language; you do not treat JSON as the day-to-day editing UI.
- **Clear boundaries** — this is not a rebuild of an enterprise project-management platform; it keeps in the codebase only the delivery context the current repo actually needs.

## What you get

- **Stage pipeline + cards** — each card has an owner, due date, acceptance criteria and Definition of Done (DoD). Stages can be added, renamed or removed after init (removing refuses while cards remain unless you migrate them).
- **Handoff audit trail** — moving a card to another stage records who handed what to whom, automatically.
- **Weekly report** — a Markdown client report: pipeline snapshot, **shipped this week** (arrived at the terminal stage or archived), handoffs, open risks, and **risks resolved this week**. Optional `next_week` notes appear as **Next bets** (omitted when empty).
- **Soft WIP limits** — optional per-stage `wipLimit` (Kanban-style). The board and move responses warn when a stage is over; moves are never blocked.
- **Local editable board** — ask `/delivery Open the editable board`; the tool serves a mouse drag-and-drop board on `127.0.0.1` that saves back to the same delivery state. Archive/restore, risk/blocker logging, and trackable gate checklists are available on the board. Accessibility fallback: Edit → Stage. Board chrome follows the browser locale (zh-CN when appropriate).
- **Offline HTML snapshot** — a single read-only file teammates without DSH can open.

![Full-width editable delivery board showing all governance stages Plan→Live with synthetic ACME cards](docs/screenshots/board.jpg)

<details>
<summary>Card editor and archive views</summary>

![Card editor showing title, owner, due date, stage, acceptance criteria and Definition of Done](docs/screenshots/card-editor.jpg)

![Archive view with preserved card details and restore-to-original-stage buttons](docs/screenshots/archive.jpg)

</details>

*Screenshots captured at a normal laptop viewport (~1440×900) from a synthetic ACME board: denser columns so Plan→Live fit without horizontal scroll when possible.*

## Usage

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
/delivery-admin init {"customer":"Demo","template":"governance"}
/delivery-admin card {"title":"API integration","stage":"build","owner":"Alice"}
/delivery-admin board
/delivery-admin open
/delivery-admin move c1 test
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
| `default` (ToB Delivery Pipeline) | Client Requirements → BA Analysis → TL Design → Development → Testing → DevSecOps Launch → Live | 1–2 per stage (e.g. acceptance criteria frozen, security scan passed) |
| `governance` (Governance Pipeline) | Plan → Analyze → Design → Build → Test → Deploy → Live | Quality / risk / security sign-offs (e.g. rollback plan ready) |

Fully custom stages are supported via the `stages` parameter. Gates are trackable checklists (persisted as gateDone); they do not hard-block card moves.

## Tools

| Tool | What it does |
|---|---|
| `delivery_init` | Initialize a project (customer + template or custom stages) |
| `delivery_card` | Add a card: title, stage, owner, due date, acceptance criteria, DoD |
| `delivery_move` | Move a card to another stage (records a handoff; owner can change). Same-stage owner changes are recorded as a decision, not a handoff |
| `delivery_board` | Quick text board; excludes archived cards unless requested |
| `delivery_open` | Editable local board URL (drag, create/edit, archive/restore) |
| `delivery_update` | Edit title, owner, due, acceptance and DoD without moving |
| `delivery_archive` | Hide a card without deleting data/history |
| `delivery_restore` | Return an archived card to its original stage |
| `delivery_board_html` | Read-only standalone HTML snapshot |
| `delivery_log` | Log progress / risk / blocker / decision |
| `delivery_resolve` | Mark an open risk/blocker log entry resolved by index |
| `delivery_gate` | Toggle/set a stage gate checklist item (trackable, not a hard blocker) |
| `delivery_stage_add` / `delivery_stage_update` / `delivery_stage_remove` | Evolve the pipeline after init (remove requires `migrate_to` if cards remain; stages accept optional soft `wip_limit`) |
| `delivery_weekly` | Client weekly report (Markdown): shipped / handoffs / open & resolved risks / next bets |

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
- Domain logic (`lib/delivery.js`) and the HTML renderer (`lib/board-html.js`) are pure functions; all writes go through `lib/store.js` and `ctx.fs`.
- Weekly reports cover seven local-calendar days starting at `week_start` (default: Monday of the current week). **Shipped** = handoffs into the terminal pipeline stage or archives in that window; open risks are listed; **Risks resolved this week** uses `resolvedAt` in the window. Pass `next_week` notes to include a **Next bets** section (omitted when empty).
- Stage gates are **trackable checklists** persisted on each stage (`gateDone`); they do **not** block card moves.
- Soft **WIP limits** (`wipLimit` / tool field `wip_limit`) are optional per stage; over-limit stages warn on the board and after moves, but never refuse a move.
- Pipeline stages can be added/updated/removed after init via tools or `/delivery-admin`. Removing a stage with cards requires `migrate_to`.
- User content in HTML is escaped (covered by tests).

## Practice notes (lightweight)

Drawn from delivery practices that fit an in-repo board without becoming a PM suite:

- **Kanban soft WIP** — set `wip_limit` on busy stages so overload is visible.
- **Weekly shipped / next bets** — Shape Up-flavored cadence: what landed, what burned down, what you are betting on next (still just Markdown + YAML/JSON state).

Proposed next (not in this release): card-level appetite (`small`/`medium`/`big`), Definition of Ready checklist beside DoD, Dual Track discovery↔delivery stage pairing.

## Roadmap

- Embed the editable board inside DSH instead of a local URL
- Enforced (hard) gate checklists that can block moves, multi-project rollup
- Fuller i18n for reports and tool messages (board chrome already follows browser locale)
- Optional card appetite / DoR fields (see Practice notes)

## Known limitations

- DSH is a developer preview. Compatibility: `engines.dsh >=0.2.0-rc.2 <0.3.0` (preferred by DSH 0.2.1+); peers `@deepseek-ai/dsh-tools >=0.2.0-rc.2 <0.3.0`, `@deepseek-ai/schemastery ~3.18.5` (host-provided, optional). Smoke-tested on 0.2.1-rc.2; previously verified on 0.2.0-rc.2.
- No Gantt scheduling, automatic bulk archive, hard move-blocking gates/WIP, or realtime multi-user sync.
- Drag/drop (and Edit → Stage fallback) are checked in a local browser harness; no full keyboard/mobile/WCAG claim.
- Gate checklists and WIP limits are trackable soft signals only; moving a card does not require gates to be checked or WIP to be under limit.

## License

[MIT](LICENSE) © 2026 jerryxff26-alt
