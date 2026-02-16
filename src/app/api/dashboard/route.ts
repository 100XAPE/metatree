import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get main runners with their derivatives
    const runnersRaw = await prisma.token.findMany({
      where: { isMainRunner: true, isVisible: true },
      orderBy: { marketCap: 'desc' },
      take: 30,
      include: {
        derivatives: {
          where: { isVisible: true },
          orderBy: { volume5m: 'desc' },
          take: 10
        }
      }
    });

    // Sort: runners with derivatives first, then by market cap
    const runners = runnersRaw.sort((a, b) => {
      const aDerivs = a.derivatives?.length || 0;
      const bDerivs = b.derivatives?.length || 0;
      if (aDerivs > 0 && bDerivs === 0) return -1;
      if (bDerivs > 0 && aDerivs === 0) return 1;
      return b.marketCap - a.marketCap;
    }).slice(0, 15);

    // Get unlinked new tokens (branches without a parent runner)
    const branches = await prisma.token.findMany({
      where: { 
        isVisible: true, 
        isMainRunner: false,
        parentRunnerId: null
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // Stats
    const [tokenCount, runnerCount] = await Promise.all([
      prisma.token.count({ where: { isVisible: true } }),
      prisma.token.count({ where: { isMainRunner: true } })
    ]);

    // Count total derivatives
    const derivativeCount = await prisma.token.count({
      where: { parentRunnerId: { not: null }, isVisible: true }
    });

    return NextResponse.json({
      runners,
      branches,
      stats: { 
        tokens: tokenCount, 
        runners: runnerCount,
        derivatives: derivativeCount
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ 
      runners: [], 
      branches: [], 
      stats: { tokens: 0, runners: 0, derivatives: 0 } 
    });
  }
}
