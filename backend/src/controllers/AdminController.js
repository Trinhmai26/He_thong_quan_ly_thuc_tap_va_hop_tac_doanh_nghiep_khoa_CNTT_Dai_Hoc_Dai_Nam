const connection = require('../database/connection');
const { createNotification, ensureNotificationsTable } = require('../utils/notificationHelper');
const { sendApprovalEmail, sendKhoaGioiThieuAssignmentEmail } = require('../services/EmailService');

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

        // Gửi thông báo hệ thống + email đến sinh viên
        try {
          await ensureNotificationsTable();
          const svRows = await connection.query(
            'SELECT account_id, ho_ten, ma_sinh_vien, email_ca_nhan, vi_tri_muon_ung_tuyen_thuc_tap, cong_ty_tu_lien_he, don_vi_thuc_tap, nguyen_vong_thuc_tap FROM sinh_vien WHERE id = ? LIMIT 1',
            [sinhVienId]
          );
          if (svRows && svRows.length > 0) {
            const sv = svRows[0];
            const tenCongTy = sv.cong_ty_tu_lien_he || sv.don_vi_thuc_tap || '';
            const nguyenVongLabel = sv.nguyen_vong_thuc_tap === 'tu_lien_he' ? 'Tự liên hệ' : sv.nguyen_vong_thuc_tap === 'khoa_gioi_thieu' ? 'Khoa giới thiệu' : '';

            // Thông báo trong hệ thống
            if (sv.account_id) {
              await createNotification(
                sv.account_id,
                'Đăng ký thực tập đã được duyệt',
                'Chúc mừng! Đăng ký thực tập của bạn đã được quản trị viên duyệt.' +
                  (noteValue ? ` Ghi chú: ${noteValue}` : '') +
                  ' Vui lòng theo dõi thông tin thực tập trong hệ thống.',
                'success',
                'registration_approved'
              );
            }

            // Gửi email
            if (sv.email_ca_nhan) {
              await sendApprovalEmail({
                studentEmail: sv.email_ca_nhan,
                studentName: sv.ho_ten || '',
                studentCode: sv.ma_sinh_vien || '',
                companyName: tenCongTy,
                position: sv.vi_tri_muon_ung_tuyen_thuc_tap || '',
                nguyenVong: nguyenVongLabel,
                ghiChu: noteValue
              });
            }
          }
        } catch (notifErr) {
          console.error('Lỗi gửi thông báo/email duyệt SV:', notifErr);
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

      // Gửi thông báo hệ thống + email đến sinh viên (legacy path)
      try {
        await ensureNotificationsTable();
        const svRows = await connection.query(
          'SELECT account_id, ho_ten, ma_sinh_vien, email_ca_nhan, vi_tri_muon_ung_tuyen_thuc_tap, cong_ty_tu_lien_he, don_vi_thuc_tap, nguyen_vong_thuc_tap FROM sinh_vien WHERE id = ? LIMIT 1',
          [sinhVienId]
        );
        if (svRows && svRows.length > 0) {
          const sv = svRows[0];
          const tenCongTy = sv.cong_ty_tu_lien_he || sv.don_vi_thuc_tap || '';
          const nguyenVongLabel = sv.nguyen_vong_thuc_tap === 'tu_lien_he' ? 'Tự liên hệ' : sv.nguyen_vong_thuc_tap === 'khoa_gioi_thieu' ? 'Khoa giới thiệu' : '';

          if (sv.account_id) {
            await createNotification(
              sv.account_id,
              'Đăng ký thực tập đã được duyệt',
              'Chúc mừng! Đăng ký thực tập của bạn đã được quản trị viên duyệt.' +
                (noteValue ? ` Ghi chú: ${noteValue}` : '') +
                ' Vui lòng theo dõi thông tin thực tập trong hệ thống.',
              'success',
              'registration_approved'
            );
          }

          if (sv.email_ca_nhan) {
            await sendApprovalEmail({
              studentEmail: sv.email_ca_nhan,
              studentName: sv.ho_ten || '',
              studentCode: sv.ma_sinh_vien || '',
              companyName: tenCongTy,
              position: sv.vi_tri_muon_ung_tuyen_thuc_tap || '',
              nguyenVong: nguyenVongLabel,
              ghiChu: noteValue
            });
          }
        }
      } catch (notifErr) {
        console.error('Lỗi gửi thông báo/email duyệt SV (legacy):', notifErr);
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

  // Bulk approve students by internship preference (tu_lien_he or khoa_gioi_thieu)
  static async bulkApproveByPreference(req, res) {
    const { query } = require('../database/connection');
    try {
      const { nguyen_vong } = req.body || {};
      if (!nguyen_vong || !['tu_lien_he', 'khoa_gioi_thieu'].includes(nguyen_vong)) {
        return res.status(400).json({ success: false, message: 'nguyen_vong phải là tu_lien_he hoặc khoa_gioi_thieu' });
      }

      const dbNguyenVong = nguyen_vong === 'tu_lien_he' ? 'tu-lien-he' : 'khoa-gioi-thieu';
      const prefLabel = nguyen_vong === 'tu_lien_he' ? 'Tự liên hệ' : 'Khoa giới thiệu';

      // Get all matching students with account_id for notifications
      const students = await query(
        `SELECT sv.id, sv.account_id, sv.ho_ten, sv.ma_sinh_vien, sv.email_ca_nhan, sv.vi_tri_muon_ung_tuyen_thuc_tap, sv.cong_ty_tu_lien_he, sv.don_vi_thuc_tap
         FROM sinh_vien sv
         WHERE sv.nguyen_vong_thuc_tap = ?`,
        [nguyen_vong]
      );

      if (!students || students.length === 0) {
        return res.json({ success: true, message: 'Không có sinh viên nào phù hợp', approved: 0, updated: 0 });
      }

      let inserted = 0;
      let updated = 0;
      const now = new Date();

      for (const sv of students) {
        const existing = await query(
          'SELECT id FROM dang_ky_thuc_tap_sinh_vien WHERE sinh_vien_id = ? ORDER BY id DESC LIMIT 1',
          [sv.id]
        );

        const tenCongTy = sv.cong_ty_tu_lien_he || sv.don_vi_thuc_tap || '';
        const viTri = sv.vi_tri_muon_ung_tuyen_thuc_tap || '';

        if (!existing || existing.length === 0) {
          await query(
            `INSERT INTO dang_ky_thuc_tap_sinh_vien
              (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon, ten_cong_ty, trang_thai, workflow_status_v2, ngay_duyet, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'da-duyet', 'APPROVED', ?, NOW(), NOW())`,
            [sv.id, dbNguyenVong, viTri, tenCongTy, now]
          );
          inserted++;
        } else {
          await query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET trang_thai = 'da-duyet', workflow_status_v2 = 'APPROVED', ngay_duyet = ?, updated_at = NOW()
             WHERE id = ?`,
            [now, existing[0].id]
          );
          updated++;
        }

        // Gửi thông báo hệ thống + email cho sinh viên
        try {
          const companyMsg = tenCongTy ? ` tại ${tenCongTy}` : '';

          if (sv.account_id) {
            await createNotification(
              sv.account_id,
              'Đăng ký thực tập đã được duyệt',
              `Chúc mừng! Đăng ký thực tập của bạn (${prefLabel}${companyMsg}) đã được quản trị viên duyệt. Vui lòng theo dõi thông tin thực tập trong hệ thống.`,
              'success',
              'registration_approved'
            );
          }

          if (sv.email_ca_nhan) {
            await sendApprovalEmail({
              studentEmail: sv.email_ca_nhan,
              studentName: sv.ho_ten || '',
              studentCode: sv.ma_sinh_vien || '',
              companyName: tenCongTy,
              position: sv.vi_tri_muon_ung_tuyen_thuc_tap || '',
              nguyenVong: prefLabel,
              ghiChu: null
            });
          }
        } catch (notifErr) {
          console.error(`Lỗi gửi thông báo/email cho SV id=${sv.id}:`, notifErr.message);
        }
      }

      return res.json({
        success: true,
        message: `Đã duyệt ${inserted + updated} sinh viên (${inserted} mới, ${updated} cập nhật)`,
        approved: inserted,
        updated
      });
    } catch (error) {
      console.error('Error in bulkApproveByPreference:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi duyệt hàng loạt: ' + error.message });
    }
  }

  // Chẩn đoán: xem giá trị thực tế trong DB cho nhóm Khoa giới thiệu
  static async diagnoseKhoaGioiThieu(req, res) {
    try {
      const formats = await connection.query(
        `SELECT nguyen_vong_thuc_tap, COUNT(*) AS so_luong
         FROM sinh_vien
         WHERE nguyen_vong_thuc_tap IS NOT NULL AND nguyen_vong_thuc_tap != ''
         GROUP BY nguyen_vong_thuc_tap
         ORDER BY so_luong DESC`,
        []
      );

      const needAssign = await connection.query(
        `SELECT COUNT(*) AS cnt FROM sinh_vien
         WHERE nguyen_vong_thuc_tap IN ('khoa_gioi_thieu', 'khoa-gioi-thieu')
           AND (don_vi_thuc_tap IS NULL OR don_vi_thuc_tap = '')`,
        []
      );

      const alreadyAssigned = await connection.query(
        `SELECT COUNT(*) AS cnt FROM sinh_vien
         WHERE nguyen_vong_thuc_tap IN ('khoa_gioi_thieu', 'khoa-gioi-thieu')
           AND don_vi_thuc_tap IS NOT NULL AND don_vi_thuc_tap != ''`,
        []
      );

      const companies = await connection.query(
        `SELECT COUNT(*) AS cnt FROM doanh_nghiep
         WHERE ten_cong_ty IS NOT NULL AND ten_cong_ty != ''`,
        []
      );

      const sample = await connection.query(
        `SELECT sv.ma_sinh_vien, sv.ho_ten, sv.nguyen_vong_thuc_tap, sv.don_vi_thuc_tap,
                dk.trang_thai, dk.workflow_status_v2
         FROM sinh_vien sv
         LEFT JOIN (
           SELECT sinh_vien_id, trang_thai, workflow_status_v2
           FROM dang_ky_thuc_tap_sinh_vien
           WHERE id IN (SELECT MAX(id) FROM dang_ky_thuc_tap_sinh_vien GROUP BY sinh_vien_id)
         ) dk ON dk.sinh_vien_id = sv.id
         WHERE sv.nguyen_vong_thuc_tap IN ('khoa_gioi_thieu', 'khoa-gioi-thieu')
         ORDER BY sv.id
         LIMIT 5`,
        []
      );

      return res.json({
        success: true,
        diagnosis: {
          formats_in_db: formats,
          sinh_vien_can_gan: Number(needAssign[0]?.cnt || 0),
          sinh_vien_da_co_dn: Number(alreadyAssigned[0]?.cnt || 0),
          tong_doanh_nghiep: Number(companies[0]?.cnt || 0),
          mau_5_sinh_vien: sample
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  // Auto-assign company for khoa_gioi_thieu students + send in-app notification + email
  static async autoAssignCompanyForKhoaGioiThieu(req, res) {
    const log = { assigned: [], skipped_has_company: [], skipped_no_preference: [], emails_ok: [], emails_skipped: [], emails_fail: [], notif_ok: [], notif_skip: [] };

    try {
      // ── 1. Lấy sinh viên đủ điều kiện ──────────────────────────────────────
      // Hỗ trợ cả 'khoa_gioi_thieu' (underscore, lưu bởi UI form) VÀ 'khoa-gioi-thieu' (hyphen, lưu bởi ExcelImportService)
      const students = await connection.query(
        `SELECT sv.id, sv.account_id, sv.ho_ten, sv.ma_sinh_vien, sv.email_ca_nhan,
                sv.vi_tri_muon_ung_tuyen_thuc_tap
         FROM sinh_vien sv
         WHERE sv.nguyen_vong_thuc_tap IN ('khoa_gioi_thieu', 'khoa-gioi-thieu')
           AND (sv.don_vi_thuc_tap IS NULL OR sv.don_vi_thuc_tap = '')
           AND NOT EXISTS (
             SELECT 1 FROM dang_ky_thuc_tap_sinh_vien dk
             WHERE dk.sinh_vien_id = sv.id
               AND dk.workflow_status_v2 IN ('REJECTED','FAIL')
               AND dk.id = (SELECT MAX(dk2.id) FROM dang_ky_thuc_tap_sinh_vien dk2 WHERE dk2.sinh_vien_id = sv.id)
           )
         ORDER BY sv.id`,
        []
      );

      console.log(`[AutoAssign] Tổng sinh viên đủ điều kiện: ${students?.length || 0}`);

      if (!students || students.length === 0) {
        return res.json({
          success: true,
          message: 'Không có sinh viên "Khoa giới thiệu" nào cần gán doanh nghiệp',
          assigned: 0, log
        });
      }

      // ── 2. Lấy danh sách doanh nghiệp ──────────────────────────────────────
      const companies = await connection.query(
        `SELECT id, ten_cong_ty, so_luong_nhan_thuc_tap
         FROM doanh_nghiep
         WHERE ten_cong_ty IS NOT NULL AND ten_cong_ty != ''
         ORDER BY id ASC`,
        []
      );

      console.log(`[AutoAssign] Tổng doanh nghiệp có sẵn: ${companies?.length || 0}`);

      if (!companies || companies.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Không có doanh nghiệp nào trong hệ thống. Vui lòng thêm doanh nghiệp trước.'
        });
      }

      // Pool round-robin (capacity=0 = không giới hạn)
      const pool = companies.map(c => ({
        ten_cong_ty: c.ten_cong_ty,
        capacity: Number(c.so_luong_nhan_thuc_tap) > 0 ? Number(c.so_luong_nhan_thuc_tap) : 0,
        assigned: 0
      }));

      await ensureNotificationsTable();
      const now = new Date();
      let poolIdx = 0;

      // ── 3. Vòng lặp gán từng sinh viên ─────────────────────────────────────
      for (const sv of students) {
        // Tìm công ty tiếp theo còn slot (round-robin, overflow cho phép)
        let loops = 0;
        while (loops < pool.length && pool[poolIdx % pool.length].capacity > 0 && pool[poolIdx % pool.length].assigned >= pool[poolIdx % pool.length].capacity) {
          poolIdx++; loops++;
        }
        const company = pool[poolIdx % pool.length];
        company.assigned++;
        poolIdx++;

        const viTri = sv.vi_tri_muon_ung_tuyen_thuc_tap || '';

        // 3a. Cập nhật sinh_vien.don_vi_thuc_tap
        await connection.query(
          `UPDATE sinh_vien SET don_vi_thuc_tap = ?, updated_at = NOW() WHERE id = ?`,
          [company.ten_cong_ty, sv.id]
        );

        // 3b. Upsert dang_ky_thuc_tap_sinh_vien
        const existing = await connection.query(
          'SELECT id FROM dang_ky_thuc_tap_sinh_vien WHERE sinh_vien_id = ? ORDER BY id DESC LIMIT 1',
          [sv.id]
        );

        const upsert = async (withV2) => {
          if (existing && existing.length > 0) {
            const sql = withV2
              ? `UPDATE dang_ky_thuc_tap_sinh_vien
                 SET trang_thai = 'da-duyet', workflow_status_v2 = 'APPROVED',
                     nguyen_vong_thuc_tap = 'khoa-gioi-thieu',
                     ten_cong_ty = ?, vi_tri_thuc_tap_mong_muon = ?,
                     ngay_duyet = ?, updated_at = NOW()
                 WHERE id = ?`
              : `UPDATE dang_ky_thuc_tap_sinh_vien
                 SET trang_thai = 'da-duyet', nguyen_vong_thuc_tap = 'khoa-gioi-thieu',
                     ten_cong_ty = ?, vi_tri_thuc_tap_mong_muon = ?,
                     ngay_duyet = ?, updated_at = NOW()
                 WHERE id = ?`;
            await connection.query(sql, [company.ten_cong_ty, viTri, now, existing[0].id]);
          } else {
            const sql = withV2
              ? `INSERT INTO dang_ky_thuc_tap_sinh_vien
                   (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
                    trang_thai, workflow_status_v2, ngay_duyet, created_at, updated_at)
                 VALUES (?, 'khoa-gioi-thieu', ?, ?, 'da-duyet', 'APPROVED', ?, NOW(), NOW())`
              : `INSERT INTO dang_ky_thuc_tap_sinh_vien
                   (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
                    trang_thai, ngay_duyet, created_at, updated_at)
                 VALUES (?, 'khoa-gioi-thieu', ?, ?, 'da-duyet', ?, NOW(), NOW())`;
            await connection.query(sql, [sv.id, viTri, company.ten_cong_ty, now]);
          }
        };

        try { await upsert(true); }
        catch (e) {
          if (e?.code !== 'ER_BAD_FIELD_ERROR' && e?.errno !== 1054) throw e;
          await upsert(false);
        }

        log.assigned.push({ ma: sv.ma_sinh_vien, ho_ten: sv.ho_ten, company: company.ten_cong_ty });
        console.log(`[AutoAssign] ✓ ${sv.ma_sinh_vien} - ${sv.ho_ten} → ${company.ten_cong_ty}`);

        // 3c. Thông báo trong hệ thống (chống trùng lặp theo action_type)
        if (sv.account_id) {
          try {
            const dupCheck = await connection.query(
              `SELECT id FROM notifications
               WHERE receiver_id = ? AND action_type = 'company_auto_assigned'
               LIMIT 1`,
              [sv.account_id]
            );

            if (!dupCheck || dupCheck.length === 0) {
              await createNotification(
                sv.account_id,
                'Thông báo doanh nghiệp thực tập',
                `Bạn đã được khoa giới thiệu doanh nghiệp thực tập: ${company.ten_cong_ty}. Hồ sơ của bạn đã được chuyển sang bước Doanh nghiệp phỏng vấn. Vui lòng theo dõi thông báo tiếp theo.`,
                'success',
                'company_auto_assigned'
              );
              log.notif_ok.push(sv.ma_sinh_vien);
            } else {
              log.notif_skip.push(sv.ma_sinh_vien);
            }
          } catch (notifErr) {
            console.error(`[AutoAssign] Lỗi thông báo SV ${sv.ma_sinh_vien}:`, notifErr.message);
          }
        }

        // 3d. Gửi email (chỉ gửi nếu có email và không phải email tự sinh)
        const isAutoEmail = sv.email_ca_nhan && /^\d+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(sv.email_ca_nhan);
        if (sv.email_ca_nhan && !isAutoEmail) {
          try {
            const emailResult = await sendKhoaGioiThieuAssignmentEmail({
              studentEmail: sv.email_ca_nhan,
              studentName: sv.ho_ten || '',
              studentCode: sv.ma_sinh_vien || '',
              companyName: company.ten_cong_ty,
              position: viTri
            });
            if (emailResult?.skipped) {
              log.emails_skipped.push({ email: sv.email_ca_nhan, reason: emailResult.reason || 'SKIPPED' });
            } else {
              log.emails_ok.push(sv.email_ca_nhan);
            }
          } catch (mailErr) {
            log.emails_fail.push({ email: sv.email_ca_nhan, error: mailErr.message });
            console.error(`[AutoAssign] Lỗi gửi email ${sv.email_ca_nhan}:`, mailErr.message);
          }
        } else {
          log.emails_skipped.push({ email: sv.email_ca_nhan || '(không có email)', reason: 'AUTO_OR_EMPTY_EMAIL' });
        }
      }

      const companiesUsed = pool.filter(c => c.assigned > 0).length;
      console.log(`[AutoAssign] Hoàn tất: ${log.assigned.length} sinh viên được gán, ${companiesUsed} doanh nghiệp được dùng`);
      console.log(`[AutoAssign] Email OK: ${log.emails_ok.length}, Skipped: ${log.emails_skipped.length}, Fail: ${log.emails_fail.length}`);
      console.log(`[AutoAssign] Thông báo tạo: ${log.notif_ok.length}, Bỏ qua (trùng): ${log.notif_skip.length}`);

      return res.json({
        success: true,
        message: `Đã gán doanh nghiệp cho ${log.assigned.length} sinh viên "Khoa giới thiệu" và chuyển sang bước "Doanh nghiệp phỏng vấn"`,
        assigned: log.assigned.length,
        companies_used: companiesUsed,
        emails_sent: log.emails_ok.length,
        emails_skipped: log.emails_skipped.length,
        emails_failed: log.emails_fail.length,
        notifications_created: log.notif_ok.length,
        notifications_skipped_duplicate: log.notif_skip.length,
        log
      });
    } catch (error) {
      console.error('[AutoAssign] Lỗi:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server: ' + error.message });
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
      const dotThucTapId = req.query.dot_thuc_tap_id ? parseInt(req.query.dot_thuc_tap_id) : null;
      // dot_thuc_tap_admin: 'dot-1' | 'dot-2' (đợt nhỏ)
      const allowedDotNho = new Set(['dot-1', 'dot-2']);
      const rawDotNho = String(req.query.dot_thuc_tap_admin || '').trim();
      const dotThucTapAdmin = allowedDotNho.has(rawDotNho) ? rawDotNho : null;
      // Chỉ lọc theo đợt nhỏ khi đã chọn đợt lớn
      const hasFullFilter = dotThucTapId && dotThucTapAdmin;

      // Tất cả lỗi SQL đều trả 0 - không bao giờ throw từ helper này
      const countRows = async (sql, params = []) => {
        try {
          const rows = await connection.query(sql, params);
          const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
          return Number(first.total ?? first.count ?? first.cnt ?? Object.values(first)[0] ?? 0) || 0;
        } catch (queryError) {
          console.warn('[Dashboard] countRows failed (returning 0):', queryError.code || queryError.message, '| SQL:', sql.slice(0, 120));
          return 0;
        }
      };

      const numberValue = async (sql, params = []) => {
        try {
          const rows = await connection.query(sql, params);
          const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
          const value = first.value ?? first.avg ?? first.total ?? Object.values(first)[0] ?? null;
          return value === null || value === undefined ? null : Number(value);
        } catch (queryError) {
          console.warn('[Dashboard] numberValue failed (returning null):', queryError.code || queryError.message, '| SQL:', sql.slice(0, 120));
          return null;
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

      // Tổng số đợt thực tập (luôn là hệ thống - dùng cho thống kê đợt)
      const [totalBatches, activeBatches] = await Promise.all([
        countRows('SELECT COUNT(*) AS total FROM dot_thuc_tap'),
        countRows("SELECT COUNT(*) AS total FROM dot_thuc_tap WHERE trang_thai = 'dang-mo'"),
      ]);

      // 4 ô overview + thống kê hoạt động – khi chọn đợt thì lọc theo đợt
      let totalStudents, totalLecturers, totalCompanies,
          rangeReports, rangeGrading, rangeAverageScore,
          studentRegistrationActivities, assignmentActivities,
          totalReports, totalGradedReports, totalAverageScore,
          activeReportStudents, previousWeekReports, activeInternships,
          totalCompanyRegistrations, pendingCompanyApprovals,
          totalStudentRegistrations, pendingStudentApprovals, rejectedStudents;

      if (dotThucTapId) {
        // ── Lấy scope của đợt lớn để lọc đúng sinh viên ──────────────────────
        // (giống InternshipBatchesController: dùng khoa_hoc_ap_dung + lop_ap_dung)
        const [batchRow] = await connection.query(
          'SELECT khoa_hoc_ap_dung, lop_ap_dung FROM dot_thuc_tap WHERE id = ?',
          [dotThucTapId]
        );
        const khoa = String(batchRow?.khoa_hoc_ap_dung ?? '').trim();
        const lop  = String(batchRow?.lop_ap_dung   ?? '').trim();

        // ── svFilter: lọc theo dot_thuc_tap_admin + batch scope ───────────────
        // KHÔNG dùng dot_thuc_tap_id vì sinh viên chưa có field này set
        // (đây là logic đúng giống trang Thực tập)
        const subAdmin  = hasFullFilter ? dotThucTapAdmin : null;
        const adminCond = subAdmin
          ? `COALESCE(TRIM(sv.dot_thuc_tap_admin), '') = ?`
          : `COALESCE(TRIM(sv.dot_thuc_tap_admin), '') IN ('dot-1', 'dot-2')`;
        const adminParams = subAdmin ? [subAdmin] : [];

        // Batch scope conditions (nếu batch có khoa_hoc/lop áp dụng)
        const scopeCond   = `
          AND (? = '' OR COALESCE(TRIM(sv.khoa_hoc), '') = ?)
          AND (? = '' OR COALESCE(TRIM(sv.lop), '') LIKE CONCAT('%', ?, '%'))
        `;
        const scopeParams = [khoa, khoa, lop, lop];

        const svFilter = `${adminCond} ${scopeCond}`;
        const svParams = [...adminParams, ...scopeParams];

        // JOIN helpers (COLLATE để tránh lỗi collation mismatch)
        const joinBncsv = `INNER JOIN sinh_vien sv ON sv.ma_sinh_vien COLLATE utf8mb4_unicode_ci = bncsv.ma_sinh_vien COLLATE utf8mb4_unicode_ci`;
        const joinDiem  = `INNER JOIN sinh_vien sv ON sv.ma_sinh_vien COLLATE utf8mb4_unicode_ci = d.ma_sinh_vien  COLLATE utf8mb4_unicode_ci`;
        const joinSvId  = `INNER JOIN sinh_vien sv ON sv.id = dk.sinh_vien_id`;
        const joinPctId = `INNER JOIN sinh_vien sv ON sv.id = pct.sinh_vien_id`;

        console.log('[Dashboard] Batch scope: khoa=' + khoa + ' | lop=' + lop);
        console.log('[Dashboard] svFilter:', svFilter.trim());
        console.log('[Dashboard] svParams:', svParams);

        // ── 4 ô overview: đếm đúng theo đợt nhỏ + batch scope ─────────────
        [totalStudents, totalLecturers, totalCompanies] = await Promise.all([
          // Số SV trong đợt nhỏ (giống InternshipsPage: dot_thuc_tap_admin + scope)
          countRows(`SELECT COUNT(*) AS total FROM sinh_vien sv WHERE ${svFilter}`, [...svParams]),

          // Số GV có giang_vien_huong_dan trong đợt
          // (ưu tiên dùng giang_vien_huong_dan từ sv vì phan_cong_thuc_tap thường rỗng)
          countRows(`
            SELECT COUNT(DISTINCT gv.id) AS total FROM giang_vien gv
            WHERE EXISTS (
              SELECT 1 FROM sinh_vien sv
              WHERE ${svFilter}
                AND LOWER(TRIM(sv.giang_vien_huong_dan)) COLLATE utf8mb4_unicode_ci
                  = LOWER(TRIM(gv.ho_ten)) COLLATE utf8mb4_unicode_ci
                AND NULLIF(TRIM(sv.giang_vien_huong_dan), '') IS NOT NULL
            ) OR EXISTS (
              SELECT 1 FROM phan_cong_thuc_tap pct
              INNER JOIN sinh_vien sv ON sv.id = pct.sinh_vien_id
              WHERE ${svFilter} AND pct.giang_vien_id = gv.id
            )
          `, [...svParams, ...svParams]),

          // Số đơn vị/công ty SV thực tập trong đợt
          // (dùng don_vi_thuc_tap + cong_ty_tu_lien_he từ sinh_vien)
          countRows(`
            SELECT COUNT(DISTINCT TRIM(
              COALESCE(NULLIF(TRIM(sv.don_vi_thuc_tap), ''), sv.cong_ty_tu_lien_he)
            )) AS total
            FROM sinh_vien sv
            WHERE ${svFilter}
              AND COALESCE(NULLIF(TRIM(sv.don_vi_thuc_tap), ''), NULLIF(TRIM(sv.cong_ty_tu_lien_he), '')) IS NOT NULL
          `, [...svParams]),
        ]);

        [
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
          activeInternships,
          totalCompanyRegistrations,
          pendingCompanyApprovals,
          totalStudentRegistrations,
          pendingStudentApprovals,
          rejectedStudents,
        ] = await Promise.all([
          // Báo cáo SV nộp (JOIN qua ma_sinh_vien với COLLATE)
          countRows(`SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien bncsv ${joinBncsv} WHERE ${svFilter} AND ${rangeCondition('bncsv.submitted_at')}`, [...svParams]),

          // GV chấm điểm
          countRows(`SELECT COUNT(*) AS total FROM diem_theo_dot_nop d ${joinDiem} WHERE d.diem_giang_vien IS NOT NULL AND ${svFilter} AND ${rangeCondition('d.updated_at')}`, [...svParams]),

          // Điểm TB theo khoảng thời gian
          numberValue(`SELECT AVG(d.diem_giang_vien) AS value FROM diem_theo_dot_nop d ${joinDiem} WHERE d.diem_giang_vien IS NOT NULL AND ${svFilter} AND ${rangeCondition('d.updated_at')}`, [...svParams]),

          // Đăng ký thực tập mới trong khoảng thời gian
          countRows(`SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien dk ${joinSvId} WHERE ${svFilter} AND ${rangeCondition('dk.created_at')}`, [...svParams]),

          // Phân công thực tập mới trong khoảng thời gian
          countRows(`SELECT COUNT(*) AS total FROM phan_cong_thuc_tap pct ${joinPctId} WHERE ${svFilter} AND ${rangeCondition('pct.created_at')}`, [...svParams]),

          // Tổng báo cáo trong đợt
          countRows(`SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien bncsv ${joinBncsv} WHERE ${svFilter}`, [...svParams]),

          // Tổng GV đã chấm điểm
          countRows(`SELECT COUNT(*) AS total FROM diem_theo_dot_nop d ${joinDiem} WHERE d.diem_giang_vien IS NOT NULL AND ${svFilter}`, [...svParams]),

          // Điểm TB tổng thể
          numberValue(`SELECT AVG(d.diem_giang_vien) AS value FROM diem_theo_dot_nop d ${joinDiem} WHERE d.diem_giang_vien IS NOT NULL AND ${svFilter}`, [...svParams]),

          // SV có nộp báo cáo
          countRows(`SELECT COUNT(DISTINCT bncsv.ma_sinh_vien) AS total FROM bai_nop_cua_sinh_vien bncsv ${joinBncsv} WHERE ${svFilter}`, [...svParams]),

          // Báo cáo tuần trước
          countRows(`SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien bncsv ${joinBncsv} WHERE ${svFilter} AND ${previousWeekCondition('bncsv.submitted_at')}`, [...svParams]),

          // SV đang thực tập: có don_vi_thuc_tap hoặc phan_cong/dang_ky được duyệt
          countRows(`
            SELECT COUNT(DISTINCT sv.id) AS total FROM sinh_vien sv
            LEFT JOIN phan_cong_thuc_tap pct ON pct.sinh_vien_id = sv.id
            LEFT JOIN dang_ky_thuc_tap_sinh_vien dk ON dk.sinh_vien_id = sv.id
            WHERE ${svFilter} AND (
              NULLIF(TRIM(COALESCE(sv.don_vi_thuc_tap, '')), '') IS NOT NULL
              OR NULLIF(TRIM(COALESCE(sv.cong_ty_tu_lien_he, '')), '') IS NOT NULL
              OR sv.trang_thai_phan_cong = 'da-phan-cong'
              OR pct.trang_thai IN ('dang-dien-ra', 'dang_thuc_tap', 'dang-thuc-tap', 'hoan_thanh')
              OR dk.trang_thai = 'da-duyet'
              OR dk.workflow_status IN ('DA_DUYET', 'DANG_THUC_TAP')
              OR dk.workflow_status_v2 IN ('APPROVED', 'PASS')
            )
          `, [...svParams]),

          // Đăng ký doanh nghiệp (theo đợt lớn)
          countRowsIfTableExists('dang_ky_doanh_nghiep', 'SELECT COUNT(*) AS total FROM dang_ky_doanh_nghiep WHERE dot_thuc_tap_id = ?', [dotThucTapId]),
          countRowsIfTableExists('dang_ky_doanh_nghiep', "SELECT COUNT(*) AS total FROM dang_ky_doanh_nghiep WHERE dot_thuc_tap_id = ? AND trang_thai = 'cho-duyet'", [dotThucTapId]),

          // Đăng ký SV trong đợt
          countRows(`SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien dk ${joinSvId} WHERE ${svFilter}`, [...svParams]),
          countRows(`SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien dk ${joinSvId} WHERE ${svFilter} AND dk.trang_thai IN ('dang_ky','cho-duyet')`, [...svParams]),
          countRows(`SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien dk ${joinSvId} WHERE ${svFilter} AND dk.trang_thai IN ('bi-tu-choi','bi_tu_choi','tu-choi')`, [...svParams]),
        ]);
      } else {
        // --- Không lọc theo đợt (toàn hệ thống) ---
        // Tổng hệ thống cho 4 ô overview
        [totalStudents, totalLecturers, totalCompanies] = await Promise.all([
          countRows('SELECT COUNT(*) AS total FROM sinh_vien'),
          countRows('SELECT COUNT(*) AS total FROM giang_vien'),
          countRows('SELECT COUNT(*) AS total FROM doanh_nghiep'),
        ]);

        [
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
          activeInternships,
          totalCompanyRegistrations,
          pendingCompanyApprovals,
          totalStudentRegistrations,
          pendingStudentApprovals,
          rejectedStudents,
        ] = await Promise.all([
          countRows(`SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien WHERE ${rangeCondition('submitted_at')}`),
          countRows(`
            SELECT COUNT(*) AS total FROM diem_theo_dot_nop
            WHERE diem_giang_vien IS NOT NULL AND ${rangeCondition('updated_at')}
          `),
          numberValue(`
            SELECT AVG(diem_giang_vien) AS value FROM diem_theo_dot_nop
            WHERE diem_giang_vien IS NOT NULL AND ${rangeCondition('updated_at')}
          `),
          countRows(`SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien WHERE ${rangeCondition('created_at')}`),
          countRows(`SELECT COUNT(*) AS total FROM phan_cong_thuc_tap WHERE ${rangeCondition('created_at')}`),
          countRows('SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien'),
          countRows('SELECT COUNT(*) AS total FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL'),
          numberValue('SELECT AVG(diem_giang_vien) AS value FROM diem_theo_dot_nop WHERE diem_giang_vien IS NOT NULL'),
          countRows('SELECT COUNT(DISTINCT ma_sinh_vien) AS total FROM bai_nop_cua_sinh_vien'),
          countRows(`SELECT COUNT(*) AS total FROM bai_nop_cua_sinh_vien WHERE ${previousWeekCondition('submitted_at')}`),
          countRows(`
            SELECT COUNT(DISTINCT sv.id) AS total FROM sinh_vien sv
            LEFT JOIN phan_cong_thuc_tap pct ON pct.sinh_vien_id = sv.id
            LEFT JOIN dang_ky_thuc_tap_sinh_vien dk ON dk.sinh_vien_id = sv.id
            WHERE pct.trang_thai IN ('dang-dien-ra', 'dang_thuc_tap', 'dang-thuc-tap')
               OR sv.trang_thai_phan_cong = 'da-phan-cong'
               OR NULLIF(TRIM(COALESCE(sv.don_vi_thuc_tap, '')), '') IS NOT NULL
               OR dk.trang_thai = 'da-duyet'
               OR dk.workflow_status IN ('DA_DUYET', 'DANG_THUC_TAP')
               OR dk.workflow_status_v2 IN ('APPROVED', 'PASS')
          `),
          countRowsIfTableExists('dang_ky_doanh_nghiep', 'SELECT COUNT(*) AS total FROM dang_ky_doanh_nghiep'),
          countRowsIfTableExists('dang_ky_doanh_nghiep', "SELECT COUNT(*) AS total FROM dang_ky_doanh_nghiep WHERE trang_thai = 'cho-duyet'"),
          countRows('SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien'),
          countRows("SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien WHERE trang_thai IN ('dang_ky', 'cho-duyet')"),
          countRows("SELECT COUNT(*) AS total FROM dang_ky_thuc_tap_sinh_vien WHERE trang_thai IN ('bi-tu-choi', 'bi_tu_choi', 'tu-choi')"),
        ]);
      }

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
          dotThucTapId,
          dotThucTapAdmin,
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
