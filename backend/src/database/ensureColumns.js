const db = require('./connection');

async function columnExists(table, column) {
  const sql = `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`;
  const rows = await db.query(sql, [table, column]);
  return rows && rows[0] && rows[0].cnt > 0;
}

async function ensureSinhVienColumns() {
  const defs = [
    { name: 'nguyen_vong_thuc_tap', ddl: 'VARCHAR(50) NULL' },
    { name: 'vi_tri_muon_ung_tuyen_thuc_tap', ddl: 'VARCHAR(255) NULL' },
    { name: 'don_vi_thuc_tap', ddl: 'VARCHAR(255) NULL' },
    { name: 'cong_ty_tu_lien_he', ddl: 'VARCHAR(255) NULL' },
    { name: 'dia_chi_cong_ty', ddl: 'TEXT NULL' },
    { name: 'nguoi_lien_he_cong_ty', ddl: 'VARCHAR(255) NULL' },
    { name: 'sdt_nguoi_lien_he', ddl: 'VARCHAR(20) NULL' },
    { name: 'cv_path', ddl: 'VARCHAR(500) NULL' },
    { name: 'trang_thai_phan_cong', ddl: "ENUM('da-phan-cong','chua-phan-cong') DEFAULT 'chua-phan-cong'" },
    { name: 'giang_vien_huong_dan', ddl: 'VARCHAR(255) NULL' }
  ];

  for (const c of defs) {
    const exists = await columnExists('sinh_vien', c.name);
    if (!exists) {
      await db.query(`ALTER TABLE sinh_vien ADD COLUMN ${c.name} ${c.ddl}`);
      console.log(`✅ Đã thêm cột ${c.name} vào bảng sinh_vien`);
    }
  }
}

async function ensureDotThucTapColumns() {
  const defs = [
    { name: 'so_sinh_vien_tham_gia', ddl: 'INT DEFAULT 0' },
    { name: 'so_giang_vien_huong_dan', ddl: 'INT DEFAULT 0' },
    { name: 'so_doanh_nghiep_tham_gia', ddl: 'INT DEFAULT 0' },
    { name: 'thoi_gian_dang_ky_tu', ddl: 'DATE NULL' },
    { name: 'thoi_gian_dang_ky_den', ddl: 'DATE NULL' },
    { name: 'khoa_hoc_ap_dung', ddl: 'VARCHAR(50) NULL' },
    { name: 'lop_ap_dung', ddl: 'VARCHAR(50) NULL' },
  ];
  for (const c of defs) {
    const exists = await columnExists('dot_thuc_tap', c.name);
    if (!exists) {
      await db.query(`ALTER TABLE dot_thuc_tap ADD COLUMN ${c.name} ${c.ddl}`);
      console.log(`✅ Đã thêm cột ${c.name} vào bảng dot_thuc_tap`);
    }
  }
}

async function ensurePhanCongThucTapTeacherEvalColumns() {
  const defs = [
    { name: 'diem_giang_vien', ddl: 'DECIMAL(4,2) NULL' },
    { name: 'nhan_xet_giang_vien', ddl: 'TEXT NULL' },
    { name: 'ngay_nop_danh_gia', ddl: 'DATETIME NULL' }
  ];
  for (const c of defs) {
    const exists = await columnExists('phan_cong_thuc_tap', c.name);
    if (!exists) {
      await db.query(`ALTER TABLE phan_cong_thuc_tap ADD COLUMN ${c.name} ${c.ddl}`);
      console.log(`✅ Đã thêm cột ${c.name} vào bảng phan_cong_thuc_tap`);
    }
  }
}

async function ensureInternshipApplicationWorkflowV2Columns() {
  const defs = [
    {
      name: 'workflow_status_v2',
      ddl: "ENUM('PENDING','APPROVED','REJECTED','INTERVIEW_SCHEDULED','PASS','FAIL') NOT NULL DEFAULT 'PENDING'"
    },
    { name: 'interview_date', ddl: 'DATE NULL' },
    { name: 'interview_time', ddl: 'TIME NULL' },
    { name: 'interview_location', ddl: 'VARCHAR(255) NULL' },
    { name: 'interview_note', ddl: 'TEXT NULL' },
    { name: 'interview_updated_at', ddl: 'DATETIME NULL' },
    { name: 'result_note', ddl: 'TEXT NULL' }
  ];

  for (const c of defs) {
    const exists = await columnExists('dang_ky_thuc_tap_sinh_vien', c.name);
    if (!exists) {
      await db.query(`ALTER TABLE dang_ky_thuc_tap_sinh_vien ADD COLUMN ${c.name} ${c.ddl}`);
      console.log(`✅ Đã thêm cột ${c.name} vào bảng dang_ky_thuc_tap_sinh_vien`);
    }
  }
}

async function ensureGiangVienColumns() {
  const defs = [
    { name: 'ngay_sinh', ddl: 'DATE NULL' },
    { name: 'chuc_danh', ddl: 'VARCHAR(100) NULL' },
    { name: 'can_cuoc_cong_dan', ddl: 'VARCHAR(20) NULL' },
  ];
  for (const c of defs) {
    const exists = await columnExists('giang_vien', c.name);
    if (!exists) {
      await db.query(`ALTER TABLE giang_vien ADD COLUMN ${c.name} ${c.ddl}`);
      console.log(`✅ Đã thêm cột ${c.name} vào bảng giang_vien`);
    }
  }
}

async function ensureColumns() {
  try {
    await ensureSinhVienColumns();
    await ensureDotThucTapColumns();
    await ensurePhanCongThucTapTeacherEvalColumns();
    await ensureInternshipApplicationWorkflowV2Columns();
    await ensureGiangVienColumns();
  } catch (e) {
    console.error('❌ Lỗi khi đảm bảo cột DB:', e);
    throw e;
  }
}

module.exports = { ensureColumns };
