# GitHub Usage Guide

How we use GitHub Issues, branches, commits, and PRs on family-recipe.

## Environments and release flow

- `main` — **production**. Only updated via release PRs from `develop`.
- `develop` — **dev environment**. All feature work lands here first.
- Feature branches are cut from `develop` and merged back into `develop`.
- To release, open a PR from `develop` → `main`. Only the repo owner cuts these.

---

## Principles

- Non-trivial work has a GitHub issue before it starts — trivial fixes (typos, one-line bugs) can skip the issue
- PRs exist even for solo work — they are a review checkpoint
- Commits reference the issue number when one exists

---

## Issues

### Ticket format

Tickets use the templates in [ISSUE_TEMPLATE/](ISSUE_TEMPLATE/) — one per type (`feature`, `chore`, `research`). The template applies the `type:` label automatically via frontmatter. See [TICKET_FORMAT.md](TICKET_FORMAT.md) for the rationale behind each section.

### When to create one

Before starting any feature, bug, research spike, or non-trivial chore. If you are about to write more than a few lines of code and there is no issue for it, create one first.

### Labels

The only required namespace is `type:`, which the issue templates apply automatically:

| Namespace | Labels                                   |
| --------- | ---------------------------------------- |
| `type:`   | `feature` · `bug` · `chore` · `research` |

Add extra labels freely (e.g. area or priority tags) when they help filter issues later — no strict taxonomy is enforced.

---

## Branches

### Naming convention

```
{type}/{issue-number}/short-description
```

Where `type` matches the ticket type: `feature`, `fix`, `chore`, or `research`. If there's no issue (trivial fix), omit the number: `fix/typo-in-readme`.

Examples:

```
feature/12/cooked-event-reactions
fix/18/recipe-importer-timeout
chore/7/upgrade-next-15
research/3/gcs-vs-r2-uploads
```

Always branch from `develop`. Never commit directly to `main` or `develop`.

---

## Commits

### Format

```
{type}: {description} (#{issue-number})
```

The `(#N)` suffix is optional when there is no issue.

Types:
| Type | Use for |
|------|---------|
| `feat` | New feature code |
| `fix` | Bug fix |
| `chore` | Config, tooling, setup |
| `refactor` | Code restructure, no behavior change |
| `test` | Tests only |
| `docs` | Documentation only |
| `research` | Research spike findings |

Examples (from this repo's history):

```
feat: add validation for recipe ingredient name and origin length
fix: test for case sensitivity update
refactor: Remove post_edited events and related logic from timeline handling
```

Keep commit subjects under 72 characters. Add a body for non-obvious context.

---

## Pull Requests

All work merges via PR — no direct pushes to `main` or `develop`.

### Workflow

1. Create a branch from `develop` using the naming convention above
2. Do the work, committing with issue references where applicable
3. Open a PR targeting `develop` — title matches the issue title
4. Body uses the template in [pull_request_template.md](pull_request_template.md)
5. Review the diff yourself before merging
6. Squash merge into `develop` to keep history clean
7. Delete the branch after merge
8. When ready to release, open a PR from `develop` → `main`. Release PRs use **merge commits**, not squash, so individual features stay visible in `main` history

### PR title format

```
{type}: {issue title} (#{N})
```

Example: `feat: cooked-event reactions (#12)`

### CI gates on every PR

`.github/workflows/ci.yml` runs typecheck, lint, tests, docker build, trivy scan, prisma validate, `npm audit`, dependency-review, semgrep, IaC scan, and gitleaks. Jobs are per-surface path-filtered: each always runs so required-check contexts report, but the expensive steps short-circuit when the relevant surface (`next` / `prisma` / `infra`) didn't change — see [Branch protection](#branch-protection) below. Separate workflows run for [apps/api/](../apps/api/) and [apps/recipe-url-importer/](../apps/recipe-url-importer/). All must pass before merging.

---

## Branch protection

`main` and `develop` are protected via GitHub branch protection rules. The configuration is applied via the REST API (see issue #30); ground-truth state is queryable via GraphQL (`branchProtectionRules`).

Shared settings on both branches:

- **PR required** — no direct pushes; all commits arrive via PR
- **Force pushes blocked** and **deletions blocked**
- **Strict status checks** — branch must be up-to-date with the base before merge
- **Conversation resolution required** — open review comments block merge
- **Required approving reviews: 0** — as a solo maintainer, self-merge is allowed
- **Admins not enforced** — the repo owner can bypass in genuine emergencies (use sparingly)

Required status checks (all live in [ci.yml](workflows/ci.yml), which runs on every PR): `typecheck`, `lint`, `test`, `e2e`, `build`, `container-scan`, `prisma-validate`, `prisma-drift-check`, `dependency-scan`, `sast-semgrep`, `iac-scan`, `secrets-scan`.

[ci.yml](workflows/ci.yml) uses a per-surface path filter: a top `changes` job computes `next` / `prisma` / `infra` booleans via `dorny/paths-filter`, and each downstream job wraps its expensive steps in an `if:` tied to the relevant flag. The job itself always runs (so the required-check context always reports), but when its surface is unchanged the steps short-circuit to a no-op `echo` and the job completes green. This is the "keep the required-check names attached to a job that always runs" pattern — a required check that never runs would permanently block merges, so we never let one go un-reported.

[api-ci.yml](workflows/api-ci.yml) and [recipe-url-importer-ci.yml](workflows/recipe-url-importer-ci.yml) are workflow-level path-filtered (`on.pull_request.paths`), so they only fire when their owning surface changes. Their job names (`lint`, `typecheck`, `test`, etc.) overlap with ci.yml's by design: when they do run, the shared-name required checks must pass under both workflows for the PR to merge.

Difference between branches:

- `develop` — **linear history required** (squash-merge only, matching the feature-PR workflow)
- `main` — **linear history not required** (release PRs from `develop` use merge commits so individual feature commits stay visible in `main` history)

---

## Research Spikes

Research issues are complete when:

1. A written summary is committed to `docs/research/{topic}.md` — see [docs/research/README.md](../docs/research/README.md) for conventions
2. The doc answers the questions listed in the issue
3. The issue is closed with a comment linking to the committed doc

Research docs are reference material for implementation decisions — keep them concise and decision-oriented.

---

## Creating issues mid-development

When work surfaces something that needs tracking:

1. Create the issue before context-switching to it
2. Pick the right template so the `type:` label is applied
3. Link it from the originating PR or commit
4. Reference it in future commits that address it
