import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { detectDerivative, findDerivatives } from '@/lib/derivative-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ============= AI COMPARISON (LAYER 8) =============
async function aiCompareTokens(
  derivative: { name: string; symbol: string },
  runners: { id: string; name: string; symbol: string }[]
): Promise<{ runnerId: string; confidence: number } | null> {
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
- Similar names (misspellings, variations like BABY/MINI/KING)
- Same meme/theme (same character, animal, or person)
- Obvious copies or riffs

Reply in JSON format:
{"match": "SYMBOL" or null, "confidence": 0-100, "reason": "brief explanation"}

If no clear match (different memes/themes), return {"match": null, "confidence": 0, "reason": "no match"}`
        }],
        max_tokens: 150,
        temperature: 0.1
      })
    });
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.match && parsed.confidence >= 60) {
        const matchedRunner = runners.find(r => 
          r.symbol.toLowerCase() === parsed.match.toLowerCase()
        );
        if (matchedRunner) {
          return { runnerId: matchedRunner.id, confidence: parsed.confidence };
        }
      }
    }
  } catch (e) {
    console.error('AI comparison failed:', e);
  }
  
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const useAI = searchParams.get('ai') !== 'false';
  const dryRun = searchParams.get('dry') === 'true';
  const minConfidence = parseInt(searchParams.get('minConfidence') || '70');
  
  try {
    const runners = await prisma.token.findMany({
      where: { isMainRunner: true },
      orderBy: { marketCap: 'desc' }
    });
    
    const unlinked = await prisma.token.findMany({
      where: { 
        isMainRunner: false,
        parentRunnerId: null,
        isVisible: true
      },
      orderBy: { marketCap: 'desc' }
    });
    
    const matches: {
      derivative: string;
      derivativeName: string;
      runner: string;
      runnerName: string;
      method: string;
      confidence: number;
      details: string;
    }[] = [];
    
    const processed = new Set<string>();
    
    for (const token of unlinked) {
      if (processed.has(token.id)) continue;
      
      let bestMatch: { 
        runner: typeof runners[0]; 
        method: string; 
        confidence: number;
        details: string;
      } | null = null;
      
      // Run multi-layered detection against all runners
      for (const runner of runners) {
        if (runner.id === token.id) continue;
        
        const result = detectDerivative(
          runner.name, 
          runner.symbol, 
          token.name, 
          token.symbol
        );
        
        if (result.isDerivative && result.confidence >= minConfidence) {
          if (!bestMatch || result.confidence > bestMatch.confidence) {
            bestMatch = { 
              runner, 
              method: result.bestMethod, 
              confidence: result.confidence,
              details: result.details
            };
          }
        }
      }
      
      // Layer 8: AI comparison for uncertain cases (only if no match yet)
      if (!bestMatch && useAI && runners.length > 0) {
        const aiResult = await aiCompareTokens(
          { name: token.name, symbol: token.symbol },
          runners.slice(0, 15).map(r => ({ id: r.id, name: r.name, symbol: r.symbol }))
        );
        
        if (aiResult && aiResult.confidence >= minConfidence) {
          const matchedRunner = runners.find(r => r.id === aiResult.runnerId);
          if (matchedRunner) {
            bestMatch = { 
              runner: matchedRunner, 
              method: 'ai', 
              confidence: aiResult.confidence,
              details: 'AI detected relationship'
            };
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
          derivativeName: token.name,
          runner: bestMatch.runner.symbol,
          runnerName: bestMatch.runner.name,
          method: bestMatch.method,
          confidence: bestMatch.confidence,
          details: bestMatch.details
        });
      }
    }
    
    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);
    
    return NextResponse.json({
      success: true,
      dryRun,
      minConfidence,
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

// POST endpoint for testing detection on specific tokens
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tokenName, tokenSymbol, runnerName, runnerSymbol } = body;
    
    if (!tokenName || !tokenSymbol || !runnerName || !runnerSymbol) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const result = detectDerivative(runnerName, runnerSymbol, tokenName, tokenSymbol);
    
    return NextResponse.json({
      token: { name: tokenName, symbol: tokenSymbol },
      runner: { name: runnerName, symbol: runnerSymbol },
      result
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
