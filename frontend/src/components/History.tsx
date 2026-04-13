'use client'
import { useState, useEffect } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

interface PersistedSignal {
  id: number
  type: string
  ticker: string
  score: number
  side: string
  title: string
  description: string
  premium: number
  expiry: string | null
  strike: number | null
  option_type: string | null
  created_at: string
}

interface Stats {
  total: number
  elite: number
  high: number
  bull: number
  bear: number
  avg_score: number
  last_signal: string
}

interface TopTicker {
  ticker: string
  signal_count: number
  max_score: number
  avg_score: number
  bull_count: number
  bear_count: number
}

const SIDE_COLOR: Record<string, string> = {
  bullish: 'text-bull',
  bearish: 'text-bear',
  neutral: 'text-muted',
}

const TYPE_ICONS: Record<string, string> = {
  golden_sweep:   '⚡',
  sweep:          '🌊',
  options_flow:   '📊',
  dark_pool:      '🌑',
  insider_buy:    '👤',
  insider_sell:   '👤',
  congress_trade: '🏛️',
  iv_high:        '🔥',
  iv_low:         '❄️',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded p-3 text-center">
      <div className="text-lg font-bold text-accent">{value}</div>
      <div className="text-xs text-muted">{label}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

export function History() {
  const [signals, setSignals]       = useState<PersistedSignal[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [topTickers, setTopTickers] = useState<TopTicker[]>([])
  const [minScore, setMinScore]     = useState(7)
  const [ticker, setTicker]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [view, setView]             = useState<'signals' | 'tickers'>('signals')

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        min_score: String(minScore),
        limit: '100',
      })
      if (ticker) params.set('ticker', ticker.toUpperCase())

      const [sigRes, statsRes, topRes] = await Promise.all([
        fetch(`${API}/api/db/signals?${params}`),
        fetch(`${API}/api/db/signals/stats`),
        fetch(`${API}/api/db/signals/top-tickers?limit=10`),
      ])
      if (sigRes.ok)   setSignals(await sigRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
      if (topRes.ok)   setTopTickers(await topRes.json())
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [minScore, ticker])

  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Total Saved" value={stats.total} />
          <StatCard label="Elite (9+)" value={stats.elite} />
          <StatCard label="Avg Score" value={stats.avg_score?.toFixed(1) ?? '—'} />
          <StatCard label="Bull" value={stats.bull} />
          <StatCard label="Bear" value={stats.bear} />
          <StatCard label="High (7+)" value={stats.high} />
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2 items-center">
        <input
          className="w-24 bg-surface border border-border rounded px-2 py-1.5 text-xs text-text placeholder-muted uppercase"
          placeholder="Ticker"
          value={ticker}
          onChange={e => setTicker(e.target.value)}
        />
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-xs text-muted">Min:</span>
          <input
            type="range" min="0" max="10" step="0.5"
            value={minScore}
            onChange={e => setMinScore(parseFloat(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-xs text-accent w-6">{minScore}</span>
        </div>
        <button
          onClick={load}
          className="px-2 py-1.5 bg-accent/20 text-accent border border-accent/30 rounded text-xs hover:bg-accent/30"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1">
        {(['signals', 'tickers'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-1 rounded text-xs font-bold capitalize transition-colors ${
              view === v ? 'bg-accent text-bg' : 'bg-card text-muted border border-border'
            }`}
          >{v}</button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'signals' ? (
          <div>
            {signals.length === 0 && !loading && (
              <div className="text-muted text-xs text-center py-6">
                No signals saved yet — signals with score ≥ 7 persist automatically
              </div>
            )}
            {signals.map(s => (
              <div key={s.id}
                className={`border-l-2 ${
                  s.side === 'bullish' ? 'border-bull' :
                  s.side === 'bearish' ? 'border-bear' : 'border-muted'
                } bg-card rounded-r p-2.5 mb-1.5`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-text">
                    {TYPE_ICONS[s.type] ?? '📡'} {s.title}
                  </span>
                  <span className="text-xs text-muted font-mono ml-2 shrink-0">
                    {new Date(s.created_at).toLocaleDateString()} {new Date(s.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-xs text-muted mt-0.5">{s.description}</div>
                <div className="flex gap-3 mt-1 text-xs">
                  <span className={`font-bold ${SIDE_COLOR[s.side]}`}>
                    {s.side.toUpperCase()}
                  </span>
                  <span className={`font-bold ${s.score >= 9 ? 'text-gold' : s.score >= 7 ? 'text-bull' : 'text-accent'}`}>
                    ⬛ {s.score.toFixed(1)}/10
                  </span>
                  {s.premium > 0 && (
                    <span className="text-muted">${s.premium.toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {topTickers.map((t, i) => (
              <div key={t.ticker}
                className="flex items-center justify-between bg-card border border-border rounded p-2.5 mb-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs w-4">#{i + 1}</span>
                  <span className="font-bold text-text">{t.ticker}</span>
                  <span className="text-xs text-muted">{t.signal_count} signals</span>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-bull">↑{t.bull_count}</span>
                  <span className="text-bear">↓{t.bear_count}</span>
                  <span className="text-gold font-bold">{t.max_score.toFixed(1)} max</span>
                </div>
              </div>
            ))}
            {topTickers.length === 0 && (
              <div className="text-muted text-xs text-center py-6">
                No data yet — accumulates as signals come in
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
