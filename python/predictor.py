"""
Crypto paper-trading prediction service.

The Node backend writes a JSON feature payload to stdin and expects a single
JSON object on stdout:

    {
      "prediction": "BUY" | "SELL",
      "buyProbability": 0.83,
      "sellProbability": 0.17,
      "confidence": 83
    }

Two modes are supported:

1. Trained model mode (recommended for real research):
   Place a scikit-learn compatible classifier at ``python/model.pkl`` (or point
   ``MODEL_PATH`` at it). The model must expose ``predict_proba`` and be trained
   on the feature order in ``FEATURE_ORDER``.

2. Deterministic baseline model (default):
   A transparent, dependency-free scoring model. It is intentionally simple so
   the trading stack works out of the box and can be replaced by a trained model
   without changing the Node contract.

This service NEVER talks to an exchange and never receives API keys.
"""

from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Dict

FEATURE_ORDER = [
    "currentPrice",
    "ema20",
    "ema50",
    "ema200",
    "rsi",
    "macd",
    "macdHistogram",
    "atr",
    "volume",
    "priceChangePct",
    "prevReturn1",
    "prevReturn2",
    "prevReturn3",
    "prevReturn4",
    "prevReturn5",
    "rollingAverage",
    "volatility",
    "volumeAverage",
]

_MODEL = None
_MODEL_PATH: Path | None = None


def _load_model():
    """Lazily load an optional trained scikit-learn model."""
    global _MODEL, _MODEL_PATH
    if _MODEL is not None:
        return _MODEL

    configured = os.environ.get("MODEL_PATH")
    candidate = Path(configured) if configured else Path(__file__).with_name("model.pkl")
    _MODEL_PATH = candidate

    if not candidate.exists():
        return None

    try:
        import joblib  # type: ignore

        _MODEL = joblib.load(candidate)
    except Exception as exc:  # pragma: no cover - depends on local environment
        print(f"warning: could not load model at {candidate}: {exc}", file=sys.stderr)
        _MODEL = None

    return _MODEL


def _num(features: Dict[str, Any], key: str, default: float = 0.0) -> float:
    value = features.get(key, default)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(number) or math.isinf(number):
        return default
    return number


def _sigmoid(value: float) -> float:
    return 1.0 / (1.0 + math.exp(-value))


def _heuristic(features: Dict[str, Any]) -> Dict[str, Any]:
    """Transparent baseline model combining trend, momentum and mean reversion."""
    current_price = _num(features, "currentPrice")
    ema20 = _num(features, "ema20", current_price)
    ema50 = _num(features, "ema50", current_price)
    ema200 = _num(features, "ema200", current_price)
    rsi = _num(features, "rsi", 50.0)
    macd_histogram = _num(features, "macdHistogram")
    price_change = _num(features, "priceChangePct")
    prev_return = _num(features, "prevReturn1")
    volatility = abs(_num(features, "volatility"))

    score = 0.0
    score += 1.4 if ema20 > ema50 else -1.4
    score += 1.0 if ema50 > ema200 else -1.0
    score += (50.0 - rsi) / 20.0
    score += 1.2 if macd_histogram > 0 else -1.2
    score += 0.9 if price_change > 0 else -0.9
    score += 0.6 if prev_return > 0 else -0.6

    # Mean-reversion emphasis: the strategy hunts oversold pullbacks in an uptrend.
    if rsi < 35.0:
        score += 1.3
    elif rsi > 65.0:
        score -= 1.3

    # Very high volatility reduces conviction.
    score -= min(volatility, 5.0) * 0.15

    buy_probability = _sigmoid(score / 1.4)
    return _finalize(buy_probability)


def _from_model(model, features: Dict[str, Any]) -> Dict[str, Any]:
    row = [[_num(features, key) for key in FEATURE_ORDER]]
    probabilities = model.predict_proba(row)[0]

    # Support binary classifiers whose positive class is BUY (class order is
    # discovered from ``classes_`` when available).
    classes = list(getattr(model, "classes_", [0, 1]))
    buy_index = classes.index(1) if 1 in classes else 1
    buy_probability = float(probabilities[buy_index])
    return _finalize(buy_probability)


def _finalize(buy_probability: float) -> Dict[str, Any]:
    buy_probability = max(0.02, min(0.98, buy_probability))
    sell_probability = 1.0 - buy_probability
    prediction = "BUY" if buy_probability >= sell_probability else "SELL"
    confidence = round(max(buy_probability, sell_probability) * 100.0, 2)

    return {
        "prediction": prediction,
        "buyProbability": round(buy_probability, 6),
        "sellProbability": round(sell_probability, 6),
        "confidence": confidence,
    }


def predict(payload: Dict[str, Any]) -> Dict[str, Any]:
    features = payload.get("features")
    if not isinstance(features, dict):
        raise ValueError("payload.features must be an object")

    model = _load_model()
    if model is not None:
        try:
            return _from_model(model, features)
        except Exception as exc:  # pragma: no cover - depends on local model
            print(f"warning: model inference failed, using baseline: {exc}", file=sys.stderr)

    return _heuristic(features)


def main() -> int:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            raise ValueError("empty stdin payload")
        payload = json.loads(raw)
        result = predict(payload)
        sys.stdout.write(json.dumps(result, separators=(",", ":")))
        return 0
    except Exception as exc:
        sys.stderr.write(f"prediction_error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
