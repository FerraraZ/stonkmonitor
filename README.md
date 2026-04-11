# ⚡ StonkMonitor

A real-time stock market signal monitor and semi-automated trader. Tracks unusual options flow, dark pool prints, insider trades, and congressional disclosures — scoring every signal 1–10 and alerting you on your phone via Telegram with **one-tap trade execution** through Alpaca.

![dark terminal dashboard](https://img.shields.io/badge/UI-dark%20terminal-00ff88?style=flat-square) ![python](https://img.shields.io/badge/backend-Python%203.13-3776AB?style=flat-square&logo=python) ![nextjs](https://img.shields.io/badge/frontend-Next.js%2014-black?style=flat-square&logo=next.js) ![alpaca](https://img.shields.io/badge/broker-Alpaca-FFCE00?style=flat-square)

---

## What it does

| Feed | Source | What it catches |
|------|--------|----------------|
| **Options Flow** | Unusual Whales | Sweeps, golden sweeps, large block bets |
| **Dark Pool** | Unusual Whales | Large institutional off-exchange prints |
| **Insider Trades** | Unusual Whales | Open-market buys/sells by officers & directors |
| **Congress Trades** | Unusual Whales | Congressional disclosures (STOCK Act filings) |

### Signal scoring
Every event is scored **1–10** based on premium size, sweep type, insider role, Vol/OI ratio, and IV conviction. Scores ≥ 8.5 trigger the auto-trade engine.

### Pattern engine (9 cross-feed patterns)
Correlates signals across feeds for the same ticker:
- `triple_confluence` — sweep + dark pool + insider (score 10.0)
- `insider_buy_plus_sweep` — CEO buying + sweep (9.5)
- `sweep_plus_darkpool` — institutions loading derivatives AND shares (9.0)
- `golden_sweep_cluster` — 2+ golden sweeps in 3 days (9.0)
- `insider_cluster_buy` — 3+ insiders buying (9.0)
- `congress_plus_sweep` — congress buy + sweep (8.5)
- `size_sweep` — single sweep >$1M (8.5)
- `congress_plus_darkpool` — congress + dark pool (8.0)
- `size_darkpool` — single dark pool print >$10M (8.0)

### Auto-trade flow
```
Signal ≥ 8.5 or Pattern ≥ 9.0
        ↓
Auto-Trade Engine
  • fetches live bid/ask from Alpaca
  • sizes position (2% equity, max $2,500)
  • DTE guard (2–21 days for options)
        ↓
Telegram card on your phone
  [✅ EXECUTE $840]  [❌ SKIP]
        ↓ tap
Alpaca limit order placed instantly
```

---

## Stack

```
backend/          FastAPI + uvicorn (Python 3.13)
  feeds/          Unusual Whales REST polling (15s interval)
  signals/        Signal engine, pattern engine, auto-trade engine
  notifications/  Discord webhooks, Pushover, Telegram bot
  trading/        Alpaca SDK (paper + live)
  db.py           SQLite via aiosqlite (6 tables)
  main.py         App entrypoint + WebSocket broadcast

frontend/         Next.js 14 + Tailwind CSS
  components/     SignalFeed, Watchlist, History, Analytics, TradeQueue
```

---

## Quick start

### Prerequisites
- Python 3.11+
- Node.js 18+
- [Unusual Whales API key](https://unusualwhales.com) (paid)
- [Alpaca account](https://alpaca.markets) (free paper trading)
- Telegram bot token from [@BotFather](https://t.me/BotFather)

### 1. Clone & configure

```bash
git clone https://github.com/YOUR_USERNAME/stonkmonitor
cd stonkmonitor

cp backend/.env.example backend/.env
# Edit backend/.env with your keys
```

### 2. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Activate Telegram
Open Telegram → find your bot → send `/start`  
The bot replies instantly and your chat_id is auto-registered. Next qualifying trade alert goes straight to your phone.

---

## Configuration

All thresholds are in `backend/.env` — no code changes needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_PREMIUM_ALERT` | 50000 | Min options premium ($) to process |
| `SWEEP_SCORE_THRESHOLD` | 7.0 | Min score to send Discord/Pushover notification |
| `AUTO_TRADE_SCORE_THRESHOLD` | 8.5 | Min score to queue auto-trade |
| `AUTO_TRADE_MAX_RISK_PCT` | 0.02 | Max % of equity per trade |
| `AUTO_TRADE_MAX_RISK_USD` | 2500 | Hard cap $ per trade |
| `AUTO_TRADE_MIN_DTE` | 2 | Min days to expiry (options) |
| `AUTO_TRADE_MAX_DTE` | 21 | Max days to expiry |

---

## Dashboard tabs

| Tab | What's there |
|-----|-------------|
| **📡 Watch** | Live signal feed with filter by type + min score slider |
| **🗄️ History** | Persisted signals from DB, top tickers leaderboard |
| **🎯 Patterns** | Pattern hits with evidence, ticker deep-dives |
| **💹 Trade** | Auto-trade queue with countdown + confirm/skip, trade history |

---

## Disclaimer

This is a personal research tool, not financial advice. Auto-trading real money carries significant risk. Always start with **paper trading** (`ALPACA_PAPER=true`) and understand every trade before going live.
