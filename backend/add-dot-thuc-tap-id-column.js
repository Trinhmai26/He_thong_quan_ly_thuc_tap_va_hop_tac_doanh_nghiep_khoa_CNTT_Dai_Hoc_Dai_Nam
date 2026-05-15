// Migration: add dot_thuc_tap_id column to sinh_vien for student to select an internship batch
const db = require('./src/database/connection');

(async () => {
  try {
    const existing = await db.query(
      "SHOW COLUMNS FROM sinh_vien LIKE 'dot_thuc_tap_id'"
    );
    if (Array.isArray(existing) && existing.length > 0) {
      console.log('[OK] Column dot_thuc_tap_id already exists.');
      process.exit(0);
    }

    console.log('[+] Adding column dot_thuc_tap_id ...');
    await db.query(
      "ALTER TABLE sinh_vien ADD COLUMN dot_thuc_tap_id INT NULL AFTER dot_thuc_tap_admin"
    );

    // Best-effort foreign key (skip if it fails - some envs disable FKs)
    try {
      await db.query(
        "ALTER TABLE sinh_vien ADD CONSTRAINT fk_sinh_vien_dot_thuc_tap " +
        "FOREIGN KEY (dot_thuc_tap_id) REFERENCES dot_thuc_tap(id) ON DELETE SET NULL ON UPDATE CASCADE"
      );
      console.log('[OK] Foreign key added.');
    } catch (fkErr) {
      console.warn('[WARN] FK not added:', fkErr.message);
    }

    console.log('[DONE] Migration complete.');
    process.exit(0);
  } catch (err) {
    console.error('[ERR]', err.message);
    process.exit(1);
  }
})();
