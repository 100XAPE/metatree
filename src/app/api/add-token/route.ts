import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Manually add a token by mint address
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint');
  
  if (!mint) {
    return NextResponse.json({ error: 'mint parameter required' }, { status: 400 });
  }
  
  try {
    // Check if already exists
    const existing = await prisma.token.findUnique({ where: { mint } });
    if (existing) {
      return NextResponse.json({ success: true, message: 'Token already exists', token: existing.symbol });
    }
    
    // Fetch from DexScreener
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = await res.json();
    const pair = data.pairs?.[0];
    
    if (!pair) {
      return NextResponse.json({ error: 'Token not found on DexScreener' }, { status: 404 });
    }
    
    const settings = await prisma.settings.findUnique({ where: { id: 'global' } });
    
    const marketCap = pair.marketCap || pair.fdv || 0;
    const volume24h = pair.volume?.h24 || 0;
    const volume5m = pair.volume?.m5 || 0;
    const isMainRunner = marketCap >= (settings?.mainRunnerMinMc || 500000);
    
    // Extract socials
    const website = pair.info?.websites?.[0]?.url || null;
    const twitter = pair.info?.socials?.find((s: any) => s.type === 'twitter')?.url || null;
    const telegram = pair.info?.socials?.find((s: any) => s.type === 'telegram')?.url || null;
    
    const token = await prisma.token.create({
      data: {
        mint,
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        imageUrl: pair.info?.imageUrl || null,
        price: parseFloat(pair.priceUsd) || 0,
        marketCap,
        volume5m,
        volume24h,
        priceChange5m: pair.priceChange?.m5 || 0,
        heatScore: 50,
        isVisible: true,
        isMainRunner,
        phase: marketCap > 1000000 ? 'MIGRATED' : 'TRADING',
        website,
        twitter,
        telegram,
      }
    });
    
    return NextResponse.json({ 
      success: true, 
      added: token.symbol,
      isMainRunner,
      marketCap,
      volume24h
    });
    
  } catch (error) {
    console.error('Add token error:', error);
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
