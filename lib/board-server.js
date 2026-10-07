// On-demand, loopback-only board bridge. Never serves arbitrary files or accepts
// a replacement JSON document: all mutations use the plugin's domain functions.
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { applyAction } from './actions.js'
import { readSnapshot, mutateState, resolveTarget } from './store.js'
import { renderBoardHtml } from './board-html.js'

function reply(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  })
  res.end(type === 'application/json' ? JSON.stringify(body) : body)
}

async function readBody(req) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 65536) throw Object.assign(new Error('Request body is too large'), { status: 413 })
    chunks.push(buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8')) }
  catch { throw new Error('Request body must be valid JSON') }
}

export function createBoardHandler({ ctx, exec, config, basePath, getOrigin }) {
  return async (req, res) => {
    try {
      const origin = getOrigin()
      if (req.headers.host !== new URL(origin).host) return reply(res, 403, { error: 'Invalid local host' })
      const path = new URL(req.url, origin).pathname
      if (req.method === 'GET' && path === basePath) {
        const snapshot = await readSnapshot(ctx, exec, config.fileName)
        return reply(res, 200, renderBoardHtml(snapshot.state, { endpoint: basePath, revision: snapshot.revision }), 'text/html')
      }
      if (req.method === 'GET' && path === `${basePath}/state`) {
        return reply(res, 200, await readSnapshot(ctx, exec, config.fileName))
      }
      if (req.method !== 'POST' || path !== `${basePath}/action`) return reply(res, 404, { error: 'Not found' })
      if (req.headers.origin !== origin) return reply(res, 403, { error: 'Only this local board may save changes' })
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return reply(res, 415, { error: 'Use application/json' })
      const body = await readBody(req)
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['action', 'args', 'revision'].includes(key))) throw new Error('Invalid action request')
      if (!['card', 'move', 'update', 'archive', 'restore'].includes(body.action)) throw new Error('Unsupported board action')
      if (typeof body.revision !== 'string' || !body.revision) throw new Error('A board revision is required; refresh before saving')
      const result = await mutateState(ctx, exec, config.fileName, (state) => applyAction(state, body.action, body.args), body.revision)
      return reply(res, 200, result)
    } catch (error) {
      const status = ['DELIVERY_STALE', 'FS_STALE_VERSION'].includes(error.code) ? 409 : error.status ?? 400
      return reply(res, status, { error: error.message })
    }
  }
}

async function waitForReady(ready, signal) {
  if (!signal) return ready
  let onAbort
  const cancelled = new Promise((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([ready, cancelled]) }
  finally { signal.removeEventListener('abort', onAbort) }
}

// The optional factory is a test seam; production always uses node:http.
export function createBoardManager(ctx, config, { createServer: createHttpServer = createServer } = {}) {
  const boards = new Map()
  let disposed = false
  let closing
  function checkOpen(signal) {
    if (disposed) throw new Error('The delivery board manager is closed')
    signal?.throwIfAborted()
  }
  function stop(entry) {
    if (!entry.closing) {
      entry.controller.abort()
      entry.closing = new Promise((resolve) => {
        entry.server.close(resolve)
        entry.server.closeAllConnections()
      })
    }
    return entry.closing
  }
  function close() {
    disposed = true
    if (!closing) {
      const entries = [...boards.values()]
      boards.clear()
      closing = Promise.all(entries.map(stop)).then(() => {})
    }
    return closing
  }
  ctx.effect?.(() => close, 'delivery-board local HTTP lifecycle')
  return {
    close,
    async open(exec) {
      const signal = exec?.signal
      checkOpen(signal)
      const workspaceCwd = exec?.agent?.session?.header?.cwd
      if (typeof workspaceCwd !== 'string') throw new Error('Opening a delivery board requires a session workspace cwd')
      const boardConfig = { fileName: config.fileName }
      const openExec = { ...exec, workspaceCwd }
      const sessionId = exec.agent.session.id ?? ''
      await readSnapshot(ctx, openExec, boardConfig.fileName)
      checkOpen(signal)
      const target = await resolveTarget(ctx, openExec, boardConfig.fileName)
      checkOpen(signal)
      const key = `${sessionId}:${target.targetKey}`
      let entry = boards.get(key)
      const created = !entry
      if (!entry) {
        const controller = new AbortController()
        const basePath = `/board/${randomBytes(24).toString('hex')}`
        entry = { controller }
        const serverExec = { ...openExec, signal: controller.signal }
        let origin
        const handle = createBoardHandler({ ctx, exec: serverExec, config: boardConfig, basePath, getOrigin: () => origin })
        const server = createHttpServer((req, res) => { void handle(req, res) })
        entry.server = server
        entry.ready = new Promise((resolve, reject) => {
          const onAbort = () => reject(controller.signal.reason)
          const onError = (error) => { controller.signal.removeEventListener('abort', onAbort); reject(error) }
          controller.signal.addEventListener('abort', onAbort, { once: true })
          server.once('error', onError)
          server.listen(0, '127.0.0.1', () => {
            server.off('error', onError)
            controller.signal.removeEventListener('abort', onAbort)
            if (disposed || controller.signal.aborted) return reject(controller.signal.reason ?? new Error('The delivery board manager is closed'))
            origin = `http://127.0.0.1:${server.address().port}`
            entry.url = `${origin}${basePath}`
            server.unref()
            resolve(server)
          })
        })
        boards.set(key, entry)
      }
      try {
        await waitForReady(entry.ready, signal)
        checkOpen(signal)
        entry.controller.signal.throwIfAborted()
        return entry.url
      } catch (error) {
        // An aborted reuse must not stop a board owned by an earlier command.
        if (created) {
          await stop(entry)
          if (boards.get(key) === entry) boards.delete(key)
        }
        throw error
      }
    },
  }
}
