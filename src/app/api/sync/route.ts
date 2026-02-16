import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// This endpoint fetches data from DexScreener and updates tokens
// Call this via cron or manually to sync data

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Optional auth for cron jobs
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow without auth for testing, but log it
    console.log('Sync called without auth');
  }

  try {
    // Get tokens to update
    const tokens = await prisma.token.findMany({
      where: { OR: [{ isMainRunner: true }, { isVisible: true }] },
      take: 20
    });

    let updated = 0;

    for (const token of tokens) {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.mint}`);
        const data = await res.json();

        if (data.pairs && data.pairs.length > 0) {
          const pair = data.pairs[0];
          const newPrice = parseFloat(pair.priceUsd) || 0;
          const newMc = parseFloat(pair.marketCap) || 0;
          const volume = parseFloat(pair.volume?.h24) / 288 || 0; // ~5min average
          const priceChange = parseFloat(pair.priceChange?.h1) || 0;
          
          // Calculate heat score
          const heatScore = Math.min(100, 
            (volume / 10000) * 30 + 
            (priceChange > 0 ? priceChange : 0) + 
            (newMc / 1000000) * 10
          );

          const settings = await prisma.settings.findUnique({ where: { id: 'global' } });
          const minVol = settings?.minVolume5m || 1000;
          const minMc = settings?.mainRunnerMinMc || 500000;

          await prisma.token.update({
            where: { id: token.id },
            data: {
              price: newPrice,
              marketCap: newMc,
              volume5m: volume,
              priceChange5m: priceChange,
              heatScore,
              isVisible: volume >= minVol,
              isMainRunner: newMc >= minMc && volume >= minVol,
              phase: 'MIGRATED'
            }
          });
          updated++;
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.error(`Error updating ${token.symbol}:`, e);
      }
    }

    // Update narrative stats
    const narratives = await prisma.narrative.findMany({ include: { tokens: true } });
    for (const narrative of narratives) {
      const totalMc = narrative.tokens.reduce((sum, t) => sum + t.marketCap, 0);
      await prisma.narrative.update({
        where: { id: narrative.id },
        data: { totalMarketCap: totalMc, tokenCount: narrative.tokens.length }
      });
    }

    return NextResponse.json({ success: true, updated, total: tokens.length });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
