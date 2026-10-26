// Direct human command syntax; no model message or generated script required.
export const commandHelp = `Delivery board commands (run directly, without the model):
/delivery-admin board [--archived] — text board
/delivery-admin open — interactive local board (drag, edit, archive, restore, log, gate checklists)
/delivery-admin init {"customer":"Demo","template":"governance"}
/delivery-admin card {"title":"API","stage":"build","owner":"Alice"}
/delivery-admin move c1 test
/delivery-admin update {"card_id":"c1","owner":"Bob","due":"2026-10-20"}
/delivery-admin archive c1
/delivery-admin restore c1
/delivery-admin log {"type":"blocker","text":"Waiting for UAT","card_id":"c1"}
/delivery-admin resolve <log_index> — mark a risk/blocker open entry resolved
/delivery-admin gate <stage_id> <gate_index> [true|false] — toggle/set a trackable gate checklist item
/delivery-admin stage_add {"name":"Hardening","after":"test","gates":["Scan clean"],"wip_limit":3}
/delivery-admin stage_update {"stage_id":"build","name":"Build & Review","wip_limit":5}
/delivery-admin stage_remove {"stage_id":"old","migrate_to":"build"} — refuses if cards remain without migrate_to
/delivery-admin weekly [YYYY-MM-DD] | {"week_start":"...","week_label":"...","next_week":"next bets..."}
/delivery-admin html — export a read-only HTML snapshot`

function objectInput(text) {
  let value
  try { value = JSON.parse(text) } catch { throw new Error('Expected a JSON object. Run /delivery-admin help for examples.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object')
  return value
}

export function parseDeliveryCommand(rawInput) {
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rawInput.trim())
  const action = match?.[1] ?? 'help'
  const rest = match?.[2]?.trim() ?? ''
  if (['help', 'open', 'html'].includes(action)) {
    if (rest) throw new Error(`${action} takes no arguments`)
    return { action, args: {} }
  }
  if (action === 'board') {
    if (rest && rest !== '--archived') throw new Error('Usage: /delivery-admin board [--archived]')
    return { action, args: { include_archived: rest === '--archived' } }
  }
  if (action === 'weekly') {
    if (!rest) return { action, args: {} }
    if (rest.startsWith('{')) return { action, args: objectInput(rest) }
    return { action, args: { week_start: rest } }
  }
  if (['archive', 'restore'].includes(action)) {
    if (!/^\S+$/.test(rest)) throw new Error(`Usage: /delivery-admin ${action} <card_id>`)
    return { action, args: { card_id: rest } }
  }
  if (action === 'resolve') {
    if (!/^\d+$/.test(rest)) throw new Error('Usage: /delivery-admin resolve <log_index>')
    return { action, args: { log_index: Number(rest) } }
  }
  if (action === 'gate') {
    if (rest.startsWith('{')) return { action, args: objectInput(rest) }
    const parts = rest.split(/\s+/)
    if (parts.length < 2 || parts.length > 3 || !/^\d+$/.test(parts[1])) {
      throw new Error('Usage: /delivery-admin gate <stage_id> <gate_index> [true|false]')
    }
    const args = { stage_id: parts[0], gate_index: Number(parts[1]) }
    if (parts[2] !== undefined) {
      if (!['true', 'false'].includes(parts[2])) throw new Error('Usage: /delivery-admin gate <stage_id> <gate_index> [true|false]')
      args.done = parts[2] === 'true'
    }
    return { action, args }
  }
  if (action === 'move' && !rest.startsWith('{')) {
    const words = rest.split(/\s+/)
    if (words.length !== 2 || !words.every(Boolean)) throw new Error('Usage: /delivery-admin move <card_id> <stage_id>')
    return { action, args: { card_id: words[0], to_stage: words[1] } }
  }
  if (['init', 'card', 'move', 'update', 'log', 'stage_add', 'stage_update', 'stage_remove'].includes(action)) {
    return { action, args: objectInput(rest) }
  }
  throw new Error(`Unknown delivery command: ${action}. Run /delivery-admin help.`)
}

export function registerDeliveryCommand(ctx, run) {
  ctx.commands.register({
    name: 'delivery-admin',
    description: 'Advanced delivery board controls: run validated operations directly, without the model',
    input: { hint: 'board | open | init {...} | card {...} | move <id> <stage> | gate <stage> <index> | stage_add {...} | help' },
    async handler(invocation) {
      try {
        const { action, args } = parseDeliveryCommand(invocation.rawInput)
        if (action === 'help') return { kind: 'success', text: commandHelp }
        return { kind: 'success', text: await run(action, args, { agent: invocation.agent, signal: invocation.signal }) }
      } catch (error) { return { kind: 'error', text: error.message } }
    },
  })
}
