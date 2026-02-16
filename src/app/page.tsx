'use client';
import { useEffect, useState } from 'react';
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
  heatScore: number;
  phase: string;
  keywords?: string[];
  derivatives?: Token[];
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [expandedRunners, setExpandedRunners] = useState<Set<string>>(new Set());
  const [autoExpanded, setAutoExpanded] = useState(false);
  
  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('API error:', e);
    } finally {
      setLoading(false);
    }
  };

  const syncData = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/discover');
      const json = await res.json();
      if (json.success) {
        setLastSync(new Date().toLocaleTimeString());
        await loadDashboard();
      }
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setSyncing(false);
    }
  };
  
  useEffect(() => {
    loadDashboard();
    const i = setInterval(loadDashboard, 15000);
    syncData();
    const syncInterval = setInterval(syncData, 5 * 60 * 1000);
    return () => { clearInterval(i); clearInterval(syncInterval); };
  }, []);

  // Auto-expand runners that have derivatives
  useEffect(() => {
    if (data?.runners && !autoExpanded) {
      const runnersWithDerivatives = data.runners
        .filter((r: Token) => r.derivatives && r.derivatives.length > 0)
        .map((r: Token) => r.id);
      if (runnersWithDerivatives.length > 0) {
        setExpandedRunners(new Set(runnersWithDerivatives));
        setAutoExpanded(true);
      }
    }
  }, [data, autoExpanded]);

  const toggleExpand = (id: string) => {
    setExpandedRunners(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDexScreener = (mint: string) => window.open(`https://dexscreener.com/solana/${mint}`, '_blank');
  const copyAddress = (mint: string) => navigator.clipboard.writeText(mint);

  const formatMC = (mc: number) => {
    if (mc >= 1000000) return `$${(mc/1000000).toFixed(2)}M`;
    if (mc >= 1000) return `$${(mc/1000).toFixed(0)}K`;
    return `$${mc.toFixed(0)}`;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-purple-500 bg-clip-text text-transparent mb-4">🌳 Metatree</h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Token Detail Modal */}
      <AnimatePresence>
        {selectedToken && (
          <motion.div 
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedToken(null)}
          >
            <motion.div 
              initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
              className="glass rounded-3xl p-6 max-w-lg w-full" onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 mb-6">
                {selectedToken.imageUrl && <img src={selectedToken.imageUrl} alt="" className="w-16 h-16 rounded-full"/>}
                <div>
                  <h2 className="text-2xl font-bold">{selectedToken.symbol}</h2>
                  <p className="text-gray-400">{selectedToken.name}</p>
                </div>
                <button onClick={() => setSelectedToken(null)} className="ml-auto text-gray-400 hover:text-white text-2xl">×</button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-gray-400 text-sm">Market Cap</p>
                  <p className="text-2xl font-bold">{formatMC(selectedToken.marketCap)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-gray-400 text-sm">Price</p>
                  <p className="text-2xl font-bold">${selectedToken.price < 0.001 ? selectedToken.price.toExponential(2) : selectedToken.price.toFixed(6)}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-gray-400 text-sm">5m Volume</p>
                  <p className="text-xl font-bold">${(selectedToken.volume5m/1000).toFixed(1)}K</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-gray-400 text-sm">5m Change</p>
                  <p className={`text-xl font-bold ${selectedToken.priceChange5m >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedToken.priceChange5m >= 0 ? '+' : ''}{selectedToken.priceChange5m?.toFixed(2)}%
                  </p>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-4 mb-6">
                <p className="text-gray-400 text-sm mb-2">Contract Address</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-300 break-all flex-1">{selectedToken.mint}</code>
                  <button onClick={() => copyAddress(selectedToken.mint)} className="text-purple-400 hover:text-purple-300 text-sm">📋</button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => openDexScreener(selectedToken.mint)} className="flex-1 bg-green-600 hover:bg-green-500 py-3 rounded-xl font-bold transition-colors">📈 Chart</button>
                <button onClick={() => window.open(`https://birdeye.so/token/${selectedToken.mint}?chain=solana`, '_blank')} className="flex-1 bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-bold transition-colors">🦅 Birdeye</button>
              </div>
              <div className="flex justify-center gap-4 mt-4 text-sm">
                <a href={`https://solscan.io/token/${selectedToken.mint}`} target="_blank" className="text-gray-400 hover:text-white">Solscan</a>
                <a href={`https://pump.fun/${selectedToken.mint}`} target="_blank" className="text-gray-400 hover:text-white">Pump.fun</a>
                <a href={`https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${selectedToken.mint}`} target="_blank" className="text-gray-400 hover:text-white">Raydium</a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-green-400 to-purple-500 bg-clip-text text-transparent">🌳 Metatree</h1>
        <p className="text-gray-400 mt-2">Track the Runner. Find the Branches.</p>
        <button onClick={syncData} disabled={syncing} className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg text-sm transition-colors">
          {syncing ? '🔄 Syncing...' : '🔄 Refresh'}
        </button>
        {lastSync && <p className="text-gray-500 text-xs mt-2">Last sync: {lastSync}</p>}
      </header>

      {/* Main Runners with Derivatives */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4 text-green-400">🏃 Main Runners & Their Metas</h2>
        <div className="space-y-4">
          {data?.runners?.length > 0 ? data.runners.map((runner: Token) => (
            <motion.div key={runner.id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} className="glass rounded-2xl overflow-hidden">
              {/* Runner Header */}
              <div 
                className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => runner.derivatives?.length ? toggleExpand(runner.id) : setSelectedToken(runner)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {runner.imageUrl && <img src={runner.imageUrl} alt="" className="w-12 h-12 rounded-full"/>}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xl">{runner.symbol}</span>
                        <span className="text-gray-500 text-sm">{runner.name?.slice(0,20)}</span>
                        {runner.derivatives?.length > 0 && (
                          <span className="bg-purple-500/30 text-purple-300 text-xs px-2 py-0.5 rounded-full">
                            {runner.derivatives.length} derivatives
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
                        <span>{formatMC(runner.marketCap)}</span>
                        <span className={runner.priceChange5m >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {runner.priceChange5m >= 0 ? '+' : ''}{runner.priceChange5m?.toFixed(1)}%
                        </span>
                        <span>Vol: ${(runner.volume5m/1000).toFixed(1)}K</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setSelectedToken(runner); }}
                      className="text-gray-400 hover:text-white text-sm"
                    >Details</button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); openDexScreener(runner.mint); }}
                      className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded-lg text-sm"
                    >📈 Chart</button>
                    {runner.derivatives?.length > 0 && (
                      <span className="text-gray-400 text-xl">{expandedRunners.has(runner.id) ? '▼' : '▶'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Derivatives Tree */}
              <AnimatePresence>
                {expandedRunners.has(runner.id) && runner.derivatives?.length > 0 && (
                  <motion.div
                    initial={{height: 0, opacity: 0}}
                    animate={{height: 'auto', opacity: 1}}
                    exit={{height: 0, opacity: 0}}
                    className="border-t border-white/10 bg-black/20"
                  >
                    <div className="p-3">
                      <p className="text-xs text-gray-500 mb-2 ml-2">🌱 Related tokens launched on this meta:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {runner.derivatives.map((deriv: Token) => (
                          <div 
                            key={deriv.id}
                            onClick={() => setSelectedToken(deriv)}
                            className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                          >
                            {deriv.imageUrl && <img src={deriv.imageUrl} alt="" className="w-8 h-8 rounded-full"/>}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold truncate">{deriv.symbol}</span>
                                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">{deriv.phase}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span>{formatMC(deriv.marketCap)}</span>
                                <span className={deriv.priceChange5m >= 0 ? 'text-green-400' : 'text-red-400'}>
                                  {deriv.priceChange5m >= 0 ? '+' : ''}{deriv.priceChange5m?.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); openDexScreener(deriv.mint); }}
                              className="text-green-400 hover:text-green-300 text-sm"
                            >📈</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )) : (
            <div className="glass rounded-2xl p-8 text-center text-gray-500">
              <p>No runners yet</p>
              <p className="text-xs mt-2">Waiting for tokens with $500k+ MC</p>
            </div>
          )}
        </div>
      </div>

      {/* Unlinked New Tokens */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 text-yellow-400">🌱 New Branches (Unlinked)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data?.branches?.length > 0 ? data.branches.slice(0, 12).map((t: Token) => (
            <motion.div 
              key={t.id}
              initial={{opacity:0,y:10}} 
              animate={{opacity:1,y:0}}
              onClick={() => setSelectedToken(t)}
              className="glass rounded-xl p-3 cursor-pointer hover:scale-[1.02] transition-transform"
            >
              <div className="flex items-center gap-2">
                {t.imageUrl && <img src={t.imageUrl} alt="" className="w-8 h-8 rounded-full"/>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold truncate">{t.symbol}</span>
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">{t.phase}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate">{t.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{formatMC(t.marketCap)}</p>
                  <p className={`text-xs ${t.priceChange5m >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.priceChange5m >= 0 ? '+' : ''}{t.priceChange5m?.toFixed(1)}%
                  </p>
                </div>
              </div>
            </motion.div>
          )) : (
            <div className="glass rounded-xl p-6 text-center text-gray-500 col-span-full">
              <p>No new branches</p>
            </div>
          )}
        </div>
      </div>

      {/* Stats Footer */}
      <div className="glass rounded-2xl p-4">
        <div className="flex justify-center gap-6 text-sm text-gray-400">
          <span>🪙 Tokens: {data?.stats?.tokens || 0}</span>
          <span>🏃 Runners: {data?.stats?.runners || 0}</span>
          <span>🌱 Derivatives: {data?.stats?.derivatives || 0}</span>
        </div>
      </div>
    </div>
  );
}
