import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logError } from '@/lib/logger';

export const GET = async () => {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        db: { ok: true },
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
