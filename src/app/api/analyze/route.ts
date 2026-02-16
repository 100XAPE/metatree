import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Multi-method derivative detection:
// 1. Visual similarity (image embeddings)
// 2. Name/symbol matching (fuzzy)
// 3. Description analysis

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

// Check if tokenName is a derivative of runnerName
function isNameDerivative(tokenName: string, runnerName: string): boolean {
  const t = tokenName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const r = runnerName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact match (shouldn't happen but check)
  if (t === r) return false;
  
  // Token contains runner name
  if (t.includes(r) && t.length > r.length) return true;
  
  // Runner contains token name (token is base, runner might be derivative - skip)
  // if (r.includes(t) && r.length > t.length) return true;
  
  // Check for pattern + runner combinations
  for (const pattern of DERIVATIVE_PATTERNS) {
    if (t === pattern + r || t === r + pattern) return true;
    // Also check with numbers
    if (t === r + '2' || t === r + '3' || t === r + '69' || t === r + '420') return true;
  }
  
  // Levenshtein distance for typos/variations (if names are similar length)
  if (Math.abs(t.length - r.length) <= 2 && t.length >= 3) {
    const distance = levenshtein(t, r);
    if (distance <= 2 && distance > 0) return true;
  }
  
  return false;
}

// Simple Levenshtein distance
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

async function analyzeImage(imageUrl: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;
  
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
          content: [
            {
              type: 'text',
              text: `Describe this crypto token/meme image in detail. Focus on:
- Main subject (what is it? animal, character, person, object)
- Style (cartoon, pixel art, realistic, edited photo)
- Colors (what are the dominant colors)
- Distinctive features (accessories, expressions, poses)
- If it resembles a known meme, character, or celebrity, name it

Be specific and detailed. Example: "green cartoon frog (pepe meme) with smug expression, wearing red maga hat" or "shiba inu dog face, orange fur, happy expression, doge meme style"`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }],
        max_tokens: 150
      })
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.toLowerCase() || null;
  } catch (e) {
    console.error('Image analysis failed:', e);
    return null;
  }
}

// Get embedding for a text description
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
  } catch (e) {
    console.error('Embedding failed:', e);
    return null;
  }
}

// Cosine similarity between two vectors
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

// Similarity threshold for visual match (lower = more matches, higher = stricter)
// 0.5 = loose match, 0.6 = moderate, 0.7 = fairly similar, 0.8 = very similar
const SIMILARITY_THRESHOLD = 0.50;

export async function GET() {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ 
      error: 'OPENAI_API_KEY not configured',
      hint: 'Add OPENAI_API_KEY to Vercel environment variables'
    }, { status: 500 });
  }
  
  try {
    // Get runners first, then ALL other tokens (potential derivatives)
    const runners = await prisma.token.findMany({
      where: { 
        isMainRunner: true,
        imageUrl: { not: null }
      },
      orderBy: { marketCap: 'desc' }
    });
    
    const potentialDerivatives = await prisma.token.findMany({
      where: { 
        isMainRunner: false,
        imageUrl: { not: null }
      },
      orderBy: { marketCap: 'desc' }
    });
    
    const tokens = [...runners, ...potentialDerivatives];
    
    console.log(`Analyzing ${tokens.length} token images...`);
    
    // Analyze images and store descriptions + embeddings
    const analyzed: { 
      id: string; 
      symbol: string; 
      desc: string; 
      embedding: number[];
      mc: number; 
      isRunner: boolean 
    }[] = [];
    
    // Process tokens in parallel batches for speed
    const batchSize = 5;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (token) => {
        if (!token.imageUrl) return;
        
        // Check if we already have a cached description
        const existingDesc = token.keywords?.find(k => k.startsWith('img:'))?.replace('img:', '');
        let desc = existingDesc;
        
        // Re-analyze if no existing description
        if (!desc) {
          desc = await analyzeImage(token.imageUrl);
          
          if (desc) {
            // Store description in keywords
            const newKeywords = [...(token.keywords || []).filter(k => !k.startsWith('img:')), `img:${desc}`];
            await prisma.token.update({
              where: { id: token.id },
              data: { keywords: newKeywords }
            });
          }
        }
        
        if (desc) {
          // Get embedding for the description
          const embedding = await getEmbedding(desc);
          if (embedding) {
            analyzed.push({
              id: token.id,
              symbol: token.symbol,
              desc,
              embedding,
              mc: token.marketCap,
              isRunner: token.isMainRunner
            });
          }
        }
      }));
    }
    
    console.log(`Analyzed ${analyzed.length} images with embeddings, finding connections...`);
    
    // Find connections using multiple methods
    const analyzedRunners = analyzed.filter(t => t.isRunner);
    const analyzedOthers = analyzed.filter(t => !t.isRunner);
    
    // Also get all runners for name matching (including those without images)
    const allRunners = await prisma.token.findMany({
      where: { isMainRunner: true },
      orderBy: { marketCap: 'desc' }
    });
    
    // Get all non-runners for name matching
    const allOthers = await prisma.token.findMany({
      where: { isMainRunner: false },
      orderBy: { marketCap: 'desc' }
    });
    
    let linkedCount = 0;
    const matches: { derivative: string; runner: string; method: string; score: number }[] = [];
    
    // Method 1: Name matching (fast, no API calls)
    for (const other of allOthers) {
      if (other.parentRunnerId) continue; // Already linked
      
      for (const runner of allRunners) {
        if (isNameDerivative(other.symbol, runner.symbol) || 
            isNameDerivative(other.name, runner.name)) {
          await prisma.token.update({
            where: { id: other.id },
            data: { parentRunnerId: runner.id }
          });
          linkedCount++;
          matches.push({ 
            derivative: other.symbol, 
            runner: runner.symbol, 
            method: 'name',
            score: 100
          });
          console.log(`Linked ${other.symbol} -> ${runner.symbol} (name match)`);
          break;
        }
      }
    }
    
    // Method 2: Visual similarity (embedding comparison)
    const allScores: { derivative: string; runner: string; similarity: number; derivDesc: string; runnerDesc: string }[] = [];
    
    for (const other of analyzedOthers) {
      // Check if already linked by name
      const alreadyLinked = matches.some(m => m.derivative === other.symbol);
      if (alreadyLinked) continue;
      
      let bestRunner: typeof analyzedRunners[0] | null = null;
      let bestSimilarity = 0;
      
      for (const runner of analyzedRunners) {
        if (runner.id === other.id) continue;
        
        const similarity = cosineSimilarity(runner.embedding, other.embedding);
        
        // Track all scores for debugging
        allScores.push({
          derivative: other.symbol,
          runner: runner.symbol,
          similarity: Math.round(similarity * 100),
          derivDesc: other.desc.slice(0, 60),
          runnerDesc: runner.desc.slice(0, 60)
        });
        
        if (similarity >= SIMILARITY_THRESHOLD && similarity > bestSimilarity) {
          bestRunner = runner;
          bestSimilarity = similarity;
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
          method: 'visual',
          score: Math.round(bestSimilarity * 100) 
        });
        console.log(`Linked ${other.symbol} -> ${bestRunner.symbol} (${Math.round(bestSimilarity * 100)}% visual)`);
      }
    }
    
    // Sort allScores by similarity descending
    allScores.sort((a, b) => b.similarity - a.similarity);
    
    const nameMatches = matches.filter(m => m.method === 'name').length;
    const visualMatches = matches.filter(m => m.method === 'visual').length;
    
    return NextResponse.json({
      success: true,
      stats: {
        totalTokens: allRunners.length + allOthers.length,
        runners: allRunners.length,
        potentialDerivatives: allOthers.length,
        imagesAnalyzed: analyzed.length
      },
      linked: {
        total: linkedCount,
        byName: nameMatches,
        byVisual: visualMatches
      },
      visualThreshold: `${SIMILARITY_THRESHOLD * 100}%`,
      matches: matches.slice(0, 30),
      topVisualScores: allScores.slice(0, 10),
      sampleDescriptions: analyzed.slice(0, 5).map(t => ({ symbol: t.symbol, desc: t.desc }))
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed', details: String(error) }, { status: 500 });
  }
}
// Force rebuild Mon Feb 16 23:04:38 +04 2026
