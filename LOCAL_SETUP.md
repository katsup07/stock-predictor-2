# Running the Stock Predictor Locally

## Prerequisites
- Node.js 20.19+ or 22.12+
- Python 3.11+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project created at https://console.firebase.google.com

## Setup Steps

### 1. Configure Firebase

1. Go to https://console.firebase.google.com and create a new project (or use existing)
2. Enable Authentication (Email/Password + Google)
3. Enable Firestore Database
4. Update `.firebaserc` with your project ID:
   ```json
   {
     "projects": {
       "default": "your-project-id"
     }
   }
   ```

### 2. Client Configuration

1. Copy `client/.env.local.template` to `client/.env.local`
2. Fill in your Firebase config (get from Project Settings > General > Your apps):
   ```
   VITE_FIREBASE_API_KEY=AIza...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
   ```

### 3. Functions Configuration (optional for emulator)

For emulator mode, you can skip the service account. For actual deployment:
1. Go to Project Settings > Service Accounts > Generate new private key
2. Save as `functions/service-account-key.json`
3. Update `functions/.env`:
   ```
   ML_SERVICE_URL=http://localhost:8000
   GCP_PROJECT_ID=your-project-id
   ```

### 4. Install Dependencies

```bash
# Client
cd client
npm install

# Functions
cd ../functions
npm install
```

## Running Locally

### Terminal 1: ML Service (Python)

```bash
cd ml-service

# Create virtual environment (first time only)
python -m venv venv

# Activate virtual environment
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# macOS/Linux:
source venv/bin/activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Set up Firebase credentials (if using real Firestore)
$env:GOOGLE_APPLICATION_CREDENTIALS = "path\to\service-account-key.json"

# Run the ML service
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The ML service will be running at http://localhost:8000

### Terminal 2: Firebase Emulators

```bash
cd functions

# Build functions (first time and after changes)
npm run build

# Start Firebase emulators from project root
cd ..
firebase emulators:start
```

The Functions API will be at http://localhost:5001/your-project-id/us-central1/api

### Terminal 3: React Client

```bash
cd client
npm run dev
```

The client will be at http://localhost:5173 (or check terminal output)

## Testing the Setup

1. Open http://localhost:5173
2. Register a new account (works with emulator auth)
3. Search for a stock ticker (e.g., "AAPL")
4. View stock details
5. Generate predictions

## Troubleshooting

### Firebase Emulator Issues
- Make sure you're in the project root when running `firebase emulators:start`
- The emulator uses your `.firebaserc` project ID but doesn't need real credentials

### ML Service Issues
- If imports fail, make sure you activated the virtual environment
- If yfinance fails, you may be rate-limited - try again in a few minutes
- Initial model training can take 1-2 minutes for the first request

### Client API Connection Issues
- Make sure the proxy in `client/vite.config.ts` points to the correct emulator port
- Check that all three services are running
- Look at browser console for CORS or auth errors

## Using Real Firebase (Production)

1. Deploy Firestore rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

2. Deploy Functions:
   ```bash
   cd functions
   npm run build
   cd ..
   firebase deploy --only functions
   ```

3. Deploy ML service to Cloud Run:
   ```bash
   cd ml-service
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/ml-service
   gcloud run deploy ml-service \
     --image gcr.io/YOUR_PROJECT_ID/ml-service \
     --region us-central1 \
     --platform managed \
     --allow-unauthenticated \
     --min-instances 1
   ```
   
   Update `functions/.env` with the Cloud Run URL.

4. Build and deploy client:
   ```bash
   cd client
   npm run build
   cd ..
   firebase deploy --only hosting
   ```
