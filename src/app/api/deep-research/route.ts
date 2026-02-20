import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface ResearchResult {
  profile: {
    mint: string;
    name: string;
    symbol: string;
    description: string;
    imageUrl: string | null;
    creator: string | null;
    marketCap: number;
    volume24h: number;
    price: number;
    priceChange24h: number;
    holders: number | null;
    createdAt: string | null;
    socials: {
      twitter: string | null;
      telegram: string | null;
      website: string | null;
    };
  };
  visualDNA: {
    description: string;
    style: string;
    originality: string;
    similarTokens: string[];
    isAIGenerated: boolean | null;
  };
  narrative: {
    origin: string;
    culturalContext: string;
    sentiment: string;
    viralityPotential: string;
    riskFlags: string[];
    summary: string;
  };
  derivativeIdeas: {
    name: string;
    ticker: string;
    concept: string;
    potential: 'high' | 'medium' | 'low';
  }[];
  relatedTokens: {
    symbol: string;
    name: string;
    mint: string;
    marketCap: number;
    relationship: string;
  }[];
  metaScore: {
    overall: number;
    narrativeStrength: number;
    visualUniqueness: number;
    timing: number;
    competition: number;
    breakdown: string;
  };
}

// Fetch token data from DexScreener
async function fetchTokenData(mint: string) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
  const data = await res.json();
  return data.pairs?.[0] || null;
}

// Fetch metadata from pump.fun (via IPFS)
async function fetchPumpFunMeta(mint: string) {
  try {
    // Try rugcheck for metadata
    const res = await fetch(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`);
    const data = await res.json();
    return {
      creator: data.creator || null,
      description: data.tokenMeta?.uri ? await fetchIPFSDescription(data.tokenMeta.uri) : null
    };
  } catch {
    return { creator: null, description: null };
  }
}

async function fetchIPFSDescription(uri: string) {
  try {
    const res = await fetch(uri);
    const data = await res.json();
    return data.description || null;
  } catch {
    return null;
  }
}

// GPT-4 Vision: Analyze the token image
async function analyzeImage(imageUrl: string): Promise<{
  description: string;
  style: string;
  originality: string;
  isAIGenerated: boolean | null;
}> {
  if (!OPENAI_API_KEY || !imageUrl) {
    return { description: 'No image', style: 'unknown', originality: 'unknown', isAIGenerated: null };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this crypto token logo/image. Respond in JSON format:
{
  "description": "Brief description of what the image shows",
  "style": "Art style (cartoon, realistic, pixel art, AI-generated, meme edit, etc)",
  "originality": "Assessment: original artwork / modified meme / stolen/copied / AI-generated",
  "isAIGenerated": true/false/null if uncertain,
  "memeReferences": "Any known meme templates, characters, or cultural references",
  "quality": "low/medium/high"
}`
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            }
          ]
        }],
        max_tokens: 500
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        description: parsed.description || 'Unknown',
        style: parsed.style || 'unknown',
        originality: parsed.originality || 'unknown',
        isAIGenerated: parsed.isAIGenerated
      };
    }
    return { description: content, style: 'unknown', originality: 'unknown', isAIGenerated: null };
  } catch (e) {
    console.error('Image analysis error:', e);
    return { description: 'Analysis failed', style: 'unknown', originality: 'unknown', isAIGenerated: null };
  }
}

// GPT-4: Deep narrative analysis
async function analyzeNarrative(
  name: string, 
  symbol: string, 
  description: string | null,
  imageDescription: string
): Promise<{
  origin: string;
  culturalContext: string;
  sentiment: string;
  viralityPotential: string;
  riskFlags: string[];
  summary: string;
  derivativeIdeas: { name: string; ticker: string; concept: string; potential: 'high' | 'medium' | 'low' }[];
  scores: { narrativeStrength: number; visualUniqueness: number; timing: number };
}> {
  if (!OPENAI_API_KEY) {
    return {
      origin: 'Unknown',
      culturalContext: 'Unknown',
      sentiment: 'Unknown',
      viralityPotential: 'Unknown',
      riskFlags: [],
      summary: 'OpenAI API key not configured',
      derivativeIdeas: [],
      scores: { narrativeStrength: 50, visualUniqueness: 50, timing: 50 }
    };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role: 'system',
          content: `You are a memecoin analyst specializing in Solana tokens. Analyze tokens for their narrative potential, cultural relevance, and derivative opportunities. Be specific and actionable.`
        }, {
          role: 'user',
          content: `Analyze this Solana memecoin:

Name: ${name}
Symbol: ${symbol}
Description: ${description || 'None provided'}
Image Analysis: ${imageDescription}

Respond in JSON format:
{
  "origin": "Where does this meme/concept originate from?",
  "culturalContext": "What trend, person, event, or culture is it referencing?",
  "sentiment": "The vibe: humor/political/edgy/wholesome/absurdist/etc",
  "viralityPotential": "Assessment of viral potential with reasoning",
  "riskFlags": ["List any concerns: controversial, lawsuit risk, rug patterns, etc"],
  "summary": "2-3 sentence executive summary of this token's narrative",
  "derivativeIdeas": [
    {"name": "Suggested derivative name", "ticker": "TICKER", "concept": "Brief concept", "potential": "high/medium/low"},
    // Generate 5-8 creative derivative ideas
  ],
  "scores": {
    "narrativeStrength": 0-100,
    "visualUniqueness": 0-100,
    "timing": 0-100
  }
}`
        }],
        max_tokens: 1500
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        origin: parsed.origin || 'Unknown',
        culturalContext: parsed.culturalContext || 'Unknown',
        sentiment: parsed.sentiment || 'Unknown',
        viralityPotential: parsed.viralityPotential || 'Unknown',
        riskFlags: parsed.riskFlags || [],
        summary: parsed.summary || 'No summary',
        derivativeIdeas: parsed.derivativeIdeas || [],
        scores: parsed.scores || { narrativeStrength: 50, visualUniqueness: 50, timing: 50 }
      };
    }
    return {
      origin: 'Parse error',
      culturalContext: content,
      sentiment: 'Unknown',
      viralityPotential: 'Unknown',
      riskFlags: [],
      summary: content,
      derivativeIdeas: [],
      scores: { narrativeStrength: 50, visualUniqueness: 50, timing: 50 }
    };
  } catch (e) {
    console.error('Narrative analysis error:', e);
    return {
      origin: 'Error',
      culturalContext: 'Analysis failed',
      sentiment: 'Unknown',
      viralityPotential: 'Unknown',
      riskFlags: ['Analysis failed'],
      summary: 'Failed to analyze narrative',
      derivativeIdeas: [],
      scores: { narrativeStrength: 50, visualUniqueness: 50, timing: 50 }
    };
  }
}

// Find related tokens in our database
async function findRelatedTokens(name: string, symbol: string, keywords: string[]): Promise<{
  symbol: string;
  name: string;
  mint: string;
  marketCap: number;
  relationship: string;
}[]> {
  const related: { symbol: string; name: string; mint: string; marketCap: number; relationship: string }[] = [];
  
  // Search by name similarity
  const nameTokens = await prisma.token.findMany({
    where: {
      OR: [
        { name: { contains: name.split(' ')[0], mode: 'insensitive' } },
        { symbol: { contains: symbol.slice(0, 3), mode: 'insensitive' } }
      ],
      isVisible: true
    },
    take: 10,
    orderBy: { marketCap: 'desc' }
  });
  
  for (const t of nameTokens) {
    if (t.symbol.toLowerCase() !== symbol.toLowerCase()) {
      related.push({
        symbol: t.symbol,
        name: t.name,
        mint: t.mint,
        marketCap: t.marketCap,
        relationship: 'Similar name/symbol'
      });
    }
  }
  
  // Search by keywords
  if (keywords.length > 0) {
    const keywordTokens = await prisma.token.findMany({
      where: {
        keywords: { hasSome: keywords },
        isVisible: true
      },
      take: 10,
      orderBy: { marketCap: 'desc' }
    });
    
    for (const t of keywordTokens) {
      if (!related.find(r => r.mint === t.mint) && t.symbol.toLowerCase() !== symbol.toLowerCase()) {
        related.push({
          symbol: t.symbol,
          name: t.name,
          mint: t.mint,
          marketCap: t.marketCap,
          relationship: 'Shared narrative/theme'
        });
      }
    }
  }
  
  return related.slice(0, 10);
}

// Find visually similar tokens
async function findVisuallySimilarTokens(imageDescription: string): Promise<string[]> {
  const tokens = await prisma.token.findMany({
    where: {
      keywords: { hasSome: [] }, // Has any keywords
      isVisible: true
    },
    select: { symbol: true, keywords: true },
    take: 100
  });
  
  const similar: string[] = [];
  const descLower = imageDescription.toLowerCase();
  
  for (const t of tokens) {
    const imgKeyword = t.keywords?.find(k => k.startsWith('img:'));
    if (imgKeyword) {
      const desc = imgKeyword.replace('img:', '').toLowerCase();
      // Simple word overlap check
      const descWords = descLower.split(/\s+/).filter(w => w.length > 3);
      const tokenWords = desc.split(/\s+/).filter(w => w.length > 3);
      const overlap = descWords.filter(w => tokenWords.some(tw => tw.includes(w) || w.includes(tw)));
      if (overlap.length >= 2) {
        similar.push(t.symbol);
      }
    }
  }
  
  return similar.slice(0, 5);
}

export async function POST(request: Request) {
  try {
    const { mint } = await request.json();
    
    if (!mint) {
      return NextResponse.json({ error: 'mint required' }, { status: 400 });
    }
    
    // 1. Fetch token data
    const dexData = await fetchTokenData(mint);
    if (!dexData) {
      return NextResponse.json({ error: 'Token not found on DexScreener' }, { status: 404 });
    }
    
    const pumpMeta = await fetchPumpFunMeta(mint);
    
    // 2. Analyze image
    const imageUrl = dexData.info?.imageUrl;
    const visualAnalysis = await analyzeImage(imageUrl);
    
    // 3. Deep narrative analysis
    const narrativeAnalysis = await analyzeNarrative(
      dexData.baseToken.name,
      dexData.baseToken.symbol,
      pumpMeta.description || dexData.info?.description,
      visualAnalysis.description
    );
    
    // 4. Find related tokens
    const keywords = narrativeAnalysis.summary.toLowerCase().split(/\s+/).filter(w => w.length > 4).slice(0, 5);
    const relatedTokens = await findRelatedTokens(dexData.baseToken.name, dexData.baseToken.symbol, keywords);
    
    // 5. Find visually similar tokens
    const visuallySimilar = await findVisuallySimilarTokens(visualAnalysis.description);
    
    // 6. Calculate meta score
    const competition = Math.max(0, 100 - (relatedTokens.length * 10));
    const overall = Math.round(
      (narrativeAnalysis.scores.narrativeStrength * 0.35) +
      (narrativeAnalysis.scores.visualUniqueness * 0.25) +
      (narrativeAnalysis.scores.timing * 0.20) +
      (competition * 0.20)
    );
    
    const result: ResearchResult = {
      profile: {
        mint,
        name: dexData.baseToken.name,
        symbol: dexData.baseToken.symbol,
        description: pumpMeta.description || 'No description',
        imageUrl,
        creator: pumpMeta.creator,
        marketCap: dexData.marketCap || dexData.fdv || 0,
        volume24h: dexData.volume?.h24 || 0,
        price: parseFloat(dexData.priceUsd) || 0,
        priceChange24h: dexData.priceChange?.h24 || 0,
        holders: null,
        createdAt: dexData.pairCreatedAt ? new Date(dexData.pairCreatedAt).toISOString() : null,
        socials: {
          twitter: dexData.info?.socials?.find((s: any) => s.type === 'twitter')?.url || null,
          telegram: dexData.info?.socials?.find((s: any) => s.type === 'telegram')?.url || null,
          website: dexData.info?.websites?.[0]?.url || null
        }
      },
      visualDNA: {
        description: visualAnalysis.description,
        style: visualAnalysis.style,
        originality: visualAnalysis.originality,
        isAIGenerated: visualAnalysis.isAIGenerated,
        similarTokens: visuallySimilar
      },
      narrative: {
        origin: narrativeAnalysis.origin,
        culturalContext: narrativeAnalysis.culturalContext,
        sentiment: narrativeAnalysis.sentiment,
        viralityPotential: narrativeAnalysis.viralityPotential,
        riskFlags: narrativeAnalysis.riskFlags,
        summary: narrativeAnalysis.summary
      },
      derivativeIdeas: narrativeAnalysis.derivativeIdeas,
      relatedTokens,
      metaScore: {
        overall,
        narrativeStrength: narrativeAnalysis.scores.narrativeStrength,
        visualUniqueness: narrativeAnalysis.scores.visualUniqueness,
        timing: narrativeAnalysis.scores.timing,
        competition,
        breakdown: `Narrative ${narrativeAnalysis.scores.narrativeStrength}/100 • Visual ${narrativeAnalysis.scores.visualUniqueness}/100 • Timing ${narrativeAnalysis.scores.timing}/100 • Competition ${competition}/100`
      }
    };
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Deep research error:', error);
    return NextResponse.json({ error: 'Research failed', details: String(error) }, { status: 500 });
  }
}

// Also support GET for easy testing
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mint = searchParams.get('mint');
  
  if (!mint) {
    return NextResponse.json({ error: 'mint parameter required' }, { status: 400 });
  }
  
  // Redirect to POST handler
  return POST(new Request(request.url, {
    method: 'POST',
    body: JSON.stringify({ mint })
  }));
}
