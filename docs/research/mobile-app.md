# Path to a Mobile App for family-recipe

Research output for [#48](https://github.com/wnorowskie/family-recipe/issues/48).

## Decision

**Ship a PWA first.** Add a web app manifest, a minimal service worker, and iOS/Android install affordances to the existing Next.js app. Target ~1–2 days of work, zero backend change, zero app-store cost, and no risk to the auth or upload flows that are already working for real family users.

Treat a Capacitor wrapper or a React Native / Expo client against FastAPI as **future options** that only get picked up if a concrete user-visible gap (most likely iOS web push or background camera behavior) justifies the cost. The FastAPI migration ([docs/API_BACKEND_MIGRATION_PLAN.md](../API_BACKEND_MIGRATION_PLAN.md)) is a prerequisite for the native path but is _not_ a reason to start it now.

## Comparison of the three paths

| Dimension                         | PWA (Next.js + manifest + SW)                      | Capacitor wrapper                                                 | Native / cross-platform (Expo RN) vs FastAPI                               |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Reuses existing UI                | 100% — same Next.js app                            | ~95% — Next app rendered inside WKWebView / Android WebView       | 0% — rebuild all screens in RN                                             |
| Backend changes                   | None                                               | None (same cookie + same-origin API)                              | Large — needs FastAPI Phase 1 token auth + mobile-friendly upload endpoint |
| Auth change                       | None                                               | None — WKWebView honors `httpOnly`+`secure` cookies for same host | Swap cookie for `Authorization: Bearer` + refresh flow                     |
| Photo upload                      | `<input capture>` → existing `/api/posts` → GCS    | Same as PWA; optional `@capacitor/camera` for gallery UX          | Needs multipart POST or signed-upload-URL endpoint                         |
| iOS push notifications            | iOS 16.4+ only, requires home-screen install first | Full APNs via `@capacitor/push-notifications`                     | Full APNs via `expo-notifications`                                         |
| App-store distribution            | None — add to home screen                          | Apple $99/yr + Google $25 one-time (TestFlight for family)        | Same as Capacitor                                                          |
| "Feels like an app"               | Good on Android; OK on iOS once installed          | Good on both                                                      | Best — native gestures, navigation, splash                                 |
| T-shirt size                      | **S** (1–2 days)                                   | **M** (1–2 weeks incl. Xcode/Android setup + paid Apple account)  | **L** (multi-month, gated on FastAPI migration Phase 1)                    |
| Fits "minimal, non-breaking" rule | Yes                                                | Yes, but ships a new distribution channel                         | No — touches auth + adds a second client                                   |

## Why PWA first

- The app is already working for real family users ([CLAUDE.md](../../CLAUDE.md) flags "testing with real family users, prefer minimal, non-breaking changes"). A PWA costs nothing to try and can be reverted without touching a data flow.
- Session cookie is host-scoped (`httpOnly`, `secure`, `sameSite: 'lax'`, no `Domain` — see [src/lib/session-core.ts:16-24](../../src/lib/session-core.ts#L16)) and survives `display: standalone` installs without change. JWT ([src/lib/jwt.ts](../../src/lib/jwt.ts)) is host-agnostic.
- Photo flow ([src/lib/uploads.ts](../../src/lib/uploads.ts)) uses an HTML file input on the client and multipart POST to `/api/posts` on the server. Mobile browsers accept `<input type="file" accept="image/*" capture="environment">` and open the native camera directly — no code change.
- No app-store paperwork, no Apple $99/yr tax, no developer account, no review cycle.
- The only "app-like" capabilities we'd give up vs. a native shell are push notifications, background sync, and deeper share-sheet integration — none of which V1 uses today (per [docs/PRODUCT_SPEC.md](../PRODUCT_SPEC.md) and [docs/V1_DETAILED_SUMMARY.md](../V1_DETAILED_SUMMARY.md)).

## Answers to the ticket questions

### PWA route — what needs to be added

Minimum for "installable and feels-like-an-app":

1. **Web App Manifest** at `/manifest.webmanifest` with `name`, `short_name`, `start_url: '/'`, `display: 'standalone'`, theme/background colors, and a 192×192 + 512×512 icon set (maskable variants for Android adaptive icons). Link from `<head>` in [src/app/layout.tsx](../../src/app/layout.tsx).
2. **Service worker** — keep it tiny. A network-first handler for navigation requests + a cache-first handler for `/icons/*` and static asset URLs is enough. Do **not** try to cache `/api/*` responses: family scoping and signed GCS URLs both expire, and a stale cache would show the wrong user's data or 403 on photos. [next-pwa](https://github.com/shadowwalker/next-pwa) is the usual path, but a hand-rolled SW (~30 lines) avoids a dependency.
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

**Auth inside WKWebView:** same-origin cookies work. Cross-origin third-party cookies get blocked by ITP, but we're same-origin so not applicable. No code change to [src/lib/apiAuth.ts](../../src/lib/apiAuth.ts) or [src/lib/jwt.ts](../../src/lib/jwt.ts).

### Native / cross-platform route — Expo RN (or Flutter) against FastAPI

The FastAPI mirror ([apps/api/](../../apps/api/)) is the right backend for a native client. Two things change vs. today's cookie flow:

1. **Token-based auth is required.** Native HTTP clients don't do cookies cleanly (and iOS app-transport rules + no shared cookie jar make it more trouble than it's worth). This is already Phase 1 of the FastAPI migration — access token in memory, refresh token rotated per-use, schema designed in [docs/research/refresh-token-store.md](refresh-token-store.md). Mobile would land _after_ [#35](https://github.com/wnorowskie/family-recipe/issues/35) merges.
2. **Photo upload becomes direct-to-GCS or stays multipart.** Simplest path: keep multipart POST to FastAPI; the existing upload helper ([src/lib/uploads.ts](../../src/lib/uploads.ts)) already handles GCS. Nicer path: add a `POST /v1/uploads/sign` endpoint that mints a signed PUT URL (the signing machinery in [generateSignedUrlV4](../../src/lib/uploads.ts#L174) already exists — just mirror it in FastAPI) and have the mobile client PUT the file directly. Saves a Cloud Run hop but is optional.

Recommended stack: **Expo (React Native)** — file-based routing, `expo-secure-store` for the refresh token, `expo-image-picker` for the camera, `expo-notifications` for APNs/FCM, OTA updates via EAS Update. Flutter is fine too but has no in-repo shared code story (no TypeScript types, no shared validation schemas) — Expo + RN at least lets us share types with the Next frontend and the Zod schemas in [src/lib/validation.ts](../../src/lib/validation.ts) via a workspace.

**Does the FastAPI migration make this easier or harder?** _Easier_ once Phase 1 lands — token auth is the mobile-friendly shape. _Harder_ right now because Phase 1 is not done, and a mobile client that goes to the Next monolith would have to hack cookie auth over HTTP clients that don't really want them.

### Photo upload across all three paths

| Path      | Client side                                                   | Server side                                                                                     |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| PWA       | `<input type="file" accept="image/*" capture="environment">`  | No change — existing `/api/posts`                                                               |
| Capacitor | Either `@capacitor/camera` plugin **or** the HTML input above | No change                                                                                       |
| Native RN | `expo-image-picker` → multipart POST to FastAPI               | FastAPI's post/recipe create routes; optionally a new `POST /v1/uploads/sign` for direct-to-GCS |

All three paths ultimately hit GCS via the same signing logic ([generateSignedUrlV4](../../src/lib/uploads.ts#L174)). None of them break the contract that the DB stores `storageKey`, never URLs.

### App-store logistics for a private family app

**iOS: there is no free path.** Apple's options:

- **Apple Developer Program — $99/year.** Required for TestFlight (internal up to 100 testers, no public listing required) and Ad-Hoc distribution (100 devices/year/device-type). Either works for a family of <20 with zero App Store review friction.
- **Free provisioning profile (Xcode sideload).** 7-day app expiry. Re-sign every week. Viable for a developer, not for family users.
- **Apple Enterprise Program — $299/year.** Explicitly forbidden for public/family use. Not applicable.
- **AltStore / Sideloadly** — requires the user's Apple ID and expires every 7 days unless automated. Not consumer-friendly.

**Android: $25 one-time** Play Console fee for public listings, or free sideload of a signed APK (Android happily installs any APK the user explicitly approves). For a family install, sideloading the APK via a link is fine.

**Net:** PWA = $0. Wrapper or native = $99/year + $25 one-time for a realistic family-install story. The paid tier is unavoidable on iOS for any native distribution.

### Effort estimate

| Path      | T-shirt | What's inside                                                                                                                                                |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PWA       | **S**   | Manifest, SW (~30 lines), icons, install-prompt hint. ~1–2 days.                                                                                             |
| Capacitor | **M**   | Initial Capacitor project, Xcode + Android Studio setup, paid Apple dev account, basic native plugins (push, camera), TestFlight upload. ~1–2 weeks elapsed. |
| Native RN | **L**   | Gated on FastAPI Phase 1. Rebuild screens in Expo, mobile auth, photo upload, APNs/FCM integration, app-store submission. Multi-month.                       |

### Recommendation & next step

**Ship the PWA (Issue TBD — implementation ticket to follow this spike).** It's the lowest-risk, cheapest, and fastest path to a mobile experience that is materially better than "open Safari and type the URL." If a real family user hits a concrete limitation (the likely ones: wanting push notifications before remembering to install the PWA, or camera flows that feel clunky), we revisit Capacitor as the next smallest step — keeping the same backend, same auth, same upload flow.

We explicitly do **not** recommend starting a native client now: it's gated on the FastAPI migration, adds a second UI codebase that needs to stay in sync with the web, and solves problems we don't have evidence of yet.

**Immediate follow-ups if this doc is accepted:**

1. File an implementation ticket: "feat: make family-recipe installable as a PWA" — scope covers the 5 items in the PWA section above.
2. Leave this doc as the record of _why_ we're not going native. Revisit when FastAPI Phase 1 merges or when a specific mobile-only feature request comes from a family user.

## Alternatives considered (and rejected)

| Option                                                                         | Why rejected                                                                                                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start with a Capacitor wrapper                                                 | Costs $99/yr and introduces an App Store surface for a problem (push, better camera) we don't yet have. PWA is the strictly-smaller first experiment. |
| Start with Expo / native RN                                                    | Gated on FastAPI Phase 1. Doubles the UI codebase. Violates "minimal, non-breaking changes" guardrail while real family users are onboarding.         |
| Flutter instead of RN                                                          | No shared-types story with the rest of the repo (TypeScript + Zod). Expo wins on code reuse even if Flutter wins on raw perf.                         |
| Static-export the Next app + bundle into Capacitor                             | Requires dropping server components; large refactor against an app that's working for real users today.                                               |
| Progressive rollout: PWA now, native later on the same backend without FastAPI | Cookie-based auth into a native app is the path of most resistance. If we ever go native, do it after Phase 1 — that's when it's easy.                |

## Sources

- [MDN: Progressive web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [WebKit — Web Push for Web Apps on iOS and iPadOS (16.4+)](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [web.dev — Installable PWAs on iOS](https://web.dev/learn/pwa/installation)
- [Capacitor docs](https://capacitorjs.com/docs) · [App Store Review Guideline 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)
- [Expo / React Native docs](https://docs.expo.dev/) · [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/) · [expo-image-picker](https://docs.expo.dev/versions/latest/sdk/imagepicker/) · [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Apple Developer Program pricing & TestFlight](https://developer.apple.com/programs/) · [Google Play Console](https://play.google.com/console/about/)
- Internal: [API_BACKEND_MIGRATION_PLAN.md](../API_BACKEND_MIGRATION_PLAN.md) · [refresh-token-store.md](refresh-token-store.md) · [src/lib/uploads.ts](../../src/lib/uploads.ts) · [src/lib/session-core.ts](../../src/lib/session-core.ts)
