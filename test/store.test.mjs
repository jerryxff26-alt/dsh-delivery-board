import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProject } from '../lib/delivery.js'
import { readState, stateExists, writeState, validateState } from '../lib/store.js'

function validText(overrides = {}) {
  const state = { ...createProject({ customer: 'Test' }), ...overrides }
  return JSON.stringify(state)
}

function fixture({ info, text } = {}) {
  const calls = []
  const target = { targetKey: '/workspace/delivery.json', displayPath: 'delivery.json' }
  const signal = new AbortController().signal
  const exec = { agent: { session: { header: { cwd: '/workspace' } } }, signal }
  const ctx = {
    fs: {
      async resolve(file, options) { calls.push(['resolve', file, options]); return target },
      async stat(t, s) { calls.push(['stat', t, s]); return info },
      async readText(t, s) { calls.push(['readText', t, s]); return text ?? validText() },
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
  const state = await readState(ctx, exec, 'delivery.json')
  assert.equal(state.customer, 'Test')
  assert.ok(Array.isArray(state.pipeline))
  assert.deepEqual(calls[2], ['readText', target, signal])
  assert.deepEqual(calls[3], ['emit', 'fs/observed', target, { kind: 'present', version: 'v1' }, exec])
  assert.equal(await stateExists(ctx, exec, 'delivery.json'), true)
})

test('store rejects directories and invalid JSON instead of starting over', async () => {
  const directory = fixture({ info: { type: 'directory' } })
  await assert.rejects(readState(directory.ctx, directory.exec, 'delivery.json'), /not a file/)
  const invalid = fixture({ info: { type: 'file', version: 'v1' }, text: '{bad' })
  await assert.rejects(readState(invalid.ctx, invalid.exec, 'delivery.json'), /invalid JSON/)
})

test('store rejects corrupt shapes with clear path errors', async () => {
  assert.throws(() => validateState({ customer: 'X' }, 'delivery.json'), /pipeline must be an array/)
  assert.throws(() => validateState({
    customer: 'X', pipeline: [{ id: 's1', name: 'S' }], cards: 'nope', logs: [],
  }, 'delivery.json'), /cards must be an array/)
  assert.throws(() => validateState({
    customer: 'X',
    pipeline: [{ id: 's1', name: 'S' }],
    cards: [],
    logs: [{ ts: '2026-01-01T00:00:00Z', type: 'nope', text: 'x' }],
  }, 'delivery.json'), /logs\[0\]\.type must be one of/)
  const ok = createProject({ customer: 'OK' })
  assert.equal(validateState(ok), ok)

  const corrupt = fixture({
    info: { type: 'file', version: 'v1' },
    text: JSON.stringify({ customer: 'X', pipeline: [], cards: [], logs: [] }),
  })
  await assert.rejects(readState(corrupt.ctx, corrupt.exec, 'delivery.json'), /pipeline must contain at least one stage/)
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
