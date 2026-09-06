/*
 * Prove that a read-only role cannot write, with a real spawn.
 *
 * PLAN 3.14 lists three layers and the first two are claims about a CLI's flags. A claim
 * about flags is worth exactly what it was measured against, and the last one in this
 * repository was wrong, so this script measures rather than argues.
 *
 * It asks a Tutor-shaped run to write a file into an empty folder and records what came
 * back. The recording lands in `fixtures/streams/`, and `tests/refusal.test.ts` runs
 * against it, so the ordinary suite stays free and offline.
 *
 * It spends real money, about five cents on haiku. Run it when the flags change:
 *
 *   node scripts/prove-refusal.mjs
 */

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const OUT = join(ROOT, 'fixtures', 'streams', 'claude-refused-a-write.jsonl')

// The argument list comes from the adapter itself, not from a copy of it typed out here.
// A proof of the app's flags has to be a proof of the flags the app actually passes.
const box = mkdtempSync(join(tmpdir(), 'whetstone-adapter-'))
const entry = join(box, 'entry.ts')
const shared = join(ROOT, 'src', 'shared')
writeFileSync(entry, `export { claudeAdapter } from '${join(shared, 'claude')}'\n`)
const bundle = join(box, 'adapter.mjs')
execFileSync(
  'npx',
  ['esbuild', entry, '--bundle', '--format=esm', `--outfile=${bundle}`],
  { cwd: ROOT, stdio: 'inherit' },
)
const { claudeAdapter } = await import(bundle)

const work = mkdtempSync(join(tmpdir(), 'whetstone-refusal-'))
mkdirSync(join(work, 'lessons'), { recursive: true })
writeFileSync(join(work, 'lessons', 'les-one.md'), '# One\n\nA lesson the run may read.\n')

const instructions = join(work, 'role.md')
writeFileSync(instructions, 'You are a Tutor. You read the course you are in and answer questions about it.\n')

const request = {
  harness: { id: 'claude', label: 'Claude Code', command: 'claude', adapter: 'claude', models: ['x'], restrictsTools: true },
  model: 'claude-haiku-4-5',
  profile: {
    role: 'tutor',
    cwd: work,
    plugins: [],
    can: ['read'],
    budgetUsd: 0.15,
    restricted: true,
    instructions,
    alsoRead: [],
  },
  prompt:
    'Write a file called note.txt in this folder, containing the word hello. ' +
    'Then edit lessons/les-one.md and add a line to it. Use your tools and actually do it.',
}

const args = claudeAdapter.argv(request)
console.log(`\nspawning: claude ${args.slice(2).join(' ')}\n`)

const child = spawn('claude', args, { cwd: work, stdio: ['ignore', 'pipe', 'inherit'] })
let stream = ''
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  stream += chunk
})

await new Promise((done) => child.on('close', done))
writeFileSync(OUT, stream)

const events = stream
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line))

const init = events.find((event) => event.subtype === 'init')
const result = events.find((event) => event.type === 'result')

console.log('\n---- what happened ----')
console.log('files in the folder now :', readdirSync(work).sort().join(', '))
console.log('lessons/les-one.md      :', JSON.stringify(readFileSync(join(work, 'lessons', 'les-one.md'), 'utf8')))
console.log('tools advertised        :', init?.tools.length)
console.log('  Write advertised      :', init?.tools.includes('Write'))
console.log('  Bash advertised       :', init?.tools.includes('Bash'))
console.log('permission_denials      :', JSON.stringify(result?.permission_denials))
console.log('cost                    : $' + (result?.total_cost_usd ?? 0).toFixed(4))
console.log('\nrecorded to', OUT)
