import { Router } from 'express';
import * as admin from 'firebase-admin';

export const watchlistRouter = Router();
const getDb = () => admin.firestore();

// Get watchlist
watchlistRouter.get('/', async (req, res) => {
  try {
    const uid = (req as any).uid;
    const snapshot = await getDb()
      .collection(`users/${uid}/watchlist`)
      .get();

    const tickers = snapshot.docs.map((doc) => doc.id);

    // Fetch stock info for each ticker
    const stocks = await Promise.all(
      tickers.map(async (ticker) => {
        const stockDoc = await getDb().collection('stocks').doc(ticker).get();
        return stockDoc.exists ? stockDoc.data() : null;
      }),
    );

    res.json(stocks.filter(Boolean));
  } catch (err) {
    console.error('Get watchlist error:', err);
    res.status(500).json({ error: 'Failed to get watchlist' });
  }
});

// Add to watchlist
watchlistRouter.post('/:ticker', async (req, res) => {
  try {
    const uid = (req as any).uid;
    const ticker = req.params.ticker.toUpperCase();

    await getDb()
      .collection(`users/${uid}/watchlist`)
      .doc(ticker)
      .set({ addedAt: admin.firestore.FieldValue.serverTimestamp() });

    res.json({ message: 'Added to watchlist' });
  } catch (err) {
    console.error('Add watchlist error:', err);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// Remove from watchlist
watchlistRouter.delete('/:ticker', async (req, res) => {
  try {
    const uid = (req as any).uid;
    const ticker = req.params.ticker.toUpperCase();

    await getDb().collection(`users/${uid}/watchlist`).doc(ticker).delete();

    res.json({ message: 'Removed from watchlist' });
  } catch (err) {
    console.error('Remove watchlist error:', err);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});
