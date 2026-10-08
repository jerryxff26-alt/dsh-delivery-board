import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const app = process.env.DSH_DESKTOP_APP || '/Applications/DeepSeek Harness.app'
const executable = join(app, 'Contents/MacOS/DeepSeek Harness')
if (!existsSync(executable)) throw new Error('DSH desktop not found. Set DSH_DESKTOP_APP to the installed macOS .app directory.')
const runtime = join(app, 'Contents/Resources/app.asar/dsh')
const result = spawnSync(executable, [
  '--expose-internals', '--import', join(import.meta.dirname, 'desktop-sdk-hook.mjs'),
  '--test', join(import.meta.dirname, 'plugin.test.mjs'), join(import.meta.dirname, 'skill-desktop.test.mjs'),
], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_RUNTIME: runtime },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
