"""
LSTM residual model.
Trains on residuals from Prophet + technical/market features.
Architecture: 2-layer LSTM (128→64), dropout 0.2, dense output.
"""

import logging

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

logger = logging.getLogger(__name__)

SEQUENCE_LENGTH = 60


def _build_lstm_model(n_features: int):
    """Build a 2-layer LSTM model."""
    # Lazy import to avoid slow TF startup unless needed
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout

    model = Sequential(
        [
            LSTM(
                128,
                return_sequences=True,
                input_shape=(SEQUENCE_LENGTH, n_features),
            ),
            Dropout(0.2),
            LSTM(64, return_sequences=False),
            Dropout(0.2),
            Dense(32, activation="relu"),
            Dense(1),
        ]
    )
    model.compile(optimizer="adam", loss="mse", metrics=["mae"])
    return model


def prepare_lstm_data(
    features_df: pd.DataFrame,
    residuals: pd.Series,
    seq_length: int = SEQUENCE_LENGTH,
) -> tuple[np.ndarray, np.ndarray, MinMaxScaler, MinMaxScaler]:
    """
    Prepare sequences for LSTM training.
    Returns: X, y, feature_scaler, target_scaler
    """
    feature_scaler = MinMaxScaler()
    target_scaler = MinMaxScaler()

    # Scale features
    feature_cols = [
        c for c in features_df.columns if c not in ["date", "close", "open", "high", "low", "volume"]
    ]
    scaled_features = feature_scaler.fit_transform(features_df[feature_cols].values)
    scaled_target = target_scaler.fit_transform(residuals.values.reshape(-1, 1))

    X, y = [], []
    for i in range(seq_length, len(scaled_features)):
        X.append(scaled_features[i - seq_length : i])
        y.append(scaled_target[i])

    return np.array(X), np.array(y), feature_scaler, target_scaler


def train_lstm(
    features_df: pd.DataFrame,
    residuals: pd.Series,
    epochs: int = 50,
    batch_size: int = 32,
    validation_split: float = 0.1,
):
    """
    Train LSTM on residuals with features.
    Returns: model, feature_scaler, target_scaler
    """
    X, y, feature_scaler, target_scaler = prepare_lstm_data(features_df, residuals)

    if len(X) < SEQUENCE_LENGTH + 10:
        logger.warning("Not enough data to train LSTM")
        return None, feature_scaler, target_scaler

    n_features = X.shape[2]
    model = _build_lstm_model(n_features)

    from tensorflow.keras.callbacks import EarlyStopping

    early_stop = EarlyStopping(
        monitor="val_loss", patience=5, restore_best_weights=True
    )

    model.fit(
        X,
        y,
        epochs=epochs,
        batch_size=batch_size,
        validation_split=validation_split,
        callbacks=[early_stop],
        verbose=0,
    )

    logger.info(f"LSTM trained on {len(X)} sequences")
    return model, feature_scaler, target_scaler


def predict_lstm_residual(
    model,
    recent_features: np.ndarray,
    feature_scaler: MinMaxScaler,
    target_scaler: MinMaxScaler,
) -> float:
    """Predict residual correction for the next step."""
    if model is None:
        return 0.0

    scaled = feature_scaler.transform(recent_features)
    X = scaled[-SEQUENCE_LENGTH:].reshape(1, SEQUENCE_LENGTH, -1)
    pred_scaled = model.predict(X, verbose=0)
    pred = target_scaler.inverse_transform(pred_scaled)
    return float(pred[0, 0])
