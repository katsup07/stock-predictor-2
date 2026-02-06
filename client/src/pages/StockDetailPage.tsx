import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getStock,
  getStockHistory,
  addToWatchlist,
  removeFromWatchlist,
  createPrediction,
  getPrediction,
  type StockInfo,
  type OHLCV,
  type PredictionResult,
} from '../lib/api';
import {
  ArrowLeft,
  Star,
  StarOff,
  TrendingUp,
  TrendingDown,
  Loader2,
} from 'lucide-react';
import { createChart, type IChartApi, type ISeriesApi, CandlestickSeries, LineSeries, AreaSeries } from 'lightweight-charts';

const HORIZONS = ['1mo', '6mo', '1yr', '2yr', '3yr', '4yr', '5yr'];

export default function StockDetailPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const [stock, setStock] = useState<StockInfo | null>(null);
  const [history, setHistory] = useState<OHLCV[]>([]);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [selectedHorizons, setSelectedHorizons] = useState<string[]>(['1yr']);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!ticker) return;
    getStock(ticker)
      .then((s) => setStock({
        ...s,
        lastPrice: s.lastPrice ?? 0,
        change: s.change ?? 0,
        changePercent: s.changePercent ?? 0,
        name: s.name ?? ticker,
        exchange: s.exchange ?? '',
        sector: s.sector ?? '',
      }))
      .catch(() => {});
    getStockHistory(ticker, '5y').then(setHistory).catch(() => {});
  }, [ticker]);

  // Chart setup
  useEffect(() => {
    if (!chartRef.current || history.length === 0) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
    }

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#1e1e2e' },
        textColor: '#cdd6f4',
      },
      grid: {
        vertLines: { color: '#31324422' },
        horzLines: { color: '#31324422' },
      },
      crosshair: { mode: 0 },
      timeScale: { borderColor: '#313244' },
    });

    chartInstanceRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    candleSeries.setData(
      history.map((d) => ({
        time: d.date as unknown as import('lightweight-charts').Time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    );

    candleSeriesRef.current = candleSeries;
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [history]);

  // Draw prediction overlay
  useEffect(() => {
    if (!chartInstanceRef.current || !prediction?.forecastTimeseries) return;

    const chart = chartInstanceRef.current;

    // Add forecast line
    const forecastSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
      lineStyle: 2,
    });
    forecastSeries.setData(
      prediction.forecastTimeseries.map((d) => ({
        time: d.date as unknown as import('lightweight-charts').Time,
        value: d.value,
      })),
    );

    // Add confidence band
    const upperSeries = chart.addSeries(AreaSeries, {
      topColor: 'rgba(59,130,246,0.1)',
      bottomColor: 'rgba(59,130,246,0.02)',
      lineColor: 'rgba(59,130,246,0.3)',
      lineWidth: 1,
    });
    upperSeries.setData(
      prediction.forecastTimeseries.map((d) => ({
        time: d.date as unknown as import('lightweight-charts').Time,
        value: d.upper,
      })),
    );

    chart.timeScale().fitContent();
  }, [prediction]);

  const handlePredict = async () => {
    if (!ticker) return;
    setPredicting(true);
    setPrediction(null);
    try {
      const { predictionId } = await createPrediction({
        ticker,
        horizons: selectedHorizons,
      });
      // Poll for results
      const poll = async () => {
        const result = await getPrediction(predictionId);
        if (result.status === 'completed' || result.status === 'failed') {
          setPrediction(result);
          setPredicting(false);
        } else {
          setTimeout(poll, 2000);
        }
      };
      poll();
    } catch {
      setPredicting(false);
    }
  };

  const toggleWatchlist = async () => {
    if (!ticker) return;
    if (inWatchlist) {
      await removeFromWatchlist(ticker);
      setInWatchlist(false);
    } else {
      await addToWatchlist(ticker);
      setInWatchlist(true);
    }
  };

  const toggleHorizon = (h: string) => {
    setSelectedHorizons((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h],
    );
  };

  if (!stock) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="bg-surface border-b border-border px-6 py-4">
        <Link
          to="/"
          className="text-text-muted hover:text-text flex items-center gap-1 text-sm mb-2"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              {stock.ticker}
              <span className="text-text-muted text-base font-normal">
                {stock.name}
              </span>
            </h1>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold">
                ${stock.lastPrice.toFixed(2)}
              </span>
              <span
                className={`text-lg font-medium flex items-center gap-1 ${
                  stock.changePercent >= 0 ? 'text-green' : 'text-red'
                }`}
              >
                {stock.changePercent >= 0 ? (
                  <TrendingUp size={18} />
                ) : (
                  <TrendingDown size={18} />
                )}
                {stock.changePercent >= 0 ? '+' : ''}
                {stock.changePercent.toFixed(2)}%
              </span>
            </div>
          </div>
          <button
            onClick={toggleWatchlist}
            className="p-2 rounded-lg hover:bg-surface-light transition"
          >
            {inWatchlist ? (
              <Star size={24} className="text-warning fill-warning" />
            ) : (
              <StarOff size={24} className="text-text-muted" />
            )}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Chart */}
        <div
          ref={chartRef}
          className="bg-surface border border-border rounded-xl overflow-hidden mb-6"
        />

        {/* Prediction Controls */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Generate Prediction</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {HORIZONS.map((h) => (
              <button
                key={h}
                onClick={() => toggleHorizon(h)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  selectedHorizons.includes(h)
                    ? 'bg-primary text-white'
                    : 'bg-surface-light text-text-muted hover:text-text border border-border'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
          <button
            onClick={handlePredict}
            disabled={predicting || selectedHorizons.length === 0}
            className="bg-primary hover:bg-primary-dark text-white font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {predicting && <Loader2 className="animate-spin" size={16} />}
            {predicting ? 'Running Models…' : 'Predict'}
          </button>
        </div>

        {/* Prediction Results */}
        {prediction && prediction.status === 'completed' && (
          <div className="bg-surface border border-border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Prediction Results</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {prediction.horizons.map((h) => (
                <div
                  key={h.horizon}
                  className="bg-surface-light border border-border rounded-xl p-4"
                >
                  <div className="text-text-muted text-sm mb-1">{h.horizon}</div>
                  <div className="text-2xl font-bold">
                    ${h.predictedPrice.toFixed(2)}
                  </div>
                  <div
                    className={`text-sm font-medium ${
                      h.changePercent >= 0 ? 'text-green' : 'text-red'
                    }`}
                  >
                    {h.changePercent >= 0 ? '+' : ''}
                    {h.changePercent.toFixed(1)}%
                  </div>
                  <div className="text-xs text-text-muted mt-2">
                    Range: ${h.lowerBound.toFixed(2)} – ${h.upperBound.toFixed(2)}
                  </div>
                  <div className="text-xs text-text-muted">
                    Confidence: {(h.confidence * 100).toFixed(0)}%
                  </div>
                  {h.monteCarlo && (
                    <div className="text-xs text-text-muted mt-1">
                      MC P10-P90: ${h.monteCarlo.p10.toFixed(2)} – $
                      {h.monteCarlo.p90.toFixed(2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {prediction && prediction.status === 'failed' && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-danger">
            Prediction failed. Please try again later.
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-surface-light border border-border rounded-xl p-4 text-text-muted text-xs mt-6">
          <strong>Disclaimer:</strong> Predictions are probabilistic and inherently
          uncertain. This tool is for informational purposes only and does not
          constitute financial advice.
        </div>
      </main>
    </div>
  );
}
