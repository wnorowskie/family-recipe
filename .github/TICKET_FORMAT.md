# Ticket Format Guide

All tickets follow one of three formats depending on type. Apply the correct format based on the `type:` label.

---

## Feature Tickets (`type: feature`)

```markdown
**Ticket Description:**
As a [role]
I want to [action]
So that [outcome]

**Acceptance Criteria:**

- [observable outcome 1]
- [observable outcome 2]
- [observable outcome 3]

**Testing:**

- [what to verify and how]
- [edge case to exercise]
- [expected failure behavior]
```

---

## Research Spike Tickets (`type: research`)

```markdown
**Ticket Description:**
[What we are researching and why it matters to the project]

**Questions to Answer:**

- [specific question 1]
- [specific question 2]
- [specific question 3]

**Output:**
[What gets committed when this ticket is closed — e.g., a doc at docs/research/topic.md]

**Testing:**

- [how we know the research was sufficient]
- [which implementation tickets this should unblock]
```

---

## Chore Tickets (`type: chore`)

```markdown
**Ticket Description:**
[What needs to be set up or done and why it is needed]

**Tasks:**

- [ ] [concrete step 1]
- [ ] [concrete step 2]
- [ ] [concrete step 3]

**Testing:**

- [how to verify it is working correctly]
- [smoke test or observable outcome]
```

---

## Notes

- Acceptance Criteria describe **observable outcomes**, not implementation steps
- Testing describes **how to validate** the ticket is complete, not how to implement it
- Research outputs are always committed to `docs/research/` and linked in the closing comment
- Chore tasks use checkboxes so progress is visible directly in the ticket
