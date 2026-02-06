"""
Prophet baseline model for trend + seasonality forecasting.
"""

import logging
from datetime import timedelta

import pandas as pd
from prophet import Prophet

logger = logging.getLogger(__name__)


def train_prophet(df: pd.DataFrame) -> Prophet:
    """Train a Prophet model on historical closing prices."""
    prophet_df = df[["date", "close"]].rename(columns={"date": "ds", "close": "y"})

    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True,
        changepoint_prior_scale=0.05,
        seasonality_mode="multiplicative",
    )
    model.add_country_holidays(country_name="US")
    model.fit(prophet_df)

    return model


def prophet_forecast(
    model: Prophet,
    periods: int,
    freq: str = "B",  # Business days
) -> pd.DataFrame:
    """
    Generate Prophet forecast for specified number of periods.
    Returns DataFrame with: ds, yhat, yhat_lower, yhat_upper
    """
    future = model.make_future_dataframe(periods=periods, freq=freq)
    forecast = model.predict(future)

    return forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]]


def get_prophet_residuals(
    model: Prophet, df: pd.DataFrame
) -> pd.DataFrame:
    """
    Compute residuals: actual - Prophet prediction on the training data.
    These residuals become the LSTM training target.
    """
    prophet_df = df[["date", "close"]].rename(columns={"date": "ds", "close": "y"})
    in_sample = model.predict(prophet_df[["ds"]])

    residuals = prophet_df.copy()
    residuals["prophet_pred"] = in_sample["yhat"].values
    residuals["residual"] = residuals["y"] - residuals["prophet_pred"]

    return residuals


HORIZON_DAYS = {
    "1mo": 21,
    "6mo": 126,
    "1yr": 252,
    "2yr": 504,
    "3yr": 756,
    "4yr": 1008,
    "5yr": 1260,
}
