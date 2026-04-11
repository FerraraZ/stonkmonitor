"""
Polymarket CLOB client — public, no auth required.

Used for live YES/NO price quotes on Polymarket markets. Dome provides
metadata + token_id mapping; this client fetches the actual orderbook
prices for arbitrage comparison with Kalshi.

Polymarket represents each outcome as a token_id. For a binary market,
side_a.id is the YES token and side_b.id is the NO token (or equivalent).
"""
import asyncio
import logging
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)


class PolymarketClobClient:
    def __init__(self, base_url: str = "https://clob.polymarket.com"):
        self.base_url = base_url.rstrip("/")
        self._session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self):
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=10)
            )

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def _get(self, path: str, params: Optional[dict] = None) -> Optional[dict]:
        await self._ensure_session()
        url = f"{self.base_url}{path}"
        try:
            async with self._session.get(url, params=params) as r:
                if r.status != 200:
                    return None
                return await r.json()
        except Exception as e:
            logger.debug(f"Polymarket CLOB {path} error: {e}")
            return None

    async def get_midpoint(self, token_id: str) -> Optional[float]:
        """Return midpoint price in dollars (0-1) for a token."""
        data = await self._get("/midpoint", {"token_id": token_id})
        if not data: return None
        try:
            return float(data.get("mid"))
        except (TypeError, ValueError):
            return None

    async def get_best_prices(self, token_id: str) -> Optional[dict]:
        """
        Return {bid, ask, mid} for a Polymarket token.

        Polymarket /price endpoint returns prices from a book-maker
        perspective:
          side=BUY  → the best BID price  (highest price a buyer is offering)
          side=SELL → the best ASK price  (lowest price a seller is asking)

        Validated against /midpoint (which returns (bid+ask)/2).
        """
        buy_task  = self._get("/price", {"token_id": token_id, "side": "BUY"})
        sell_task = self._get("/price", {"token_id": token_id, "side": "SELL"})
        mid_task  = self._get("/midpoint", {"token_id": token_id})
        buy, sell, mid = await asyncio.gather(buy_task, sell_task, mid_task)

        try:
            bid  = float(buy.get("price"))  if buy  and buy.get("price")  else None
            ask  = float(sell.get("price")) if sell and sell.get("price") else None
            midv = float(mid.get("mid"))    if mid  and mid.get("mid")    else None
        except (TypeError, ValueError):
            return None

        if ask is None and bid is None and midv is None:
            return None
        return {"bid": bid, "ask": ask, "mid": midv}

    async def get_yes_prices(self, market: dict) -> Optional[dict]:
        """
        Given a Dome Polymarket market dict (with side_a/side_b), fetch
        the YES-side prices. We assume side_a.label == "Yes" — Dome data
        consistently uses this convention.
        """
        side_a = market.get("side_a") or {}
        if str(side_a.get("label", "")).lower() != "yes":
            # Look for a side labelled Yes
            side_b = market.get("side_b") or {}
            if str(side_b.get("label", "")).lower() == "yes":
                side_a = side_b
            else:
                return None
        token_id = side_a.get("id")
        if not token_id:
            return None
        return await self.get_best_prices(str(token_id))
