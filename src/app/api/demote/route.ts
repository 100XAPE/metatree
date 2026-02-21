import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Stablecoin / wrapped / LP token detection
const EXCLUDED_SYMBOLS = ['USDC', 'USDT', 'BUSD', 'DAI', 'TUSD', 'USDP', 'FRAX', 'LUSD', 'GUSD', 'WETH', 'WBTC', 'WSOL', 'WMATIC', 'WAVAX'];
const LP_PATTERNS = ['-LP', '/LP', '_LP', 'LP-', 'UNI-V', 'SLP', 'SUSHI', 'CAKE-LP', 'RAY-', 'ORCA'];

function isExcludedToken(symbol: string, name: string): boolean {
  const sym = symbol.toUpperCase();
  const nm = name.toUpperCase();
  
  if (EXCLUDED_SYMBOLS.includes(sym)) return true;
  if (sym.startsWith('W') && EXCLUDED_SYMBOLS.includes(sym.slice(1))) return true;
  
  for (const pattern of LP_PATTERNS) {
    if (sym.includes(pattern) || nm.includes(pattern)) return true;
  }
  
  if (nm.includes('USD COIN') || nm.includes('TETHER') || nm.includes('STABLECOIN')) return true;
  if (nm.includes('WRAPPED') || nm.includes('BRIDGED')) return true;
  if (nm.includes('LIQUIDITY') && nm.includes('POOL')) return true;
  
  return false;
}

// Runner criteria - hardcoded for now
const CRITERIA = {
  minMc: 1000000,        // $1M
  maxMc: 1000000000,     // $1B
  minVol24h: 500000,     // $500K
  minVol5m: 50000,       // $50K
  minAgeMinutes: 5,
  maxAgeDays: 7,
  minLiquidity: 10000,   // $10K
};

export async function GET() {
  try {
    const existingRunners = await prisma.token.findMany({ 
      where: { isMainRunner: true }
    });
    
    const demoted: { symbol: string; reason: string }[] = [];
    const kept: string[] = [];
    
    for (const token of existingRunners) {
      const reasons: string[] = [];
      
      // Check exclusions
      if (isExcludedToken(token.symbol, token.name)) {
        reasons.push('excluded_token');
      }
      
      // Market cap bounds
      if (token.marketCap < CRITERIA.minMc) {
        reasons.push(`mc_low_${Math.round(token.marketCap/1000)}K`);
      }
      if (token.marketCap > CRITERIA.maxMc) {
        reasons.push(`mc_high`);
      }
      
      // Volume checks
      if (token.volume24h < CRITERIA.minVol24h) {
        reasons.push(`vol24h_low_${Math.round(token.volume24h/1000)}K`);
      }
      if (token.volume5m < CRITERIA.minVol5m) {
        reasons.push(`vol5m_low_${Math.round(token.volume5m/1000)}K`);
      }
      
      // Phase checks - only GRADUATED and RAYDIUM allowed
      const phase = token.phase.toUpperCase();
      if (phase === 'PUMP_FUN' || phase === 'NEW') {
        reasons.push(`phase_${phase}`);
      }
      
      // Age check
      const ageMinutes = (Date.now() - token.createdAt.getTime()) / (1000 * 60);
      const maxAgeMinutes = CRITERIA.maxAgeDays * 24 * 60;
      if (ageMinutes < CRITERIA.minAgeMinutes) {
        reasons.push('too_new');
      }
      if (ageMinutes > maxAgeMinutes) {
        reasons.push('too_old');
      }
      
      if (reasons.length > 0) {
        await prisma.token.update({
          where: { id: token.id },
          data: { isMainRunner: false }
        });
        demoted.push({ symbol: token.symbol, reason: reasons.join(', ') });
      } else {
        kept.push(token.symbol);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      demoted: demoted.length,
      kept: kept.length,
      demotedTokens: demoted,
      keptTokens: kept
    });
  } catch (error) {
    console.error('Demote error:', error);
    return NextResponse.json({ error: 'Failed', details: String(error) }, { status: 500 });
  }
}
