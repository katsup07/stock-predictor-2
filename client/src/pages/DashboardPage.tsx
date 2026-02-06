import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { searchStocks, getWatchlist, type StockInfo } from '../lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { Search, TrendingUp, TrendingDown, Star, BarChart3, LogOut } from 'lucide-react';

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockInfo[]>([]);
  const [watchlist, setWatchlist] = useState<StockInfo[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    getWatchlist()
      .then(setWatchlist)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (query.length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchStocks(query);
        setResults(res.map((s) => ({
          ...s,
          lastPrice: s.lastPrice ?? 0,
          change: s.change ?? 0,
          changePercent: s.changePercent ?? 0,
          name: s.name ?? '',
          exchange: s.exchange ?? '',
          sector: s.sector ?? '',
        })));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="text-primary" size={28} />
          <h1 className="text-xl font-bold">Stock Predictor</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-text-muted text-sm">{user?.email}</span>
          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-3.5 text-text-muted" size={18} />
          <input
            type="text"
            placeholder="Search stocks by ticker or company name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-surface border border-border rounded-xl pl-11 pr-4 py-3 text-text focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searching && (
            <div className="absolute right-4 top-3.5 text-text-muted text-sm">
              Searching…
            </div>
          )}
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-xl shadow-xl max-h-80 overflow-y-auto">
              {results.map((s) => (
                <Link
                  key={s.ticker}
                  to={`/stock/${s.ticker}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface-light transition"
                  onClick={() => setQuery('')}
                >
                  <div>
                    <span className="font-semibold">{s.ticker}</span>
                    <span className="text-text-muted text-sm ml-2">{s.name}</span>
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      s.changePercent >= 0 ? 'text-green' : 'text-red'
                    }`}
                  >
                    {s.changePercent >= 0 ? '+' : ''}
                    {s.changePercent.toFixed(2)}%
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Star size={18} className="text-warning" /> Watchlist
          </h2>
          {watchlist.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">
              Your watchlist is empty. Search for a stock to get started.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {watchlist.map((s) => (
                <Link
                  key={s.ticker}
                  to={`/stock/${s.ticker}`}
                  className="bg-surface border border-border rounded-xl p-4 hover:border-primary/50 transition"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg">{s.ticker}</span>
                    {s.changePercent >= 0 ? (
                      <TrendingUp size={18} className="text-green" />
                    ) : (
                      <TrendingDown size={18} className="text-red" />
                    )}
                  </div>
                  <p className="text-text-muted text-sm truncate">{s.name}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-xl font-semibold">
                      ${s.lastPrice.toFixed(2)}
                    </span>
                    <span
                      className={`text-sm font-medium ${
                        s.changePercent >= 0 ? 'text-green' : 'text-red'
                      }`}
                    >
                      {s.changePercent >= 0 ? '+' : ''}
                      {s.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Disclaimer */}
        <div className="bg-surface-light border border-border rounded-xl p-4 text-text-muted text-xs">
          <strong>Disclaimer:</strong> Predictions are probabilistic and inherently
          uncertain. This tool is for informational purposes only and does not
          constitute financial advice.
        </div>
      </main>
    </div>
  );
}
