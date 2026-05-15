require('dotenv').config();
const db = require('../src/database/connection');

async function run() {
  const beforeAccounts = await db.query(
    "SELECT COUNT(*) AS c FROM accounts WHERE role = 'sinh-vien' AND email LIKE '%@sinhvien.local'"
  );
  const beforeStudents = await db.query(
    "SELECT COUNT(*) AS c FROM sinh_vien WHERE email_ca_nhan LIKE '%@sinhvien.local'"
  );

  await db.query(
    "UPDATE accounts SET email = CONCAT(user_id, '@dnu.edu.vn') WHERE role = 'sinh-vien' AND email LIKE '%@sinhvien.local'"
  );
  await db.query(
    "UPDATE sinh_vien SET email_ca_nhan = CONCAT(ma_sinh_vien, '@dnu.edu.vn') WHERE email_ca_nhan LIKE '%@sinhvien.local'"
  );

  const afterAccounts = await db.query(
    "SELECT COUNT(*) AS c FROM accounts WHERE role = 'sinh-vien' AND email LIKE '%@sinhvien.local'"
  );
  const afterStudents = await db.query(
    "SELECT COUNT(*) AS c FROM sinh_vien WHERE email_ca_nhan LIKE '%@sinhvien.local'"
  );

  console.log({
    accountsOldDomainBefore: Number(beforeAccounts[0]?.c || 0),
    studentEmailsOldDomainBefore: Number(beforeStudents[0]?.c || 0),
    accountsOldDomainAfter: Number(afterAccounts[0]?.c || 0),
    studentEmailsOldDomainAfter: Number(afterStudents[0]?.c || 0)
  });
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('migrate-student-email-domain error:', error);
    process.exit(1);
  });
