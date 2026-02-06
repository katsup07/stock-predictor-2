from fastapi import FastAPI, BackgroundTasks, Query
from pydantic import BaseModel
from app.predict import run_prediction
from app.data.fetcher import fetch_company_info, fetch_ohlcv
import yfinance as yf
import logging

logger = logging.getLogger(__name__)

app = FastAPI(title="Stock Predictor ML Service")


class PredictionRequest(BaseModel):
    predictionId: str
    ticker: str
    horizons: list[str]


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok"}


@app.get("/stocks/search")
def stock_search(q: str = Query("", min_length=1)):
    """Search for stocks using yfinance."""
    q = q.upper().strip()
    if not q:
        return []

    results = []
    try:
        # Try direct ticker lookup first
        t = yf.Ticker(q)
        info = t.info or {}
        if info.get("regularMarketPrice") or info.get("currentPrice"):
            results.append({
                "ticker": q,
                "name": info.get("longName") or info.get("shortName") or q,
                "exchange": info.get("exchange") or "",
                "sector": info.get("sector") or "",
                "lastPrice": info.get("currentPrice") or info.get("regularMarketPrice") or 0,
                "change": info.get("regularMarketChange") or 0,
                "changePercent": info.get("regularMarketChangePercent") or 0,
            })
    except Exception as e:
        logger.warning(f"Direct lookup failed for {q}: {e}")

    # Also try yfinance search
    try:
        search_results = yf.search(q, max_results=8)
        quotes = []
        if isinstance(search_results, dict):
            quotes = search_results.get("quotes", [])
        elif hasattr(search_results, "get"):
            quotes = search_results.get("quotes", [])

        seen = {r["ticker"] for r in results}
        for quote in quotes:
            symbol = quote.get("symbol", "")
            if symbol and symbol not in seen and quote.get("quoteType") in ("EQUITY", "ETF"):
                seen.add(symbol)
                results.append({
                    "ticker": symbol,
                    "name": quote.get("longname", quote.get("shortname", symbol)),
                    "exchange": quote.get("exchange", ""),
                    "sector": "",
                    "lastPrice": 0,
                    "change": 0,
                    "changePercent": 0,
                })
    except Exception as e:
        logger.warning(f"Search failed for {q}: {e}")

    return results[:10]


@app.get("/stocks/{ticker}")
def stock_info(ticker: str):
    """Get stock info from yfinance."""
    info = fetch_company_info(ticker.upper())
    return info


@app.get("/stocks/{ticker}/history")
def stock_history(ticker: str, period: str = "1y"):
    """Get OHLCV history from yfinance."""
    df = fetch_ohlcv(ticker.upper(), period=period)
    records = df.to_dict("records")
    for r in records:
        r["date"] = r["date"].strftime(
            "%Y-%m-%d") if hasattr(r["date"], "strftime") else str(r["date"])
    return records


@app.post("/predict")
async def predict(req: PredictionRequest, background_tasks: BackgroundTasks):
    """
    Accepts a prediction request and runs the ML pipeline in the background.
    Results are written back to Firestore.
    """
    background_tasks.add_task(
        run_prediction,
        prediction_id=req.predictionId,
        ticker=req.ticker,
        horizons=req.horizons,
    )
    return {"message": "Prediction started", "predictionId": req.predictionId}
