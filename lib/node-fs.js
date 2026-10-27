// Node.js filesystem adapter that mirrors the DSH ctx.fs surface used by store.js.
// Enables the same delivery domain + board HTTP stack without a DSH host.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

function revisionOf(text) {
  return createHash('sha256').update(text).digest('hex')
}

function toTarget(absPath) {
  return { targetKey: absPath, displayPath: absPath }
}

export function createNodeFs(rootDir) {
  const root = path.resolve(rootDir)
  const versions = new Map() // absPath -> opaque version string

  async function ensureVersion(abs) {
    if (!versions.has(abs)) {
      try {
        const text = await fs.readFile(abs, 'utf8')
        versions.set(abs, revisionOf(text))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    return versions.get(abs)
  }

  return {
    async resolve(fileName, { cwd } = {}) {
      const base = cwd ? path.resolve(cwd) : root
      const abs = path.resolve(base, fileName)
      // Keep writes inside the chosen workspace (same spirit as DSH sandbox).
      const rel = path.relative(root, abs)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Refusing to resolve path outside workspace: ${fileName}`)
      }
      return toTarget(abs)
    },

    async stat(target, signal) {
      signal?.throwIfAborted?.()
      try {
        const info = await fs.stat(target.targetKey)
        if (!info.isFile()) return { type: 'directory' }
        const version = await ensureVersion(target.targetKey)
        return { type: 'file', version: version ?? 'missing' }
      } catch (error) {
        if (error.code === 'ENOENT') return null
        throw error
      }
    },

    async readText(target, signal) {
      signal?.throwIfAborted?.()
      return fs.readFile(target.targetKey, 'utf8')
    },

    async writeText(target, text, expected, signal) {
      signal?.throwIfAborted?.()
      const abs = target.targetKey
      await fs.mkdir(path.dirname(abs), { recursive: true })

      if (expected?.kind === 'createIfAbsent') {
        try {
          const handle = await fs.open(abs, 'wx')
          try {
            await handle.writeFile(text, 'utf8')
          } finally {
            await handle.close()
          }
        } catch (error) {
          if (error.code === 'EEXIST') {
            throw Object.assign(new Error(`file already exists: ${abs}`), { code: 'FS_EXISTS' })
          }
          throw error
        }
        versions.set(abs, revisionOf(text))
        return
      }

      if (expected?.kind === 'replaceIfVersion') {
        const current = await ensureVersion(abs)
        if (current !== expected.version) {
          throw Object.assign(new Error('file changed since read'), { code: 'FS_STALE_VERSION' })
        }
      }

      await fs.writeFile(abs, text, 'utf8')
      versions.set(abs, revisionOf(text))
    },
  }
}

export function createStandaloneCtx(rootDir) {
  return {
    fs: createNodeFs(rootDir),
    emit() {},
  }
}
