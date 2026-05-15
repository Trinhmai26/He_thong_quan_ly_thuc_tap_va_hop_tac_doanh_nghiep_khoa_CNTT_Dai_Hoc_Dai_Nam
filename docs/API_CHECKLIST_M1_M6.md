# API Checklist theo moc M1-M6

Tai lieu nay la checklist trien khai API de team code thang theo 6 moc timeline bat buoc.
Phan status chuan hoa dung bo sau:

- CHUA_DANG_KY
- DA_DANG_KY
- CHO_DUYET
- DA_DUYET
- TU_CHOI
- DA_PHAN_CONG
- DANG_THUC_TAP
- CANH_BAO_TIEN_DO
- CHO_NOP_BAO_CAO_CUOI_KY
- CHO_CHAM_DIEM
- HOAN_THANH
- HUY

## M1 - Mo dang ky
Muc tieu: cho phep sinh vien tao/submit ho so dang ky.

- [ ] `GET /api/timeline/current?dot_thuc_tap_id={id}`
- [ ] `GET /api/registration-periods/status`
- [ ] `POST /api/sinh-vien/register-internship`
- [ ] `GET /api/sinh-vien/my-registration`
- [ ] `PATCH /api/workflow/dang-ky/{id}/status` -> `DA_DANG_KY` or `CHO_DUYET`

Kiem tra bat buoc:
- [ ] Role `sinh-vien`
- [ ] Moc hien tai thuoc `M1` (hoac dau M2 neu mo gia han)
- [ ] Validate truong bat buoc theo kieu dang ky
- [ ] Ghi lich su vao `internship_workflow_history`

## M2 - Dong dang ky
Muc tieu: khoa dang ky moi va xu ly qua han.

- [ ] `POST /api/timeline/{dot_thuc_tap_id}/close-registration`
- [ ] `GET /api/admin/registrations?status=DA_DANG_KY,CHO_DUYET`
- [ ] `POST /api/notifications/remind-overdue-registration`

Kiem tra bat buoc:
- [ ] Role `admin`
- [ ] Chi cho phep tai moc `M2`
- [ ] Ho so chua submit duoc chuyen huong/nhac viec

## M3 - Han duyet ho so
Muc tieu: duyet/tu choi toan bo ho so ton.

- [ ] `GET /api/admin/registrations/pending`
- [ ] `PATCH /api/workflow/dang-ky/{id}/status` -> `DA_DUYET`
- [ ] `PATCH /api/workflow/dang-ky/{id}/status` -> `TU_CHOI`
- [ ] `POST /api/notifications/remind-reviewers`

Kiem tra bat buoc:
- [ ] Role `admin` hoac `giang-vien` (theo pham vi duoc giao)
- [ ] Bat buoc `ly_do_tu_choi` neu target = `TU_CHOI`
- [ ] Cam transition sai (vi du `CHO_DUYET` -> `HOAN_THANH`)

## M4 - Han phan cong GV/DN
Muc tieu: hoan tat phan cong thu cong hoac tu dong.

- [ ] `POST /api/auto-assignment`
- [ ] `POST /api/assignments`
- [ ] `PUT /api/assignments/{id}` (update giang_vien/doanh_nghiep/status)
- [ ] `PATCH /api/workflow/assignment/{id}/status` -> `DA_PHAN_CONG` or `DANG_THUC_TAP`

Kiem tra bat buoc:
- [ ] Role `admin`
- [ ] Chi xu ly ho so `DA_DUYET`
- [ ] Ensure khong over-capacity doanh nghiep
- [ ] Ensure giang vien duoc can bang tai

## M5 - Han nop bao cao cuoi ky
Muc tieu: mo nộp bao cao cuoi ky, theo doi tien do, canh bao cham.

- [ ] `GET /api/report-batches/current`
- [ ] `POST /api/student-reports/upload`
- [ ] `GET /api/student-reports/statistics/{ma_sinh_vien}`
- [ ] `PATCH /api/workflow/assignment/{id}/status` -> `CHO_NOP_BAO_CAO_CUOI_KY` / `CHO_CHAM_DIEM`
- [ ] `POST /api/notifications/remind-final-report`

Kiem tra bat buoc:
- [ ] Role `sinh-vien` cho upload
- [ ] Role `giang-vien`/`admin` cho theo doi tong hop
- [ ] Validate cua so thoi gian nộp
- [ ] Validate loai file + dung luong

## M6 - Han cham diem va chot ket qua
Muc tieu: cham diem, chot ket qua dot, dong workflow.

- [ ] `POST /api/reports/final/{id}/grade-teacher`
- [ ] `POST /api/reports/final/{id}/grade-company`
- [ ] `POST /api/admin/reports/{id}/finalize`
- [ ] `PATCH /api/workflow/assignment/{id}/status` -> `HOAN_THANH`
- [ ] `GET /api/internship-reports/class-stats`
- [ ] `GET /api/internship-reports/export-all`

Kiem tra bat buoc:
- [ ] Role `giang-vien` + `doanh-nghiep` cham diem
- [ ] Role `admin` chot diem cuoi
- [ ] Cam chot ket qua neu thieu diem bat buoc
- [ ] Ghi log transition va nguoi thao tac

## Checklist ky thuat chung cho tat ca API

- [ ] Ap dung middleware `authenticateToken`
- [ ] Ap dung RBAC (`requireRole`)
- [ ] Ap dung middleware `validateInternshipWorkflowTransition`
- [ ] Tra response format thong nhat `success/message/data`
- [ ] Log transition vao `internship_workflow_history`
- [ ] Viet test case transition hop le va khong hop le
- [ ] Swagger update cho endpoint workflow + timeline

## Mapping endpoint uu tien cho sprint dau

- [ ] `PATCH /api/workflow/dang-ky/:id/status`
- [ ] `PATCH /api/workflow/assignment/:id/status`
- [ ] `GET /api/timeline/current`
- [ ] `POST /api/timeline/:dot_thuc_tap_id/bootstrap-m1-m6`
- [ ] `POST /api/timeline/:dot_thuc_tap_id/reminders/dispatch`
