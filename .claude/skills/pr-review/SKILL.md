---
name: pr-review
description: Review a GitHub PR in this repo against its linked issue(s), repo conventions in .github/GITHUB_GUIDE.md, and code quality. Use when the user says /pr-review, asks to review a PR, or hands you a PR number/URL.
---

# PR Review

Produce a structured, comment-ready review of a pull request in `wnorowskie/family-recipe`. Anchor feedback in the linked issue's acceptance criteria and the repo's documented conventions — not generic code-review platitudes.

## Resolving the target PR

Accept any of: PR number (`12`), full URL, or branch name. If the user gave none, default to the PR for the current branch.

```bash
gh pr view --json number,title,body,headRefName,baseRefName,author,state,url
```

If no PR exists for the current branch, stop and tell the user — do not guess.

## Step 1 — Fetch in parallel

Make these calls in a single message:

- `mcp__github__pull_request_read` (or `gh pr view <N> --json number,title,body,headRefName,baseRefName,author,state,url,commits,files`) — PR metadata + commits + files
- `gh pr diff <N>` — full diff
- `gh pr view <N> --comments` — existing review comments (avoid duplicating prior feedback)

## Step 2 — Resolve linked issues

Parse the PR body for `Closes #N`, `Fixes #N`, `Resolves #N`. Also extract the issue number from the branch name pattern `{type}/{N}/short-description`. Union both sets.

For each issue, fetch via `mcp__github__issue_read` or `gh issue view <N> --json number,title,body,labels,milestone,state`. Extract:

- The acceptance criteria / "Definition of done" section
- `type:` label — must match the branch and PR title prefix
- `phase:` and `area:` labels for context
- Milestone — should match the issue's phase

If the PR closes nothing, flag it: every PR in this repo should close an issue.

## Step 3 — Convention checks

Source of truth is [.github/GITHUB_GUIDE.md](../../../.github/GITHUB_GUIDE.md). Verify:

| Check               | Rule                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Branch name         | `{type}/{N}/short-description` where `type` ∈ {`feature`, `research`, `chore`} and matches the issue's `type:` label |
| PR title            | `{type}: {issue title} (#{N})` — type prefix matches the issue                                                       |
| PR body             | Has `## Summary`, `## Closes` with `Closes #N`, `## Test notes`                                                      |
| Commits             | Every commit on the branch matches `{type}: {description} (#{N})` and references the issue                           |
| Research PRs        | Add a `docs/research/{topic}.md` that answers the questions listed in the issue                                      |
| Direct main commits | None — work must merge via PR                                                                                        |

Read [.github/TICKET_FORMAT.md](../../../.github/TICKET_FORMAT.md) only if the issue body looks malformed.

## Step 4 — Review the diff

For each acceptance criterion in the issue, mark **met / partial / missing** with a one-line justification grounded in a specific file:line.

Then scan the diff for:

- **Scope creep** — changes not traceable to the issue's acceptance criteria
- **Missing scope** — acceptance criteria with no corresponding diff
- **Bugs / correctness** — obvious logic errors, off-by-ones, unhandled error paths at system boundaries
- **Security** — secrets in code, SQL injection, command injection, unauthenticated endpoints (relevant once `apps/api` exists)
- **Tests** — for `feature` and `fix` PRs, are there tests? For `research` and `docs`, skip
- **Dead code / over-engineering** — premature abstractions, unused exports, future-proofing
- **Repo-specific** — tech stack matches the documented stack in `CLAUDE.md`; no YouTube ingestion; no live-analysis features in MVP; recall-over-precision for action proposal code
- **Docs-only PRs** — factual accuracy, internal consistency, broken relative links

## Step 5 — Output

Print a single review in this exact shape. Do not wrap it in extra prose.

```markdown
# PR #<N> — <title>

**Linked issue(s):** #<N> — <title>
**Branch:** <branch> • **Author:** <author> • **Base:** <base>

## Issue alignment

- [criterion] — ✅ met · file:line
- [criterion] — ⚠️ partial · file:line — <what's missing>
- [criterion] — ❌ missing

## Convention checks

- Branch name: ✅ / ❌ <reason>
- PR title: ✅ / ❌
- PR body template: ✅ / ❌
- Commit messages: ✅ / ❌ <which commits fail>
- Closes link: ✅ / ❌

## Code feedback

- `path/to/file.ts:42` — <specific issue, with suggested fix if obvious>
- ...

## Out of scope / scope creep

- <changes not covered by the issue, or note "none">

## Suggested next steps

- <ordered, concrete actions before merge — or "ready to merge">
```

After printing, ask the user whether to post the review:

> Post this as a PR comment? (`gh pr comment <N> -F -` or `mcp__github__pull_request_review_write`)

Do **not** post automatically — leave that as an explicit user decision.

## Style rules

- Be terse. Bullets, not paragraphs. No restating the diff back.
- Every code-feedback bullet must cite `file:line`. If you can't, you don't have the evidence yet.
- Mark certainty: distinguish "this is wrong" from "worth a second look."
- Don't critique style choices the repo hasn't taken a position on.
- Skip anything already covered in existing review comments.
