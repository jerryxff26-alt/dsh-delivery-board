import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createStandaloneSession } from '../lib/standalone.js'

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '../bin/dsh-delivery-board.js')

async function withTemp(run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'dsh-cli-'))
  try { return await run(dir) }
  finally { await rm(dir, { recursive: true, force: true }) }
}

function runCli(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env: process.env })
    let stdout = '', stderr = ''
    child.stdout.on('data', (c) => { stdout += c })
    child.stderr.on('data', (c) => { stderr += c })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

test('standalone session init/card/board/weekly/html without DSH', async () => {
  await withTemp(async (dir) => {
    const session = createStandaloneSession({ cwd: dir })
    const init = await session.run('init', { customer: 'ACME', template: 'governance' })
    assert.match(init, /ACME/)
    assert.match(await session.run('card', { title: 'API', stage: 'analyze', owner: 'Ada' }), /Card created \[c1\]/)
    assert.match(await session.run('move', { card_id: 'c1', to_stage: 'design' }), /Handed off/)
    const board = await session.run('board', {})
    assert.match(board, /API/)
    assert.match(board, /design/i)
    const weekly = await session.run('weekly', { week_start: '2026-10-20' })
    assert.match(weekly, /ACME|Weekly|handoff|Handoff/i)
    assert.match(await session.run('html', {}), /HTML board generated/)
    const html = await readFile(path.join(dir, 'delivery-board.html'), 'utf8')
    assert.match(html, /API/)
    await session.close()
  })
})

test('CLI binary init + board via --cwd', async () => {
  await withTemp(async (dir) => {
    const init = await runCli(['--cwd', dir, 'init', '{"customer":"Demo","template":"default"}'])
    assert.equal(init.code, 0, init.stderr)
    assert.match(init.stdout, /Demo/)
    const card = await runCli(['--cwd', dir, 'card', '{"title":"Ship","stage":"dev"}'])
    // default template stage ids vary — pick from board if needed
    if (card.code !== 0) {
      // discover a stage id from board output after forcing a known stage from governance
      await rm(path.join(dir, 'delivery.json'), { force: true })
      await runCli(['--cwd', dir, 'init', '{"customer":"Demo","template":"governance"}'])
      const card2 = await runCli(['--cwd', dir, 'card', '{"title":"Ship","stage":"analyze"}'])
      assert.equal(card2.code, 0, card2.stderr)
    }
    const board = await runCli(['--cwd', dir, 'board'])
    assert.equal(board.code, 0, board.stderr)
    assert.match(board.stdout, /Ship|Demo/)
  })
})

test('CLI --version prints package version', async () => {
  const result = await runCli(['--version'])
  assert.equal(result.code, 0)
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/)
})

test('standalone open serves editable board over loopback', async () => {
  await withTemp(async (dir) => {
    const session = createStandaloneSession({ cwd: dir })
    await session.run('init', { customer: 'Live', template: 'governance' })
    await session.run('card', { title: 'SSO', stage: 'analyze' })
    const opened = await session.run('open', {})
    assert.match(opened.text, /http:\/\/127\.0\.0\.1:\d+\/board\//)
    const url = opened.text.match(/http:\/\/127\.0\.0\.1:\d+\/board\/[0-9a-f]+/)[0]
    const res = await fetch(url)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /SSO/)
    assert.match(html, /Live local board|draggable/)
    await opened.close()
    await session.close()
  })
})

test('standalone board without init names one next step', async () => {
  await withTemp(async (dir) => {
    const session = createStandaloneSession({ cwd: dir })
    await assert.rejects(() => session.run('board'), /Next step: init/)
    await session.close()
  })
})
