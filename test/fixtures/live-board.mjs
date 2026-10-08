// Browser regression harness only. Production /delivery open uses ctx.fs from
// DSH; this adapter writes synthetic test files and is not the plugin backend.
import fs from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createProject, addCard, appendLog, archiveCard } from '../../lib/delivery.js'
import { createBoardManager } from '../../lib/board-server.js'

const cwd = resolve(process.argv[2] ?? join(tmpdir(), 'dsh-delivery-board-web-regression'))
await fs.mkdir(cwd, { recursive: true })
const dataPath = resolve(cwd, 'delivery.json')
let exists = false
try { await fs.access(dataPath); exists = true } catch {}
if (!exists) {
  let state = createProject({ customer: 'Synthetic regression board', template: 'governance' })
  state = addCard(state, { title: 'SSO 登录交付', stage: 'design', owner: 'tester-a', due: '2026-10-20', acceptance: ['支持 SSO'], dod: ['需求评审完成'] })
  state = addCard(state, { title: '接口联调', stage: 'build', owner: 'tester-b', due: '2026-10-18' })
  state = addCard(state, { title: '已完成验收样例', stage: 'live', owner: 'tester-a' })
  state = archiveCard(state, { cardId: 'c3' })
  state = appendLog(state, { type: 'blocker', text: '等待虚构 UAT 环境', cardId: 'c1' })
  await fs.writeFile(dataPath, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' })
}
const versionOf = (text) => createHash('sha256').update(text).digest('hex')
const ctx = {
  emit() {},
  fs: {
    async resolve(file, { cwd: root }) {
      const targetKey = resolve(root, file)
      if (dirname(targetKey) !== cwd) throw new Error('Test fixture only permits the synthetic workspace root')
      return { targetKey, displayPath: file }
    },
    async stat(target) {
      try { const info = await fs.stat(target.targetKey); return { type: info.isFile() ? 'file' : 'directory', version: info.isFile() ? versionOf(await fs.readFile(target.targetKey, 'utf8')) : undefined } }
      catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
    },
    async readText(target, signal) { return fs.readFile(target.targetKey, { encoding: 'utf8', signal }) },
    async writeText(target, text, expected, signal) {
      signal?.throwIfAborted()
      const info = await this.stat(target)
      if (expected?.kind === 'createIfAbsent' && info) throw new Error('File already exists')
      if (expected?.kind === 'replaceIfVersion' && expected.version !== info?.version) throw Object.assign(new Error('File changed since read'), { code: 'FS_STALE_VERSION' })
      const temporary = `${target.targetKey}.test-write-${process.pid}`
      await fs.writeFile(temporary, text, { signal })
      signal?.throwIfAborted()
      await fs.rename(temporary, target.targetKey)
    },
  },
}
const manager = createBoardManager(ctx, { fileName: 'delivery.json' })
const url = await manager.open({ agent: { session: { id: 'browser-regression', header: { cwd } } } })
console.log(JSON.stringify({ url, dataPath, mode: 'synthetic browser regression fixture; not DSH UI integration' }))
process.stdin.resume()
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await manager.close(); process.exit(0) })
