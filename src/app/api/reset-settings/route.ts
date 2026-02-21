import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Reset runner criteria to correct values
    const settings = await prisma.settings.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        runnerMinMc: 1000000,        // $1M
        runnerMaxMc: 1000000000,     // $1B
        runnerMinVol24h: 500000,     // $500K
        runnerMinVol5m: 50000,       // $50K
        runnerMinAgeMinutes: 5,
        runnerMaxAgeDays: 7,
        runnerMinHolders: 50,
        runnerMinLiquidity: 10000,   // $10K
        runnerIncludeGraduated: true,
        runnerIncludeRaydium: true,
        runnerIncludePumpFun: false,
        runnerIncludeNew: false,
        excludeStablecoins: true,
        excludeWrapped: true,
        excludeLPTokens: true,
      },
      update: {
        runnerMinMc: 1000000,
        runnerMaxMc: 1000000000,
        runnerMinVol24h: 500000,
        runnerMinVol5m: 50000,
        runnerMinAgeMinutes: 5,
        runnerMaxAgeDays: 7,
        runnerMinHolders: 50,
        runnerMinLiquidity: 10000,
        runnerIncludeGraduated: true,
        runnerIncludeRaydium: true,
        runnerIncludePumpFun: false,
        runnerIncludeNew: false,
        excludeStablecoins: true,
        excludeWrapped: true,
        excludeLPTokens: true,
      },
    });

    // Demote all runners that no longer qualify
    const demoted = await prisma.token.updateMany({
      where: {
        isMainRunner: true,
        OR: [
          { marketCap: { lt: 1000000 } },
          { marketCap: { gt: 1000000000 } },
          { volume24h: { lt: 500000 } },
          { volume5m: { lt: 50000 } },
        ]
      },
      data: { isMainRunner: false }
    });

    return NextResponse.json({ 
      success: true, 
      settings,
      demotedCount: demoted.count,
      message: 'Settings reset and bad runners demoted'
    });
  } catch (error) {
    console.error('Reset error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
