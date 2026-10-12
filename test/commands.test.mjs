import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDeliveryCommand } from '../lib/commands.js'

test('slash command supports discoverable help, precise move and archive syntax', () => {
  assert.deepEqual(parseDeliveryCommand(''), { action: 'help', args: {} })
  assert.deepEqual(parseDeliveryCommand('move c1 build'), { action: 'move', args: { card_id: 'c1', to_stage: 'build' } })
  assert.deepEqual(parseDeliveryCommand('board --archived'), { action: 'board', args: { include_archived: true } })
  assert.deepEqual(parseDeliveryCommand('archive c1'), { action: 'archive', args: { card_id: 'c1' } })
  assert.deepEqual(parseDeliveryCommand('weekly 2026-10-05'), { action: 'weekly', args: { week_start: '2026-10-05' } })
  assert.deepEqual(parseDeliveryCommand('resolve 2'), { action: 'resolve', args: { log_index: 2 } })
  assert.deepEqual(
    parseDeliveryCommand('weekly {"week_start":"2026-10-05","next_week":"Ship SSO"}'),
    { action: 'weekly', args: { week_start: '2026-10-05', next_week: 'Ship SSO' } },
  )
  assert.throws(() => parseDeliveryCommand('resolve'), /resolve <log_index>/)
  assert.throws(() => parseDeliveryCommand('resolve c1'), /resolve <log_index>/)
})

test('slash command keeps JSON strings intact and never interprets shell syntax', () => {
  assert.deepEqual(parseDeliveryCommand('card {"title":"A ; B", "stage":"build"}').args, { title: 'A ; B', stage: 'build' })
  for (const input of ['unknown', 'move c1', 'move c1 build ; rm', 'archive c1 c2', 'board anything', 'open more', 'init []', 'card null', 'update {bad}']) assert.throws(() => parseDeliveryCommand(input))
})
