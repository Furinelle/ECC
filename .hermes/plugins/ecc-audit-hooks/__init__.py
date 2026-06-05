"""Privacy-preserving ECC audit hooks for Hermes Agent.

This plugin records event metadata only. It intentionally does not persist
terminal commands, tool argument values, model prompts/responses, file
contents, approval command text, or environment variables.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

_LOCK = threading.Lock()
_MAX_ARG_KEYS = 30
_DEFAULT_TAIL = 20
_MAX_TAIL = 200


def _hermes_home() -> Path:
    configured = os.environ.get("HERMES_HOME", "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".hermes"


def _log_path() -> Path:
    return _hermes_home() / "logs" / "ecc-audit.jsonl"


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_string(value: Any, max_length: int = 120) -> str:
    text = str(value or "").replace("\n", " ").replace("\r", " ").strip()
    return text[:max_length]


def _safe_names(values: Optional[Iterable[Any]], limit: int = 30) -> list[str]:
    if not values:
        return []
    result = []
    for value in values:
        name = _safe_string(value, 80)
        if name and name not in result:
            result.append(name)
        if len(result) >= limit:
            break
    return result


def _result_metadata(result: Any) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {
        "result_type": type(result).__name__,
    }
    if isinstance(result, (str, bytes, list, tuple, dict)):
        metadata["result_size"] = len(result)
    if isinstance(result, dict):
        metadata["reported_error"] = bool(result.get("error"))
        metadata["result_keys"] = _safe_names(result.keys(), 20)
    elif isinstance(result, str):
        lowered = result[:500].lower()
        metadata["reported_error"] = '"error"' in lowered or lowered.startswith("error")
    return metadata


def _append_event(event: str, **payload: Any) -> None:
    record = {
        "schema": "ecc.hermes.audit.v1",
        "timestamp": _timestamp(),
        "event": event,
        **payload,
    }
    path = _log_path()
    try:
        with _LOCK:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=True, separators=(",", ":")))
                handle.write("\n")
    except Exception:
        # Observability must never block an agent session.
        return


def _session_fields(kwargs: Dict[str, Any]) -> Dict[str, str]:
    fields = {}
    for key in ("session_id", "task_id", "surface", "platform"):
        value = _safe_string(kwargs.get(key), 120)
        if value:
            fields[key] = value
    return fields


def _on_session_start(**kwargs: Any) -> None:
    _append_event("session_start", **_session_fields(kwargs))


def _on_session_end(
    completed: bool = True,
    interrupted: bool = False,
    **kwargs: Any,
) -> None:
    _append_event(
        "session_end",
        completed=bool(completed),
        interrupted=bool(interrupted),
        **_session_fields(kwargs),
    )


def _on_post_tool_call(
    tool_name: str = "",
    args: Optional[Dict[str, Any]] = None,
    result: Any = None,
    **kwargs: Any,
) -> None:
    arg_keys = _safe_names(args.keys(), _MAX_ARG_KEYS) if isinstance(args, dict) else []
    _append_event(
        "tool_call",
        tool_name=_safe_string(tool_name, 100),
        arg_keys=arg_keys,
        **_result_metadata(result),
        **_session_fields(kwargs),
    )


def _on_pre_approval_request(
    pattern_key: str = "",
    pattern_keys: Optional[Iterable[Any]] = None,
    **kwargs: Any,
) -> None:
    _append_event(
        "approval_request",
        pattern_key=_safe_string(pattern_key, 100),
        pattern_keys=_safe_names(pattern_keys, 20),
        **_session_fields(kwargs),
    )


def _on_post_approval_response(
    choice: str = "",
    pattern_key: str = "",
    pattern_keys: Optional[Iterable[Any]] = None,
    **kwargs: Any,
) -> None:
    _append_event(
        "approval_response",
        choice=_safe_string(choice, 30),
        pattern_key=_safe_string(pattern_key, 100),
        pattern_keys=_safe_names(pattern_keys, 20),
        **_session_fields(kwargs),
    )


def _tail_records(limit: int) -> list[dict]:
    path = _log_path()
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()[-limit:]
    except Exception:
        return []

    records = []
    for line in lines:
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            records.append(item)
    return records


def _format_record(record: dict) -> str:
    timestamp = _safe_string(record.get("timestamp"), 32)
    event = _safe_string(record.get("event"), 32)
    detail = ""
    if event == "tool_call":
        detail = _safe_string(record.get("tool_name"), 80)
    elif event == "approval_response":
        detail = _safe_string(record.get("choice"), 30)
    session = _safe_string(record.get("session_id"), 32)
    suffix = " ".join(value for value in (detail, f"session={session}" if session else "") if value)
    return f"{timestamp} {event}{(' ' + suffix) if suffix else ''}"


def _handle_slash(raw_args: str) -> str:
    parts = raw_args.strip().split()
    subcommand = parts[0].lower() if parts else "status"
    path = _log_path()

    if subcommand in {"help", "-h", "--help"}:
        return (
            "/ecc-audit status\n"
            "/ecc-audit tail [N]\n\n"
            "The log stores metadata only; command text, prompts, results, and file contents are excluded."
        )

    if subcommand == "status":
        records = _tail_records(_MAX_TAIL)
        size = path.stat().st_size if path.exists() else 0
        counts: Dict[str, int] = {}
        for record in records:
            event = _safe_string(record.get("event"), 40) or "unknown"
            counts[event] = counts.get(event, 0) + 1
        count_text = ", ".join(f"{key}={value}" for key, value in sorted(counts.items())) or "no events"
        return f"ECC audit log: {path}\nSize: {size} bytes\nRecent events: {count_text}"

    if subcommand == "tail":
        limit = _DEFAULT_TAIL
        if len(parts) > 1:
            try:
                limit = max(1, min(int(parts[1]), _MAX_TAIL))
            except ValueError:
                return "Usage: /ecc-audit tail [1-200]"
        records = _tail_records(limit)
        if not records:
            return f"No ECC audit events found at {path}."
        return "\n".join(_format_record(record) for record in records)

    return "Usage: /ecc-audit [status|tail [N]|help]"


def register(ctx: Any) -> None:
    ctx.register_hook("on_session_start", _on_session_start)
    ctx.register_hook("on_session_end", _on_session_end)
    ctx.register_hook("post_tool_call", _on_post_tool_call)
    ctx.register_hook("pre_approval_request", _on_pre_approval_request)
    ctx.register_hook("post_approval_response", _on_post_approval_response)
    ctx.register_command(
        "ecc-audit",
        handler=_handle_slash,
        description="Show privacy-preserving ECC activity audit metadata.",
        args_hint="status | tail [N]",
    )
