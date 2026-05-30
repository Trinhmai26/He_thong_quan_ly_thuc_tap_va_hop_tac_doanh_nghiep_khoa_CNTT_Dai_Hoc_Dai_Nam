# Tài liệu CSDL MySQL - Hệ thống quản lý thực tập

- Database: `quanly_thuctap`
- Số bảng: `20`
- Nguồn: truy vấn trực tiếp từ `information_schema` của MySQL.
- Ghi chú: phần ràng buộc hiển thị khóa chính, khóa ngoại, unique, not null, default, auto increment và index nếu có trong CSDL.

## 1. Danh sách thực thể

| STT | Tên bảng / thực thể | Mô tả | Số cột |
|---:|---|---|---:|
| 1 | `accounts` | Bảng tài khoản đăng nhập | 9 |
| 2 | `admin` | Bảng thông tin quản trị viên | 9 |
| 3 | `bai_nop_cua_sinh_vien` | Thực thể bài nộp của sinh viên theo từng đợt nộp báo cáo. | 10 |
| 4 | `bao_cao_thuc_tap` | Thực thể báo cáo thực tập, lưu nội dung, file báo cáo, nhận xét và trạng thái xử lý. | 11 |
| 5 | `dang_ky_thuc_tap_sinh_vien` | Thực thể đăng ký thực tập của sinh viên, lưu nguyện vọng, hồ sơ và trạng thái duyệt/phỏng vấn. | 23 |
| 6 | `deadline_reminders` | Thực thể nhắc hạn nộp báo cáo, tránh gửi trùng thông báo nhắc hạn. | 7 |
| 7 | `diem_theo_dot_nop` | Thực thể điểm theo từng đợt nộp báo cáo của sinh viên. | 6 |
| 8 | `doanh_nghiep` | Bảng thông tin doanh nghiệp | 21 |
| 9 | `dot_nop_bao_cao_theo_tuan` | Thực thể đợt/lịch nộp báo cáo theo tuần do giảng viên hoặc hệ thống tạo. | 8 |
| 10 | `dot_thuc_tap` | Thực thể đợt thực tập, quản lý thời gian, trạng thái và thông tin tổ chức theo từng đợt. | 23 |
| 11 | `giang_vien` | Bảng thông tin giảng viên | 20 |
| 12 | `internship_timeline_milestones` | Thực thể mốc thời gian trong quy trình thực tập của từng đợt. | 14 |
| 13 | `internship_workflow_history` | Thực thể lịch sử thay đổi trạng thái/quy trình thực tập. | 9 |
| 14 | `notifications` | Thực thể thông báo trong hệ thống gửi tới người dùng. | 10 |
| 15 | `phan_cong_thuc_tap` | Thực thể phân công thực tập, liên kết sinh viên với giảng viên, doanh nghiệp và đợt thực tập. | 17 |
| 16 | `sinh_vien` | Bảng thông tin sinh viên | 34 |
| 17 | `sinh_vien_thuc_tap` | Thực thể danh sách sinh viên tham gia một đợt thực tập. | 5 |
| 18 | `tin_tuyen_dung` | Thực thể tin/vị trí tuyển dụng thực tập do doanh nghiệp đăng. | 13 |
| 19 | `ung_tuyen` | Thực thể ứng tuyển của sinh viên vào tin tuyển dụng/vị trí thực tập. | 10 |
| 20 | `zalo_message_queue` | Thực thể hàng đợi gửi tin nhắn Zalo, phục vụ gửi thông báo tuần tự. | 16 |

## 2. Quan hệ giữa các bảng

### 2.1. Quan hệ có ràng buộc khóa ngoại trong MySQL

| STT | Bảng con | Cột FK | Bảng cha | Cột tham chiếu | Khi cập nhật | Khi xóa |
|---:|---|---|---|---|---|---|
| 1 | `admin` | `account_id` | `accounts` | `id` | NO ACTION | CASCADE |
| 2 | `bai_nop_cua_sinh_vien` | `slot_id` | `dot_nop_bao_cao_theo_tuan` | `id` | NO ACTION | CASCADE |
| 3 | `bao_cao_thuc_tap` | `phan_cong_id` | `phan_cong_thuc_tap` | `id` | NO ACTION | CASCADE |
| 4 | `dang_ky_thuc_tap_sinh_vien` | `sinh_vien_id` | `sinh_vien` | `id` | NO ACTION | CASCADE |
| 5 | `diem_theo_dot_nop` | `slot_id` | `dot_nop_bao_cao_theo_tuan` | `id` | NO ACTION | CASCADE |
| 6 | `doanh_nghiep` | `account_id` | `accounts` | `id` | NO ACTION | CASCADE |
| 7 | `giang_vien` | `account_id` | `accounts` | `id` | NO ACTION | CASCADE |
| 8 | `internship_timeline_milestones` | `dot_thuc_tap_id` | `dot_thuc_tap` | `id` | NO ACTION | CASCADE |
| 9 | `internship_workflow_history` | `changed_by_account_id` | `accounts` | `id` | NO ACTION | SET NULL |
| 10 | `phan_cong_thuc_tap` | `sinh_vien_id` | `sinh_vien` | `id` | NO ACTION | CASCADE |
| 11 | `phan_cong_thuc_tap` | `doanh_nghiep_id` | `doanh_nghiep` | `id` | NO ACTION | CASCADE |
| 12 | `phan_cong_thuc_tap` | `dot_thuc_tap_id` | `dot_thuc_tap` | `id` | NO ACTION | CASCADE |
| 13 | `phan_cong_thuc_tap` | `giang_vien_id` | `giang_vien` | `id` | NO ACTION | SET NULL |
| 14 | `sinh_vien` | `dot_thuc_tap_id` | `dot_thuc_tap` | `id` | CASCADE | SET NULL |
| 15 | `sinh_vien` | `account_id` | `accounts` | `id` | NO ACTION | CASCADE |
| 16 | `sinh_vien_thuc_tap` | `dot_thuc_tap_id` | `dot_thuc_tap` | `id` | NO ACTION | CASCADE |
| 17 | `tin_tuyen_dung` | `doanh_nghiep_id` | `doanh_nghiep` | `id` | NO ACTION | CASCADE |
| 18 | `ung_tuyen` | `sinh_vien_id` | `sinh_vien` | `id` | NO ACTION | CASCADE |
| 19 | `ung_tuyen` | `tin_tuyen_dung_id` | `tin_tuyen_dung` | `id` | NO ACTION | CASCADE |

### 2.2. Quan hệ suy luận theo quy ước tên cột

Các cột dưới đây có dạng `_id` nhưng hiện không có ràng buộc FK khai báo trong MySQL; có thể là liên kết nghiệp vụ hoặc dữ liệu hỗ trợ:

| STT | Bảng | Cột | Gợi ý liên kết |
|---:|---|---|---|
| 1 | `accounts` | `user_id` | Có thể liên kết tới thực thể `user` hoặc bảng nghiệp vụ tương ứng |
| 2 | `dang_ky_thuc_tap_sinh_vien` | `nguoi_duyet_id` | Có thể liên kết tới thực thể `nguoi_duyet` hoặc bảng nghiệp vụ tương ứng |
| 3 | `deadline_reminders` | `submission_period_id` | Có thể liên kết tới thực thể `submission_period` hoặc bảng nghiệp vụ tương ứng |
| 4 | `deadline_reminders` | `student_id` | Có thể liên kết tới thực thể `student` hoặc bảng nghiệp vụ tương ứng |
| 5 | `giang_vien` | `zalo_user_id` | Có thể liên kết tới thực thể `zalo_user` hoặc bảng nghiệp vụ tương ứng |
| 6 | `internship_workflow_history` | `entity_id` | Có thể liên kết tới thực thể `entity` hoặc bảng nghiệp vụ tương ứng |
| 7 | `notifications` | `account_id` | Có thể liên kết tới thực thể `account` hoặc bảng nghiệp vụ tương ứng |
| 8 | `notifications` | `receiver_id` | Có thể liên kết tới thực thể `receiver` hoặc bảng nghiệp vụ tương ứng |
| 9 | `notifications` | `student_id` | Có thể liên kết tới thực thể `student` hoặc bảng nghiệp vụ tương ứng |
| 10 | `sinh_vien` | `zalo_user_id` | Có thể liên kết tới thực thể `zalo_user` hoặc bảng nghiệp vụ tương ứng |
| 11 | `zalo_message_queue` | `lecturer_id` | Có thể liên kết tới thực thể `lecturer` hoặc bảng nghiệp vụ tương ứng |
| 12 | `zalo_message_queue` | `student_id` | Có thể liên kết tới thực thể `student` hoặc bảng nghiệp vụ tương ứng |
| 13 | `zalo_message_queue` | `related_id` | Có thể liên kết tới thực thể `related` hoặc bảng nghiệp vụ tương ứng |

## 3. Mô tả chi tiết các bảng

### 3.1. Bảng `accounts`

**Mô tả:** Bảng tài khoản đăng nhập

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `user_id` | `varchar(50)` | UNIQUE, NOT NULL | Mã đăng nhập |
| 3 | `email` | `varchar(255)` | UNIQUE, NOT NULL | Địa chỉ email dùng để đăng nhập hoặc liên hệ. |
| 4 | `password_hash` | `varchar(255)` | NOT NULL | Thuộc tính password hash của bảng accounts. |
| 5 | `role` | `enum('admin','sinh-vien','giang-vien','doanh-nghiep')` | NOT NULL, INDEX | Vai trò của người dùng trong hệ thống. |
| 6 | `is_active` | `tinyint(1)` | DEFAULT 1, INDEX | Thuộc tính is active của bảng accounts. |
| 7 | `last_login` | `timestamp` | Không bắt buộc | Thuộc tính last login của bảng accounts. |
| 8 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 9 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |

### 3.2. Bảng `admin`

**Mô tả:** Bảng thông tin quản trị viên

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `account_id` | `int` | NOT NULL, FK -> accounts(id) | Mã tài khoản đăng nhập liên kết với hồ sơ. |
| 3 | `full_name` | `varchar(255)` | NOT NULL | Thuộc tính full name của bảng admin. |
| 4 | `phone` | `varchar(20)` | Không bắt buộc | Số điện thoại liên hệ. |
| 5 | `dia_chi` | `varchar(255)` | Không bắt buộc | Địa chỉ liên hệ hoặc địa chỉ đơn vị liên quan. |
| 6 | `position` | `varchar(100)` | Không bắt buộc | Chức vụ quản trị |
| 7 | `permissions` | `json` | Không bắt buộc | Quyền hạn cụ thể |
| 8 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 9 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |

### 3.3. Bảng `bai_nop_cua_sinh_vien`

**Mô tả:** Thực thể bài nộp của sinh viên theo từng đợt nộp báo cáo.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `slot_id` | `int` | NOT NULL, FK -> dot_nop_bao_cao_theo_tuan(id) | Mã đợt/lượt nộp báo cáo liên kết với bài nộp hoặc điểm. |
| 3 | `ma_sinh_vien` | `varchar(20)` | NOT NULL, INDEX | Mã sinh vien dùng để định danh nghiệp vụ. |
| 4 | `file_path` | `varchar(512)` | NOT NULL | Đường dẫn hoặc thông tin tệp được lưu trong hệ thống. |
| 5 | `original_name` | `varchar(255)` | Không bắt buộc | Thuộc tính original name của bảng bai_nop_cua_sinh_vien. |
| 6 | `mime_type` | `varchar(100)` | Không bắt buộc | Thuộc tính mime type của bảng bai_nop_cua_sinh_vien. |
| 7 | `file_size` | `int` | Không bắt buộc | Đường dẫn hoặc thông tin tệp được lưu trong hệ thống. |
| 8 | `submitted_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thuộc tính submitted at của bảng bai_nop_cua_sinh_vien. |
| 9 | `teacher_comment` | `text` | Không bắt buộc | Thuộc tính teacher comment của bảng bai_nop_cua_sinh_vien. |
| 10 | `trang_thai` | `enum('da_nop','da_duyet','tu_choi')` | DEFAULT da_nop | Trạng thái nghiệp vụ của bản ghi. |

### 3.4. Bảng `bao_cao_thuc_tap`

**Mô tả:** Thực thể báo cáo thực tập, lưu nội dung, file báo cáo, nhận xét và trạng thái xử lý.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `phan_cong_id` | `int` | NOT NULL, FK -> phan_cong_thuc_tap(id) | Mã phân công thực tập liên kết với báo cáo/bản ghi. |
| 3 | `loai_bao_cao` | `enum('tuan','thang','cuoi-khoa')` | NOT NULL, INDEX | Thuộc tính loai bao cao của bảng bao_cao_thuc_tap. |
| 4 | `tieu_de` | `varchar(255)` | NOT NULL | Thuộc tính tieu de của bảng bao_cao_thuc_tap. |
| 5 | `noi_dung` | `text` | NOT NULL | Nội dung văn bản/thông báo của bản ghi. |
| 6 | `file_dinh_kem` | `varchar(500)` | Không bắt buộc | Đường dẫn hoặc thông tin tệp được lưu trong hệ thống. |
| 7 | `ngay_nop` | `date` | NOT NULL, INDEX | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 8 | `trang_thai` | `enum('chua-duyet','da-duyet','can-sua')` | DEFAULT chua-duyet, INDEX | Trạng thái nghiệp vụ của bản ghi. |
| 9 | `nhan_xet_gv` | `text` | Không bắt buộc | Mốc hạn xử lý hoặc hạn nộp. |
| 10 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 11 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |

### 3.5. Bảng `dang_ky_thuc_tap_sinh_vien`

**Mô tả:** Thực thể đăng ký thực tập của sinh viên, lưu nguyện vọng, hồ sơ và trạng thái duyệt/phỏng vấn.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `sinh_vien_id` | `int` | NOT NULL, FK -> sinh_vien(id) | Mã sinh viên liên kết với bản ghi. |
| 3 | `nguyen_vong_thuc_tap` | `enum('khoa-gioi-thieu','tu-lien-he')` | NOT NULL, INDEX | Thuộc tính nguyen vong thuc tap của bảng dang_ky_thuc_tap_sinh_vien. |
| 4 | `vi_tri_thuc_tap_mong_muon` | `varchar(255)` | NOT NULL | Thuộc tính vi tri thuc tap mong muon của bảng dang_ky_thuc_tap_sinh_vien. |
| 5 | `ten_cong_ty` | `varchar(255)` | Không bắt buộc | Tên cong ty của bản ghi. |
| 6 | `dia_chi_cong_ty` | `text` | Không bắt buộc | Địa chỉ liên hệ hoặc địa chỉ đơn vị liên quan. |
| 7 | `nguoi_lien_he` | `varchar(255)` | Không bắt buộc | Thuộc tính nguoi lien he của bảng dang_ky_thuc_tap_sinh_vien. |
| 8 | `so_dien_thoai_lien_he` | `varchar(20)` | Không bắt buộc | Số điện thoại liên hệ. |
| 9 | `ghi_chu` | `text` | Không bắt buộc | Ghi chú bổ sung cho nghiệp vụ. |
| 10 | `trang_thai` | `enum('cho-duyet','da-duyet','tu-choi')` | DEFAULT cho-duyet, INDEX | Trạng thái nghiệp vụ của bản ghi. |
| 11 | `workflow_status` | `enum('CHUA_DANG_KY','DA_DANG_KY','CHO_DUYET','DA_DUYET','TU_CHOI','DA_PHAN_CONG','DANG_THUC_TAP','CANH_BAO_TIEN_DO','CHO_NOP_BAO_CAO_CUOI_KY','CHO_CHAM_DIEM','HOAN_THANH','HUY')` | DEFAULT CHO_DUYET, INDEX | Thuộc tính workflow status của bảng dang_ky_thuc_tap_sinh_vien. |
| 12 | `ly_do_tu_choi` | `text` | Không bắt buộc | Lý do xử lý, từ chối hoặc thay đổi trạng thái. |
| 13 | `nguoi_duyet_id` | `int` | Không bắt buộc | Mã liên kết tới thực thể nguoi duyet. |
| 14 | `ngay_duyet` | `datetime` | Không bắt buộc | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 15 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 16 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |
| 17 | `workflow_status_v2` | `enum('PENDING','APPROVED','REJECTED','INTERVIEW_SCHEDULED','PASS','FAIL')` | NOT NULL, DEFAULT PENDING | Thuộc tính workflow status v2 của bảng dang_ky_thuc_tap_sinh_vien. |
| 18 | `interview_date` | `date` | Không bắt buộc | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 19 | `interview_time` | `time` | Không bắt buộc | Thông tin giờ/thời gian phục vụ nghiệp vụ. |
| 20 | `interview_location` | `varchar(255)` | Không bắt buộc | Thuộc tính interview location của bảng dang_ky_thuc_tap_sinh_vien. |
| 21 | `interview_note` | `text` | Không bắt buộc | Ghi chú bổ sung cho nghiệp vụ. |
| 22 | `interview_updated_at` | `datetime` | Không bắt buộc | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 23 | `result_note` | `text` | Không bắt buộc | Ghi chú bổ sung cho nghiệp vụ. |

### 3.6. Bảng `deadline_reminders`

**Mô tả:** Thực thể nhắc hạn nộp báo cáo, tránh gửi trùng thông báo nhắc hạn.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `submission_period_id` | `int` | UNIQUE, NOT NULL, INDEX | Mã liên kết tới thực thể submission period. |
| 3 | `student_id` | `int` | UNIQUE, NOT NULL | Mã sinh viên nhận thông báo hoặc liên quan tới bản ghi. |
| 4 | `type` | `enum('report','diary')` | UNIQUE, NOT NULL | Thuộc tính type của bảng deadline_reminders. |
| 5 | `reminder_type` | `varchar(50)` | UNIQUE, NOT NULL, DEFAULT before_24h | Thuộc tính reminder type của bảng deadline_reminders. |
| 6 | `sent_at` | `datetime` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thuộc tính sent at của bảng deadline_reminders. |
| 7 | `created_at` | `datetime` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |

### 3.7. Bảng `diem_theo_dot_nop`

**Mô tả:** Thực thể điểm theo từng đợt nộp báo cáo của sinh viên.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `slot_id` | `int` | UNIQUE, NOT NULL, FK -> dot_nop_bao_cao_theo_tuan(id) | Mã đợt/lượt nộp báo cáo liên kết với bài nộp hoặc điểm. |
| 3 | `ma_sinh_vien` | `varchar(20)` | UNIQUE, NOT NULL, INDEX | Mã sinh vien dùng để định danh nghiệp vụ. |
| 4 | `diem_giang_vien` | `decimal(4,2)` | Không bắt buộc | Điểm đánh giá hoặc kết quả chấm. |
| 5 | `nhan_xet_giang_vien` | `text` | Không bắt buộc | Mốc hạn xử lý hoặc hạn nộp. |
| 6 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |

### 3.8. Bảng `doanh_nghiep`

**Mô tả:** Bảng thông tin doanh nghiệp

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `account_id` | `int` | NOT NULL, FK -> accounts(id) | Mã tài khoản đăng nhập liên kết với hồ sơ. |
| 3 | `ma_doanh_nghiep` | `varchar(20)` | UNIQUE, NOT NULL | Mã đối tác doanh nghiệp |
| 4 | `ten_cong_ty` | `varchar(255)` | NOT NULL, INDEX | Tên cong ty của bản ghi. |
| 5 | `ten_nguoi_lien_he` | `varchar(255)` | NOT NULL | Tên người đại diện liên hệ |
| 6 | `chuc_vu_nguoi_lien_he` | `varchar(100)` | Không bắt buộc | Chức vụ người liên hệ |
| 7 | `dia_chi_cong_ty` | `text` | NOT NULL | Địa chỉ liên hệ hoặc địa chỉ đơn vị liên quan. |
| 8 | `so_dien_thoai` | `varchar(20)` | NOT NULL | Số điện thoại liên hệ. |
| 9 | `email_cong_ty` | `varchar(255)` | Không bắt buộc | Địa chỉ email dùng để liên hệ hoặc nhận thông báo. |
| 10 | `website` | `varchar(255)` | Không bắt buộc | Thuộc tính website của bảng doanh_nghiep. |
| 11 | `linh_vuc_hoat_dong` | `varchar(255)` | INDEX | Lĩnh vực kinh doanh |
| 12 | `quy_mo_nhan_su` | `varchar(50)` | Không bắt buộc | Quy mô nhân sự (VD: 10-50, 51-200, 200+) |
| 13 | `mo_ta_cong_ty` | `text` | Không bắt buộc | Mô tả chi tiết của bản ghi. |
| 14 | `yeu_cau_thuc_tap` | `text` | Không bắt buộc | Yêu cầu đối với sinh viên thực tập |
| 15 | `so_luong_nhan_thuc_tap` | `int` | DEFAULT 0 | Số lượng sinh viên có thể nhận thực tập |
| 16 | `thoi_gian_thuc_tap` | `varchar(100)` | Không bắt buộc | Thời gian thực tập (VD: 3 tháng, 6 tháng) |
| 17 | `dia_chi_thuc_tap` | `text` | Không bắt buộc | Địa chỉ nơi thực tập (có thể khác với địa chỉ công ty) |
| 18 | `trang_thai_hop_tac` | `enum('Đang hợp tác','Tạm dừng','Ngừng hợp tác')` | DEFAULT Đang hợp tác, INDEX | Thuộc tính trang thai hop tac của bảng doanh_nghiep. |
| 19 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 20 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |
| 21 | `vi_tri_tuyen_dung` | `text` | Không bắt buộc | Thuộc tính vi tri tuyen dung của bảng doanh_nghiep. |

### 3.9. Bảng `dot_nop_bao_cao_theo_tuan`

**Mô tả:** Thực thể đợt/lịch nộp báo cáo theo tuần do giảng viên hoặc hệ thống tạo.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `ma_giang_vien` | `varchar(20)` | NOT NULL, INDEX | Mã giang vien dùng để định danh nghiệp vụ. |
| 3 | `tieu_de` | `varchar(255)` | NOT NULL | Thuộc tính tieu de của bảng dot_nop_bao_cao_theo_tuan. |
| 4 | `loai_bao_cao` | `enum('tuan','thang','cuoi_ky','tong_ket')` | DEFAULT tuan | Thuộc tính loai bao cao của bảng dot_nop_bao_cao_theo_tuan. |
| 5 | `mo_ta` | `text` | Không bắt buộc | Mô tả chi tiết của bản ghi. |
| 6 | `start_at` | `datetime` | NOT NULL | Thuộc tính start at của bảng dot_nop_bao_cao_theo_tuan. |
| 7 | `end_at` | `datetime` | NOT NULL | Thuộc tính end at của bảng dot_nop_bao_cao_theo_tuan. |
| 8 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |

### 3.10. Bảng `dot_thuc_tap`

**Mô tả:** Thực thể đợt thực tập, quản lý thời gian, trạng thái và thông tin tổ chức theo từng đợt.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `ten_dot` | `varchar(255)` | NOT NULL | Tên dot của bản ghi. |
| 3 | `thoi_gian_bat_dau` | `date` | NOT NULL, INDEX | Thuộc tính thoi gian bat dau của bảng dot_thuc_tap. |
| 4 | `thoi_gian_ket_thuc` | `date` | NOT NULL | Thuộc tính thoi gian ket thuc của bảng dot_thuc_tap. |
| 5 | `mo_ta` | `text` | Không bắt buộc | Mô tả chi tiết của bản ghi. |
| 6 | `trang_thai` | `enum('sap-mo','dang-dien-ra','ket-thuc')` | DEFAULT sap-mo, INDEX | Trạng thái nghiệp vụ của bản ghi. |
| 7 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 8 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |
| 9 | `so_sinh_vien_tham_gia` | `int` | NOT NULL, DEFAULT 0 | Thuộc tính so sinh vien tham gia của bảng dot_thuc_tap. |
| 10 | `so_giang_vien_huong_dan` | `int` | NOT NULL, DEFAULT 0 | Thuộc tính so giang vien huong dan của bảng dot_thuc_tap. |
| 11 | `so_doanh_nghiep_tham_gia` | `int` | NOT NULL, DEFAULT 0 | Thuộc tính so doanh nghiep tham gia của bảng dot_thuc_tap. |
| 12 | `so_sinh_vien_excel` | `int` | DEFAULT 0 | Thuộc tính so sinh vien excel của bảng dot_thuc_tap. |
| 13 | `so_giang_vien_excel` | `int` | DEFAULT 0 | Thuộc tính so giang vien excel của bảng dot_thuc_tap. |
| 14 | `so_doanh_nghiep_excel` | `int` | DEFAULT 0 | Thuộc tính so doanh nghiep excel của bảng dot_thuc_tap. |
| 15 | `thoi_gian_dang_ky_tu` | `date` | Không bắt buộc | Thuộc tính thoi gian dang ky tu của bảng dot_thuc_tap. |
| 16 | `thoi_gian_dang_ky_den` | `date` | Không bắt buộc | Thuộc tính thoi gian dang ky den của bảng dot_thuc_tap. |
| 17 | `khoa_hoc_ap_dung` | `varchar(50)` | Không bắt buộc | Thuộc tính khoa hoc ap dung của bảng dot_thuc_tap. |
| 18 | `lop_ap_dung` | `varchar(50)` | Không bắt buộc | Thuộc tính lop ap dung của bảng dot_thuc_tap. |
| 19 | `thoi_gian_thuc_tap_dot_1_tu` | `date` | Không bắt buộc | Thuộc tính thoi gian thuc tap dot 1 tu của bảng dot_thuc_tap. |
| 20 | `thoi_gian_thuc_tap_dot_1_den` | `date` | Không bắt buộc | Thuộc tính thoi gian thuc tap dot 1 den của bảng dot_thuc_tap. |
| 21 | `thoi_gian_thuc_tap_dot_2_tu` | `date` | Không bắt buộc | Thuộc tính thoi gian thuc tap dot 2 tu của bảng dot_thuc_tap. |
| 22 | `thoi_gian_thuc_tap_dot_2_den` | `date` | Không bắt buộc | Thuộc tính thoi gian thuc tap dot 2 den của bảng dot_thuc_tap. |
| 23 | `dot_nho_config` | `longtext` | Không bắt buộc | Thuộc tính dot nho config của bảng dot_thuc_tap. |

### 3.11. Bảng `giang_vien`

**Mô tả:** Bảng thông tin giảng viên

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `account_id` | `int` | NOT NULL, FK -> accounts(id) | Mã tài khoản đăng nhập liên kết với hồ sơ. |
| 3 | `ma_giang_vien` | `varchar(20)` | UNIQUE, NOT NULL | Mã giảng viên |
| 4 | `ho_ten` | `varchar(255)` | NOT NULL | Họ tên của người dùng/sinh viên/giảng viên liên quan. |
| 5 | `khoa` | `varchar(100)` | NOT NULL, INDEX | Thuộc tính khoa của bảng giang_vien. |
| 6 | `bo_mon` | `varchar(100)` | INDEX | Thuộc tính bo mon của bảng giang_vien. |
| 7 | `chuc_vu` | `varchar(100)` | Không bắt buộc | Chức vụ (Giảng viên, Phó trưởng khoa, Trưởng khoa, ...) |
| 8 | `hoc_vi` | `varchar(50)` | Không bắt buộc | Học vị (Thạc sĩ, Tiến sĩ, ...) |
| 9 | `chuyen_mon` | `text` | Không bắt buộc | Chuyên môn, lĩnh vực nghiên cứu |
| 10 | `so_dien_thoai` | `varchar(20)` | Không bắt buộc | Số điện thoại liên hệ. |
| 11 | `email_ca_nhan` | `varchar(255)` | Không bắt buộc | Địa chỉ email dùng để liên hệ hoặc nhận thông báo. |
| 12 | `dia_chi` | `text` | Không bắt buộc | Địa chỉ liên hệ hoặc địa chỉ đơn vị liên quan. |
| 13 | `kinh_nghiem_lam_viec` | `text` | Không bắt buộc | Thuộc tính kinh nghiem lam viec của bảng giang_vien. |
| 14 | `bang_cap` | `text` | Không bắt buộc | Các bằng cấp đã có |
| 15 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 16 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |
| 17 | `zalo_user_id` | `varchar(100)` | Không bắt buộc | Thông tin liên kết hoặc gửi nhận qua Zalo. |
| 18 | `ngay_sinh` | `date` | Không bắt buộc | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 19 | `chuc_danh` | `varchar(100)` | Không bắt buộc | Thuộc tính chuc danh của bảng giang_vien. |
| 20 | `can_cuoc_cong_dan` | `varchar(20)` | Không bắt buộc | Thuộc tính can cuoc cong dan của bảng giang_vien. |

### 3.12. Bảng `internship_timeline_milestones`

**Mô tả:** Thực thể mốc thời gian trong quy trình thực tập của từng đợt.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `dot_thuc_tap_id` | `int` | UNIQUE, NOT NULL, FK -> dot_thuc_tap(id) | Mã đợt thực tập liên kết với bản ghi. |
| 3 | `moc_code` | `enum('M1','M2','M3','M4','M5','M6')` | UNIQUE, NOT NULL | Thuộc tính moc code của bảng internship_timeline_milestones. |
| 4 | `ten_moc` | `varchar(255)` | NOT NULL | Tên moc của bản ghi. |
| 5 | `start_at` | `datetime` | NOT NULL, INDEX | Thuộc tính start at của bảng internship_timeline_milestones. |
| 6 | `end_at` | `datetime` | NOT NULL | Thuộc tính end at của bảng internship_timeline_milestones. |
| 7 | `sort_order` | `tinyint` | NOT NULL | Thuộc tính sort order của bảng internship_timeline_milestones. |
| 8 | `owner_roles` | `varchar(255)` | Không bắt buộc | Thuộc tính owner roles của bảng internship_timeline_milestones. |
| 9 | `recipient_roles` | `varchar(255)` | Không bắt buộc | Thuộc tính recipient roles của bảng internship_timeline_milestones. |
| 10 | `reminder_offsets` | `varchar(255)` | Không bắt buộc | Thuộc tính reminder offsets của bảng internship_timeline_milestones. |
| 11 | `is_required` | `tinyint(1)` | NOT NULL, DEFAULT 1 | Thuộc tính is required của bảng internship_timeline_milestones. |
| 12 | `is_active` | `tinyint(1)` | NOT NULL, DEFAULT 1, INDEX | Thuộc tính is active của bảng internship_timeline_milestones. |
| 13 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 14 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |

### 3.13. Bảng `internship_workflow_history`

**Mô tả:** Thực thể lịch sử thay đổi trạng thái/quy trình thực tập.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `bigint` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `entity_type` | `enum('dang_ky_thuc_tap_sinh_vien','phan_cong_thuc_tap')` | NOT NULL, INDEX | Thuộc tính entity type của bảng internship_workflow_history. |
| 3 | `entity_id` | `int` | NOT NULL | Mã liên kết tới thực thể entity. |
| 4 | `from_status` | `varchar(50)` | INDEX | Thuộc tính from status của bảng internship_workflow_history. |
| 5 | `to_status` | `varchar(50)` | NOT NULL | Thuộc tính to status của bảng internship_workflow_history. |
| 6 | `changed_by_account_id` | `int` | FK -> accounts(id) | Mã tài khoản thực hiện thay đổi trạng thái/quy trình. |
| 7 | `changed_by_role` | `varchar(30)` | Không bắt buộc | Mốc hạn xử lý hoặc hạn nộp. |
| 8 | `note` | `text` | Không bắt buộc | Ghi chú bổ sung cho nghiệp vụ. |
| 9 | `changed_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP, INDEX | Mốc hạn xử lý hoặc hạn nộp. |

### 3.14. Bảng `notifications`

**Mô tả:** Thực thể thông báo trong hệ thống gửi tới người dùng.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `account_id` | `int` | NOT NULL, INDEX | accounts.id của người nhận |
| 3 | `title` | `varchar(255)` | NOT NULL | Thuộc tính title của bảng notifications. |
| 4 | `message` | `text` | NOT NULL | Nội dung văn bản/thông báo của bản ghi. |
| 5 | `type` | `enum('info','success','warning','error')` | NOT NULL, DEFAULT info | Thuộc tính type của bảng notifications. |
| 6 | `is_read` | `tinyint(1)` | NOT NULL, DEFAULT 0, INDEX | Thuộc tính is read của bảng notifications. |
| 7 | `action_type` | `varchar(100)` | Không bắt buộc | Thuộc tính action type của bảng notifications. |
| 8 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP, INDEX | Thời điểm tạo bản ghi. |
| 9 | `receiver_id` | `int` | INDEX | accounts.id cua nguoi nhan |
| 10 | `student_id` | `int` | INDEX | sinh_vien.id neu nguoi nhan la sinh vien |

### 3.15. Bảng `phan_cong_thuc_tap`

**Mô tả:** Thực thể phân công thực tập, liên kết sinh viên với giảng viên, doanh nghiệp và đợt thực tập.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `sinh_vien_id` | `int` | NOT NULL, FK -> sinh_vien(id) | Mã sinh viên liên kết với bản ghi. |
| 3 | `doanh_nghiep_id` | `int` | NOT NULL, FK -> doanh_nghiep(id) | Mã doanh nghiệp liên kết với bản ghi. |
| 4 | `dot_thuc_tap_id` | `int` | NOT NULL, FK -> dot_thuc_tap(id) | Mã đợt thực tập liên kết với bản ghi. |
| 5 | `giang_vien_id` | `int` | FK -> giang_vien(id) | Mã giảng viên liên kết với bản ghi. |
| 6 | `ngay_bat_dau` | `date` | NOT NULL | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 7 | `ngay_ket_thuc` | `date` | NOT NULL | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 8 | `trang_thai` | `enum('chua-bat-dau','dang-dien-ra','hoan-thanh','tam-dung')` | DEFAULT chua-bat-dau, INDEX | Trạng thái nghiệp vụ của bản ghi. |
| 9 | `workflow_status` | `enum('CHUA_DANG_KY','DA_DANG_KY','CHO_DUYET','DA_DUYET','TU_CHOI','DA_PHAN_CONG','DANG_THUC_TAP','CANH_BAO_TIEN_DO','CHO_NOP_BAO_CAO_CUOI_KY','CHO_CHAM_DIEM','HOAN_THANH','HUY')` | DEFAULT DA_PHAN_CONG, INDEX | Thuộc tính workflow status của bảng phan_cong_thuc_tap. |
| 10 | `workflow_updated_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 11 | `diem_so` | `decimal(3,1)` | Không bắt buộc | Điểm đánh giá hoặc kết quả chấm. |
| 12 | `nhan_xet` | `text` | Không bắt buộc | Mốc hạn xử lý hoặc hạn nộp. |
| 13 | `ngay_nop_danh_gia` | `timestamp` | Không bắt buộc | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 14 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 15 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |
| 16 | `diem_giang_vien` | `decimal(4,2)` | Không bắt buộc | Điểm đánh giá hoặc kết quả chấm. |
| 17 | `nhan_xet_giang_vien` | `text` | Không bắt buộc | Mốc hạn xử lý hoặc hạn nộp. |

### 3.16. Bảng `sinh_vien`

**Mô tả:** Bảng thông tin sinh viên

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `account_id` | `int` | NOT NULL, FK -> accounts(id) | Mã tài khoản đăng nhập liên kết với hồ sơ. |
| 3 | `ma_sinh_vien` | `varchar(20)` | UNIQUE, NOT NULL | Mã sinh viên |
| 4 | `ho_ten` | `varchar(255)` | NOT NULL | Họ tên của người dùng/sinh viên/giảng viên liên quan. |
| 5 | `lop` | `varchar(50)` | INDEX | Thuộc tính lop của bảng sinh_vien. |
| 6 | `khoa` | `varchar(100)` | INDEX | Thuộc tính khoa của bảng sinh_vien. |
| 7 | `nganh` | `varchar(100)` | Không bắt buộc | Thuộc tính nganh của bảng sinh_vien. |
| 8 | `khoa_hoc` | `varchar(20)` | Không bắt buộc | Khóa học (VD: K17, K18) |
| 9 | `ngay_sinh` | `date` | Không bắt buộc | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 10 | `gioi_tinh` | `enum('Nam','Nữ','Khác')` | Không bắt buộc | Thông tin giờ/thời gian phục vụ nghiệp vụ. |
| 11 | `dia_chi` | `text` | Không bắt buộc | Địa chỉ liên hệ hoặc địa chỉ đơn vị liên quan. |
| 12 | `so_dien_thoai` | `varchar(20)` | Không bắt buộc | Số điện thoại liên hệ. |
| 13 | `email_ca_nhan` | `varchar(255)` | Không bắt buộc | Địa chỉ email dùng để liên hệ hoặc nhận thông báo. |
| 14 | `gpa` | `decimal(3,2)` | Không bắt buộc | Điểm trung bình tích lũy |
| 15 | `so_tc_tich_luy` | `int` | Không bắt buộc | Thuộc tính so tc tich luy của bảng sinh_vien. |
| 16 | `so_tc_ht` | `int` | Không bắt buộc | Thuộc tính so tc ht của bảng sinh_vien. |
| 17 | `nam_thu` | `int` | Không bắt buộc | Thuộc tính nam thu của bảng sinh_vien. |
| 18 | `hp_no` | `int` | Không bắt buộc | Thuộc tính hp no của bảng sinh_vien. |
| 19 | `tinh_trang_hoc_tap` | `enum('Đang học','Tạm nghỉ','Thôi học','Tốt nghiệp')` | DEFAULT Đang học | Thuộc tính tinh trang hoc tap của bảng sinh_vien. |
| 20 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 21 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |
| 22 | `giang_vien_huong_dan` | `varchar(255)` | INDEX | Thuộc tính giang vien huong dan của bảng sinh_vien. |
| 23 | `nguyen_vong_thuc_tap` | `varchar(50)` | Không bắt buộc | Thuộc tính nguyen vong thuc tap của bảng sinh_vien. |
| 24 | `vi_tri_muon_ung_tuyen_thuc_tap` | `varchar(255)` | Không bắt buộc | Thuộc tính vi tri muon ung tuyen thuc tap của bảng sinh_vien. |
| 25 | `don_vi_thuc_tap` | `varchar(255)` | Không bắt buộc | Thuộc tính don vi thuc tap của bảng sinh_vien. |
| 26 | `cong_ty_tu_lien_he` | `varchar(255)` | Không bắt buộc | Thuộc tính cong ty tu lien he của bảng sinh_vien. |
| 27 | `dia_chi_cong_ty` | `text` | Không bắt buộc | Địa chỉ liên hệ hoặc địa chỉ đơn vị liên quan. |
| 28 | `nguoi_lien_he_cong_ty` | `varchar(255)` | Không bắt buộc | Thuộc tính nguoi lien he cong ty của bảng sinh_vien. |
| 29 | `sdt_nguoi_lien_he` | `varchar(20)` | Không bắt buộc | Số điện thoại liên hệ. |
| 30 | `cv_path` | `varchar(500)` | Không bắt buộc | Đường dẫn hoặc thông tin tệp được lưu trong hệ thống. |
| 31 | `zalo_user_id` | `varchar(100)` | Không bắt buộc | Thông tin liên kết hoặc gửi nhận qua Zalo. |
| 32 | `trang_thai_phan_cong` | `enum('da-phan-cong','chua-phan-cong')` | DEFAULT chua-phan-cong | Mốc hạn xử lý hoặc hạn nộp. |
| 33 | `dot_thuc_tap_admin` | `enum('dot-1','dot-2')` | Không bắt buộc | Thuộc tính dot thuc tap admin của bảng sinh_vien. |
| 34 | `dot_thuc_tap_id` | `int` | FK -> dot_thuc_tap(id) | Mã đợt thực tập liên kết với bản ghi. |

### 3.17. Bảng `sinh_vien_thuc_tap`

**Mô tả:** Thực thể danh sách sinh viên tham gia một đợt thực tập.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `ma_sinh_vien` | `varchar(20)` | UNIQUE, NOT NULL, INDEX | Mã sinh vien dùng để định danh nghiệp vụ. |
| 3 | `dot_thuc_tap_id` | `int` | UNIQUE, NOT NULL, FK -> dot_thuc_tap(id) | Mã đợt thực tập liên kết với bản ghi. |
| 4 | `ngay_dang_ky` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 5 | `trang_thai` | `enum('dang-ky','duoc-phan-cong','hoan-thanh','huy')` | DEFAULT dang-ky | Trạng thái nghiệp vụ của bản ghi. |

### 3.18. Bảng `tin_tuyen_dung`

**Mô tả:** Thực thể tin/vị trí tuyển dụng thực tập do doanh nghiệp đăng.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `doanh_nghiep_id` | `int` | NOT NULL, FK -> doanh_nghiep(id) | Mã doanh nghiệp liên kết với bản ghi. |
| 3 | `tieu_de` | `varchar(255)` | NOT NULL | Thuộc tính tieu de của bảng tin_tuyen_dung. |
| 4 | `mo_ta_cong_viec` | `text` | NOT NULL | Mô tả chi tiết của bản ghi. |
| 5 | `yeu_cau` | `text` | NOT NULL | Thuộc tính yeu cau của bảng tin_tuyen_dung. |
| 6 | `so_luong_tuyen` | `int` | DEFAULT 1 | Thuộc tính so luong tuyen của bảng tin_tuyen_dung. |
| 7 | `muc_luong` | `varchar(100)` | Không bắt buộc | Thuộc tính muc luong của bảng tin_tuyen_dung. |
| 8 | `hinh_thuc_lam_viec` | `varchar(100)` | Không bắt buộc | Thuộc tính hinh thuc lam viec của bảng tin_tuyen_dung. |
| 9 | `dia_diem` | `varchar(255)` | Không bắt buộc | Điểm đánh giá hoặc kết quả chấm. |
| 10 | `han_ung_tuyen` | `date` | INDEX | Mốc hạn xử lý hoặc hạn nộp. |
| 11 | `trang_thai` | `enum('dang-tuyen','tam-dung','het-han')` | DEFAULT dang-tuyen, INDEX | Trạng thái nghiệp vụ của bản ghi. |
| 12 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 13 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |

### 3.19. Bảng `ung_tuyen`

**Mô tả:** Thực thể ứng tuyển của sinh viên vào tin tuyển dụng/vị trí thực tập.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `sinh_vien_id` | `int` | UNIQUE, NOT NULL, FK -> sinh_vien(id) | Mã sinh viên liên kết với bản ghi. |
| 3 | `tin_tuyen_dung_id` | `int` | UNIQUE, NOT NULL, FK -> tin_tuyen_dung(id) | Mã tin tuyển dụng/vị trí thực tập liên kết với ứng tuyển. |
| 4 | `thu_xin_viec` | `text` | NOT NULL | Thuộc tính thu xin viec của bảng ung_tuyen. |
| 5 | `cv_file` | `varchar(500)` | Không bắt buộc | Đường dẫn hoặc thông tin tệp được lưu trong hệ thống. |
| 6 | `ngay_ung_tuyen` | `date` | NOT NULL | Thông tin ngày/thời điểm phục vụ nghiệp vụ. |
| 7 | `trang_thai` | `enum('dang-cho','duoc-chap-nhan','bi-tu-choi')` | DEFAULT dang-cho, INDEX | Trạng thái nghiệp vụ của bản ghi. |
| 8 | `ghi_chu` | `text` | Không bắt buộc | Ghi chú bổ sung cho nghiệp vụ. |
| 9 | `created_at` | `timestamp` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 10 | `updated_at` | `timestamp` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |

### 3.20. Bảng `zalo_message_queue`

**Mô tả:** Thực thể hàng đợi gửi tin nhắn Zalo, phục vụ gửi thông báo tuần tự.

| STT | Tên cột | Kiểu dữ liệu | Ràng buộc | Mô tả |
|---:|---|---|---|---|
| 1 | `id` | `int` | PRIMARY KEY, NOT NULL, AUTO_INCREMENT | Khóa định danh duy nhất của bản ghi. |
| 2 | `lecturer_id` | `int` | Không bắt buộc | Mã liên kết tới thực thể lecturer. |
| 3 | `student_id` | `int` | UNIQUE, NOT NULL, INDEX | Mã sinh viên nhận thông báo hoặc liên quan tới bản ghi. |
| 4 | `phone` | `varchar(20)` | Không bắt buộc | Số điện thoại liên hệ. |
| 5 | `title` | `varchar(255)` | NOT NULL | Thuộc tính title của bảng zalo_message_queue. |
| 6 | `message` | `text` | NOT NULL | Nội dung văn bản/thông báo của bản ghi. |
| 7 | `type` | `enum('new_report_period','new_diary_period','deadline_24h_reminder','manual')` | UNIQUE, NOT NULL | Thuộc tính type của bảng zalo_message_queue. |
| 8 | `related_id` | `int` | UNIQUE | Mã liên kết tới thực thể related. |
| 9 | `status` | `enum('pending','processing','sent','failed','cancelled')` | DEFAULT pending | Trạng thái hoạt động hoặc trạng thái xử lý của bản ghi. |
| 10 | `priority` | `int` | DEFAULT 5 | Thuộc tính priority của bảng zalo_message_queue. |
| 11 | `scheduled_at` | `datetime` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thuộc tính scheduled at của bảng zalo_message_queue. |
| 12 | `sent_at` | `datetime` | Không bắt buộc | Thuộc tính sent at của bảng zalo_message_queue. |
| 13 | `failed_reason` | `text` | Không bắt buộc | Lý do xử lý, từ chối hoặc thay đổi trạng thái. |
| 14 | `retry_count` | `int` | DEFAULT 0 | Thuộc tính retry count của bảng zalo_message_queue. |
| 15 | `created_at` | `datetime` | DEFAULT_GENERATED, DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo bản ghi. |
| 16 | `updated_at` | `datetime` | DEFAULT_GENERATED ON UPDATE CURRENT_TIMESTAMP, DEFAULT CURRENT_TIMESTAMP | Thời điểm cập nhật bản ghi gần nhất. |
