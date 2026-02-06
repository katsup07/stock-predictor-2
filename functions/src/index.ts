import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import express from 'express';
import cors from 'cors';
import { stocksRouter } from './routes/stocks';
import { predictionsRouter } from './routes/predictions';
import { watchlistRouter } from './routes/watchlist';
import * as path from 'path';
import * as fs from 'fs';

// Initialize with service account if available (for emulator use)
const saPath = path.resolve(__dirname, '..', 'service-account-key.json');
if (fs.existsSync(saPath) && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  admin.initializeApp({
    credential: admin.credential.cert(saPath),
  });
} else {
  admin.initializeApp();
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Auth middleware — verifies Firebase ID token
app.use(async (req, res, next) => {
  // Allow health-check without auth
  if (req.path === '/api/health') return next();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    (req as any).uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/stocks', stocksRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/watchlist', watchlistRouter);

export const api = onRequest({ region: 'us-central1' }, app);
