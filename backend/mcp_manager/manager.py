import asyncio
import logging
import os
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from agentscope.mcp import MCPClient, HttpMCPConfig, StdioMCPConfig

logger = logging.getLogger(__name__)

class MCPClientConfig(BaseModel):
    name: str
    transport: str  # "stdio" or "http"
    enabled: bool = True
    
    # HTTP specific
    url: Optional[str] = None
    headers: Optional[Dict[str, str]] = None
    
    # STDIO specific
    command: Optional[str] = None
    args: List[str] = []
    env: Dict[str, str] = {}
    cwd: Optional[str] = None

class MCPConfig(BaseModel):
    clients: Dict[str, MCPClientConfig] = {}


# ---------------------------------------------------------------------------
# Transport → mcp_config factory (遵循项目“减少 if”风格，使用映射表调度)
# ---------------------------------------------------------------------------

def _build_stdio_config(cfg: MCPClientConfig) -> StdioMCPConfig:
    if not cfg.command:
        raise ValueError("command is required for stdio transport")
    kwargs: Dict[str, Any] = {"command": cfg.command, "args": cfg.args}
    cfg.env and kwargs.update(env=cfg.env)
    cfg.cwd and kwargs.update(cwd=cfg.cwd)
    return StdioMCPConfig(**kwargs)


def _build_http_config(cfg: MCPClientConfig) -> HttpMCPConfig:
    if not cfg.url:
        raise ValueError("url is required for http transport")
    headers = {k: os.path.expandvars(v) for k, v in (cfg.headers or {}).items()}
    return HttpMCPConfig(url=cfg.url, headers=headers or None)


_TRANSPORT_BUILDERS = {
    "stdio": _build_stdio_config,
    "http": _build_http_config,
}


class MCPClientManager:
    """Manages MCP clients with hot-reload support.
    
    Handles lifecycle of MCP clients:
    - Initial loading
    - Runtime replacement with minimal locking
    - Reconnection/Recovery
    """
    def __init__(self):
        self._clients: Dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def init_from_config(self, config: MCPConfig) -> None:
        """Initialize clients from configuration."""
        logger.info("Initializing MCP clients from config")
        for key, client_config in config.clients.items():
            if not client_config.enabled:
                continue
            try:
                await self._add_client(key, client_config)
                logger.info(f"MCP client '{key}' initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize MCP client '{key}': {e}")

    async def get_clients(self) -> List[Any]:
        """Get all active MCP clients."""
        async with self._lock:
            return [c for c in self._clients.values() if c is not None]

    async def replace_client(self, key: str, client_config: MCPClientConfig, timeout: float = 60.0) -> None:
        """
        Replace or add a client with new configuration.
        Uses double-stage locking for minimal blocking:
        connect new (outside lock) -> swap + close old (inside lock)
        """
        logger.info(f"Connecting new MCP client: {key}")
        new_client = self._build_client(client_config)

        try:
            await asyncio.wait_for(new_client.connect(), timeout=timeout)
        except Exception as e:
            logger.error(f"Failed to connect MCP client '{key}': {e}")
            try:
                await new_client.close()
            except:
                pass
            raise

        async with self._lock:
            old_client = self._clients.get(key)
            self._clients[key] = new_client

            if old_client:
                logger.info(f"Closing old MCP client: {key}")
                try:
                    await old_client.close()
                except Exception as e:
                    logger.warning(f"Error closing old MCP client '{key}': {e}")

    async def _add_client(self, key: str, client_config: MCPClientConfig, timeout: float = 60.0) -> None:
        client = self._build_client(client_config)
        await asyncio.wait_for(client.connect(), timeout=timeout)
        async with self._lock:
            self._clients[key] = client

    async def close_all(self) -> None:
        async with self._lock:
            clients_snapshot = list(self._clients.items())
            self._clients.clear()

        for key, client in clients_snapshot:
            if client:
                try:
                    await client.close()
                except Exception as e:
                    logger.warning(f"Error closing MCP client '{key}': {e}")

    @staticmethod
    def _build_client(client_config: MCPClientConfig) -> Any:
        """Build a 2.0 MCPClient using the transport-specific config builder."""
        builder = _TRANSPORT_BUILDERS.get(client_config.transport)
        if not builder:
            raise ValueError(f"Unknown transport: {client_config.transport}")

        mcp_config = builder(client_config)
        client = MCPClient(
            name=client_config.name,
            is_stateful=True,
            mcp_config=mcp_config,
        )
        # 保留重建快照，供热重载 / 调试使用
        setattr(client, "_rebuild_info", client_config.model_dump())
        return client

