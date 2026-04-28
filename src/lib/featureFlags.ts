// `NEXT_PUBLIC_*` env vars are inlined by Next at build time, so flipping the
// flag in a deployed environment requires a rebuild (same caveat as
// `NEXT_PUBLIC_API_BASE_URL` in apiClient.ts:27-30). Exported as a function
// rather than a const so jest can re-evaluate process.env between tests.

export function isFastApiAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH === 'true';
}
