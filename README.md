# Crypto Paper Trading Backend

Node.js + TypeScript backend for a **paper-only** crypto trading bot.

The server downloads public Coinbase klines, computes technical indicators, asks a
Python predictor for a signal, applies a deterministic RSI/EMA/AI strategy, and
simulates every trade against an internal SQLite wallet. **It never sends an
order to an exchange and never accepts exchange API keys.**

- Starting balance: **80 USD**
- Trade size: **10 USD**
- Fees: **0.1%** buy / **0.1%** sell
- Stop loss: **2%**, take profit: **3%**
- Default market: **BTC-USD**, **1m** candles

## Stack

- Express 4, TypeScript (strict)
- SQLite + Prisma
- `node-cron` scheduler (UTC)
- `technicalindicators` for EMA/RSI/MACD/ATR/Bollinger/volume average
- Python predictor over stdin/stdout, with an in-process heuristic fallback
- Node's built-in test runner

## How it works

```
Coinbase public REST ──> MarketService ──> candles
                                      │
                                      ▼
                              IndicatorService
                                      │
                                      ▼
                              PredictionService ──> python/predictor.py
                                      │                (fallback: heuristic)
                                      ▼
                              StrategyService (RSI + EMA trend + AI)
                                      │
                                      ▼
                              PaperTradingEngine ──> Wallet / Trade rows
                                      │
                                      ▼
                              REST API + Dashboard
```

A trading cycle runs every minute and only processes **closed** candles. The
`Settings.lastProcessedCandleAt` marker makes cycles idempotent.

### Strategy

`rsi-ema-ai`:

- **BUY** when `RSI < 35`, `EMA50 > EMA200`, and AI `BUY` confidence > 80.
- **SELL** when profit >= 3%, loss <= 2%, or AI returns `SELL`.
- One open paper position per symbol. A cycle never spends more than the
  available balance (notional + buy fee must fit).

### Wallet accounting

- `balance = available + invested`
- Opening a trade moves `notional + buyFee` from `available` into `invested`.
- Closing releases the cost basis and adds net profit; `fees` stores buy + sell.
- `profit` is gross; `netProfit` is after fees.
- `currentEquity` is mark-to-market, so unrealized PnL is included.

## Setup

Prerequisites: Node.js 20+, npm, and Python 3.10+ (only the standard library is
required by the baseline predictor).

```powershell
npm install
Copy-Item .env.example .env
npm run db:setup
```

`npm run db:setup` creates `prisma/dev.db` and pushes the schema. Adjust `.env`
as needed; all values have safe paper-trading defaults.

### Run

```powershell
npm run dev        # tsx watch
npm run build      # compile to dist/
npm start          # run dist/src/index.js
```

On boot the server connects to SQLite, initializes wallet/settings, seeds at
least 250 candles (or `HISTORY_CANDLES`) from Coinbase, rebuilds indicators, then
starts the scheduler when paper trading is enabled.

### Historical data

```powershell
npm run download:history -- 1500 BTC-USD 1
```

Arguments: `[totalCandles] [symbol] [interval]`. The script paginates Coinbase
klines (up to 350 per request), upserts them, and recomputes all indicators.

### Python predictor

`python/predictor.py` reads a JSON feature payload from stdin and writes:

```json
{ "prediction": "BUY", "buyProbability": 0.83, "sellProbability": 0.17, "confidence": 83 }
```

It uses a transparent built-in heuristic. To use a trained model, place a
scikit-learn classifier exposing `predict_proba` at `python/model.pkl` (or set
`MODEL_PATH`) and install the optional packages listed in
`python/requirements.txt`. If Python is missing, times out, or fails, the Node
process falls back to an equivalent in-process heuristic, so trading continues.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `4000` | HTTP port |
| `DATABASE_URL` | `file:./dev.db` | SQLite file (relative to `prisma/`) |
| `COINBASE_BASE_URL` | `https://api.coinbase.com` | Public market data base URL |
| `COINBASE_TIMEOUT_MS` | `15000` | HTTP timeout |
| `COINBASE_RETRIES` | `3` | Retry attempts for 5xx/network errors |
| `SYMBOL` | `BTC-USD` | Default Coinbase product id (`BTCUSDT` is normalized to `BTC-USD`) |
| `INTERVAL` | `1` | Candle interval in minutes |
| `STARTING_BALANCE` | `80` | Wallet seed balance (USDT) |
| `TRADE_SIZE` | `10` | Simulated notional per trade |
| `BUY_FEE` / `SELL_FEE` | `0.1` | Fee percent |
| `STOP_LOSS` / `TAKE_PROFIT` | `2` / `3` | Exit thresholds in percent |
| `PAPER_TRADING_ENABLED` | `true` | Start scheduler on boot |
| `RSI_BUY_THRESHOLD` | `35` | Entry RSI ceiling |
| `AI_CONFIDENCE_THRESHOLD` | `80` | Minimum AI BUY confidence |
| `STRATEGY_NAME` | `rsi-ema-ai` | Strategy registry key |
| `HISTORY_CANDLES` | `1000` | Boot seed target |
| `MARKET_LOOKBACK_CANDLES` | `400` | Indicator/prediction lookback |
| `PREDICTION_PYTHON` | `python` (`python3` on POSIX) | Python binary |
| `PREDICTION_SCRIPT` | `python/predictor.py` | Predictor path |
| `PREDICTION_TIMEOUT_MS` | `15000` | Predictor timeout |
| `CRON_EXPRESSION` | `* * * * *` | Cycle schedule (UTC) |
| `LOG_LEVEL` | `info` | `debug` also logs every HTTP request |
| `CORS_ORIGIN` | `*` | `*` or comma-separated origins |
| `API_PREFIX` | `/api` | Additional router mount |

Runtime settings (`symbol`, `interval`, thresholds, fees, trade size, paper
trading on/off) can be changed through `PUT /settings`; changes are stored in
SQLite. Changing symbol or interval clears the candle idempotency marker.

## API

All routes are mounted both at `/` and under `API_PREFIX` (default `/api`).

Success envelope:

```json
{ "success": true, "data": {}, "meta": {} }
```

Error envelope:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

### Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness, uptime, paper-only flag |
| GET | `/wallet` | Balance, equity, open position, live mark price |
| GET | `/candles` | Candles (`symbol`, `interval`, `from`, `to`, `limit`, `offset`, `order`) |
| GET | `/indicators` | Latest values or a paginated series |
| GET | `/trades` | Simulated trades (`status`, `symbol`, `limit`, `offset`, `order`) |
| GET | `/history` | `{ trades, equityCurve }` |
| GET | `/logs` | Persisted application logs |
| GET | `/prediction` | Latest prediction |
| GET | `/prediction/history` | Prediction history |
| GET | `/analytics` | Win rate, profit, drawdown, streaks, fees |
| GET | `/dashboard` | Wallet + position + prediction + latest market data |
| GET | `/strategy/status` | Current strategy settings and scheduler state |
| POST | `/strategy/start` | Enable paper trading and run one cycle immediately |
| POST | `/strategy/stop` | Disable paper trading and stop the scheduler |
| POST | `/backtest` | Run the strategy over stored candles |
| GET | `/settings` | Read runtime settings |
| PUT | `/settings` | Update runtime settings |

Examples:

```powershell
Invoke-RestMethod http://localhost:4000/dashboard

Invoke-RestMethod http://localhost:4000/backtest -Method Post `
  -ContentType 'application/json' `
  -Body '{"symbol":"BTC-USD","interval":"1","limit":1000}'

Invoke-RestMethod http://localhost:4000/settings -Method Put `
  -ContentType 'application/json' `
  -Body '{"rsiBuyThreshold":40,"maxTradeSize":12}'
```

`POST /backtest` accepts optional `symbol`, `interval`, `limit` (candles with
indicators, default 500), `startingBalance`, `tradeSize`, `buyFeePercent`,
`sellFeePercent`, `stopLossPercent`, `takeProfitPercent`,
`rsiBuyThreshold`, and `aiConfidenceThreshold`. It never writes trades or
wallet data. At least 21 indicator rows are required because the feature
builder needs a 20-period rolling window.

## Tests

```powershell
npm run typecheck
npm test
```

Tests cover indicator alignment and consistency, trade statistics/drawdown,
strategy entry/exit rules, and wallet math including fees.

## Safety guarantees

- No authenticated exchange client, API key, or order endpoint exists.
- All trades are rows in the local `trades` table with simulated fills.
- The only outbound calls are public Coinbase candle requests.
- The Python predictor receives features only, never credentials.
- `PAPER TRADING ONLY` is logged at boot and exposed by `/health`.

This software is for research and education. Simulated results do not imply
future performance and it is not financial advice.
