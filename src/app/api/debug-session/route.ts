import { NextResponse } from 'next/server';

// CI-only diagnostic endpoint. Removed after E2E stabilisation.
// Returns what the SSR layout would get when calling fetchSessionUser:
// the FastAPI base URL, whether a test session call succeeds, and any error.
export const runtime = 'nodejs';

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? null;

  if (!baseUrl) {
    return NextResponse.json({
      baseUrl: null,
      error: 'NEXT_PUBLIC_API_BASE_URL not set',
    });
  }

  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  try {
    const res = await fetch(`${cleanBase}/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json({
      baseUrl: cleanBase,
      healthStatus: res.status,
      healthOk: res.ok,
    });
  } catch (err) {
    return NextResponse.json({
      baseUrl: cleanBase,
      error: String(err),
    });
  }
}
