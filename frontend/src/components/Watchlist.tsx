'use client'
import { useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL

interface IVData {
  iv_rank?: number
  iv_percentile?: number
}

export function Watchlist({
  tickers,
  onAdd,
  onRemove,
}: {
  tickers: string[]
  onAdd: (t: string) => void
  onRemove: (t: string) => void
}) {
  const [input, setInput] = useState('')
  const [ivData, setIvData] = useState<Record<string, IVData>>({})

  async function loadIV(ticker: string) {
    try {
      const res = await fetch(`${API}/api/iv/${ticker}`)
      const data = await res.json()
      setIvData(prev => ({ ...prev, [ticker]: data }))
    } catch {}
  }

  function handleAdd() {
    const t = input.toUpperCase().trim()
    if (t && !tickers.includes(t)) {
      onAdd(t)
      loadIV(t)
    }
    setInput('')
  }

  return (
    <div className="bg-card border border-border rounded p-3">
      <div className="text-xs text-muted mb-3 uppercase tracking-wider">Watchlist</div>
      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-sm text-text placeholder-muted"
          placeholder="Add ticker..."
          value={input}
          onChange={e => setInput(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          className="px-3 py-1.5 bg-accent/20 text-accent border border-accent/30 rounded text-sm hover:bg-accent/30 transition-colors"
        >
          +
        </button>
      </div>
      {tickers.length === 0 && (
        <div className="text-muted text-xs text-center py-2">No tickers added</div>
      )}
      {tickers.map(t => {
        const iv = ivData[t]
        const rank = iv?.iv_rank
        const rankColor =
          rank === undefined ? 'text-muted' :
          rank > 80 ? 'text-bear' :
          rank < 20 ? 'text-bull' : 'text-text'
        return (
          <div key={t} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
            <div>
              <span className="text-sm font-bold text-text">{t}</span>
              {iv && (
                <span className={`ml-2 text-xs ${rankColor}`}>
                  IV Rank: {rank?.toFixed(0) ?? '—'}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => loadIV(t)}
                className="text-xs text-muted hover:text-accent transition-colors"
              >
                ↻
              </button>
              <button
                onClick={() => onRemove(t)}
                className="text-xs text-muted hover:text-bear transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
