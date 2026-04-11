'use client'
import { useState, useEffect, useCallback } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

interface PendingTrade {
  id: number
  ticker: string
  trade_type: 'option' | 'equity'
  symbol: string
  side: string
  option_type: string | null
  strike: number | null
  expiry: string | null
  dte: number | null
  qty: number
  limit_price: number
  risk_amount: number
  stop_pct: number
  target_pct: number
  score: number
  rationale: string
  status: string
  created_at: string
  expires_at: string
}

interface TradeHistoryItem extends PendingTrade {
  alpaca_order_id: string | null
  executed_at: string | null
}

function ScoreBar({ score }: { score: number }) {
  const filled = Math.round(score)
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-accent font-bold tabular-nums">{score.toFixed(1)}</span>
      <div className="flex gap-px">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className={`w-1.5 h-3 rounded-sm ${
              i < filled ? 'bg-accent' : 'bg-card'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    function tick() {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      setSecs(diff)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expiresAt])

  const mins = Math.floor(secs / 60)
  const s = secs % 60
  const urgent = secs < 60

  return (
    <span className={`text-xs tabular-nums font-bold ${urgent ? 'text-bear animate-pulse' : 'text-muted'}`}>
      {secs === 0 ? 'EXPIRED' : `${mins}:${s.toString().padStart(2, '0')}`}
    </span>
  )
}

function TradeCard({
  trade,
  onConfirm,
  onSkip,
  executing,
}: {
  trade: PendingTrade
  onConfirm: (id: number) => void
  onSkip: (id: number) => void
  executing: number | null
}) {
  const isOption = trade.trade_type === 'option'
  const isBull   = trade.side === 'bullish'
  const sideColor = isBull ? 'text-bull' : 'text-bear'
  const sideBorder = isBull ? 'border-bull/40' : 'border-bear/40'
  const typeLabel = isOption
    ? (trade.option_type === 'call' ? 'CALL' : 'PUT')
    : 'EQUITY'
  const typeColor = trade.option_type === 'call' ? 'text-bull' : trade.option_type === 'put' ? 'text-bear' : 'text-accent'

  return (
    <div className={`bg-card border ${sideBorder} rounded-lg p-3 flex flex-col gap-2`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className={`font-bold text-sm ${sideColor}`}>{trade.ticker}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded bg-card border border-border ${typeColor}`}>
              {typeLabel}
            </span>
            <span className="text-xs text-muted">{trade.trade_type}</span>
          </div>
          {isOption && (
            <div className="text-xs text-muted mt-0.5">
              <code className="text-accent/80 text-[10px]">{trade.symbol}</code>
            </div>
          )}
        </div>
        <Countdown expiresAt={trade.expires_at} />
      </div>

      {/* Contract details */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {isOption && (
          <>
            <div className="text-muted">Strike / Exp</div>
            <div className="text-text font-mono">
              ${trade.strike?.toFixed(0)} / {trade.expiry} <span className="text-muted">({trade.dte}d)</span>
            </div>
          </>
        )}
        <div className="text-muted">Qty</div>
        <div className="text-text font-mono">
          {trade.qty} {isOption ? 'contracts' : 'shares'} @ ${trade.limit_price.toFixed(2)}
        </div>
        <div className="text-muted">Risk / Target</div>
        <div className="font-mono">
          <span className="text-bear">${trade.risk_amount.toLocaleString()}</span>
          <span className="text-muted mx-1">/</span>
          <span className="text-bull">+{trade.target_pct.toFixed(0)}%</span>
          <span className="text-muted ml-1">stop -{trade.stop_pct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Score */}
      <ScoreBar score={trade.score} />

      {/* Rationale */}
      {trade.rationale && (
        <p className="text-muted text-[10px] leading-relaxed line-clamp-2">{trade.rationale}</p>
      )}

      {/* Buttons */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => onConfirm(trade.id)}
          disabled={executing === trade.id}
          className="flex-1 py-1.5 rounded text-xs font-bold bg-bull/20 text-bull border border-bull/40
                     hover:bg-bull/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {executing === trade.id ? '⏳ Placing...' : `✅ EXECUTE $${trade.risk_amount.toLocaleString()}`}
        </button>
        <button
          onClick={() => onSkip(trade.id)}
          disabled={executing === trade.id}
          className="px-3 py-1.5 rounded text-xs font-bold bg-card text-muted border border-border
                     hover:text-bear hover:border-bear/40 transition-colors"
        >
          ❌
        </button>
      </div>
    </div>
  )
}

function TradeHistoryRow({ trade }: { trade: TradeHistoryItem }) {
  const statusColor: Record<string, string> = {
    confirmed: 'text-bull',
    skipped:   'text-muted',
    expired:   'text-bear',
    failed:    'text-bear',
    pending:   'text-accent',
  }
  const isOption = trade.trade_type === 'option'
  const typeLabel = isOption
    ? (trade.option_type === 'call' ? 'CALL' : 'PUT')
    : 'EQ'

  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-text font-bold w-12 truncate">{trade.ticker}</span>
        <span className="text-muted">{typeLabel}</span>
        {trade.status === 'confirmed' && trade.alpaca_order_id && (
          <span className="text-muted font-mono text-[10px]">#{trade.alpaca_order_id.slice(0, 8)}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted">${trade.risk_amount.toLocaleString()}</span>
        <span className={`font-bold ${statusColor[trade.status] || 'text-muted'}`}>
          {trade.status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

export function TradeQueue() {
  const [pending, setPending]   = useState<PendingTrade[]>([])
  const [history, setHistory]   = useState<TradeHistoryItem[]>([])
  const [tab, setTab]           = useState<'queue' | 'history'>('queue')
  const [executing, setExecuting] = useState<number | null>(null)
  const [result, setResult]     = useState<{ id: number; msg: string; ok: boolean } | null>(null)

  const fetchQueue = useCallback(async () => {
    try {
      const [qRes, hRes] = await Promise.all([
        fetch(`${API}/api/trade/queue`),
        fetch(`${API}/api/trade/history?limit=30`),
      ])
      if (qRes.ok) setPending(await qRes.json())
      if (hRes.ok) setHistory(await hRes.json())
    } catch {}
  }, [])

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 10_000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  // Listen for live WS trade_queued events
  useEffect(() => {
    function handler(e: CustomEvent) {
      const msg = e.detail
      if (msg?.type === 'trade_queued') {
        setPending(prev => {
          if (prev.find(t => t.id === msg.data.id)) return prev
          return [msg.data, ...prev]
        })
      }
    }
    window.addEventListener('ws_message', handler as EventListener)
    return () => window.removeEventListener('ws_message', handler as EventListener)
  }, [])

  async function handleConfirm(id: number) {
    setExecuting(id)
    setResult(null)
    try {
      const res = await fetch(`${API}/api/trade/confirm/${id}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResult({ id, msg: `Order placed: ${data.id?.slice(0, 12)}`, ok: true })
        setPending(prev => prev.filter(t => t.id !== id))
        fetchQueue()
      } else {
        setResult({ id, msg: data.detail || 'Order failed', ok: false })
      }
    } catch (e) {
      setResult({ id, msg: 'Network error', ok: false })
    } finally {
      setExecuting(null)
      setTimeout(() => setResult(null), 8000)
    }
  }

  async function handleSkip(id: number) {
    try {
      await fetch(`${API}/api/trade/skip/${id}`, { method: 'POST' })
      setPending(prev => prev.filter(t => t.id !== id))
    } catch {}
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tab row */}
      <div className="flex gap-1">
        {(['queue', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${
              tab === t
                ? 'bg-accent text-bg'
                : 'bg-card text-muted border border-border hover:text-text'
            }`}
          >
            {t === 'queue'
              ? `🎯 Queue${pending.length ? ` (${pending.length})` : ''}`
              : '📋 History'}
          </button>
        ))}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`text-xs p-2 rounded border ${
          result.ok
            ? 'bg-bull/10 border-bull/40 text-bull'
            : 'bg-bear/10 border-bear/40 text-bear'
        }`}>
          {result.ok ? '✅ ' : '❌ '}{result.msg}
        </div>
      )}

      {tab === 'queue' && (
        <>
          {pending.length === 0 ? (
            <div className="text-center text-muted text-xs py-6">
              <div className="text-2xl mb-2">🎯</div>
              <div>No pending trade candidates</div>
              <div className="text-[10px] mt-1 opacity-60">
                Alerts appear here when signals hit threshold
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {pending.map(trade => (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  onConfirm={handleConfirm}
                  onSkip={handleSkip}
                  executing={executing}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'history' && (
        <div className="bg-card rounded border border-border p-2">
          <div className="text-xs font-bold text-muted mb-2">Recent Trades</div>
          {history.length === 0 ? (
            <div className="text-muted text-xs text-center py-3">No trade history yet</div>
          ) : (
            history.map(t => <TradeHistoryRow key={t.id} trade={t} />)
          )}
        </div>
      )}
    </div>
  )
}
