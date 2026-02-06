"""
Data fetcher using yfinance with retry logic and Firestore caching.
"""

import time
import logging
from datetime import datetime, timedelta

import yfinance as yf
import pandas as pd
import firebase_admin
from firebase_admin import firestore

logger = logging.getLogger(__name__)

# Initialize Firebase only if credentials are available
db = None
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    logger.info("Firestore initialized successfully")
except Exception as e:
    logger.warning(f"Firestore not available: {e}. Running without cache.")

MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


def _retry(fn, *args, **kwargs):
    """Retry wrapper with exponential back-off."""
    for attempt in range(MAX_RETRIES):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            logger.warning(f"Attempt {attempt + 1} failed: {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
            else:
                raise


def fetch_ohlcv(ticker: str, period: str = "10y") -> pd.DataFrame:
    """Fetch OHLCV data from yfinance."""
    t = yf.Ticker(ticker)
    df = _retry(t.history, period=period, interval="1d")
    if df.empty:
        raise ValueError(f"No data returned for {ticker}")
    df = df.reset_index()
    df.columns = [c.lower().replace(" ", "_") for c in df.columns]
    df = df.rename(columns={"date": "date"})
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
    return df[["date", "open", "high", "low", "close", "volume"]]


def fetch_market_data() -> dict[str, pd.DataFrame]:
    """Fetch market indices: S&P500, VIX, 10-yr yield."""
    indices = {"^GSPC": "sp500", "^VIX": "vix", "^TNX": "tnx"}
    result = {}
    for symbol, name in indices.items():
        try:
            t = yf.Ticker(symbol)
            df = _retry(t.history, period="10y", interval="1d")
            df = df.reset_index()
            df.columns = [c.lower().replace(" ", "_") for c in df.columns]
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
            result[name] = df[["date", "close"]].rename(
                columns={"close": name})
        except Exception as e:
            logger.error(f"Failed to fetch {symbol}: {e}")
    return result


def fetch_company_info(ticker: str) -> dict:
    """Fetch basic company info from yfinance."""
    t = yf.Ticker(ticker)
    info = _retry(lambda: t.info)
    return {
        "ticker": ticker.upper(),
        "name": info.get("longName") or info.get("shortName") or ticker,
        "exchange": info.get("exchange") or "",
        "sector": info.get("sector") or "",
        "lastPrice": info.get("currentPrice") or info.get("regularMarketPrice") or 0,
        "change": info.get("regularMarketChange") or 0,
        "changePercent": info.get("regularMarketChangePercent") or 0,
        "lastUpdated": datetime.utcnow().isoformat(),
    }


def cache_stock_to_firestore(ticker: str, df: pd.DataFrame, info: dict):
    """Cache OHLCV and stock info to Firestore."""
    if db is None:
        logger.info(f"Firestore not available - skipping cache for {ticker}")
        return

    ticker = ticker.upper()

    # Write company info
    db.collection("stocks").document(ticker).set(info, merge=True)

    # Chunk by year and write
    df["year"] = df["date"].dt.year
    for year, group in df.groupby("year"):
        prices = group.drop(columns=["year"]).to_dict("records")
        # Convert timestamps to strings
        for p in prices:
            p["date"] = p["date"].strftime("%Y-%m-%d")
        db.collection("stocks").document(ticker).collection("dailyPrices").document(
            str(year)
        ).set({"prices": prices})

    logger.info(f"Cached {len(df)} records for {ticker}")


def get_cached_ohlcv(ticker: str) -> pd.DataFrame | None:
    """Try to load OHLCV from Firestore cache."""
    ticker = ticker.upper()
    doc = db.collection("stocks").document(ticker).get()
    if not doc.exists:
        return None

    # Check freshness — re-fetch if stale (> 1 day)
    data = doc.to_dict()
    last_updated = data.get("lastUpdated", "")
    if last_updated:
        try:
            lu = datetime.fromisoformat(last_updated)
            if datetime.utcnow() - lu < timedelta(hours=20):
                # Load from cache
                years_ref = (
                    db.collection("stocks")
                    .document(ticker)
                    .collection("dailyPrices")
                )
                docs = years_ref.stream()
                all_prices = []
                for d in docs:
                    prices = d.to_dict().get("prices", [])
                    all_prices.extend(prices)
                if all_prices:
                    df = pd.DataFrame(all_prices)
                    df["date"] = pd.to_datetime(df["date"])
                    return df.sort_values("date").reset_index(drop=True)
        except Exception:
            pass

    return None


def get_stock_data(ticker: str) -> pd.DataFrame:
    """
    Get OHLCV data — from cache if available and fresh, else fetch + cache.
    """
    cached = get_cached_ohlcv(ticker)
    if cached is not None and len(cached) > 0:
        logger.info(f"Using cached data for {ticker} ({len(cached)} rows)")
        return cached

    logger.info(f"Fetching fresh data for {ticker}")
    df = fetch_ohlcv(ticker)
    info = fetch_company_info(ticker)
    cache_stock_to_firestore(ticker, df, info)
    return df
