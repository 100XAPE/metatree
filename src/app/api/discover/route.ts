import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Discover trending Solana tokens from DexScreener
// Automatically adds new tokens that meet criteria

const SOLANA_CHAIN = 'solana';
const MIN_LIQUIDITY = 10000; // $10k min liquidity
const MIN_VOLUME_24H = 50000; // $50k min 24h volume
const MAX_TOKENS = 50; // Max tokens to track

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceUsd: string;
  volume: { h24: number; h1: number };
  priceChange: { h24: number; h1: number; m5: number };
  liquidity: { usd: number };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: {
    imageUrl?: string;
  };
}

async function fetchTrendingSolana(): Promise<DexPair[]> {
  try {
    // Fetch trending pairs on Solana
    const res = await fetch(
      'https://api.dexscreener.com/latest/dex/search?q=sol/sol',
      { next: { revalidate: 0 } }
    );
    const data = await res.json();
    
    // Filter for Solana pairs with good volume
    const solanaPairs = (data.pairs || []).filter((p: DexPair) => 
      p.chainId === SOLANA_CHAIN &&
      p.liquidity?.usd >= MIN_LIQUIDITY &&
      p.volume?.h24 >= MIN_VOLUME_24H
    );

    return solanaPairs.slice(0, 100);
  } catch (e) {
    console.error('Failed to fetch trending:', e);
    return [];
  }
}

async function fetchTopGainers(): Promise<DexPair[]> {
  try {
    const res = await fetch(
      'https://api.dexscreener.com/token-boosts/top/v1',
      { next: { revalidate: 0 } }
    );
    const data = await res.json();
    
    // Get token addresses from boosted tokens
    const solanaTokens = (data || [])
      .filter((t: any) => t.chainId === SOLANA_CHAIN)
      .slice(0, 20);
    
    // Fetch full pair data for each
    const pairs: DexPair[] = [];
    for (const token of solanaTokens) {
      try {
        const pairRes = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`
        );
        const pairData = await pairRes.json();
        if (pairData.pairs?.[0]) {
          pairs.push(pairData.pairs[0]);
        }
        await new Promise(r => setTimeout(r, 200));
      } catch (e) {
        continue;
      }
    }
    
    return pairs;
  } catch (e) {
    console.error('Failed to fetch gainers:', e);
    return [];
  }
}

function detectNarrative(name: string, symbol: string): string | null {
  const text = `${name} ${symbol}`.toLowerCase();
  
  const narratives: Record<string, string[]> = {
    'AI_AGENTS': ['ai', 'agent', 'gpt', 'neural', 'bot', 'auto'],
    'ANIMAL': ['dog', 'cat', 'pepe', 'frog', 'shib', 'doge', 'inu', 'bird', 'bear', 'bull', 'ape', 'monkey', 'whale'],
    'TRUMP': ['trump', 'maga', 'donald', 'melania', 'barron'],
    'ELON': ['elon', 'musk', 'tesla', 'x ', 'doge'],
    'GAMING': ['game', 'play', 'nft', 'meta', 'verse'],
    'DEFI': ['swap', 'yield', 'stake', 'farm', 'lend'],
    'MEME': ['meme', 'pepe', 'wojak', 'chad', 'based', 'kek', 'lol', 'lmao'],
  };
  
  for (const [narrative, keywords] of Object.entries(narratives)) {
    if (keywords.some(kw => text.includes(kw))) {
      return narrative;
    }
  }
  
  return null;
}

async function getOrCreateNarrative(name: string): Promise<string | null> {
  if (!name) return null;
  
  let narrative = await prisma.narrative.findFirst({
    where: { name }
  });
  
  if (!narrative) {
    narrative = await prisma.narrative.create({
      data: { name, keywords: [name.toLowerCase()] }
    });
  }
  
  return narrative.id;
}

export async function GET(request: Request) {
  try {
    console.log('Starting token discovery...');
    
    // Fetch from multiple sources
    const [trending, gainers] = await Promise.all([
      fetchTrendingSolana(),
      fetchTopGainers()
    ]);
    
    // Combine and dedupe by mint address
    const allPairs = [...trending, ...gainers];
    const uniquePairs = new Map<string, DexPair>();
    
    for (const pair of allPairs) {
      const mint = pair.baseToken.address;
      if (!uniquePairs.has(mint) || 
          (pair.volume?.h24 || 0) > (uniquePairs.get(mint)?.volume?.h24 || 0)) {
        uniquePairs.set(mint, pair);
      }
    }
    
    // Sort by volume and take top tokens
    const sortedPairs = Array.from(uniquePairs.values())
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, MAX_TOKENS);
    
    console.log(`Found ${sortedPairs.length} qualified pairs`);
    
    let added = 0;
    let updated = 0;
    
    const settings = await prisma.settings.findUnique({ where: { id: 'global' } }) ||
      await prisma.settings.create({ data: { id: 'global' } });
    
    for (const pair of sortedPairs) {
      const mint = pair.baseToken.address;
      const price = parseFloat(pair.priceUsd) || 0;
      const marketCap = pair.marketCap || pair.fdv || 0;
      const volume5m = (pair.volume?.h1 || 0) / 12; // Estimate 5m from 1h
      const priceChange5m = pair.priceChange?.m5 || pair.priceChange?.h1 || 0;
      
      // Calculate heat score
      const heatScore = Math.min(100, 
        (volume5m / 10000) * 30 + 
        Math.max(0, priceChange5m) * 0.5 + 
        (marketCap / 1000000) * 10
      );
      
      const isVisible = volume5m >= (settings.minVolume5m || 1000);
      const isMainRunner = marketCap >= (settings.mainRunnerMinMc || 500000) && isVisible;
      
      // Detect narrative
      const narrativeName = detectNarrative(pair.baseToken.name, pair.baseToken.symbol);
      const narrativeId = narrativeName ? await getOrCreateNarrative(narrativeName) : null;
      
      // Determine phase
      let phase = 'TRADING';
      const ageHours = (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60);
      if (ageHours < 1) phase = 'PUMP_FUN';
      else if (ageHours < 24) phase = 'NEW';
      else if (marketCap > 1000000) phase = 'MIGRATED';
      
      const tokenData = {
        mint,
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        imageUrl: pair.info?.imageUrl || null,
        price,
        marketCap,
        volume5m,
        priceChange5m,
        heatScore,
        isVisible,
        isMainRunner,
        phase,
        narrativeId,
      };
      
      // Upsert token
      const existing = await prisma.token.findUnique({ where: { mint } });
      
      if (existing) {
        await prisma.token.update({
          where: { mint },
          data: tokenData
        });
        updated++;
      } else {
        await prisma.token.create({
          data: tokenData
        });
        added++;
      }
      
      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }
    
    // Update narrative stats
    const narratives = await prisma.narrative.findMany({ include: { tokens: true } });
    for (const narrative of narratives) {
      const visibleTokens = narrative.tokens.filter(t => t.isVisible);
      const totalMc = visibleTokens.reduce((sum, t) => sum + t.marketCap, 0);
      await prisma.narrative.update({
        where: { id: narrative.id },
        data: { totalMarketCap: totalMc, tokenCount: visibleTokens.length }
      });
    }
    
    // Cleanup old tokens with no activity
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.token.deleteMany({
      where: {
        updatedAt: { lt: oneWeekAgo },
        volume5m: { lt: 100 },
        isMainRunner: false
      }
    });
    
    const stats = {
      added,
      updated,
      totalPairsFound: uniquePairs.size,
      narratives: narratives.length
    };
    
    console.log('Discovery complete:', stats);
    
    return NextResponse.json({ 
      success: true, 
      ...stats
    });
    
  } catch (error) {
    console.error('Discovery error:', error);
    return NextResponse.json({ error: 'Discovery failed', details: String(error) }, { status: 500 });
  }
}
