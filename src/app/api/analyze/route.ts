import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Analyze token images and find visual connections
// Uses OpenAI Vision API to describe images

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
              text: 'Describe this crypto token image in 10-20 words. Focus on: main subject, animals, characters, objects, memes, celebrities. Be specific. Example: "orange cat wearing sunglasses" or "pepe frog holding bitcoin" or "elon musk cartoon face"'
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }],
        max_tokens: 50
      })
    });
    
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.toLowerCase() || null;
  } catch (e) {
    console.error('Image analysis failed:', e);
    return null;
  }
}

// Find visual connections between tokens
function findVisualMatch(runnerDesc: string, tokenDesc: string): boolean {
  if (!runnerDesc || !tokenDesc) return false;
  
  // Extract key visual elements
  const extractElements = (desc: string): string[] => {
    const elements: string[] = [];
    
    // Animals
    const animals = ['cat', 'dog', 'frog', 'pepe', 'bear', 'teddy', 'penguin', 'whale', 'ape', 'monkey', 'orangutan', 'bird', 'owl', 'duck', 'shiba', 'doge'];
    // Objects
    const objects = ['hat', 'glasses', 'sunglasses', 'crown', 'sword', 'gun', 'rocket', 'moon', 'bitcoin', 'coin', 'money', 'diamond', 'laser'];
    // Characters
    const characters = ['elon', 'trump', 'pepe', 'wojak', 'chad', 'doge', 'shiba'];
    
    const allPatterns = [...animals, ...objects, ...characters];
    
    for (const pattern of allPatterns) {
      if (desc.includes(pattern)) {
        elements.push(pattern);
      }
    }
    
    return elements;
  };
  
  const runnerElements = extractElements(runnerDesc);
  const tokenElements = extractElements(tokenDesc);
  
  // Check for meaningful overlap
  const overlap = runnerElements.filter(e => tokenElements.includes(e));
  
  // Need at least one specific match (not just generic things like 'coin')
  const meaningfulOverlap = overlap.filter(e => !['coin', 'money', 'crypto'].includes(e));
  
  return meaningfulOverlap.length > 0;
}

export async function GET() {
  if (!OPENAI_API_KEY) {
    return NextResponse.json({ 
      error: 'OPENAI_API_KEY not configured',
      hint: 'Add OPENAI_API_KEY to Vercel environment variables'
    }, { status: 500 });
  }
  
  try {
    // Get all visible tokens with images
    const tokens = await prisma.token.findMany({
      where: { 
        isVisible: true,
        imageUrl: { not: null }
      },
      orderBy: { marketCap: 'desc' },
      take: 50
    });
    
    console.log(`Analyzing ${tokens.length} token images...`);
    
    // Analyze images and store descriptions
    const analyzed: { id: string; symbol: string; desc: string; mc: number; isRunner: boolean }[] = [];
    
    for (const token of tokens) {
      if (!token.imageUrl) continue;
      
      // Check if already analyzed (stored in keywords for now)
      let desc = token.keywords?.find(k => k.startsWith('img:'))?.replace('img:', '');
      
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
        
        // Rate limit
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (desc) {
        analyzed.push({
          id: token.id,
          symbol: token.symbol,
          desc: desc.replace('img:', ''),
          mc: token.marketCap,
          isRunner: token.isMainRunner
        });
      }
    }
    
    console.log(`Analyzed ${analyzed.length} images, finding connections...`);
    
    // Find visual connections
    const runners = analyzed.filter(t => t.isRunner);
    const others = analyzed.filter(t => !t.isRunner);
    
    let linkedCount = 0;
    
    for (const other of others) {
      let bestRunner: typeof runners[0] | null = null;
      
      for (const runner of runners) {
        if (runner.id === other.id) continue;
        
        if (findVisualMatch(runner.desc, other.desc)) {
          if (!bestRunner || runner.mc > bestRunner.mc) {
            bestRunner = runner;
          }
        }
      }
      
      if (bestRunner) {
        await prisma.token.update({
          where: { id: other.id },
          data: { parentRunnerId: bestRunner.id }
        });
        linkedCount++;
        console.log(`Linked ${other.symbol} -> ${bestRunner.symbol} (visual match)`);
      }
    }
    
    return NextResponse.json({
      success: true,
      analyzed: analyzed.length,
      linked: linkedCount,
      samples: analyzed.slice(0, 10).map(t => ({ symbol: t.symbol, desc: t.desc }))
    });
    
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed', details: String(error) }, { status: 500 });
  }
}
