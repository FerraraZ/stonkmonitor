# ⚡ StonkMonitor

A real-time market signal monitor and semi-automated trader across **two markets**: traditional equities/options via Alpaca and prediction markets via Kalshi. Ingests Unusual Whales live feed, scores every event 1–10, detects cross-feed patterns, and fires actionable Telegram alerts with one-tap execution.

![dark terminal dashboard](https://img.shields.io/badge/UI-dark%20terminal-00ff88?style=flat-square) ![python](https://img.shields.io/badge/backend-Python%203.13-3776AB?style=flat-square&logo=python) ![nextjs](https://img.shields.io/badge/frontend-Next.js%2014-black?style=flat-square&logo=next.js) ![alpaca](https://img.shields.io/badge/broker-Alpaca-FFCE00?style=flat-square) ![kalshi](https://img.shields.io/badge/predictions-Kalshi-8B5CF6?style=flat-square)

---

## What it does

### 📡 Market Signal Monitor (Unusual Whales feeds)

| Feed | What it catches |
|------|----------------|
| **Options Flow** | Sweeps, golden sweeps, large block bets |
| **Dark Pool** | Large institutional off-exchange prints |
| **Insider Trades** | Open-market buys/sells by officers & directors |
| **Congress Trades** | Congressional disclosures (STOCK Act filings) |

Every event is scored **1–10** based on premium size, sweep type, insider role, Vol/OI ratio, and IV conviction.

---

### 🧠 Pattern Engine (9 cross-feed patterns)

Correlates signals across all feeds for the same ticker within rolling time windows:

| Pattern | Score | What it means |
|---------|-------|---------------|
| `triple_confluence` | 10.0 | Sweep + dark pool + insider all aligned |
| `insider_buy_plus_sweep` | 9.5 | CEO open-market buy + bullish sweep |
| `sweep_plus_darkpool` | 9.0 | Institutions loading derivatives AND shares |
| `golden_sweep_cluster` | 9.0 | 2+ golden sweeps on same ticker in 3 days |
| `insider_cluster_buy` | 9.0 | 3+ insiders buying within 30 days |
| `congress_plus_sweep` | 8.5 | Congress buy + unusual options sweep |
| `size_sweep` | 8.5 | Single sweep > $1M |
| `congress_plus_darkpool` | 8.0 | Congress buy + dark pool accumulation |
| `size_darkpool` | 8.0 | Single dark pool print > $10M |

---

### 💹 Alpaca Auto-Trade Flow

```
Signal ≥ 8.5 or Pattern ≥ 9.0
        ↓
Auto-Trade Engine
  • fetches live bid/ask from Alpaca data API
  • builds OCC options symbol automatically
  • sizes position: min(2% equity, $2,500 hard cap)
  • DTE guard: rejects <2d or >21d expiries
        ↓
Telegram card on your phone
  [✅ EXECUTE $840]  [❌ SKIP]
        ↓ tap
Alpaca limit order placed instantly
```

---

### 🎰 Kalshi Prediction Market Scanner

Scans **all open Kalshi markets** (paginated, 1000+ markets) every 60 seconds. Surfaces four types of opportunities for human evaluation — the scanner doesn't claim to beat efficiently priced markets, it finds the *interesting* ones:

| Type | Criteria | Play |
|------|----------|------|
| 🔒 **Near Certain** | DTE ≤ 30d, price ≤ 5¢ or ≥ 95¢ | Buy cheap side for lotto upside on a catalyst, or farm near-guaranteed yield on the certain side |
| 🔥 **High Vol Extreme** | vol > 100k, price ≤ 8¢ or ≥ 92¢ | Crowd has made a strong call — fade or follow |
| 📈 **Mover** | price moved ≥ 8¢, vol > 10k | Momentum or mean-reversion on a catalyst |
| ⚖️ **Active** | vol > 500k, price 30–70¢ | Active debate — research and take a side |

**Telegram alert flow:**
```
Scanner finds score ≥ 7.0 opportunity
        ↓
Telegram card (1-hour cooldown per ticker)
  [✅ EXECUTE $X.XX]  [❌ SKIP]
        ↓ tap Execute
Kalshi limit order placed instantly
        ↓
Position registered for monitoring

Every 2 minutes:
  Price check on all held positions
  3x gain → [✅ SELL ALL]  [✂️ SELL HALF]  [🚫 HOLD]
  5x gain → alert again
  10x gain → 🚀 MOON alert
```

---

### 🎯 Earnings IV/RV Scanner

Runs on every watchlist ticker every 30 minutes. Adapted from a Yang-Zhang volatility calculator — identifies when options are expensive relative to realized vol with an inverted term structure (classic pre-earnings setup):

| Condition | Threshold | Meaning |
|-----------|-----------|---------|
| `avg_volume` | ≥ 1.5M (30d) | Enough liquidity to trade |
| `iv30_rv30` | ≥ 1.25 | IV is 25%+ above Yang-Zhang realized vol → rich premium |
| `ts_slope_0_45` | ≤ -0.00406 | Term structure inverted (front-month spike = earnings approaching) |

**All 3 pass → SELL_PREMIUM signal (score 8.0+)** → sell ATM straddle before earnings, collect IV crush.
**ts_slope + 1 other → CONSIDER signal (score 6.0)**

Yang-Zhang HV uses OHLC data (handles overnight gaps) — more accurate than close-to-close standard deviation.

---

## Stack

```
backend/
  feeds/
    unusual_whales.py   UW REST polling (sequential, 15s interval, 2s gap between channels)
    kalshi.py           Kalshi REST client (RSA-PSS signed, full pagination)
    alpaca_feed.py      Alpaca market data
  signals/
    engine.py           Signal scorer (1-10), all signal types
    patterns.py         Cross-feed pattern detector (9 patterns)
    auto_trade.py       Alpaca trade sizing + queue + execution
    kalshi_scanner.py   Prediction market opportunity surfacer
    earnings_scanner.py Yang-Zhang IV/RV earnings premium screener
  notifications/
    telegram.py         Bot with inline Execute/Skip/Sell buttons + long-poll
    discord.py          Rich embed webhooks
    pushover.py         Phone push notifications
  trading/
    alpaca_trader.py    Order execution (paper + live)
  db.py                 SQLite (7 tables via aiosqlite)
  main.py               FastAPI app + WebSocket broadcast + all background tasks
  config.py             Pydantic settings from .env

frontend/               Next.js 14 + Tailwind CSS (dark terminal theme)
  components/
    SignalFeed          Live scored signal stream (with Earnings filter)
    Analytics           Pattern hits + ticker deep-dives
    History             Persisted signal DB browser
    TradeQueue          Pending Alpaca trades with countdown timers
    TradePanel          Positions + manual order entry
    Watchlist           IV + earnings scanner watchlist
    KalshiPanel         Live Kalshi opportunities with execute buttons
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- [Unusual Whales API key](https://unusualwhales.com) (paid)
- [Alpaca account](https://alpaca.markets) (free paper trading)
- [Kalshi account + API key pair](https://kalshi.com/profile/api-keys) (optional)
- Telegram bot token from [@BotFather](https://t.me/BotFather) (optional but recommended)

### 1. Clone & configure

```bash
git clone https://github.com/franciscoa19/stonkmonitor
cd stonkmonitor

cp backend/.env.example backend/.env
# Edit backend/.env with your keys
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Telegram setup
1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → get token
2. Add token to `.env` as `TELEGRAM_BOT_TOKEN`
3. Open your bot in Telegram → send `/start`
4. Bot resolves your chat ID automatically on startup

### 5. Kalshi API key (optional)
1. Go to [kalshi.com/profile/api-keys](https://kalshi.com/profile/api-keys)
2. Generate a key pair → save private key as `backend/kalshi_private.pem`
3. Add to `.env`:
```env
KALSHI_KEY_ID=your-key-uuid
KALSHI_PRIVATE_KEY=/path/to/kalshi_private.pem
KALSHI_DEMO=false
```

---

## Configuration

All thresholds in `backend/.env` — no code changes needed:

### Signal / Alpaca
| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_PREMIUM_ALERT` | 50000 | Min options premium ($) to process |
| `SWEEP_SCORE_THRESHOLD` | 7.0 | Min score for Discord/Pushover alert |
| `AUTO_TRADE_SCORE_THRESHOLD` | 8.5 | Min score to queue Alpaca trade |
| `AUTO_TRADE_MAX_RISK_PCT` | 0.02 | Max % of equity per trade |
| `AUTO_TRADE_MAX_RISK_USD` | 2500 | Hard cap $ per trade |
| `AUTO_TRADE_MIN_DTE` | 2 | Min days to expiry |
| `AUTO_TRADE_MAX_DTE` | 21 | Max days to expiry (no LEAPS) |

### Kalshi
| Variable | Default | Description |
|----------|---------|-------------|
| `KALSHI_DEMO` | false | Use demo sandbox |
| `KALSHI_SCAN_INTERVAL` | 60 | Seconds between market scans |
| `KALSHI_MIN_EDGE` | 0.05 | Minimum probability edge (5%) |
| `KALSHI_MAX_BET_USD` | 500 | Hard cap $ per market |

---

## Dashboard Tabs

| Tab | What's there |
|-----|-------------|
| **📡 Watch** | Live signal feed — filter by type (Sweeps / Dark Pool / Insider / Congress / IV / Earnings) + min score slider |
| **🗄️ History** | Persisted signals from DB, top tickers leaderboard |
| **🎯 Patterns** | Pattern hits with evidence, ticker deep-dives |
| **💹 Trade** | Alpaca trade queue with countdown timers + trade history |
| **🎰 Kalshi** | Prediction market opportunities — filter by type, one-click execute |

---

## Telegram Alert Types

| Alert | Buttons | Action |
|-------|---------|--------|
| Alpaca trade | ✅ EXECUTE / ❌ SKIP | Places Alpaca limit order |
| Kalshi buy | ✅ EXECUTE / ❌ SKIP | Places Kalshi limit order |
| Kalshi position spike | ✅ SELL ALL / ✂️ SELL HALF / 🚫 HOLD | Sells contracts at current bid |

---

## Disclaimer

This is a personal research tool, not financial advice. Auto-trading real money carries significant risk. Always start with **paper trading** (`ALPACA_PAPER=true`) and Kalshi demo mode (`KALSHI_DEMO=true`) before going live. Past signal performance does not guarantee future results.
