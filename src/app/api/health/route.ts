import { NextResponse } from 'next/server';

// Liveness probe for the Cloud Run deploy smoke (deploy-dev.yml /
// deploy-prod.yml curl `$CANDIDATE_URL/api/health`) and the monitoring uptime
// check. Deliberately dependency-free: it proves the Next revision came up and
// serves HTTP, nothing more.
//
// The pre-Phase-4 version queried the DB and the family master key, but those
// now belong to FastAPI (`/v1/health` + its own readiness). Coupling a Next
// liveness probe to the database or the downstream API would make a Next deploy
// fail whenever a dependency is down — wrong for a liveness check. The deep
// end-to-end signal is the deploy's Playwright @smoke login step, not this.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
