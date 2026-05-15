const connection = require('../database/connection');
const { createNotification, ensureNotificationsTable } = require('../utils/notificationHelper');

class AdminController {
  // Get internship batches with company registration statistics
  static async getInternshipBatchesWithStats(req, res) {
    try {
      const query = `
        SELECT 
          dt.id,
          dt.ten_dot,
          dt.mo_ta,
          dt.ngay_bat_dau,
          dt.ngay_ket_thuc,
          dt.han_dang_ky,
          dt.trang_thai,
          COUNT(ddn.id) as so_doanh_nghiep_tham_gia,
          SUM(CASE WHEN ddn.trang_thai = 'da-duyet' THEN 1 ELSE 0 END) as so_doanh_nghiep_duyet,
          SUM(CASE WHEN ddn.trang_thai = 'cho-duyet' THEN 1 ELSE 0 END) as so_doanh_nghiep_cho_duyet
        FROM dot_thuc_tap dt
        LEFT JOIN dang_ky_doanh_nghiep ddn ON dt.id = ddn.dot_thuc_tap_id
        GROUP BY dt.id, dt.ten_dot, dt.mo_ta, dt.ngay_bat_dau, dt.ngay_ket_thuc, dt.han_dang_ky, dt.trang_thai
        ORDER BY dt.ngay_tao DESC
      `;

      connection.query(query, (error, results) => {
        if (error) {
          console.error('Error fetching internship batches with stats:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi lấy danh sách đợt thực tập' 
          });
        }

        res.json({
          success: true,
          data: results
        });
      });
    } catch (error) {
      console.error('Error in getInternshipBatchesWithStats:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi server' 
      });
    }
  }

  // Get company registrations in a specific batch
  static async getCompanyRegistrationsInBatch(req, res) {
    try {
      const { batchId } = req.params;
      const { search = '', status = '' } = req.query;

      let query = `
        SELECT 
          ddn.id as dang_ky_id,
          ddn.vi_tri_tuyen,
          ddn.so_luong_tuyen,
          ddn.yeu_cau_ky_nang,
          ddn.mo_ta_cong_viec,
          ddn.luong_khoang,
          ddn.dia_chi_lam_viec,
          ddn.ngay_dang_ky,
          ddn.trang_thai,
          ddn.ly_do_tu_choi,
          ddn.doanh_nghiep_id,
          dn.ten_cong_ty,
          dn.dia_chi as dia_chi_cong_ty,
          dn.so_dien_thoai,
          dn.email as email_cong_ty,
          dn.website,
          dn.linh_vuc_hoat_dong,
          dn.quy_mo_nhan_su,
          dn.mo_ta as mo_ta_cong_ty,
          COUNT(dsv.id) as so_sinh_vien_dang_ky
        FROM dang_ky_doanh_nghiep ddn
        INNER JOIN doanh_nghiep dn ON ddn.doanh_nghiep_id = dn.id
        LEFT JOIN dang_ky_sinh_vien dsv ON ddn.id = dsv.dang_ky_doanh_nghiep_id
        WHERE ddn.dot_thuc_tap_id = ?
      `;

      const queryParams = [batchId];

      // Add search filter
      if (search) {
        query += ` AND (dn.ten_cong_ty LIKE ? OR ddn.vi_tri_tuyen LIKE ? OR dn.linh_vuc_hoat_dong LIKE ?)`;
        const searchPattern = `%${search}%`;
        queryParams.push(searchPattern, searchPattern, searchPattern);
      }

      // Add status filter
      if (status) {
        query += ` AND ddn.trang_thai = ?`;
        queryParams.push(status);
      }

      query += ` 
        GROUP BY ddn.id, ddn.vi_tri_tuyen, ddn.so_luong_tuyen, ddn.yeu_cau_ky_nang, 
                 ddn.mo_ta_cong_viec, ddn.luong_khoang, ddn.dia_chi_lam_viec, 
                 ddn.ngay_dang_ky, ddn.trang_thai, ddn.ly_do_tu_choi, ddn.doanh_nghiep_id,
                 dn.ten_cong_ty, dn.dia_chi, dn.so_dien_thoai, dn.email, dn.website,
                 dn.linh_vuc_hoat_dong, dn.quy_mo_nhan_su, dn.mo_ta
        ORDER BY 
          CASE ddn.trang_thai 
            WHEN 'cho-duyet' THEN 1 
            WHEN 'da-duyet' THEN 2 
            WHEN 'bi-tu-choi' THEN 3 
            ELSE 4 
          END,
          ddn.ngay_dang_ky DESC
      `;

      connection.query(query, queryParams, (error, results) => {
        if (error) {
          console.error('Error fetching company registrations:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi lấy danh sách đăng ký doanh nghiệp' 
          });
        }

        res.json({
          success: true,
          data: results
        });
      });
    } catch (error) {
      console.error('Error in getCompanyRegistrationsInBatch:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi server' 
      });
    }
  }

  // Approve company registration
  static async approveCompanyRegistration(req, res) {
    try {
      const { registrationId } = req.params;

      const query = `
        UPDATE dang_ky_doanh_nghiep 
        SET trang_thai = 'da-duyet', 
            ngay_duyet = NOW(),
            nguoi_duyet_id = ?,
            ly_do_tu_choi = NULL
        WHERE id = ?
      `;

      connection.query(query, [req.user.id, registrationId], (error, results) => {
        if (error) {
          console.error('Error approving company registration:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi phê duyệt đăng ký' 
          });
        }

        if (results.affectedRows === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'Không tìm thấy đăng ký' 
          });
        }

        res.json({
          success: true,
          message: 'Phê duyệt đăng ký thành công'
        });
      });
    } catch (error) {
      console.error('Error in approveCompanyRegistration:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi server' 
      });
    }
  }

  // Reject company registration
  static async rejectCompanyRegistration(req, res) {
    try {
      const { registrationId } = req.params;
      const { ly_do_tu_choi } = req.body;

      if (!ly_do_tu_choi || !ly_do_tu_choi.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Vui lòng nhập lý do từ chối' 
        });
      }

      const query = `
        UPDATE dang_ky_doanh_nghiep 
        SET trang_thai = 'bi-tu-choi', 
            ngay_duyet = NOW(),
            nguoi_duyet_id = ?,
            ly_do_tu_choi = ?
        WHERE id = ?
      `;

      connection.query(query, [req.user.id, ly_do_tu_choi.trim(), registrationId], (error, results) => {
        if (error) {
          console.error('Error rejecting company registration:', error);
          return res.status(500).json({ 
            success: false, 
            message: 'Lỗi khi từ chối đăng ký' 
          });
        }

        if (results.affectedRows === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'Không tìm thấy đăng ký' 
          });
        }

        res.json({
          success: true,
          message: 'Từ chối đăng ký thành công'
        });
      });
    } catch (error) {
      console.error('Error in rejectCompanyRegistration:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi server' 
      });
    }
  }

  // Get student registrations for admin overview
  static async getStudentRegistrationsOverview(req, res) {
    try {
      const query = `
        SELECT
          dk.id,
          dk.created_at AS ngay_dang_ky,
          CASE
            WHEN dk.trang_thai = 'da-duyet' THEN 'da-duyet'
            WHEN dk.trang_thai IN ('tu-choi', 'bi-tu-choi') THEN 'bi-tu-choi'
            ELSE 'cho-duyet'
          END AS trang_thai,
          dk.ly_do_tu_choi,
          dk.ghi_chu,
          sv.ma_sinh_vien,
          sv.ho_ten AS ten_sinh_vien,
          sv.email_ca_nhan AS email_sinh_vien,
          sv.so_dien_thoai AS sdt_sinh_vien,
          COALESCE(dk.ten_cong_ty, sv.don_vi_thuc_tap) AS ten_cong_ty,
          COALESCE(dk.vi_tri_thuc_tap_mong_muon, sv.vi_tri_muon_ung_tuyen_thuc_tap) AS vi_tri_tuyen,
          NULL AS ten_dot,
          NULL AS ngay_bat_dau,
          NULL AS ngay_ket_thuc
        FROM dang_ky_thuc_tap_sinh_vien dk
        INNER JOIN sinh_vien sv ON dk.sinh_vien_id = sv.id
        ORDER BY ngay_dang_ky DESC
        LIMIT 100
      `;

      try {
        const results = await connection.query(query);
        return res.json({
          success: true,
          data: results
        });
      } catch (queryError) {
        if (queryError?.code !== 'ER_NO_SUCH_TABLE' && queryError?.errno !== 1146) {
          throw queryError;
        }

        const legacyResults = await connection.query(`
          SELECT
            dsv.id,
            dsv.ngay_dang_ky,
            dsv.trang_thai,
            dsv.ly_do_tu_choi,
            dsv.ghi_chu,
            sv.ma_sinh_vien,
            sv.ho_ten AS ten_sinh_vien,
            sv.email_ca_nhan AS email_sinh_vien,
            sv.so_dien_thoai AS sdt_sinh_vien,
            dn.ten_cong_ty,
            ddn.vi_tri_tuyen,
            dt.ten_dot,
            dt.ngay_bat_dau,
            dt.ngay_ket_thuc
          FROM dang_ky_sinh_vien dsv
          INNER JOIN sinh_vien sv ON dsv.sinh_vien_id = sv.id
          INNER JOIN dang_ky_doanh_nghiep ddn ON dsv.dang_ky_doanh_nghiep_id = ddn.id
          INNER JOIN doanh_nghiep dn ON ddn.doanh_nghiep_id = dn.id
          INNER JOIN dot_thuc_tap dt ON ddn.dot_thuc_tap_id = dt.id
          ORDER BY dsv.ngay_dang_ky DESC
          LIMIT 100
        `);

        return res.json({
          success: true,
          data: legacyResults
        });
      }
    } catch (error) {
      console.error('Error in getStudentRegistrationsOverview:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi server' 
      });
    }
  }

  // Approve student registration
  static async approveStudentRegistration(req, res) {
    try {
      const { registrationId } = req.params;
      const { ghi_chu } = req.body || {};
      const noteValue = typeof ghi_chu === 'string' && ghi_chu.trim() ? ghi_chu.trim() : null;

      const workflowRegistrations = await connection.query(
        'SELECT id, sinh_vien_id FROM dang_ky_thuc_tap_sinh_vien WHERE id = ? LIMIT 1',
        [registrationId]
      );

      if (workflowRegistrations && workflowRegistrations.length > 0) {
        const sinhVienId = workflowRegistrations[0].sinh_vien_id;

        try {
          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'da-duyet',
                 workflow_status = 'DA_DUYET',
                 ghi_chu = COALESCE(?, ghi_chu),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [noteValue, registrationId]
          );
        } catch (workflowUpdateError) {
          if (workflowUpdateError?.code !== 'ER_BAD_FIELD_ERROR' && workflowUpdateError?.errno !== 1054) {
            throw workflowUpdateError;
          }

          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'da-duyet',
                 ghi_chu = COALESCE(?, ghi_chu),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [noteValue, registrationId]
          );
        }

        await connection.query(
          `UPDATE dang_ky_thuc_tap_sinh_vien
           SET nguoi_duyet_id = ?,
               ngay_duyet = NOW(),
               ly_do_tu_choi = NULL
           WHERE id = ?`,
          [req.user.id, registrationId]
        );

        try {
          await connection.query(
            `UPDATE dang_ky_sinh_vien
             SET trang_thai = 'da-duyet',
                 ly_do_tu_choi = NULL,
                 ghi_chu = COALESCE(?, ghi_chu)
             WHERE sinh_vien_id = ?`,
            [noteValue, sinhVienId]
          );
        } catch (legacySyncError) {
          if (legacySyncError?.code !== 'ER_NO_SUCH_TABLE' && legacySyncError?.errno !== 1146) {
            throw legacySyncError;
          }
        }

        // Gửi thông báo đến sinh viên
        try {
          await ensureNotificationsTable();
          const svRows = await connection.query(
            'SELECT account_id FROM sinh_vien WHERE id = ? LIMIT 1',
            [sinhVienId]
          );
          if (svRows && svRows.length > 0 && svRows[0].account_id) {
            await createNotification(
              svRows[0].account_id,
              'Đăng ký thực tập đã được duyệt',
              'Chúc mừng! Đăng ký thực tập của bạn đã được quản trị viên duyệt.' +
                (noteValue ? ` Ghi chú: ${noteValue}` : '') +
                ' Vui lòng theo dõi thông tin thực tập trong hệ thống.',
              'success',
              'registration_approved'
            );
          }
        } catch (notifErr) {
          console.error('Lỗi gửi thông báo duyệt SV:', notifErr);
        }

        return res.json({
          success: true,
          message: 'Duyet dang ky sinh vien thanh cong'
        });
      }

      let registrations = [];
      try {
        registrations = await connection.query(
          'SELECT id, sinh_vien_id FROM dang_ky_sinh_vien WHERE id = ? LIMIT 1',
          [registrationId]
        );
      } catch (legacyLookupError) {
        if (legacyLookupError?.code !== 'ER_NO_SUCH_TABLE' && legacyLookupError?.errno !== 1146) {
          throw legacyLookupError;
        }
      }

      if (!registrations || registrations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Khong tim thay dang ky sinh vien'
        });
      }

      const sinhVienId = registrations[0].sinh_vien_id;

      await connection.query(
        `UPDATE dang_ky_sinh_vien
         SET trang_thai = 'da-duyet',
             ly_do_tu_choi = NULL,
             ghi_chu = COALESCE(?, ghi_chu)
         WHERE id = ?`,
        [noteValue, registrationId]
      );

      try {
        try {
          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'da-duyet',
                 workflow_status = 'DA_DUYET',
                 updated_at = CURRENT_TIMESTAMP
             WHERE sinh_vien_id = ?`,
            [sinhVienId]
          );
        } catch (workflowUpdateError) {
          if (workflowUpdateError?.code !== 'ER_BAD_FIELD_ERROR' && workflowUpdateError?.errno !== 1054) {
            throw workflowUpdateError;
          }

          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'da-duyet',
                 updated_at = CURRENT_TIMESTAMP
             WHERE sinh_vien_id = ?`,
            [sinhVienId]
          );
        }
      } catch (workflowError) {
        if (workflowError?.code !== 'ER_NO_SUCH_TABLE' && workflowError?.errno !== 1146) {
          throw workflowError;
        }
      }

      // Gửi thông báo đến sinh viên (legacy path)
      try {
        await ensureNotificationsTable();
        const svRows = await connection.query(
          'SELECT account_id FROM sinh_vien WHERE id = ? LIMIT 1',
          [sinhVienId]
        );
        if (svRows && svRows.length > 0 && svRows[0].account_id) {
          await createNotification(
            svRows[0].account_id,
            'Đăng ký thực tập đã được duyệt',
            'Chúc mừng! Đăng ký thực tập của bạn đã được quản trị viên duyệt.' +
              (noteValue ? ` Ghi chú: ${noteValue}` : '') +
              ' Vui lòng theo dõi thông tin thực tập trong hệ thống.',
            'success',
            'registration_approved'
          );
        }
      } catch (notifErr) {
        console.error('Lỗi gửi thông báo duyệt SV (legacy):', notifErr);
      }

      return res.json({
        success: true,
        message: 'Duyet dang ky sinh vien thanh cong'
      });
    } catch (error) {
      console.error('Error in approveStudentRegistration:', error);
      return res.status(500).json({
        success: false,
        message: 'Loi server khi duyet dang ky sinh vien'
      });
    }
  }

  // Reject student registration
  static async rejectStudentRegistration(req, res) {
    try {
      const { registrationId } = req.params;
      const { ly_do_tu_choi, ghi_chu } = req.body || {};

      if (!ly_do_tu_choi || !String(ly_do_tu_choi).trim()) {
        return res.status(400).json({
          success: false,
          message: 'Vui long nhap ly do tu choi'
        });
      }

      const noteValue = typeof ghi_chu === 'string' && ghi_chu.trim() ? ghi_chu.trim() : null;
      const rejectReason = String(ly_do_tu_choi).trim();

      const workflowRegistrations = await connection.query(
        'SELECT id, sinh_vien_id FROM dang_ky_thuc_tap_sinh_vien WHERE id = ? LIMIT 1',
        [registrationId]
      );

      if (workflowRegistrations && workflowRegistrations.length > 0) {
        const sinhVienId = workflowRegistrations[0].sinh_vien_id;

        try {
          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'tu-choi',
                 workflow_status = 'TU_CHOI',
                 ghi_chu = COALESCE(?, ghi_chu),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [noteValue, registrationId]
          );
        } catch (workflowUpdateError) {
          if (workflowUpdateError?.code !== 'ER_BAD_FIELD_ERROR' && workflowUpdateError?.errno !== 1054) {
            throw workflowUpdateError;
          }

          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'tu-choi',
                 ghi_chu = COALESCE(?, ghi_chu),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [noteValue, registrationId]
          );
        }

        await connection.query(
          `UPDATE dang_ky_thuc_tap_sinh_vien
           SET ly_do_tu_choi = ?,
               nguoi_duyet_id = ?,
               ngay_duyet = NOW()
           WHERE id = ?`,
          [rejectReason, req.user.id, registrationId]
        );

        try {
          await connection.query(
            `UPDATE dang_ky_sinh_vien
             SET trang_thai = 'bi-tu-choi',
                 ly_do_tu_choi = ?,
                 ghi_chu = COALESCE(?, ghi_chu)
             WHERE sinh_vien_id = ?`,
            [rejectReason, noteValue, sinhVienId]
          );
        } catch (legacySyncError) {
          if (legacySyncError?.code !== 'ER_NO_SUCH_TABLE' && legacySyncError?.errno !== 1146) {
            throw legacySyncError;
          }
        }

        // Gửi thông báo từ chối đến sinh viên
        try {
          await ensureNotificationsTable();
          const svRows = await connection.query(
            'SELECT account_id FROM sinh_vien WHERE id = ? LIMIT 1',
            [sinhVienId]
          );
          if (svRows && svRows.length > 0 && svRows[0].account_id) {
            await createNotification(
              svRows[0].account_id,
              'Đăng ký thực tập bị từ chối',
              `Đăng ký thực tập của bạn đã bị từ chối. Lý do: ${rejectReason}` +
                (noteValue ? ` Ghi chú: ${noteValue}` : '') +
                ' Vui lòng liên hệ với nhà trường để được hỗ trợ.',
              'warning',
              'registration_rejected'
            );
          }
        } catch (notifErr) {
          console.error('Lỗi gửi thông báo từ chối SV:', notifErr);
        }

        return res.json({
          success: true,
          message: 'Tu choi dang ky sinh vien thanh cong'
        });
      }

      let registrations = [];
      try {
        registrations = await connection.query(
          'SELECT id, sinh_vien_id FROM dang_ky_sinh_vien WHERE id = ? LIMIT 1',
          [registrationId]
        );
      } catch (legacyLookupError) {
        if (legacyLookupError?.code !== 'ER_NO_SUCH_TABLE' && legacyLookupError?.errno !== 1146) {
          throw legacyLookupError;
        }
      }

      if (!registrations || registrations.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Khong tim thay dang ky sinh vien'
        });
      }

      const sinhVienId = registrations[0].sinh_vien_id;

      await connection.query(
        `UPDATE dang_ky_sinh_vien
         SET trang_thai = 'bi-tu-choi',
             ly_do_tu_choi = ?,
             ghi_chu = COALESCE(?, ghi_chu)
         WHERE id = ?`,
        [rejectReason, noteValue, registrationId]
      );

      try {
        try {
          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'tu-choi',
                 workflow_status = 'TU_CHOI',
                 updated_at = CURRENT_TIMESTAMP
             WHERE sinh_vien_id = ?`,
            [sinhVienId]
          );
        } catch (workflowUpdateError) {
          if (workflowUpdateError?.code !== 'ER_BAD_FIELD_ERROR' && workflowUpdateError?.errno !== 1054) {
            throw workflowUpdateError;
          }

          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'tu-choi',
                 updated_at = CURRENT_TIMESTAMP
             WHERE sinh_vien_id = ?`,
            [sinhVienId]
          );
        }
      } catch (workflowError) {
        if (workflowError?.code !== 'ER_NO_SUCH_TABLE' && workflowError?.errno !== 1146) {
          throw workflowError;
        }
      }

      // Gửi thông báo từ chối (legacy path)
      try {
        await ensureNotificationsTable();
        const svRows = await connection.query(
          'SELECT account_id FROM sinh_vien WHERE id = ? LIMIT 1',
          [sinhVienId]
        );
        if (svRows && svRows.length > 0 && svRows[0].account_id) {
          await createNotification(
            svRows[0].account_id,
            'Đăng ký thực tập bị từ chối',
            `Đăng ký thực tập của bạn đã bị từ chối. Lý do: ${rejectReason}` +
              (noteValue ? ` Ghi chú: ${noteValue}` : '') +
              ' Vui lòng liên hệ với nhà trường để được hỗ trợ.',
            'warning',
            'registration_rejected'
          );
        }
      } catch (notifErr) {
        console.error('Lỗi gửi thông báo từ chối SV (legacy):', notifErr);
      }

      return res.json({
        success: true,
        message: 'Tu choi dang ky sinh vien thanh cong'
      });
    } catch (error) {
      console.error('Error in rejectStudentRegistration:', error);
      return res.status(500).json({
        success: false,
        message: 'Loi server khi tu choi dang ky sinh vien'
      });
    }
  }

  // Legacy dashboard query retained for old maintenance paths.
  static async _getLegacyDashboardStats(req, res) {
    try {
      const queryAsync = (sql) => {
        return new Promise((resolve, reject) => {
          connection.query(sql, (error, result) => {
            if (error) {
              return reject(error);
            }
            resolve(result);
          });
        });
      };

      const [
        totalBatches,
        activeBatches,
        totalCompanyRegistrations,
        pendingCompanyApprovals
      ] = await Promise.all([
        queryAsync(`SELECT COUNT(*) as total_batches FROM dot_thuc_tap`),
        queryAsync(`SELECT COUNT(*) as active_batches FROM dot_thuc_tap WHERE trang_thai = 'dang-mo'`),
        queryAsync(`SELECT COUNT(*) as total_company_registrations FROM dang_ky_doanh_nghiep`),
        queryAsync(`SELECT COUNT(*) as pending_company_approvals FROM dang_ky_doanh_nghiep WHERE trang_thai = 'cho-duyet'`)
      ]);

      let studentStats;

      try {
        studentStats = await queryAsync(`
          SELECT
            COUNT(*) as total_student_registrations,
            SUM(CASE WHEN trang_thai IN ('dang_ky', 'cho-duyet') THEN 1 ELSE 0 END) as pending_student_approvals,
            SUM(CASE WHEN trang_thai IN ('bi-tu-choi', 'bi_tu_choi') THEN 1 ELSE 0 END) as rejected_students
          FROM dang_ky_thuc_tap_sinh_vien
        `);
      } catch (studentStatsError) {
        if (studentStatsError?.code !== 'ER_NO_SUCH_TABLE' && studentStatsError?.errno !== 1146) {
          throw studentStatsError;
        }

        studentStats = await queryAsync(`
          SELECT
            COUNT(*) as total_student_registrations,
            SUM(CASE WHEN trang_thai = 'cho-duyet' THEN 1 ELSE 0 END) as pending_student_approvals,
            SUM(CASE WHEN trang_thai IN ('bi-tu-choi', 'bi_tu_choi') THEN 1 ELSE 0 END) as rejected_students
          FROM dang_ky_sinh_vien
        `);
      }

      res.json({
        success: true,
        data: {
          total_batches: totalBatches[0]?.total_batches || 0,
          active_batches: activeBatches[0]?.active_batches || 0,
          total_company_registrations: totalCompanyRegistrations[0]?.total_company_registrations || 0,
          pending_company_approvals: pendingCompanyApprovals[0]?.pending_company_approvals || 0,
          total_student_registrations: studentStats[0]?.total_student_registrations || 0,
          pending_student_approvals: studentStats[0]?.pending_student_approvals || 0,
          rejected_students: studentStats[0]?.rejected_students || 0
        }
      });
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Lỗi server' 
      });
    }
  }

  // Real dashboard statistics used by the admin home page.
  static async getDashboardStats(req, res) {
    try {
      const allowedRanges = new Set(['today', 'week', 'all']);
      const requestedRange = req.query?.range;
      const range = allowedRanges.has(requestedRange) ? requestedRange : 'today';

      const countRows = async (sql, params = []) => {
        try {
          const rows = await connection.query(sql, params);
          const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
          return Number(first.total ?? first.count ?? first.cnt ?? Object.values(first)[0] ?? 0) || 0;
        } catch (queryError) {
          if (queryError?.code === 'ER_NO_SUCH_TABLE' || queryError?.errno === 1146) {
            return 0;
          }
          throw queryError;
        }
      };

      const numberValue = async (sql, params = []) => {
        try {
          const rows = await connection.query(sql, params);
          const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
          const value = first.value ?? first.avg ?? first.total ?? Object.values(first)[0] ?? null;
          return value === null || value === undefined ? null : Number(value);
        } catch (queryError) {
          if (queryError?.code === 'ER_NO_SUCH_TABLE' || queryError?.errno === 1146) {
            return null;
          }
          throw queryError;
        }
      };

      const countRowsIfTableExists = async (tableName, sql, params = []) => {
        const exists = await countRows(
          'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
          [tableName]
        );
        return exists > 0 ? countRows(sql, params) : 0;
      };

      const rangeCondition = (column) => {
        if (range === 'today') return `DATE(${column}) = CURDATE()`;
        if (range === 'week') return `YEARWEEK(${column}, 1) = YEARWEEK(CURDATE(), 1)`;
        return '1 = 1';
      };

      const previousWeekCondition = (column) => (
        `YEARWEEK(${column}, 1) = YEARWEEK(CURDATE() - INTERVAL 7 DAY, 1)`
      );

      const [
        totalStudents,
        totalLecturers,
        totalCompanies,
        activeInternships,
        rangeReports,
        rangeGrading,
        rangeAverageScore,
        studentRegistrationActivities,
        assignmentActivities,
        totalReports,
        totalGradedReports,
        totalAverageScore,
        activeReportStudents,
        previousWeekReports,
        totalBatches,
        activeBatches,
        totalCompanyRegistrations,
        pendingCompanyApprovals,
        totalStudentRegistrations,
        pendingStudentApprovals,
        rejectedStudents
      ] = await Promise.all([
        countRows('SELECT COUNT(*) AS total FROM sinh_vien'),
        countRows('SELECT COUNT(*) AS total FROM giang_vien'),
        countRows('SELECT COUNT(*) AS total FROM doanh_nghiep'),
        countRows(`
          SELECT COUNT(DISTINCT sv.id) AS total
          FROM sinh_vien sv
          LEFT JOIN phan_cong_thuc_tap pct ON pct.sinh_vien_id = sv.id
          LEFT JOIN dang_ky_thuc_tap_sinh_vien dk ON dk.sinh_vien_id = sv.id
          WHERE pct.trang_thai IN ('dang-dien-ra', 'dang_thuc_tap', 'dang-thuc-tap')
             OR sv.trang_thai_phan_cong = 'da-phan-cong'
             OR NULLIF(TRIM(COALESCE(sv.don_vi_thuc_tap, '')), '') IS NOT NULL
             OR dk.trang_thai = 'da-duyet'
             OR dk.workflow_status IN ('DA_DUYET', 'DANG_THUC_TAP')
             OR dk.workflow_status_v2 IN ('APPROVED', 'PASS')
        `),
        countRows(`SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien WHERE ${rangeCondition('submitted_at')}`),
        countRows(`
          SELECT COUNT(*) AS total
          FROM diem_theo_dot_nop
          WHERE diem_giang_vien IS NOT NULL
            AND ${rangeCondition('updated_at')}
        `),
        numberValue(`
          SELECT AVG(diem_giang_vien) AS value
          FROM diem_theo_dot_nop
          WHERE diem_giang_vien IS NOT NULL
            AND ${rangeCondition('updated_at')}
        `),
        countRows(`SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien WHERE ${rangeCondition('created_at')}`),
        countRows(`SELECT COUNT(*) AS total FROM phan_cong_thuc_tap WHERE ${rangeCondition('created_at')}`),
        countRows('SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien'),
        countRows('SELECT COUNT(*) AS total FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL'),
        numberValue('SELECT AVG(diem_giang_vien) AS value FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL'),
        countRows('SELECT COUNT(DISTINCT ma_sinh_vien) AS total FROM bai_nop_cua_sinh_vien'),
        countRows(`SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien WHERE ${previousWeekCondition('submitted_at')}`),
        countRows('SELECT COUNT(*) AS total FROM dot_thuc_tap'),
        countRows("SELECT COUNT(*) AS total FROM dot_thuc_tap WHERE trang_thai = 'dang-mo'"),
        countRowsIfTableExists('dang_ky_doanh_nghiep', 'SELECT COUNT(*) AS total FROM dang_ky_doanh_nghiep'),
        countRowsIfTableExists('dang_ky_doanh_nghiep', "SELECT COUNT(*) AS total FROM dang_ky_doanh_nghiep WHERE trang_thai = 'cho-duyet'"),
        countRows('SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien'),
        countRows("SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien WHERE trang_thai IN ('dang_ky', 'cho-duyet')"),
        countRows("SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien WHERE trang_thai IN ('bi-tu-choi', 'bi_tu_choi', 'tu-choi')")
      ]);

      const todayActivities = rangeReports + rangeGrading + studentRegistrationActivities + assignmentActivities;
      const gradedPercent = totalReports > 0 ? Math.round((totalGradedReports / totalReports) * 100) : 0;
      const participationRate = totalStudents > 0 ? Math.round((activeReportStudents / totalStudents) * 100) : 0;
      const growthPercent = previousWeekReports > 0
        ? Math.round(((rangeReports - previousWeekReports) / previousWeekReports) * 100)
        : (rangeReports > 0 ? 100 : 0);

      res.json({
        success: true,
        data: {
          range,
          totalStudents,
          totalLecturers,
          totalCompanies,
          activeInternships,
          todayReports: rangeReports,
          todayGrading: rangeGrading,
          todayAverageScore: rangeAverageScore,
          todayActivities,
          studentRegistrationActivities,
          assignmentActivities,
          totalReports,
          totalGradedReports,
          totalAverageScore,
          activeReportStudents,
          gradedPercent,
          participationRate,
          growthPercent,
          generatedAt: new Date().toISOString(),
          totalSinhVien: totalStudents,
          totalGiangVien: totalLecturers,
          totalDoanhNghiep: totalCompanies,
          totalInterns: activeInternships,
          total_batches: totalBatches,
          active_batches: activeBatches,
          total_company_registrations: totalCompanyRegistrations,
          pending_company_approvals: pendingCompanyApprovals,
          total_student_registrations: totalStudentRegistrations,
          pending_student_approvals: pendingStudentApprovals,
          rejected_students: rejectedStudents
        }
      });
    } catch (error) {
      console.error('Error in getDashboardStats:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể tải dữ liệu thống kê',
        error: error.message
      });
    }
  }
}

module.exports = AdminController;
