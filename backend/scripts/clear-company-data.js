const { query, transaction, closeConnections } = require('../src/database/connection');

async function getFkReferences() {
  return query(
    `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
       AND REFERENCED_TABLE_NAME IN ('doanh_nghiep', 'accounts')
     ORDER BY REFERENCED_TABLE_NAME, TABLE_NAME`
  );
}

async function clearCompanyData() {
  try {
    const beforeCompanies = await query('SELECT COUNT(*) AS total FROM doanh_nghiep');
    const beforeAccounts = await query(
      "SELECT COUNT(*) AS total FROM accounts WHERE role IN ('doanh_nghiep', 'doanh-nghiep')"
    );

    console.log('Starting company data cleanup...');
    console.log('Current doanh_nghiep rows:', beforeCompanies[0]?.total || 0);
    console.log('Current company accounts:', beforeAccounts[0]?.total || 0);

    const fkRefs = await getFkReferences();

    const result = await transaction(async (conn) => {
      const stats = [];

      // 1) Delete child rows that reference doanh_nghiep.
      for (const fk of fkRefs.filter((r) => r.REFERENCED_TABLE_NAME === 'doanh_nghiep')) {
        if (fk.TABLE_NAME === 'doanh_nghiep') continue;

        const sql = `
          DELETE child
          FROM \`${fk.TABLE_NAME}\` child
          INNER JOIN doanh_nghiep dn
            ON child.\`${fk.COLUMN_NAME}\` = dn.\`${fk.REFERENCED_COLUMN_NAME}\`
        `;
        const [res] = await conn.query(sql);
        stats.push({ step: `delete ${fk.TABLE_NAME} by doanh_nghiep`, affected: res.affectedRows || 0 });
      }

      // 2) Delete child rows that reference company accounts only.
      for (const fk of fkRefs.filter((r) => r.REFERENCED_TABLE_NAME === 'accounts')) {
        if (fk.TABLE_NAME === 'accounts') continue;
        if (fk.TABLE_NAME === 'doanh_nghiep') continue;

        const sql = `
          DELETE child
          FROM \`${fk.TABLE_NAME}\` child
          INNER JOIN accounts a
            ON child.\`${fk.COLUMN_NAME}\` = a.\`${fk.REFERENCED_COLUMN_NAME}\`
          WHERE a.role IN ('doanh_nghiep', 'doanh-nghiep')
        `;
        const [res] = await conn.query(sql);
        stats.push({ step: `delete ${fk.TABLE_NAME} by company accounts`, affected: res.affectedRows || 0 });
      }

      // 3) Delete doanh_nghiep rows.
      const [deleteCompaniesRes] = await conn.query('DELETE FROM doanh_nghiep');
      stats.push({ step: 'delete doanh_nghiep', affected: deleteCompaniesRes.affectedRows || 0 });

      // 4) Delete company accounts.
      const [deleteAccountsRes] = await conn.query(
        "DELETE FROM accounts WHERE role IN ('doanh_nghiep', 'doanh-nghiep')"
      );
      stats.push({ step: 'delete company accounts', affected: deleteAccountsRes.affectedRows || 0 });

      return stats;
    });

    const afterCompanies = await query('SELECT COUNT(*) AS total FROM doanh_nghiep');
    const afterAccounts = await query(
      "SELECT COUNT(*) AS total FROM accounts WHERE role IN ('doanh_nghiep', 'doanh-nghiep')"
    );

    console.log('Cleanup steps:');
    for (const s of result) {
      console.log(`- ${s.step}: ${s.affected}`);
    }

    console.log('Remaining doanh_nghiep rows:', afterCompanies[0]?.total || 0);
    console.log('Remaining company accounts:', afterAccounts[0]?.total || 0);
    console.log('Company data cleanup completed.');
  } catch (error) {
    console.error('Company data cleanup failed:', error.message);
    process.exitCode = 1;
  } finally {
    await closeConnections();
  }
}

clearCompanyData();
