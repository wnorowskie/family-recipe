# Custom Domain for the Web App

Research output for [#47](https://github.com/wnorowskie/family-recipe/issues/47).

## Decision

**Register `familyrecipe.xyz` (or a similar `.xyz` / `.com`) at Cloudflare Registrar and attach it to Cloud Run via the built-in domain mapping.** Use Google-managed TLS certificates. Point prod (`main`) at the apex (e.g. `familyrecipe.xyz`) and dev (`develop`) at a subdomain (`dev.familyrecipe.xyz`). Keep DNS un-proxied (grey cloud) — do not front with the Cloudflare orange-cloud proxy. Add `hello@familyrecipe.xyz` as a Cloudflare Email Routing forward when/if desired.

**Estimated yearly total: ~$11–15 for a `.xyz` or `.com` at Cloudflare's at-cost pricing. Zero additional GCP or TLS cost.** No code changes required in the app.

## Why this option

- Cloudflare Registrar sells domains at registry cost — no markup, free WHOIS privacy, free DNS, and no upsells. Cheapest of the three registrars surveyed. ([cloudflare.com/products/registrar](https://www.cloudflare.com/products/registrar/))
- Cloud Run's built-in **domain mappings** are free, work in `us-east1` (our current region — see `.github/workflows/deploy-dev.yml`), and issue a Google-managed TLS cert automatically within ~15 minutes. ([cloud.google.com/run/docs/mapping-custom-domains](https://cloud.google.com/run/docs/mapping-custom-domains))
- Host-scoped session cookie (`httpOnly`, `secure: true`, `sameSite: 'lax'`, no `Domain` attribute — see [src/lib/session-core.ts:16-24](../../src/lib/session-core.ts#L16)) means **no code change** when the host changes. Users re-login once; that's it.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Namecheap or Porkbun registrar | Slightly more expensive at renewal (~$16+ vs ~$11 for `.com` at Cloudflare). Porkbun is a reasonable fallback if we ever want DNS hosted off Cloudflare. |
| Global external HTTPS Load Balancer + serverless NEG | Adds ~$18/month for the forwarding rule. Justified only if we outgrow domain mappings (multi-region, wildcard certs, Cloud Armor, path-based routing) — none apply to V1. ([cloud.google.com/load-balancing/pricing](https://cloud.google.com/load-balancing/pricing)) |
| Cloudflare orange-cloud proxy in front of Cloud Run | Requires SSL mode "Full (Strict)" (easy footgun: "Flexible" breaks auth), and Cloud Run routes by the `*.a.run.app` host header — so proxying without a domain mapping or a CF Worker rewriting `Host` just returns 404. Extra moving parts with no real benefit for a small private app. |
| `.family` TLD | ~$30/year at every registrar — 3× the cost of `.xyz` or `.com`. Not worth the branding for a private family-only app. |
| Put dev on the raw `*.a.run.app` URL | Mild inconsistency across environments. A single extra DNS record to add `dev.familyrecipe.xyz` is trivial; keeps both envs looking the same in the address bar. |

## Answers to the ticket questions

### Registrar + TLD pricing (renewal, April 2026)

| TLD | Cloudflare | Porkbun | Namecheap (est.) |
|---|---|---|---|
| `.com` | $10.46 | $11.08 | $15.98–18.68 |
| `.xyz` | $11.20 | $12.98 | ~$19.48 |
| `.app` | $14.20 | $14.93 | ~$19–20 |
| `.family` | $30.20 | $31.41 | $30–35 |

All three include free WHOIS privacy. Cloudflare Registrar requires you use Cloudflare DNS (no third-party nameservers), which is fine for our case. Sources: [cfdomainpricing.com](https://cfdomainpricing.com/), [porkbun.com/products/domains](https://porkbun.com/products/domains), [namecheap.com/domains](https://www.namecheap.com/domains/). Namecheap renewal numbers are ballpark; confirm before purchase if we choose them.

**Pick:** Cloudflare Registrar, `.xyz` if we want cute and cheap, `.com` if we want conventional.

### Attaching to Cloud Run

Two paths. We recommend path (A).

**(A) Cloud Run domain mapping** (recommended)
- Free, no GCP cost beyond the domain.
- Supported in `us-east1` (our region). Full list: `asia-east1`, `asia-northeast1`, `asia-southeast1`, `europe-north1`, `europe-west1`, `europe-west4`, `us-central1`, `us-east1`, `us-east4`, `us-west1`. ([docs](https://cloud.google.com/run/docs/mapping-custom-domains))
- Google-managed TLS cert issued automatically, ~15 min (up to 24 h worst case).
- Limitations that do not affect us: root-path only, no wildcard certs, no custom TLS version control.

**(B) Global external HTTPS Load Balancer + serverless NEG** (reject)
- ~$18.25/month baseline for the forwarding rule + $0.008/GiB data processing. ([pricing](https://cloud.google.com/load-balancing/pricing))
- Needed for: multi-region failover, wildcard certs, Cloud Armor/IAP, path routing across multiple backends. None apply to V1.

### Auth / cookie / JWT impact

**None — no code change required.** The session cookie set by [src/lib/session-core.ts](../../src/lib/session-core.ts) omits `Domain`, so the browser binds it to whatever host served the response. Post-cutover, users re-authenticate once; subsequent cookies are scoped to the new host. `secure: true` continues to hold because Cloud Run + Google-managed cert terminate TLS end-to-end.

There is no `NEXTAUTH_URL` or equivalent base-URL env var in the app (verified via grep — the only URL env is the unrelated `NEXT_PUBLIC_API_BASE_URL` reserved for the FastAPI migration in [docs/API_BACKEND_MIGRATION_PLAN.md](../API_BACKEND_MIGRATION_PLAN.md)). JWTs are signed by `JWT_SECRET` only — the signer (`family-recipe-app` per [src/lib/jwt.ts:24](../../src/lib/jwt.ts#L24)) is host-agnostic.

CORS is not a concern: the UI and API share the same origin today and will continue to after the cutover.

### Free TLS options + Cloudflare gotchas

- **Google-managed certs via Cloud Run domain mapping**: free, automatic renewal, zero config. This is what we're picking.
- **Cloudflare orange-cloud proxy**: free TLS at the edge, but requires SSL mode "Full (Strict)" — "Flexible" sends origin traffic over plaintext HTTP and will break the `secure` cookie + trigger a Cloud Run HTTP→HTTPS redirect loop ([CF SSL modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)). Proxying also forwards the custom `Host` header, which Cloud Run rejects unless a domain mapping (or a CF Worker rewrite) is already set up. Net: more failure modes, no real benefit for our traffic profile.

### Prod vs dev subdomain strategy

**Recommend:** apex (`familyrecipe.xyz`) for prod, `dev.familyrecipe.xyz` for dev. Both get their own Google-managed cert. Cookies stay host-scoped and sessions across envs are cleanly separated (no accidental cross-env leakage via a shared parent cookie).

Alternative `app.familyrecipe.xyz` for prod is reasonable if we want the apex reserved for a marketing page later — not a V1 concern.

### Email (optional, later)

**Cloudflare Email Routing — free, forward-only.** Unlimited addresses, works with any mailbox you already read. Zero additional cost, and we're already in Cloudflare DNS. ([cloudflare.com/developer-platform/products/email-routing](https://www.cloudflare.com/developer-platform/products/email-routing/)) Alternatives like ImprovMX (free tier: 25 aliases) or Zoho Mail Free (5 mailboxes) exist but add a dependency for no gain.

If we ever need **send-as** from the custom address (e.g. outbound transactional email from the app), revisit — that's a separate SMTP/provider decision (Resend, SendGrid free tier, etc.), not a registrar or email-routing concern.

## Setup checklist (when we implement)

Follow-up ticket should track these steps end-to-end:

1. **Register the domain** at Cloudflare Registrar. Pick `.xyz` or `.com` based on availability and taste.
2. **Verify domain ownership** in Google Search Console — add the TXT record Cloudflare-side.
3. **Create the prod domain mapping**: Cloud Run console → `family-recipe-prod` → Manage Custom Domains → add `familyrecipe.xyz`.
4. **Create the dev domain mapping**: same flow on `family-recipe-dev` for `dev.familyrecipe.xyz`.
5. **Add DNS records** at Cloudflare (grey cloud / DNS-only): the A/AAAA records Google provides for the apex, and a CNAME `dev` → `ghs.googlehosted.com` for the subdomain.
6. **Wait for managed certs to issue** (~15 min). Verify HTTPS on both hosts.
7. **Smoke-test login + core flows** on both `familyrecipe.xyz` and `dev.familyrecipe.xyz`. Existing sessions on `*.a.run.app` will not carry — expect to re-login once.
8. **Update docs**: swap the example URLs in [README.md](../../README.md) and [docs/V1_DETAILED_SUMMARY.md](../V1_DETAILED_SUMMARY.md). No env var changes needed.
9. **(Optional)** Configure Cloudflare Email Routing to forward `hello@familyrecipe.xyz` to the owner's personal inbox.
10. **(Optional, later)** Keep the `*.a.run.app` URLs accessible for a transition window. Google does not force-disable them.

## Sources

- [Cloud Run: Mapping custom domains](https://cloud.google.com/run/docs/mapping-custom-domains)
- [Cloud Load Balancing pricing](https://cloud.google.com/load-balancing/pricing)
- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) · [Community pricing tracker](https://cfdomainpricing.com/)
- [Porkbun domain pricing](https://porkbun.com/products/domains)
- [Namecheap domains](https://www.namecheap.com/domains/)
- [Cloudflare SSL modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
- [Cloudflare Email Routing](https://www.cloudflare.com/developer-platform/products/email-routing/)
- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
