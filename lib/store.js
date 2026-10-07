import { createHash } from 'node:crypto'

// dsh-delivery-board storage adapter — the only place that touches ctx.fs.
//
// Read path (resolve / stat / readText) follows the community tested guide;
// write path follows the official provider contract (deepseek-harness
// docs/subsystems/filesystem.md, "Write and edit guards"): writeText's version
// guard is optional — omitting it means unconditional create-or-overwrite.
// Note: fs-sandbox's workspace-write mode only allows writing under workspaceRoot
// / /tmp / tmpdir(), so the data file always lives at the session workspace root
// (config.fileName, default delivery.json).

export async function resolveTarget(ctx, exec, fileName) {
  const cwd = exec?.workspaceCwd ?? exec?.agent?.session?.header?.cwd
  return ctx.fs.resolve(fileName, { cwd, signal: exec?.signal })
}

export async function stateExists(ctx, exec, fileName) {
  const target = await resolveTarget(ctx, exec, fileName)
  const info = await ctx.fs.stat(target, exec?.signal)
  return !!info
}

export async function readState(ctx, exec, fileName) {
  const target = await resolveTarget(ctx, exec, fileName)
  const info = await ctx.fs.stat(target, exec?.signal)
  if (!info) return null
  if (info.type !== 'file') throw new Error(`delivery state path is not a file: ${fileName}`)
  const text = await ctx.fs.readText(target, exec?.signal)
  ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
  return JSON.parse(text)
}

export async function writeState(ctx, exec, fileName, state) {
  const target = await resolveTarget(ctx, exec, fileName)
  const text = JSON.stringify(state, null, 2) + '\n'
  // DSH v0.2: writeText(target, content, expected?, signal?).
  await ctx.fs.writeText(target, text, undefined, exec?.signal)
}

export async function writeText(ctx, exec, fileName, text) {
  const target = await resolveTarget(ctx, exec, fileName)
  await ctx.fs.writeText(target, text, undefined, exec?.signal)
}

// The opaque provider version guards disk writes. The content revision guards
// stale browser views without exposing SDK-specific version values to the UI.
const queues = new WeakMap()

async function locked(ctx, target, operation) {
  let pending = queues.get(ctx.fs)
  if (!pending) { pending = new Map(); queues.set(ctx.fs, pending) }
  const previous = pending.get(target.targetKey) ?? Promise.resolve()
  const current = previous.catch(() => {}).then(operation)
  pending.set(target.targetKey, current)
  try { return await current }
  finally { if (pending.get(target.targetKey) === current) pending.delete(target.targetKey) }
}

async function snapshotAt(ctx, exec, target, fileName) {
  const info = await ctx.fs.stat(target, exec?.signal)
  if (!info) throw new Error(`No delivery project yet. Initialize one with delivery_init first (data file: ${fileName}).`)
  if (info.type !== 'file') throw new Error(`delivery state path is not a file: ${fileName}`)
  const text = await ctx.fs.readText(target, exec?.signal)
  ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
  return { state: JSON.parse(text), revision: revisionOf(text), version: info.version }
}

export async function readSnapshot(ctx, exec, fileName) {
  const target = await resolveTarget(ctx, exec, fileName)
  const { state, revision } = await snapshotAt(ctx, exec, target, fileName)
  return { state, revision }
}

export async function mutateState(ctx, exec, fileName, mutate, expectedRevision) {
  const target = await resolveTarget(ctx, exec, fileName)
  return locked(ctx, target, async () => {
    exec?.signal?.throwIfAborted()
    const snapshot = await snapshotAt(ctx, exec, target, fileName)
    if (expectedRevision !== undefined && expectedRevision !== snapshot.revision) {
      const error = new Error('The board changed. Refresh before retrying; no changes were saved.')
      error.code = 'DELIVERY_STALE'
      throw error
    }
    const next = mutate(snapshot.state)
    if (next === snapshot.state) return { state: next, revision: snapshot.revision }
    const text = JSON.stringify(next, null, 2) + '\n'
    await ctx.fs.writeText(target, text, { kind: 'replaceIfVersion', version: snapshot.version }, exec?.signal)
    return { state: next, revision: revisionOf(text) }
  })
}

export async function initializeState(ctx, exec, fileName, create) {
  const target = await resolveTarget(ctx, exec, fileName)
  return locked(ctx, target, async () => {
    exec?.signal?.throwIfAborted()
    if (await ctx.fs.stat(target, exec?.signal)) throw new Error(`A delivery project already exists (${fileName}). Delete the file first to start over.`)
    const state = create()
    await ctx.fs.writeText(target, JSON.stringify(state, null, 2) + '\n', { kind: 'createIfAbsent' }, exec?.signal)
    return state
  })
}

function revisionOf(text) { return createHash('sha256').update(text).digest('hex') }
