// Direct human command syntax; no model message or generated script required.
export const commandHelp = `Delivery board commands (run directly, without the model):
/delivery board [--archived] — text board
/delivery open — interactive local board (drag, edit, archive, restore)
/delivery init {"customer":"Demo","template":"governance"}
/delivery card {"title":"API","stage":"build","owner":"Alice"}
/delivery move c1 test
/delivery update {"card_id":"c1","owner":"Bob","due":"2026-10-20"}
/delivery archive c1
/delivery restore c1
/delivery log {"type":"blocker","text":"Waiting for UAT","card_id":"c1"}
/delivery weekly [YYYY-MM-DD]
/delivery html — export a read-only HTML snapshot`

function objectInput(text) {
  let value
  try { value = JSON.parse(text) } catch { throw new Error('Expected a JSON object. Run /delivery help for examples.') }
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
    if (rest && rest !== '--archived') throw new Error('Usage: /delivery board [--archived]')
    return { action, args: { include_archived: rest === '--archived' } }
  }
  if (action === 'weekly') return { action, args: rest ? { week_start: rest } : {} }
  if (['archive', 'restore'].includes(action)) {
    if (!/^\S+$/.test(rest)) throw new Error(`Usage: /delivery ${action} <card_id>`)
    return { action, args: { card_id: rest } }
  }
  if (action === 'move' && !rest.startsWith('{')) {
    const words = rest.split(/\s+/)
    if (words.length !== 2 || !words.every(Boolean)) throw new Error('Usage: /delivery move <card_id> <stage_id>')
    return { action, args: { card_id: words[0], to_stage: words[1] } }
  }
  if (['init', 'card', 'move', 'update', 'log'].includes(action)) return { action, args: objectInput(rest) }
  throw new Error(`Unknown delivery command: ${action}. Run /delivery help.`)
}

export function registerDeliveryCommand(ctx, run) {
  ctx.commands.register({
    name: 'delivery',
    description: '交付看板：直接查询、打开拖拽看板、移动与归档卡片（不调用模型）',
    input: { hint: 'board | open | init {...} | card {...} | move <id> <stage> | archive <id> | restore <id> | help' },
    async handler(invocation) {
      try {
        const { action, args } = parseDeliveryCommand(invocation.rawInput)
        if (action === 'help') return { kind: 'success', text: commandHelp }
        return { kind: 'success', text: await run(action, args, { agent: invocation.agent, signal: invocation.signal }) }
      } catch (error) { return { kind: 'error', text: error.message } }
    },
  })
}
