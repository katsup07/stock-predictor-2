"""
Main prediction pipeline.
Orchestrates data fetching, feature engineering, Prophet, LSTM, ensemble, and Monte Carlo.
Writes results back to Firestore.
"""

import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd
import firebase_admin
from firebase_admin import firestore

from app.data.fetcher import get_stock_data, fetch_market_data, fetch_company_info
from app.features.engineering import prepare_features
from app.models.prophet_model import (
    train_prophet,
    prophet_forecast,
    get_prophet_residuals,
    HORIZON_DAYS,
)
from app.models.lstm_model import train_lstm, predict_lstm_residual, SEQUENCE_LENGTH
from app.models.monte_carlo import monte_carlo_simulation

logger = logging.getLogger(__name__)

# Initialize Firebase only if credentials are available
db = None
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    logger.info("Firestore initialized successfully")
except Exception as e:
    logger.warning(
        f"Firestore not available: {e}. Predictions will not be saved to Firestore.")

# Horizon weighting for LSTM influence: more for short, less for long
LSTM_WEIGHTS = {
    "1mo": 0.6,
    "6mo": 0.5,
    "1yr": 0.4,
    "2yr": 0.3,
    "3yr": 0.2,
    "4yr": 0.15,
    "5yr": 0.1,
}


def run_prediction(prediction_id: str, ticker: str, horizons: list[str]):
    """
    Full prediction pipeline. Called as a background task.
    """
    try:
        # Update status
        if db:
            pred_ref = db.collection("predictions").document(prediction_id)
            pred_ref.update({"status": "running"})
        else:
            logger.info(
                f"Prediction {prediction_id} running (Firestore disabled)")

        # 1. Get data
        logger.info(f"Fetching data for {ticker}")
        df = get_stock_data(ticker)
        market_data = fetch_market_data()

        # 2. Feature engineering
        logger.info("Computing features")
        features_df = prepare_features(df, market_data)

        # 3. Train Prophet
        logger.info("Training Prophet model")
        prophet_model = train_prophet(features_df)

        # 4. Get residuals and train LSTM
        logger.info("Computing residuals and training LSTM")
        residuals_df = get_prophet_residuals(prophet_model, features_df)

        # Align features with residuals
        aligned_features = features_df.iloc[: len(residuals_df)].copy()
        feature_cols = [
            c
            for c in aligned_features.columns
            if c not in ["date", "close", "open", "high", "low", "volume"]
        ]

        lstm_model, feat_scaler, target_scaler = train_lstm(
            aligned_features[feature_cols], residuals_df["residual"]
        )

        # 5. Generate forecasts for each horizon
        last_price = float(features_df["close"].iloc[-1])
        last_date = features_df["date"].iloc[-1]

        # Historical annualized return and volatility for Monte Carlo
        returns = features_df["close"].pct_change().dropna()
        annual_return = float(returns.mean() * 252)
        annual_vol = float(returns.std() * np.sqrt(252))

        horizon_results = []
        forecast_timeseries = []

        for h in horizons:
            days = HORIZON_DAYS.get(h, 252)
            lstm_weight = LSTM_WEIGHTS.get(h, 0.3)

            # Prophet forecast
            prophet_fc = prophet_forecast(prophet_model, periods=days)
            prophet_end = prophet_fc.iloc[-1]
            prophet_price = float(prophet_end["yhat"])
            prophet_lower = float(prophet_end["yhat_lower"])
            prophet_upper = float(prophet_end["yhat_upper"])

            # LSTM residual correction
            if lstm_model is not None and len(aligned_features) >= SEQUENCE_LENGTH:
                recent = aligned_features[feature_cols].values[-SEQUENCE_LENGTH:]
                lstm_residual = predict_lstm_residual(
                    lstm_model, recent, feat_scaler, target_scaler
                )
            else:
                lstm_residual = 0.0

            # Ensemble: Prophet + weighted LSTM residual
            predicted_price = prophet_price + lstm_weight * lstm_residual
            lower_bound = prophet_lower + lstm_weight * lstm_residual
            upper_bound = prophet_upper + lstm_weight * lstm_residual

            change_pct = ((predicted_price - last_price) / last_price) * 100

            # Confidence degrades with horizon
            base_confidence = 0.85
            decay = days / 2520  # 10 years = max horizon
            confidence = max(0.1, base_confidence * (1 - decay))

            result = {
                "horizon": h,
                "predictedPrice": round(predicted_price, 2),
                "lowerBound": round(lower_bound, 2),
                "upperBound": round(upper_bound, 2),
                "changePercent": round(change_pct, 2),
                "confidence": round(confidence, 3),
            }

            # Monte Carlo for 3yr+
            if days >= 756:
                mc = monte_carlo_simulation(
                    last_price=last_price,
                    annual_return=annual_return,
                    annual_volatility=annual_vol,
                    days=days,
                )
                result["monteCarlo"] = {
                    "p10": round(mc["p10"], 2),
                    "p25": round(mc["p25"], 2),
                    "p50": round(mc["p50"], 2),
                    "p75": round(mc["p75"], 2),
                    "p90": round(mc["p90"], 2),
                }

            horizon_results.append(result)

        # Build forecast timeseries for charting (use the longest horizon)
        max_days = max(HORIZON_DAYS.get(h, 252) for h in horizons)
        full_forecast = prophet_forecast(prophet_model, periods=max_days)
        future_only = full_forecast[full_forecast["ds"] > last_date]

        for _, row in future_only.iterrows():
            forecast_timeseries.append(
                {
                    "date": row["ds"].strftime("%Y-%m-%d"),
                    "value": round(float(row["yhat"]), 2),
                    "lower": round(float(row["yhat_lower"]), 2),
                    "upper": round(float(row["yhat_upper"]), 2),
                }
            )

        # 6. Write results to Firestore if available
        if db:
            pred_ref.update(
                {
                    "status": "completed",
                    "horizons": horizon_results,
                    "forecastTimeseries": forecast_timeseries[:500],
                    "completedAt": datetime.utcnow().isoformat(),
                }
            )
        else:
            logger.info(
                f"Prediction {prediction_id} completed (results not saved - Firestore disabled)")
            logger.info(
                f"Results: {len(horizon_results)} horizons, {len(forecast_timeseries)} forecast points")

        logger.info(f"Prediction {prediction_id} completed for {ticker}")

    except Exception as e:
        logger.error(f"Prediction {prediction_id} failed: {e}", exc_info=True)
        try:
            if db:
                db.collection("predictions").document(prediction_id).update(
                    {"status": "failed", "error": str(e)}
                )
        except Exception:
            pass
