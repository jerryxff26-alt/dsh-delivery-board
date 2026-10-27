import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createNodeFs, createStandaloneCtx } from '../lib/node-fs.js'
import { initializeState, mutateState, readState } from '../lib/store.js'
import { createProject, addCard } from '../lib/delivery.js'

async function withTemp(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-board-'))
  try { return await run(dir) }
  finally { await rm(dir, { recursive: true, force: true }) }
}

test('node-fs resolve stays inside workspace and rejects escapes', async () => {
  await withTemp(async (dir) => {
    const fs = createNodeFs(dir)
    const target = await fs.resolve('delivery.json', { cwd: dir })
    assert.equal(target.targetKey, path.join(dir, 'delivery.json'))
    await assert.rejects(fs.resolve('../outside.json', { cwd: dir }), /outside workspace/)
  })
})

test('node-fs createIfAbsent and replaceIfVersion match store contracts', async () => {
  await withTemp(async (dir) => {
    const ctx = createStandaloneCtx(dir)
    const exec = { workspaceCwd: dir, agent: { session: { header: { cwd: dir } } }, signal: new AbortController().signal }
    const state = await initializeState(ctx, exec, 'delivery.json', () => createProject({ customer: 'ACME', template: 'governance' }))
    assert.equal(state.customer, 'ACME')
    const disk = JSON.parse(await readFile(path.join(dir, 'delivery.json'), 'utf8'))
    assert.equal(disk.customer, 'ACME')

    await assert.rejects(
      initializeState(ctx, exec, 'delivery.json', () => createProject({ customer: 'X' })),
      /already exists/,
    )

    const { state: next, revision } = await mutateState(ctx, exec, 'delivery.json', (s) => addCard(s, { title: 'SSO', stage: 'analyze' }))
    assert.equal(next.cards[0].title, 'SSO')
    assert.match(revision, /^[a-f0-9]{64}$/)

    const loaded = await readState(ctx, exec, 'delivery.json')
    assert.equal(loaded.cards.length, 1)
  })
})

test('node-fs stale version guard rejects concurrent overwrite', async () => {
  await withTemp(async (dir) => {
    const ctx = createStandaloneCtx(dir)
    const exec = { workspaceCwd: dir, agent: { session: { header: { cwd: dir } } }, signal: new AbortController().signal }
    await initializeState(ctx, exec, 'delivery.json', () => createProject({ customer: 'ACME' }))
    const target = await ctx.fs.resolve('delivery.json', { cwd: dir })
    const info = await ctx.fs.stat(target)
    await ctx.fs.writeText(target, '{"customer":"tampered"}\n', undefined, exec.signal)
    await assert.rejects(
      ctx.fs.writeText(target, '{"customer":"stale"}\n', { kind: 'replaceIfVersion', version: info.version }, exec.signal),
      (err) => err.code === 'FS_STALE_VERSION',
    )
  })
})
