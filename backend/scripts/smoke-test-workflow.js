require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/database/connection');

async function ensureAccount(userId, email, role, plainPassword) {
  const rows = await db.query('SELECT id FROM accounts WHERE user_id = ? LIMIT 1', [userId]);
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  if (rows.length > 0) {
    await db.query(
      'UPDATE accounts SET email = ?, role = ?, password_hash = ?, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [email, role, passwordHash, rows[0].id]
    );
    return rows[0].id;
  }

  const result = await db.query(
    'INSERT INTO accounts (user_id, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, TRUE)',
    [userId, email, passwordHash, role]
  );
  return result.insertId;
}

async function ensureTeacher(accountId) {
  const ma = 'GV_E2E_001';
  const rows = await db.query('SELECT id FROM giang_vien WHERE ma_giang_vien = ? LIMIT 1', [ma]);
  if (rows.length > 0) return rows[0].id;

  const result = await db.query(
    `INSERT INTO giang_vien (account_id, ma_giang_vien, ho_ten, khoa, bo_mon, email_ca_nhan)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [accountId, ma, 'Giang vien E2E', 'CNTT', 'Cong nghe phan mem', 'gv_e2e@dainam.edu.vn']
  );
  return result.insertId;
}

async function ensureStudent(accountId) {
  const ma = 'SV_E2E_001';
  const rows = await db.query('SELECT id FROM sinh_vien WHERE ma_sinh_vien = ? LIMIT 1', [ma]);
  if (rows.length > 0) return rows[0].id;

  const result = await db.query(
    `INSERT INTO sinh_vien (account_id, ma_sinh_vien, ho_ten, lop, khoa, email_ca_nhan)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [accountId, ma, 'Sinh vien E2E', 'CNTT-E2E', 'CNTT', 'sv_e2e@dainam.edu.vn']
  );
  return result.insertId;
}

async function ensureCompany(accountId) {
  const ma = 'DN_E2E_001';
  const rows = await db.query('SELECT id FROM doanh_nghiep WHERE ma_doanh_nghiep = ? LIMIT 1', [ma]);
  if (rows.length > 0) return rows[0].id;

  const result = await db.query(
    `INSERT INTO doanh_nghiep (
      account_id, ma_doanh_nghiep, ten_cong_ty, ten_nguoi_lien_he,
      dia_chi_cong_ty, so_dien_thoai, email_cong_ty, linh_vuc_hoat_dong
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      accountId,
      ma,
      'Doanh nghiep E2E',
      'Nguoi lien he E2E',
      'Ha Noi',
      '0900000000',
      'dn_e2e@company.com',
      'Phan mem'
    ]
  );
  return result.insertId;
}

async function ensureBatch() {
  const rows = await db.query('SELECT id, thoi_gian_bat_dau, thoi_gian_ket_thuc FROM dot_thuc_tap ORDER BY id ASC LIMIT 1');
  if (rows.length > 0) return rows[0];

  const result = await db.query(
    `INSERT INTO dot_thuc_tap (ten_dot, thoi_gian_bat_dau, thoi_gian_ket_thuc, mo_ta, trang_thai)
     VALUES ('Dot E2E', '2026-06-01', '2026-09-30', 'Dot test E2E', 'sap-mo')`
  );
  return {
    id: result.insertId,
    thoi_gian_bat_dau: '2026-06-01',
    thoi_gian_ket_thuc: '2026-09-30'
  };
}

async function ensureAssignment({ studentId, companyId, teacherId, batch }) {
  const rows = await db.query(
    'SELECT id FROM phan_cong_thuc_tap WHERE sinh_vien_id = ? AND dot_thuc_tap_id = ? LIMIT 1',
    [studentId, batch.id]
  );
  if (rows.length > 0) return rows[0].id;

  const result = await db.query(
    `INSERT INTO phan_cong_thuc_tap (
      sinh_vien_id, doanh_nghiep_id, dot_thuc_tap_id, giang_vien_id,
      ngay_bat_dau, ngay_ket_thuc, trang_thai, workflow_status
    ) VALUES (?, ?, ?, ?, ?, ?, 'chua-bat-dau', 'DA_PHAN_CONG')`,
    [studentId, companyId, batch.id, teacherId, batch.thoi_gian_bat_dau, batch.thoi_gian_ket_thuc]
  );
  return result.insertId;
}

async function loginAdmin() {
  const res = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCode: 'admin001', password: '123456' })
  });

  const body = await res.json();
  if (!res.ok || !body?.data?.token) {
    throw new Error(`Login failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data.token;
}

async function patchWorkflow(assignmentId, token) {
  const res = await fetch(`http://localhost:3001/api/workflow/assignment/${assignmentId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ workflow_status: 'DANG_THUC_TAP', note: 'smoke test transition' })
  });

  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: res.status, body };
}

async function verifyAssignment(assignmentId) {
  const rows = await db.query(
    `SELECT id, trang_thai, workflow_status, workflow_updated_at
     FROM phan_cong_thuc_tap
     WHERE id = ?`,
    [assignmentId]
  );
  return rows[0] || null;
}

async function verifyHistory(assignmentId) {
  const rows = await db.query(
    `SELECT COUNT(*) AS c
     FROM internship_workflow_history
     WHERE entity_type = 'phan_cong_thuc_tap' AND entity_id = ?`,
    [assignmentId]
  );
  return Number(rows[0]?.c || 0);
}

async function run() {
  const adminAccountId = await ensureAccount('admin001', 'admin@dainam.edu.vn', 'admin', '123456');
  const svAccountId = await ensureAccount('SVE2E001', 'sv_e2e@dainam.edu.vn', 'sinh-vien', '123456');
  const gvAccountId = await ensureAccount('GVE2E001', 'gv_e2e@dainam.edu.vn', 'giang-vien', '123456');
  const dnAccountId = await ensureAccount('DNE2E001', 'dn_e2e@company.com', 'doanh-nghiep', '123456');

  const teacherId = await ensureTeacher(gvAccountId);
  const studentId = await ensureStudent(svAccountId);
  const companyId = await ensureCompany(dnAccountId);
  const batch = await ensureBatch();
  const assignmentId = await ensureAssignment({ studentId, companyId, teacherId, batch });

  const token = await loginAdmin();
  const patchResult = await patchWorkflow(assignmentId, token);
  const assignment = await verifyAssignment(assignmentId);
  const historyCount = await verifyHistory(assignmentId);

  console.log('adminAccountId:', adminAccountId);
  console.log('assignmentId:', assignmentId);
  console.log('patchStatus:', patchResult.status);
  console.log('patchBody:', JSON.stringify(patchResult.body));
  console.log('assignmentAfter:', assignment);
  console.log('workflowHistoryCount:', historyCount);

  if (patchResult.status >= 200 && patchResult.status < 300) {
    process.exit(0);
  }
  process.exit(1);
}

run().catch((error) => {
  console.error('smoke-test-workflow error:', error.message || error);
  process.exit(1);
});
