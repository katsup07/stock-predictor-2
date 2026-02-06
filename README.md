# Stock Predictor 2

Search equities, view price history, manage a watchlist, and run forecasts. The ML service combines yfinance data with Prophet, LSTM residual correction, and Monte Carlo fan charts; results are served through Firebase Functions to the React UI.

## What’s included
- **client/** React + Vite frontend (protected routes, candlestick chart, prediction UI)
- **functions/** Firebase HTTPS functions (auth + stock, watchlist, prediction APIs)
- **ml-service/** FastAPI ML backend (data fetch, feature engineering, forecasting)

## Prerequisites
- Node 22+, npm
- Python 3.11 (+ venv) for ml-service
- Firebase project and service account key (use the template; keep the real key out of git)
- Docker optional for ml-service container

## Environment
- `client/.env.local`: Firebase web config (`VITE_FIREBASE_*` vars)
- `functions/service-account-key.json`: service account JSON (**do not commit**; see template)
- `ml-service/.env` (optional for Firestore): `GOOGLE_APPLICATION_CREDENTIALS`, `GCP_PROJECT_ID`

## Install & run
1) Frontend
```bash
cd client
npm install
npm run dev
```

2) Firebase Functions
```bash
cd functions
npm install
npm run build
firebase emulators:start --only functions  # or deploy
```

3) ML Service
```bash
cd ml-service
python -m venv venv
./venv/Scripts/Activate.ps1  # or source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
Optional container: `docker build -t stock-ml-service .`

## Running locally
1. Start the ml-service on :8000 (or set `ML_SERVICE_URL` if different).
2. Start Functions emulator (or deployed endpoint) so `/api` works.
3. Start the frontend and sign in; search a ticker, open its detail page, and run a prediction.

## Deployment (brief)
- Functions: `npm run build && firebase deploy --only functions`
- ML service: deploy the container or app; set `ML_SERVICE_URL` in Functions env.
- Frontend: `npm run build` in `client`; host `dist/` (or Firebase Hosting with rewrites).