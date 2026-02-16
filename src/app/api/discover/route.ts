import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOLANA_CHAIN = 'solana';
const MIN_LIQUIDITY = 5000;
const MIN_VOLUME_24H = 10000;
const MAX_TOKENS = 100;

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  volume: { h24: number; h1: number };
  priceChange: { h24: number; h1: number; m5: number };
  liquidity: { usd: number };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: { imageUrl?: string };
}

async function fetchTrendingSolana(): Promise<DexPair[]> {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/search?q=sol/sol', { next: { revalidate: 0 } });
    const data = await res.json();
    return (data.pairs || []).filter((p: DexPair) => 
      p.chainId === SOLANA_CHAIN && p.liquidity?.usd >= MIN_LIQUIDITY && p.volume?.h24 >= MIN_VOLUME_24H
    ).slice(0, 100);
  } catch { return []; }
}

async function fetchTopGainers(): Promise<DexPair[]> {
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', { next: { revalidate: 0 } });
    const data = await res.json();
    const solanaTokens = (data || []).filter((t: any) => t.chainId === SOLANA_CHAIN).slice(0, 30);
    
    const pairs: DexPair[] = [];
    for (const token of solanaTokens) {
      try {
        const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`);
        const pairData = await pairRes.json();
        if (pairData.pairs?.[0]) pairs.push(pairData.pairs[0]);
        await new Promise(r => setTimeout(r, 150));
      } catch { continue; }
    }
    return pairs;
  } catch { return []; }
}

// Extract keywords from token name/symbol for matching
function extractKeywords(name: string, symbol: string): string[] {
  const text = `${name} ${symbol}`.toLowerCase();
  const words = text.split(/[\s\-_]+/).filter(w => w.length >= 3);
  
  // Common memecoin keywords
  const patterns = [
    'whale', 'pepe', 'doge', 'shib', 'inu', 'cat', 'dog', 'frog', 'bird', 'bear', 'bull',
    'trump', 'elon', 'musk', 'melania', 'barron', 'maga',
    'ai', 'agent', 'gpt', 'bot', 'auto',
    'baby', 'mini', 'mega', 'super', 'king', 'queen', 'lord',
    'moon', 'rocket', 'pump', 'based', 'chad', 'wojak', 'meme', 'kek',
    'sol', 'bonk', 'wif', 'popcat', 'moo', 'pnut', 'goat', 'mog',
    'penguin', 'pengu', 'griffin', 'dragon', 'phoenix',
    'game', 'play', 'pixel', 'nft', 'meta'
  ];
  
  const found: string[] = [];
  for (const pattern of patterns) {
    if (text.includes(pattern)) found.push(pattern);
  }
  
  // Also add significant words from name
  words.forEach(w => {
    if (w.length >= 4 && !['token', 'coin', 'official', 'the'].includes(w)) {
      found.push(w);
    }
  });
  
  return Array.from(new Set(found));
}

// Check if token B is a derivative of token A
function isDerivative(runnerName: string, runnerSymbol: string, tokenName: string, tokenSymbol: string): boolean {
  const runnerSymLower = runnerSymbol.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokenSymLower = tokenSymbol.toLowerCase().replace(/[^a-z0-9]/g, '');
  const tokenNameLower = tokenName.toLowerCase();
  const runnerNameLower = runnerName.toLowerCase();
  
  // Don't match self
  if (runnerSymLower === tokenSymLower) return false;
  
  // Method 1: Runner symbol appears in token name/symbol (3+ chars)
  if (runnerSymLower.length >= 3) {
    if (tokenSymLower.includes(runnerSymLower) || tokenNameLower.includes(runnerSymLower)) {
      return true;
    }
    // Also check if token symbol contains part of runner symbol
    if (runnerSymLower.length >= 4 && tokenSymLower.length >= 4) {
      // Check 4-char substring matches
      for (let i = 0; i <= runnerSymLower.length - 4; i++) {
        const chunk = runnerSymLower.substring(i, i + 4);
        if (tokenSymLower.includes(chunk) || tokenNameLower.includes(chunk)) {
          return true;
        }
      }
    }
  }
  
  // Method 2: Check words from runner name in token
  const runnerWords = runnerNameLower.split(/[\s\-_]+/).filter(w => w.length >= 3 && !['the','and','for','coin','token'].includes(w));
  for (const word of runnerWords) {
    if (tokenSymLower.includes(word) || tokenNameLower.includes(word)) {
      return true;
    }
  }
  
  // Method 3: Token symbol appears in runner name (reverse check for related tokens)
  if (tokenSymLower.length >= 4) {
    if (runnerNameLower.includes(tokenSymLower)) {
      return true;
    }
  }
  
  // Method 4: Keyword-based matching
  const runnerKeywords = extractKeywords(runnerName, runnerSymbol);
  const tokenKeywords = extractKeywords(tokenName, tokenSymbol);
  
  // Exclude very common memecoin words that would match everything
  const tooCommon = ['the', 'coin', 'token', 'sol', 'pump', 'moon', 'rocket', 'baby', 'mini', 'mega', 'super', 'king', 'meme', 'based'];
  const meaningfulRunnerKw = runnerKeywords.filter(k => !tooCommon.includes(k) && k.length >= 3);
  const shared = meaningfulRunnerKw.filter(k => tokenKeywords.includes(k));
  
  return shared.length > 0;
}

export async function GET() {
  try {
    console.log('Starting discovery...');
    
    const [trending, gainers] = await Promise.all([fetchTrendingSolana(), fetchTopGainers()]);
    
    const uniquePairs = new Map<string, DexPair>();
    [...trending, ...gainers].forEach(pair => {
      const mint = pair.baseToken.address;
      if (!uniquePairs.has(mint) || (pair.volume?.h24 || 0) > (uniquePairs.get(mint)?.volume?.h24 || 0)) {
        uniquePairs.set(mint, pair);
      }
    });
    
    const sortedPairs = Array.from(uniquePairs.values())
      .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, MAX_TOKENS);
    
    console.log(`Found ${sortedPairs.length} pairs`);
    
    let added = 0, updated = 0;
    
    const settings = await prisma.settings.findUnique({ where: { id: 'global' } }) ||
      await prisma.settings.create({ data: { id: 'global' } });
    
    for (const pair of sortedPairs) {
      const mint = pair.baseToken.address;
      const price = parseFloat(pair.priceUsd) || 0;
      const marketCap = pair.marketCap || pair.fdv || 0;
      const volume5m = (pair.volume?.h1 || 0) / 12;
      const priceChange5m = pair.priceChange?.m5 || pair.priceChange?.h1 || 0;
      
      const heatScore = Math.min(100, 
        (volume5m / 10000) * 30 + Math.max(0, priceChange5m) * 0.5 + (marketCap / 1000000) * 10
      );
      
      const isVisible = volume5m >= (settings.minVolume5m || 500);
      const isMainRunner = marketCap >= (settings.mainRunnerMinMc || 500000) && isVisible;
      
      const keywords = extractKeywords(pair.baseToken.name, pair.baseToken.symbol);
      
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
        keywords,
      };
      
      const existing = await prisma.token.findUnique({ where: { mint } });
      if (existing) {
        await prisma.token.update({ where: { mint }, data: tokenData });
        updated++;
      } else {
        await prisma.token.create({ data: tokenData });
        added++;
      }
      
      await new Promise(r => setTimeout(r, 50));
    }
    
    // Now link derivatives to runners
    const runners = await prisma.token.findMany({ where: { isMainRunner: true } });
    const allTokens = await prisma.token.findMany({ where: { isVisible: true } });
    
    // Clear old parent links
    await prisma.token.updateMany({ data: { parentRunnerId: null } });
    
    // Link tokens to their parent runners
    for (const token of allTokens) {
      if (token.isMainRunner) continue;
      
      // Find best matching runner (highest MC runner that this token is a derivative of)
      let bestRunner: typeof runners[0] | null = null;
      
      for (const runner of runners) {
        if (runner.id === token.id) continue;
        if (isDerivative(runner.name, runner.symbol, token.name, token.symbol)) {
          if (!bestRunner || runner.marketCap > bestRunner.marketCap) {
            bestRunner = runner;
          }
        }
      }
      
      if (bestRunner) {
        await prisma.token.update({
          where: { id: token.id },
          data: { parentRunnerId: bestRunner.id }
        });
      }
    }
    
    // Cleanup old inactive tokens
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.token.deleteMany({
      where: { updatedAt: { lt: oneWeekAgo }, volume5m: { lt: 100 }, isMainRunner: false }
    });
    
    return NextResponse.json({ success: true, added, updated, total: sortedPairs.length });
  } catch (error) {
    console.error('Discovery error:', error);
    return NextResponse.json({ error: 'Discovery failed', details: String(error) }, { status: 500 });
  }
}
