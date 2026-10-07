import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readState, stateExists, writeState } from '../lib/store.js'

function fixture({ info, text = '{"customer":"Test"}' } = {}) {
  const calls = []
  const target = { targetKey: '/workspace/delivery.json', displayPath: 'delivery.json' }
  const signal = new AbortController().signal
  const exec = { agent: { session: { header: { cwd: '/workspace' } } }, signal }
  const ctx = {
    fs: {
      async resolve(file, options) { calls.push(['resolve', file, options]); return target },
      async stat(t, s) { calls.push(['stat', t, s]); return info },
      async readText(t, s) { calls.push(['readText', t, s]); return text },
      async writeText(...args) { calls.push(['writeText', ...args]) },
    },
    emit(...args) { calls.push(['emit', ...args]) },
  }
  return { ctx, exec, calls, target, signal }
}

test('store resolves missing state relative to the session workspace', async () => {
  const { ctx, exec, calls, signal } = fixture()
  assert.equal(await readState(ctx, exec, 'delivery.json'), null)
  assert.equal(await stateExists(ctx, exec, 'delivery.json'), false)
  assert.deepEqual(calls[0], ['resolve', 'delivery.json', { cwd: '/workspace', signal }])
  assert.ok(!calls.some(([name]) => name === 'readText' || name === 'emit'))
})

test('store observes an existing file and preserves the execution context', async () => {
  const { ctx, exec, calls, target, signal } = fixture({ info: { type: 'file', version: 'v1' } })
  assert.deepEqual(await readState(ctx, exec, 'delivery.json'), { customer: 'Test' })
  assert.deepEqual(calls[2], ['readText', target, signal])
  assert.deepEqual(calls[3], ['emit', 'fs/observed', target, { kind: 'present', version: 'v1' }, exec])
  assert.equal(await stateExists(ctx, exec, 'delivery.json'), true)
})

test('store rejects directories and invalid JSON instead of starting over', async () => {
  const directory = fixture({ info: { type: 'directory' } })
  await assert.rejects(readState(directory.ctx, directory.exec, 'delivery.json'), /not a file/)
  const invalid = fixture({ info: { type: 'file', version: 'v1' }, text: '{bad' })
  await assert.rejects(readState(invalid.ctx, invalid.exec, 'delivery.json'), SyntaxError)
})

test('store uses the DSH writeText(target, content, expected, signal) contract', async () => {
  const { ctx, exec, calls, target, signal } = fixture()
  await writeState(ctx, exec, 'delivery.json', { customer: 'Test' })
  assert.deepEqual(calls[1], ['writeText', target, '{\n  "customer": "Test"\n}\n', undefined, signal])
})

test('store passes cancellation to the provider instead of treating it as a version guard', async () => {
  const { ctx, exec } = fixture()
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  exec.signal = controller.signal
  ctx.fs.writeText = async (_target, _text, _expected, signal) => signal?.throwIfAborted()
  await assert.rejects(writeState(ctx, exec, 'delivery.json', {}), /cancelled/)
})


test('trusted workspace override pins reads while retaining the original agent context', async () => {
  const { ctx, exec, calls, signal } = fixture({ info: { type: 'file', version: 'v1' } })
  exec.workspaceCwd = '/original-workspace'
  exec.agent.session.header.cwd = '/different-workspace'
  await readState(ctx, exec, 'delivery.json')
  assert.deepEqual(calls[0], ['resolve', 'delivery.json', { cwd: '/original-workspace', signal }])
  assert.equal(calls[3][4].agent, exec.agent)
})
