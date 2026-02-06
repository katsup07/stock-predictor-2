"""
Feature engineering for ML models.
Computes technical indicators and adds market context features.
"""

import pandas as pd
import numpy as np
import ta


def add_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Add technical indicators to OHLCV DataFrame."""
    df = df.copy()

    # Simple Moving Averages
    for window in [5, 20, 50, 200]:
        df[f"sma_{window}"] = df["close"].rolling(window=window).mean()

    # Exponential Moving Averages
    for window in [5, 20, 50, 200]:
        df[f"ema_{window}"] = df["close"].ewm(span=window, adjust=False).mean()

    # RSI (14)
    df["rsi_14"] = ta.momentum.rsi(df["close"], window=14)

    # MACD (12, 26, 9)
    macd = ta.trend.MACD(df["close"], window_slow=26, window_fast=12, window_sign=9)
    df["macd"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_diff"] = macd.macd_diff()

    # Bollinger Bands
    bb = ta.volatility.BollingerBands(df["close"], window=20, window_dev=2)
    df["bb_upper"] = bb.bollinger_hband()
    df["bb_lower"] = bb.bollinger_lband()
    df["bb_mid"] = bb.bollinger_mavg()
    df["bb_width"] = (df["bb_upper"] - df["bb_lower"]) / df["bb_mid"]

    # ATR (14)
    df["atr_14"] = ta.volatility.average_true_range(
        df["high"], df["low"], df["close"], window=14
    )

    # OBV
    df["obv"] = ta.volume.on_balance_volume(df["close"], df["volume"])

    # Rate of Change
    df["roc_10"] = ta.momentum.roc(df["close"], window=10)

    # Returns
    df["return_1d"] = df["close"].pct_change()
    df["return_5d"] = df["close"].pct_change(5)
    df["return_20d"] = df["close"].pct_change(20)

    # Volatility
    df["volatility_20d"] = df["return_1d"].rolling(20).std() * np.sqrt(252)

    return df


def add_market_features(
    df: pd.DataFrame,
    market_data: dict[str, pd.DataFrame],
) -> pd.DataFrame:
    """Add market context features (S&P500 return, VIX, 10-yr yield)."""
    df = df.copy()

    for name, mdf in market_data.items():
        mdf = mdf.copy()
        mdf["date"] = pd.to_datetime(mdf["date"])
        df = pd.merge(df, mdf, on="date", how="left")

    # Forward-fill market data for weekends/holidays
    market_cols = [c for c in df.columns if c in ["sp500", "vix", "tnx"]]
    df[market_cols] = df[market_cols].ffill()

    # S&P500 returns
    if "sp500" in df.columns:
        df["sp500_return"] = df["sp500"].pct_change()

    return df


def prepare_features(
    df: pd.DataFrame,
    market_data: dict[str, pd.DataFrame] | None = None,
) -> pd.DataFrame:
    """
    Full feature engineering pipeline.
    Returns DataFrame with all features, NaN rows dropped.
    """
    df = add_technical_indicators(df)

    if market_data:
        df = add_market_features(df, market_data)

    # Drop rows with NaN from indicator warm-up periods
    df = df.dropna().reset_index(drop=True)

    return df
