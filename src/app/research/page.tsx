'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

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
    isAIGenerated: boolean | null;
    similarTokens: string[];
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

export default function ResearchPage() {
  const [mint, setMint] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runResearch = async () => {
    if (!mint.trim()) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const res = await fetch('/api/deep-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mint: mint.trim() })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Research failed');
      }
      
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Research failed');
    } finally {
      setLoading(false);
    }
  };

  const fmc = (m: number) => m >= 1e6 ? `$${(m/1e6).toFixed(2)}M` : m >= 1e3 ? `$${(m/1e3).toFixed(0)}K` : `$${m.toFixed(0)}`;
  
  const getScoreColor = (score: number) => {
    if (score >= 75) return 'neon-green';
    if (score >= 50) return 'neon-blue';
    if (score >= 25) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getPotentialColor = (p: string) => {
    if (p === 'high') return 'bg-green-500/20 text-green-400';
    if (p === 'medium') return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-red-500/20 text-red-400';
  };

  return (
    <div className="min-h-screen data-stream scanlines">
      {/* Header */}
      <header className="border-b border-primary/20 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <span className="text-3xl">🌳</span>
              <div>
                <div className="text-xl font-bold tracking-wider">
                  <span className="neon-green">META</span><span className="neon-purple">TREE</span>
                </div>
                <div className="text-[9px] text-muted-foreground tracking-[0.2em]">DEEP RESEARCH</div>
              </div>
            </Link>
            <Link href="/" className="btn-cyber px-4 py-2 text-sm">← DASHBOARD</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Search Section */}
        <div className="cyber-card corner-accent p-8 mb-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔬</div>
            <h1 className="text-2xl font-bold neon-green mb-2">Deep Research</h1>
            <p className="text-muted-foreground text-sm">Enter a Pump.fun contract address to analyze its narrative potential</p>
          </div>
          
          <div className="flex gap-3 max-w-2xl mx-auto">
            <input
              type="text"
              value={mint}
              onChange={(e) => setMint(e.target.value)}
              placeholder="Enter contract address..."
              className="flex-1 bg-black/50 border border-primary/30 rounded px-4 py-3 text-sm font-mono focus:outline-none focus:border-primary"
              onKeyDown={(e) => e.key === 'Enter' && runResearch()}
            />
            <button
              onClick={runResearch}
              disabled={loading || !mint.trim()}
              className="btn-cyber px-6 py-3 neon-green disabled:opacity-50"
            >
              {loading ? (
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>⟳</motion.span>
              ) : '🔍'} 
              <span className="ml-2">{loading ? 'ANALYZING...' : 'RESEARCH'}</span>
            </button>
          </div>
          
          {error && (
            <div className="mt-4 text-center text-red-400 text-sm">⚠️ {error}</div>
          )}
        </div>

        {/* Loading State */}
        <AnimatePresence>
          {loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-16"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-6xl mb-4"
              >
                🔬
              </motion.div>
              <div className="text-lg neon-purple">Analyzing token...</div>
              <div className="text-sm text-muted-foreground mt-2">
                Scanning image • Analyzing narrative • Finding connections
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Profile Card */}
              <div className="cyber-card corner-accent p-6">
                <div className="flex gap-6">
                  {result.profile.imageUrl && (
                    <img src={result.profile.imageUrl} className="w-24 h-24 rounded-lg cyber-image" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-3xl font-bold neon-green">{result.profile.symbol}</h2>
                      <span className="text-xl text-muted-foreground">{result.profile.name}</span>
                    </div>
                    <p className="text-muted-foreground text-sm mb-4">{result.profile.description}</p>
                    <div className="flex gap-6 text-sm font-mono">
                      <div>
                        <span className="text-muted-foreground">MC: </span>
                        <span className="profit">{fmc(result.profile.marketCap)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">VOL: </span>
                        <span className="neon-blue">{fmc(result.profile.volume24h)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">24h: </span>
                        <span className={result.profile.priceChange24h >= 0 ? 'profit' : 'loss'}>
                          {result.profile.priceChange24h >= 0 ? '+' : ''}{result.profile.priceChange24h?.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {/* Socials */}
                    <div className="flex gap-2 mt-4">
                      {result.profile.socials.twitter && (
                        <a href={result.profile.socials.twitter} target="_blank" className="btn-cyber px-3 py-1 text-xs">𝕏 Twitter</a>
                      )}
                      {result.profile.socials.telegram && (
                        <a href={result.profile.socials.telegram} target="_blank" className="btn-cyber px-3 py-1 text-xs neon-blue">✈️ Telegram</a>
                      )}
                      {result.profile.socials.website && (
                        <a href={result.profile.socials.website} target="_blank" className="btn-cyber px-3 py-1 text-xs neon-purple">🌐 Website</a>
                      )}
                      <a href={`https://dexscreener.com/solana/${result.profile.mint}`} target="_blank" className="btn-cyber px-3 py-1 text-xs neon-green">📈 DEX</a>
                      <a href={`https://pump.fun/${result.profile.mint}`} target="_blank" className="btn-cyber px-3 py-1 text-xs">🎯 Pump</a>
                    </div>
                  </div>
                  {/* Meta Score */}
                  <div className="text-center">
                    <div className={`text-5xl font-bold ${getScoreColor(result.metaScore.overall)}`}>
                      {result.metaScore.overall}
                    </div>
                    <div className="text-[10px] text-muted-foreground tracking-widest mt-1">META SCORE</div>
                  </div>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: 'NARRATIVE', value: result.metaScore.narrativeStrength },
                  { label: 'VISUAL', value: result.metaScore.visualUniqueness },
                  { label: 'TIMING', value: result.metaScore.timing },
                  { label: 'COMPETITION', value: result.metaScore.competition },
                ].map(s => (
                  <div key={s.label} className="cyber-card p-4 text-center">
                    <div className={`text-2xl font-bold ${getScoreColor(s.value)}`}>{s.value}</div>
                    <div className="text-[9px] text-muted-foreground tracking-widest mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Two Column Layout */}
              <div className="grid grid-cols-2 gap-6">
                {/* Visual DNA */}
                <div className="cyber-card p-5">
                  <h3 className="text-sm font-bold neon-purple tracking-widest mb-4">🖼️ VISUAL DNA</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Description: </span>
                      <span>{result.visualDNA.description}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Style: </span>
                      <span className="badge-cyber">{result.visualDNA.style}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Originality: </span>
                      <span>{result.visualDNA.originality}</span>
                    </div>
                    {result.visualDNA.similarTokens.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Similar: </span>
                        <span>{result.visualDNA.similarTokens.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Narrative Analysis */}
                <div className="cyber-card p-5">
                  <h3 className="text-sm font-bold neon-blue tracking-widest mb-4">📖 NARRATIVE</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Origin: </span>
                      <span>{result.narrative.origin}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Context: </span>
                      <span>{result.narrative.culturalContext}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sentiment: </span>
                      <span className="badge-cyber">{result.narrative.sentiment}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Virality: </span>
                      <span>{result.narrative.viralityPotential}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="cyber-card p-5 border border-primary/30">
                <h3 className="text-sm font-bold neon-green tracking-widest mb-3">📊 SUMMARY</h3>
                <p className="text-sm leading-relaxed">{result.narrative.summary}</p>
                {result.narrative.riskFlags.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-primary/20">
                    <span className="text-red-400 text-xs font-bold">⚠️ RISK FLAGS: </span>
                    <span className="text-red-400/80 text-xs">{result.narrative.riskFlags.join(' • ')}</span>
                  </div>
                )}
              </div>

              {/* Derivative Ideas */}
              <div className="cyber-card p-5">
                <h3 className="text-sm font-bold neon-purple tracking-widest mb-4">🌳 DERIVATIVE IDEAS</h3>
                <div className="grid grid-cols-2 gap-3">
                  {result.derivativeIdeas.map((idea, i) => (
                    <div key={i} className="cyber-card p-3 bg-black/30">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold">{idea.name}</span>
                        <span className="text-muted-foreground text-xs">${idea.ticker}</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded ${getPotentialColor(idea.potential)}`}>
                          {idea.potential.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{idea.concept}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related Tokens */}
              {result.relatedTokens.length > 0 && (
                <div className="cyber-card p-5">
                  <h3 className="text-sm font-bold neon-blue tracking-widest mb-4">🔗 RELATED TOKENS</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {result.relatedTokens.map((t, i) => (
                      <a
                        key={i}
                        href={`https://dexscreener.com/solana/${t.mint}`}
                        target="_blank"
                        className="cyber-card p-3 bg-black/30 hover:bg-primary/10 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-bold">{t.symbol}</span>
                            <span className="text-muted-foreground text-xs ml-2">{t.name}</span>
                          </div>
                          <span className="profit text-sm">{fmc(t.marketCap)}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">{t.relationship}</div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Contract */}
              <div className="cyber-card p-4">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground tracking-widest">CONTRACT:</span>
                  <code className="text-xs text-primary/80 flex-1">{result.profile.mint}</code>
                  <button 
                    onClick={() => navigator.clipboard.writeText(result.profile.mint)}
                    className="btn-cyber px-3 py-1 text-xs"
                  >
                    COPY
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
