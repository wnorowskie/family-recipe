# Research Docs

Outputs from `type: research` spikes. Each file captures a decision — not a narrative, not a log of what was tried.

## Purpose

Research spikes exist to answer specific questions before implementation starts. The doc produced is the durable artifact: it records the decision, the rationale, and anything a future implementer needs in order to build against it without redoing the investigation.

If the content belongs in product/architecture docs (e.g. [../PRODUCT_SPEC.md](../PRODUCT_SPEC.md), [../TECHNICAL_SPEC.md](../TECHNICAL_SPEC.md)), put it there instead. This directory is for spike outputs that inform a later decision.

## Naming

One file per spike, named after the topic:

```
docs/research/{topic}.md
```

Examples: `feature-flag-store.md`, `refresh-token-store.md`, `gcs-vs-r2-uploads.md`. Use kebab-case, no dates, no ticket numbers in the filename — link the issue from inside the doc instead.

## What a good research doc looks like

- **Starts with the decision.** Lead with the chosen option and a one-paragraph summary of why. A reader should know the answer before they know the alternatives.
- **Answers every question the ticket listed.** Use the ticket's "Questions to Answer" section as the spine of the doc.
- **Names the alternatives considered and why they were rejected.** Future-you will want to know whether option X was ruled out on merit or never looked at.
- **Includes anything the implementer needs to act on it** — a Prisma snippet, a config shape, an integration sketch, a cost estimate. Link to source material (RFCs, vendor docs, GitHub issues) rather than paraphrasing at length.
- **Is concise.** A good spike doc is 1–3 pages. If it is longer, the decision is probably buried.

## Workflow

1. Open a `type: research` ticket using the [issue template](../../.github/ISSUE_TEMPLATE/research.md) — list the specific questions up front.
2. Branch from `develop` as `research/{issue}/{topic}` per [.github/GITHUB_GUIDE.md](../../.github/GITHUB_GUIDE.md).
3. Commit the doc to `docs/research/{topic}.md` and open a PR.
4. On merge, close the ticket with a comment linking to the committed doc.
