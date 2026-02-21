import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { detectDerivative } from '@/lib/derivative-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SOLANA_CHAIN = 'solana';
const MIN_LIQUIDITY = 5000;
const MIN_VOLUME_24H = 10000;
const MAX_TOKENS = 150;

// Stablecoin / wrapped / LP token detection
const EXCLUDED_SYMBOLS = ['USDC', 'USDT', 'BUSD', 'DAI', 'TUSD', 'USDP', 'FRAX', 'LUSD', 'GUSD', 'WETH', 'WBTC', 'WSOL', 'WMATIC', 'WAVAX'];
const LP_PATTERNS = ['-LP', '/LP', '_LP', 'LP-', 'UNI-V', 'SLP', 'SUSHI', 'CAKE-LP', 'RAY-', 'ORCA'];

function isExcludedToken(symbol: string, name: string): boolean {
  const sym = symbol.toUpperCase();
  const nm = name.toUpperCase();
  
  // Check stablecoins/wrapped
  if (EXCLUDED_SYMBOLS.includes(sym)) return true;
  if (sym.startsWith('W') && EXCLUDED_SYMBOLS.includes(sym.slice(1))) return true;
  
  // Check LP tokens
  for (const pattern of LP_PATTERNS) {
    if (sym.includes(pattern) || nm.includes(pattern)) return true;
  }
  
  // Check for obvious stablecoin names
  if (nm.includes('USD COIN') || nm.includes('TETHER') || nm.includes('STABLECOIN')) return true;
  if (nm.includes('WRAPPED') || nm.includes('BRIDGED')) return true;
  if (nm.includes('LIQUIDITY') && nm.includes('POOL')) return true;
  
  return false;
}

interface RunnerCriteria {
  minMc: number;
  maxMc: number;
  minVol24h: number;
  minVol5m: number;
  minAgeMinutes: number;
  maxAgeDays: number;
  minHolders: number;
  minLiquidity: number;
  includeGraduated: boolean;
  includeRaydium: boolean;
  includePumpFun: boolean;
  includeNew: boolean;
  excludeStables: boolean;
  excludeWrapped: boolean;
  excludeLP: boolean;
  manualRunners: string[];
  manualExcluded: string[];
}

function qualifiesAsRunner(
  token: { 
    mint: string; 
    symbol: string; 
    name: string;
    marketCap: number; 
    volume24h: number; 
    volume5m: number; 
    liquidity: number;
    ageHours: number;
    phase: string;
  },
  criteria: RunnerCriteria
): boolean {
  // Manual overrides first
  if (criteria.manualExcluded.includes(token.mint)) return false;
  if (criteria.manualRunners.includes(token.mint)) return true;
  
  // Exclusion checks
  if (criteria.excludeStables || criteria.excludeWrapped || criteria.excludeLP) {
    if (isExcludedToken(token.symbol, token.name)) return false;
  }
  
  // Market cap bounds
  if (token.marketCap < criteria.minMc) return false;
  if (token.marketCap > criteria.maxMc) return false;
  
  // Volume checks
  if (token.volume24h < criteria.minVol24h) return false;
  if (token.volume5m < criteria.minVol5m) return false;
  
  // Liquidity check
  if (token.liquidity < criteria.minLiquidity) return false;
  
  // Age checks (convert to same unit)
  const ageMinutes = token.ageHours * 60;
  const maxAgeMinutes = criteria.maxAgeDays * 24 * 60;
  if (ageMinutes < criteria.minAgeMinutes) return false;
  if (ageMinutes > maxAgeMinutes) return false;
  
  // Phase checks
  const phase = token.phase.toUpperCase();
  if (phase === 'PUMP_FUN' && !criteria.includePumpFun) return false;
  if (phase === 'NEW' && !criteria.includeNew) return false;
  if (phase === 'GRADUATED' && !criteria.includeGraduated) return false;
  if (phase === 'RAYDIUM' && !criteria.includeRaydium) return false;
  // MIGRATED and TRADING are treated as GRADUATED/RAYDIUM
  if ((phase === 'MIGRATED' || phase === 'TRADING' || phase === 'RECENT') && !criteria.includeGraduated) return false;
  
  return true;
}

interface DexPair {
  chainId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  priceUsd: string;
  volume: { h24: number; h1: number; m5: number };
  priceChange: { h24: number; h1: number; m5: number };
  liquidity: { usd: number };
  fdv: number;
  marketCap: number;
  pairCreatedAt: number;
  info?: { 
    imageUrl?: string;
    websites?: { url: string; label?: string }[];
    socials?: { url: string; type: string }[];
  };
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
    const solanaTokens = (data || []).filter((t: any) => t.chainId === SOLANA_CHAIN).slice(0, 50);
    
    const pairs: DexPair[] = [];
    for (const token of solanaTokens) {
      try {
        const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`);
        const pairData = await pairRes.json();
        if (pairData.pairs?.[0]) pairs.push(pairData.pairs[0]);
        await new Promise(r => setTimeout(r, 100));
      } catch { continue; }
    }
    return pairs;
  } catch { return []; }
}

async function fetchNewPairs(): Promise<DexPair[]> {
  try {
    // Get recently created pairs
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', { next: { revalidate: 0 } });
    const data = await res.json();
    const solanaTokens = (data || []).filter((t: any) => t.chainId === SOLANA_CHAIN).slice(0, 30);
    
    const pairs: DexPair[] = [];
    for (const token of solanaTokens) {
      try {
        const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.tokenAddress}`);
        const pairData = await pairRes.json();
        if (pairData.pairs?.[0]) pairs.push(pairData.pairs[0]);
        await new Promise(r => setTimeout(r, 100));
      } catch { continue; }
    }
    return pairs;
  } catch { return []; }
}

// Extract keywords for storage
function extractKeywords(name: string, symbol: string): string[] {
  const text = `${name} ${symbol}`.toLowerCase();
  const patterns = [
    'whale', 'pepe', 'doge', 'shib', 'inu', 'cat', 'dog', 'frog', 'bird', 'bear', 'bull',
    'trump', 'elon', 'musk', 'melania', 'barron', 'maga',
    'ai', 'agent', 'gpt', 'bot',
    'penguin', 'pengu', 'popcat', 'bonk', 'wif', 'moo', 'pnut', 'goat', 'mog', 'moodeng',
    'monkey', 'ape', 'punch'
  ];
  
  const found: string[] = [];
  for (const p of patterns) {
    if (text.includes(p)) found.push(p);
  }
  return Array.from(new Set(found));
}

// Send Telegram notification for new derivative
async function sendTelegramAlert(
  derivative: { symbol: string; name: string; mint: string; marketCap: number },
  runner: { symbol: string; name: string; marketCap: number },
  method: string,
  confidence: number
) {
  const settings = await prisma.settings.findUnique({ where: { id: 'global' } });
  if (!settings?.telegramBotToken || !settings?.telegramChatId) return;
  
  const mcFormatted = derivative.marketCap >= 1000000 
    ? `$${(derivative.marketCap/1000000).toFixed(2)}M` 
    : `$${(derivative.marketCap/1000).toFixed(0)}K`;
  
  const runnerMcFormatted = runner.marketCap >= 1000000 
    ? `$${(runner.marketCap/1000000).toFixed(2)}M` 
    : `$${(runner.marketCap/1000).toFixed(0)}K`;
  
  const message = `🌱 <b>NEW DERIVATIVE FOUND</b>

<b>${derivative.symbol}</b> (${derivative.name})
└─ Derivative of <b>${runner.symbol}</b> (${runnerMcFormatted})

💰 MC: ${mcFormatted}
🎯 Confidence: ${confidence}%
🔍 Method: ${method}

<a href="https://dexscreener.com/solana/${derivative.mint}">📈 Chart</a> | <a href="https://pump.fun/${derivative.mint}">🔵 Pump</a>`;

  try {
    await fetch(`https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  } catch (e) {
    console.error('Telegram alert failed:', e);
  }
}

export async function GET() {
  try {
    console.log('Starting discovery...');
    
    const [trending, gainers, newPairs] = await Promise.all([
      fetchTrendingSolana(), 
      fetchTopGainers(),
      fetchNewPairs()
    ]);
    
    const uniquePairs = new Map<string, DexPair>();
    [...trending, ...gainers, ...newPairs].forEach(pair => {
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
    const newTokens: string[] = [];
    
    const settings = await prisma.settings.findUnique({ where: { id: 'global' } }) ||
      await prisma.settings.create({ data: { id: 'global' } });
    
    // Build runner criteria from settings
    const runnerCriteria: RunnerCriteria = {
      minMc: settings.runnerMinMc ?? 1000000,
      maxMc: settings.runnerMaxMc ?? 1000000000,
      minVol24h: settings.runnerMinVol24h ?? 500000,
      minVol5m: settings.runnerMinVol5m ?? 50000,
      minAgeMinutes: settings.runnerMinAgeMinutes ?? 5,
      maxAgeDays: settings.runnerMaxAgeDays ?? 7,
      minHolders: settings.runnerMinHolders ?? 50,
      minLiquidity: settings.runnerMinLiquidity ?? 10000,
      includeGraduated: settings.runnerIncludeGraduated ?? true,
      includeRaydium: settings.runnerIncludeRaydium ?? true,
      includePumpFun: settings.runnerIncludePumpFun ?? false,
      includeNew: settings.runnerIncludeNew ?? false,
      excludeStables: settings.excludeStablecoins ?? true,
      excludeWrapped: settings.excludeWrapped ?? true,
      excludeLP: settings.excludeLPTokens ?? true,
      manualRunners: (settings.manualRunners || '').split(',').map(s => s.trim()).filter(Boolean),
      manualExcluded: (settings.manualExcluded || '').split(',').map(s => s.trim()).filter(Boolean),
    };
    
    for (const pair of sortedPairs) {
      const mint = pair.baseToken.address;
      const price = parseFloat(pair.priceUsd) || 0;
      const marketCap = pair.marketCap || pair.fdv || 0;
      const volume5m = pair.volume?.m5 || (pair.volume?.h1 || 0) / 12;
      const volume24h = pair.volume?.h24 || 0;
      const priceChange5m = pair.priceChange?.m5 || pair.priceChange?.h1 / 12 || 0;
      
      const heatScore = Math.min(100, 
        (volume5m / 10000) * 30 + Math.max(0, priceChange5m) * 0.5 + (marketCap / 1000000) * 10
      );
      
      const keywords = extractKeywords(pair.baseToken.name, pair.baseToken.symbol);
      
      let phase = 'TRADING';
      const ageHours = (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60);
      if (ageHours < 1) phase = 'PUMP_FUN';
      else if (ageHours < 6) phase = 'NEW';
      else if (ageHours < 24) phase = 'RECENT';
      else if (marketCap > 1000000) phase = 'GRADUATED';
      
      const liquidity = pair.liquidity?.usd || 0;
      
      const isVisible = volume5m >= (settings.minVolume5m || 500) || marketCap >= 100000;
      const isMainRunner = qualifiesAsRunner({
        mint,
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        marketCap,
        volume24h,
        volume5m,
        liquidity,
        ageHours,
        phase
      }, runnerCriteria);
      
      // Extract social links
      const website = pair.info?.websites?.[0]?.url || null;
      const twitter = pair.info?.socials?.find(s => s.type === 'twitter')?.url || null;
      const telegram = pair.info?.socials?.find(s => s.type === 'telegram')?.url || null;
      
      const tokenData = {
        mint,
        name: pair.baseToken.name,
        symbol: pair.baseToken.symbol,
        imageUrl: pair.info?.imageUrl || null,
        price,
        marketCap,
        volume5m,
        volume24h,
        priceChange5m,
        heatScore,
        isVisible,
        isMainRunner,
        phase,
        keywords,
        website,
        twitter,
        telegram,
      };
      
      const existing = await prisma.token.findUnique({ where: { mint } });
      if (existing) {
        await prisma.token.update({ where: { mint }, data: tokenData });
        updated++;
      } else {
        await prisma.token.create({ data: tokenData });
        added++;
        newTokens.push(mint);
      }
    }
    
    // === RE-EVALUATE ALL EXISTING RUNNERS ===
    // Demote runners that no longer qualify
    const existingRunners = await prisma.token.findMany({ 
      where: { isMainRunner: true }
    });
    
    let demoted = 0;
    for (const token of existingRunners) {
      const stillQualifies = qualifiesAsRunner({
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        marketCap: token.marketCap,
        volume24h: token.volume24h,
        volume5m: token.volume5m,
        liquidity: 10000, // Assume liquidity OK if we don't have fresh data
        ageHours: (Date.now() - token.createdAt.getTime()) / (1000 * 60 * 60),
        phase: token.phase
      }, runnerCriteria);
      
      if (!stillQualifies) {
        await prisma.token.update({
          where: { id: token.id },
          data: { isMainRunner: false }
        });
        demoted++;
        console.log(`Demoted ${token.symbol} - no longer qualifies as runner`);
      }
    }
    
    // === DERIVATIVE DETECTION ===
    const runners = await prisma.token.findMany({ 
      where: { isMainRunner: true },
      orderBy: { marketCap: 'desc' }
    });
    
    const unlinkedTokens = await prisma.token.findMany({ 
      where: { 
        isVisible: true,
        isMainRunner: false,
        parentRunnerId: null
      },
      orderBy: { marketCap: 'desc' }
    });
    
    console.log(`Detecting derivatives: ${runners.length} runners, ${unlinkedTokens.length} unlinked tokens`);
    
    let linked = 0;
    const newDerivatives: { derivative: string; runner: string; confidence: number; method: string }[] = [];
    
    for (const token of unlinkedTokens) {
      let bestRunner: typeof runners[0] | null = null;
      let bestResult: ReturnType<typeof detectDerivative> | null = null;
      
      for (const runner of runners) {
        if (runner.id === token.id) continue;
        
        const result = detectDerivative(runner.name, runner.symbol, token.name, token.symbol);
        
        if (result.isDerivative && result.confidence >= 70) {
          if (!bestResult || result.confidence > bestResult.confidence) {
            bestRunner = runner;
            bestResult = result;
          }
        }
      }
      
      if (bestRunner && bestResult) {
        await prisma.token.update({
          where: { id: token.id },
          data: { parentRunnerId: bestRunner.id }
        });
        
        linked++;
        
        const isNew = newTokens.includes(token.mint);
        
        newDerivatives.push({
          derivative: token.symbol,
          runner: bestRunner.symbol,
          confidence: bestResult.confidence,
          method: bestResult.bestMethod
        });
        
        console.log(`Linked ${token.symbol} → ${bestRunner.symbol} (${bestResult.confidence}% ${bestResult.bestMethod})`);
        
        // Send Telegram alert for new derivatives with high confidence
        if (isNew && bestResult.confidence >= 80) {
          await sendTelegramAlert(
            { symbol: token.symbol, name: token.name, mint: token.mint, marketCap: token.marketCap },
            { symbol: bestRunner.symbol, name: bestRunner.name, marketCap: bestRunner.marketCap },
            bestResult.bestMethod,
            bestResult.confidence
          );
        }
      }
    }
    
    // Cleanup old inactive tokens
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await prisma.token.deleteMany({
      where: { updatedAt: { lt: oneWeekAgo }, volume5m: { lt: 100 }, isMainRunner: false }
    });
    
    // Trigger image analysis in background
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://metatree.vercel.app';
    fetch(`${baseUrl}/api/analyze`).catch(() => {});
    
    return NextResponse.json({ 
      success: true, 
      added, 
      updated,
      demoted,
      total: sortedPairs.length,
      linked,
      newDerivatives: newDerivatives.slice(0, 20)
    });
  } catch (error) {
    console.error('Discovery error:', error);
    return NextResponse.json({ error: 'Discovery failed', details: String(error) }, { status: 500 });
  }
}
