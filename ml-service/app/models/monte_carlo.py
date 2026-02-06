"""
Monte Carlo simulation for long-horizon fan charts.
Uses Geometric Brownian Motion calibrated to historical volatility.
"""

import numpy as np
import pandas as pd


def monte_carlo_simulation(
    last_price: float,
    annual_return: float,
    annual_volatility: float,
    days: int,
    n_simulations: int = 1000,
) -> dict:
    """
    Run Monte Carlo GBM simulation.
    Returns percentile scenarios.
    """
    dt = 1 / 252  # daily step
    mu = annual_return
    sigma = annual_volatility

    # Generate paths
    np.random.seed(42)
    Z = np.random.standard_normal((n_simulations, days))
    daily_returns = np.exp((mu - 0.5 * sigma**2) * dt + sigma * np.sqrt(dt) * Z)

    paths = np.zeros((n_simulations, days + 1))
    paths[:, 0] = last_price

    for t in range(1, days + 1):
        paths[:, t] = paths[:, t - 1] * daily_returns[:, t - 1]

    final_prices = paths[:, -1]

    return {
        "p10": float(np.percentile(final_prices, 10)),
        "p25": float(np.percentile(final_prices, 25)),
        "p50": float(np.percentile(final_prices, 50)),
        "p75": float(np.percentile(final_prices, 75)),
        "p90": float(np.percentile(final_prices, 90)),
        "mean": float(np.mean(final_prices)),
        "std": float(np.std(final_prices)),
    }
