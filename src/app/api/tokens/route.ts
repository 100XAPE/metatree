import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Add a new token to track
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mint, name, symbol, imageUrl } = body;

    if (!mint || !symbol) {
      return NextResponse.json({ error: 'mint and symbol required' }, { status: 400 });
    }

    // Check if exists
    const existing = await prisma.token.findUnique({ where: { mint } });
    if (existing) {
      return NextResponse.json({ error: 'Token already exists', token: existing });
    }

    // Fetch initial data from DexScreener
    let marketCap = 0, price = 0, volume5m = 0;
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await res.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        marketCap = parseFloat(pair.marketCap) || 0;
        price = parseFloat(pair.priceUsd) || 0;
        volume5m = parseFloat(pair.volume?.h24) / 288 || 0;
      }
    } catch (e) {
      console.error('DexScreener fetch error:', e);
    }

    const settings = await prisma.settings.findUnique({ where: { id: 'global' } });
    const minVol = settings?.minVolume5m || 1000;
    const minMc = settings?.mainRunnerMinMc || 500000;

    const token = await prisma.token.create({
      data: {
        mint,
        name: name || symbol,
        symbol,
        imageUrl,
        marketCap,
        price,
        volume5m,
        isVisible: volume5m >= minVol,
        isMainRunner: marketCap >= minMc && volume5m >= minVol,
        phase: marketCap > 0 ? 'MIGRATED' : 'PUMP_FUN'
      }
    });

    // Auto-create narrative
    await prisma.narrative.create({
      data: {
        name: `${symbol} Meta`,
        keywords: [symbol.toLowerCase(), name?.toLowerCase() || symbol.toLowerCase()],
        tokens: { connect: { id: token.id } }
      }
    });

    return NextResponse.json({ success: true, token });
  } catch (error) {
    console.error('Add token error:', error);
    return NextResponse.json({ error: 'Failed to add token' }, { status: 500 });
  }
}

// Get all tokens
export async function GET() {
  try {
    const tokens = await prisma.token.findMany({
      orderBy: { marketCap: 'desc' },
      take: 100
    });
    return NextResponse.json(tokens);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
  }
}
