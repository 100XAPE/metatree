import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [runners, metas, branches, tokenCount, runnerCount, metaCount] = await Promise.all([
      prisma.token.findMany({
        where: { isMainRunner: true, isVisible: true },
        orderBy: { heatScore: 'desc' },
        take: 10
      }),
      prisma.narrative.findMany({
        where: { tokenCount: { gt: 0 } },
        orderBy: { totalMarketCap: 'desc' },
        take: 10
      }),
      prisma.token.findMany({
        where: { isVisible: true, isMainRunner: false },
        orderBy: { createdAt: 'desc' },
        take: 15
      }),
      prisma.token.count({ where: { isVisible: true } }),
      prisma.token.count({ where: { isMainRunner: true } }),
      prisma.narrative.count({ where: { tokenCount: { gt: 0 } } })
    ]);

    return NextResponse.json({
      runners,
      metas,
      branches,
      stats: { tokens: tokenCount, runners: runnerCount, metas: metaCount }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ runners: [], metas: [], branches: [], stats: { tokens: 0, runners: 0, metas: 0 } });
  }
}
