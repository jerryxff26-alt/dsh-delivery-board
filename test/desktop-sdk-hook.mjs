// Resolve only this plugin's peer imports to the installed desktop SDK.
// No runtime packages are copied or installed by the test runner.
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = process.env.DSH_DESKTOP_RUNTIME
if (!root) throw new Error('Run this test with npm run test:desktop')
const source = pathToFileURL(resolve(import.meta.dirname, '..') + '/').href
const peers = new Map([
  ['@deepseek-ai/dsh-tools', pathToFileURL(`${root}/node_modules/@deepseek-ai/dsh-tools/lib/index.js`).href],
  ['@deepseek-ai/schemastery', pathToFileURL(`${root}/node_modules/@deepseek-ai/schemastery/lib/index.mjs`).href],
])
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(source) && peers.has(specifier)) {
      return { url: peers.get(specifier), shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
