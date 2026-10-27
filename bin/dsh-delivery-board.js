#!/usr/bin/env node
// Standalone CLI: stages, handoffs, WIP, weekly report, Timeline board — no DSH required.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStandaloneSession, parseDeliveryCommand, commandHelp } from '../lib/standalone.js'

const usage = `dsh-delivery-board — codebase-native delivery board (standalone)

Usage:
  npx dsh-delivery-board <command> [args...]
  npx dsh-delivery-board --cwd <dir> --file delivery.json <command> ...

Commands (same shape as /delivery-admin in the DSH plugin):
  help
  init {"customer":"ACME","template":"governance"}
  card {"title":"API","stage":"build","owner":"Alice"}
  board [--archived]
  open                          # local editable board (Ctrl+C to stop)
  move <card_id> <stage_id>
  update {"card_id":"c1","owner":"Bob"}
  archive <card_id> | restore <card_id>
  log {"type":"blocker","text":"..."}
  resolve <log_index>
  gate <stage_id> <gate_index> [true|false]
  stage_add|stage_update|stage_remove {...}
  weekly [YYYY-MM-DD] | {"week_start":"...","next_week":"..."}
  html

Also works as a DSH plugin:
  dsh plugin --profile web add github:jerryxff26-alt/dsh-delivery-board
`

function parseFlags(argv) {
  const out = { cwd: process.cwd(), fileName: 'delivery.json', boardFile: 'delivery-board.html', rest: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--cwd' || arg === '-C') { out.cwd = path.resolve(argv[++i] ?? ''); continue }
    if (arg === '--file' || arg === '-f') { out.fileName = argv[++i] ?? out.fileName; continue }
    if (arg === '--board-file') { out.boardFile = argv[++i] ?? out.boardFile; continue }
    if (arg === '--help' || arg === '-h') { out.help = true; continue }
    if (arg === '--version' || arg === '-v') { out.version = true; continue }
    out.rest.push(arg)
  }
  return out
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (flags.version) {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const pkg = await import(path.join(here, '../package.json'), { with: { type: 'json' } })
    process.stdout.write(`${pkg.default.version}\n`)
    return
  }

  if (flags.help || flags.rest.length === 0) {
    process.stdout.write(usage)
    if (flags.help || flags.rest[0] === 'help') {
      process.stdout.write(`\n${commandHelp.replaceAll('/delivery-admin', 'dsh-delivery-board')}\n`)
    }
    return
  }

  const session = createStandaloneSession({
    cwd: flags.cwd,
    fileName: flags.fileName,
    boardFile: flags.boardFile,
  })

  try {
    const { action, args } = parseDeliveryCommand(flags.rest.join(' '))
    const result = await session.run(action, args)
    if (result && typeof result === 'object' && result.keepAlive) {
      process.stdout.write(`${result.text}\n`)
      const stop = async () => {
        try { await result.close() } catch { /* ignore */ }
        process.exit(0)
      }
      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)
      await new Promise(() => {})
    } else {
      process.stdout.write(`${result}\n`)
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
    await session.close().catch(() => {})
  }
}

main()
