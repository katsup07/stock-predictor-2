import { Router } from 'express';
import * as admin from 'firebase-admin';

export const stocksRouter = Router();
const getDb = () => admin.firestore();
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Search stocks
stocksRouter.get('/search', async (req, res) => {
  try {
    const q = (req.query.q as string || '').toUpperCase();
    if (!q) {
      res.json([]);
      return;
    }

    // Try Firestore first
    const snapshot = await getDb()
      .collection('stocks')
      .where('ticker', '>=', q)
      .where('ticker', '<=', q + '\uf8ff')
      .limit(10)
      .get();

    if (snapshot.docs.length > 0) {
      res.json(snapshot.docs.map((doc) => doc.data()));
      return;
    }

    // Fallback to ML service (yfinance)
    const mlRes = await fetch(
      `${ML_SERVICE_URL}/stocks/search?q=${encodeURIComponent(q)}`,
    );
    if (mlRes.ok) {
      const results = await mlRes.json();
      res.json(results);
      return;
    }

    res.json([]);
  } catch (err) {
    console.error('Stock search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Get stock info
stocksRouter.get('/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const doc = await getDb().collection('stocks').doc(ticker).get();

    if (doc.exists) {
      res.json(doc.data());
      return;
    }

    // Fallback to ML service (yfinance)
    const mlRes = await fetch(`${ML_SERVICE_URL}/stocks/${ticker}`);
    if (mlRes.ok) {
      const info = await mlRes.json();
      // Cache to Firestore for next time
      try {
        await getDb().collection('stocks').doc(ticker).set(info, { merge: true });
      } catch (cacheErr) {
        console.warn('Failed to cache stock info:', cacheErr);
      }
      res.json(info);
      return;
    }

    res.status(404).json({ error: 'Stock not found' });
  } catch (err) {
    console.error('Get stock error:', err);
    res.status(500).json({ error: 'Failed to get stock' });
  }
});

// Get stock history
stocksRouter.get('/:ticker/history', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const period = (req.query.period as string) || '1y';

    // Determine years to fetch based on period
    const now = new Date();
    const currentYear = now.getFullYear();
    let yearsBack = 1;
    if (period === '5y') yearsBack = 5;
    else if (period === '3y') yearsBack = 3;
    else if (period === '2y') yearsBack = 2;
    else if (period === '1y') yearsBack = 1;
    else if (period === '6mo') yearsBack = 1;
    else if (period === '1mo') yearsBack = 1;

    const years: string[] = [];
    for (let y = currentYear - yearsBack; y <= currentYear; y++) {
      years.push(String(y));
    }

    const pricesRef = getDb().collection(`stocks/${ticker}/dailyPrices`);
    const snapshots = await Promise.all(
      years.map((y) => pricesRef.doc(y).get()),
    );

    const allPrices: any[] = [];
    for (const snap of snapshots) {
      if (snap.exists) {
        const data = snap.data();
        if (data?.prices) {
          allPrices.push(...data.prices);
        }
      }
    }

    // If Firestore has data, return it
    if (allPrices.length > 0) {
      allPrices.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      res.json(allPrices);
      return;
    }

    // Fallback to ML service (yfinance)
    const mlRes = await fetch(
      `${ML_SERVICE_URL}/stocks/${ticker}/history?period=${period}`,
    );
    if (mlRes.ok) {
      const prices = await mlRes.json();
      res.json(prices);
      return;
    }

    res.json([]);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to get history' });
  }
});
