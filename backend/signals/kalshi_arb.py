"""
Kalshi Internal Monotonicity Arbitrage Scanner

Strategy: Kalshi events contain groups of related markets ("above 3.0%",
"above 3.5%", "above 4.0%"). For mutually-consistent thresholds the prices
MUST be monotonic. When they're not — that's a pure mechanical arb.

Two violation types:

  1. MONOTONIC INVERSION
     "above $50k" at 60¢ but "above $60k" at 65¢ → inversion.
     Trade: SELL the richer side + BUY the cheaper side (or NO on the richer).

  2. SUM VIOLATION (for mutually-exclusive bracket sets)
     If a set of N mutually-exclusive buckets has Σ yes_ask < 0.98,
     you can buy ALL sides for under $1 and guarantee a payout of exactly $1.
     If Σ yes_bid > 1.02, you can sell all sides for over $1.

Kalshi taxonomy:
  event_ticker groups related markets. We group scanned markets by event,
  then run threshold extraction + sanity checks on each group.

Threshold regex coverage (start narrow, expand as we see data):
  - "above $X"           → upper-bound open
  - "at or above $X"     → upper-bound inclusive
  - "below $X"           → lower-bound open
  - "between $X and $Y"  → range
  - "$X or more"         → upper-bound inclusive
  - raw percentages and basis points for rates
"""
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Match numeric threshold in market title. Handles $1000, $1,000.50, 3.5%, 100000.
# Order matters: longest-match alternatives first to avoid greedy truncation
# (e.g. "100000" must match as one number, not 3 chars + rest).
_NUM = r"(\d+(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"

# Patterns ordered by specificity — first match wins per title
_PATTERNS = [
    # "Between $X and $Y" — not a threshold, skip from monotonic check
    (re.compile(rf"between\s+\$?{_NUM}\s+and\s+\$?{_NUM}", re.I), "range"),
    # "at least $X", "at or above $X"
    (re.compile(rf"(?:at\s+least|at\s+or\s+above)\s+\$?{_NUM}", re.I), "above"),
    # "above $X", "greater than X", ">=X", "over X", "more than X"
    (re.compile(rf"(?:above|greater\s+than|over|more\s+than|>=|≥|>)\s+\$?{_NUM}", re.I), "above"),
    # "X or more", "X+"
    (re.compile(rf"\$?{_NUM}\s*(?:\+|or\s+more)", re.I), "above"),
    # "at or below $X"
    (re.compile(rf"at\s+or\s+below\s+\$?{_NUM}", re.I), "below"),
    # "below X", "under X", "less than X", "<=X", "<X"
    (re.compile(rf"(?:below|under|less\s+than|<=|≤|<)\s+\$?{_NUM}", re.I), "below"),
    # "before X", "by end of X" — cumulative date markets behave like 'below X'.
    # NOTE: bare "by X" is deliberately NOT supported because it's ambiguous
    # ("increase by $400B" vs "by 2027" — same preposition, different meaning).
    (re.compile(rf"(?:before|by\s+end\s+of)\s+\$?{_NUM}", re.I), "below"),
]


def _normalize_prefix(title: str) -> str:
    """
    Strip numbers, currency, punctuation; collapse whitespace; lowercase.
    Two market titles that differ only in their threshold will normalize
    to the same string. Different candidates / outcomes normalize differently.
    Used to guarantee we only compare monotonic siblings.
    """
    if not title:
        return ""
    t = re.sub(r"\$?\d+(?:[,.\d]*)?%?", "", title.lower())
    t = re.sub(r"[^a-z\s]", " ", t)
    return " ".join(t.split())


def _parse_threshold(title: str) -> Optional[tuple[float, str]]:
    """Return (threshold_value, direction) or None. direction in {'above','below','range'}."""
    if not title:
        return None
    for pattern, direction in _PATTERNS:
        m = pattern.search(title)
        if m:
            try:
                # Take first numeric group that isn't None
                for g in m.groups():
                    if g:
                        val = float(g.replace(",", ""))
                        return val, direction
            except (ValueError, IndexError):
                continue
    return None


@dataclass
class ArbOpportunity:
    event_ticker: str
    event_title: str
    arb_type: str          # "monotonic_inversion" | "sum_violation_under" | "sum_violation_over"
    markets: list[dict]    # involved market dicts
    edge: float            # absolute $ edge per unit
    rationale: str

    def score(self) -> float:
        # Monotonic inversions — score by edge size
        base = 6.0 + min(self.edge * 40, 4.0)  # 10¢ edge ≈ 10.0
        return min(round(base, 2), 10.0)

    def to_dict(self) -> dict:
        return {
            "event_ticker": self.event_ticker,
            "event_title":  self.event_title,
            "arb_type":     self.arb_type,
            "markets": [
                {
                    "ticker": m.get("ticker"),
                    "title":  (m.get("title") or "")[:80],
                    "yes_ask": round(float(m.get("yes_ask_dollars") or 0), 4),
                    "yes_bid": round(float(m.get("yes_bid_dollars") or 0), 4),
                }
                for m in self.markets
            ],
            "edge":      round(self.edge, 4),
            "edge_cents": round(self.edge * 100, 2),
            "rationale": self.rationale,
            "score":     self.score(),
        }


class KalshiArbScanner:
    def __init__(self, settings=None):
        self.settings = settings

    def scan(self, markets: list[dict]) -> list[ArbOpportunity]:
        # Group by event_ticker
        by_event: dict[str, list[dict]] = {}
        for m in markets:
            ev = m.get("event_ticker") or ""
            if not ev:
                continue
            ya = float(m.get("yes_ask_dollars") or 0)
            if ya <= 0:
                continue
            by_event.setdefault(ev, []).append(m)

        opps: list[ArbOpportunity] = []

        for event_ticker, group in by_event.items():
            if len(group) < 2:
                continue

            # Parse each market and also compute its normalized-prefix
            # so we only compare siblings that are truly the same question
            # just with different thresholds (not different candidates).
            parsed = []
            for m in group:
                title = m.get("title") or ""
                thr = _parse_threshold(title)
                if thr and thr[1] in ("above", "below"):
                    parsed.append((thr[0], thr[1], m, _normalize_prefix(title)))

            event_title = group[0].get("event_title") or event_ticker

            # Group by (direction, normalized_prefix) so "Janet Mills" markets
            # never get compared to "Graham Platner" markets.
            by_key: dict[tuple[str, str], list[tuple[float, str, dict]]] = {}
            for thr_val, direction, mkt, prefix in parsed:
                key = (direction, prefix)
                by_key.setdefault(key, []).append((thr_val, direction, mkt))

            for (direction, _prefix), siblings in by_key.items():
                if len(siblings) < 2:
                    continue
                siblings.sort(key=lambda x: x[0])
                opps.extend(self._check_monotonic(event_ticker, event_title, siblings, direction))

            # Sum-violation check is DISABLED: without MECE metadata from
            # Kalshi it fires on cumulative brackets (e.g. "retire before
            # 2027/28/29" → legitimately sums >1 because they're not
            # mutually exclusive). The method is kept below for manual
            # use but no longer runs automatically.

        opps.sort(key=lambda x: x.score(), reverse=True)
        return opps

    def _check_monotonic(
        self,
        event_ticker: str,
        event_title: str,
        sorted_parsed: list[tuple[float, str, dict]],
        direction: str,
    ) -> list[ArbOpportunity]:
        """
        For "above X" ordered ascending by X: yes_ask[i] MUST be >= yes_ask[i+1].
        For "below X" ordered ascending by X: yes_ask[i] MUST be <= yes_ask[i+1].
        """
        opps: list[ArbOpportunity] = []
        if len(sorted_parsed) < 2:
            return opps

        for i in range(len(sorted_parsed) - 1):
            thr_lo, _, mlo = sorted_parsed[i]
            thr_hi, _, mhi = sorted_parsed[i + 1]
            if thr_hi == thr_lo:
                continue

            ya_lo = float(mlo.get("yes_ask_dollars") or 0)
            ya_hi = float(mhi.get("yes_ask_dollars") or 0)
            yb_lo = float(mlo.get("yes_bid_dollars") or 0)
            yb_hi = float(mhi.get("yes_bid_dollars") or 0)

            # Guard: require both legs have tight spreads and non-zero bids.
            # Wide spreads (e.g. ask 100¢ / bid 0¢) are stale quotes, not arb.
            if (ya_lo - yb_lo) > 0.10 or (ya_hi - yb_hi) > 0.10:
                continue
            if yb_lo <= 0 or yb_hi <= 0:
                continue

            if direction == "above":
                # lo threshold should be MORE expensive than hi — invert if not
                # Conservative edge = yb_hi - ya_lo (sell rich @ bid, buy cheap @ ask)
                if yb_hi > ya_lo and yb_hi > 0 and ya_lo > 0:
                    edge = yb_hi - ya_lo
                    if edge >= 0.03:  # 3¢ minimum to avoid noise
                        opps.append(ArbOpportunity(
                            event_ticker=event_ticker,
                            event_title=event_title[:80],
                            arb_type="monotonic_inversion",
                            markets=[mlo, mhi],
                            edge=edge,
                            rationale=(
                                f"MONOTONIC INVERSION: "
                                f"'>{thr_lo:g}' YES@{ya_lo*100:.0f}¢ vs "
                                f"'>{thr_hi:g}' YES@{ya_hi*100:.0f}¢ "
                                f"(bid {yb_hi*100:.0f}¢) | "
                                f"Sell high-threshold @ bid, Buy low-threshold @ ask, "
                                f"Edge {edge*100:.1f}¢"
                            ),
                        ))
            else:  # below
                if yb_lo > ya_hi and yb_lo > 0 and ya_hi > 0:
                    edge = yb_lo - ya_hi
                    if edge >= 0.03:
                        opps.append(ArbOpportunity(
                            event_ticker=event_ticker,
                            event_title=event_title[:80],
                            arb_type="monotonic_inversion",
                            markets=[mlo, mhi],
                            edge=edge,
                            rationale=(
                                f"MONOTONIC INVERSION: "
                                f"'<{thr_lo:g}' YES@{ya_lo*100:.0f}¢ (bid {yb_lo*100:.0f}¢) vs "
                                f"'<{thr_hi:g}' YES@{ya_hi*100:.0f}¢ | "
                                f"Edge {edge*100:.1f}¢"
                            ),
                        ))

        return opps

    def _check_sum_violation(
        self,
        event_ticker: str,
        event_title: str,
        group: list[dict],
    ) -> list[ArbOpportunity]:
        """
        If a set of markets is mutually exclusive & collectively exhaustive
        (MECE), their YES prices must sum to $1. Detect by checking event
        structure hints — for now, require explicit MECE flag or fallback
        to a conservative sum-under-0.95 flag (strong arb signal).
        """
        opps: list[ArbOpportunity] = []

        # Only trust this check if the titles look like a bucket set
        # (e.g., each market has a unique threshold / range / name)
        sum_ask = sum(float(m.get("yes_ask_dollars") or 0) for m in group)
        sum_bid = sum(float(m.get("yes_bid_dollars") or 0) for m in group)

        # Under-sum: buy all sides for < $1 → guaranteed profit if MECE
        if 0 < sum_ask < 0.95 and all(
            float(m.get("yes_ask_dollars") or 0) > 0 for m in group
        ):
            edge = 1.0 - sum_ask
            opps.append(ArbOpportunity(
                event_ticker=event_ticker,
                event_title=event_title[:80],
                arb_type="sum_violation_under",
                markets=group,
                edge=edge,
                rationale=(
                    f"SUM VIOLATION: {len(group)} markets YES sum {sum_ask*100:.0f}¢ < 100¢ | "
                    f"If MECE, buy all sides → guaranteed ${edge:.2f}/contract | "
                    f"VERIFY mutual exclusivity before trading"
                ),
            ))

        # Over-sum bid: sell all sides for > $1
        if sum_bid > 1.05:
            edge = sum_bid - 1.0
            opps.append(ArbOpportunity(
                event_ticker=event_ticker,
                event_title=event_title[:80],
                arb_type="sum_violation_over",
                markets=group,
                edge=edge,
                rationale=(
                    f"SUM VIOLATION: {len(group)} markets YES bid sum {sum_bid*100:.0f}¢ > 100¢ | "
                    f"If MECE, sell all sides → guaranteed ${edge:.2f}/contract"
                ),
            ))

        return opps
