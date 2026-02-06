# Stock Predictor 2

Full-stack stock research and prediction app with three services:

- **client/** – React + Vite frontend with protected routes and charts.
- **functions/** – Firebase HTTPS functions (Express) for auth-protected APIs.
- **ml-service/** – FastAPI ML service for data fetching and forecasting.

## Features
- Auth (email/password + Google) with protected dashboard and stock detail pages.
- Stock search, watchlist, price history candlestick chart, and prediction requests.
- ML pipeline: yfinance data, Prophet baseline, LSTM residual correction, Monte Carlo fan chart, Firestore persistence.

## Architecture
- Frontend calls `/api/*` (proxied to Firebase Functions). Auth tokens are attached client-side.
- Functions route stock/search/history, watchlist CRUD, and prediction orchestration to the ML service.
- ML service fetches data via yfinance, engineers features, runs Prophet + LSTM + Monte Carlo, and writes results back to Firestore.

## Prerequisites
- Node 22+, npm
- Python 3.11 (for ml-service) and virtualenv
- Firebase project (service account key not committed; use template)
- Git, Java (for some tooling), Docker (optional for ml-service container)

## Environment
Create env files per package:

- `client/.env.local`
  - `VITE_FIREBASE_API_KEY=...`
  - `VITE_FIREBASE_AUTH_DOMAIN=...`
  - `VITE_FIREBASE_PROJECT_ID=...`
  - `VITE_FIREBASE_STORAGE_BUCKET=...`
  - `VITE_FIREBASE_MESSAGING_SENDER_ID=...`
  - `VITE_FIREBASE_APP_ID=...`

- `functions/service-account-key.json` (use the provided `service-account-key.json.template` as a guide; **do not commit**).

- `ml-service/.env` (optional, for Firestore access)
  - `GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/service-account-key.json`
  - `GCP_PROJECT_ID=your-project-id`

## Setup
### Frontend (client)
```bash
cd client
npm install
npm run dev
```
Dev server proxies `/api` to the local Firebase Functions emulator target set in `vite.config.ts`.

### Firebase Functions (functions)
```bash
cd functions
npm install
npm run build
# emulator
firebase emulators:start --only functions
```
Ensure `service-account-key.json` exists locally (not tracked) when not using the auth emulator.

### ML Service (ml-service)
```bash
cd ml-service
python -m venv venv
./venv/Scripts/Activate.ps1  # or source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Docker build (optional):
```bash
cd ml-service
docker build -t stock-ml-service .
```

## Running the stack locally
1. Start ml-service (`uvicorn` on :8000 or Docker container).
2. Start Firebase Functions emulator or deploy to Firebase; set `ML_SERVICE_URL` env var if not default `http://localhost:8000`.
3. Start frontend `npm run dev` in `client`.
4. Visit the client app, authenticate, search a ticker, open its detail page, and run a prediction.

## Deployment notes
- Functions: `npm run build && firebase deploy --only functions` (ensure Firebase project config is set).
- ML Service: containerize (`Dockerfile`) and run on your platform of choice; set `ML_SERVICE_URL` in Functions env to its URL.
- Frontend: `npm run build` in `client`; host the `dist/` output (or use Firebase Hosting with rewrites to Functions).

## Key APIs (Functions)
- `GET /api/stocks/search?q=TSLA`
- `GET /api/stocks/:ticker`
- `GET /api/stocks/:ticker/history?period=1y|3y|5y`
- `POST /api/predictions { ticker, horizons[] }`
- `GET /api/predictions/:id`
- `GET /api/watchlist`
- `POST /api/watchlist/:ticker`
- `DELETE /api/watchlist/:ticker`

## Security
- Client attaches Firebase ID token; Functions verify on every request.
- Keep `service-account-key.json` out of git (ignored). Rotate keys if they were ever exposed.

## Troubleshooting
- Blank stock page: ensure ml-service is running and `ML_SERVICE_URL` points to it; check Functions logs.
- 401s: make sure you are signed in and ID token is present.
- Missing history: verify yfinance connectivity and that Firestore cache is optional.

## Repository layout
- `client/` React app
- `functions/` Firebase HTTPS functions (Express routers)
- `ml-service/` FastAPI ML backend
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` – Firebase config
