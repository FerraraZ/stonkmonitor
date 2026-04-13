'use client'
import { useState, useEffect, useCallback } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

// ── Types ────────────────────────────────────────────────────────────
interface DbStats { options_flow: number; dark_pool: number; insider_trades: number; congress_trades: number; signals: number; pattern_hits: number }
interface TopTicker { ticker: string; total_signals: number; max_score: number; avg_score: number; bull: number; bear: number; last_seen: string }
interface PatternHit { id: number; pattern_name: string; ticker: string; score: number; description: string; evidence: string; created_at: string }
interface TickerProfile { ticker: string; options_flow: any; dark_pool: any; insider_trades: any; congress_trades: any; signals: any; pattern_hits: any }

// ── Helpers ───────────────────────────────────────────────────────────
const PATTERN_LABELS: Record<string, string> = {
  sweep_plus_darkpool:    '⚡🌑 Sweep + Dark Pool',
  insider_buy_plus_sweep: '👤⚡ Insider Buy + Sweep',
  congress_plus_sweep:    '🏛️⚡ Congress + Sweep',
  insider_cluster_buy:    '👥 Insider Cluster Buy',
  congress_plus_darkpool: '🏛️🌑 Congress + Dark Pool',
  triple_confluence:      '🎯 Triple Confluence',
  golden_sweep_cluster:   '⚡⚡ Golden Sweep Cluster',
  size_sweep:             '💰 Size Sweep ($1M+)',
  size_darkpool:          '💰 Size Dark Pool ($10M+)',
}

function StatChip({ label, value, color = 'text-accent' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-card border border-border rounded p-2 text-center">
      <div className={`text-base font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  )
}

// ── DB Stats row ──────────────────────────────────────────────────────
function StatsRow({ stats }: { stats: DbStats | null }) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <StatChip label="Options Flow" value={stats.options_flow} color="text-bull" />
      <StatChip label="Dark Pool" value={stats.dark_pool} color="text-accent" />
      <StatChip label="Insider" value={stats.insider_trades} color="text-gold" />
      <StatChip label="Congress" value={stats.congress_trades} color="text-gold" />
      <StatChip label="Signals" value={stats.signals} color="text-bull" />
      <StatChip label="Patterns" value={stats.pattern_hits} color="text-bear" />
    </div>
  )
}

// ── Pattern hits list ─────────────────────────────────────────────────
function PatternList({ patterns }: { patterns: PatternHit[] }) {
  return (
    <div>
      {patterns.length === 0 && (
        <div className="text-muted text-xs text-center py-4">
          No pattern hits yet — accumulates as cross-signal confluence builds up
        </div>
      )}
      {patterns.map(p => {
        const evidence = (() => { try { return JSON.parse(p.evidence) } catch { return [] } })()
        return (
          <div key={p.id} className="bg-card border border-gold/30 rounded p-3 mb-2 ring-1 ring-gold/10">
            <div className="flex justify-between items-start mb-1">
              <span className="text-sm font-bold text-gold">
                {PATTERN_LABELS[p.pattern_name] ?? p.pattern_name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gold">{p.score.toFixed(1)}/10</span>
                <span className="text-xs text-accent font-bold">{p.ticker}</span>
              </div>
            </div>
            <div className="text-xs text-muted mb-1.5">{p.description}</div>
            {evidence.map((e: string, i: number) => (
              <div key={i} className="text-xs text-text/80 pl-2 border-l border-border">• {e}</div>
            ))}
            <div className="text-xs text-muted mt-1">
              {new Date(p.created_at).toLocaleString()}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Top tickers ───────────────────────────────────────────────────────
function TopTickers({ tickers, onSelect }: { tickers: TopTicker[]; onSelect: (t: string) => void }) {
  return (
    <div>
      {tickers.map((t, i) => (
        <button
          key={t.ticker}
          onClick={() => onSelect(t.ticker)}
          className="w-full flex items-center justify-between bg-card border border-border rounded p-2 mb-1.5 hover:border-accent/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <span className="text-muted text-xs w-4">#{i + 1}</span>
            <span className="font-bold text-text text-sm">{t.ticker}</span>
            <span className="text-xs text-muted">{t.total_signals} signals</span>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="text-bull">↑{t.bull}</span>
            <span className="text-bear">↓{t.bear}</span>
            <span className={`font-bold ${t.max_score >= 9 ? 'text-gold' : 'text-accent'}`}>
              {t.max_score.toFixed(1)}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Ticker deep-dive ──────────────────────────────────────────────────
function TickerProfile({ ticker, onBack }: { ticker: string; onBack: () => void }) {
  const [profile, setProfile] = useState<TickerProfile | null>(null)

  useEffect(() => {
    fetch(`${API}/api/db/ticker/${ticker}`)
      .then(r => r.json()).then(setProfile).catch(() => {})
  }, [ticker])

  if (!profile) return <div className="text-muted text-xs text-center py-4">Loading...</div>

  const of = profile.options_flow ?? {}
  const dp = profile.dark_pool ?? {}
  const it = profile.insider_trades ?? {}
  const ct = profile.congress_trades ?? {}
  const sig = profile.signals ?? {}
  const ph = profile.pattern_hits ?? {}

  return (
    <div>
      <button onClick={onBack} className="text-xs text-accent mb-3 hover:underline">← Back</button>
      <div className="text-lg font-bold text-text mb-3">{ticker} — Deep Dive</div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-card border border-border rounded p-2">
          <div className="text-xs text-muted mb-1">Options Flow</div>
          <div className="text-sm font-bold text-bull">{of.n ?? 0} alerts</div>
          <div className="text-xs text-muted">{of.calls ?? 0}C / {of.puts ?? 0}P</div>
          {of.max_prem > 0 && <div className="text-xs text-accent">Max: ${of.max_prem?.toLocaleString()}</div>}
        </div>
        <div className="bg-card border border-border rounded p-2">
          <div className="text-xs text-muted mb-1">Dark Pool</div>
          <div className="text-sm font-bold text-accent">{dp.n ?? 0} prints</div>
          {dp.total > 0 && <div className="text-xs text-muted">Total: ${dp.total?.toLocaleString()}</div>}
          {dp.max > 0 && <div className="text-xs text-muted">Max: ${dp.max?.toLocaleString()}</div>}
        </div>
        <div className="bg-card border border-border rounded p-2">
          <div className="text-xs text-muted mb-1">Insiders</div>
          <div className="text-sm font-bold text-gold">{it.n ?? 0} trades</div>
          <div className="text-xs text-bull">{it.buys ?? 0} buys</div>
          <div className="text-xs text-bear">{it.sells ?? 0} sells</div>
        </div>
        <div className="bg-card border border-border rounded p-2">
          <div className="text-xs text-muted mb-1">Congress</div>
          <div className="text-sm font-bold text-gold">{ct.n ?? 0} disclosures</div>
          <div className="text-xs text-bull">{ct.buys ?? 0} buys</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border border-border rounded p-2">
          <div className="text-xs text-muted mb-1">Signals</div>
          <div className="text-sm font-bold text-text">{sig.n ?? 0}</div>
          {sig.max_score > 0 && <div className="text-xs text-gold">Max: {sig.max_score?.toFixed(1)}</div>}
          {sig.avg_score > 0 && <div className="text-xs text-muted">Avg: {sig.avg_score?.toFixed(1)}</div>}
        </div>
        <div className="bg-card border border-border rounded p-2">
          <div className="text-xs text-muted mb-1">Pattern Hits</div>
          <div className={`text-sm font-bold ${ph.n > 0 ? 'text-gold' : 'text-muted'}`}>{ph.n ?? 0}</div>
          {ph.n > 0 && <div className="text-xs text-gold">Confluence detected</div>}
        </div>
      </div>
    </div>
  )
}

// ── Main Analytics component ──────────────────────────────────────────
type View = 'patterns' | 'tickers' | 'profile'

export function Analytics() {
  const [view, setView]           = useState<View>('patterns')
  const [stats, setStats]         = useState<DbStats | null>(null)
  const [patterns, setPatterns]   = useState<PatternHit[]>([])
  const [topTickers, setTopTickers] = useState<TopTicker[]>([])
  const [selectedTicker, setSelected] = useState<string | null>(null)
  const [days, setDays]           = useState(7)
  const [loading, setLoading]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [statsR, patternsR, tickersR] = await Promise.all([
        fetch(`${API}/api/db/stats`),
        fetch(`${API}/api/db/patterns?limit=30`),
        fetch(`${API}/api/db/top-tickers?days=${days}&limit=20`),
      ])
      if (statsR.ok)   setStats(await statsR.json())
      if (patternsR.ok) setPatterns(await patternsR.json())
      if (tickersR.ok) setTopTickers(await tickersR.json())
    } catch {}
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])

  // Listen for live pattern hits from WS
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail
      if (msg?.type === 'pattern') {
        setPatterns(prev => [{
          id: Date.now(), pattern_name: msg.data.pattern,
          ticker: msg.data.ticker, score: msg.data.score,
          description: msg.data.description,
          evidence: JSON.stringify(msg.data.evidence),
          created_at: msg.data.timestamp,
        }, ...prev].slice(0, 50))
      }
    }
    window.addEventListener('ws_message', handler)
    return () => window.removeEventListener('ws_message', handler)
  }, [])

  if (view === 'profile' && selectedTicker) {
    return <TickerProfile ticker={selectedTicker} onBack={() => setView('tickers')} />
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      {/* DB Stats */}
      <StatsRow stats={stats} />

      {/* Controls */}
      <div className="flex gap-1 items-center">
        {(['patterns', 'tickers'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-1 rounded text-xs font-bold capitalize transition-colors ${
              view === v ? 'bg-accent text-bg' : 'bg-card text-muted border border-border'
            }`}
          >
            {v === 'patterns' ? '🎯 Patterns' : '📊 Tickers'}
          </button>
        ))}
        {view === 'tickers' && (
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="bg-surface border border-border rounded px-2 py-1 text-xs text-muted"
          >
            <option value={1}>1d</option>
            <option value={7}>7d</option>
            <option value={30}>30d</option>
          </select>
        )}
        <button onClick={load}
          className="px-2 py-1 bg-accent/20 text-accent border border-accent/30 rounded text-xs"
        >
          {loading ? '...' : '↻'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'patterns' && <PatternList patterns={patterns} />}
        {view === 'tickers' && (
          <TopTickers
            tickers={topTickers}
            onSelect={t => { setSelected(t); setView('profile') }}
          />
        )}
      </div>
    </div>
  )
}
