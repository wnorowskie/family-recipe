# Phase 9 – Post-Production Tweaks & Hardening

This is a living checklist for follow-ups after the first production deployment. Scope is small, targeted fixes and polish.

## Tasks

- [✓] Signup 500 with Family Master Key (Google Secret Manager)
  - [✓] Capture stack trace and request payload.
  - [✓] Verify env loading/format from GSM; confirm master key hashing/compare path matches current code.
  - [✓] Add defensive error handling and logging around signup + master key verification.
- [✓] Uploaded images not persisting across sessions
  - [✓] Confirm storage backend (GCS bucket?) used in prod/dev; check signed URL TTLs and DB references.
  - [✓] Verify upload write/read after new session/app restart; fix persistence path or cleanup behaviors if deleting files.
  - [✓] Add regression check: upload → reload/sign back in → image still present.

- [✓] Nav bar “Add” button styling
  - [✓] Align color/hover/focus styles with the rest of the nav; verify mobile/desktop.
- [✓] Need to fix the dev cloud run authentication so that I can proxy / access on my local machine.

- [ ] FastAPI adoption path (infra + toggle)
  - [ ] Finalize deploy target (e.g., Cloud Run) and CI/CD workflow for FastAPI service.
  - [ ] Add frontend env toggle to select FastAPI vs monolith API, with safe default/fallback.
  - [ ] Run parity smoke tests before enabling in prod.
- [✓] User bug/suggestion submissions → notify me
  - [✓] Use email notifications (preferred); choose sender/service and auth method. -- Opted for a page in the admin user interface instead.
  - [✓] Add in-app form/link; include user id/email/context and rate-limit to avoid spam.
  - [✓] Wire notification delivery (email or webhook) and confirm it fires in prod. -- Will look at this via google alerts (via log message) instead.
- [ ] Improve user account management flows
  - [ ] Add password reset flow (email + token generation/validation).
  - [ ] Add email change flow (verify new email ownership).
  - [ ] Add account deletion flow (with confirmation).
- [ ] Add notifications for users
  - [ ] In-app notification center (UI + DB model).
  - [ ] Real-time alerts for key events (e.g., recipe comments, shares).
- [ ] Monitoring on Google Cloud
  - [ ] Set up uptime checks/log-based alerts for elevated 5xx, latency, and auth/signup failures.
  - [ ] Create dashboard(s) for traffic, errors, storage, and DB health.
- [ ] Custom domain
  - [ ] Pick domain and registrar/host (TBD); set DNS to hosting provider.
  - [ ] Configure HTTPS and redirects; update app URLs/envs and any hardcoded links.

## Notes

- Living list; add items as more post-launch issues surface.
- Prioritize signup 500 + image persistence first since they block users.
