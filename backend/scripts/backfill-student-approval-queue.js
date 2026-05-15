require('dotenv').config();
const db = require('../src/database/connection');

function normalizePreference(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === 'tu_lien_he' || value === 'tu-lien-he') {
    return 'tu-lien-he';
  }
  if (value) {
    return 'khoa-gioi-thieu';
  }
  return null;
}

async function hasColumn(tableName, columnName) {
  const rows = await db.query(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function run() {
  const hasWorkflowTable = await db.query("SHOW TABLES LIKE 'dang_ky_thuc_tap_sinh_vien'");
  if (!hasWorkflowTable || hasWorkflowTable.length === 0) {
    console.log('missing_table:dang_ky_thuc_tap_sinh_vien');
    return;
  }

  const hasWorkflowStatus = await hasColumn('dang_ky_thuc_tap_sinh_vien', 'workflow_status');

  const students = await db.query(`
    SELECT
      sv.id,
      sv.nguyen_vong_thuc_tap,
      sv.vi_tri_muon_ung_tuyen_thuc_tap,
      sv.don_vi_thuc_tap,
      sv.cong_ty_tu_lien_he,
      sv.dia_chi_cong_ty,
      sv.nguoi_lien_he_cong_ty,
      sv.sdt_nguoi_lien_he
    FROM sinh_vien sv
    WHERE COALESCE(TRIM(sv.nguyen_vong_thuc_tap), '') <> ''
      AND COALESCE(TRIM(sv.vi_tri_muon_ung_tuyen_thuc_tap), '') <> ''
  `);

  let inserted = 0;
  let skipped = 0;
  let updated = 0;

  for (const student of students) {
    const existing = await db.query(
      'SELECT id, trang_thai FROM dang_ky_thuc_tap_sinh_vien WHERE sinh_vien_id = ? ORDER BY id DESC LIMIT 1',
      [student.id]
    );

    const normalizedPreference = normalizePreference(student.nguyen_vong_thuc_tap);
    const desiredCompany = student.cong_ty_tu_lien_he || student.don_vi_thuc_tap || null;
    const queueNote = normalizedPreference === 'tu-lien-he'
      ? 'Backfill tu du lieu dang ky sinh vien: tu lien he doanh nghiep'
      : 'Backfill tu du lieu dang ky sinh vien: khoa gioi thieu';

    if (existing && existing.length > 0) {
      const existingRow = existing[0];
      if (existingRow.trang_thai === 'da-duyet' || existingRow.trang_thai === 'tu-choi' || existingRow.trang_thai === 'bi-tu-choi') {
        skipped += 1;
        continue;
      }

      if (hasWorkflowStatus) {
        await db.query(
          `UPDATE dang_ky_thuc_tap_sinh_vien
           SET nguyen_vong_thuc_tap = ?,
               vi_tri_thuc_tap_mong_muon = ?,
               ten_cong_ty = ?,
               dia_chi_cong_ty = ?,
               nguoi_lien_he = ?,
               so_dien_thoai_lien_he = ?,
               ghi_chu = ?,
               trang_thai = 'cho-duyet',
               workflow_status = 'CHO_DUYET',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            normalizedPreference,
            student.vi_tri_muon_ung_tuyen_thuc_tap,
            desiredCompany,
            student.dia_chi_cong_ty || null,
            student.nguoi_lien_he_cong_ty || null,
            student.sdt_nguoi_lien_he || null,
            queueNote,
            existingRow.id
          ]
        );
      } else {
        await db.query(
          `UPDATE dang_ky_thuc_tap_sinh_vien
           SET nguyen_vong_thuc_tap = ?,
               vi_tri_thuc_tap_mong_muon = ?,
               ten_cong_ty = ?,
               dia_chi_cong_ty = ?,
               nguoi_lien_he = ?,
               so_dien_thoai_lien_he = ?,
               ghi_chu = ?,
               trang_thai = 'cho-duyet',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            normalizedPreference,
            student.vi_tri_muon_ung_tuyen_thuc_tap,
            desiredCompany,
            student.dia_chi_cong_ty || null,
            student.nguoi_lien_he_cong_ty || null,
            student.sdt_nguoi_lien_he || null,
            queueNote,
            existingRow.id
          ]
        );
      }

      updated += 1;
      continue;
    }

    if (hasWorkflowStatus) {
      await db.query(
        `INSERT INTO dang_ky_thuc_tap_sinh_vien
           (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
            dia_chi_cong_ty, nguoi_lien_he, so_dien_thoai_lien_he, ghi_chu, trang_thai, workflow_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cho-duyet', 'CHO_DUYET')`,
        [
          student.id,
          normalizedPreference,
          student.vi_tri_muon_ung_tuyen_thuc_tap,
          desiredCompany,
          student.dia_chi_cong_ty || null,
          student.nguoi_lien_he_cong_ty || null,
          student.sdt_nguoi_lien_he || null,
          queueNote
        ]
      );
    } else {
      await db.query(
        `INSERT INTO dang_ky_thuc_tap_sinh_vien
           (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
            dia_chi_cong_ty, nguoi_lien_he, so_dien_thoai_lien_he, ghi_chu, trang_thai)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cho-duyet')`,
        [
          student.id,
          normalizedPreference,
          student.vi_tri_muon_ung_tuyen_thuc_tap,
          desiredCompany,
          student.dia_chi_cong_ty || null,
          student.nguoi_lien_he_cong_ty || null,
          student.sdt_nguoi_lien_he || null,
          queueNote
        ]
      );
    }

    inserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        scanned: students.length,
        inserted,
        updated,
        skipped
      },
      null,
      2
    )
  );
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
