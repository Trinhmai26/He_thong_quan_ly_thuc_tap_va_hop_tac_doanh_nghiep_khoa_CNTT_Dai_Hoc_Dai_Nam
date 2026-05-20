from __future__ import annotations

import re
import threading
import time
from collections.abc import Mapping
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple

from config_loader import ZaloConfig


class ServiceError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class ValidationError(ServiceError):
    def __init__(self, message: str):
        super().__init__("VALIDATION_ERROR", message, 400)


class _SimpleMessage:
    def __init__(self, text: str):
        self.text = text


class ZaloService:
    def __init__(
        self,
        config: ZaloConfig,
        client: Any = None,
        client_factory: Optional[Callable[..., Any]] = None,
        message_cls: Optional[Callable[..., Any]] = None,
        thread_type_group: Any = None,
        cache_ttl_seconds: int = 60,
        min_send_interval_seconds: float = 1.0,
        max_message_length: int = 2000,
        allowed_group_ids: Optional[Iterable[str]] = None,
    ):
        self.config = config
        self._client = client
        self._client_factory = client_factory
        self._message_cls = message_cls
        self._thread_type_group = thread_type_group
        self._cache_ttl_seconds = cache_ttl_seconds
        self._min_send_interval_seconds = min_send_interval_seconds
        self._max_message_length = max_message_length
        self._allowed_group_ids = (
            {str(group_id).strip() for group_id in allowed_group_ids if str(group_id).strip()}
            if allowed_group_ids
            else None
        )
        self._cache_lock = threading.Lock()
        self._send_lock = threading.Lock()
        self._groups_cache: Optional[List[Dict[str, Any]]] = None
        self._groups_cache_at = 0.0
        self._last_send_at = 0.0
        self._sensitive_values = self._build_sensitive_values(config)

    def health(self) -> Dict[str, Any]:
        try:
            client = self._get_client()
            is_logged_in = getattr(client, "isLoggedIn", lambda: True)
            session_verified = False
            if hasattr(client, "fetchAccountInfo"):
                client.fetchAccountInfo()
                session_verified = True
            return {
                "zalo_logged_in": bool(is_logged_in()),
                "zalo_session_verified": session_verified,
                "config": self.config.safe_summary(),
            }
        except Exception as exc:
            raise self._wrap_error(exc)

    def list_groups(self, refresh: bool = False) -> Tuple[List[Dict[str, Any]], bool]:
        now = time.monotonic()
        with self._cache_lock:
            if (
                not refresh
                and self._groups_cache is not None
                and now - self._groups_cache_at < self._cache_ttl_seconds
            ):
                return list(self._groups_cache), True

        try:
            raw_groups = self._get_client().fetchAllGroups()
            groups = self._normalize_groups(raw_groups)
            missing_name_ids = [group["id"] for group in groups if not group.get("name")]

            if missing_name_ids:
                detail_groups = self._fetch_group_details(missing_name_ids)
                detail_by_id = {group["id"]: group for group in detail_groups}
                merged_groups = []
                for group in groups:
                    merged = dict(group)
                    merged.update({k: v for k, v in detail_by_id.get(group["id"], {}).items() if v is not None})
                    merged_groups.append(merged)
                groups = merged_groups

            groups = [self._finalize_group(group) for group in groups]
            groups.sort(key=lambda item: (item.get("name") or item["id"]).lower())

            with self._cache_lock:
                self._groups_cache = list(groups)
                self._groups_cache_at = time.monotonic()

            return groups, False
        except Exception as exc:
            raise self._wrap_error(exc)

    def get_group(self, group_id: str) -> Dict[str, Any]:
        group_id = self._validate_group_id(group_id)
        try:
            groups = self._normalize_groups(self._get_client().fetchGroupInfo(group_id))
            if not groups:
                raise ServiceError("GROUP_NOT_FOUND", "Group not found", 404)
            return self._finalize_group(groups[0])
        except ServiceError:
            raise
        except Exception as exc:
            raise self._wrap_error(exc)

    def send_group_message(
        self,
        group_id: str,
        message: str,
        ttl: int = 0,
        mark_message: Optional[str] = None,
    ) -> Dict[str, Any]:
        group_id = self._validate_group_id(group_id)
        message = self._validate_message(message)
        ttl = self._validate_ttl(ttl)
        mark_message = self._validate_mark_message(mark_message)
        self._check_allowed_group(group_id)
        self._enforce_rate_limit()

        try:
            message_obj = self._create_message(message)
            result = self._get_client().send(
                message_obj,
                thread_id=group_id,
                thread_type=self._get_group_thread_type(),
                mark_message=mark_message,
                ttl=ttl,
            )
            return self._serialize_public(result)
        except Exception as exc:
            raise self._wrap_error(exc)

    # ── Individual (phone-based) messaging ───────────────────────────────────

    def lookup_uid_by_phone(self, phone: str) -> Optional[str]:
        """
        Tìm Zalo UID từ số điện thoại.
        Truyền nguyên dạng 0xxx vào fetchPhoneNumber — _client.py tự chuẩn hoá thành 84xxx.
        KHÔNG tự thêm 84 vì _client.py cũng thêm → sẽ thành 8484xxx.
        """
        phone = re.sub(r'\D', '', phone.strip())
        if not phone:
            return None
        # Đưa về dạng 0xxx để _client.py tự normalize thành 84xxx (tránh double prefix)
        if phone.startswith('84') and len(phone) >= 11:
            phone = '0' + phone[2:]
        try:
            user = self._get_client().fetchPhoneNumber(phone, language='vi')
            uid  = getattr(user, 'uid', None) or getattr(user, 'userId', None)
            if not uid:
                data = getattr(user, 'data', None)
                if data:
                    uid = getattr(data, 'userId', None) or getattr(data, 'uid', None)
                    if not uid and isinstance(data, dict):
                        uid = data.get('userId') or data.get('uid')
            return str(uid) if uid else None
        except Exception:
            return None

    def send_message_by_uid(self, uid: str, message: str) -> Dict[str, Any]:
        """
        Gửi tin nhắn trực tiếp bằng Zalo user_id (không cần kết bạn trước).
        Dùng cho sinh viên đã liên kết tài khoản qua OA webhook.
        """
        message = self._validate_message(message)
        self._enforce_rate_limit()
        uid = str(uid).strip()
        if not uid:
            return {"success": False, "uid": None, "error": "uid không hợp lệ"}
        try:
            from zlapi.models import ThreadType
            message_obj = self._create_message(message)
            result = self._get_client().sendMessage(
                message_obj,
                thread_id=uid,
                thread_type=ThreadType.USER,
            )
            return {"success": True, "uid": uid, "result": self._serialize_public(result)}
        except Exception as exc:
            err = self._wrap_error(exc)
            return {"success": False, "uid": uid, "error": err.message}

    def send_individual_message(self, phone: str, message: str) -> Dict[str, Any]:
        """
        Gửi tin nhắn đến 1 sinh viên qua số điện thoại.

        Returns:
            { "success": bool, "uid": str|None, "error": str|None }
        """
        message = self._validate_message(message)
        self._enforce_rate_limit()

        uid = self.lookup_uid_by_phone(phone)
        if not uid:
            return {"success": False, "phone": phone, "uid": None,
                    "error": "Không tìm thấy tài khoản Zalo với số điện thoại này"}

        try:
            from zlapi.models import ThreadType
            message_obj = self._create_message(message)
            result = self._get_client().sendMessage(
                message_obj,
                thread_id=uid,
                thread_type=ThreadType.USER,
            )
            return {"success": True, "phone": phone, "uid": uid,
                    "result": self._serialize_public(result)}
        except Exception as exc:
            err = self._wrap_error(exc)
            return {"success": False, "phone": phone, "uid": uid,
                    "error": err.message}

    def send_bulk_individual(
        self,
        recipients: List[Dict[str, str]],
        message: str,
        delay_seconds: float = 1.2,
    ) -> Dict[str, Any]:
        """
        Gửi tin nhắn đến nhiều sinh viên (tuần tự, tránh rate-limit).

        recipients: [{"name": "...", "phone": "...", "ma_sinh_vien": "..."}]
        Returns: { sent, failed, errors, results }
        """
        message = self._validate_message(message)
        results: List[Dict[str, Any]] = []
        sent = 0
        failed = 0

        for r in recipients:
            phone = str(r.get('phone') or '').strip()
            name = r.get('name') or phone
            if not phone:
                results.append({"name": name, "success": False, "error": "Không có SĐT"})
                failed += 1
                continue

            try:
                # manual delay để tránh spam detection
                time.sleep(delay_seconds)
                self._last_send_at = 0.0  # reset rate limiter vì đã sleep thủ công

                result = self.send_individual_message(phone, message)
                result['name'] = name
                result['ma_sinh_vien'] = r.get('ma_sinh_vien', '')
                results.append(result)
                if result['success']:
                    sent += 1
                else:
                    failed += 1
            except Exception as exc:
                results.append({"name": name, "phone": phone, "success": False,
                                 "error": str(exc)})
                failed += 1

        return {"sent": sent, "failed": failed, "total": len(recipients),
                "results": results}

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client

        if self._client_factory is not None:
            self._client = self._client_factory(
                self.config.phone,
                self.config.password,
                imei=self.config.imei,
                session_cookies=self.config.session_cookies,
                user_agent=self.config.user_agent,
            )
            return self._client

        try:
            from zlapi import ZaloAPI
            from zlapi.models import Message, ThreadType
        except Exception as exc:
            raise ServiceError(
                "DEPENDENCY_ERROR",
                "Unable to import zlapi dependencies. Install requirements.txt first.",
                500,
            ) from exc

        self._message_cls = Message
        self._thread_type_group = ThreadType.GROUP

        self._client = ZaloAPI(
            self.config.phone,
            self.config.password,
            imei=self.config.imei,
            session_cookies=self.config.session_cookies,
            user_agent=self.config.user_agent,
        )
        return self._client

    def _create_message(self, text: str) -> Any:
        message_cls = self._message_cls or _SimpleMessage
        return message_cls(text=text)

    def _get_group_thread_type(self) -> Any:
        if self._thread_type_group is not None:
            return self._thread_type_group

        try:
            from zlapi.models import ThreadType
        except Exception as exc:
            raise ServiceError("DEPENDENCY_ERROR", "Unable to import zlapi ThreadType", 500) from exc

        self._thread_type_group = ThreadType.GROUP
        return self._thread_type_group

    def _fetch_group_details(self, group_ids: Sequence[str]) -> List[Dict[str, Any]]:
        if not group_ids:
            return []

        detailed_groups = []
        for chunk in self._chunks([str(group_id) for group_id in group_ids], size=30):
            group_map = {group_id: 0 for group_id in chunk}
            try:
                chunk_details = self._normalize_groups(self._get_client().fetchGroupInfo(group_map))
            except Exception:
                chunk_details = []

            if chunk_details:
                detailed_groups.extend(chunk_details)
                continue

            for group_id in chunk:
                try:
                    single_details = self._normalize_groups(self._get_client().fetchGroupInfo(group_id))
                    if single_details:
                        detailed_groups.extend(single_details)
                    else:
                        detailed_groups.append({"id": str(group_id), "name": None})
                except Exception:
                    detailed_groups.append({"id": str(group_id), "name": None})

        return detailed_groups

    def _chunks(self, values: Sequence[str], size: int) -> Iterable[List[str]]:
        for index in range(0, len(values), size):
            yield list(values[index : index + size])

    def _normalize_groups(self, raw: Any) -> List[Dict[str, Any]]:
        entries = self._extract_group_entries(raw)
        normalized = []
        seen = set()
        for entry in entries:
            group = self._normalize_group_entry(entry)
            group_id = group.get("id")
            if not group_id or group_id in seen:
                continue
            seen.add(group_id)
            normalized.append(group)
        return normalized

    def _extract_group_entries(self, raw: Any) -> List[Any]:
        if raw is None:
            return []

        if isinstance(raw, (list, tuple, set)):
            return list(raw)

        mapping = self._as_mapping(raw)
        if not mapping:
            if isinstance(raw, (str, int)):
                return [str(raw)]
            return []

        for key in ("gridVerMap", "groupVerMap"):
            nested = mapping.get(key)
            nested_mapping = self._as_mapping(nested)
            if nested_mapping:
                return list(nested_mapping.keys())

        for key in ("gridInfoMap", "groupInfoMap", "groupsInfoMap"):
            nested = mapping.get(key)
            nested_mapping = self._as_mapping(nested)
            if nested_mapping:
                return list(nested_mapping.values())

        for key in ("groups", "groupList", "list", "items", "data"):
            nested = mapping.get(key)
            if nested is not None and nested is not raw:
                extracted = self._extract_group_entries(nested)
                if extracted:
                    return extracted

        for key in ("groupIds", "gridIds", "ids"):
            ids = mapping.get(key)
            if isinstance(ids, (list, tuple, set)):
                return [str(group_id) for group_id in ids]

        if self._pick_value(mapping, ("id", "grid", "groupId", "gid", "gridId")):
            return [mapping]

        return []

    def _normalize_group_entry(self, entry: Any) -> Dict[str, Any]:
        if isinstance(entry, (str, int)):
            group_id = str(entry)
            return {"id": group_id, "name": None, "avatar": None, "total_member": None}

        mapping = self._as_mapping(entry)
        group_id = self._pick_value(mapping, ("id", "grid", "groupId", "group_id", "gid", "gridId"))
        name = self._pick_value(mapping, ("name", "groupName", "displayName", "title", "gridName"))
        avatar = self._pick_value(mapping, ("avatar", "groupAvatar", "fullAvt", "avt", "thumb", "photo"))
        total_member = self._pick_value(
            mapping,
            ("total_member", "totalMember", "totalMembers", "memberCount", "numMember", "member_count"),
        )

        return {
            "id": str(group_id) if group_id is not None else None,
            "name": str(name) if name is not None else None,
            "avatar": str(avatar) if avatar is not None else None,
            "total_member": total_member,
        }

    def _finalize_group(self, group: Dict[str, Any]) -> Dict[str, Any]:
        group_id = str(group["id"])
        return {
            "id": group_id,
            "name": group.get("name") or f"Nhom {group_id}",
            "avatar": group.get("avatar"),
            "total_member": group.get("total_member"),
        }

    def _validate_group_id(self, group_id: Any) -> str:
        if group_id is None:
            raise ValidationError("group_id is required")
        group_id = str(group_id).strip()
        if not group_id:
            raise ValidationError("group_id is required")
        if not re.fullmatch(r"[0-9A-Za-z._:-]+", group_id):
            raise ValidationError("group_id has invalid characters")
        return group_id

    def _validate_message(self, message: Any) -> str:
        if not isinstance(message, str):
            raise ValidationError("message is required")
        message = message.strip()
        if not message:
            raise ValidationError("message is required")
        if len(message) > self._max_message_length:
            raise ValidationError(f"message must be at most {self._max_message_length} characters")
        return message

    def _validate_ttl(self, ttl: Any) -> int:
        if ttl in (None, ""):
            return 0
        try:
            ttl = int(ttl)
        except (TypeError, ValueError) as exc:
            raise ValidationError("ttl must be an integer") from exc
        if ttl < 0:
            raise ValidationError("ttl must be greater than or equal to 0")
        return ttl

    def _validate_mark_message(self, mark_message: Any) -> Optional[str]:
        if mark_message in (None, ""):
            return None
        if not isinstance(mark_message, str):
            raise ValidationError("mark_message must be a string")
        mark_message = mark_message.strip().lower()
        if mark_message not in {"important", "urgent"}:
            raise ValidationError("mark_message must be important or urgent")
        return mark_message

    def _check_allowed_group(self, group_id: str) -> None:
        if self._allowed_group_ids is not None and group_id not in self._allowed_group_ids:
            raise ServiceError("GROUP_NOT_ALLOWED", "This group is not allowed", 403)

    def _enforce_rate_limit(self) -> None:
        with self._send_lock:
            now = time.monotonic()
            elapsed = now - self._last_send_at
            if elapsed < self._min_send_interval_seconds:
                wait_for = round(self._min_send_interval_seconds - elapsed, 2)
                raise ServiceError("RATE_LIMITED", f"Please wait {wait_for}s before sending again", 429)
            self._last_send_at = now

    def _wrap_error(self, exc: Exception) -> ServiceError:
        if isinstance(exc, ServiceError):
            return exc

        class_name = exc.__class__.__name__
        message = self._redact(str(exc) or class_name)

        if class_name == "ZaloLoginError":
            if "NoneType" in message and "subscriptable" in message:
                message = "Zalo login did not return session data. Refresh imei and session_cookies in config.json."
            return ServiceError("ZALO_LOGIN_ERROR", message, 401)
        if class_name == "ZaloUserError":
            return ServiceError("ZALO_USER_ERROR", message, 400)
        if class_name == "ZaloAPIException":
            return ServiceError("ZALO_API_ERROR", message, 502)
        if class_name in {"ConnectionError", "Timeout", "ReadTimeout"}:
            return ServiceError("NETWORK_ERROR", message, 502)
        if class_name == "ModuleNotFoundError":
            return ServiceError("DEPENDENCY_ERROR", "Missing dependency. Install requirements.txt first.", 500)

        return ServiceError("INTERNAL_ERROR", message, 500)

    def _serialize_public(self, value: Any) -> Any:
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, Mapping):
            safe = {}
            for key, item in value.items():
                key_text = str(key)
                if self._is_sensitive_key(key_text):
                    safe[key_text] = "[redacted]"
                else:
                    safe[key_text] = self._serialize_public(item)
            return safe
        if isinstance(value, (list, tuple, set)):
            return [self._serialize_public(item) for item in value]
        if hasattr(value, "items"):
            return self._serialize_public(dict(value.items()))
        if hasattr(value, "__dict__"):
            return self._serialize_public(vars(value))
        return self._redact(str(value))

    def _as_mapping(self, value: Any) -> Dict[str, Any]:
        if value is None:
            return {}
        if isinstance(value, Mapping):
            return dict(value)
        if hasattr(value, "items"):
            try:
                return dict(value.items())
            except Exception:
                return {}
        if hasattr(value, "__dict__"):
            return vars(value)
        return {}

    def _pick_value(self, mapping: Dict[str, Any], keys: Sequence[str]) -> Any:
        for key in keys:
            if key in mapping and mapping[key] not in (None, ""):
                return mapping[key]
        return None

    def _build_sensitive_values(self, config: ZaloConfig) -> List[str]:
        values = [config.imei, config.secret_key, config.user_id]
        values.extend(str(value) for value in config.session_cookies.values() if isinstance(value, (str, int)))
        return [str(value) for value in values if value and len(str(value)) >= 4]

    def _redact(self, message: str) -> str:
        redacted = str(message)
        for value in self._sensitive_values:
            redacted = redacted.replace(str(value), "[redacted]")
        return redacted

    def _is_sensitive_key(self, key: str) -> bool:
        key = key.lower()
        return any(token in key for token in ("cookie", "secret", "token", "imei", "api_key", "apikey"))
