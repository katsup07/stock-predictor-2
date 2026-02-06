# Quick Start Commands

## Terminal 1: ML Service ✓ RUNNING
```powershell
cd ml-service
venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
**Status**: Running at http://localhost:8000
*Note: Running without Firestore (local mode)*

## Terminal 2: Firebase Emulators
```powershell
firebase emulators:start
```
**What it runs**:
- Functions (API) at http://localhost:5001/YOUR-PROJECT-ID/us-central1/api
- Auth emulator at http://localhost:9099
- Firestore emulator at http://localhost:8080

**Before running**:
1. Update `.firebaserc` with a project ID (can be fake for emulator)
2. Or: `firebase use --add` to select/create one

## Terminal 3: React Client
```powershell
cd client
npm run dev
```
**What you need first**:
1. Copy `client/.env.local.template` to `client/.env.local`
2. Get Firebase config from https://console.firebase.google.com (Project Settings > Your apps)
3. Fill in the VITE_FIREBASE_* values

**Status**: Ready to run once .env.local is configured

## Quick Test (Without Full Setup)
If you just want to test the ML service without Firebase:
```powershell
# Test the ML health endpoint
curl http://localhost:8000/health

# Test a prediction (will work but won't save to Firestore)
curl -X POST http://localhost:8000/predict `
  -H "Content-Type: application/json" `
  -d '{"predictionId":"test1","ticker":"AAPL","horizons":["1mo","1yr"]}'
```

Check logs in the ML service terminal to see it fetching data and running models!
