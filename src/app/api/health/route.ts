import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';
import { masterKeyEnvPresent } from '@/lib/masterKey';

export const GET = async () => {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const masterKeyOk = masterKeyEnvPresent();
    const familySpaceExists = (await prisma.familySpace.count()) > 0;

    return NextResponse.json(
      {
        ok: masterKeyOk && familySpaceExists,
        db: { ok: true },
        masterKey: { ok: masterKeyOk, familySpaceExists },
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    logError('healthcheck.db.error', error, {
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      {
        ok: false,
        db: { ok: false },
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
};
