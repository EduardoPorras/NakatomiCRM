"""Workspace-scoped LAIROT tools on the existing native MCP transport.

No new listener. The host bridge remains on loopback and has a separate secret.
Credentials never appear in MCP arguments, descriptions or responses.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

from mcp.server.fastmcp import Context, FastMCP

from app.config import settings


def install_pulse_tools(mcp: FastMCP, principal_from_ctx, require_scopes):
    def call(ctx: Context, route: str, scopes: tuple[str, ...], query=None, body=None):
        principal, db = principal_from_ctx(ctx)
        try:
            if not settings.PULSE_WORKSPACE_ID or principal.workspace.id != settings.PULSE_WORKSPACE_ID:
                raise RuntimeError("Pulse no está habilitado para este workspace")
            require_scopes(principal, *scopes)
            principal_id = "key:" + principal.api_key.id if principal.api_key else "user:" + principal.user.id
        finally:
            db.close()
        base = settings.PULSE_API_URL.rstrip("/")
        parsed = urlparse(base)
        if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "host.docker.internal"):
            raise RuntimeError("El bridge Pulse requiere un destino local configurado")
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
            raise RuntimeError("Configuración de bridge inválida")
        try:
            key = Path(settings.PULSE_API_KEY_FILE).read_text().strip()
        except (OSError, ValueError):
            raise RuntimeError("La credencial privada del bridge Pulse no está disponible") from None
        if len(key) < 32:
            raise RuntimeError("Credencial de bridge Pulse inválida")
        url = base + "/api/agent/" + route
        if query:
            url += "?" + urlencode({k: v for k, v in query.items() if v is not None})
        headers = {"Authorization": "Bearer " + key, "X-ARM-Local": "1",
                   "X-ARM-Principal": principal_id, "Content-Type": "application/json"}
        if settings.PULSE_API_HOST:
            if settings.PULSE_API_HOST not in ("127.0.0.1:4320", "localhost:4320"):
                raise RuntimeError("Host de bridge no permitido")
            headers["Host"] = settings.PULSE_API_HOST
        request = Request(url, data=json.dumps(body).encode() if body is not None else None,
                          headers=headers, method="POST" if body is not None else "GET")
        try:
            with urlopen(request, timeout=15) as response:
                return json.load(response)
        except HTTPError as error:
            try:
                detail = json.loads(error.read(4096)).get("error", "Solicitud rechazada")
            except (ValueError, AttributeError):
                detail = "Solicitud rechazada"
            raise RuntimeError(f"Pulse ({error.code}): {detail}") from None
        except (URLError, TimeoutError, ValueError, OSError):
            raise RuntimeError("Pulse local no está disponible; abre el servidor maestro en el puerto 4320") from None

    @mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
    def pulse_context(ctx: Context, account_id: str = "lairot") -> dict:
        """Read the local LAIROT account, contact IDs and pending proposal count. Includes Nakatomi mappings where synchronized. No production/provider reads."""
        return call(ctx, "context", ("contacts:read", "tasks:read"), {"accountId": account_id})

    @mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
    def pulse_journey(ctx: Context, pulse_contact_id: str, account_id: str = "lairot") -> dict:
        """Read a contact's recorded clicks, pages, video/form steps, last observed step, bookings and outcomes. Get pulse_contact_id from pulse_context. Last event does not prove why someone left."""
        return call(ctx, "journey/" + quote(pulse_contact_id, safe=""),
                    ("contacts:read", "activities:read", "deals:read", "notes:read"), {"accountId": account_id})

    @mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
    def pulse_campaigns(ctx: Context, account_id: str = "lairot", model: str = "first",
                        from_date: str | None = None, to_date: str | None = None, channel: str = "all") -> dict:
        """Read the same attribution metrics as the Pulse UI, by first/last touch and account currency. Optional YYYY-MM-DD dates; channel all/paid/organic. Missing evidence stays null."""
        return call(ctx, "campaigns", ("contacts:read", "deals:read"),
                    {"accountId": account_id, "model": model, "from": from_date, "to": to_date, "channel": channel})

    @mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
    def pulse_proposals(ctx: Context, account_id: str = "lairot") -> dict:
        """Read pending/reviewed Pulse proposals and the human-approved tasks. Agents cannot approve their own proposals through this MCP."""
        return call(ctx, "proposals", ("contacts:read", "tasks:read"), {"accountId": account_id})

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True})
    def pulse_propose_followup(ctx: Context, pulse_contact_id: str, request_id: str, title: str,
                              reason: str, draft: str, account_id: str = "lairot") -> dict:
        """Create a PENDING local proposal for human review in LAIROT. Never sends email or books appointments. Supply a stable unique request_id (8-120 letters/digits/dot/dash/underscore); retries are idempotent, conflicting reuse rejected. Cite recorded evidence in reason; draft is editable by the reviewer."""
        return call(ctx, "proposals", ("contacts:read", "tasks:write"), body={
            "accountId": account_id, "contactId": pulse_contact_id, "requestId": request_id,
            "title": title, "reason": reason, "draft": draft})
