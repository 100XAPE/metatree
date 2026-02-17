import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Analyze a small batch of token images (5 at a time)
// Call repeatedly to build up the cache

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
              text: `Describe this crypto token/meme image. Focus on:
- Main subject (animal, character, person, meme)
- Style (cartoon, realistic, pixel art)
- Colors and distinctive features
- Known meme references if any

Keep it concise, 20-40 words.`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }],
        max_tokens: 100
      })
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.toLowerCase() || null;
  } catch (e) {
    console.error('Image analysis failed:', e);
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runnersOnly = searchParams.get('runners') === 'true';
  const limit = parseInt(searchParams.get('limit') || '5');
  
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }
  
  try {
    // Find tokens that need analysis (have image but no cached description)
    const tokens = await prisma.token.findMany({
      where: {
        imageUrl: { not: null },
        ...(runnersOnly ? { isMainRunner: true } : {}),
        // No cached image description
        NOT: {
          keywords: { hasSome: [] } // This won't work perfectly, we'll filter in JS
        }
      },
      orderBy: { marketCap: 'desc' },
      take: limit * 3 // Get more in case some already have descriptions
    });
    
    // Filter to tokens without img: keyword
    const needsAnalysis = tokens.filter(t => 
      !t.keywords?.some(k => k.startsWith('img:'))
    ).slice(0, limit);
    
    if (needsAnalysis.length === 0) {
      // Check total analyzed
      const analyzed = await prisma.token.findMany({
        where: {
          keywords: { isEmpty: false }
        },
        select: { id: true, keywords: true }
      });
      
      const withDesc = analyzed.filter(t => t.keywords?.some(k => k.startsWith('img:')));
      
      return NextResponse.json({
        success: true,
        message: 'No tokens need analysis',
        alreadyAnalyzed: withDesc.length,
        totalTokens: tokens.length
      });
    }
    
    const results: { symbol: string; desc: string }[] = [];
    
    for (const token of needsAnalysis) {
      if (!token.imageUrl) continue;
      
      const desc = await analyzeImage(token.imageUrl);
      
      if (desc) {
        const newKeywords = [
          ...(token.keywords || []).filter(k => !k.startsWith('img:')), 
          `img:${desc}`
        ];
        
        await prisma.token.update({
          where: { id: token.id },
          data: { keywords: newKeywords }
        });
        
        results.push({ symbol: token.symbol, desc });
      }
      
      // Small delay between API calls
      await new Promise(r => setTimeout(r, 200));
    }
    
    return NextResponse.json({
      success: true,
      analyzed: results.length,
      results,
      note: 'Call again to analyze more tokens'
    });
    
  } catch (error) {
    console.error('Batch analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed', details: String(error) }, { status: 500 });
  }
}
