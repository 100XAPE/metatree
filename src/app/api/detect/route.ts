import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============= LAYER 1: PHONETIC MATCHING =============
// Soundex algorithm - converts words to phonetic codes
function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  
  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6'
  };
  
  let result = s[0];
  let prevCode = codes[s[0]] || '';
  
  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]] || '';
    if (code && code !== prevCode) {
      result += code;
    }
    prevCode = code || prevCode;
  }
  
  return (result + '000').slice(0, 4);
}

// Check if two strings sound similar (stricter version)
function soundsSimilar(a: string, b: string): boolean {
  const wordsA = a.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length >= 4);
  const wordsB = b.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length >= 4);
  
  for (const wordA of wordsA) {
    for (const wordB of wordsB) {
      // Must have same soundex AND similar length AND share first letter
      if (soundex(wordA) === soundex(wordB) && 
          wordA !== wordB &&
          wordA[0] === wordB[0] &&
          Math.abs(wordA.length - wordB.length) <= 2) {
        return true;
      }
    }
  }
  return false;
}

// ============= LAYER 2: KEYWORD EXTRACTION =============
const KNOWN_ENTITIES: Record<string, string[]> = {
  'elon': ['elon', 'elun', 'musk', 'mosk', 'muск', 'tesla', 'spacex', 'doge'],
  'trump': ['trump', 'trumo', 'donald', 'donaldo', 'maga', 'potus', '47'],
  'pepe': ['pepe', 'pep', 'frog', 'kek', 'rare'],
  'doge': ['doge', 'doje', 'shiba', 'shib', 'inu', 'dog', 'doggy'],
  'cat': ['cat', 'kitty', 'kitten', 'meow', 'popcat', 'mog', 'mochi'],
  'ai': ['ai', 'gpt', 'agent', 'bot', 'neural', 'openai', 'anthropic'],
  'monkey': ['monkey', 'ape', 'chimp', 'gorilla', 'orangutan', 'punch', 'maman'],
  'penguin': ['penguin', 'pengu', 'pingu', 'tux'],
};

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = lower.split(/\s+/).filter(w => w.length > 1);
  
  const keywords = new Set<string>();
  
  // Direct word matches
  for (const word of words) {
    for (const [entity, variants] of Object.entries(KNOWN_ENTITIES)) {
      if (variants.some(v => word.includes(v) || v.includes(word))) {
        keywords.add(entity);
      }
    }
  }
  
  // Also add the raw words
  words.forEach(w => keywords.add(w));
  
  return Array.from(keywords);
}

function hasKeywordOverlap(a: string[], b: string[]): boolean {
  const entityKeysA = a.filter(k => Object.keys(KNOWN_ENTITIES).includes(k));
  const entityKeysB = b.filter(k => Object.keys(KNOWN_ENTITIES).includes(k));
  
  return entityKeysA.some(k => entityKeysB.includes(k));
}

// ============= LAYER 2.5: LETTER SWAP DETECTION =============
// Common intentional misspellings
const LETTER_SWAPS: [string, string][] = [
  ['o', 'u'], ['i', 'e'], ['a', 'e'], ['c', 'k'], ['s', 'z'],
  ['y', 'i'], ['ph', 'f'], ['ck', 'k'], ['ee', 'i']
];

function isIntentionalMisspelling(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  
  if (la === lb) return false;
  if (Math.abs(la.length - lb.length) > 2) return false;
  if (la.length < 3 || lb.length < 3) return false;
  
  // Try each swap
  for (const [from, to] of LETTER_SWAPS) {
    if (la.replace(new RegExp(from, 'g'), to) === lb ||
        lb.replace(new RegExp(from, 'g'), to) === la) {
      return true;
    }
  }
  
  // Check if only 1-2 chars different
  let diff = 0;
  const minLen = Math.min(la.length, lb.length);
  for (let i = 0; i < minLen; i++) {
    if (la[i] !== lb[i]) diff++;
  }
  diff += Math.abs(la.length - lb.length);
  
  return diff <= 2 && diff > 0;
}

// ============= LAYER 3: FUZZY STRING MATCHING =============
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

function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase(), b.toLowerCase()) / maxLen;
}

// ============= LAYER 4: AI COMPARISON =============
async function aiCompareTokens(
  derivative: { name: string; symbol: string },
  runners: { name: string; symbol: string }[]
): Promise<{ runner: string; confidence: number } | null> {
  if (!OPENAI_API_KEY || runners.length === 0) return null;
  
  const runnerList = runners.map(r => `- ${r.symbol}: "${r.name}"`).join('\n');
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `You are analyzing crypto meme tokens to find derivatives/copies.

Token to analyze:
- Symbol: ${derivative.symbol}
- Name: "${derivative.name}"

Potential parent runners:
${runnerList}

Is this token likely a derivative/copy/tribute of any runner above? Consider:
- Similar names (misspellings, variations)
- Same theme/meme
- Obvious copies

Reply in JSON format:
{"match": "SYMBOL" or null, "confidence": 0-100, "reason": "brief explanation"}

If no clear match, return {"match": null, "confidence": 0, "reason": "no match"}`
        }],
        max_tokens: 150,
        temperature: 0.1
      })
    });
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.match && parsed.confidence >= 60) {
        return { runner: parsed.match, confidence: parsed.confidence };
      }
    }
  } catch (e) {
    console.error('AI comparison failed:', e);
  }
  
  return null;
}

// ============= MAIN DETECTION =============
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const useAI = searchParams.get('ai') !== 'false';
  const dryRun = searchParams.get('dry') === 'true';
  
  try {
    const runners = await prisma.token.findMany({
      where: { isMainRunner: true },
      orderBy: { marketCap: 'desc' }
    });
    
    const unlinked = await prisma.token.findMany({
      where: { 
        isMainRunner: false,
        parentRunnerId: null 
      },
      orderBy: { marketCap: 'desc' }
    });
    
    const matches: {
      derivative: string;
      runner: string;
      method: string;
      confidence: number;
    }[] = [];
    
    const processed = new Set<string>();
    
    for (const token of unlinked) {
      if (processed.has(token.id)) continue;
      
      const tokenKeywords = extractKeywords(`${token.name} ${token.symbol}`);
      let bestMatch: { runner: typeof runners[0]; method: string; confidence: number } | null = null;
      
      for (const runner of runners) {
        const runnerKeywords = extractKeywords(`${runner.name} ${runner.symbol}`);
        
        // Layer 1: Direct name contains
        if (token.name.toLowerCase().includes(runner.symbol.toLowerCase()) ||
            token.symbol.toLowerCase().includes(runner.symbol.toLowerCase())) {
          if (!bestMatch || bestMatch.confidence < 95) {
            bestMatch = { runner, method: 'name_contains', confidence: 95 };
          }
          continue;
        }
        
        // Layer 2: Intentional misspelling detection
        if (isIntentionalMisspelling(token.symbol, runner.symbol) ||
            isIntentionalMisspelling(token.name.split(' ')[0], runner.name.split(' ')[0])) {
          if (!bestMatch || bestMatch.confidence < 90) {
            bestMatch = { runner, method: 'misspelling', confidence: 90 };
          }
          continue;
        }
        
        // Layer 3: Phonetic matching
        if (soundsSimilar(token.name, runner.name) || 
            soundsSimilar(token.symbol, runner.symbol)) {
          if (!bestMatch || bestMatch.confidence < 80) {
            bestMatch = { runner, method: 'phonetic', confidence: 80 };
          }
          continue;
        }
        
        // Layer 4: Keyword overlap (only for meaningful entities)
        if (hasKeywordOverlap(tokenKeywords, runnerKeywords)) {
          // Extra check: the overlap should be a specific entity, not generic
          const overlap = tokenKeywords.filter(k => 
            runnerKeywords.includes(k) && Object.keys(KNOWN_ENTITIES).includes(k)
          );
          if (overlap.length > 0) {
            if (!bestMatch || bestMatch.confidence < 75) {
              bestMatch = { runner, method: `keyword:${overlap[0]}`, confidence: 75 };
            }
            continue;
          }
        }
        
        // Layer 4: Fuzzy symbol match (80%+ similarity)
        const symSim = similarityScore(token.symbol, runner.symbol);
        if (symSim >= 0.8 && token.symbol.length >= 3) {
          if (!bestMatch || bestMatch.confidence < symSim * 90) {
            bestMatch = { runner, method: 'fuzzy', confidence: Math.round(symSim * 90) };
          }
        }
      }
      
      // Layer 5: AI comparison for uncertain cases
      if (!bestMatch && useAI && runners.length > 0) {
        const aiResult = await aiCompareTokens(
          { name: token.name, symbol: token.symbol },
          runners.slice(0, 10).map(r => ({ name: r.name, symbol: r.symbol }))
        );
        
        if (aiResult) {
          const matchedRunner = runners.find(r => 
            r.symbol.toLowerCase() === aiResult.runner.toLowerCase()
          );
          if (matchedRunner) {
            bestMatch = { runner: matchedRunner, method: 'ai', confidence: aiResult.confidence };
          }
        }
        
        // Rate limit AI calls
        await new Promise(r => setTimeout(r, 200));
      }
      
      if (bestMatch) {
        processed.add(token.id);
        
        if (!dryRun) {
          await prisma.token.update({
            where: { id: token.id },
            data: { parentRunnerId: bestMatch.runner.id }
          });
        }
        
        matches.push({
          derivative: token.symbol,
          runner: bestMatch.runner.symbol,
          method: bestMatch.method,
          confidence: bestMatch.confidence
        });
      }
    }
    
    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    
    return NextResponse.json({
      success: true,
      dryRun,
      stats: {
        runners: runners.length,
        unlinked: unlinked.length,
        matched: matches.length
      },
      matches
    });
    
  } catch (error) {
    console.error('Detection error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
