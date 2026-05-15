const fs = require('fs');
const path = require('path');
const connection = require('../database/connection');

// Utilities
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

class TeacherSubmissions {
  static isMissingTableError(error) {
    return error && (error.code === 'ER_NO_SUCH_TABLE' || String(error.message || '').includes("doesn't exist"));
  }

  static async listStudentsByTeacher(maGiangVien) {
    try {
      return await connection.query(
        `SELECT
           svhd.ma_sinh_vien,
           svhd.ho_ten_sinh_vien,
           svhd.email_sinh_vien AS email_ca_nhan,
           svhd.so_dien_thoai_sinh_vien,
           svhd.lop_sinh_vien AS lop
         FROM sinh_vien_huong_dan svhd
         WHERE svhd.ma_giang_vien = ?`,
        [maGiangVien]
      );
    } catch (error) {
      if (!TeacherSubmissions.isMissingTableError(error)) {
        throw error;
      }

      return await connection.query(
        `SELECT
           sv.ma_sinh_vien,
           sv.ho_ten AS ho_ten_sinh_vien,
           sv.email_ca_nhan AS email_ca_nhan,
           sv.so_dien_thoai AS so_dien_thoai_sinh_vien,
           sv.lop
         FROM giang_vien gv
         JOIN sinh_vien sv ON LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
         WHERE gv.ma_giang_vien = ?
         ORDER BY sv.ho_ten ASC`,
        [maGiangVien]
      );
    }
  }

  static async getTeacherCodeByStudent(maSinhVien) {
    try {
      const [sv] = await connection.query(
        `SELECT ma_giang_vien FROM sinh_vien_huong_dan WHERE ma_sinh_vien = ? LIMIT 1`,
        [maSinhVien]
      );
      return sv?.ma_giang_vien || null;
    } catch (error) {
      if (!TeacherSubmissions.isMissingTableError(error)) {
        throw error;
      }

      const [fallback] = await connection.query(
        `SELECT gv.ma_giang_vien
         FROM sinh_vien sv
         JOIN giang_vien gv ON LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
         WHERE sv.ma_sinh_vien = ?
         LIMIT 1`,
        [maSinhVien]
      );
      return fallback?.ma_giang_vien || null;
    }
  }

  static async ensureTables() {
    // Create tables if not exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS dot_nop_bao_cao_theo_tuan (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ma_giang_vien VARCHAR(20) NOT NULL,
        tieu_de VARCHAR(255) NOT NULL,
        loai_bao_cao ENUM('tuan','thang','cuoi_ky','tong_ket') DEFAULT 'tuan',
        mo_ta TEXT,
        start_at DATETIME NOT NULL,
        end_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_gv (ma_giang_vien)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS bai_nop_cua_sinh_vien (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slot_id INT NOT NULL,
        ma_sinh_vien VARCHAR(20) NOT NULL,
        file_path VARCHAR(512) NOT NULL,
        original_name VARCHAR(255),
        mime_type VARCHAR(100),
        file_size INT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        teacher_comment TEXT,
        trang_thai ENUM('da_nop','da_duyet','tu_choi') DEFAULT 'da_nop',
        FOREIGN KEY (slot_id) REFERENCES dot_nop_bao_cao_theo_tuan(id) ON DELETE CASCADE,
        INDEX idx_slot (slot_id),
        INDEX idx_sv (ma_sinh_vien)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS diem_theo_dot_nop (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slot_id INT NOT NULL,
        ma_sinh_vien VARCHAR(20) NOT NULL,
        diem_giang_vien DECIMAL(4,2),
        nhan_xet_giang_vien TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_slot_sv (slot_id, ma_sinh_vien),
        FOREIGN KEY (slot_id) REFERENCES dot_nop_bao_cao_theo_tuan(id) ON DELETE CASCADE,
        INDEX idx_sv (ma_sinh_vien)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  static async updateSlotTimes(maGiangVien, slotId, { start_at, end_at }) {
    // basic validation here; controller also validates
    const result = await connection.query(
      `UPDATE dot_nop_bao_cao_theo_tuan
       SET start_at = ?, end_at = ?
       WHERE id = ? AND ma_giang_vien = ?`,
      [start_at, end_at, slotId, maGiangVien]
    );
    return { affectedRows: result.affectedRows || result?.info?.affectedRows || 0 };
  }

  static async updateSlot(maGiangVien, slotId, { tieu_de, mo_ta, loai_bao_cao, start_at, end_at }) {
    const result = await connection.query(
      `UPDATE dot_nop_bao_cao_theo_tuan
       SET tieu_de = ?, mo_ta = ?, loai_bao_cao = ?, start_at = ?, end_at = ?
       WHERE id = ? AND ma_giang_vien = ?`,
      [tieu_de, mo_ta ?? null, loai_bao_cao, start_at, end_at, slotId, maGiangVien]
    );
    return { affectedRows: result.affectedRows || result?.info?.affectedRows || 0 };
  }

  static async deleteSlot(maGiangVien, slotId) {
    const result = await connection.query(
      `DELETE FROM dot_nop_bao_cao_theo_tuan
       WHERE id = ? AND ma_giang_vien = ?`,
      [slotId, maGiangVien]
    );
    return { affectedRows: result.affectedRows || result?.info?.affectedRows || 0 };
  }

  // Teacher APIs
  static async createSlot(maGiangVien, payload) {
    const { tieu_de, loai_bao_cao = 'tuan', mo_ta = null, start_at, end_at } = payload;
    const result = await connection.query(
      `INSERT INTO dot_nop_bao_cao_theo_tuan (ma_giang_vien, tieu_de, loai_bao_cao, mo_ta, start_at, end_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [maGiangVien, tieu_de, loai_bao_cao, mo_ta, start_at, end_at]
    );
    return { id: result.insertId };
  }

  static async listSlotsByTeacher(maGiangVien) {
    return connection.query(
      `SELECT id, tieu_de, loai_bao_cao, mo_ta, start_at, end_at, created_at
       FROM dot_nop_bao_cao_theo_tuan WHERE ma_giang_vien = ? ORDER BY id DESC`,
      [maGiangVien]
    );
  }

  static async getSlotWithStatuses(slotId, maGiangVien) {
    // Verify slot belongs to teacher
    const [slot] = await connection.query(
      `SELECT * FROM dot_nop_bao_cao_theo_tuan WHERE id = ? AND ma_giang_vien = ?`,
      [slotId, maGiangVien]
    );
    if (!slot) throw new Error('Không tìm thấy đợt nộp');

    // Get all students under this teacher
    const students = await TeacherSubmissions.listStudentsByTeacher(maGiangVien);

    // Get submissions for this slot (all files)
    const submissions = await connection.query(
      `SELECT * FROM bai_nop_cua_sinh_vien WHERE slot_id = ? ORDER BY submitted_at DESC, id DESC`,
      [slotId]
    );

    // Get company evaluations for students under this teacher
    const companyEvals = await connection.query(
      `SELECT sv.ma_sinh_vien, pt.nhan_xet AS nhan_xet_doanh_nghiep, pt.diem_so AS diem_thuc_tap
       FROM phan_cong_thuc_tap pt
       INNER JOIN sinh_vien sv ON sv.id = pt.sinh_vien_id
       INNER JOIN giang_vien gv ON gv.id = pt.giang_vien_id
       WHERE gv.ma_giang_vien = ?`,
      [maGiangVien]
    );

    // Get per-slot grades for this specific slot
    let slotGradeRows = [];
    try {
      slotGradeRows = await connection.query(
        `SELECT ma_sinh_vien, diem_giang_vien, nhan_xet_giang_vien
         FROM diem_theo_dot_nop
         WHERE slot_id = ?`,
        [slotId]
      );
    } catch (e) {
      // Table may not exist yet; ignore
    }
    const slotGradeMap = new Map();
    for (const g of slotGradeRows) {
      slotGradeMap.set(g.ma_sinh_vien, {
        diem_giang_vien: g.diem_giang_vien,
        nhan_xet_giang_vien: g.nhan_xet_giang_vien,
      });
    }

    const evalByStudent = new Map();
    for (const ev of companyEvals) {
      evalByStudent.set(ev.ma_sinh_vien, {
        company_comment: ev.nhan_xet_doanh_nghiep || null,
        company_score: ev.diem_thuc_tap != null ? Number(ev.diem_thuc_tap) : null,
      });
    }

    // Group submissions by student
    const filesByStudent = new Map();
    for (const sub of submissions) {
      const arr = filesByStudent.get(sub.ma_sinh_vien) || [];
      arr.push({
        id: sub.id,
        original_name: sub.original_name,
        file_url: '/uploads/submissions/' + slotId + '/' + path.basename(sub.file_path),
        submitted_at: sub.submitted_at,
        trang_thai: sub.trang_thai,
        teacher_comment: sub.teacher_comment,
        mime_type: sub.mime_type,
        file_size: sub.file_size,
      });
      filesByStudent.set(sub.ma_sinh_vien, arr);
    }

    const list = students.map((sv) => {
      const files = filesByStudent.get(sv.ma_sinh_vien) || [];
      const latest = files[0];
      const ev = evalByStudent.get(sv.ma_sinh_vien) || {};
      const slotGrade = slotGradeMap.get(sv.ma_sinh_vien) || {};
      return {
        ...sv,
        trang_thai: latest ? latest.trang_thai : 'chua_nop',
        submitted_at: latest ? latest.submitted_at : null,
        submission_id: latest ? latest.id : null,
        file_url: latest ? latest.file_url : null,
        original_name: latest ? latest.original_name : null,
        teacher_comment: latest ? latest.teacher_comment : null,
        company_comment: ev.company_comment || null,
        company_score: ev.company_score || null,
        diem_giang_vien: slotGrade.diem_giang_vien != null ? Number(slotGrade.diem_giang_vien) : null,
        nhan_xet_giang_vien: slotGrade.nhan_xet_giang_vien || null,
        files,
        files_count: files.length,
      };
    });

    return { slot, students: list };
  }

  static async addTeacherComment(submissionId, maGiangVien, comment, trang_thai) {
    // Ensure submission belongs to a slot of this teacher
    const [row] = await connection.query(
      `SELECT ss.id FROM bai_nop_cua_sinh_vien ss
       INNER JOIN dot_nop_bao_cao_theo_tuan sl ON sl.id = ss.slot_id
       WHERE ss.id = ? AND sl.ma_giang_vien = ?`,
      [submissionId, maGiangVien]
    );
    if (!row) throw new Error('Không tìm thấy bài nộp');
    await connection.query(
      `UPDATE bai_nop_cua_sinh_vien SET teacher_comment = ?, trang_thai = COALESCE(?, trang_thai) WHERE id = ?`,
      [comment, trang_thai || null, submissionId]
    );
    return { success: true };
  }

  // Student APIs
  static async listOpenSlotsForStudent(maSinhVien) {
    const maGiangVien = await TeacherSubmissions.getTeacherCodeByStudent(maSinhVien);
    if (!maGiangVien) return [];
    return connection.query(
      `SELECT id, tieu_de, loai_bao_cao, mo_ta, start_at, end_at
       FROM dot_nop_bao_cao_theo_tuan 
       WHERE ma_giang_vien = ? AND start_at <= NOW() AND end_at >= NOW()
       ORDER BY id DESC`,
      [maGiangVien]
    );
  }

  static async saveStudentSubmission(slotId, maSinhVien, fileInfo) {
    const { file_path, original_name, mime_type, file_size } = fileInfo;
    const result = await connection.query(
      `INSERT INTO bai_nop_cua_sinh_vien (slot_id, ma_sinh_vien, file_path, original_name, mime_type, file_size)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [slotId, maSinhVien, file_path, original_name, mime_type, file_size]
    );
    return { id: result.insertId };
  }

  static async deleteSubmission(submissionId, maSinhVien) {
    // Returns the file_path so caller can delete from disk
    const rows = await connection.query(
      `SELECT s.file_path, d.end_at
       FROM bai_nop_cua_sinh_vien s
       JOIN dot_nop_bao_cao_theo_tuan d ON d.id = s.slot_id
       WHERE s.id = ? AND s.ma_sinh_vien = ? LIMIT 1`,
      [submissionId, maSinhVien]
    );
    if (!rows.length) return null;
    // Block deletion if slot is already closed
    if (new Date() > new Date(rows[0].end_at)) {
      throw Object.assign(new Error('Đợt nộp đã đóng, không thể xóa bài.'), { status: 403 });
    }
    await connection.query(
      `DELETE FROM bai_nop_cua_sinh_vien WHERE id = ? AND ma_sinh_vien = ?`,
      [submissionId, maSinhVien]
    );
    return rows[0].file_path;
  }

  static async listStudentSubmissions(slotId, maSinhVien) {
    return connection.query(
      `SELECT id, original_name, mime_type, file_size, submitted_at,
              teacher_comment, trang_thai,
              CONCAT('/uploads/submissions/', ?, '/', SUBSTRING_INDEX(file_path, '/', -1)) AS file_url
       FROM bai_nop_cua_sinh_vien
       WHERE slot_id = ? AND ma_sinh_vien = ?
       ORDER BY submitted_at DESC, id DESC`,
      [String(slotId), slotId, maSinhVien]
    );
  }

  static async listAllMySubmissions(maSinhVien) {
    return connection.query(
      `SELECT s.id, s.slot_id, s.original_name, s.mime_type, s.file_size, s.submitted_at,
              s.teacher_comment, s.trang_thai,
              CONCAT('/uploads/submissions/', s.slot_id, '/', SUBSTRING_INDEX(s.file_path, '/', -1)) AS file_url,
              d.tieu_de AS slot_tieu_de, d.loai_bao_cao, d.end_at AS slot_end_at
       FROM bai_nop_cua_sinh_vien s
       JOIN dot_nop_bao_cao_theo_tuan d ON s.slot_id = d.id
       WHERE s.ma_sinh_vien = ?
       ORDER BY s.submitted_at DESC, s.id DESC`,
      [maSinhVien]
    );
  }

  static async listAllSlotsForStudent(maSinhVien) {
    const maGiangVien = await TeacherSubmissions.getTeacherCodeByStudent(maSinhVien);
    if (!maGiangVien) return [];
    return connection.query(
      `SELECT id, tieu_de, loai_bao_cao, mo_ta, start_at, end_at,
        CASE 
          WHEN NOW() < start_at THEN 'chua_mo'
          WHEN NOW() > end_at THEN 'da_dong'
          ELSE 'dang_mo'
        END AS trang_thai
       FROM dot_nop_bao_cao_theo_tuan 
       WHERE ma_giang_vien = ?
       ORDER BY start_at DESC, id DESC`,
      [maGiangVien]
    );
  }
}

module.exports = TeacherSubmissions;
