import { auth } from './firebase';

const API_BASE = '/api';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ---------- Stocks ----------
export interface StockInfo {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  lastPrice: number;
  change: number;
  changePercent: number;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function searchStocks(q: string): Promise<StockInfo[]> {
  return request(`/stocks/search?q=${encodeURIComponent(q)}`);
}

export function getStock(ticker: string): Promise<StockInfo> {
  return request(`/stocks/${ticker}`);
}

export function getStockHistory(
  ticker: string,
  period = '1y',
): Promise<OHLCV[]> {
  return request(`/stocks/${ticker}/history?period=${period}`);
}

// ---------- Predictions ----------
export interface PredictionRequest {
  ticker: string;
  horizons: string[];
}

export interface HorizonResult {
  horizon: string;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
  changePercent: number;
  confidence: number;
  monteCarlo?: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

export interface PredictionResult {
  id: string;
  ticker: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  horizons: HorizonResult[];
  forecastTimeseries?: { date: string; value: number; lower: number; upper: number }[];
}

export function createPrediction(
  data: PredictionRequest,
): Promise<{ predictionId: string }> {
  return request('/predictions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getPrediction(id: string): Promise<PredictionResult> {
  return request(`/predictions/${id}`);
}

// ---------- Watchlist ----------
export function getWatchlist(): Promise<StockInfo[]> {
  return request('/watchlist');
}

export function addToWatchlist(ticker: string): Promise<void> {
  return request(`/watchlist/${ticker}`, { method: 'POST' });
}

export function removeFromWatchlist(ticker: string): Promise<void> {
  return request(`/watchlist/${ticker}`, { method: 'DELETE' });
}
