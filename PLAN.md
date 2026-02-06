Stock Predictor App — Implementation Plan
======================================

TL;DR
-----
Build a stock prediction app with a React frontend (Firebase Hosting), a Node.js Express API (Firebase Cloud Functions Gen2), and a Python ML microservice (Cloud Run) that combines Facebook Prophet + LSTM in a residual-learning ensemble. Yahoo Finance (via `yfinance`) supplies historical data which is cached in Firestore. Firebase Auth handles user accounts. Predictions are provided for 1 month, 6 months, 1 year, 2, 3, 4, and 5+ years with confidence bands and Monte Carlo scenario ranges for longer horizons.

Goals
-----
- Provide multi-horizon price predictions (1mo, 6mo, 1yr, 2yr, 3yr, 4yr, 5yr+).
- Use Prophet for trend/seasonality + LSTM for residual correction (residual-learning ensemble).
- Cache historical stock and market data in Firestore to avoid repeated external API calls.
- Present results in an interactive chart with prediction bands and Monte Carlo fan charts for long horizons.

High-level Architecture
-----------------------
- Frontend: React + TypeScript (Vite), hosted on Firebase Hosting.
- Backend API: Node.js Express running as Firebase Cloud Functions (Gen2).
- ML microservice: Python (FastAPI) container deployed to Cloud Run; runs Prophet, LSTM, feature-engineering, and Monte Carlo simulations.
- Database: Firebase Firestore for cached OHLCV history, market indices, user data, watchlists, and prediction results.
- Auth: Firebase Auth (email/password + Google sign-in).
- Data source: `yfinance` for historical OHLCV, fundamentals, indices (cache aggressively).

Folder Structure (suggested)
---------------------------
Stock-Predictor-2/
├── client/              (React + Vite + TypeScript)
├── functions/           (Firebase Cloud Functions - Node.js Express)
├── ml-service/          (Python FastAPI + Prophet + LSTM, Dockerfile)
├── firebase.json
├── firestore.rules
└── PLAN.md

Phase 1 — Project Scaffolding & Firebase Setup
---------------------------------------------
1. Initialize React app (`client/`) with Vite + TypeScript. Install React Router, TailwindCSS, and `lightweight-charts`.
2. Initialize Firebase project (Hosting, Firestore, Auth, Cloud Functions Gen2). Add `.firebaserc` and `firebase.json`.
3. Create `functions/` with an Express app (TypeScript recommended) exposing the REST API.
4. Create `ml-service/` with FastAPI, `requirements.txt` (Prophet, TensorFlow/Keras, pandas, scikit-learn, ta, yfinance), and a `Dockerfile`.
5. Define environment variables to be filled by the user:
   - `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` (client)
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (Cloud Functions)
   - `ML_SERVICE_URL` (Cloud Run URL assigned after deploy)
   - `GCP_PROJECT_ID`

Phase 2 — Data Layer
--------------------
1. Implement `yfinance` data fetcher inside `ml-service/app/data/` with retry and rate-limiting.
2. Fetch OHLCV, dividends, splits, financials, earnings, and market indices (S&P500 `^GSPC`, VIX `^VIX`, TNX `^TNX`).
3. Cache fetched historical data in Firestore with the following collections:
   - `stocks/{ticker}`: company info + `lastUpdated`.
   - `stocks/{ticker}/dailyPrices/{YYYY}`: array of `{date, open, high, low, close, volume}` chunked by year.
   - `marketData/{index}/daily/{YYYY}`: market indices history.
   - `predictions/{predictionId}`: prediction summary and metadata.
4. Create a Cloud Scheduler job to run daily (post-market close) that updates cached data via Cloud Run.

Phase 3 — Feature Engineering & ML Models
----------------------------------------
Feature Engineering (in `ml-service/app/features/`):
- Compute technical indicators: SMA/EMA (5,20,50,200), RSI(14), MACD(12,26,9), Bollinger Bands, ATR, OBV, ROC.
- Add market context features: S&P500 return, VIX level, 10-yr yield.

Modeling Approach:
- Prophet: capture trend + seasonality + holidays. Output base forecast and uncertainty intervals.
- LSTM: train on residuals (actual - Prophet_pred) plus technical + market features. Architecture: 2-layer LSTM (128→64), dropout 0.2, Dense output. Use sequence length ~60 trading days.
- Ensemble: Residual-learning — final = Prophet + LSTM_residual. Weight LSTM more for short horizons and less for long horizons.
- Monte Carlo: for 3yr+ horizons, run Monte Carlo (GBM calibrated to historical volatility) to produce percentile scenarios.

Training & Validation:
- Walk-forward validation (time-series split). No shuffling. Use early stopping and checkpointing.
- Backtesting metrics: MAE, RMSE, directional accuracy, and calibration of confidence intervals.

Phase 4 — API Layer (Node.js Express in `functions/`)
--------------------------------------------------
Endpoints (authenticated):
- `GET /api/stocks/search?q=` — search cached stocks.
- `GET /api/stocks/{ticker}` — get cached company info and latest price.
- `GET /api/stocks/{ticker}/history?period=` — return cached OHLCV from Firestore.
- `POST /api/predictions` — create a prediction job (async), returns `predictionId`.
- `GET /api/predictions/{id}` — fetch prediction status/results.
- Watchlist routes: `GET /api/watchlist`, `POST /api/watchlist/{ticker}`, `DELETE /api/watchlist/{ticker}`.

Prediction job flow:
1. Client `POST /api/predictions` → Firestore doc with `status: pending`.
2. Cloud Function calls Cloud Run ML service (or ML service polls a queue) with `{ticker, horizons, predictionId}`.
3. ML service runs models, writes results to `predictions/{predictionId}` in Firestore.
4. Client polls or uses Firestore real-time listeners for updates.

Phase 5 — React Frontend
------------------------
Key pages/components:
- Dashboard: watchlist mini-sparklines, market summary, recent predictions.
- Stock Detail: Lightweight Charts candlestick chart, indicator overlays, company card, Predict modal.
- Prediction Results: historical + forecast with shaded confidence bands, Monte Carlo fan for long horizons, summary cards per horizon.
- Auth pages & Watchlist management.

Charting: use TradingView Lightweight Charts for candlesticks and prediction bands. Use a separate pane for indicators (RSI, MACD).

UX considerations:
- Show confidence bands prominently; for long horizons, show percentile ranges rather than point estimates.
- Display a clear disclaimer that predictions are informational and not financial advice.

Phase 6 — Deployment & CI/CD
---------------------------
1. Deploy `client/` to Firebase Hosting (`firebase deploy --only hosting`).
2. Deploy Express API to Cloud Functions Gen2 (`firebase deploy --only functions`).
3. Build and deploy `ml-service` Docker image to Cloud Run; set `--min-instances=1` to reduce cold starts for frequent predictions.
4. Set Cloud Scheduler to trigger daily data refresh and retrain/recalibration jobs as needed.
5. Configure IAM so Cloud Functions can invoke Cloud Run.

Phase 7 — Production Readiness
------------------------------
- Rate-limiting: limit user prediction requests (e.g., 10/hour) to control Cloud Run costs.
- Retraining schedule: retrain models weekly or monthly depending on resource budgets.
- Monitoring: set up alerts for Cloud Run errors, high latency, or failed scheduled jobs.
- Logging: ship logs to Cloud Logging; capture model inference durations and error rates.
- Testing: unit tests (Jest, pytest), integration tests (end-to-end prediction flow), and backtesting/performance evaluation for ML.

Firestore Design Notes
----------------------
- Chunk time-series by year under `stocks/{ticker}/dailyPrices/{YYYY}` to keep documents < 1 MiB.
- Store prediction summary at `predictions/{id}` and full timeseries in a subcollection `predictions/{id}/details` to avoid unnecessary reads.
- Batch writes when importing history; minimize indexes on high-write fields.

Data Source & Reliability
-------------------------
- `yfinance` provides historical OHLCV, dividends, splits, fundamentals, and indices, but it's an unofficial API and can be rate-limited or change unexpectedly. Cache aggressively and consider a paid fallback (Polygon, IEX, Twelve Data) for production.

Modeling Caveats & Ethics
------------------------
- Stock prices are noisy — predictions degrade substantially with time horizon. Present wide confidence bands for long horizons and provide clear disclaimers.
- Avoid promising returns. Include an explicit non-advice disclaimer.

Next Steps (implementation order)
--------------------------------
1. Initialize repositories and Firebase project.
2. Scaffold `client/`, `functions/`, and `ml-service/` with minimal hello-world endpoints.
3. Implement caching pipeline for yfinance and Firestore writes.
4. Implement Prophet baseline and LSTM residual model locally; validate with walk-forward backtests.
5. Implement the async prediction job flow and front-end integration.
6. Deploy to Firebase + Cloud Run, set up Cloud Scheduler, and monitor.

Appendix: Minimal Environment Variables to Set
-------------------------------------------
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID` (client-side `.env.local`)
- `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON for functions)
- `ML_SERVICE_URL` (Cloud Run URL)
- `GCP_PROJECT_ID`

Disclaimer
----------
This plan outlines an engineering approach for building a predictive system using historical and derived features. Predictions are probabilistic and inherently uncertain. This project should include a clear user-facing disclaimer that outputs are informational and not financial advice.
