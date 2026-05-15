require('dotenv').config();
const db = require('../src/database/connection');

async function run() {
  const studentRows = await db.query("SELECT id FROM sinh_vien WHERE ma_sinh_vien = 'SV_E2E_001'");
  const teacherRows = await db.query("SELECT id FROM giang_vien WHERE ma_giang_vien = 'GV_E2E_001'");
  const companyRows = await db.query("SELECT id FROM doanh_nghiep WHERE ma_doanh_nghiep = 'DN_E2E_001'");

  const studentId = studentRows[0]?.id || null;
  const teacherId = teacherRows[0]?.id || null;
  const companyId = companyRows[0]?.id || null;

  const assignmentRows = studentId
    ? await db.query('SELECT id FROM phan_cong_thuc_tap WHERE sinh_vien_id = ?', [studentId])
    : [];

  const assignmentIds = assignmentRows.map((x) => x.id);

  if (assignmentIds.length > 0) {
    const placeholders = assignmentIds.map(() => '?').join(',');

    await db.query(
      `DELETE FROM internship_workflow_history
       WHERE entity_type = 'phan_cong_thuc_tap'
         AND entity_id IN (${placeholders})`,
      assignmentIds
    );

    await db.query(
      `DELETE FROM phan_cong_thuc_tap
       WHERE id IN (${placeholders})`,
      assignmentIds
    );
  }

  if (studentId) {
    await db.query('DELETE FROM dang_ky_thuc_tap_sinh_vien WHERE sinh_vien_id = ?', [studentId]);
    await db.query('DELETE FROM sinh_vien WHERE id = ?', [studentId]);
  }

  if (teacherId) {
    await db.query('DELETE FROM giang_vien WHERE id = ?', [teacherId]);
  }

  if (companyId) {
    await db.query('DELETE FROM doanh_nghiep WHERE id = ?', [companyId]);
  }

  await db.query("DELETE FROM accounts WHERE user_id IN ('SVE2E001','GVE2E001','DNE2E001')");

  // Xoa du lieu dot mau neu can (khong anh huong dot thuc tap that)
  const testBatchRows = await db.query("SELECT id FROM dot_thuc_tap WHERE ten_dot = 'Dot thuc tap mau 2026'");
  for (const batch of testBatchRows) {
    const refs = await db.query('SELECT COUNT(*) AS c FROM phan_cong_thuc_tap WHERE dot_thuc_tap_id = ?', [batch.id]);
    if (Number(refs[0]?.c || 0) === 0) {
      await db.query('DELETE FROM internship_timeline_milestones WHERE dot_thuc_tap_id = ?', [batch.id]);
      await db.query('DELETE FROM dot_thuc_tap WHERE id = ?', [batch.id]);
    }
  }

  console.log('cleanup_workflow_smoke_data: done');
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('cleanup_workflow_smoke_data error:', error);
    process.exit(1);
  });
