---
name: review
description: Review a GitHub pull request or GitLab merge request from the terminal. Finds problems, verifies each against the code, shows the result, and posts inline comments only after the user says yes. Use when the user asks to review a PR/MR, "run basivo review", or /basivo-review:review.
argument-hint: [pr-number | pr-url]
allowed-tools: Bash(node *), Bash(git *), Bash(gh *), Read, AskUserQuestion
---

Review one pull request with the basivo-review engine. Arguments: `$ARGUMENTS`

Follow these steps in order. Do not skip the questions: nothing is posted without the user's yes.

## 1. Preflight

Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/preflight.mjs"` from the repository root and read the JSON.

- `forge` null: not a git repository with an `origin` remote. Say so and stop.
- GitHub (`forge` is `github`):
  - `cli` is `missing`: tell the user to install the GitHub CLI with the line in `install` for their OS, then sign in with `gh auth login`, and stop.
  - `tokenSource` null: tell the user to run `gh auth login` and stop.
  - `accounts` has more than one login and `remembered` is null: ask the user with AskUserQuestion which GitHub account to review as (list the logins; mark `active` as the default). The answer is the `--account` value below. With one login, or a `remembered` one, use it without asking.
- GitLab (`forge` is `gitlab`, any other host): `tokenSource` null means no `GITLAB_TOKEN` and no `glab` login; show the `help` line (where to create a project access token with the `api` scope) and stop. Otherwise add `--gitlab --host https://<host>` to every engine command below and leave out `--account`.

## 2. Which pull request

- A number or URL in the arguments: use that number (the last path segment of a URL).
- No arguments and `currentPr` is set: use `currentPr.number`.
- Otherwise ask the user for the pull request number.

## 3. Run the review

Run in the background and wait for it (it takes 2–6 minutes; do not call it with a short timeout):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/engine.mjs" run --account <login> --repo <repo> --pr <number> --dry-run --out /tmp/basivo-review-<number>.json [--repo-dir .]
```

Pass `--repo-dir .` only when `headSha` from preflight equals the pull request's head commit (the engine checks this too and falls back to the files at the head commit otherwise). The first run installs the engine into `~/.basivo-review/engine`, which takes about a minute.

When it finishes, read `/tmp/basivo-review-<number>.json` and show the user:
- the verdict line (ready to merge / needs changes),
- a table of findings: severity, `file:line`, claim, and the quoted evidence,
- how many candidates were dropped after verification, the notes, and the cost line.

If the JSON has `skipped`, say why and stop.

## 4. Post, only if asked

Ask with AskUserQuestion: post these comments on the pull request? Options: "Post inline comments and the summary", "Post only the summary", "Do not post".

- Post everything: `node "${CLAUDE_PLUGIN_ROOT}/scripts/engine.mjs" post /tmp/basivo-review-<number>.json --account <login> --repo <repo>`
- Summary only: edit the JSON first so `summaryOnly` holds everything that was in `inline` and `inline` is `[]`, then run the same post command.
- Do not post: say where the JSON and the logs are and stop.

Report the summary comment URL the command prints.

## Rules

- Never print, paste or log a token. The engine reads it from `gh` itself.
- Never run `gh auth switch`: the chosen account is passed with `--account` and the user's default stays as it was.
- Do not edit the code under review and do not fix the findings; this skill only reviews.
