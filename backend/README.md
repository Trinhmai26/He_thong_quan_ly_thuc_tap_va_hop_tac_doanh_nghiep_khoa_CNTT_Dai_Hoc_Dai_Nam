# 🎓 Backend API - Hệ thống Quản lý Thực tập

**Khoa CNTT - Đại học Đại Nam**

Backend API cho hệ thống quản lý thực tập và hợp tác doanh nghiệp, được phát triển với Node.js + Express + MySQL.

## 📋 Tính năng chính

### ✅ Tính năng 1: Quản lý Sinh viên
- **CRUD sinh viên** với validation đầy đủ
- **Phân trang và tìm kiếm** thông minh
- **Lọc theo trạng thái** thực tập
- **Thống kê sinh viên** theo trạng thái
- **Quản lý theo giảng viên** hướng dẫn
- **Import batch** từ file Excel (coming soon)

### ✅ Tính năng 2: Quản lý Báo cáo Thực tập
- **Báo cáo hàng tuần**: Tạo, sửa, chấm điểm
- **Báo cáo cuối kỳ**: Upload file, đánh giá kép (GV + DN)
- **Hệ thống chấm điểm** linh hoạt (0-10)
- **Thống kê báo cáo** toàn diện
- **Lọc và tìm kiếm** nâng cao

## 🛠️ Công nghệ sử dụng

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **Security**: Helmet, CORS, Rate limiting
- **Validation**: Custom middleware
- **File Upload**: Multer (ready)
- **Authentication**: JWT (ready)

## 🚀 Cài đặt và chạy

### 1. Cài đặt dependencies
```bash
cd backend
npm install
```

### 2. Cấu hình môi trường
```bash
# Tạo file .env từ template
cp .env.example .env

# Cập nhật thông tin database trong .env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=internship_management
DB_USER=your_username
DB_PASSWORD=your_password
```

### 3. Thiết lập database
```bash
# Chạy script thiết lập hoàn chỉnh
npm run setup

# Hoặc chạy từng bước:
npm run migrate  # Tạo bảng
npm run seed     # Thêm dữ liệu mẫu
```

### 4. Khởi động server
```bash
# Development mode
npm run dev

# Production mode  
npm start
```

Server sẽ chạy tại: `http://localhost:5000`

## 📊 Database Schema

### Bảng chính
- **users**: Tài khoản người dùng (4 roles)
- **students**: Thông tin sinh viên
- **teachers**: Thông tin giảng viên  
- **companies**: Thông tin doanh nghiệp
- **internship_batches**: Các đợt thực tập
- **internship_assignments**: Phân công thực tập
- **job_postings**: Tin tuyển dụng thực tập
- **applications**: Đơn ứng tuyển
- **weekly_reports**: Báo cáo hàng tuần
- **final_reports**: Báo cáo cuối kỳ

## 🔗 API Endpoints

### 👥 Quản lý Sinh viên
```
GET    /api/students              # Danh sách sinh viên
GET    /api/students/:id          # Chi tiết sinh viên
POST   /api/students              # Tạo sinh viên mới
PUT    /api/students/:id          # Cập nhật sinh viên
DELETE /api/students/:id          # Xóa sinh viên
PATCH  /api/students/:id/status   # Cập nhật trạng thái
GET    /api/students/statistics   # Thống kê sinh viên
GET    /api/students/by-teacher/:teacherId  # Sinh viên theo GV
```

### 📋 Quản lý Báo cáo
```
# Báo cáo hàng tuần
GET    /api/reports/weekly        # Danh sách báo cáo tuần
GET    /api/reports/weekly/:id    # Chi tiết báo cáo tuần
POST   /api/reports/weekly        # Tạo báo cáo tuần
PUT    /api/reports/weekly/:id    # Cập nhật báo cáo tuần
POST   /api/reports/weekly/:id/grade  # Chấm điểm tuần

# Báo cáo cuối kỳ
GET    /api/reports/final         # Danh sách báo cáo cuối kỳ
GET    /api/reports/final/:id     # Chi tiết báo cáo cuối kỳ
POST   /api/reports/final         # Tạo báo cáo cuối kỳ
PUT    /api/reports/final/:id     # Cập nhật báo cáo cuối kỳ
POST   /api/reports/final/:id/grade-teacher   # Chấm điểm (GV)
POST   /api/reports/final/:id/grade-company   # Chấm điểm (DN)

# Thống kê
GET    /api/reports/statistics    # Thống kê tổng quan
```

### 🏥 System Health
```
GET    /health                    # Kiểm tra health server
GET    /                          # API documentation
```

## 🧪 Test với dữ liệu mẫu

### Tài khoản demo
- **Admin**: admin@dainam.edu.vn / 123456
- **Sinh viên**: sv001@student.dainam.edu.vn / 123456  
- **Giảng viên**: gv001@dainam.edu.vn / 123456
- **Doanh nghiệp**: contact@techcorp.com / 123456

### Test API với Postman/curl
```bash
# Lấy danh sách sinh viên
curl http://localhost:5000/api/students

# Tạo sinh viên mới
curl -X POST http://localhost:5000/api/students \
  -H "Content-Type: application/json" \
  -d '{
    "ma_sv": "SV2024001",
    "ho_ten": "Nguyễn Văn Test", 
    "email": "test@student.dainam.edu.vn",
    "lop": "CNTT2024A",
    "khoa": "Công nghệ thông tin"
  }'

# Lấy thống kê
curl http://localhost:5000/api/students/statistics
curl http://localhost:5000/api/reports/statistics
```

## 📁 Cấu trúc thư mục

```
backend/
├── src/
│   ├── controllers/        # Business logic
│   │   ├── StudentController.js
│   │   └── ReportController.js
│   ├── models/            # Database models
│   │   ├── Student.js
│   │   └── Report.js  
│   ├── routes/            # API routes
│   │   ├── students.js
│   │   └── reports.js
│   ├── database/          # Database config
│   │   ├── connection.js
│   │   ├── migrate.js
│   │   └── seed.js
│   └── middleware/        # Custom middleware (coming soon)
├── uploads/               # File uploads
├── .env.example          # Environment template
├── server.js             # Main server file
├── setup.js              # Database setup script
└── package.json          # Dependencies
```

## 🔧 Scripts hữu ích

```bash
# Development
npm run dev          # Chạy với nodemon
npm run start        # Chạy production

# CV analyzer (Python)
npm run cv-analyzer:install   # Cài dependencies Python cho module đọc CV
npm run cv-analyzer:start     # Chạy service đọc CV tại cổng 5000

# Database  
npm run setup        # Thiết lập DB hoàn chỉnh
npm run migrate      # Chỉ tạo bảng
npm run seed         # Chỉ thêm dữ liệu mẫu
npm run reset        # Reset và tạo lại DB

# Utilities
npm run lint         # Kiểm tra code style
npm run test         # Chạy unit tests
```

## 🤖 Tích hợp đọc CV sinh viên

Project đã tích hợp module đọc CV Python tại thư mục `backend/cv_analyzer`.

### 1. Chạy dịch vụ đọc CV
```bash
cd backend
npm run cv-analyzer:install
npm run cv-analyzer:start
```

### 2. Cấu hình backend Node
Trong `.env`:
```env
CV_ANALYZER_URL=http://127.0.0.1:5000/api/process-cv
CV_ANALYZER_TIMEOUT_MS=180000
```

### 3. API đã tích hợp
- `POST /api/sinh-vien/analyze-cv`
  - Yêu cầu đăng nhập sinh viên (Bearer token).
  - Tự động lấy `cv_path` đã upload của sinh viên hiện tại.
  - Gọi Python service để OCR + trích xuất sections + gợi ý vị trí.


## 🚨 Xử lý lỗi

API trả về format response thống nhất:

```json
{
  "success": true/false,
  "message": "Mô tả kết quả",
  "data": {...} // hoặc null
}
```

### Mã lỗi phổ biến
- **400**: Bad Request (dữ liệu không hợp lệ)
- **401**: Unauthorized (chưa đăng nhập)
- **403**: Forbidden (không có quyền)
- **404**: Not Found (không tìm thấy)
- **409**: Conflict (dữ liệu đã tồn tại)
- **500**: Server Error (lỗi hệ thống)

## 🔒 Bảo mật

- ✅ **Helmet**: Bảo vệ HTTP headers
- ✅ **CORS**: Kiểm soát cross-origin
- ✅ **Rate Limiting**: Chống spam/DDoS
- ✅ **Input Validation**: Kiểm tra dữ liệu đầu vào
- ✅ **SQL Injection Protection**: Prepared statements
- 🔄 **JWT Authentication**: Đang phát triển
- 🔄 **File Upload Security**: Đang phát triển

## 📈 Monitoring & Logs

- **Morgan**: HTTP request logging
- **Health Check**: `/health` endpoint
- **Error Tracking**: Global error handler
- **Performance**: Compression middleware

## 🤝 Đóng góp

1. Fork project
2. Tạo feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`) 
5. Tạo Pull Request

## 📞 Hỗ trợ

- **Email**: support@dainam.edu.vn
- **Documentation**: [API Docs](http://localhost:5000)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)

---

## 🎯 Roadmap

### 🔄 Đang phát triển
- [ ] JWT Authentication & Authorization
- [ ] File upload với validation
- [ ] Email notifications
- [ ] Advanced search & filters
- [ ] Export Excel/PDF reports
- [ ] Dashboard analytics

### 📋 Backlog
- [ ] Real-time notifications (WebSocket)
- [ ] Audit logs
- [ ] API rate limiting per user
- [ ] Data backup & restore
- [ ] Multi-language support
- [ ] Mobile API optimization

---

**💡 Lưu ý**: Đây là backend API cho **2 tính năng chính** đã được yêu cầu. Hệ thống đã sẵn sàng tích hợp với frontend ReactJS và có thể mở rộng thêm nhiều tính năng khác.

**🚀 Happy Coding!** 🎓