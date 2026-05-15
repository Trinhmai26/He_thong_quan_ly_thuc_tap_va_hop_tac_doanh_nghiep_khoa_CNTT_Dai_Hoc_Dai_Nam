from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


class ConfigError(ValueError):
    """Raised when the Zalo config file is missing or invalid."""


@dataclass(frozen=True)
class ZaloConfig:
    imei: str
    session_cookies: Dict[str, Any]
    phone: str = "cookie_login"
    password: str = "cookie_login"
    user_agent: Optional[str] = None
    api_key: Optional[str] = None
    secret_key_configured: bool = False
    secret_key: Optional[str] = None
    user_id: Optional[str] = None

    def safe_summary(self) -> Dict[str, Any]:
        return {
            "api_key_configured": bool(self.api_key),
            "secret_key_configured": self.secret_key_configured,
            "imei_configured": bool(self.imei),
            "session_cookies_configured": bool(self.session_cookies),
            "session_cookie_count": len(self.session_cookies),
            "user_agent_configured": bool(self.user_agent),
            "user_id_configured": bool(self.user_id),
        }


def default_config_path() -> Path:
    return Path(__file__).resolve().with_name("config.json")


def load_config(path: Optional[str] = None) -> ZaloConfig:
    config_path = Path(path or os.getenv("ZALO_CONFIG_PATH") or default_config_path())
    if not config_path.exists():
        raise ConfigError(f"Config file not found: {config_path}")

    try:
        with config_path.open("r", encoding="utf-8") as config_file:
            raw = json.load(config_file)
    except json.JSONDecodeError as exc:
        raise ConfigError(f"Invalid JSON in config file: {exc}") from exc

    data = _select_config_object(raw)
    return _parse_config(data)


def _select_config_object(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, list):
        if not raw:
            raise ConfigError("Config array is empty")
        first_item = raw[0]
        if not isinstance(first_item, dict):
            raise ConfigError("First config array item must be an object")
        return first_item

    if isinstance(raw, dict):
        return raw

    raise ConfigError("Config must be a JSON object or an array of objects")


def _parse_config(data: Dict[str, Any]) -> ZaloConfig:
    imei = data.get("imei")
    if not isinstance(imei, str) or not imei.strip():
        raise ConfigError("Config field 'imei' is required")

    session_cookies = data.get("session_cookies")
    if not isinstance(session_cookies, dict) or not session_cookies:
        raise ConfigError("Config field 'session_cookies' must be a non-empty object")

    api_key = _optional_string(data.get("api_key"))
    secret_key = _optional_string(data.get("secret_key"))
    phone = _optional_string(data.get("phone")) or api_key or "cookie_login"
    password = _optional_string(data.get("password")) or secret_key or "cookie_login"
    user_agent = _optional_string(data.get("user_agent"))
    user_id = (
        _optional_string(data.get("user_id"))
        or _optional_string(data.get("uid"))
        or _optional_string(data.get("send2me_id"))
    )

    return ZaloConfig(
        imei=imei.strip(),
        session_cookies=session_cookies,
        phone=phone,
        password=password,
        user_agent=user_agent,
        api_key=api_key,
        secret_key=secret_key,
        secret_key_configured=bool(secret_key),
        user_id=user_id,
    )


def _optional_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None
