import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { loadDeliverySkill } from '../lib/skill.js'
import { commandHelp, registerDeliveryCommand } from '../lib/commands.js'
import { renderBoardHtml } from '../lib/board-html.js'
import { addCard, createProject } from '../lib/delivery.js'

test('bundled skill exposes canonical metadata, portable resources and English planning instructions', () => {
  const skill = loadDeliverySkill()
  const source = readFileSync(skill.path, 'utf8')
  assert.equal(skill.name, 'delivery')
  assert.match(source, new RegExp(`^name: ${skill.name}$`, 'm'))
  assert.ok(source.includes(`description: ${skill.description}\n`))
  assert.equal(skill.resourceBase.kind, 'directory')
  assert.equal(skill.resourceBase.path.replace(/[/\\]$/, ''), dirname(skill.path))
  assert.deepEqual(skill.invocation, { modelInvocable: true, userInvocable: true })
  assert.doesNotMatch(skill.content, /^---/)
  assert.doesNotMatch(skill.content, /\p{Script=Han}/u)
  for (const name of ['delivery_init', 'delivery_card', 'delivery_move', 'delivery_board', 'delivery_open', 'delivery_update', 'delivery_archive', 'delivery_restore', 'delivery_board_html', 'delivery_log', 'delivery_weekly']) assert.ok(skill.content.includes(name), name)
})

test('skill distinguishes repository-grounded proposals from authorized persisted operations', () => {
  const { content } = loadDeliverySkill()
  for (const phrase of ['Plan before bulk creation', 'repository', 'external blockers', 'Get approval for the proposed batch', 'unknown due dates unset', 'do not initialize again or blindly recreate cards', 'A write failure or stale-state conflict is not success', 'not permission']) {
    // The initialization boundary is stated as "do not treat it as permission".
    if (phrase === 'not permission') assert.match(content, /do not treat it as permission/)
    else assert.ok(content.includes(phrase), phrase)
  }
  assert.match(content, /week_start/)
  assert.match(content, /week_label.*heading/)
  assert.match(content, /human-confirmed\/display-only/)
  assert.match(content, /Do not substitute shell commands or direct JSON edits/)
})

test('only the advanced command namespace bypasses the model', async () => {
  const registered = []
  let calls = 0
  registerDeliveryCommand({ commands: { register(command) { registered.push(command) } } }, async () => { calls++; return 'done' })
  assert.deepEqual(registered.map(command => command.name), ['delivery-admin'])
  assert.match(commandHelp, /\/delivery-admin open/)
  assert.doesNotMatch(commandHelp, /\/delivery\s+(?:init|move|help|open)/)
  const command = registered[0]
  assert.equal((await command.handler({ rawInput: 'help' })).kind, 'success')
  assert.equal(calls, 0)
  assert.equal((await command.handler({ rawInput: 'Plan this repository' })).kind, 'error')
  assert.equal(calls, 0)
})

test('read-only board guidance and copied handoffs use advanced commands, not skill prompts', () => {
  const state = addCard(createProject({ customer: 'Skill Demo', template: 'governance' }), { title: 'API', stage: 'build' })
  const html = renderBoardHtml(state)
  assert.match(html, /\/delivery-admin open/)
  assert.match(html, /data-cmd="\/delivery-admin move c1 test"/)
  assert.doesNotMatch(html, /\/delivery (?:open|move|help)/)
})
