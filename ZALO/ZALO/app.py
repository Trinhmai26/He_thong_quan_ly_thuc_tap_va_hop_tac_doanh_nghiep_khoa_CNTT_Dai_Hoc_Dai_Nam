from __future__ import annotations

import hmac
import os
from typing import Optional

from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from config_loader import ConfigError, load_config
from zalo_service import ServiceError, ZaloService

_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]


def create_app(config_path: Optional[str] = None, service: Optional[ZaloService] = None) -> Flask:
    app = Flask(__name__)
    app.config["JSON_AS_ASCII"] = False
    CORS(app, resources={r"/*": {"origins": _CORS_ORIGINS}})

    init_error = None
    if service is None:
        try:
            config = load_config(config_path)
            service = ZaloService(
                config,
                allowed_group_ids=_parse_csv_env("ZALO_ALLOWED_GROUP_IDS"),
                cache_ttl_seconds=_parse_int_env("ZALO_GROUP_CACHE_TTL", 60),
                min_send_interval_seconds=_parse_float_env("ZALO_MIN_SEND_INTERVAL", 1.0),
                max_message_length=_parse_int_env("ZALO_MAX_MESSAGE_LENGTH", 2000),
            )
        except ConfigError as exc:
            init_error = ServiceError("CONFIG_ERROR", str(exc), 500)

    app.config["ZALO_SERVICE"] = service
    app.config["INIT_ERROR"] = init_error
    app.config["APP_API_KEY"] = os.getenv("APP_API_KEY")

    @app.before_request
    def require_api_key():
        api_key = app.config.get("APP_API_KEY")
        if not api_key or not request.path.startswith("/api/"):
            return None

        provided = request.headers.get("X-API-Key") or _bearer_token(request.headers.get("Authorization"))
        if not provided or not hmac.compare_digest(str(api_key), str(provided)):
            return error_response("UNAUTHORIZED", "Invalid or missing API key", 401)
        return None

    @app.route("/")
    def index():
        return render_template("index.html", api_key_required=bool(app.config.get("APP_API_KEY")))

    @app.post("/send-message")
    def send_message_to_student():
        """
        Gửi tin nhắn Zalo đến 1 sinh viên.
        Body: { "phone": "...", "zaloUserId": "...", "title": "...", "message": "..." }
        Ưu tiên zaloUserId nếu có (không cần kết bạn), fallback sang phone.
        """
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"success": False, "message": "JSON body required"}), 400

        phone         = str(payload.get("phone") or "").strip()
        zalo_user_id  = str(payload.get("zaloUserId") or payload.get("zalo_user_id") or "").strip()
        title         = str(payload.get("title") or "").strip()
        message_text  = str(payload.get("message") or "").strip()

        if not phone and not zalo_user_id:
            return jsonify({"success": False, "message": "phone hoặc zaloUserId là bắt buộc"}), 400
        if not message_text:
            return jsonify({"success": False, "message": "message là bắt buộc"}), 400

        full_message = f"📢 {title}\n\n{message_text}" if title else message_text

        try:
            zalo = _service_or_raise(app)

            # Ưu tiên gửi qua zalo_user_id (không cần kết bạn, không cần SĐT public)
            if zalo_user_id:
                result = zalo.send_message_by_uid(zalo_user_id, full_message)
            else:
                result = zalo.send_individual_message(phone, full_message)

            if result.get("success"):
                return jsonify({"success": True, "message": "Đã gửi Zalo thành công"})
            return jsonify({"success": False, "message": result.get("error", "Không gửi được Zalo")}), 422
        except ServiceError as exc:
            return jsonify({"success": False, "message": exc.message}), exc.status_code
        except Exception as exc:
            return jsonify({"success": False, "message": str(exc)}), 500

    @app.get("/health")
    def health_ping():
        """Endpoint kiểm tra nhanh — không yêu cầu Zalo đăng nhập."""
        return jsonify({
            "status": "ok",
            "service": "zalo-local",
            "message": "Zalo Local Service is running",
        })

    @app.get("/api/health")
    def health():
        zalo = _service_or_raise(app)
        payload = zalo.health()
        return jsonify({"ok": True, **payload})

    @app.get("/api/groups")
    def list_groups():
        zalo = _service_or_raise(app)
        refresh = request.args.get("refresh") in {"1", "true", "yes"}
        groups, cached = zalo.list_groups(refresh=refresh)
        return jsonify({"ok": True, "cached": cached, "groups": groups})

    @app.get("/api/groups/<path:group_id>")
    def get_group(group_id):
        zalo = _service_or_raise(app)
        return jsonify({"ok": True, "group": zalo.get_group(group_id)})

    @app.post("/api/messages")
    def send_message():
        zalo = _service_or_raise(app)
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            raise ServiceError("VALIDATION_ERROR", "JSON body is required", 400)

        result = zalo.send_group_message(
            group_id=payload.get("group_id"),
            message=payload.get("message"),
            ttl=payload.get("ttl", 0),
            mark_message=payload.get("mark_message"),
        )
        return jsonify({"ok": True, "group_id": str(payload.get("group_id")), "result": result})

    @app.post("/api/send-individual")
    def send_individual():
        """
        Gửi tin nhắn đến 1 sinh viên qua SĐT.
        Body: { "phone": "0912345678", "message": "..." }
        """
        zalo = _service_or_raise(app)
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            raise ServiceError("VALIDATION_ERROR", "JSON body is required", 400)

        phone = str(payload.get("phone") or "").strip()
        message = str(payload.get("message") or "").strip()
        if not phone:
            raise ServiceError("VALIDATION_ERROR", "phone is required", 400)
        if not message:
            raise ServiceError("VALIDATION_ERROR", "message is required", 400)

        result = zalo.send_individual_message(phone, message)
        status = 200 if result.get("success") else 422
        return jsonify({"ok": result.get("success", False), **result}), status

    @app.post("/api/send-bulk-individual")
    def send_bulk_individual():
        """
        Gửi tin nhắn đến nhiều sinh viên qua SĐT (tuần tự).
        Body: {
            "message": "...",
            "recipients": [{"name": "...", "phone": "...", "ma_sinh_vien": "..."}]
        }
        """
        zalo = _service_or_raise(app)
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            raise ServiceError("VALIDATION_ERROR", "JSON body is required", 400)

        message = str(payload.get("message") or "").strip()
        recipients = payload.get("recipients", [])
        if not message:
            raise ServiceError("VALIDATION_ERROR", "message is required", 400)
        if not isinstance(recipients, list) or len(recipients) == 0:
            raise ServiceError("VALIDATION_ERROR", "recipients must be a non-empty array", 400)
        if len(recipients) > 200:
            raise ServiceError("VALIDATION_ERROR", "Tối đa 200 người/lần gửi", 400)

        # Chạy background để không block response
        import threading
        result_container: list = []
        done_event = threading.Event()

        def _send():
            result_container.append(zalo.send_bulk_individual(recipients, message))
            done_event.set()

        t = threading.Thread(target=_send, daemon=True)
        t.start()

        # Chờ tối đa 10s để lấy kết quả nếu xong nhanh, nếu không trả về accepted
        done_event.wait(timeout=10)
        if result_container:
            r = result_container[0]
            return jsonify({"ok": True, **r})
        return jsonify({"ok": True, "accepted": True, "total": len(recipients),
                        "message": f"Đang gửi {len(recipients)} tin nhắn..."}), 202

    @app.errorhandler(ServiceError)
    def handle_service_error(exc):
        return error_response(exc.code, exc.message, exc.status_code)

    @app.errorhandler(404)
    def handle_not_found(exc):
        if request.path.startswith("/api/"):
            return error_response("NOT_FOUND", "Endpoint not found", 404)
        return exc

    @app.errorhandler(Exception)
    def handle_unexpected_error(exc):
        app.logger.exception("Unhandled error")
        return error_response("INTERNAL_ERROR", "Unexpected server error", 500)

    return app


def error_response(code: str, message: str, status_code: int):
    response = jsonify({"ok": False, "error": {"code": code, "message": message}})
    response.status_code = status_code
    return response


def _service_or_raise(app: Flask) -> ZaloService:
    init_error = app.config.get("INIT_ERROR")
    if init_error:
        raise init_error

    service = app.config.get("ZALO_SERVICE")
    if service is None:
        raise ServiceError("CONFIG_ERROR", "Zalo service is not configured", 500)
    return service


def _bearer_token(header_value: Optional[str]) -> Optional[str]:
    if not header_value:
        return None
    prefix = "Bearer "
    if header_value.startswith(prefix):
        return header_value[len(prefix) :].strip()
    return None


def _parse_csv_env(name: str):
    value = os.getenv(name)
    if not value:
        return None
    return [item.strip() for item in value.split(",") if item.strip()]


def _parse_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _parse_float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default


app = create_app()


if __name__ == "__main__":
    host = os.getenv("FLASK_RUN_HOST", "127.0.0.1")
    port = _parse_int_env("FLASK_RUN_PORT", 5000)
    debug = os.getenv("FLASK_DEBUG", "").lower() in {"1", "true", "yes"}
    app.run(host=host, port=port, debug=debug)
