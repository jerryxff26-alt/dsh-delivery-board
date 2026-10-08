import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Only the packaged instruction asset is read here. Delivery state still goes through ctx.fs.
const skillUrl = new URL('../skills/delivery/SKILL.md', import.meta.url)

export function loadDeliverySkill() {
  const document = readFileSync(skillUrl, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(document)
  if (!match) throw new Error('Bundled delivery skill requires frontmatter and instructions')
  // This authored asset uses plain, single-line name/description fields, not arbitrary user YAML.
  const field = (name) => match[1].match(new RegExp(`^${name}: ([^\\r\\n]+)$`, 'm'))?.[1].trim()
  const name = field('name')
  const description = field('description')
  if (name !== 'delivery' || !description || !match[2].trim()) throw new Error('Invalid bundled delivery skill')
  return {
    name,
    description,
    content: match[2].trim(),
    source: 'plugin',
    provider: 'dsh-delivery-board',
    path: fileURLToPath(skillUrl),
    resourceBase: { kind: 'directory', path: fileURLToPath(new URL('./', skillUrl)) },
    invocation: { modelInvocable: true, userInvocable: true },
  }
}
