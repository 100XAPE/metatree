import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Analyze token images and find visual connections
// Uses OpenAI Vision API to describe images + embeddings for similarity

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
    
    for (const token of tokens) {
      if (!token.imageUrl) continue;
      
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
        
        // Rate limit for vision API
        await new Promise(r => setTimeout(r, 300));
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
        // Small delay for embedding API
        await new Promise(r => setTimeout(r, 100));
      }
    }
    
    console.log(`Analyzed ${analyzed.length} images with embeddings, finding connections...`);
    
    // Find visual connections using embedding similarity
    const analyzedRunners = analyzed.filter(t => t.isRunner);
    const analyzedOthers = analyzed.filter(t => !t.isRunner);
    
    let linkedCount = 0;
    const matches: { derivative: string; runner: string; similarity: number }[] = [];
    
    // Debug: track all similarity scores for analysis
    const allScores: { derivative: string; runner: string; similarity: number; derivDesc: string; runnerDesc: string }[] = [];
    
    for (const other of analyzedOthers) {
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
          similarity: Math.round(bestSimilarity * 100) 
        });
        console.log(`Linked ${other.symbol} -> ${bestRunner.symbol} (${Math.round(bestSimilarity * 100)}% similar)`);
      }
    }
    
    // Sort allScores by similarity descending to see best potential matches
    allScores.sort((a, b) => b.similarity - a.similarity);
    
    return NextResponse.json({
      success: true,
      analyzed: analyzed.length,
      runners: analyzedRunners.length,
      potentialDerivatives: analyzedOthers.length,
      linked: linkedCount,
      threshold: `${SIMILARITY_THRESHOLD * 100}%`,
      matches: matches.slice(0, 20),
      // Debug: top 15 similarity scores (even below threshold)
      topScores: allScores.slice(0, 15),
      samples: analyzed.slice(0, 10).map(t => ({ symbol: t.symbol, desc: t.desc }))
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed', details: String(error) }, { status: 500 });
  }
}
// Force rebuild Mon Feb 16 23:04:38 +04 2026
