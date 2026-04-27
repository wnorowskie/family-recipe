# CLAUDE.md — `src/app/api/`

Next.js App Router route handlers implementing the JSON REST API. Each `route.ts` exports HTTP methods (`GET`, `POST`, `PUT`, `DELETE`).

## The standard handler shape

```ts
import { withAuth } from '@/lib/apiAuth';
import { someLimiter, applyRateLimit } from '@/lib/rateLimit';
import { someSchema } from '@/lib/validation';
import { validationError, notFoundError } from '@/lib/apiErrors';

export const POST = withAuth(async (request, user) => {
  const limited = applyRateLimit(someLimiter, someLimiter.getUserKey(user.id));
  if (limited) return limited;

  const parsed = someSchema.safeParse(await request.json());
  if (!parsed.success) return validationError(parsed.error.errors[0]?.message);

  // All DB queries MUST scope by user.familySpaceId
  const row = await prisma.post.findFirst({
    where: { id: parsed.data.id, familySpaceId: user.familySpaceId },
  });
  if (!row) return notFoundError();

  // ... return NextResponse.json(...)
});
```

Rules this enforces:

- **`withAuth` / `withRole`** ([src/lib/apiAuth.ts](../../lib/apiAuth.ts)) — every protected handler. Returns 401/403 automatically. Never read the session manually inside the handler.
- **Family scoping** — every `where` clause for Post/Comment/Reaction/Favorite/CookedEvent/etc. must include `familySpaceId: user.familySpaceId`. Missing it = cross-family data leak.
- **Permissions** — for ownership checks (edit/delete), use the helpers in [src/lib/permissions.ts](../../lib/permissions.ts) (`canEditPost`, `canDeletePost`, `canDeleteComment`, `canRemoveMember`). Don't open-code `authorId === user.id || isAdmin`.
- **Validation** — schemas live in [src/lib/validation.ts](../../lib/validation.ts). For multipart/form-data (photos), parse `formData.get('payload')` as JSON and run it through `normalizePostPayload` before the schema (see [src/app/api/posts/route.ts](posts/route.ts)).
- **Errors** — use the helpers in [src/lib/apiErrors.ts](../../lib/apiErrors.ts). The shape `{ error: { code, message } }` is part of the public contract; don't deviate.
- **Rate limits** — pre-built limiters in [src/lib/rateLimit.ts](../../lib/rateLimit.ts) cover signup, login, post creation, comments, reactions, cooked events. Apply with `applyRateLimit` and return early on hit.

## Photo-handling routes

Routes that accept photos (`posts`, `comments`) use `multipart/form-data`:

- JSON payload arrives in field `payload`; files arrive in field `photos` (or `photo`).
- Use `isFileLike` / `savePhotoFile` from [src/lib/uploads.ts](../../lib/uploads.ts).
- Store the returned `storageKey` in DB columns named `*StorageKey` — never store rendered URLs. URLs are produced at read time via `getSignedUploadUrl`.
- On delete, call the matching cleanup so GCS / local files don't leak.

## Cache revalidation

Mutations that change visible feed/list state call `revalidatePath('/timeline')`, `'/recipes'`, etc. Match the existing routes' patterns when adding new mutating endpoints.

## Verification

Before opening a PR that touches a `route.ts`, run the [Next API playbook](../../../docs/verification/next-api.md) — covers the curl+cookie loop, cross-family guard probe, multipart routes, and the Jest integration pattern.

## Mirror in FastAPI

If you change request/response shape, status codes, or auth behavior, the equivalent endpoint in [apps/api/src/routers/](../../../apps/api/src/routers/) likely needs the same change. The migration plan ([docs/API_BACKEND_MIGRATION_PLAN.md](../../../docs/API_BACKEND_MIGRATION_PLAN.md)) is the source of truth for which endpoints have been ported.
