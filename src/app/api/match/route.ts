import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ═══════════════════════════════════════════════════════════════════
// METATREE v2 - Multi-Signal Derivative Detection
// ═══════════════════════════════════════════════════════════════════

// Derivative name patterns
const DERIVATIVE_PATTERNS = [
  'baby', 'mini', 'micro', 'mega', 'super', 'ultra', 'king', 'queen', 
  'lord', 'sir', 'mr', 'ms', 'dr', 'professor', 'chief', 'general',
  '2', '2.0', 'ii', 'iii', 'jr', 'sr', 'pro', 'max', 'plus', 'lite',
  'inu', 'wif', 'hat', 'classic', 'og', 'real', 'true', 'original',
  'son', 'daughter', 'wife', 'husband', 'mom', 'dad', 'father', 'mother',
  'sol', 'eth', 'base', 'on', 'meta', 'ai', 'gpt', 'bot'
];

// ─────────────────────────────────────────────────────────────────────
// SIGNAL 1: Name Pattern Matching
// ─────────────────────────────────────────────────────────────────────

function cleanName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Generic words that don't indicate derivative relationship
const IGNORE_WORDS = new Set([
  'coin', 'token', 'meme', 'sol', 'solana', 'pump', 'moon', 'doge', 'inu', 
  'ai', 'gpt', 'bot', 'cash', 'money', 'crypto', 'the', 'and', 'for'
]);

function getNameScore(tokenName: string, tokenSymbol: string, runnerName: string, runnerSymbol: string): number {
  const t = cleanName(tokenSymbol);
  const tn = cleanName(tokenName);
  const r = cleanName(runnerSymbol);
  const rn = cleanName(runnerName);
  
  // Skip if exactly same (prevents self-matching)
  if (t === r && tn === rn) return 0;
  if (r.length < 2 || rn.length < 2) return 0;
  
  let score = 0;
  
  // Direct substring containment (strong signal)
  // Derivative contains runner symbol/name
  if (r.length >= 4 && t.includes(r) && t !== r) score = Math.max(score, 0.85);
  if (rn.length >= 5 && tn.includes(rn) && tn !== rn) score = Math.max(score, 0.75);
  
  // Reverse containment - derivative symbol/name appears in runner's full name
  // e.g., "Peptides" appearing in "flying chinese peptides horse"
  if (t.length >= 4 && rn.includes(t) && t !== rn) score = Math.max(score, 0.80);
  if (tn.length >= 5 && rn.includes(tn) && tn !== rn) score = Math.max(score, 0.75);
  
  // Pattern + name combinations
  for (const pattern of DERIVATIVE_PATTERNS) {
    if (t === pattern + r || t === r + pattern) return 1.0;
    if (tn === pattern + rn || tn === rn + pattern) return 0.9;
  }
  
  // Levenshtein similarity for typo-squatting detection
  if (r.length >= 4) {
    const dist = levenshtein(t, r);
    if (dist === 1 && t.length === r.length) score = Math.max(score, 0.85); // Single char swap
    if (dist === 1 && Math.abs(t.length - r.length) === 1) score = Math.max(score, 0.7); // One char added/removed
  }
  
  // Word overlap in longer names (but filter out generic words)
  const tWords = tokenName.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !IGNORE_WORDS.has(w));
  const rWords = runnerName.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3 && !IGNORE_WORDS.has(w));
  
  if (rWords.length > 0 && tWords.length > 0) {
    const commonWords = tWords.filter(tw => 
      rWords.some(rw => 
        (tw.length >= 4 && rw.includes(tw)) || 
        (rw.length >= 4 && tw.includes(rw))
      )
    );
    if (commonWords.length > 0) {
      score = Math.max(score, 0.6 * (commonWords.length / Math.max(rWords.length, 1)));
    }
  }
  
  return score;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i-1] === a[j-1] 
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// ─────────────────────────────────────────────────────────────────────
// SIGNAL 2: Keyword/Theme Matching
// ─────────────────────────────────────────────────────────────────────

function getKeywordScore(tokenKeywords: string[], runnerKeywords: string[]): number {
  if (!tokenKeywords?.length || !runnerKeywords?.length) return 0;
  
  // Filter out img: descriptions for keyword matching
  const tKeys = tokenKeywords.filter(k => !k.startsWith('img:')).map(k => k.toLowerCase());
  const rKeys = runnerKeywords.filter(k => !k.startsWith('img:')).map(k => k.toLowerCase());
  
  if (tKeys.length === 0 || rKeys.length === 0) return 0;
  
  const matches = tKeys.filter(tk => rKeys.some(rk => tk === rk || tk.includes(rk) || rk.includes(tk)));
  return matches.length > 0 ? Math.min(1.0, 0.4 + (matches.length * 0.2)) : 0;
}

// ─────────────────────────────────────────────────────────────────────
// SIGNAL 3: Visual Similarity (Image Description Embeddings)
// ─────────────────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });
    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch { return null; }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────────────────────────────────────────────
// SIGNAL 4: Semantic Description Matching
// ─────────────────────────────────────────────────────────────────────

function getTokenDescription(token: { name: string; symbol: string; keywords?: string[] }): string {
  const imgDesc = token.keywords?.find(k => k.startsWith('img:'))?.replace('img:', '') || '';
  const otherKeywords = token.keywords?.filter(k => !k.startsWith('img:')).join(' ') || '';
  return `${token.name} (${token.symbol}). ${imgDesc} ${otherKeywords}`.trim();
}

// ─────────────────════════════════════════════════════════════════════
// MAIN MATCHING LOGIC
// ═══════════════════════════════════════════════════════════════════

interface MatchResult {
  derivative: string;
  derivativeId: string;
  runner: string;
  runnerId: string;
  score: number;
  signals: string[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dry') === 'true';
  const minScore = parseFloat(searchParams.get('min') || '0.55');
  const updateReasons = searchParams.get('reasons') === 'true'; // Update existing links with reasons
  
  try {
    const runners = await prisma.token.findMany({
      where: { isMainRunner: true },
      orderBy: { marketCap: 'desc' }
    });
    
    // If updating reasons, include already-linked tokens without a reason
    const candidates = await prisma.token.findMany({
      where: { 
        isMainRunner: false,
        ...(updateReasons 
          ? { parentRunnerId: { not: null }, matchReason: null }
          : { parentRunnerId: null })
      },
      orderBy: { marketCap: 'desc' }
    });
    
    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No unlinked candidates to match',
        stats: { runners: runners.length, candidates: 0 }
      });
    }
    
    // Pre-compute embeddings for semantic matching
    const runnerEmbeddings = new Map<string, number[]>();
    const candidateEmbeddings = new Map<string, number[]>();
    
    // Get embeddings for runners
    await Promise.all(runners.map(async (r) => {
      const desc = getTokenDescription(r);
      const emb = await getEmbedding(desc);
      if (emb) runnerEmbeddings.set(r.id, emb);
    }));
    
    // Get embeddings for candidates (batch in groups)
    const BATCH_SIZE = 20;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (c) => {
        const desc = getTokenDescription(c);
        const emb = await getEmbedding(desc);
        if (emb) candidateEmbeddings.set(c.id, emb);
      }));
    }
    
    // Score all candidate-runner pairs
    const allMatches: MatchResult[] = [];
    
    for (const candidate of candidates) {
      let bestMatch: MatchResult | null = null;
      
      // If updating reasons, only check against the current parent
      const runnersToCheck = updateReasons && candidate.parentRunnerId
        ? runners.filter(r => r.id === candidate.parentRunnerId)
        : runners;
      
      for (const runner of runnersToCheck) {
        // Skip self-matching (by ID, mint, or symbol)
        if (candidate.id === runner.id || candidate.mint === runner.mint) continue;
        if (candidate.symbol.toLowerCase() === runner.symbol.toLowerCase()) continue;
        
        const signals: string[] = [];
        let totalScore = 0;
        let signalCount = 0;
        
        // Signal 1: Name matching (weight: 0.35, but high-confidence matches get boosted)
        const nameScore = getNameScore(candidate.name, candidate.symbol, runner.name, runner.symbol);
        if (nameScore > 0) {
          signals.push(`name:${Math.round(nameScore * 100)}%`);
          // High-confidence name matches (>= 0.75) get extra weight
          const nameWeight = nameScore >= 0.75 ? 0.50 : 0.35;
          totalScore += nameScore * nameWeight;
          signalCount++;
        }
        
        // Signal 2: Keyword matching (weight: 0.25)
        const keywordScore = getKeywordScore(candidate.keywords || [], runner.keywords || []);
        if (keywordScore > 0) {
          signals.push(`keyword:${Math.round(keywordScore * 100)}%`);
          totalScore += keywordScore * 0.25;
          signalCount++;
        }
        
        // Signal 3: Semantic similarity (weight: 0.40)
        const candEmb = candidateEmbeddings.get(candidate.id);
        const runEmb = runnerEmbeddings.get(runner.id);
        if (candEmb && runEmb) {
          const semanticScore = cosineSimilarity(candEmb, runEmb);
          if (semanticScore > 0.45) { // Only count if reasonably similar
            signals.push(`semantic:${Math.round(semanticScore * 100)}%`);
            totalScore += semanticScore * 0.40;
            signalCount++;
          }
        }
        
        // Normalize score
        const finalScore = signalCount > 0 ? totalScore : 0;
        
        // Boost if multiple signals agree
        const multiSignalBoost = signalCount >= 2 ? 1.15 : 1.0;
        const boostedScore = Math.min(1.0, finalScore * multiSignalBoost);
        
        if (boostedScore >= minScore && (!bestMatch || boostedScore > bestMatch.score)) {
          bestMatch = {
            derivative: candidate.symbol,
            derivativeId: candidate.id,
            runner: runner.symbol,
            runnerId: runner.id,
            score: boostedScore,
            signals
          };
        }
      }
      
      if (bestMatch) {
        allMatches.push(bestMatch);
      }
    }
    
    // Sort by score descending
    allMatches.sort((a, b) => b.score - a.score);
    
    // Apply matches (unless dry run)
    let linkedCount = 0;
    if (!dryRun) {
      for (const match of allMatches) {
        await prisma.token.update({
          where: { id: match.derivativeId },
          data: updateReasons
            ? { matchReason: match.signals.join(' + ') }
            : { parentRunnerId: match.runnerId, matchReason: match.signals.join(' + ') }
        });
        linkedCount++;
      }
    }
    
    return NextResponse.json({
      success: true,
      dryRun,
      minScore,
      stats: {
        runners: runners.length,
        candidates: candidates.length,
        runnersWithEmbeddings: runnerEmbeddings.size,
        candidatesWithEmbeddings: candidateEmbeddings.size
      },
      linked: linkedCount,
      matches: allMatches.map(m => ({
        derivative: m.derivative,
        runner: m.runner,
        score: Math.round(m.score * 100) + '%',
        signals: m.signals
      }))
    });
    
  } catch (error) {
    console.error('Match error:', error);
    return NextResponse.json({ error: 'Match failed', details: String(error) }, { status: 500 });
  }
}
