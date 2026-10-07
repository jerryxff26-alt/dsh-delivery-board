import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createProject, addCard } from '../lib/delivery.js'
import { createBoardHandler, createBoardManager } from '../lib/board-server.js'

function fixture() {
  let state = createProject({ customer: 'Browser Test', template: 'governance' })
  state = addCard(state, { title: 'SSO', stage: 'analyze', owner: 'Alice', acceptance: ['SSO supported'], dod: ['Reviewed'] })
  let disk = JSON.stringify(state, null, 2) + '\n'
  let version = 1
  const writes = []
  const signal = new AbortController().signal
  const exec = { agent: { session: { id: 'test', header: { cwd: '/workspace' } } }, signal }
  const ctx = { emit() {}, fs: {
    async resolve(file, { cwd }) { return { targetKey: `${cwd}/${file}`, displayPath: file } },
    async stat() { return { type: 'file', version: `v${version}` } },
    async readText() { return disk },
    async writeText(target, text, expected, s) {
      assert.equal(target.targetKey, '/workspace/delivery.json')
      assert.equal(s, signal)
      if (expected?.kind === 'replaceIfVersion' && expected.version !== `v${version}`) throw Object.assign(new Error('file changed since read'), { code: 'FS_STALE_VERSION' })
      writes.push({ target, text, expected })
      disk = text; version++
    },
  } }
  const handler = createBoardHandler({ ctx, exec, config: { fileName: 'delivery.json' }, basePath: '/board/secret', getOrigin: () => 'http://127.0.0.1:12345' })
  async function call({ method = 'GET', path = '/board/secret/state', body, chunks, headers = {} } = {}) {
    const req = Readable.from(chunks ?? (body === undefined ? [] : [typeof body === 'string' ? body : JSON.stringify(body)]))
    Object.assign(req, { method, url: path, headers: { host: '127.0.0.1:12345', origin: 'http://127.0.0.1:12345', 'content-type': 'application/json', ...headers } })
    const result = {}
    const res = { writeHead(status, h) { result.status = status; result.headers = h }, end(text) { result.text = text; result.body = result.headers['Content-Type'].startsWith('application/json') ? JSON.parse(text) : text } }
    await handler(req, res)
    return result
  }
  const post = (body, headers) => call({ method: 'POST', path: '/board/secret/action', body, headers })
  const revision = () => createHash('sha256').update(disk).digest('hex')
  return { ctx, exec, call, post, writes, revision, getState: () => JSON.parse(disk), externalEdit(text) { disk = text; version++ } }
}

test('live board serves only the capability path and uses no-store and browser isolation headers', async () => {
  const f = fixture()
  const page = await f.call({ path: '/board/secret' })
  assert.equal(page.status, 200)
  assert.match(page.text, /本机实时看板/)
  assert.match(page.text, /draggable="true"/)
  assert.equal(page.headers['Cache-Control'], 'no-store')
  assert.equal(page.headers['Referrer-Policy'], 'no-referrer')
  assert.match(page.headers['Content-Security-Policy'], /frame-ancestors 'none'/)
  assert.equal((await f.call({ path: '/delivery.json' })).status, 404)
  assert.equal((await f.call({ path: '/board/wrong/state' })).status, 404)
})

test('browser move persists stage and handoff with a version-guarded write', async () => {
  const f = fixture()
  const response = await f.post({ action: 'move', args: { card_id: 'c1', to_stage: 'design' }, revision: f.revision() })
  assert.equal(response.status, 200)
  assert.equal(f.getState().cards[0].stage, 'design')
  assert.equal(f.getState().logs.at(-1).type, 'handoff')
  assert.equal(response.body.revision, f.revision())
  assert.equal(f.writes[0].expected.kind, 'replaceIfVersion')
})

test('edit, archive and restore retain metadata, IDs and audit history', async () => {
  const f = fixture()
  for (const [action, args] of [['update', { card_id: 'c1', owner: 'Bob', due: '2026-10-20' }], ['archive', { card_id: 'c1' }], ['restore', { card_id: 'c1' }]]) {
    assert.equal((await f.post({ action, args, revision: f.revision() })).status, 200)
  }
  const card = f.getState().cards[0]
  assert.equal(card.id, 'c1')
  assert.equal(card.stage, 'analyze')
  assert.equal(card.owner, 'Bob')
  assert.equal(card.archivedAt, null)
  assert.deepEqual(card.acceptance, ['SSO supported'])
  assert.deepEqual(card.dod, ['Reviewed'])
  assert.equal(f.getState().logs.length, 3)
})

test('invalid mutations leave JSON unchanged and never accept arbitrary document replacement', async () => {
  const f = fixture()
  const before = f.revision()
  const cases = [
    { action: 'move', args: { card_id: 'c1', to_stage: 'wrong' } },
    { action: 'move', args: { card_id: 'wrong', to_stage: 'design' } },
    { action: 'update', args: { card_id: 'c1', due: '2026-02-30' } },
    { action: 'archive', args: { card_id: 'c1', file: '/other.json' } },
    { action: 'write', args: { state: {} } },
    { action: 'archive', args: { card_id: 'c1' }, state: {} },
  ]
  for (const body of cases) assert.equal((await f.post({ ...body, revision: before })).status, 400)
  assert.equal((await f.post({ action: 'archive', args: { card_id: 'c1' } })).status, 400)
  assert.equal(f.revision(), before)
  assert.equal(f.writes.length, 0)
})

test('loopback host, same origin and JSON content type are required for mutations', async () => {
  const f = fixture()
  const body = { action: 'archive', args: { card_id: 'c1' }, revision: f.revision() }
  assert.equal((await f.post(body, { host: 'attacker.example' })).status, 403)
  assert.equal((await f.post(body, { origin: 'https://attacker.example' })).status, 403)
  assert.equal((await f.post(body, { origin: undefined })).status, 403)
  assert.equal((await f.post(body, { 'content-type': 'text/plain' })).status, 415)
  assert.equal((await f.post('{bad')).status, 400)
  assert.equal((await f.post('x'.repeat(65537))).status, 413)
  assert.equal(f.writes.length, 0)
})

test('a stale browser cannot overwrite external edits; refresh supplies the current revision', async () => {
  const f = fixture()
  const stale = f.revision()
  const changed = f.getState()
  changed.cards[0].owner = 'External editor'
  f.externalEdit(JSON.stringify(changed))
  const response = await f.post({ action: 'archive', args: { card_id: 'c1' }, revision: stale })
  assert.equal(response.status, 409)
  assert.equal(f.getState().cards[0].owner, 'External editor')
  assert.equal(f.getState().cards[0].archivedAt, undefined)
  assert.equal((await f.call()).body.revision, f.revision())
})

test('two saves from one revision are serialized: exactly one succeeds', async () => {
  const f = fixture()
  const revision = f.revision()
  const results = await Promise.all([
    f.post({ action: 'move', args: { card_id: 'c1', to_stage: 'design' }, revision }),
    f.post({ action: 'move', args: { card_id: 'c1', to_stage: 'build' }, revision }),
  ])
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409])
  assert.equal(f.getState().logs.length, 1)
})

test('provider stale-version errors during a save are returned as conflicts', async () => {
  const f = fixture()
  f.ctx.fs.writeText = async () => { throw Object.assign(new Error('external write won'), { code: 'FS_STALE_VERSION' }) }
  const before = f.revision()
  const result = await f.post({ action: 'archive', args: { card_id: 'c1' }, revision: before })
  assert.equal(result.status, 409)
  assert.equal(f.revision(), before)
})

test('split UTF-8 request chunks preserve Chinese and emoji metadata', async () => {
  const f = fixture()
  const title = '中文标题 🚀'
  const payload = Buffer.from(JSON.stringify({ action: 'update', args: { card_id: 'c1', title }, revision: f.revision() }))
  const response = await f.call({ method: 'POST', path: '/board/secret/action', chunks: [...payload].map((byte) => Buffer.from([byte])) })
  assert.equal(response.status, 200)
  assert.equal(f.getState().cards[0].title, title)
})

test('the 64KiB request limit counts buffered bytes, including split Unicode', async () => {
  const f = fixture()
  const body = { action: 'update', args: { card_id: 'c1', title: '' }, revision: f.revision() }
  body.args.title = 'a'.repeat(65536 - Buffer.byteLength(JSON.stringify(body)))
  const payload = Buffer.from(JSON.stringify(body))
  assert.equal(payload.length, 65536)
  assert.equal((await f.call({ method: 'POST', path: '/board/secret/action', chunks: [payload.subarray(0, 60000), payload.subarray(60000)] })).status, 200)
  const before = f.revision()
  body.revision = before
  body.args.title += '中'
  const oversized = Buffer.from(JSON.stringify(body))
  assert.equal(oversized.length, 65539)
  assert.equal((await f.call({ method: 'POST', path: '/board/secret/action', chunks: [oversized.subarray(0, 65535), oversized.subarray(65535)] })).status, 413)
  assert.equal(f.revision(), before)
  assert.equal(f.writes.length, 1)
})

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

// No sockets or ports are opened: listening and closing are explicit test events.
class FakeServer extends EventEmitter {
  constructor(handler, { pendingListen, pendingClose }, port) {
    super()
    this.handler = handler
    this.pendingListen = pendingListen
    this.pendingClose = pendingClose
    this.port = port
    this.listening = false
    this.closeCalls = 0
    this.closeAllCalls = 0
    this.closeStarted = deferred()
  }
  listen(port, host, callback) {
    assert.equal(port, 0)
    assert.equal(host, '127.0.0.1')
    this.listenCallback = callback
    if (!this.pendingListen) this.finishListening()
    return this
  }
  finishListening() {
    if (this.closeCalls) return
    this.listening = true
    this.listenCallback()
  }
  address() { return { port: this.port } }
  unref() { this.unreferenced = true }
  close(callback) {
    this.closeCalls++
    this.listening = false
    this.closeCallback = callback
    this.closeStarted.resolve()
    if (!this.pendingClose) this.finishClosing()
    return this
  }
  finishClosing() { this.closeCallback?.() }
  closeAllConnections() { this.closeAllCalls++ }
  async request(url, { method = 'GET', body } = {}) {
    const parsed = new URL(url)
    const req = Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), {
      method, url: parsed.pathname,
      headers: { host: parsed.host, origin: parsed.origin, 'content-type': 'application/json' },
    })
    const completed = deferred()
    const result = {}
    this.handler(req, {
      writeHead(status, headers) { result.status = status; result.headers = headers },
      end(text) { result.body = JSON.parse(text); completed.resolve(result) },
    })
    return completed.promise
  }
}

function managerFixture(options = {}) {
  const files = new Map()
  for (const [path, customer] of [['/workspace-a/delivery.json', 'Workspace A'], ['/workspace-b/delivery.json', 'Workspace B'], ['/workspace-a/other.json', 'Other file']]) {
    const state = addCard(createProject({ customer, template: 'governance' }), { title: 'SSO', stage: 'analyze', owner: 'Alice' })
    files.set(path, { text: JSON.stringify(state), version: 1 })
  }
  const controller = new AbortController()
  const exec = { agent: { session: { id: 'manager-test', header: { cwd: '/workspace-a' } } }, signal: controller.signal }
  const config = { fileName: 'delivery.json' }
  const observed = [], resolved = [], writes = [], servers = []
  const created = deferred()
  let dispose
  const ctx = {
    effect(init) { dispose = init() },
    emit(_event, target, _observation, execution) { observed.push({ target, exec: execution }) },
    fs: {
      // Reads deliberately ignore cancellation to exercise the manager's checks.
      async resolve(file, { cwd }) { resolved.push({ file, cwd }); return { targetKey: `${cwd}/${file}`, displayPath: file } },
      async stat(target) { const file = files.get(target.targetKey); return file ? { type: 'file', version: file.version } : undefined },
      async readText(target) { return files.get(target.targetKey).text },
      async writeText(target, text, expected, signal) {
        signal?.throwIfAborted()
        const file = files.get(target.targetKey)
        assert.equal(expected.kind, 'replaceIfVersion')
        assert.equal(expected.version, file.version)
        files.set(target.targetKey, { text, version: file.version + 1 })
        writes.push({ target, signal })
      },
    },
  }
  const manager = createBoardManager(ctx, config, { createServer(handler) {
    const server = new FakeServer(handler, options, 12345 + servers.length)
    servers.push(server)
    created.resolve(server)
    return server
  } })
  return { ctx, exec, controller, config, manager, servers, created, observed, resolved, writes, dispose: () => dispose(), state: (path) => JSON.parse(files.get(path).text) }
}

test('manager requires a string session cwd before touching the filesystem', async () => {
  const f = managerFixture()
  for (const cwd of [undefined, null, 42, {}]) {
    f.exec.agent.session.header.cwd = cwd
    await assert.rejects(f.manager.open(f.exec), /session workspace cwd/)
  }
  assert.equal(f.resolved.length, 0)
  assert.equal(f.servers.length, 0)
  await f.dispose()
})

test('a capability pins cwd and fileName at open while retaining the original SDK agent', async () => {
  const f = managerFixture()
  const entered = deferred(), resume = deferred()
  const readText = f.ctx.fs.readText
  f.ctx.fs.readText = async (...args) => { entered.resolve(); await resume.promise; return readText(...args) }
  const opening = f.manager.open(f.exec)
  await entered.promise
  f.exec.agent.session.header.cwd = '/workspace-b'
  f.config.fileName = 'other.json'
  resume.resolve()
  const url = await opening
  const server = f.servers[0]
  const snapshot = await server.request(`${url}/state`)
  assert.equal(snapshot.status, 200)
  assert.equal(snapshot.body.state.customer, 'Workspace A')
  const saved = await server.request(`${url}/action`, { method: 'POST', body: { action: 'archive', args: { card_id: 'c1' }, revision: snapshot.body.revision } })
  assert.equal(saved.status, 200)
  assert.ok(f.state('/workspace-a/delivery.json').cards[0].archivedAt)
  assert.equal(f.state('/workspace-b/delivery.json').cards[0].archivedAt, undefined)
  assert.equal(f.state('/workspace-a/other.json').cards[0].archivedAt, undefined)
  assert.ok(f.resolved.every(({ file, cwd }) => file === 'delivery.json' && cwd === '/workspace-a'))
  assert.ok(f.observed.every(({ exec }) => exec.agent === f.exec.agent && exec.workspaceCwd === '/workspace-a'))
  const lifetimeSignal = f.writes[0].signal
  assert.notEqual(lifetimeSignal, f.exec.signal)
  f.controller.abort(new Error('Finished opening command'))
  assert.equal(lifetimeSignal.aborted, false)
  assert.equal((await server.request(`${url}/state`)).status, 200)
  await f.dispose()
  assert.equal(lifetimeSignal.aborted, true)
})

test('dispose during pending read or target resolution never creates a listener', async () => {
  for (const step of ['readText', 'resolve']) {
    const f = managerFixture()
    const entered = deferred(), resume = deferred()
    const original = f.ctx.fs[step]
    let calls = 0
    f.ctx.fs[step] = async (...args) => {
      if (++calls === (step === 'resolve' ? 2 : 1)) { entered.resolve(); await resume.promise }
      return original(...args)
    }
    const opening = f.manager.open(f.exec)
    const rejected = assert.rejects(opening, /manager is closed/)
    await entered.promise
    await f.dispose()
    resume.resolve()
    await rejected
    assert.equal(f.servers.length, 0, step)
    await assert.rejects(f.manager.open(f.exec), /manager is closed/)
  }
})

test('cancellation before open or after a pending read creates no listener', async () => {
  const before = managerFixture()
  before.controller.abort(new Error('Cancelled before open'))
  await assert.rejects(before.manager.open(before.exec), /Cancelled before open/)
  assert.equal(before.resolved.length, 0)
  assert.equal(before.servers.length, 0)
  await before.dispose()

  const f = managerFixture()
  const entered = deferred(), resume = deferred()
  const readText = f.ctx.fs.readText
  f.ctx.fs.readText = async (...args) => { entered.resolve(); await resume.promise; return readText(...args) }
  const opening = f.manager.open(f.exec)
  const rejected = assert.rejects(opening, /Cancelled while reading/)
  await entered.promise
  f.controller.abort(new Error('Cancelled while reading'))
  resume.resolve()
  await rejected
  assert.equal(f.servers.length, 0)
  await f.dispose()
})

test('cancellation during pending listen closes the new server and never returns its URL', async () => {
  const f = managerFixture({ pendingListen: true })
  const opening = f.manager.open(f.exec)
  const rejected = assert.rejects(opening, /Cancelled while listening/)
  const server = await f.created.promise
  f.controller.abort(new Error('Cancelled while listening'))
  await rejected
  assert.equal(server.closeCalls, 1)
  assert.equal(server.closeAllCalls, 1)
  server.finishListening()
  assert.equal(server.listening, false)
  await f.dispose()
})

test('an existing URL is reused and a later aborted open does not close it', async () => {
  const f = managerFixture()
  const url = await f.manager.open(f.exec)
  const server = f.servers[0]
  assert.equal(await f.manager.open({ ...f.exec, signal: new AbortController().signal }), url)
  assert.equal(f.servers.length, 1)

  const caller = new AbortController()
  const entered = deferred(), resume = deferred()
  const readText = f.ctx.fs.readText
  f.ctx.fs.readText = async (...args) => { entered.resolve(); await resume.promise; return readText(...args) }
  const reopening = f.manager.open({ ...f.exec, signal: caller.signal })
  const rejected = assert.rejects(reopening, /Cancelled reuse/)
  await entered.promise
  caller.abort(new Error('Cancelled reuse'))
  resume.resolve()
  await rejected
  assert.equal(server.closeCalls, 0)
  assert.equal((await server.request(`${url}/state`)).status, 200)
  await f.dispose()
  assert.equal(server.closeCalls, 1)
})

test('aborting a reuse waiting for another command to listen leaves that listener alive', async () => {
  const f = managerFixture({ pendingListen: true })
  const opening = f.manager.open(f.exec)
  const server = await f.created.promise
  const caller = new AbortController()
  const resolving = deferred()
  const resolveTarget = f.ctx.fs.resolve
  let resolutions = 0
  f.ctx.fs.resolve = async (...args) => { const result = await resolveTarget(...args); if (++resolutions === 2) resolving.resolve(); return result }
  const reopening = f.manager.open({ ...f.exec, signal: caller.signal })
  const rejected = assert.rejects(reopening, /Cancelled pending reuse/)
  await resolving.promise
  caller.abort(new Error('Cancelled pending reuse'))
  await rejected
  assert.equal(server.closeCalls, 0)
  server.finishListening()
  const url = await opening
  assert.equal(await f.manager.open(f.exec), url)
  assert.equal(f.servers.length, 1)
  await f.dispose()
})

test('dispose aborts pending lifetime readiness and waits for socket closure without listening', async () => {
  const f = managerFixture({ pendingListen: true, pendingClose: true })
  const opening = f.manager.open(f.exec)
  const rejected = assert.rejects(opening, /aborted|closed/i)
  const server = await f.created.promise
  let closed = false
  const closing = f.dispose().then(() => { closed = true })
  await server.closeStarted.promise
  assert.equal(closed, false)
  assert.equal(server.closeCalls, 1)
  assert.equal(server.closeAllCalls, 1)
  await assert.rejects(f.manager.open(f.exec), /manager is closed/)
  server.finishClosing()
  await Promise.all([closing, rejected, f.manager.close()])
  assert.equal(closed, true)
  assert.equal(server.closeCalls, 1)
  server.finishListening()
  assert.equal(server.listening, false)
})
