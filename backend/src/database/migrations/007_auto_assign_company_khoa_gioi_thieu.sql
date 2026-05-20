-- Migration: 007_auto_assign_company_khoa_gioi_thieu.sql
-- Muc tieu:
-- Tu dong gan doanh nghiep thuc tap cho sinh vien co nguyen vong "Khoa gioi thieu"
-- va chua co doanh nghiep (don_vi_thuc_tap = NULL hoac rong).
-- Cap nhat trang_thai sang "da-duyet" va workflow_status_v2 sang "APPROVED"
-- de sinh vien xuat hien trong buoc "Doanh nghiep phong van".
--
-- KHONG anh huong den:
-- - Sinh vien co nguyen vong "Tu lien he"
-- - Sinh vien chua chon nguyen vong
-- - Sinh vien da co don_vi_thuc_tap
-- - Toan bo logic phan cong GV, chon dot, import/export, tu choi, cho duyet

-- ============================================================
-- BUOC 0: Kiem tra gia tri thuc te trong database (chay truoc de biet format)
-- ============================================================

-- 0a. Xem cac gia tri khac nhau dang luu trong nguyen_vong_thuc_tap
SELECT 'GIA TRI NGUYEN_VONG_THUC_TAP TRONG DB:' AS info;
SELECT nguyen_vong_thuc_tap, COUNT(*) AS so_luong
FROM sinh_vien
WHERE nguyen_vong_thuc_tap IS NOT NULL AND nguyen_vong_thuc_tap != ''
GROUP BY nguyen_vong_thuc_tap
ORDER BY so_luong DESC;

-- 0b. Sinh vien can gan (ho tro ca underscore va hyphen format)
SELECT 'TRUOC KHI CHAY - Sinh vien Khoa gioi thieu chua co DN:' AS info;
SELECT COUNT(*) AS so_sinh_vien_can_gan
FROM sinh_vien
WHERE nguyen_vong_thuc_tap IN ('khoa_gioi_thieu', 'khoa-gioi-thieu')
  AND (don_vi_thuc_tap IS NULL OR don_vi_thuc_tap = '');

SELECT 'Danh sach doanh nghiep co san:' AS info;
SELECT id, ten_cong_ty, so_luong_nhan_thuc_tap
FROM doanh_nghiep
WHERE ten_cong_ty IS NOT NULL AND ten_cong_ty != ''
ORDER BY id;

-- ============================================================
-- BUOC 1: Gan doanh nghiep round-robin
-- (Chi chay phan TRANSACTION nay khi ban da kiem tra xong)
-- ============================================================

START TRANSACTION;

-- Tao bang tam: sinh vien can gan (ho tro ca 'khoa_gioi_thieu' va 'khoa-gioi-thieu')
DROP TEMPORARY TABLE IF EXISTS _tmp_sv_assign;
CREATE TEMPORARY TABLE _tmp_sv_assign AS
SELECT
  ROW_NUMBER() OVER (ORDER BY sv.id) AS rn,
  sv.id                               AS sv_id,
  sv.vi_tri_muon_ung_tuyen_thuc_tap   AS vi_tri
FROM sinh_vien sv
WHERE sv.nguyen_vong_thuc_tap IN ('khoa_gioi_thieu', 'khoa-gioi-thieu')
  AND (sv.don_vi_thuc_tap IS NULL OR sv.don_vi_thuc_tap = '');

-- Tao bang tam: doanh nghiep (co so thu tu)
DROP TEMPORARY TABLE IF EXISTS _tmp_dn_assign;
CREATE TEMPORARY TABLE _tmp_dn_assign AS
SELECT
  ROW_NUMBER() OVER (ORDER BY dn.id) AS rn,
  dn.ten_cong_ty
FROM doanh_nghiep dn
WHERE dn.ten_cong_ty IS NOT NULL AND dn.ten_cong_ty != ''
ORDER BY dn.id;

-- Lay tong so doanh nghiep
SET @dn_count = (SELECT COUNT(*) FROM _tmp_dn_assign);

-- ---------------------------------------------------
-- 1a. Cap nhat sinh_vien.don_vi_thuc_tap
-- ---------------------------------------------------
UPDATE sinh_vien sv
INNER JOIN _tmp_sv_assign ts   ON sv.id = ts.sv_id
INNER JOIN _tmp_dn_assign tdn  ON tdn.rn = ((ts.rn - 1) % @dn_count) + 1
SET sv.don_vi_thuc_tap = tdn.ten_cong_ty,
    sv.updated_at      = NOW();

-- ---------------------------------------------------
-- 1b. Cap nhat ban ghi HIEN CO trong dang_ky_thuc_tap_sinh_vien
--     (chi cap nhat ban ghi moi nhat cua tung sinh vien)
-- ---------------------------------------------------
UPDATE dang_ky_thuc_tap_sinh_vien dk
INNER JOIN (
  -- Ban ghi moi nhat cua tung sinh vien
  SELECT sinh_vien_id, MAX(id) AS latest_id
  FROM dang_ky_thuc_tap_sinh_vien
  GROUP BY sinh_vien_id
) AS latest ON dk.id = latest.latest_id
INNER JOIN _tmp_sv_assign ts  ON dk.sinh_vien_id = ts.sv_id
INNER JOIN _tmp_dn_assign tdn ON tdn.rn = ((ts.rn - 1) % @dn_count) + 1
SET dk.trang_thai            = 'da-duyet',
    dk.workflow_status_v2    = 'APPROVED',
    dk.nguyen_vong_thuc_tap  = 'khoa-gioi-thieu',
    dk.ten_cong_ty           = tdn.ten_cong_ty,
    dk.ngay_duyet            = NOW(),
    dk.updated_at            = NOW();

-- ---------------------------------------------------
-- 1c. Tao ban ghi MOI cho sinh vien CHUA co record
-- ---------------------------------------------------
INSERT INTO dang_ky_thuc_tap_sinh_vien
  (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon,
   ten_cong_ty, trang_thai, workflow_status_v2, ngay_duyet, created_at, updated_at)
SELECT
  ts.sv_id,
  'khoa-gioi-thieu',
  COALESCE(ts.vi_tri, ''),
  tdn.ten_cong_ty,
  'da-duyet',
  'APPROVED',
  NOW(), NOW(), NOW()
FROM _tmp_sv_assign ts
INNER JOIN _tmp_dn_assign tdn ON tdn.rn = ((ts.rn - 1) % @dn_count) + 1
WHERE NOT EXISTS (
  SELECT 1
  FROM dang_ky_thuc_tap_sinh_vien dk2
  WHERE dk2.sinh_vien_id = ts.sv_id
);

-- Doc dep bang tam
DROP TEMPORARY TABLE IF EXISTS _tmp_sv_assign;
DROP TEMPORARY TABLE IF EXISTS _tmp_dn_assign;

COMMIT;

-- ============================================================
-- BUOC 2: Kiem tra sau khi chay
-- ============================================================
SELECT 'SAU KHI CHAY - Sinh vien Khoa gioi thieu da duoc gan DN:' AS info;
SELECT
  sv.ma_sinh_vien,
  sv.ho_ten,
  sv.nguyen_vong_thuc_tap,
  sv.don_vi_thuc_tap,
  dk.trang_thai,
  dk.workflow_status_v2
FROM sinh_vien sv
LEFT JOIN (
  SELECT sinh_vien_id, trang_thai, workflow_status_v2
  FROM dang_ky_thuc_tap_sinh_vien
  WHERE id IN (
    SELECT MAX(id) FROM dang_ky_thuc_tap_sinh_vien GROUP BY sinh_vien_id
  )
) dk ON dk.sinh_vien_id = sv.id
WHERE sv.nguyen_vong_thuc_tap IN ('khoa_gioi_thieu', 'khoa-gioi-thieu')
ORDER BY sv.ma_sinh_vien
LIMIT 30;
