# basivo-review

One reviewer for pull requests (GitHub now, self-hosted GitLab next). It reads the change, looks for real
problems from two angles, checks every candidate against the code in a fresh context, and then tells you
**ready to merge** or **needs changes**, with comments on the exact lines. It never approves or blocks a merge
itself.

Two ways to run it, same engine, same prompts:

| | How | When |
|---|---|---|
| **On the repo's CI** | Add [`review.yml`](https://github.com/mohamedabubasith/basivo-factory/blob/main/templates/review/github.yml) to `.github/workflows/` and the `CLAUDE_CODE_OAUTH_TOKEN` secret | Every pull request gets reviewed automatically |
| **From your terminal** | Install this Claude Code plugin and run `/basivo-review:review 42` | When you cannot change the repo's CI, or want to review before pushing comments |

## Install the plugin

```
/plugin marketplace add mohamedabubasith/basivo-plugins
/plugin install basivo-review@basivo
```

Needs: git, Node 24+, the GitHub CLI (`gh`) signed in. The first review clones the engine into
`~/.basivo-review/engine`.

## Use

```
/basivo-review:setup             # once per repo: writes .factory/knowledge/*.md and .factory/review.md, opens a PR
/basivo-review:review            # the pull request of the current branch
/basivo-review:review 42         # pull request #42 of this repo
/basivo-review:review https://github.com/owner/repo/pull/42
```

The skill shows the findings in the terminal first and asks before posting anything. With several `gh`
accounts it asks which one to use and remembers the answer per repository; it never changes your default
account.

## What the review does

1. **Gate**: skips drafts, closed and bot-authored pull requests; trims very large changes to the biggest files.
2. **Context**: the diff from the host, CI status, a secrets scan, and the team's rules (`.factory/review.md`)
   and knowledge (`.factory/knowledge/`) read from the base branch, never from the change itself.
3. **Find**: two independent passes (correctness and tests; security, data and project rules). Every finding
   must quote the code it is about.
4. **Pre-verify**: a quote that is not in the file, a line outside the diff, or trivial evidence is dropped
   without a model.
5. **Verify**: each surviving finding goes to a fresh verifier that starts from "this is probably a false
   positive" and must reason before it answers.
6. **Rank and post**: security, bugs and data problems first; at most 5 inline comments (the rest in the
   summary); one summary comment edited in place on every push, and no finding is posted twice.

Rules live in `.factory/review.md` on the main branch:

```yaml
---
verifier: claude          # codex when configured, for a second model family
max_comments: 5
block_on: [security, bug, data]
ignore: ["docs/**"]
---
# Review rules
- Money: round once, at the end (see docs/adr/0001-money.md).
```

Engine source: [basivo-factory/packages/review](https://github.com/mohamedabubasith/basivo-factory/tree/main/packages/review).
