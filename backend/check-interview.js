require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({ host: process.env.DB_HOST||'localhost', user: process.env.DB_USER||'root', password: process.env.DB_PASSWORD||'', database: process.env.DB_NAME||'quanly_thuctap' });
  const [rows] = await c.execute("SELECT id, ten_cong_ty, workflow_status_v2 FROM dang_ky_thuc_tap_sinh_vien WHERE workflow_status_v2 = 'INTERVIEW_SCHEDULED' ORDER BY created_at DESC LIMIT 5");
  console.log('INTERVIEW_SCHEDULED:', JSON.stringify(rows));
  await c.end();
})().catch(e => console.error(e.message));
