'use client';
import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Token {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  imageUrl?: string;
  marketCap: number;
  price: number;
  volume5m: number;
  priceChange5m: number;
  phase: string;
  derivatives?: Token[];
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [expandedRunners, setExpandedRunners] = useState<Set<string>>(new Set());
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [tab, setTab] = useState<'runners' | 'unlinked'>('runners');
  
  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncData = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/discover');
      await loadDashboard();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  }, [loadDashboard]);
  
  useEffect(() => {
    loadDashboard();
    syncData();
    const i1 = setInterval(loadDashboard, 15000);
    const i2 = setInterval(syncData, 120000);
    return () => { clearInterval(i1); clearInterval(i2); };
  }, [loadDashboard, syncData]);

  useEffect(() => {
    if (data?.runners && !autoExpanded) {
      const ids = data.runners.filter((r: Token) => r.derivatives?.length).map((r: Token) => r.id);
      if (ids.length) { setExpandedRunners(new Set(ids)); setAutoExpanded(true); }
    }
  }, [data, autoExpanded]);

  const toggle = (id: string) => setExpandedRunners(p => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const openDex = (m: string) => window.open(`https://dexscreener.com/solana/${m}`, '_blank');
  const copy = (m: string) => navigator.clipboard.writeText(m);
  const fmc = (m: number) => m >= 1e6 ? `$${(m/1e6).toFixed(2)}M` : m >= 1e3 ? `$${(m/1e3).toFixed(0)}K` : `$${m.toFixed(0)}`;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center data-stream">
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-8xl mb-8"
        >
          🌳
        </motion.div>
        <div className="text-4xl font-bold neon-green tracking-widest">METATREE</div>
        <div className="text-sm text-muted-foreground mt-4 font-mono">
          [ INITIALIZING DERIVATIVE SCANNER... ]
        </div>
        <div className="flex gap-2 mt-8">
          {[0,1,2,3,4].map(i => (
            <motion.div 
              key={i}
              animate={{ opacity: [0.2, 1, 0.2], scaleY: [0.5, 1, 0.5] }}
              transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
              className="w-1 h-8 bg-primary rounded-full"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen data-stream scanlines">
      {/* Token Modal */}
      <AnimatePresence>
        {selectedToken && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setSelectedToken(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="cyber-card corner-accent p-6 max-w-md w-full"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 mb-6">
                {selectedToken.imageUrl ? (
                  <img src={selectedToken.imageUrl} className="w-16 h-16 rounded cyber-image" />
                ) : (
                  <div className="w-16 h-16 rounded cyber-image flex items-center justify-center text-3xl bg-muted">🪙</div>
                )}
                <div>
                  <div className="text-2xl font-bold neon-green">{selectedToken.symbol}</div>
                  <div className="text-muted-foreground text-sm">{selectedToken.name}</div>
                  <div className="badge-cyber inline-block mt-1">{selectedToken.phase}</div>
                </div>
                <button onClick={() => setSelectedToken(null)} className="ml-auto text-muted-foreground hover:text-white text-2xl">×</button>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                  { label: 'MCAP', value: fmc(selectedToken.marketCap), color: 'neon-green' },
                  { label: 'PRICE', value: `$${selectedToken.price < 0.001 ? selectedToken.price.toExponential(2) : selectedToken.price.toFixed(6)}`, color: '' },
                  { label: 'VOL 5M', value: `$${(selectedToken.volume5m/1000).toFixed(1)}K`, color: 'neon-blue' },
                  { label: 'CHG 5M', value: `${selectedToken.priceChange5m >= 0 ? '+' : ''}${selectedToken.priceChange5m?.toFixed(2)}%`, color: selectedToken.priceChange5m >= 0 ? 'profit' : 'loss' },
                ].map(s => (
                  <div key={s.label} className="cyber-card p-3">
                    <div className="text-[10px] text-muted-foreground tracking-widest">{s.label}</div>
                    <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                  </div>
                ))}
              </div>
              
              <div className="cyber-card p-3 mb-6">
                <div className="text-[10px] text-muted-foreground tracking-widest mb-2">CONTRACT</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs flex-1 truncate text-primary/80">{selectedToken.mint}</code>
                  <button onClick={() => copy(selectedToken.mint)} className="btn-cyber px-2 py-1 text-xs">COPY</button>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button onClick={() => openDex(selectedToken.mint)} className="btn-cyber flex-1 py-3 neon-green">
                  📈 DEXSCREENER
                </button>
                <button onClick={() => window.open(`https://pump.fun/${selectedToken.mint}`, '_blank')} className="btn-cyber flex-1 py-3 neon-purple">
                  🎯 PUMP.FUN
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-primary/20 bg-background/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.span 
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                className="text-4xl"
              >
                🌳
              </motion.span>
              <div>
                <div className="text-2xl font-bold tracking-wider">
                  <span className="neon-green">META</span><span className="neon-purple">TREE</span>
                </div>
                <div className="text-[10px] text-muted-foreground tracking-[0.3em]">DERIVATIVE DETECTION SYSTEM</div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="status-online" />
                <span className="text-muted-foreground">LIVE</span>
              </div>
              <button 
                onClick={syncData} 
                disabled={syncing}
                className="btn-cyber px-4 py-2 text-sm"
              >
                {syncing ? (
                  <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>⟳</motion.span>
                ) : '⟳'} 
                <span className="ml-2">SCAN</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'RUNNERS', value: data?.stats?.runners || 0, color: 'neon-green' },
            { label: 'DERIVATIVES', value: data?.stats?.derivatives || 0, color: 'neon-purple' },
            { label: 'TOTAL', value: data?.stats?.tokens || 0, color: 'neon-blue' },
            { label: 'UNLINKED', value: data?.stats?.unlinked || 0, color: 'neon-pink' },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="cyber-card corner-accent p-5 text-center"
            >
              <div className={`text-4xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground tracking-[0.2em] mt-2">{s.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button 
            onClick={() => setTab('runners')}
            className={`btn-cyber px-6 py-2 ${tab === 'runners' ? 'neon-border pulse-neon neon-green' : ''}`}
          >
            🏃 RUNNERS
          </button>
          <button 
            onClick={() => setTab('unlinked')}
            className={`btn-cyber px-6 py-2 ${tab === 'unlinked' ? 'neon-border-purple neon-purple' : ''}`}
          >
            🌱 UNLINKED
          </button>
        </div>

        {/* Content */}
        {tab === 'runners' ? (
          <div className="space-y-4">
            {data?.runners?.length > 0 ? data.runners.map((r: Token, i: number) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="cyber-card overflow-hidden"
              >
                <div 
                  className="p-5 cursor-pointer hover:bg-primary/5 transition-colors"
                  onClick={() => r.derivatives?.length ? toggle(r.id) : setSelectedToken(r)}
                >
                  <div className="flex items-center gap-5">
                    {r.imageUrl ? (
                      <img src={r.imageUrl} className="w-12 h-12 rounded cyber-image" />
                    ) : (
                      <div className="w-12 h-12 rounded cyber-image flex items-center justify-center bg-muted">🪙</div>
                    )}
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold neon-green">{r.symbol}</span>
                        <span className="text-muted-foreground text-sm">{r.name.slice(0, 25)}</span>
                        {r.derivatives?.length > 0 && (
                          <span className="badge-cyber neon-purple">{r.derivatives.length} META{r.derivatives.length > 1 ? 'S' : ''}</span>
                        )}
                      </div>
                      <div className="flex gap-6 mt-2 text-sm font-mono">
                        <span className="profit">{fmc(r.marketCap)}</span>
                        <span className={r.priceChange5m >= 0 ? 'profit' : 'loss'}>
                          {r.priceChange5m >= 0 ? '▲' : '▼'} {Math.abs(r.priceChange5m || 0).toFixed(1)}%
                        </span>
                        <span className="text-muted-foreground">VOL ${(r.volume5m/1000).toFixed(1)}K</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedToken(r); }} className="btn-cyber px-3 py-1 text-xs">INFO</button>
                      <button onClick={(e) => { e.stopPropagation(); openDex(r.mint); }} className="btn-cyber px-3 py-1 text-xs neon-green">📈</button>
                      {r.derivatives?.length > 0 && (
                        <motion.span 
                          animate={{ rotate: expandedRunners.has(r.id) ? 180 : 0 }}
                          className="text-primary"
                        >▼</motion.span>
                      )}
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedRunners.has(r.id) && r.derivatives?.length > 0 && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-primary/20 p-4 bg-primary/5">
                        <div className="text-[10px] text-primary tracking-[0.2em] mb-3">▸ DETECTED DERIVATIVES</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {r.derivatives.map((d: Token) => (
                            <div
                              key={d.id}
                              onClick={() => setSelectedToken(d)}
                              className="cyber-card p-3 cursor-pointer hover:bg-primary/10 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                {d.imageUrl ? (
                                  <img src={d.imageUrl} className="w-8 h-8 rounded" />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-sm">🪙</div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm truncate">{d.symbol}</span>
                                    <span className="badge-cyber text-[8px]">{d.phase}</span>
                                  </div>
                                  <div className="flex gap-3 text-xs mt-0.5 font-mono">
                                    <span className="profit">{fmc(d.marketCap)}</span>
                                    <span className={d.priceChange5m >= 0 ? 'profit' : 'loss'}>
                                      {d.priceChange5m >= 0 ? '+' : ''}{(d.priceChange5m || 0).toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); openDex(d.mint); }} className="text-primary hover:neon-green">📈</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )) : (
              <div className="cyber-card p-16 text-center">
                <div className="text-6xl mb-4">🌱</div>
                <div className="neon-green text-xl">NO RUNNERS DETECTED</div>
                <div className="text-muted-foreground text-sm mt-2">SCANNING FOR $500K+ MCAP TOKENS...</div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data?.branches?.length > 0 ? data.branches.slice(0, 20).map((t: Token, i: number) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedToken(t)}
                className="cyber-card p-4 cursor-pointer hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  {t.imageUrl ? (
                    <img src={t.imageUrl} className="w-10 h-10 rounded" />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">🪙</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{t.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.name}</div>
                  </div>
                </div>
                <div className="flex justify-between text-sm font-mono">
                  <span className="profit">{fmc(t.marketCap)}</span>
                  <span className={t.priceChange5m >= 0 ? 'profit' : 'loss'}>
                    {t.priceChange5m >= 0 ? '+' : ''}{(t.priceChange5m || 0).toFixed(1)}%
                  </span>
                </div>
              </motion.div>
            )) : (
              <div className="col-span-full cyber-card p-12 text-center">
                <div className="neon-green">ALL TOKENS LINKED</div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-primary/20 text-center">
          <div className="text-2xl font-bold mb-2">
            <span className="neon-green">META</span><span className="neon-purple">TREE</span>
          </div>
          <div className="text-muted-foreground text-xs tracking-widest">
            [ 12-LAYER DETECTION • REAL-TIME SCAN • BUILT FOR DEGENS ]
          </div>
        </footer>
      </main>
    </div>
  );
}
