# Path to a Mobile App for family-recipe

Research output for [#48](https://github.com/wnorowskie/family-recipe/issues/48).

> **Revised 2026-08-24** ([#288](https://github.com/wnorowskie/family-recipe/issues/288)) for the post-Phase-4 architecture. The original version of this doc argued the native route was blocked on "FastAPI migration Phase 1" token auth. That migration is done — FastAPI is the sole backend in prod as of the Phase 4 cutover (release [#263](https://github.com/wnorowskie/family-recipe/issues/263), 2026-08-23) — and the gating premise no longer holds. This revision corrects dead file references, reworks the native-client analysis around the current auth/proxy shape, and keeps the PWA-first recommendation but rests it on cost rather than on a blocker that no longer exists.

## Decision

**Ship a PWA first.** Add a web app manifest, a minimal service worker, and iOS/Android install affordances to the existing Next.js app. Target ~1–2 days of work, zero backend change, zero app-store cost, and no risk to the auth or upload flows that are already working for real family users.

Treat a Capacitor wrapper or a React Native / Expo client against FastAPI as **future options** that only get picked up if a concrete user-visible gap justifies the cost. Unlike the original version of this doc, native is **not gated on anything today** — see "Native / cross-platform route" below. It's simply more work (rebuilding ~6–8 screens) for a benefit (push, native feel) that PWA mostly covers on Android and partially covers on iOS. The one capability neither PWA nor a bare native client gets you for free is **push notifications**, which is backend work independent of client technology — see "Why PWA first" below.

## Comparison of the three paths

| Dimension                         | PWA (Next.js + manifest + SW)                      | Capacitor wrapper                                                 | Native / cross-platform (Expo RN) vs FastAPI                                                                                            |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Reuses existing UI                | 100% — same Next.js app                            | ~95% — Next app rendered inside WKWebView / Android WebView       | 0% — rebuild all screens in RN                                                                                                          |
| Backend changes                   | None                                               | None (same cookie + same-origin API)                              | None for the baseline — token auth already ships prod-wide; new backend work only if we want push (see gaps below)                      |
| Auth change                       | None                                               | None — WKWebView honors `httpOnly`+`secure` cookies for same host | Swap cookie for `Authorization: Bearer`; client must scrape + replay the refresh cookie itself (see gaps below)                         |
| Photo upload                      | `<input capture>` → `POST /v1/posts` → GCS         | Same as PWA; optional `@capacitor/camera` for gallery UX          | `expo-image-picker` → multipart `POST /v1/posts` (already exists, does EXIF strip + 2048px resize server-side — no new endpoint needed) |
| iOS push notifications            | iOS 16.4+ only, requires home-screen install first | Full APNs via `@capacitor/push-notifications`                     | Full APNs via `expo-notifications` — but device-token registration + dispatch is new backend work regardless of client choice           |
| App-store distribution            | None — add to home screen                          | Apple $99/yr + Google $25 one-time (TestFlight for family)        | Same as Capacitor                                                                                                                       |
| "Feels like an app"               | Good on Android; OK on iOS once installed          | Good on both                                                      | Best — native gestures, navigation, splash                                                                                              |
| T-shirt size                      | **S** (1–2 days)                                   | **M** (1–2 weeks incl. Xcode/Android setup + paid Apple account)  | **M/L** (~3–6 weeks: 6–8 screens rebuilt in Expo; not gated on anything)                                                                |
| Fits "minimal, non-breaking" rule | Yes                                                | Yes, but ships a new distribution channel                         | No — adds a second client codebase to keep in sync, even though auth itself is unchanged                                                |

## Why PWA first

- The app is already working for real family users ([CLAUDE.md](../../CLAUDE.md) flags "testing with real family users, prefer minimal, non-breaking changes"). A PWA costs nothing to try and can be reverted without touching a data flow.
- Auth is FastAPI-issued `refresh_token` (httpOnly) + `csrf_token` cookies, both host-scoped same-origin; the Next middleware ([src/proxy.ts](../../src/proxy.ts)) only checks presence of `refresh_token` via [`hasRefreshTokenFromRequest`](../../src/lib/session-core.ts), never decodes it. The client mints a short-lived in-memory access token via `/api/auth/bootstrap`. None of this changes under `display: standalone` — it's the same cookie jar. (The old Next-signed `session` JWT and the `src/lib/jwt.ts` / `src/lib/apiAuth.ts` helpers that set it were deleted in the Phase 4.4 cutover; there is no longer a Next-side session cookie to reason about.)
- Photo flow ([src/lib/uploads.ts](../../src/lib/uploads.ts)) uses an HTML file input on the client and a multipart `POST /v1/posts` request, forwarded same-origin through the `/v1/*` proxy ([src/app/v1/[...path]/route.ts](../../src/app/v1/%5B...path%5D/route.ts)) to FastAPI. Mobile browsers accept `<input type="file" accept="image/*" capture="environment">` and open the native camera directly — no code change. (`/api/posts` no longer exists — the Next `/api/*` data routes were deleted in the Phase 4.3 cutover, #231.)
- No app-store paperwork, no Apple $99/yr tax, no developer account, no review cycle.
- The only "app-like" capabilities we'd give up vs. a native shell are push notifications, background sync, and deeper share-sheet integration — none of which V1 uses today (per [docs/PRODUCT_SPEC.md](../PRODUCT_SPEC.md) and [docs/V1_DETAILED_SUMMARY.md](../V1_DETAILED_SUMMARY.md)). Push is the one gap that isn't a client-technology question at all — see "Native / cross-platform route" below.

## Answers to the ticket questions

### PWA route — what needs to be added

Minimum for "installable and feels-like-an-app":

1. **Web App Manifest** at `/manifest.webmanifest` with `name`, `short_name`, `start_url: '/'`, `display: 'standalone'`, theme/background colors, and a 192×192 + 512×512 icon set (maskable variants for Android adaptive icons). Link from `<head>` in [src/app/layout.tsx](../../src/app/layout.tsx).
2. **Service worker** — keep it tiny. A network-first handler for navigation requests + a cache-first handler for `/icons/*` and static asset URLs is enough. Do **not** try to cache `/v1/*` responses (the data plane, proxied to FastAPI — see "Native / cross-platform route" below): family scoping and signed GCS URLs both expire, and a stale cache would show the wrong user's data or 403 on photos. [next-pwa](https://github.com/shadowwalker/next-pwa) is the usual path, but a hand-rolled SW (~30 lines) avoids a dependency.
3. **Install prompt affordance** — a small "Add to Home Screen" hint on iOS (since iOS never fires `beforeinstallprompt`) and a custom install button on Android that listens for `beforeinstallprompt`, stashes the event, and prompts on tap. Dismiss once per user + cookie.
4. **Viewport + status bar** — already set in [src/app/layout.tsx](../../src/app/layout.tsx); add `apple-mobile-web-app-capable` and `apple-mobile-web-app-status-bar-style` so iOS home-screen launches hide the Safari chrome.
5. **Favicon / apple-touch-icon** — add a 180×180 `apple-touch-icon.png` to [public/](../../public/).

**Known iOS PWA limitations (as of iOS 17.4 / 18.x):**

- **Web Push** works from iOS 16.4+, but **only after the user installs the PWA to the home screen**. [webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). V1 doesn't send push yet, so this is only relevant if/when we wire up the `Notification` model ([prisma/schema.postgres.prisma](../../prisma/schema.postgres.prisma)).
- **No `beforeinstallprompt` on iOS** — Safari requires the user to tap Share → Add to Home Screen manually. A one-time tip banner is the usual workaround.
- **Camera access via `<input capture>` works**; the full `MediaDevices.getUserMedia` API also works in standalone PWAs on iOS 16+.
- **Storage quota** is capped at ~50 MB on iOS until the user explicitly grants more via the PWA. Not relevant for us — we don't store anything client-side today.
- **Service worker** is evicted after ~7 days of no PWA use on iOS. Subsequent launches re-register it transparently.
- **No background sync** and **no periodic sync** — queued-while-offline posts would need a foreground retry loop, not Background Sync API.

Android Chromium PWAs have none of these caveats: push, install prompt, WebAPK wrapping, and background sync all work.

### Wrapper route — Capacitor

[Capacitor](https://capacitorjs.com/) wraps a web app in a native shell, with JS bridges for camera / push / filesystem. Two sub-options:

- **(a) Load the remote URL.** The shell is a near-empty project whose `webDir` loads `https://familyrecipe.xyz` directly. This keeps Next.js rendering server-side on Cloud Run — no change to how the app is built or deployed. Auth is the same cookie flow; WKWebView honors `httpOnly` cookies per host.
  - **App Store risk:** Apple's Review Guideline 4.2 ("Minimum Functionality") has historically rejected apps that are pure WebView wrappers with no native functionality. Adding at least one native capability (push, camera plugin, share) usually clears review. Not a blocker — lots of shipped apps take this path — but worth knowing.
- **(b) Static export + bundled assets.** Requires converting the Next app to `output: 'export'`. Our app uses server components, dynamic routes, and server-side session reads (see [src/proxy.ts](../../src/proxy.ts) and [CLAUDE.md](../../CLAUDE.md#architecture-the-things-that-span-files) — "default to server components for data fetching"). Static export would force a large refactor to client-only fetching. **Reject.**

**What Capacitor actually buys us over a PWA:**

- iOS push notifications without the "install first" prerequisite.
- `@capacitor/camera` for native camera UX (shot-to-upload, multi-select, gallery browser) — modestly nicer than `<input capture>`.
- Native share-target integration (receive images from Photos → family-recipe).
- App-store presence (findability, trust).

**What Capacitor does _not_ solve:** it doesn't give us offline, doesn't replace the auth story, doesn't touch the backend. Anything a PWA can't do because of iOS Safari policy (push before install, background sync), Capacitor can; anything the PWA can do, Capacitor also can. So the decision is purely about iOS push + app-store presence vs. the cost of maintaining a wrapper + paying Apple.

**Auth inside WKWebView:** same-origin cookies work. Cross-origin third-party cookies get blocked by ITP, but we're same-origin so not applicable. No auth code change needed at all — WKWebView carries the same `refresh_token`/`csrf_token` cookie pair the browser PWA uses.

### Native / cross-platform route — Expo RN (or Flutter) against FastAPI

FastAPI is the sole production backend as of the Phase 4 cutover, and **a native client can already reach it with no backend or infra change.** The mechanism:

- [`fetchUpstream`](../../src/lib/apiUpstream.ts#L160) — the function the `/v1/*` proxy uses to call FastAPI server-to-server — passes the caller's `Authorization` header through untouched. The Cloud Run IAM assertion rides on a _separate_ header, `X-Serverless-Authorization`, which Cloud Run consumes and strips before the container sees it, so the two headers never collide.
- The `/v1/*` catch-all proxy ([src/app/v1/[...path]/route.ts](../../src/app/v1/%5B...path%5D/route.ts)) is deliberately outside the [src/proxy.ts](../../src/proxy.ts) middleware matcher — there is no `/v1` entry in `config.matcher` — so it is publicly reachable and does no session gating itself; FastAPI is what authenticates the bearer token.

Put together: an Expo client can call `https://<prod-host>/v1/posts` with `Authorization: Bearer <accessToken>` **today**, get proxied through to FastAPI, and receive a normal JSON response. There is no Phase 1 to wait for, no `/v1/uploads/sign` endpoint to build — `POST /v1/posts` is already multipart with server-side EXIF strip and 2048px resize (`apps/api/src/routers/v1/posts.py`), which is a direct fit for `expo-image-picker` → `FormData` → `fetch`.

**What actually remains — three specific, small gaps, not a rebuild of auth:**

1. **The refresh token is never in a response body.** `AuthTokenResponse` and `AccessTokenResponse` ([apps/api/src/schemas/auth_v1.py](../../apps/api/src/schemas/auth_v1.py)) return only `accessToken` (+ `user` on login/signup) — the refresh token is delivered exclusively via an httpOnly `Set-Cookie: refresh_token=...`. A browser handles that invisibly; a native HTTP client does not get an implicit cookie jar the way a browser does, so the client must read the `Set-Cookie` header itself off the login/signup response and persist the value (e.g. in `expo-secure-store`), then replay it as a `Cookie` header on `/v1/auth/refresh` calls. This is a few dozen lines, not a new auth model — but it's manual work a browser gives you for free.
2. **The CSRF double-submit check is mandatory and browser-shaped.** `POST /v1/auth/refresh` and `GET /v1/auth/session` both require a `csrf_token` cookie value echoed back as `X-CSRF-Token` ([apps/api/src/routers/v1/auth.py:382](../../apps/api/src/routers/v1/auth.py#L382) and the equivalent check in `session`). This defends against a threat model (cross-site cookie-riding browsers) that doesn't really apply to a bearer-token native client, but the check is unconditional on the server today — the native client still has to scrape and replay `csrf_token` alongside `refresh_token` to call `/refresh` at all. Not a blocker, just friction worth naming rather than hand-waving away.
3. **No push infrastructure exists.** `apps/api/src/routers/v1/notifications.py` is in-app, polling-only — there is no device-token registry and no APNs/FCM dispatch anywhere in the stack. This is true regardless of which client technology reaches it.

None of the three requires FastAPI schema changes or a new Phase; (1) and (2) are native-client-side integration work against the existing contract, and (3) is new backend work that a Capacitor wrapper would need too if it wanted push before install (see "Wrapper route" above).

Recommended stack if this path is picked: **Expo (React Native)** — file-based routing, `expo-secure-store` for the refresh token, `expo-image-picker` for the camera, `expo-notifications` for APNs/FCM (once (3) above is built), OTA updates via EAS Update. Flutter is fine too but has no in-repo shared-code story — Expo + RN can generate a typed client straight from [apps/api/openapi.snapshot.json](../../apps/api/openapi.snapshot.json) (OpenAPI 3.1, 32 paths, kept in sync with the live API by the `openapi-diff` CI job in [api-ci.yml](../../.github/workflows/api-ci.yml)), so contract drift between the mobile client and the backend fails CI instead of failing silently at runtime.

**Push notifications are the actual decision fork — not PWA vs. native.** Every path (PWA, Capacitor, Expo) needs the same new backend capability — device-token registration and an APNs/FCM dispatch path — before "gets a notification without opening the app" is possible on iOS. Client technology only changes _how_ that capability gets consumed, not whether it has to be built.

### Photo upload across all three paths

| Path      | Client side                                                   | Server side                                                 |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| PWA       | `<input type="file" accept="image/*" capture="environment">`  | No change — existing `POST /v1/posts` via the `/v1/*` proxy |
| Capacitor | Either `@capacitor/camera` plugin **or** the HTML input above | No change                                                   |
| Native RN | `expo-image-picker` → multipart `POST /v1/posts` directly     | No change — same multipart handler, no new endpoint needed  |

All three paths land in GCS via the same EXIF-strip/resize + signing logic (`apps/api/src/multipart_uploads.py`, mirroring [generateSignedUrlV4](../../src/lib/uploads.ts#L174) on the Next side). None of them break the contract that the DB stores `storageKey`, never URLs.

### App-store logistics for a private family app

**iOS: there is no free path.** Apple's options:

- **Apple Developer Program — $99/year.** Required for TestFlight (internal up to 100 testers, no public listing required) and Ad-Hoc distribution (100 devices/year/device-type). Either works for a family of <20 with zero App Store review friction.
- **Free provisioning profile (Xcode sideload).** 7-day app expiry. Re-sign every week. Viable for a developer, not for family users.
- **Apple Enterprise Program — $299/year.** Explicitly forbidden for public/family use. Not applicable.
- **AltStore / Sideloadly** — requires the user's Apple ID and expires every 7 days unless automated. Not consumer-friendly.

**Android: $25 one-time** Play Console fee for public listings, or free sideload of a signed APK (Android happily installs any APK the user explicitly approves). For a family install, sideloading the APK via a link is fine.

**Net:** PWA = $0. Wrapper or native = $99/year + $25 one-time for a realistic family-install story. The paid tier is unavoidable on iOS for any native distribution.

### Effort estimate

| Path      | T-shirt | What's inside                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PWA       | **S**   | Manifest, SW (~30 lines), icons, install-prompt hint. ~1–2 days.                                                                                                                                                                                                                                                                                                                                                             |
| Capacitor | **M**   | Initial Capacitor project, Xcode + Android Studio setup, paid Apple dev account, basic native plugins (push, camera), TestFlight upload. ~1–2 weeks elapsed.                                                                                                                                                                                                                                                                 |
| Native RN | **M/L** | Not gated on anything. Rebuild ~6–8 screens in Expo (login/signup, timeline, post detail, add/edit post with camera, recipe detail, profile/family members, notifications), wire the refresh-cookie-scrape + CSRF replay from the gaps above, generate a typed client from `openapi.snapshot.json`, app-store submission. ~3–6 weeks elapsed. Push notifications are a separate, additional backend effort under any client. |

### Recommendation & next step

**Ship the PWA (Issue TBD — implementation ticket to follow this spike).** It's the lowest-risk, cheapest, and fastest path to a mobile experience that is materially better than "open Safari and type the URL." If a real family user hits a concrete limitation (the likely ones: wanting push notifications, or camera flows that feel clunky), we revisit Capacitor or native as the next step — keeping the same backend, same auth, same upload flow.

We explicitly do **not** recommend starting a native client now — not because it's blocked (it isn't: see "Native / cross-platform route" above), but because it's ~3–6 weeks of screen-rebuilding for capabilities the PWA mostly already covers, and it adds a second UI codebase that needs to stay in sync with the web. That's a cost/benefit call, not a technical gate.

**Immediate follow-ups if this doc is accepted:**

1. File an implementation ticket: "feat: make family-recipe installable as a PWA" — scope covers the 5 items in the PWA section above.
2. Leave this doc as the record of _why_ we're going PWA-first on cost, not on a blocker. Revisit if push notifications become a concrete ask (that's new backend work under every path — see above) or a family user hits a specific native-only gap.

## Alternatives considered (and rejected)

| Option                                                                           | Why rejected                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start with a Capacitor wrapper                                                   | Costs $99/yr and introduces an App Store surface for a problem (push, better camera) we don't yet have. PWA is the strictly-smaller first experiment.                                                                                                                                          |
| Start with Expo / native RN now                                                  | Not blocked technically (see above), but ~3–6 weeks of screen-rebuilding for capabilities the PWA mostly covers, and doubles the UI codebase to maintain while real family users are onboarding. A cost call, not a gating call.                                                               |
| Flutter instead of RN                                                            | No shared-types story with the rest of the repo (TypeScript + Zod, or the OpenAPI snapshot). Expo wins on code reuse even if Flutter wins on raw perf.                                                                                                                                         |
| Static-export the Next app + bundle into Capacitor                               | Requires dropping server components; large refactor against an app that's working for real users today.                                                                                                                                                                                        |
| ~~Progressive rollout: PWA now, native later, once the backend supports tokens~~ | **Superseded, not rejected.** This is now simply the plan: FastAPI token auth already ships prod-wide, so "native later" is available whenever we want it, not gated on a future migration phase. The original rejection reasoning (do it after Phase 1) is obsolete now that Phase 1 shipped. |

## Sources

- [MDN: Progressive web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [WebKit — Web Push for Web Apps on iOS and iPadOS (16.4+)](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [web.dev — Installable PWAs on iOS](https://web.dev/learn/pwa/installation)
- [Capacitor docs](https://capacitorjs.com/docs) · [App Store Review Guideline 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)
- [Expo / React Native docs](https://docs.expo.dev/) · [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) · [expo-image-picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) · [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Apple Developer Program pricing & TestFlight](https://developer.apple.com/programs/) · [Google Play Console](https://play.google.com/console/about/)
- Internal: [API_BACKEND_MIGRATION_PLAN.md](../API_BACKEND_MIGRATION_PLAN.md) · [refresh-token-store.md](refresh-token-store.md) · [src/lib/uploads.ts](../../src/lib/uploads.ts) · [src/lib/session-core.ts](../../src/lib/session-core.ts)
