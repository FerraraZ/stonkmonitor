"""
Dome API client — unified prediction market data across Polymarket + Kalshi.

Docs: https://docs.domeapi.io

Only a few endpoints are needed for cross-platform arb:
  GET /v1/polymarket/markets?search=...&status=open     — metadata search
  GET /v1/polymarket/markets?market_slug=...            — single market
  GET /v1/kalshi/markets?...                            — Kalshi mirror w/ prices

Dome's Polymarket markets endpoint does NOT include live prices — those come
from the Polymarket CLOB directly (see feeds/polymarket.py). Dome is used
for metadata, search, and resolving condition_id / token_id values.
"""
import asyncio
import logging
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)


class DomeClient:
    def __init__(self, api_key: str, base_url: str = "https://api.domeapi.io"):
        self.api_key  = api_key
        self.base_url = base_url.rstrip("/")
        self._session: Optional[aiohttp.ClientSession] = None

    async def _ensure_session(self):
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=aiohttp.ClientTimeout(total=15),
            )

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def _get(self, path: str, params: Optional[dict] = None) -> dict:
        await self._ensure_session()
        url = f"{self.base_url}{path}"
        try:
            async with self._session.get(url, params=params) as r:
                if r.status != 200:
                    body = await r.text()
                    logger.warning(f"Dome {path} → {r.status}: {body[:200]}")
                    return {}
                return await r.json()
        except Exception as e:
            logger.warning(f"Dome {path} error: {e}")
            return {}

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    # ── Polymarket ────────────────────────────────────────────────────────
    async def polymarket_search(
        self,
        search: str,
        status: str = "open",
        limit: int = 10,
    ) -> list[dict]:
        """Full-text search Polymarket markets by keywords."""
        data = await self._get(
            "/v1/polymarket/markets",
            {"search": search, "status": status, "limit": limit},
        )
        return data.get("markets", [])

    async def polymarket_by_slug(self, market_slug: str) -> Optional[dict]:
        """Fetch a single Polymarket market by slug (returns first match)."""
        data = await self._get(
            "/v1/polymarket/markets",
            {"market_slug": market_slug},
        )
        markets = data.get("markets", [])
        return markets[0] if markets else None

    # ── Kalshi mirror (with prices!) ──────────────────────────────────────
    async def kalshi_markets(
        self,
        market_ticker: Optional[str] = None,
        event_ticker: Optional[str] = None,
        status: str = "open",
        limit: int = 100,
    ) -> list[dict]:
        params: dict = {"status": status, "limit": limit}
        if market_ticker: params["market_ticker"] = market_ticker
        if event_ticker:  params["event_ticker"]  = event_ticker
        data = await self._get("/v1/kalshi/markets", params)
        return data.get("markets", [])
