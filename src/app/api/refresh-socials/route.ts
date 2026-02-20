import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Refresh social links for tokens missing them
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  
  try {
    // Get tokens missing socials
    const tokens = await prisma.token.findMany({
      where: {
        isVisible: true,
        twitter: null,
        telegram: null,
        website: null
      },
      orderBy: { marketCap: 'desc' },
      take: limit
    });
    
    if (tokens.length === 0) {
      return NextResponse.json({ success: true, message: 'All tokens have socials', updated: 0 });
    }
    
    let updated = 0;
    const results: { symbol: string; twitter?: string; telegram?: string; website?: string }[] = [];
    
    for (const token of tokens) {
      try {
        const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.mint}`);
        const data = await res.json();
        const pair = data.pairs?.[0];
        
        if (!pair?.info) continue;
        
        const website = pair.info.websites?.[0]?.url || null;
        const twitter = pair.info.socials?.find((s: any) => s.type === 'twitter')?.url || null;
        const telegram = pair.info.socials?.find((s: any) => s.type === 'telegram')?.url || null;
        
        if (website || twitter || telegram) {
          await prisma.token.update({
            where: { id: token.id },
            data: { website, twitter, telegram }
          });
          updated++;
          results.push({ symbol: token.symbol, twitter, telegram, website });
        }
        
        // Rate limit
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        console.error(`Failed to fetch socials for ${token.symbol}:`, e);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      checked: tokens.length,
      updated,
      results
    });
    
  } catch (error) {
    console.error('Refresh socials error:', error);
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
