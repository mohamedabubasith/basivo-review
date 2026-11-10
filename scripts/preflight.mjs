#!/usr/bin/env node
// What the review skill needs to know before it runs: which host, which repo, which CLI and which account.
// Prints one JSON object. Never prints a token.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const remote = sh('git', ['remote', 'get-url', 'origin']) ?? ''
// git@host:owner/repo.git | https://host/owner/repo.git | ssh://git@host/owner/repo
const m = /^(?:[\w.-]+@|\w+:\/\/(?:[\w.-]+@)?)?([\w.-]+)[:/](.+?)(?:\.git)?\/?$/.exec(remote)
const host = m?.[1] ?? null
const repo = m?.[2] ?? null
const forge = host === 'github.com' ? 'github' : host ? 'gitlab' : null

const configFile = join(homedir(), '.basivo-review', 'config.json')
const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {}
const remembered = repo ? config.accounts?.[`${host}/${repo}`] ?? null : null

const out = { forge, host, repo, branch: sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']), headSha: sh('git', ['rev-parse', 'HEAD']), remembered, configFile }

if (forge === 'github') {
  const status = sh('gh', ['auth', 'status'])
  out.cli = status === null && sh('gh', ['--version']) === null ? 'missing' : 'ok'
  const accounts = [...(status ?? '').matchAll(/Logged in to github\.com account (\S+)/g)].map(x => x[1])
  const active = /account (\S+) \(keyring\)\n\s+- Active account: true/.exec(status ?? '')?.[1] ?? accounts[0] ?? null
  out.accounts = accounts
  out.active = active
  out.tokenSource = process.env.GH_TOKEN ? 'env GH_TOKEN' : process.env.GITHUB_TOKEN ? 'env GITHUB_TOKEN' : accounts.length ? 'gh' : null
  out.install = { mac: 'brew install gh', windows: 'winget install GitHub.cli', linux: 'sudo apt install gh  # or see https://github.com/cli/cli#installation' }
  // The open pull request for the current branch, when there is one.
  const pr = sh('gh', ['pr', 'view', '--json', 'number,headRefOid,state'])
  out.currentPr = pr ? JSON.parse(pr) : null
} else if (forge === 'gitlab') {
  out.cli = sh('glab', ['--version']) ? 'ok' : 'missing'
  out.tokenSource = process.env.GITLAB_TOKEN ? 'env GITLAB_TOKEN' : out.cli === 'ok' && sh('glab', ['auth', 'token']) ? 'glab' : null
  out.help = `Create a project access token with the "api" scope at https://${host}/${repo}/-/settings/access_tokens and export GITLAB_TOKEN=...`
}

const engineDir = join(homedir(), '.basivo-review', 'engine')
out.engine = existsSync(join(engineDir, 'packages', 'review', 'src', 'cli.ts')) ? 'installed' : 'missing'
out.node = process.versions.node
console.log(JSON.stringify(out, null, 2))
