"""
WebSocket manager — broadcasts signals to all connected frontend clients.
"""
import asyncio
import json
import logging
from typing import Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self.active: Set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)
        logger.info(f"WS client connected. Total: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)
        logger.info(f"WS client disconnected. Total: {len(self.active)}")

    async def broadcast(self, data: dict):
        """Send a dict to all connected clients."""
        if not self.active:
            return
        msg = json.dumps(data)
        dead = set()
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.active.discard(ws)

    async def broadcast_signal(self, signal_dict: dict):
        await self.broadcast({"type": "signal", "data": signal_dict})

    async def broadcast_feed(self, feed_type: str, event: dict):
        await self.broadcast({"type": "feed", "feed": feed_type, "data": event})

    async def broadcast_status(self, message: str):
        await self.broadcast({"type": "status", "message": message})


manager = ConnectionManager()
