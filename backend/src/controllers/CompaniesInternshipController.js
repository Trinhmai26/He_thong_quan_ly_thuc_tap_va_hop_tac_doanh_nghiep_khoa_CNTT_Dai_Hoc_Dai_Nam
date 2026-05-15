const connection = require('../database/connection');

class CompaniesController {
  // Get company's own information
  static async getMyInfo(req, res) {
    try {
      const userId = req.user.id;
      const fallbackCompanyName = req.user?.tenDoanhNghiep || null;

      const query = `
        SELECT dn.*, acc.email as account_email
        FROM doanh_nghiep dn
        INNER JOIN accounts acc ON dn.account_id = acc.id
        WHERE acc.id = ?
      `;

      const results = await connection.query(query, [userId]);
      if (!results || results.length === 0) {
        return res.json({ success: true, data: fallbackCompanyName ? { ten_cong_ty: fallbackCompanyName, account_email: null } : null });
      }
      return res.json({ success: true, data: results[0] });
    } catch (error) {
      console.error('Error in getMyInfo:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  // Get students assigned to this company (with fallback by company name)
  static async getMyInterns(req, res) {
    try {
      const userId = req.user.id;
      const tokenCompanyName = req.user?.tenDoanhNghiep || null;
      const { search = '' } = req.query;

      // Lấy thông tin DN (id và tên công ty) từ account hiện tại
      const getCompanyQuery = `
        SELECT dn.id, dn.ten_cong_ty
        FROM doanh_nghiep dn
        INNER JOIN accounts acc ON dn.account_id = acc.id
        WHERE acc.id = ?
      `;
      const companyRow = await connection.query(getCompanyQuery, [userId]);
      const companyId = companyRow?.[0]?.id || null;
      const companyName = companyRow?.[0]?.ten_cong_ty || tokenCompanyName;

      if (!companyName) {
        return res.json({ success: true, data: [] });
      }

      // Lấy sinh viên đã PASS phỏng vấn thuộc doanh nghiệp này
      let sql = `
        SELECT 
          sv.id AS id,
          sv.ma_sinh_vien,
          sv.ho_ten,
          sv.ngay_sinh,
          sv.so_dien_thoai,
          sv.email_ca_nhan AS email,
          sv.lop,
          sv.cv_path,
          NULL AS vi_tri_mong_muon,
          NULL AS ghi_chu_thuc_tap,
          NULL AS nhom_thuc_tap,
          dk.vi_tri_thuc_tap_mong_muon AS vi_tri_thuc_tap,
          'dang-thuc-tap' AS trang_thai_phan_cong,
          NULL AS ngay_bat_dau_thuc_tap,
          NULL AS ngay_ket_thuc_thuc_tap,
          pct.diem_so AS diem_thuc_tap,
          pct.nhan_xet AS nhan_xet_doanh_nghiep,
          pct.ngay_nop_danh_gia AS ngay_nop_cho_gv,
          NULL AS giang_vien_huong_dan
        FROM dang_ky_thuc_tap_sinh_vien dk
        INNER JOIN sinh_vien sv ON sv.id = dk.sinh_vien_id
        LEFT JOIN phan_cong_thuc_tap pct ON pct.sinh_vien_id = sv.id ${companyId ? 'AND pct.doanh_nghiep_id = ?' : ''}
        WHERE dk.workflow_status_v2 = 'PASS'
          AND TRIM(dk.ten_cong_ty) = TRIM(?)
      `;
      const params = [];
      if (companyId) params.push(companyId);
      params.push(companyName);

      if (search) {
        sql += ` AND (sv.ho_ten LIKE ? OR sv.ma_sinh_vien LIKE ? OR sv.email_ca_nhan LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      sql += ` ORDER BY sv.ho_ten ASC`;
      const results = await connection.query(sql, params);
      return res.json({ success: true, data: results || [] });
    } catch (error) {
      console.error('Error in getMyInterns:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  // Update student evaluation (for company)
  static async updateStudentEvaluation(req, res) {
    try {
      const userId = req.user.id;
      const { studentId } = req.params;
      const { diem_thuc_tap, nhan_xet_doanh_nghiep } = req.body;

      if (diem_thuc_tap !== undefined && (Number(diem_thuc_tap) < 0 || Number(diem_thuc_tap) > 10)) {
        return res.status(400).json({ success: false, message: 'Điểm thực tập phải từ 0 đến 10' });
      }

      const getCompanyQuery = `
        SELECT dn.id
        FROM doanh_nghiep dn
        INNER JOIN accounts acc ON dn.account_id = acc.id
        WHERE acc.id = ?
      `;

      const companyResults = await connection.query(getCompanyQuery, [userId]);
      if (!companyResults || companyResults.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy doanh nghiệp' });
      }

      const companyId = companyResults[0].id;
      const [companyRow] = await connection.query(
        `SELECT ten_cong_ty FROM doanh_nghiep WHERE id = ?`,
        [companyId]
      );
      const companyName = companyRow?.ten_cong_ty || null;

      // Thử cập nhật theo khóa (sinh_vien_id, doanh_nghiep_id)
      // Try to determine the teacher for this student to backfill giang_vien_id
      let teacherId = null;
      const [svForTeacher] = await connection.query(
        `SELECT gv.id AS gv_id
         FROM sinh_vien sv
         LEFT JOIN sinh_vien_huong_dan svhd ON svhd.ma_sinh_vien = sv.ma_sinh_vien
         LEFT JOIN giang_vien gv ON gv.ma_giang_vien = svhd.ma_giang_vien
         WHERE sv.id = ?
         LIMIT 1`,
        [studentId]
      );
      if (svForTeacher?.gv_id) teacherId = svForTeacher.gv_id;

      const updateQueryDirect = `
        UPDATE phan_cong_thuc_tap 
        SET diem_so = ?, nhan_xet = ?, ${teacherId ? 'giang_vien_id = COALESCE(giang_vien_id, ?), ' : ''}updated_at = NOW()
        WHERE sinh_vien_id = ? AND doanh_nghiep_id = ?
      `;
      const direct = await connection.query(
        updateQueryDirect,
        teacherId
          ? [diem_thuc_tap ?? null, nhan_xet_doanh_nghiep ?? null, teacherId, studentId, companyId]
          : [diem_thuc_tap ?? null, nhan_xet_doanh_nghiep ?? null, studentId, companyId]
      );
      if (direct && direct.affectedRows > 0) {
        return res.json({ success: true, message: 'Cập nhật đánh giá thành công' });
      }

      // Fallback: cập nhật theo tên DN (trường hợp doanh_nghiep_id trong phân công khác bản ghi DN hiện tại nhưng trùng tên công ty)
      if (companyName) {
        const updateQueryByName = `
          UPDATE phan_cong_thuc_tap pct
          JOIN doanh_nghiep dn ON dn.id = pct.doanh_nghiep_id
          SET pct.diem_so = ?, pct.nhan_xet = ?, ${teacherId ? 'pct.giang_vien_id = COALESCE(pct.giang_vien_id, ?), ' : ''}pct.updated_at = NOW()
          WHERE pct.sinh_vien_id = ? AND TRIM(dn.ten_cong_ty) = TRIM(?)
        `;
        const byName = await connection.query(
          updateQueryByName,
          teacherId
            ? [diem_thuc_tap ?? null, nhan_xet_doanh_nghiep ?? null, teacherId, studentId, companyName]
            : [diem_thuc_tap ?? null, nhan_xet_doanh_nghiep ?? null, studentId, companyName]
        );
        if (byName && byName.affectedRows > 0) {
          return res.json({ success: true, message: 'Cập nhật đánh giá thành công' });
        }
      }

      // Nếu vẫn không thấy, cố gắng tạo phân công tối thiểu rồi cập nhật
      // 1) Xác định sinh_vien_id chuẩn từ studentId hoặc từ svhd
      let resolvedStudentId = null;
      const [svById] = await connection.query(`SELECT id, ma_sinh_vien FROM sinh_vien WHERE id = ?`, [studentId]);
      let maSinhVienForBatch = null;
      if (svById) {
        resolvedStudentId = svById.id;
        maSinhVienForBatch = svById.ma_sinh_vien || null;
      } else {
        const [svhdById] = await connection.query(`SELECT id, ma_sinh_vien FROM sinh_vien_huong_dan WHERE id = ?`, [studentId]);
        if (svhdById) {
          const [svByMa] = await connection.query(`SELECT id, ma_sinh_vien FROM sinh_vien WHERE ma_sinh_vien = ?`, [svhdById.ma_sinh_vien]);
          if (svByMa) {
            resolvedStudentId = svByMa.id;
            maSinhVienForBatch = svByMa.ma_sinh_vien || null;
          }
        }
      }

      if (!resolvedStudentId) {
        return res.status(404).json({ success: false, message: 'Không xác định được sinh viên để cập nhật' });
      }

      // 2) Xác định đợt thực tập khả dụng cho sinh viên này
      let batchRow = null;
      if (maSinhVienForBatch) {
        // Ưu tiên đợt mà SV đã đăng ký trong sinh_vien_thuc_tap, lấy đợt mới nhất
        const batchBySv = await connection.query(`
          SELECT dtt.*
          FROM sinh_vien_thuc_tap svtt
          JOIN dot_thuc_tap dtt ON dtt.id = svtt.dot_thuc_tap_id
          WHERE svtt.ma_sinh_vien = ?
          ORDER BY dtt.thoi_gian_bat_dau DESC
          LIMIT 1
        `, [maSinhVienForBatch]);
        batchRow = batchBySv?.[0] || null;
      }
      if (!batchRow) {
        // Fallback: đợt đang diễn ra hoặc sắp mở (mới nhất)
        const fallbackBatch = await connection.query(`
          SELECT * FROM dot_thuc_tap 
          WHERE trang_thai IN ('dang-dien-ra', 'sap-mo')
          ORDER BY thoi_gian_bat_dau DESC
          LIMIT 1
        `);
        batchRow = fallbackBatch?.[0] || null;
      }
      if (!batchRow) {
        return res.status(404).json({ success: false, message: 'Chưa có đợt thực tập phù hợp để ghi nhận đánh giá' });
      }

      // 3) Kiểm tra tồn tại phân công cho SV-DN trong đợt này; nếu chưa có thì tạo
      const [existingAssign] = await connection.query(
        `SELECT id FROM phan_cong_thuc_tap 
         WHERE sinh_vien_id = ? AND doanh_nghiep_id = ? AND dot_thuc_tap_id = ?
         LIMIT 1`,
        [resolvedStudentId, companyId, batchRow.id]
      );
      if (!existingAssign) {
        await connection.query(
          `INSERT INTO phan_cong_thuc_tap 
           (sinh_vien_id, doanh_nghiep_id, dot_thuc_tap_id, giang_vien_id, ngay_bat_dau, ngay_ket_thuc, trang_thai, diem_so, nhan_xet, created_at, updated_at)
           VALUES (?, ?, ?, NULL, ?, ?, 'dang-dien-ra', ?, ?, NOW(), NOW())`,
          [
            resolvedStudentId,
            companyId,
            batchRow.id,
            batchRow.thoi_gian_bat_dau,
            batchRow.thoi_gian_ket_thuc,
            diem_thuc_tap ?? null,
            nhan_xet_doanh_nghiep ?? null
          ]
        );
        return res.json({ success: true, message: 'Tạo phân công và cập nhật đánh giá thành công' });
      } else {
        // Nếu đã có, cập nhật lại điểm/nhận xét
        const upd = await connection.query(
          `UPDATE phan_cong_thuc_tap 
           SET diem_so = ?, nhan_xet = ?, ${teacherId ? 'giang_vien_id = COALESCE(giang_vien_id, ?), ' : ''}updated_at = NOW()
           WHERE id = ?`,
          teacherId
            ? [diem_thuc_tap ?? null, nhan_xet_doanh_nghiep ?? null, teacherId, existingAssign.id]
            : [diem_thuc_tap ?? null, nhan_xet_doanh_nghiep ?? null, existingAssign.id]
        );
        if (upd && upd.affectedRows > 0) {
          return res.json({ success: true, message: 'Cập nhật đánh giá thành công' });
        }
      }

      return res.status(404).json({ success: false, message: 'Không cập nhật được đánh giá' });
    } catch (error) {
      console.error('Error in updateStudentEvaluation:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  // Get internship statistics for company
  static async getMyInternshipStats(req, res) {
    try {
      const userId = req.user.id;
      const getCompanyQuery = `
        SELECT dn.id
        FROM doanh_nghiep dn
        INNER JOIN accounts acc ON dn.account_id = acc.id
        WHERE acc.id = ?
      `;

      const companyResults = await connection.query(getCompanyQuery, [userId]);
      if (!companyResults || companyResults.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy doanh nghiệp' });
      }

      const companyId = companyResults[0].id;
      const statsQuery = `
        SELECT 
          COUNT(*) as total_students,
          SUM(CASE WHEN sv.trang_thai_phan_cong = 'da-phan-cong' THEN 1 ELSE 0 END) as da_phan_cong,
          SUM(CASE WHEN sv.trang_thai_phan_cong = 'dang-thuc-tap' THEN 1 ELSE 0 END) as dang_thuc_tap,
          SUM(CASE WHEN sv.trang_thai_phan_cong = 'hoan-thanh' THEN 1 ELSE 0 END) as hoan_thanh,
          AVG(pt.diem_so) as diem_trung_binh
        FROM phan_cong_thuc_tap pt
        INNER JOIN sinh_vien sv ON pt.sinh_vien_id = sv.id
        WHERE pt.doanh_nghiep_id = ?
      `;

      const results = await connection.query(statsQuery, [companyId]);
      const stats = (results && results[0]) || {};
      return res.json({
        success: true,
        data: {
          totalStudents: stats.total_students || 0,
          daPhanCong: stats.da_phan_cong || 0,
          dangThucTap: stats.dang_thuc_tap || 0,
          hoanThanh: stats.hoan_thanh || 0,
          diemTrungBinh: stats.diem_trung_binh != null ? parseFloat(Number(stats.diem_trung_binh).toFixed(2)) : null
        }
      });
    } catch (error) {
      console.error('Error in getMyInternshipStats:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  // Submit all evaluations to teachers
  static async submitAllEvaluations(req, res) {
    try {
      const userId = req.user.id;
      
      // Get company info
      const getCompanyQuery = `
        SELECT dn.id, dn.ten_cong_ty
        FROM doanh_nghiep dn
        INNER JOIN accounts acc ON dn.account_id = acc.id
        WHERE acc.id = ?
      `;
      const companyResults = await connection.query(getCompanyQuery, [userId]);
      if (!companyResults || companyResults.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy doanh nghiệp' });
      }

      const companyId = companyResults[0].id;
      const companyName = companyResults[0].ten_cong_ty;

      // Get all evaluations from this company
      const evaluationsQuery = `
        SELECT 
          pct.id,
          pct.sinh_vien_id,
          pct.diem_so,
          pct.nhan_xet,
          sv.ho_ten as ten_sinh_vien,
          sv.ma_sinh_vien,
          gv.ho_ten as ten_giang_vien,
          gv.email_ca_nhan as email_giang_vien
        FROM phan_cong_thuc_tap pct
        INNER JOIN sinh_vien sv ON pct.sinh_vien_id = sv.id
        LEFT JOIN giang_vien gv ON pct.giang_vien_id = gv.id
        WHERE pct.doanh_nghiep_id = ? 
          AND (pct.diem_so IS NOT NULL OR (pct.nhan_xet IS NOT NULL AND TRIM(pct.nhan_xet) != ''))
      `;

      const evaluations = await connection.query(evaluationsQuery, [companyId]);
      
      if (!evaluations || evaluations.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Chưa có đánh giá nào để gửi. Vui lòng chấm điểm hoặc nhận xét cho ít nhất một sinh viên.' 
        });
      }

      // Update submission timestamp for all evaluations
      await connection.query(
        `UPDATE phan_cong_thuc_tap 
         SET ngay_nop_danh_gia = NOW(), updated_at = NOW()
         WHERE doanh_nghiep_id = ? 
           AND (diem_so IS NOT NULL OR (nhan_xet IS NOT NULL AND TRIM(nhan_xet) != ''))`,
        [companyId]
      );

      // In a real implementation, you might:
      // 1. Create notifications for teachers
      // 2. Send emails to teachers
      // 3. Log the submission for audit trail
      
      return res.json({
        success: true,
        message: `Đã gửi thành công đánh giá cho ${evaluations.length} sinh viên`,
        data: {
          submittedCount: evaluations.length,
          companyName: companyName,
          submissionTime: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error in submitAllEvaluations:', error);
      res.status(500).json({ success: false, message: 'Lỗi server khi gửi đánh giá' });
    }
  }
}

module.exports = CompaniesController;