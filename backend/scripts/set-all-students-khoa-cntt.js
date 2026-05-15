require('dotenv').config();
const db = require('../src/database/connection');

async function run() {
  const before = await db.query('SELECT COALESCE(khoa, "(null)") AS khoa, COUNT(*) AS c FROM sinh_vien GROUP BY COALESCE(khoa, "(null)") ORDER BY c DESC');

  await db.query("UPDATE sinh_vien SET khoa = 'CNTT', updated_at = NOW()");

  const after = await db.query('SELECT COALESCE(khoa, "(null)") AS khoa, COUNT(*) AS c FROM sinh_vien GROUP BY COALESCE(khoa, "(null)") ORDER BY c DESC');

  console.log({ before, after });
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('set-all-students-khoa-cntt error:', error);
    process.exit(1);
  });
