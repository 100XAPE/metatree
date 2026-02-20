import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get main runners with their derivatives
    const runnersRaw = await prisma.token.findMany({
      where: { isMainRunner: true, isVisible: true },
      orderBy: { marketCap: 'desc' },
      take: 40,
      include: {
        derivatives: {
          where: { isVisible: true },
          orderBy: [
            { marketCap: 'desc' },
            { volume5m: 'desc' }
          ],
          take: 20
        }
      }
    });

    // Sort purely by market cap (highest first)
    const runners = runnersRaw
      .sort((a, b) => b.marketCap - a.marketCap)
      .slice(0, 40);

    // Get unlinked new tokens (branches without a parent runner)
    const branches = await prisma.token.findMany({
      where: { 
        isVisible: true, 
        isMainRunner: false,
        parentRunnerId: null
      },
      orderBy: [
        { phase: 'asc' }, // NEW and PUMP_FUN first
        { marketCap: 'desc' }
      ],
      take: 24
    });

    // Stats
    const [tokenCount, runnerCount, derivativeCount] = await Promise.all([
      prisma.token.count({ where: { isVisible: true } }),
      prisma.token.count({ where: { isMainRunner: true } }),
      prisma.token.count({ where: { parentRunnerId: { not: null }, isVisible: true } })
    ]);

    // Get top derivative pairs for insights
    const topDerivatives = await prisma.token.findMany({
      where: { 
        parentRunnerId: { not: null },
        isVisible: true
      },
      orderBy: { marketCap: 'desc' },
      take: 10,
      include: {
        parentRunner: {
          select: { symbol: true, name: true, marketCap: true }
        }
      }
    });

    return NextResponse.json({
      runners,
      branches,
      stats: { 
        tokens: tokenCount, 
        runners: runnerCount,
        derivatives: derivativeCount,
        unlinked: branches.length
      },
      topDerivatives: topDerivatives.map(d => ({
        symbol: d.symbol,
        name: d.name,
        marketCap: d.marketCap,
        runner: d.parentRunner?.symbol,
        runnerMc: d.parentRunner?.marketCap
      }))
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ 
      runners: [], 
      branches: [], 
      stats: { tokens: 0, runners: 0, derivatives: 0, unlinked: 0 },
      topDerivatives: []
    });
  }
}
