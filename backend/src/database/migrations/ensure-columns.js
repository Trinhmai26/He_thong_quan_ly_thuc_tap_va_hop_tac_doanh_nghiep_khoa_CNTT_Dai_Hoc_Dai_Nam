const { query } = require('../connection');

async function columnExists(table, column) {
  const sql = `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`;
  const rows = await query(sql, [table, column]);
  return rows[0] && rows[0].cnt > 0;
}

async function ensureSinhVienHasGiangVienHuongDan() {
  const exists = await columnExists('sinh_vien', 'giang_vien_huong_dan');
  if (!exists) {
    const hasDonViThucTap = await columnExists('sinh_vien', 'don_vi_thuc_tap');
    const alterSql = hasDonViThucTap
      ? `ALTER TABLE sinh_vien ADD COLUMN giang_vien_huong_dan VARCHAR(255) NULL AFTER don_vi_thuc_tap`
      : `ALTER TABLE sinh_vien ADD COLUMN giang_vien_huong_dan VARCHAR(255) NULL`;

    await query(alterSql);
    await query(`ALTER TABLE sinh_vien ADD INDEX idx_gv_huong_dan (giang_vien_huong_dan)`);
  }
}

async function ensureDotThucTapHasCountColumns() {
  const svExists = await columnExists('dot_thuc_tap', 'so_sinh_vien_tham_gia');
  if (!svExists) await query(`ALTER TABLE dot_thuc_tap ADD COLUMN so_sinh_vien_tham_gia INT NOT NULL DEFAULT 0`);
  const gvExists = await columnExists('dot_thuc_tap', 'so_giang_vien_huong_dan');
  if (!gvExists) await query(`ALTER TABLE dot_thuc_tap ADD COLUMN so_giang_vien_huong_dan INT NOT NULL DEFAULT 0`);
  const dnExists = await columnExists('dot_thuc_tap', 'so_doanh_nghiep_tham_gia');
  if (!dnExists) await query(`ALTER TABLE dot_thuc_tap ADD COLUMN so_doanh_nghiep_tham_gia INT NOT NULL DEFAULT 0`);
}

async function ensureRequiredColumns() {
  await ensureSinhVienHasGiangVienHuongDan();
  await ensureDotThucTapHasCountColumns();
}

module.exports = {
  ensureRequiredColumns,
  ensureSinhVienHasGiangVienHuongDan,
  ensureDotThucTapHasCountColumns,
};
