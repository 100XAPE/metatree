import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Quick derivative matching using ONLY cached data
// No external API calls - runs fast

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Common derivative prefixes/suffixes
const DERIVATIVE_PATTERNS = [
  'baby', 'mini', 'micro', 'mega', 'super', 'ultra', 'king', 'queen', 
  'lord', 'sir', 'mr', 'ms', 'dr', 'professor', 'chief', 'general',
  '2', '2.0', 'ii', 'iii', 'jr', 'sr', 'pro', 'max', 'plus', 'lite',
  'inu', 'wif', 'hat', 'classic', 'og', 'real', 'true', 'original',
  'son', 'daughter', 'wife', 'husband', 'mom', 'dad', 'father', 'mother',
  'sol', 'eth', 'base', 'on'
];

function isNameDerivative(tokenName: string, runnerName: string): boolean {
  const t = tokenName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const r = runnerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  if (t === r) return false;
  if (t.includes(r) && t.length > r.length) return true;
  
  for (const pattern of DERIVATIVE_PATTERNS) {
    if (t === pattern + r || t === r + pattern) return true;
    if (t === r + '2' || t === r + '3' || t === r + '69' || t === r + '420') return true;
  }
  
  if (Math.abs(t.length - r.length) <= 2 && t.length >= 3) {
    const distance = levenshtein(t, r);
    if (distance <= 2 && distance > 0) return true;
  }
  
  return false;
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

// Get embedding from OpenAI
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

export async function GET() {
  try {
    const runners = await prisma.token.findMany({
      where: { isMainRunner: true },
      orderBy: { marketCap: 'desc' }
    });
    
    const others = await prisma.token.findMany({
      where: { isMainRunner: false },
      orderBy: { marketCap: 'desc' }
    });
    
    const matches: { derivative: string; runner: string; method: string }[] = [];
    let linkedCount = 0;
    
    // Method 1: Name matching
    for (const other of others) {
      if (other.parentRunnerId) continue;
      
      for (const runner of runners) {
        if (isNameDerivative(other.symbol, runner.symbol) || 
            isNameDerivative(other.name, runner.name)) {
          await prisma.token.update({
            where: { id: other.id },
            data: { parentRunnerId: runner.id }
          });
          linkedCount++;
          matches.push({ derivative: other.symbol, runner: runner.symbol, method: 'name' });
          break;
        }
      }
    }
    
    // Method 2: Visual similarity using cached descriptions
    const runnersWithDesc = runners.filter(r => r.keywords?.some(k => k.startsWith('img:')));
    const othersWithDesc = others.filter(o => 
      o.keywords?.some(k => k.startsWith('img:')) && 
      !matches.some(m => m.derivative === o.symbol)
    );
    
    if (runnersWithDesc.length > 0 && othersWithDesc.length > 0) {
      // Get embeddings for all descriptions
      const runnerEmbeddings: { id: string; symbol: string; embedding: number[] }[] = [];
      const otherEmbeddings: { id: string; symbol: string; embedding: number[] }[] = [];
      
      // Batch process embeddings
      const allDescs = [
        ...runnersWithDesc.map(r => ({ token: r, type: 'runner' })),
        ...othersWithDesc.map(o => ({ token: o, type: 'other' }))
      ];
      
      await Promise.all(allDescs.map(async ({ token, type }) => {
        const desc = token.keywords?.find(k => k.startsWith('img:'))?.replace('img:', '');
        if (!desc) return;
        
        const embedding = await getEmbedding(desc);
        if (!embedding) return;
        
        if (type === 'runner') {
          runnerEmbeddings.push({ id: token.id, symbol: token.symbol, embedding });
        } else {
          otherEmbeddings.push({ id: token.id, symbol: token.symbol, embedding });
        }
      }));
      
      // Compare
      const THRESHOLD = 0.50;
      for (const other of otherEmbeddings) {
        let bestRunner: typeof runnerEmbeddings[0] | null = null;
        let bestSim = 0;
        
        for (const runner of runnerEmbeddings) {
          const sim = cosineSimilarity(runner.embedding, other.embedding);
          if (sim >= THRESHOLD && sim > bestSim) {
            bestRunner = runner;
            bestSim = sim;
          }
        }
        
        if (bestRunner) {
          await prisma.token.update({
            where: { id: other.id },
            data: { parentRunnerId: bestRunner.id }
          });
          linkedCount++;
          matches.push({ 
            derivative: other.symbol, 
            runner: bestRunner.symbol, 
            method: `visual:${Math.round(bestSim * 100)}%`
          });
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      stats: {
        runners: runners.length,
        potentialDerivatives: others.length,
        runnersWithImageDesc: runnersWithDesc.length,
        othersWithImageDesc: othersWithDesc.length
      },
      linked: linkedCount,
      matches
    });
    
  } catch (error) {
    console.error('Match error:', error);
    return NextResponse.json({ error: 'Match failed', details: String(error) }, { status: 500 });
  }
}
