# Zalo Group Sender

Flask web app và JSON API để hiển thị danh sách nhóm Zalo, soạn tin nhắn và gửi tin nhắn text vào nhóm bằng thư viện local `zlapi`.

## Cấu Trúc Dự Án

```text
D:\ZALO
|-- app.py
|-- config_loader.py
|-- config.json
|-- requirements.txt
|-- zalo_service.py
|-- static/
|   |-- app.js
|   `-- style.css
|-- templates/
|   `-- index.html
|-- tests/
|   |-- test_config_loader.py
|   `-- test_zalo_service.py
|-- zlapi/
|   |-- __init__.py
|   |-- _client.py
|   |-- _message.py
|   |-- _threads.py
|   |-- models.py
|   `-- ...
`-- GET_COOKIE_IMEI_ZALO/
    `-- ...
```

## Vai Trò Các Thành Phần

| Đường dẫn | Vai trò |
| --- | --- |
| `app.py` | Entry point Flask. Khai báo route web UI và API: health, groups, group detail, send message. |
| `config_loader.py` | Đọc và validate `config.json`. Hỗ trợ config dạng object hoặc array. Không log cookie/imei/key. |
| `zalo_service.py` | Lớp service bọc `zlapi`: khởi tạo client, lấy danh sách nhóm, lấy chi tiết nhóm, gửi tin nhắn, cache, rate limit. |
| `config.json` | Lưu thông tin đăng nhập Zalo: `api_key`, `secret_key`, `imei`, `session_cookies`. Không commit/public file này. |
| `requirements.txt` | Danh sách Python package cần cài. |
| `templates/index.html` | Giao diện web chọn nhóm và soạn tin nhắn. |
| `static/app.js` | Logic frontend: gọi API, render danh sách nhóm, gửi message. |
| `static/style.css` | CSS cho giao diện. |
| `tests/` | Unit tests cho config loader và Zalo service bằng fake client, không gọi Zalo thật. |
| `zlapi/` | Thư viện Zalo API local đang được app sử dụng. |
| `GET_COOKIE_IMEI_ZALO/` | Công cụ/phụ trợ lấy cookie và IMEI Zalo. |
| `flask-server.out.log`, `flask-server.err.log` | Log khi server Flask được start background. |

## Config

`config.json` có thể là object hoặc array. Format đang dùng:

```json
[
  {
    "api_key": "YOUR_API_KEY",
    "secret_key": "YOUR_SECRET_KEY",
    "imei": "YOUR_IMEI",
    "session_cookies": {
      "zpsid": "...",
      "zpw_sek": "..."
    }
  }
]
```


## Cài Đặt

```powershell
cd D:\ZALO
python -m pip install -r requirements.txt
```

## Chạy Ứng Dụng

Chạy foreground:

```powershell
python app.py
```

## API

### `GET /`

Trang web để:

- Tìm và chọn nhóm.
- Soạn tin nhắn.
- Gửi tin vào nhóm.
- Refresh danh sách nhóm.

### `GET /api/health`

Kiểm tra trạng thái app và session Zalo.

Response thành công:

```json
{
  "ok": true,
  "zalo_logged_in": true,
  "zalo_session_verified": true
}
```

### `GET /api/groups`

Lấy danh sách nhóm.

Query optional:

```text
?refresh=1
```

Response:

```json
{
  "ok": true,
  "cached": false,
  "groups": [
    {
      "id": "group_id",
      "name": "Tên nhóm",
      "avatar": null,
      "total_member": 10
    }
  ]
}
```

### `GET /api/groups/<group_id>`

Lấy thông tin một nhóm.

### `POST /api/messages`

Gửi tin nhắn text vào nhóm.

Request:

```json
{
  "group_id": "group_id",
  "message": "Nội dung cần gửi",
  "ttl": 0,
  "mark_message": null
}
```

`mark_message` có thể là:

- `null`
- `"important"`
- `"urgent"`

## Bảo Mật

Có thể bật API key nội bộ bằng biến môi trường:

```powershell
$env:APP_API_KEY = "your-private-key"
python app.py
```



## Kiểm Thử

```powershell
python -m py_compile app.py config_loader.py zalo_service.py tests\test_config_loader.py tests\test_zalo_service.py
python -m unittest discover -s tests
```

## Xử Lý Lỗi Thường Gặp

### `ZALO_LOGIN_ERROR`

Thường do cookie/IMEI hết hạn hoặc không khớp. Lấy lại cookie và IMEI rồi cập nhật `config.json`.

### Danh sách nhóm rỗng

Kiểm tra:

- `/api/health` có `zalo_session_verified: true` hay không.
- Cookie có `zpw_sek` hợp lệ hay không.
- Tài khoản có tham gia nhóm nào không.


