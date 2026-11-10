#!/usr/bin/env node
// Runs the basivo-review engine (from the basivo-factory repo) with the right credentials.
//   node engine.mjs run  --account <gh login> --pr N [--dry-run --out FILE --json ...]
//   node engine.mjs post FILE --account <gh login>
//   node engine.mjs update            # pull the latest engine
// The engine lives in ~/.basivo-review/engine (cloned on first use). The GitHub token is read from `gh auth
// token -u <login>` inside this process and handed to the engine as GH_TOKEN; it is never printed.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HOME = join(homedir(), '.basivo-review')
const ENGINE = join(HOME, 'engine')
const REPO = process.env.BASIVO_REVIEW_ENGINE_REPO ?? 'https://github.com/mohamedabubasith/basivo-factory.git'
const REF = process.env.BASIVO_REVIEW_ENGINE_REF ?? 'main'

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
const out = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim()

function ensureEngine(update) {
  mkdirSync(HOME, { recursive: true })
  const major = Number(process.versions.node.split('.')[0])
  if (major < 24) {
    console.error(`basivo-review needs Node 24 or newer (found ${process.versions.node}).`)
    process.exit(1)
  }
  if (!existsSync(join(ENGINE, '.git'))) {
    console.error('Installing the review engine (one time)…')
    run('git', ['clone', '--quiet', '--depth', '1', '--branch', REF, REPO, ENGINE])
  } else if (update) {
    run('git', ['-C', ENGINE, 'pull', '--quiet', '--ff-only'])
  }
  const stamp = join(ENGINE, '.installed-lock')
  const lock = readFileSync(join(ENGINE, 'pnpm-lock.yaml'), 'utf8')
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== lock) {
    console.error('Installing engine dependencies…')
    run('corepack', ['pnpm', 'install', '--frozen-lockfile', '--silent'], { cwd: ENGINE, env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' } })
    writeFileSync(stamp, lock)
  }
}

const args = process.argv.slice(2)
const command = args.shift()
const take = flag => {
  const i = args.indexOf(flag)
  if (i === -1) return null
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}

if (command === 'update') {
  ensureEngine(true)
  console.log('engine updated')
  process.exit(0)
}
if (command !== 'run' && command !== 'post') {
  console.error('usage: engine.mjs run|post|update …')
  process.exit(2)
}

const account = take('--account')
const env = { ...process.env }
if (!env.GH_TOKEN && !env.GITHUB_TOKEN && account) env.GH_TOKEN = out('gh', ['auth', 'token', '-u', account])
const gitlab = args.includes('--gitlab')
if (gitlab && !env.GITLAB_TOKEN) {
  try { env.GITLAB_TOKEN = out('glab', ['auth', 'token']) } catch { /* the engine reports the missing token */ }
} else if (!gitlab && !env.GH_TOKEN && !env.GITHUB_TOKEN) {
  try { env.GH_TOKEN = out('gh', ['auth', 'token']) } catch { /* the engine reports the missing token */ }
}
// Remember the account for this repo.
if (account) {
  mkdirSync(HOME, { recursive: true })
  const file = join(HOME, 'config.json')
  const cfg = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const key = out('git', ['remote', 'get-url', 'origin']).replace(/^.*[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/, 'github.com/$1')
  cfg.accounts = { ...cfg.accounts, [key]: account }
  writeFileSync(file, JSON.stringify(cfg, null, 2))
}

ensureEngine(false)
run(process.execPath, [join(ENGINE, 'packages', 'review', 'src', 'cli.ts'), command, ...args], { env })
