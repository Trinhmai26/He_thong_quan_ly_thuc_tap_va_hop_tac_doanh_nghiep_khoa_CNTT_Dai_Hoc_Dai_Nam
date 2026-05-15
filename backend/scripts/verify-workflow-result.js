require('dotenv').config();
const db = require('../src/database/connection');

async function run() {
  const cliArg = process.argv[2] ? Number(process.argv[2]) : null;

  let assignment = [];
  if (Number.isInteger(cliArg) && cliArg > 0) {
    assignment = await db.query(
      'SELECT id, trang_thai, workflow_status, workflow_updated_at FROM phan_cong_thuc_tap WHERE id = ?',
      [cliArg]
    );
  } else {
    assignment = await db.query(
      'SELECT id, trang_thai, workflow_status, workflow_updated_at FROM phan_cong_thuc_tap ORDER BY id DESC LIMIT 1'
    );
  }

  const assignmentId = assignment[0]?.id || null;

  const history = assignmentId
    ? await db.query(
      "SELECT COUNT(*) AS c FROM internship_workflow_history WHERE entity_type = 'phan_cong_thuc_tap' AND entity_id = ?",
      [assignmentId]
    )
    : [{ c: 0 }];

  console.log('assignment:', assignment[0] || null);
  console.log('history_count:', Number(history[0]?.c || 0));
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
