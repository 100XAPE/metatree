'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  
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
    // Load dashboard
    loadDashboard();
    
    // Auto-refresh dashboard every 15s
    const i = setInterval(loadDashboard, 15000);
    
    // Sync fresh data on first load
    syncData();
    
    // Auto-sync every 5 minutes
    const syncInterval = setInterval(syncData, 5 * 60 * 1000);
    
    return () => {
      clearInterval(i);
      clearInterval(syncInterval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-green-400 to-purple-500 bg-clip-text text-transparent mb-4">
          🌳 Metatree
        </h1>
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8 text-center">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-green-400 to-purple-500 bg-clip-text text-transparent">
          🌳 Metatree
        </h1>
        <p className="text-gray-400 mt-2">Track the Runner. Find the Branches.</p>
        <button 
          onClick={syncData}
          disabled={syncing}
          className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          {syncing ? '🔄 Syncing...' : '🔄 Refresh Data'}
        </button>
        {lastSync && <p className="text-gray-500 text-xs mt-2">Last sync: {lastSync}</p>}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Runners */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-green-400">🏃 Main Runners</h2>
          <div className="space-y-3">
            {data?.runners?.length > 0 ? data.runners.map((t: any) => (
              <motion.div key={t.id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} 
                className={`glass rounded-2xl p-4 ${t.priceChange5m > 20 ? 'glow-green' : t.priceChange5m < -20 ? 'glow-red' : ''}`}>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    {t.imageUrl && <img src={t.imageUrl} alt="" className="w-8 h-8 rounded-full"/>}
                    <div>
                      <span className="font-bold text-lg">{t.symbol}</span>
                      <span className="text-gray-500 ml-2 text-sm">{t.name?.slice(0,12)}</span>
                    </div>
                  </div>
                  <span className={`text-sm font-mono ${t.priceChange5m >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.priceChange5m >= 0 ? '+' : ''}{t.priceChange5m?.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold">${(t.marketCap/1000000).toFixed(2)}M</div>
                <div className="flex justify-between text-gray-500 text-xs mt-1">
                  <span>Vol: ${(t.volume5m/1000).toFixed(1)}K</span>
                  <span>Heat: {t.heatScore?.toFixed(0)}</span>
                </div>
              </motion.div>
            )) : (
              <div className="glass rounded-2xl p-6 text-center text-gray-500">
                <p>No runners yet</p>
                <p className="text-xs mt-2">Waiting for tokens with $500k+ MC</p>
              </div>
            )}
          </div>
        </div>

        {/* Metas */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-purple-400">🔥 Hot Metas</h2>
          <div className="space-y-3">
            {data?.metas?.length > 0 ? data.metas.map((m: any, i: number) => (
              <motion.div key={m.id} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}
                className={`glass rounded-2xl p-4 ${i === 0 ? 'glow-purple' : ''}`}>
                <div className="flex justify-between">
                  <span className="font-bold">{i === 0 ? '👑 ' : ''}{m.customName || m.name}</span>
                  <span className="text-gray-400 text-sm">{m.tokenCount} tokens</span>
                </div>
                <div className="text-xl font-bold mt-2">${(m.totalMarketCap/1000000).toFixed(2)}M</div>
              </motion.div>
            )) : (
              <div className="glass rounded-2xl p-6 text-center text-gray-500">
                <p>No metas yet</p>
                <p className="text-xs mt-2">Narratives form as tokens cluster</p>
              </div>
            )}
          </div>
        </div>

        {/* Branches */}
        <div>
          <h2 className="text-xl font-semibold mb-4 text-yellow-400">🌱 New Branches</h2>
          <div className="space-y-3">
            {data?.branches?.length > 0 ? data.branches.map((t: any) => (
              <motion.div key={t.id} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}}
                className="glass rounded-2xl p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {t.imageUrl && <img src={t.imageUrl} alt="" className="w-6 h-6 rounded-full"/>}
                    <span className="font-bold">{t.symbol}</span>
                  </div>
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">{t.phase}</span>
                </div>
                <div className="text-gray-400 text-sm mt-1">{t.name?.slice(0,20)}</div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Vol: ${(t.volume5m/1000).toFixed(1)}K</span>
                  <span className={t.priceChange5m >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {t.priceChange5m >= 0 ? '+' : ''}{t.priceChange5m?.toFixed(1)}%
                  </span>
                </div>
              </motion.div>
            )) : (
              <div className="glass rounded-2xl p-6 text-center text-gray-500">
                <p>No branches yet</p>
                <p className="text-xs mt-2">New qualified tokens appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-8 glass rounded-2xl p-4">
        <div className="flex justify-center gap-8 text-sm text-gray-400">
          <span>Tokens: {data?.stats?.tokens || 0}</span>
          <span>Runners: {data?.stats?.runners || 0}</span>
          <span>Metas: {data?.stats?.metas || 0}</span>
        </div>
      </div>
    </div>
  );
}
