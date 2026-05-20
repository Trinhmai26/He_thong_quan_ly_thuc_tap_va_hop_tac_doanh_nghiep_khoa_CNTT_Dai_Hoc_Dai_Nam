const connection = require('../database/connection');
const { createNotification, ensureNotificationsTable } = require('../utils/notificationHelper');
const { sendInterviewInviteEmail, sendInterviewResultEmail } = require('../services/EmailService');

const STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  PASS: 'PASS',
  FAIL: 'FAIL'
};

const STUDENT_ALLOWED = new Set([STATUS.PENDING, STATUS.REJECTED, STATUS.FAIL]);
const COMPANY_ALLOWED = new Set([STATUS.APPROVED, STATUS.INTERVIEW_SCHEDULED]);

const LEGACY_STATUS_MAP = {
  [STATUS.PENDING]: 'cho-duyet',
  [STATUS.APPROVED]: 'da-duyet',
  [STATUS.REJECTED]: 'tu-choi',
  [STATUS.INTERVIEW_SCHEDULED]: 'da-duyet',
  [STATUS.PASS]: 'da-duyet',
  [STATUS.FAIL]: 'tu-choi'
};

function normalizeStatus(input) {
  const raw = String(input || '').trim().toUpperCase();
  return STATUS[raw] || raw;
}

async function resolveStudentIdFromUser(user) {
  if (!user) return null;

  // Some tokens may already contain sinh_vien_id.
  if (user.sinh_vien_id) return Number(user.sinh_vien_id);

  if (user.maSinhVien) {
    const rows = await connection.query(
      'SELECT id FROM sinh_vien WHERE ma_sinh_vien = ? LIMIT 1',
      [String(user.maSinhVien).trim()]
    );
    if (rows && rows.length > 0) return Number(rows[0].id);
  }

  if (user.id) {
    const rows = await connection.query(
      'SELECT id FROM sinh_vien WHERE account_id = ? LIMIT 1',
      [user.id]
    );
    if (rows && rows.length > 0) return Number(rows[0].id);
  }

  return null;
}

async function resolveCompanyFromUser(user) {
  if (!user || !user.id) return null;

  const rows = await connection.query(
    'SELECT id, ten_cong_ty, dia_chi_cong_ty, ten_nguoi_lien_he, chuc_vu_nguoi_lien_he FROM doanh_nghiep WHERE account_id = ? LIMIT 1',
    [user.id]
  );

  if (!rows || rows.length === 0) return null;
  return rows[0];
}

class InterviewWorkflowController {
  static async createStudentApplication(req, res) {
    try {
      if (req.user?.role !== 'sinh-vien') {
        return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới có thể nộp hồ sơ' });
      }

      const sinhVienId = await resolveStudentIdFromUser(req.user);
      if (!sinhVienId) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ sinh viên' });
      }

      const {
        vi_tri_thuc_tap_mong_muon,
        ten_cong_ty,
        dia_chi_cong_ty,
        nguoi_lien_he,
        so_dien_thoai_lien_he,
        ghi_chu,
        nguyen_vong_thuc_tap
      } = req.body || {};

      if (!vi_tri_thuc_tap_mong_muon) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập vị trí thực tập mong muốn' });
      }

      const existed = await connection.query(
        `SELECT id, workflow_status_v2
         FROM dang_ky_thuc_tap_sinh_vien
         WHERE sinh_vien_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [sinhVienId]
      );

      if (existed && existed.length > 0 && !STUDENT_ALLOWED.has(String(existed[0].workflow_status_v2 || '').toUpperCase())) {
        return res.status(409).json({
          success: false,
          message: 'Bạn đã có hồ sơ đang được xử lý. Không thể tạo hồ sơ mới lúc này.'
        });
      }

      const result = await connection.query(
        `INSERT INTO dang_ky_thuc_tap_sinh_vien
         (
           sinh_vien_id,
           nguyen_vong_thuc_tap,
           vi_tri_thuc_tap_mong_muon,
           ten_cong_ty,
           dia_chi_cong_ty,
           nguoi_lien_he,
           so_dien_thoai_lien_he,
           ghi_chu,
           trang_thai,
           workflow_status_v2,
           workflow_status
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          sinhVienId,
          nguyen_vong_thuc_tap || 'tu-lien-he',
          String(vi_tri_thuc_tap_mong_muon).trim(),
          ten_cong_ty ? String(ten_cong_ty).trim() : null,
          dia_chi_cong_ty ? String(dia_chi_cong_ty).trim() : null,
          nguoi_lien_he ? String(nguoi_lien_he).trim() : null,
          so_dien_thoai_lien_he ? String(so_dien_thoai_lien_he).trim() : null,
          ghi_chu ? String(ghi_chu).trim() : null,
          LEGACY_STATUS_MAP[STATUS.PENDING],
          STATUS.PENDING,
          'CHO_DUYET'
        ]
      );

      // Gửi thông báo in-app cho sinh viên sau khi nộp hồ sơ thành công
      try {
        await ensureNotificationsTable();
        const svAccountRows = await connection.query(
          'SELECT account_id FROM sinh_vien WHERE id = ? LIMIT 1',
          [sinhVienId]
        );
        if (svAccountRows && svAccountRows.length > 0 && svAccountRows[0].account_id) {
          const companyDisplay = ten_cong_ty ? String(ten_cong_ty).trim() : null;
          await createNotification(
            svAccountRows[0].account_id,
            'Đăng ký thực tập thành công ✅',
            `Bạn đã đăng ký thực tập thành công${companyDisplay ? ` tại ${companyDisplay}` : ''} – vị trí: ${String(vi_tri_thuc_tap_mong_muon).trim()}. Hồ sơ đang chờ admin xét duyệt. Chúng tôi sẽ thông báo kết quả sớm nhất.`,
            'info',
            'registration_submitted'
          );
        }
      } catch (notifErr) {
        console.error('[createStudentApplication] Lỗi gửi thông báo sinh viên:', notifErr);
      }

      return res.status(201).json({
        success: true,
        message: 'Nộp hồ sơ thành công',
        data: { id: result.insertId, status: STATUS.PENDING }
      });
    } catch (error) {
      console.error('Interview workflow createStudentApplication error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi nộp hồ sơ' });
    }
  }

  static async getMyStudentApplications(req, res) {
    try {
      if (req.user?.role !== 'sinh-vien') {
        return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới có thể xem hồ sơ' });
      }

      const sinhVienId = await resolveStudentIdFromUser(req.user);
      if (!sinhVienId) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ sinh viên' });
      }

      const rows = await connection.query(
        `SELECT id, workflow_status_v2, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
                interview_date, interview_time, interview_location, interview_note, result_note,
                ly_do_tu_choi, created_at, updated_at
         FROM dang_ky_thuc_tap_sinh_vien
         WHERE sinh_vien_id = ?
         ORDER BY created_at DESC`,
        [sinhVienId]
      );

      return res.json({ success: true, data: rows || [] });
    } catch (error) {
      console.error('Interview workflow getMyStudentApplications error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách hồ sơ' });
    }
  }

  static async getMyLatestStudentApplication(req, res) {
    try {
      if (req.user?.role !== 'sinh-vien') {
        return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới có thể xem hồ sơ' });
      }

      const sinhVienId = await resolveStudentIdFromUser(req.user);
      if (!sinhVienId) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ sinh viên' });
      }

      const rows = await connection.query(
        `SELECT id, workflow_status_v2, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
                interview_date, interview_time, interview_location, interview_note, result_note,
                ly_do_tu_choi, created_at, updated_at
         FROM dang_ky_thuc_tap_sinh_vien
         WHERE sinh_vien_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [sinhVienId]
      );

      return res.json({ success: true, data: rows?.[0] || null });
    } catch (error) {
      console.error('Interview workflow getMyLatestStudentApplication error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy hồ sơ mới nhất' });
    }
  }

  static async getAdminApplications(req, res) {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Chỉ admin mới có quyền truy cập' });
      }

      const { status = '' } = req.query;
      const normalizedStatus = normalizeStatus(status);
      const where = [];
      const params = [];

      if (normalizedStatus && Object.values(STATUS).includes(normalizedStatus)) {
        where.push('dk.workflow_status_v2 = ?');
        params.push(normalizedStatus);
      }

      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const rows = await connection.query(
        `SELECT dk.id,
                dk.sinh_vien_id,
                sv.ma_sinh_vien,
                sv.ho_ten AS ten_sinh_vien,
                sv.email_ca_nhan AS email_sinh_vien,
                dk.vi_tri_thuc_tap_mong_muon AS vi_tri_tuyen,
                dk.ten_cong_ty,
                dk.workflow_status_v2,
                dk.ly_do_tu_choi,
                dk.interview_date,
                dk.interview_time,
                dk.interview_location,
                dk.result_note,
                dk.created_at AS ngay_dang_ky
         FROM dang_ky_thuc_tap_sinh_vien dk
         INNER JOIN sinh_vien sv ON sv.id = dk.sinh_vien_id
         ${whereClause}
         ORDER BY dk.created_at DESC`,
        params
      );

      return res.json({ success: true, data: rows || [] });
    } catch (error) {
      console.error('Interview workflow getAdminApplications error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy danh sách hồ sơ admin' });
    }
  }

  static async adminReviewApplication(req, res) {
    try {
      if (req.user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Chỉ admin mới có quyền thao tác' });
      }

      const { id } = req.params;
      const { decision, reason, ten_cong_ty } = req.body || {};
      const normalizedDecision = String(decision || '').trim().toUpperCase();

      if (!['APPROVED', 'REJECTED'].includes(normalizedDecision)) {
        return res.status(400).json({ success: false, message: 'decision phải là APPROVED hoặc REJECTED' });
      }

      const rows = await connection.query(
        'SELECT id, sinh_vien_id, workflow_status_v2, ten_cong_ty FROM dang_ky_thuc_tap_sinh_vien WHERE id = ? LIMIT 1',
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });
      }

      const current = String(rows[0].workflow_status_v2 || '').toUpperCase();
      if (current !== STATUS.PENDING) {
        return res.status(409).json({ success: false, message: 'Chỉ hồ sơ PENDING mới được duyệt/từ chối' });
      }

      const companyNameValue =
        normalizedDecision === STATUS.APPROVED
          ? (ten_cong_ty ? String(ten_cong_ty).trim() : String(rows[0].ten_cong_ty || '').trim() || null)
          : rows[0].ten_cong_ty;

      await connection.query(
        `UPDATE dang_ky_thuc_tap_sinh_vien
         SET workflow_status_v2 = ?,
             trang_thai = ?,
             workflow_status = ?,
             ly_do_tu_choi = ?,
             ten_cong_ty = ?,
             nguoi_duyet_id = ?,
             ngay_duyet = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [
          normalizedDecision,
          LEGACY_STATUS_MAP[normalizedDecision],
          normalizedDecision === STATUS.APPROVED ? 'DA_DUYET' : 'TU_CHOI',
          normalizedDecision === STATUS.REJECTED ? (reason ? String(reason).trim() : 'Admin rejected application') : null,
          companyNameValue,
          req.user.id,
          id
        ]
      );

      // Gửi thông báo cho sinh viên
      try {
        await ensureNotificationsTable();
        const svAccountRows = await connection.query(
          'SELECT account_id FROM sinh_vien WHERE id = ? LIMIT 1',
          [rows[0].sinh_vien_id]
        );
        if (svAccountRows && svAccountRows.length > 0 && svAccountRows[0].account_id) {
          const svMsg = normalizedDecision === STATUS.APPROVED
            ? `Chúc mừng! Hồ sơ đăng ký thực tập của bạn tại ${companyNameValue || 'doanh nghiệp'} đã được phê duyệt. Doanh nghiệp sẽ sớm liên hệ để hẹn lịch phỏng vấn.`
            : `Hồ sơ đăng ký thực tập của bạn đã bị từ chối. Lý do: ${reason ? String(reason).trim() : 'Không đáp ứng yêu cầu'}.`;
          await createNotification(
            svAccountRows[0].account_id,
            normalizedDecision === STATUS.APPROVED ? 'Hồ sơ đăng ký thực tập đã được duyệt 🎉' : 'Hồ sơ đăng ký thực tập bị từ chối',
            svMsg,
            normalizedDecision === STATUS.APPROVED ? 'success' : 'error',
            normalizedDecision === STATUS.APPROVED ? 'registration_approved' : 'registration_rejected'
          );
        }
      } catch (notifErr) {
        console.error('[AdminReview] Lỗi gửi thông báo sinh viên:', notifErr);
      }

      // Gửi thông báo cho doanh nghiệp (chỉ khi APPROVED)
      if (normalizedDecision === STATUS.APPROVED && companyNameValue) {
        try {
          const companyRows = await connection.query(
            'SELECT dn.account_id, sv.ho_ten FROM doanh_nghiep dn, sinh_vien sv WHERE TRIM(LOWER(dn.ten_cong_ty)) = TRIM(LOWER(?)) AND sv.id = ? LIMIT 1',
            [companyNameValue, rows[0].sinh_vien_id]
          );
          if (companyRows && companyRows.length > 0 && companyRows[0].account_id) {
            const tenSV = companyRows[0].ho_ten || 'Một sinh viên';
            await createNotification(
              companyRows[0].account_id,
              'Hồ sơ thực tập mới được phân công',
              `Sinh viên ${tenSV} đã được admin phê duyệt thực tập tại doanh nghiệp của bạn. Vui lòng đăng nhập để xem hồ sơ và hẹn lịch phỏng vấn.`,
              'info',
              'student_assigned'
            );
          }
        } catch (notifErr) {
          console.error('[AdminReview] Lỗi gửi thông báo doanh nghiệp:', notifErr);
        }
      }

      return res.json({
        success: true,
        message: normalizedDecision === STATUS.APPROVED ? 'Duyệt hồ sơ thành công' : 'Từ chối hồ sơ thành công',
        data: { id: Number(id), status: normalizedDecision }
      });
    } catch (error) {
      console.error('Interview workflow adminReviewApplication error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi duyệt hồ sơ' });
    }
  }

  static async getCompanyApprovedApplications(req, res) {
    try {
      if (req.user?.role !== 'doanh-nghiep') {
        return res.status(403).json({ success: false, message: 'Chỉ doanh nghiệp mới có quyền truy cập' });
      }

      const company = await resolveCompanyFromUser(req.user);
      if (!company) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin doanh nghiệp' });
      }

      const rows = await connection.query(
        `SELECT dk.id,
                dk.sinh_vien_id,
                sv.ma_sinh_vien,
                sv.ho_ten AS ten_sinh_vien,
                sv.email_ca_nhan AS email_sinh_vien,
                sv.so_dien_thoai,
                sv.cv_path,
                dk.vi_tri_thuc_tap_mong_muon AS vi_tri_tuyen,
                dk.ten_cong_ty,
                dk.workflow_status_v2,
                dk.interview_date,
                dk.interview_time,
                dk.interview_location,
                dk.interview_note,
                dk.result_note,
                dk.created_at
         FROM dang_ky_thuc_tap_sinh_vien dk
         INNER JOIN sinh_vien sv ON sv.id = dk.sinh_vien_id
         WHERE TRIM(LOWER(COALESCE(dk.ten_cong_ty, ''))) = TRIM(LOWER(?))
           AND dk.workflow_status_v2 IN ('APPROVED', 'INTERVIEW_SCHEDULED')
         ORDER BY dk.created_at DESC`,
        [company.ten_cong_ty]
      );

      return res.json({ success: true, data: rows || [] });
    } catch (error) {
      console.error('Interview workflow getCompanyApprovedApplications error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi lấy hồ sơ cho doanh nghiệp' });
    }
  }

  static async companyConfirmInterview(req, res) {
    try {
      if (req.user?.role !== 'doanh-nghiep') {
        return res.status(403).json({ success: false, message: 'Chỉ doanh nghiệp mới có quyền thao tác' });
      }

      const company = await resolveCompanyFromUser(req.user);
      if (!company) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin doanh nghiệp' });
      }

      const { id } = req.params;
      const { interviewDate, interviewTime, interviewLocation, interviewNote } = req.body || {};

      if (!interviewDate || !interviewTime || !interviewLocation) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập đầy đủ ngày, giờ và địa điểm phỏng vấn'
        });
      }

      const rows = await connection.query(
        `SELECT id, workflow_status_v2, ten_cong_ty
         FROM dang_ky_thuc_tap_sinh_vien
         WHERE id = ?
         LIMIT 1`,
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });
      }

      const application = rows[0];
      const status = String(application.workflow_status_v2 || '').toUpperCase();
      if (!COMPANY_ALLOWED.has(status)) {
        return res.status(409).json({
          success: false,
          message: 'Chỉ hồ sơ APPROVED hoặc INTERVIEW_SCHEDULED mới được đặt lịch phỏng vấn'
        });
      }

      if (String(application.ten_cong_ty || '').trim().toLowerCase() !== String(company.ten_cong_ty || '').trim().toLowerCase()) {
        return res.status(403).json({ success: false, message: 'Hồ sơ này không thuộc doanh nghiệp của bạn' });
      }

      await connection.query(
        `UPDATE dang_ky_thuc_tap_sinh_vien
         SET workflow_status_v2 = ?,
             trang_thai = ?,
             workflow_status = 'DA_DUYET',
             interview_date = ?,
             interview_time = ?,
             interview_location = ?,
             interview_note = ?,
             interview_updated_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [
          STATUS.INTERVIEW_SCHEDULED,
          LEGACY_STATUS_MAP[STATUS.INTERVIEW_SCHEDULED],
          interviewDate,
          interviewTime,
          String(interviewLocation).trim(),
          interviewNote ? String(interviewNote).trim() : null,
          id
        ]
      );

      let studentEmailResult = null;

      // Gửi thông báo in-app và email cho sinh viên
      try {
        const appDetail = await connection.query(
          `SELECT sv.account_id, sv.ho_ten, sv.email_ca_nhan, dk.ten_cong_ty, dk.vi_tri_thuc_tap_mong_muon
           FROM dang_ky_thuc_tap_sinh_vien dk
           INNER JOIN sinh_vien sv ON sv.id = dk.sinh_vien_id
           WHERE dk.id = ? LIMIT 1`,
          [id]
        );
        if (appDetail && appDetail.length > 0) {
          const detail = appDetail[0];
          const viTriInvite = detail.vi_tri_thuc_tap_mong_muon || '';
          const senderNameInvite = company.ten_nguoi_lien_he || 'Bộ phận Nhân sự';
          const senderTitleInvite = company.chuc_vu_nguoi_lien_he || 'Đại diện Doanh nghiệp';
          if (detail.account_id) {
            await ensureNotificationsTable();
            await createNotification(
              detail.account_id,
              'Lịch phỏng vấn đã được xác nhận 📅',
              `Doanh nghiệp ${detail.ten_cong_ty || company.ten_cong_ty} đã xác nhận lịch phỏng vấn: ngày ${interviewDate} lúc ${interviewTime} tại ${interviewLocation}.${interviewNote ? ' Ghi chú: ' + interviewNote : ''}`,
              'success',
              'interview_scheduled'
            );
          }
          if (detail.email_ca_nhan) {
            try {
              studentEmailResult = await sendInterviewInviteEmail({
                studentEmail: detail.email_ca_nhan,
                studentName: detail.ho_ten || 'Sinh viên',
                companyName: detail.ten_cong_ty || company.ten_cong_ty,
                interviewDate,
                interviewTime,
                interviewLocation,
                interviewNote: interviewNote || null,
                position: viTriInvite,
                senderName: senderNameInvite,
                senderTitle: senderTitleInvite
              });
              console.log('[CompanyConfirmInterview] Email sinh vien result:', studentEmailResult);
            } catch (err) {
              studentEmailResult = {
                success: false,
                reason: 'EMAIL_SEND_ERROR',
                error: err && err.message ? err.message : String(err)
              };
              console.error('[CompanyConfirmInterview] Loi gui email lich phong van:', err);
            }
          } else {
            studentEmailResult = {
              success: true,
              skipped: true,
              reason: 'NO_STUDENT_EMAIL'
            };
          }
        }
      } catch (notifErr) {
        console.error('[CompanyConfirmInterview] Lỗi gửi thông báo sinh viên:', notifErr);
      }

      return res.json({
        success: true,
        message: 'Đã xác nhận lịch phỏng vấn',
        data: {
          id: Number(id),
          status: STATUS.INTERVIEW_SCHEDULED,
          redirectStudentTo: '/student/interview',
          studentEmail: studentEmailResult
        }
      });
    } catch (error) {
      console.error('Interview workflow companyConfirmInterview error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi xác nhận phỏng vấn' });
    }
  }

  static async companySetInterviewResult(req, res) {
    try {
      console.log('[SetResult] req.user:', JSON.stringify(req.user));
      if (req.user?.role !== 'doanh-nghiep') {
        return res.status(403).json({ success: false, message: 'Chỉ doanh nghiệp mới có quyền thao tác' });
      }

      const company = await resolveCompanyFromUser(req.user);
      console.log('[SetResult] company resolved:', JSON.stringify(company));
      if (!company) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin doanh nghiệp' });
      }

      const { id } = req.params;
      const { result, resultNote } = req.body || {};
      const normalized = normalizeStatus(result);

      if (![STATUS.PASS, STATUS.FAIL].includes(normalized)) {
        return res.status(400).json({ success: false, message: 'Kết quả phỏng vấn chỉ được là PASS hoặc FAIL' });
      }

      const rows = await connection.query(
        'SELECT id, workflow_status_v2, ten_cong_ty FROM dang_ky_thuc_tap_sinh_vien WHERE id = ? LIMIT 1',
        [id]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy hồ sơ' });
      }

      const application = rows[0];
      if (String(application.workflow_status_v2 || '').toUpperCase() !== STATUS.INTERVIEW_SCHEDULED) {
        return res.status(409).json({ success: false, message: 'Chỉ hồ sơ đã lên lịch phỏng vấn mới được cập nhật kết quả' });
      }

      if (String(application.ten_cong_ty || '').trim().toLowerCase() !== String(company.ten_cong_ty || '').trim().toLowerCase()) {
        return res.status(403).json({ success: false, message: 'Hồ sơ này không thuộc doanh nghiệp của bạn' });
      }

      await connection.query(
        `UPDATE dang_ky_thuc_tap_sinh_vien
         SET workflow_status_v2 = ?,
             trang_thai = ?,
             workflow_status = ?,
             result_note = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          normalized,
          LEGACY_STATUS_MAP[normalized],
          normalized === STATUS.PASS ? 'DA_DUYET' : 'TU_CHOI',
          resultNote ? String(resultNote).trim() : null,
          id
        ]
      );

      let studentEmailResult = null;

      // Gửi thông báo và email cho sinh viên + admin
      try {
        await ensureNotificationsTable();
        const appDetail = await connection.query(
          `SELECT sv.account_id, sv.ho_ten, sv.ma_sinh_vien, sv.email_ca_nhan, dk.ten_cong_ty, dk.vi_tri_thuc_tap_mong_muon
           FROM dang_ky_thuc_tap_sinh_vien dk
           INNER JOIN sinh_vien sv ON sv.id = dk.sinh_vien_id
           WHERE dk.id = ? LIMIT 1`,
          [id]
        );

        const isPass = normalized === STATUS.PASS;
        const detail = appDetail && appDetail.length > 0 ? appDetail[0] : null;
        const companyNameDisplay = (detail && detail.ten_cong_ty) || company.ten_cong_ty;
        const studentName = (detail && detail.ho_ten) || 'Sinh viên';
        const studentCode = (detail && detail.ma_sinh_vien) || '';
        const studentEmail = detail && detail.email_ca_nhan;
        const svAccountId = detail && detail.account_id;
        const noteText = resultNote ? String(resultNote).trim() : null;
        const viTri = (detail && detail.vi_tri_thuc_tap_mong_muon) || '';
        const companyAddress = company.dia_chi_cong_ty || '';
        const senderName = company.ten_nguoi_lien_he || 'Bộ phận Nhân sự';
        const senderTitle = company.chuc_vu_nguoi_lien_he || 'Đại diện Doanh nghiệp';

        // 1. Thông báo in-app cho sinh viên
        if (svAccountId) {
          const svTitle = isPass
            ? 'Chúc mừng! Bạn đã đạt phỏng vấn thực tập 🎉'
            : 'Kết quả phỏng vấn thực tập: Chưa đạt';
          const svMsg = isPass
            ? `Doanh nghiệp ${companyNameDisplay} xác nhận bạn đã PASS phỏng vấn thực tập.${ noteText ? ' Nhận xét: ' + noteText : ''} Chúc mừng!`
            : `Doanh nghiệp ${companyNameDisplay} thông báo bạn chưa đạt phỏng vấn (FAIL).${ noteText ? ' Nhận xét: ' + noteText : ''} Admin khoa sẽ liên hệ yêu cầu bạn đăng ký thực tập lần 2.`;
          await createNotification(svAccountId, svTitle, svMsg, isPass ? 'success' : 'error', isPass ? 'interview_pass' : 'interview_fail');

          // 2. Nếu FAIL: gửi thêm thông báo yêu cầu đăng ký lại
          if (!isPass) {
            await createNotification(
              svAccountId,
              'Yêu cầu đăng ký thực tập lần 2 📋',
              'Bạn cần đăng ký thực tập lần 2. Vui lòng vào mục "Đăng ký thực tập" để nộp hồ sơ mới. Admin sẽ xét duyệt hồ sơ của bạn như lần đầu.',
              'warning',
              're_register_required'
            );
          }
        }

        // 3. Email cho sinh viên
        if (studentEmail) {
          try {
            studentEmailResult = await sendInterviewResultEmail({
              toEmail: studentEmail,
              toName: studentName,
              studentName,
              studentCode,
              companyName: companyNameDisplay,
              result: normalized,
              resultNote: noteText,
              position: viTri,
              companyAddress,
              senderName,
              senderTitle,
              isAdmin: false
            });
            console.log('[companySetInterviewResult] Email sinh vien result:', studentEmailResult);
          } catch (err) {
            studentEmailResult = {
              success: false,
              reason: 'EMAIL_SEND_ERROR',
              error: err && err.message ? err.message : String(err)
            };
            console.error('[companySetInterviewResult] Loi gui email sinh vien:', err);
          }
        } else {
          studentEmailResult = {
            success: true,
            skipped: true,
            reason: 'NO_STUDENT_EMAIL'
          };
        }

        // 4. Thông báo in-app + email cho tất cả admin
        const adminAccounts = await connection.query(
          `SELECT a.id, a.email FROM accounts a WHERE a.role = 'admin'`
        );
        if (adminAccounts && adminAccounts.length > 0) {
          const adminTitle = `Kết quả phỏng vấn: ${studentName} – ${isPass ? 'PASS ✅' : 'FAIL ❌'}`;
          const adminMsg = `Doanh nghiệp ${companyNameDisplay} vừa cập nhật kết quả phỏng vấn cho sinh viên ${studentName} (${studentCode}): ${ isPass ? 'ĐẠT (PASS)' : 'KHÔNG ĐẠT (FAIL)' }.${ noteText ? ' Nhận xét: ' + noteText : ''}${ !isPass ? ' Sinh viên sẽ được yêu cầu đăng ký thực tập lần 2.' : ''}`;
          for (const admin of adminAccounts) {
            try {
              await createNotification(admin.id, adminTitle, adminMsg, isPass ? 'success' : 'warning', 'interview_result_update');
            } catch (e) {
              console.error(`[companySetInterviewResult] Lỗi thông báo admin ${admin.id}:`, e);
            }
            if (admin.email) {
              sendInterviewResultEmail({
                toEmail: admin.email,
                toName: 'Admin Khoa CNTT',
                studentName,
                studentCode,
                companyName: companyNameDisplay,
                result: normalized,
                resultNote: noteText,
                position: viTri,
                senderName,
                senderTitle,
                isAdmin: true
              }).catch(err => console.error(`[companySetInterviewResult] Lỗi gửi email admin ${admin.email}:`, err));
            }
          }
        }
      } catch (notifErr) {
        console.error('[companySetInterviewResult] Lỗi gửi thông báo/email:', notifErr);
      }

      return res.json({
        success: true,
        message: 'Cập nhật kết quả phỏng vấn thành công',
        data: {
          id: Number(id),
          status: normalized,
          studentEmail: studentEmailResult
        }
      });
    } catch (error) {
      console.error('Interview workflow companySetInterviewResult error:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật kết quả' });
    }
  }
}

module.exports = InterviewWorkflowController;
