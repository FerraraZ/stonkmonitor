"""
Cross-platform Kalshi ↔ Polymarket arbitrage scanner.

Strategy: Dome provides Polymarket metadata + condition/token IDs. We use
Dome to search for Polymarket markets that match high-volume Kalshi markets
by title keywords. Then we fetch live prices from the Polymarket CLOB
(public, no auth) and flag spreads ≥ MIN_EDGE.

A real arb requires BOTH markets to resolve on the same question. This is
never guaranteed automatically from title similarity — we surface candidates
with a `match_confidence` and require human review. The alert always shows
both market titles so the user can sanity-check before executing.

Key constraint: don't spam Dome. We scan at most TOP_N_KALSHI markets per
cycle (highest volume first) and cache matches by Kalshi ticker for 1 hour.
"""
import logging
import re
import time
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Optional

from feeds.dome import DomeClient
from feeds.polymarket import PolymarketClobClient

logger = logging.getLogger(__name__)

TOP_N_KALSHI       = 30       # max Kalshi markets to probe per scan
MATCH_CACHE_TTL    = 3600     # cache Dome match results 1h
MIN_KALSHI_VOL     = 10_000
MIN_POLY_VOL_WEEK  = 10_000


_STOPWORDS = {
    "will","the","a","an","is","be","by","on","in","at","to","of","for","and",
    "or","with","from","this","that","these","those","than","more","less",
    "during","before","after","over","under","reach","2025","2026","2027",
    "what","who","which","when","how","?", "kalshi",
}


def _keywords(text: str, n: int = 5) -> list[str]:
    words = re.findall(r"[A-Za-z][A-Za-z0-9]{2,}", text.lower())
    kept = [w for w in words if w not in _STOPWORDS]
    # Unique preserve order, cap at n
    seen = set()
    out = []
    for w in kept:
        if w not in seen:
            seen.add(w)
            out.append(w)
        if len(out) >= n:
            break
    return out


def _similarity(a: str, b: str) -> float:
    """
    Similarity 0.0–1.0 combining Jaccard on keywords and SequenceMatcher
    ratio on the sorted keyword stream. Jaccard alone is fooled by short
    queries ("win presidential election" matches anything presidential);
    combining with SequenceMatcher on the normalized stream penalizes
    titles where the unique content differs substantially.

    Short keyword sets (<3 words) are hard-capped at 0.5 so the caller
    always rejects them.
    """
    ka = _keywords(a, 20)
    kb = _keywords(b, 20)
    if not ka or not kb:
        return 0.0
    sa, sb = set(ka), set(kb)
    jac = len(sa & sb) / len(sa | sb)
    seq = SequenceMatcher(None, " ".join(sorted(ka)), " ".join(sorted(kb))).ratio()
    score = (jac + seq) / 2
    if len(ka) < 3 or len(kb) < 3:
        return min(score, 0.5)
    return score


@dataclass
class CrossArbOpportunity:
    kalshi_ticker: str
    kalshi_title: str
    kalshi_yes_ask: float
    kalshi_yes_bid: float
    poly_slug: str
    poly_title: str
    poly_yes_ask: Optional[float]
    poly_yes_bid: Optional[float]
    edge: float                # absolute spread (Polymarket yes_ask - Kalshi yes_bid, or inverse)
    direction: str             # "buy_kalshi_sell_poly" | "buy_poly_sell_kalshi"
    match_confidence: float    # 0-1
    kalshi_volume: float
    poly_volume_week: float
    rationale: str = ""

    def score(self) -> float:
        # Score = edge × confidence × volume factor
        edge_score = min(self.edge * 50, 5.0)  # 10¢ edge = 5.0
        conf_score = self.match_confidence * 3.0
        vol_score  = 1.0 if self.kalshi_volume > 100_000 else 0.5
        base = 5.0 + edge_score + conf_score + vol_score
        return min(round(base, 2), 10.0)

    def to_dict(self) -> dict:
        return {
            "kalshi_ticker":    self.kalshi_ticker,
            "kalshi_title":     self.kalshi_title[:80],
            "kalshi_yes_ask":   round(self.kalshi_yes_ask, 4),
            "kalshi_yes_bid":   round(self.kalshi_yes_bid, 4),
            "poly_slug":        self.poly_slug,
            "poly_title":       self.poly_title[:80],
            "poly_yes_ask":     round(self.poly_yes_ask, 4) if self.poly_yes_ask else None,
            "poly_yes_bid":     round(self.poly_yes_bid, 4) if self.poly_yes_bid else None,
            "edge":             round(self.edge, 4),
            "edge_cents":       round(self.edge * 100, 2),
            "direction":        self.direction,
            "match_confidence": round(self.match_confidence, 2),
            "kalshi_volume":    int(self.kalshi_volume),
            "poly_volume_week": int(self.poly_volume_week),
            "rationale":        self.rationale,
            "score":            self.score(),
        }


class KalshiPolyArbScanner:
    def __init__(
        self,
        dome: DomeClient,
        polymarket: PolymarketClobClient,
        min_edge: float = 0.05,
    ):
        self.dome       = dome
        self.polymarket = polymarket
        self.min_edge   = min_edge
        # Cache: kalshi_ticker → (ts, poly_market_dict_or_none)
        self._match_cache: dict[str, tuple[float, Optional[dict]]] = {}

    async def _find_poly_match(self, kalshi_title: str, kalshi_ticker: str) -> Optional[dict]:
        """Search Dome for a Polymarket market matching the Kalshi title."""
        now = time.time()
        cached = self._match_cache.get(kalshi_ticker)
        if cached and now - cached[0] < MATCH_CACHE_TTL:
            return cached[1]

        kw = _keywords(kalshi_title, 4)
        if len(kw) < 2:
            self._match_cache[kalshi_ticker] = (now, None)
            return None

        query = " ".join(kw)
        try:
            candidates = await self.dome.polymarket_search(query, status="open", limit=5)
        except Exception as e:
            logger.debug(f"Dome search failed for {kalshi_ticker}: {e}")
            candidates = []

        # Score candidates by title similarity, keep best if >= 0.4
        best = None
        best_sim = 0.0
        for c in candidates:
            sim = _similarity(kalshi_title, c.get("title") or "")
            if sim > best_sim:
                best_sim = sim
                best = c

        if best and best_sim >= 0.70:
            best["_match_sim"] = best_sim
            self._match_cache[kalshi_ticker] = (now, best)
            return best

        self._match_cache[kalshi_ticker] = (now, None)
        return None

    async def scan(self, kalshi_markets: list[dict]) -> list[CrossArbOpportunity]:
        if not self.dome.enabled:
            return []

        # Pick top candidates by volume
        candidates = [
            m for m in kalshi_markets
            if float(m.get("volume_fp") or 0) >= MIN_KALSHI_VOL
            and float(m.get("yes_ask_dollars") or 0) > 0
        ]
        candidates.sort(key=lambda m: float(m.get("volume_fp") or 0), reverse=True)
        candidates = candidates[:TOP_N_KALSHI]

        opps: list[CrossArbOpportunity] = []

        for km in candidates:
            try:
                ktitle  = km.get("title") or ""
                kticker = km.get("ticker") or ""
                kya     = float(km.get("yes_ask_dollars") or 0)
                kyb     = float(km.get("yes_bid_dollars") or 0)
                kvol    = float(km.get("volume_fp") or 0)

                poly = await self._find_poly_match(ktitle, kticker)
                if not poly:
                    continue

                pvol = float(poly.get("volume_1_week") or 0)
                if pvol < MIN_POLY_VOL_WEEK:
                    continue

                prices = await self.polymarket.get_yes_prices(poly)
                if not prices:
                    continue

                pya = prices.get("ask")
                pyb = prices.get("bid")
                if pya is None or pyb is None:
                    continue

                # Two edge directions:
                #  A) Polymarket YES cheaper than Kalshi YES bid → buy poly, sell kalshi
                #     edge = kyb - pya
                #  B) Kalshi YES cheaper than Polymarket YES bid → buy kalshi, sell poly
                #     edge = pyb - kya
                edge_a = kyb - pya
                edge_b = pyb - kya

                if edge_a >= self.min_edge:
                    direction = "buy_poly_sell_kalshi"
                    edge = edge_a
                elif edge_b >= self.min_edge:
                    direction = "buy_kalshi_sell_poly"
                    edge = edge_b
                else:
                    continue

                conf = float(poly.get("_match_sim", 0.5))

                opps.append(CrossArbOpportunity(
                    kalshi_ticker=kticker,
                    kalshi_title=ktitle,
                    kalshi_yes_ask=kya,
                    kalshi_yes_bid=kyb,
                    poly_slug=poly.get("market_slug") or "",
                    poly_title=poly.get("title") or "",
                    poly_yes_ask=pya,
                    poly_yes_bid=pyb,
                    edge=edge,
                    direction=direction,
                    match_confidence=conf,
                    kalshi_volume=kvol,
                    poly_volume_week=pvol,
                    rationale=(
                        f"CROSS-PLATFORM {direction.replace('_',' ').upper()} | "
                        f"K:{kya*100:.0f}/{kyb*100:.0f}¢ ↔ "
                        f"P:{pya*100:.0f}/{pyb*100:.0f}¢ | "
                        f"edge {edge*100:.1f}¢ | "
                        f"match {conf*100:.0f}% — VERIFY resolution criteria"
                    ),
                ))
            except Exception as e:
                logger.debug(f"cross-arb scan error {km.get('ticker','?')}: {e}")

        opps.sort(key=lambda x: x.score(), reverse=True)
        return opps
