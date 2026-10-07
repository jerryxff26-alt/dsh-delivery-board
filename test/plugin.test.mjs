import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { apply } from '../index.js'

function fixture() {
  const files = new Map()
  const tools = new Map()
  const writes = []
  const commands = new Map()
  const signal = new AbortController().signal
  const exec = { agent: { session: { header: { cwd: '/workspace' } } }, signal }
  const ctx = {
    systemPrompt: { section() {} },
    commands: { register(command) { commands.set(command.name, command) } },
    tools: { register(tool) { tools.set(tool.name, tool) } },
    emit() {},
    fs: {
      async resolve(file, { cwd }) { return { targetKey: resolve(cwd, file), displayPath: file } },
      async stat(target) { return files.has(target.targetKey) ? { type: 'file', version: 'v1' } : undefined },
      async readText(target) { return files.get(target.targetKey) },
      async writeText(target, text, expected, s) {
        writes.push({ target, expected, signal: s })
        files.set(target.targetKey, text)
      },
    },
  }
  apply(ctx, { fileName: 'delivery.json', boardFile: 'delivery-board.html' })
  return { tools, commands, exec, files, writes, signal }
}

test('all eleven tools render desktop-compatible text content blocks', () => {
  const { tools } = fixture()
  assert.equal(tools.size, 11)
  for (const tool of tools.values()) {
    const content = tool.output.render({}, { text: 'test result' })
    assert.deepEqual(content, [{ type: 'text', text: 'test result' }], tool.name)
    assert.equal(content.some((block) => block.type === 'image'), false)
  }
})

test('real desktop defineTool validates arguments before touching state', async () => {
  const { tools, exec, files } = fixture()
  await assert.rejects(tools.get('delivery_init').execute({}, exec), /customer/)
  assert.equal(files.size, 0)
})

test('plugin tools complete init, card, handoff, log, board, HTML and weekly flow', async () => {
  const { tools, exec, files, writes, signal } = fixture()
  const call = (name, args = {}) => tools.get(name).execute(args, exec)
  await assert.rejects(call('delivery_board'), /delivery_init first/)
  await call('delivery_init', { customer: 'Desktop Test', template: 'governance' })
  await assert.rejects(call('delivery_init', { customer: 'Do not overwrite' }), /already exists/)
  await call('delivery_card', { title: 'SSO', stage: 'analyze', owner: 'tester-a', acceptance: ['Supported'], dod: ['Reviewed'] })
  await call('delivery_move', { card_id: 'c1', to_stage: 'design', owner: 'tester-b', note: 'Reviewed' })
  await call('delivery_log', { type: 'blocker', text: 'Waiting on test UAT', card_id: 'c1' })
  assert.match((await call('delivery_board')).text, /SSO @tester-b/)
  await call('delivery_board_html')
  assert.match(files.get('/workspace/delivery-board.html'), /<!DOCTYPE html>/)
  assert.match((await call('delivery_weekly', { week_label: 'Test week' })).text, /Analyze → Design/)
  const state = JSON.parse(files.get('/workspace/delivery.json'))
  assert.equal(state.cards[0].stage, 'design')
  assert.deepEqual(state.logs.map((entry) => entry.type), ['handoff', 'blocker'])
  for (const write of writes) {
    assert.ok(write.target.displayPath === 'delivery-board.html' ? write.expected === undefined : ['createIfAbsent', 'replaceIfVersion'].includes(write.expected?.kind))
    assert.equal(write.signal, signal, write.target.displayPath)
  }
})

test('desktop weekly tool honors an explicit reporting period and rejects invalid dates', async () => {
  const { tools, exec, files } = fixture()
  await tools.get('delivery_init').execute({ customer: 'Weekly Test' }, exec)
  const state = JSON.parse(files.get('/workspace/delivery.json'))
  state.logs = [
    { type: 'handoff', ts: '2026-01-01T00:00:00Z', text: 'Historical item' },
    { type: 'handoff', ts: '2026-10-07T02:00:00Z', text: 'Selected week item' },
  ]
  files.set('/workspace/delivery.json', JSON.stringify(state))
  const result = await tools.get('delivery_weekly').execute({ week_start: '2026-10-05' }, exec)
  assert.match(result.text, /Selected week item/)
  assert.doesNotMatch(result.text, /Historical item/)
  await assert.rejects(tools.get('delivery_weekly').execute({ week_start: '2026-02-30' }, exec), /week_start/)
})


test('native /delivery command shares tool validation and performs direct mutations', async () => {
  const { commands, exec, files } = fixture()
  const command = commands.get('delivery')
  assert.ok(command.description.includes('不调用模型'))
  const invoke = (rawInput) => command.handler({ ...exec, rawInput })
  assert.match((await invoke('')).text, /\/delivery open/)
  assert.equal((await invoke('init {}')).kind, 'error')
  assert.equal(files.size, 0)
  assert.equal((await invoke('init {"customer":"Direct","template":"governance"}')).kind, 'success')
  assert.equal((await invoke('card {"title":"API","stage":"build"}')).kind, 'success')
  assert.equal((await invoke('move c1 test')).kind, 'success')
  assert.equal((await invoke('update {"card_id":"c1","owner":"Bob","due":""}')).kind, 'success')
  assert.equal((await invoke('archive c1')).kind, 'success')
  assert.doesNotMatch((await invoke('board')).text, /\[c1\]/)
  assert.match((await invoke('board --archived')).text, /\[c1\].*\[archived\]/)
  assert.equal((await invoke('move c1 live')).kind, 'error')
  assert.equal((await invoke('restore c1')).kind, 'success')
  const state = JSON.parse(files.get('/workspace/delivery.json'))
  assert.equal(state.cards[0].stage, 'test')
  assert.equal(state.cards[0].owner, 'Bob')
  assert.equal(state.cards[0].due, null)
  assert.equal(state.cards[0].archivedAt, null)
  assert.equal((await invoke('weekly 2026-02-30')).kind, 'error')
})


test('HTML export rejects the metadata target and aliases without changing JSON', async () => {
  const { tools, exec, files, writes } = fixture()
  await tools.get('delivery_init').execute({ customer: 'Protected state' }, exec)
  const original = files.get('/workspace/delivery.json')
  const count = writes.length
  for (const output of ['delivery.json', './delivery.json', '/workspace/delivery.json', 'folder/../delivery.json']) {
    await assert.rejects(tools.get('delivery_board_html').execute({ output }, exec), /cannot overwrite/)
    assert.equal(files.get('/workspace/delivery.json'), original)
    assert.equal(writes.length, count)
  }
  await assert.rejects(tools.get('delivery_board_html').execute({ output: 'notes.txt' }, exec), /extension/)
  await tools.get('delivery_board_html').execute({ output: 'snapshot.htm' }, exec)
  assert.match(files.get('/workspace/snapshot.htm'), /<!DOCTYPE html>/)
})


test('same-stage slash moves are no-ops, not errors or unrelated handoff messages', async () => {
  const { tools, commands, exec, files, writes } = fixture()
  await tools.get('delivery_init').execute({ customer: 'No-op test', template: 'governance' }, exec)
  await tools.get('delivery_card').execute({ title: 'API', stage: 'build' }, exec)
  const invocation = { ...exec, rawInput: 'move c1 build' }
  for (const withLog of [false, true]) {
    if (withLog) await tools.get('delivery_log').execute({ type: 'decision', text: 'Unrelated update' }, exec)
    const original = files.get('/workspace/delivery.json')
    const count = writes.length
    const result = await commands.get('delivery').handler(invocation)
    assert.equal(result.kind, 'success')
    assert.match(result.text, /No changes: c1 is already in build/)
    assert.doesNotMatch(result.text, /Handed off|Unrelated update/)
    assert.equal(files.get('/workspace/delivery.json'), original)
    assert.equal(writes.length, count)
  }
})
