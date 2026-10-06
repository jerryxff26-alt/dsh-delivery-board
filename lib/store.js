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
  const cwd = exec?.agent?.session?.header?.cwd
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
  // Unconditional write: version guard omitted (verify with `dsh --dump-config` + a real call in smoke test)
  await ctx.fs.writeText(target, text, { signal: exec?.signal })
}
