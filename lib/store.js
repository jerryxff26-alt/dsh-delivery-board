import { createHash } from 'node:crypto'
import { LOG_TYPES } from './delivery.js'

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

function fail(fileName, message) {
  throw new Error(`${fileName}: ${message}`)
}

function requireString(fileName, path, value, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') fail(fileName, `${path} must be a string`)
  if (!allowEmpty && !value.trim()) fail(fileName, `${path} must be a non-empty string`)
}

function requireArray(fileName, path, value) {
  if (!Array.isArray(value)) fail(fileName, `${path} must be an array`)
}

// Lightweight shape check for hand-edited / corrupt delivery.json.
// Not a full JSON Schema engine — just enough to replace opaque TypeErrors.
export function validateState(data, fileName = 'delivery.json') {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    fail(fileName, 'expected a JSON object')
  }
  requireString(fileName, 'customer', data.customer)
  if (data.version !== undefined && (typeof data.version !== 'number' || !Number.isFinite(data.version))) {
    fail(fileName, 'version must be a finite number when present')
  }
  if (data.template !== undefined) requireString(fileName, 'template', data.template)
  requireArray(fileName, 'pipeline', data.pipeline)
  if (!data.pipeline.length) fail(fileName, 'pipeline must contain at least one stage')
  for (let i = 0; i < data.pipeline.length; i++) {
    const stage = data.pipeline[i]
    const base = `pipeline[${i}]`
    if (stage == null || typeof stage !== 'object' || Array.isArray(stage)) fail(fileName, `${base} must be an object`)
    requireString(fileName, `${base}.id`, stage.id)
    requireString(fileName, `${base}.name`, stage.name)
    if (stage.role !== undefined) requireString(fileName, `${base}.role`, stage.role, { allowEmpty: true })
    if (stage.gates !== undefined) {
      requireArray(fileName, `${base}.gates`, stage.gates)
      for (let g = 0; g < stage.gates.length; g++) {
        if (typeof stage.gates[g] !== 'string') fail(fileName, `${base}.gates[${g}] must be a string`)
      }
    }
    if (stage.gateDone !== undefined) {
      requireArray(fileName, `${base}.gateDone`, stage.gateDone)
      for (let g = 0; g < stage.gateDone.length; g++) {
        if (typeof stage.gateDone[g] !== 'boolean') fail(fileName, `${base}.gateDone[${g}] must be a boolean`)
      }
    }
  }
  requireArray(fileName, 'cards', data.cards)
  for (let i = 0; i < data.cards.length; i++) {
    const card = data.cards[i]
    const base = `cards[${i}]`
    if (card == null || typeof card !== 'object' || Array.isArray(card)) fail(fileName, `${base} must be an object`)
    requireString(fileName, `${base}.id`, card.id)
    requireString(fileName, `${base}.title`, card.title)
    requireString(fileName, `${base}.stage`, card.stage)
    if (card.owner !== undefined) requireString(fileName, `${base}.owner`, card.owner, { allowEmpty: true })
    if (card.due != null && typeof card.due !== 'string') fail(fileName, `${base}.due must be a string or null`)
    if (card.acceptance !== undefined) {
      requireArray(fileName, `${base}.acceptance`, card.acceptance)
      for (let a = 0; a < card.acceptance.length; a++) {
        if (typeof card.acceptance[a] !== 'string') fail(fileName, `${base}.acceptance[${a}] must be a string`)
      }
    }
    if (card.dod !== undefined) {
      requireArray(fileName, `${base}.dod`, card.dod)
      for (let d = 0; d < card.dod.length; d++) {
        if (typeof card.dod[d] !== 'string') fail(fileName, `${base}.dod[${d}] must be a string`)
      }
    }
    if (card.archivedAt != null && typeof card.archivedAt !== 'string') {
      fail(fileName, `${base}.archivedAt must be a string or null`)
    }
  }
  requireArray(fileName, 'logs', data.logs)
  for (let i = 0; i < data.logs.length; i++) {
    const entry = data.logs[i]
    const base = `logs[${i}]`
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) fail(fileName, `${base} must be an object`)
    requireString(fileName, `${base}.ts`, entry.ts)
    requireString(fileName, `${base}.type`, entry.type)
    if (!LOG_TYPES.includes(entry.type)) fail(fileName, `${base}.type must be one of ${LOG_TYPES.join(', ')}`)
    requireString(fileName, `${base}.text`, entry.text)
    if (entry.cardId != null && typeof entry.cardId !== 'string') fail(fileName, `${base}.cardId must be a string or null`)
    if (entry.resolvedAt != null && typeof entry.resolvedAt !== 'string') {
      fail(fileName, `${base}.resolvedAt must be a string or null`)
    }
  }
  if (data.lastCardNumber !== undefined && (typeof data.lastCardNumber !== 'number' || !Number.isInteger(data.lastCardNumber) || data.lastCardNumber < 0)) {
    fail(fileName, 'lastCardNumber must be a non-negative integer when present')
  }
  return data
}

function parseState(text, fileName) {
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`${fileName}: invalid JSON (${error.message})`)
  }
  return validateState(data, fileName)
}

export async function readState(ctx, exec, fileName) {
  const target = await resolveTarget(ctx, exec, fileName)
  const info = await ctx.fs.stat(target, exec?.signal)
  if (!info) return null
  if (info.type !== 'file') throw new Error(`delivery state path is not a file: ${fileName}`)
  const text = await ctx.fs.readText(target, exec?.signal)
  ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
  return parseState(text, fileName)
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
  return { state: parseState(text, fileName), revision: revisionOf(text), version: info.version }
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
