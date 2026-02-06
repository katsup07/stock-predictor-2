import { Router } from 'express';
import * as admin from 'firebase-admin';

export const predictionsRouter = Router();
const getDb = () => admin.firestore();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Create a prediction
predictionsRouter.post('/', async (req, res) => {
  try {
    const uid = (req as any).uid;
    const { ticker, horizons } = req.body;

    if (!ticker || !horizons || !Array.isArray(horizons)) {
      res.status(400).json({ error: 'ticker and horizons[] are required' });
      return;
    }

    const predRef = getDb().collection('predictions').doc();
    const predictionId = predRef.id;

    await predRef.set({
      id: predictionId,
      userId: uid,
      ticker: ticker.toUpperCase(),
      horizons: [],
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Call ML service asynchronously
    fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        predictionId,
        ticker: ticker.toUpperCase(),
        horizons,
      }),
    }).catch((err) => {
      console.error('ML service call failed:', err);
      predRef.update({ status: 'failed' });
    });

    res.json({ predictionId });
  } catch (err) {
    console.error('Create prediction error:', err);
    res.status(500).json({ error: 'Failed to create prediction' });
  }
});

// Get prediction status/results
predictionsRouter.get('/:id', async (req, res) => {
  try {
    const uid = (req as any).uid;
    const doc = await getDb().collection('predictions').doc(req.params.id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'Prediction not found' });
      return;
    }

    const data = doc.data()!;
    if (data.userId !== uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json(data);
  } catch (err) {
    console.error('Get prediction error:', err);
    res.status(500).json({ error: 'Failed to get prediction' });
  }
});
