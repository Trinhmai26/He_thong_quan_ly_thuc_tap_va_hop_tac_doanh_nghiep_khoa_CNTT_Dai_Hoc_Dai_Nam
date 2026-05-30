const path = require('path');
const fs = require('fs');
const TeacherSubmissions = require('../models/TeacherSubmissions');
const db = require('../database/connection');
const { enqueueMessage } = require('../services/zaloQueue');

// ─── Đưa tin nhắn vào hàng đợi sau khi tạo đợt ───────────────────────────────
// Không gửi Zalo trực tiếp — mọi tin đi qua zalo_message_queue.
// Worker (zaloWorker.js) sẽ gửi tuần tự để tránh xung đột tài khoản.

// giang_vien_huong_dan lưu HO_TEN của giảng viên, không phải ma_giang_vien.
// Phải truyền gvHoTen (req.user.hoTen) vào để query đúng.

function _fmtDate(dt) {
  if (!dt) return 'chưa xác định';
  try {
    return new Date(dt).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return String(dt); }
}

async function _enqueueSlotNotifications(lecturerId, gvHoTen, maGiangVien, slotId, { tieu_de, loai_bao_cao, start_at, end_at }) {
  try {
    const isNhatKy = loai_bao_cao === 'tuan';
    const typeName = isNhatKy ? 'nhật ký thực tập' : 'báo cáo thực tập';
    const msgType  = isNhatKy ? 'new_diary_period' : 'new_report_period';
    const startFmt = _fmtDate(start_at);
    const endFmt   = _fmtDate(end_at);

    const reminderAt = end_at ? new Date(new Date(end_at).getTime() - 24 * 60 * 60 * 1000) : null;
    const now        = new Date();

    // Ưu tiên 1: bảng sinh_vien_huong_dan (nguồn chính xác nhất, query bằng ma_giang_vien)
    let students = [];
    if (maGiangVien) {
      try {
        students = await db.query(
          `SELECT sv.id, sv.so_dien_thoai, sv.ho_ten
           FROM sinh_vien sv
           INNER JOIN sinh_vien_huong_dan svhd ON svhd.ma_sinh_vien = sv.ma_sinh_vien
           WHERE svhd.ma_giang_vien = ?`,
          [maGiangVien]
        );
      } catch (e) {
        if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
      }
    }

    // Ưu tiên 2: fallback qua cột giang_vien_huong_dan trong sinh_vien (LOWER+TRIM để chống lỗi encoding)
    if (!students.length && gvHoTen) {
      students = await db.query(
        `SELECT id, so_dien_thoai, ho_ten FROM sinh_vien
         WHERE LOWER(TRIM(giang_vien_huong_dan)) = LOWER(TRIM(?))`,
        [gvHoTen]
      );
    }

    if (!students.length) {
      console.log(`[ZaloQueue] GV "${gvHoTen}" (${maGiangVien}): không có SV có SĐT. Không queue.`);
      return 0;
    }

    let queued = 0;
    for (const sv of students) {
      const svName = sv.ho_ten || 'Sinh viên';

      // ── Tin thông báo tạo đợt ─────────────────────────────────────
      const notifTitle = '📢 THÔNG BÁO ĐỢT NỘP MỚI';
      const notifBody  = [
        `Xin chào ${svName},`,
        '',
        `Giảng viên ${gvHoTen} vừa tạo đợt nộp ${typeName} mới.`,
        '',
        `📌 Tên đợt: ${tieu_de}`,
        `📅 Thời gian bắt đầu: ${startFmt}`,
        `⏰ Hạn nộp: ${endFmt}`,
        '',
        'Sinh viên vui lòng truy cập hệ thống quản lý thực tập để nộp đúng thời hạn.',
        '',
        'Trân trọng,',
        'Khoa Công nghệ Thông tin - Trường Đại học Đại Nam',
      ].join('\n');

      console.log(`[ZaloQueue] Tin tạo đợt → SV "${svName}" (${sv.so_dien_thoai}):\n${notifBody}`);

      await enqueueMessage({
        lecturerId, studentId: sv.id, phone: sv.so_dien_thoai,
        title: notifTitle, message: notifBody,
        type: msgType, relatedId: slotId,
        scheduledAt: now, priority: 5,
      });
      queued++;

      // ── Tin nhắc 24h trước deadline ───────────────────────────────
      if (reminderAt && reminderAt > now) {
        const remTitle = '⏰ NHẮC HẠN NỘP';
        const remBody  = [
          `Xin chào ${svName},`,
          '',
          `Đợt nộp ${typeName} của bạn sắp hết hạn trong vòng 24 giờ.`,
          '',
          `📌 Tên đợt: ${tieu_de}`,
          `⏰ Hạn nộp: ${endFmt}`,
          '',
          'Bạn vui lòng hoàn thành và nộp trên hệ thống trước thời hạn để tránh bị ghi nhận nộp muộn.',
          '',
          'Trân trọng,',
          'Khoa Công nghệ Thông tin - Trường Đại học Đại Nam',
        ].join('\n');

        await enqueueMessage({
          lecturerId, studentId: sv.id, phone: sv.so_dien_thoai,
          title: remTitle, message: remBody,
          type: 'deadline_24h_reminder', relatedId: slotId,
          scheduledAt: reminderAt, priority: 3,
        });
      }
    }

    console.log(`[ZaloQueue] GV "${gvHoTen}" (${maGiangVien}) | Slot #${slotId} "${tieu_de}" | Queue ${queued} SV | Loại: ${msgType}`);
    return queued;
  } catch (err) {
    console.error('[ZaloQueue] _enqueueSlotNotifications error:', err.message);
    return 0;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

// Cập nhật scheduled_at của deadline_24h_reminder khi deadline thay đổi.
// Chỉ cập nhật các tin chưa gửi (pending/failed/cancelled).
async function _rescheduleReminder(slotId, end_at) {
  try {
    const newReminderAt = new Date(new Date(end_at).getTime() - 24 * 60 * 60 * 1000);
    if (isNaN(newReminderAt.getTime())) return;
    await db.query(
      `UPDATE zalo_message_queue
       SET scheduled_at = ?, status = 'pending', retry_count = 0, failed_reason = NULL, updated_at = NOW()
       WHERE related_id = ?
         AND type = 'deadline_24h_reminder'
         AND status NOT IN ('sent','processing')`,
      [newReminderAt, slotId]
    );
  } catch (err) {
    console.warn('[ZaloQueue] _rescheduleReminder error:', err.message);
  }
}

// Try to decode multipart filename (often latin1) to utf8 to keep Vietnamese characters correct
const decodeFilename = (name) => {
  try {
    if (!name) return name;
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
};

const sanitizeFilename = (name) => {
  if (!name) return 'file';
  // keep unicode letters; remove reserved characters and trim
  const base = path.basename(name);
  const cleaned = base
    .replace(/[\\/:*?"<>|]/g, '') // windows reserved
    .replace(/\s+/g, ' ')           // collapse spaces
    .trim();
  return cleaned || 'file';
};

// Normalize Vietnamese full name to uppercase ASCII with underscores, e.g. "Nguyễn Văn A" → "NGUYEN_VAN_A"
const normalizeVietnameseName = (name) => {
  if (!name) return 'UNKNOWN';
  return name
    .replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
};

// Ensure tables on first use
TeacherSubmissions.ensureTables().catch((e) => {
  console.error('Failed ensuring submission tables:', e.message);
});

module.exports = {
  // Teacher endpoints
  async createSlot(req, res) {
    try {
      const maGiangVien = req.user?.maGiangVien || req.user?.userId;
      // giang_vien_huong_dan lưu ho_ten → dùng hoTen để query sinh viên
      const gvHoTen     = String(req.user?.hoTen || req.user?.ho_ten || '').trim();
      if (!maGiangVien) return res.status(401).json({ message: 'Thiếu thông tin giảng viên' });

      const { tieu_de, loai_bao_cao = 'tuan', mo_ta, start_at, end_at } = req.body || {};
      if (!tieu_de || !start_at || !end_at) {
        return res.status(400).json({ message: 'Thiếu tieu_de/start_at/end_at' });
      }

      const { id } = await TeacherSubmissions.createSlot(maGiangVien, { tieu_de, loai_bao_cao, mo_ta, start_at, end_at });

      // Đưa vào hàng đợi Zalo — dùng gvHoTen để query đúng sinh viên
      let zaloQueued = 0;
      if (gvHoTen || maGiangVien) {
        zaloQueued = await _enqueueSlotNotifications(
          req.user?.id || null, gvHoTen, maGiangVien, id,
          { tieu_de, loai_bao_cao, start_at, end_at }
        ).catch(err => {
          console.error('[ZaloQueue] enqueue error:', err.message);
          return 0;
        });
      } else {
        console.warn(`[ZaloQueue] createSlot: không có hoTen/maGiangVien trong JWT — bỏ qua queue Zalo`);
      }

      return res.json({
        id,
        message: 'Tạo đợt thành công',
        zalo_queued: zaloQueued,
        zalo_note: zaloQueued > 0
          ? `Đã đưa thông báo vào hàng đợi cho ${zaloQueued} sinh viên. Worker sẽ gửi Zalo trong vài phút.`
          : 'Không có sinh viên nào được queue (chưa có SĐT hoặc chưa được phân công).',
      });
    } catch (err) {
      console.error('createSlot error:', err);
      return res.status(500).json({ message: 'Lỗi tạo đợt nộp' });
    }
  },

  async listTeacherSlots(req, res) {
    try {
      const maGiangVien = req.user?.maGiangVien || req.user?.userId;
      const rows = await TeacherSubmissions.listSlotsByTeacher(maGiangVien);
      return res.json(rows);
    } catch (err) {
      console.error('listTeacherSlots error:', err);
      return res.status(500).json({ message: 'Lỗi lấy danh sách đợt nộp' });
    }
  },

  async getSlotStatuses(req, res) {
    try {
      const maGiangVien = req.user?.maGiangVien || req.user?.userId;
      const { slotId } = req.params;
      const data = await TeacherSubmissions.getSlotWithStatuses(Number(slotId), maGiangVien);
      return res.json(data);
    } catch (err) {
      console.error('getSlotStatuses error:', err);
      return res.status(500).json({ message: err.message || 'Lỗi lấy trạng thái bài nộp' });
    }
  },

  async commentSubmission(req, res) {
    try {
      const maGiangVien = req.user?.maGiangVien || req.user?.userId;
      const { submissionId } = req.params;
      const { comment, trang_thai } = req.body || {};
      await TeacherSubmissions.addTeacherComment(Number(submissionId), maGiangVien, comment || '', trang_thai);
      return res.json({ success: true });
    } catch (err) {
      console.error('commentSubmission error:', err);
      return res.status(500).json({ message: err.message || 'Lỗi cập nhật nhận xét' });
    }
  },

  async updateSlot(req, res) {
    try {
      const maGiangVien = req.user?.maGiangVien || req.user?.userId;
      const { slotId } = req.params;
      const { tieu_de, mo_ta, loai_bao_cao, start_at, end_at } = req.body || {};
      if (!tieu_de || !start_at || !end_at) return res.status(400).json({ message: 'Thiếu tiêu đề/start_at/end_at' });
      const start = new Date(start_at);
      const end = new Date(end_at);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ message: 'Thời gian không hợp lệ' });
      if (start > end) return res.status(400).json({ message: 'start_at phải trước end_at' });

      const [slot] = await db.query(`SELECT id FROM dot_nop_bao_cao_theo_tuan WHERE id = ? AND ma_giang_vien = ?`, [Number(slotId), maGiangVien]);
      if (!slot) return res.status(404).json({ message: 'Không tìm thấy đợt nộp' });

      await TeacherSubmissions.updateSlot(maGiangVien, Number(slotId), { tieu_de, mo_ta, loai_bao_cao: loai_bao_cao || 'tuan', start_at, end_at });
      await _rescheduleReminder(Number(slotId), end_at);
      return res.json({ success: true });
    } catch (err) {
      console.error('updateSlot error:', err);
      return res.status(500).json({ message: 'Lỗi cập nhật đợt nộp' });
    }
  },

  async updateSlotTimes(req, res) {
    try {
      const maGiangVien = req.user?.maGiangVien || req.user?.userId;
      const { slotId } = req.params;
      const { start_at, end_at } = req.body || {};
      if (!start_at || !end_at) return res.status(400).json({ message: 'Thiếu start_at/end_at' });
      const start = new Date(start_at);
      const end = new Date(end_at);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return res.status(400).json({ message: 'Thời gian không hợp lệ' });
      if (start > end) return res.status(400).json({ message: 'start_at phải trước end_at' });

      // Ensure slot belongs to teacher
      const [slot] = await db.query(`SELECT id FROM dot_nop_bao_cao_theo_tuan WHERE id = ? AND ma_giang_vien = ?`, [Number(slotId), maGiangVien]);
      if (!slot) return res.status(404).json({ message: 'Không tìm thấy đợt nộp' });

      const r = await TeacherSubmissions.updateSlotTimes(maGiangVien, Number(slotId), { start_at, end_at });
      await _rescheduleReminder(Number(slotId), end_at);
      return res.json({ success: true, updated: r.affectedRows });
    } catch (err) {
      console.error('updateSlotTimes error:', err);
      return res.status(500).json({ message: 'Lỗi cập nhật thời gian' });
    }
  },

  async deleteSlot(req, res) {
    try {
      const maGiangVien = req.user?.maGiangVien || req.user?.userId;
      const { slotId } = req.params;
      const r = await TeacherSubmissions.deleteSlot(maGiangVien, Number(slotId));
      if (!r.affectedRows) {
        return res.status(404).json({ message: 'Không tìm thấy đợt nộp để xóa' });
      }
      return res.json({ success: true, deleted: r.affectedRows });
    } catch (err) {
      console.error('deleteSlot error:', err);
      return res.status(500).json({ message: 'Lỗi xóa đợt nộp' });
    }
  },

  // Student endpoints
  async listOpenSlotsForStudent(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      const rows = await TeacherSubmissions.listOpenSlotsForStudent(maSinhVien);
      return res.json(rows);
    } catch (err) {
      console.error('listOpenSlotsForStudent error:', err);
      return res.status(500).json({ message: 'Lỗi lấy đợt nộp' });
    }
  },

  async listAllSlotsForStudent(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      const rows = await TeacherSubmissions.listAllSlotsForStudent(maSinhVien);
      return res.json(rows);
    } catch (err) {
      console.error('listAllSlotsForStudent error:', err);
      return res.status(500).json({ message: 'Lỗi lấy danh sách đợt nộp' });
    }
  },

  async uploadSubmission(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      const { slotId } = req.params;
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      if (!req.file) return res.status(400).json({ message: 'Không có file tải lên' });

      // Enforce time window
      const [slot] = await db.query('SELECT * FROM dot_nop_bao_cao_theo_tuan WHERE id = ? LIMIT 1', [Number(slotId)]);
      if (!slot) return res.status(404).json({ message: 'Không tìm thấy đợt nộp' });
      const now = new Date();
      const start = new Date(slot.start_at);
      const end = new Date(slot.end_at);
      if (now < start) return res.status(400).json({ message: 'Đợt nộp chưa mở' });
      if (now > end) return res.status(400).json({ message: 'Đã hết thời gian nộp' });

      const uploadsRoot = path.join(process.cwd(), 'uploads', 'submissions', String(slotId));
      if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });
  const originalDecoded = sanitizeFilename(decodeFilename(req.file.originalname));
  const hoTen = req.user?.hoTen || '';
  const normalizedName = normalizeVietnameseName(hoTen);
  const ext = path.extname(originalDecoded);
  const safeName = `${maSinhVien}-${normalizedName}${ext}`;
      const destPath = path.join(uploadsRoot, safeName);
      fs.renameSync(req.file.path, destPath);

      const info = {
        file_path: destPath,
  original_name: originalDecoded,
        mime_type: req.file.mimetype,
        file_size: req.file.size
      };
      const { id } = await TeacherSubmissions.saveStudentSubmission(Number(slotId), maSinhVien, info);
      return res.json({ id, file: `/uploads/submissions/${slotId}/${safeName}` });
    } catch (err) {
      console.error('uploadSubmission error:', err);
      return res.status(500).json({ message: 'Lỗi nộp bài' });
    }
  }
  ,

  async uploadMultipleSubmissions(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      const { slotId } = req.params;
      const files = Array.isArray(req.files) ? req.files : [];
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      if (files.length === 0) return res.status(400).json({ message: 'Không có file tải lên' });

      const [slot] = await db.query('SELECT * FROM dot_nop_bao_cao_theo_tuan WHERE id = ? LIMIT 1', [Number(slotId)]);
      if (!slot) return res.status(404).json({ message: 'Không tìm thấy đợt nộp' });
      const now = new Date();
      const start = new Date(slot.start_at);
      const end = new Date(slot.end_at);
      if (now < start) return res.status(400).json({ message: 'Đợt nộp chưa mở' });
      if (now > end) return res.status(400).json({ message: 'Đã hết thời gian nộp' });

      const uploadsRoot = path.join(process.cwd(), 'uploads', 'submissions', String(slotId));
      if (!fs.existsSync(uploadsRoot)) fs.mkdirSync(uploadsRoot, { recursive: true });

      const hoTen = req.user?.hoTen || '';
      const normalizedName = normalizeVietnameseName(hoTen);
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const originalDecoded = sanitizeFilename(decodeFilename(file.originalname));
        const ext = path.extname(originalDecoded);
        const safeName = files.length === 1
          ? `${maSinhVien}-${normalizedName}${ext}`
          : `${maSinhVien}-${normalizedName}-${i + 1}${ext}`;
        const destPath = path.join(uploadsRoot, safeName);
        fs.renameSync(file.path, destPath);
        const info = {
          file_path: destPath,
          original_name: originalDecoded,
          mime_type: file.mimetype,
          file_size: file.size
        };
        const { id } = await TeacherSubmissions.saveStudentSubmission(Number(slotId), maSinhVien, info);
        results.push({ id, file: `/uploads/submissions/${slotId}/${safeName}` });
      }

      return res.json({ success: true, uploaded: results.length, files: results });
    } catch (err) {
      console.error('uploadMultipleSubmissions error:', err);
      return res.status(500).json({ message: 'Lỗi nộp nhiều file' });
    }
  },

  async getAdvisorInfo(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      let row;
      try {
        [row] = await db.query(
          `SELECT
              svhd.ma_giang_vien,
              COALESCE(svhd.ten_giang_vien, gv.ho_ten) AS ten_giang_vien,
              svhd.doanh_nghiep_thuc_tap,
              gv.hoc_vi,
              gv.khoa,
              gv.bo_mon,
              gv.chuc_vu,
              gv.email_ca_nhan AS email_giang_vien,
              gv.so_dien_thoai AS sdt_giang_vien
           FROM sinh_vien_huong_dan svhd
           LEFT JOIN giang_vien gv ON gv.ma_giang_vien = svhd.ma_giang_vien
           WHERE svhd.ma_sinh_vien = ?
           LIMIT 1`,
          [maSinhVien]
        );
      } catch (error) {
        if (!(error && (error.code === 'ER_NO_SUCH_TABLE' || String(error.message || '').includes("doesn't exist")))) {
          throw error;
        }

        [row] = await db.query(
          `SELECT
              gv.ma_giang_vien,
              gv.ho_ten AS ten_giang_vien,
              sv.don_vi_thuc_tap AS doanh_nghiep_thuc_tap,
              gv.hoc_vi,
              gv.khoa,
              gv.bo_mon,
              gv.chuc_vu,
              gv.email_ca_nhan AS email_giang_vien,
              gv.so_dien_thoai AS sdt_giang_vien
           FROM sinh_vien sv
           LEFT JOIN giang_vien gv ON LOWER(TRIM(sv.giang_vien_huong_dan)) = LOWER(TRIM(gv.ho_ten))
           WHERE sv.ma_sinh_vien = ?
           LIMIT 1`,
          [maSinhVien]
        );
      }
      const result = row ? { ...row } : {};
      // Lấy thêm thông tin doanh nghiệp qua phan_cong_thuc_tap
      if (maSinhVien) {
        try {
          const [[companyRow]] = await db.query(
            `SELECT
                dn.ten_cong_ty,
                dn.dia_chi_cong_ty,
                dn.email_cong_ty,
                dn.so_dien_thoai AS sdt_cong_ty,
                dn.website,
                dn.linh_vuc_hoat_dong,
                dn.ten_nguoi_lien_he,
                dn.chuc_vu_nguoi_lien_he,
                dn.dia_chi_thuc_tap
             FROM phan_cong_thuc_tap pct
             JOIN sinh_vien sv ON sv.id = pct.sinh_vien_id
             LEFT JOIN doanh_nghiep dn ON dn.id = pct.doanh_nghiep_id
             WHERE sv.ma_sinh_vien = ?
             LIMIT 1`,
            [maSinhVien]
          );
          if (companyRow) {
            result.ten_cong_ty = companyRow.ten_cong_ty || result.doanh_nghiep_thuc_tap;
            result.dia_chi_cong_ty = companyRow.dia_chi_cong_ty;
            result.email_cong_ty = companyRow.email_cong_ty;
            result.sdt_cong_ty = companyRow.sdt_cong_ty;
            result.website = companyRow.website;
            result.linh_vuc_hoat_dong = companyRow.linh_vuc_hoat_dong;
            result.ten_nguoi_lien_he = companyRow.ten_nguoi_lien_he;
            result.chuc_vu_nguoi_lien_he = companyRow.chuc_vu_nguoi_lien_he;
            result.dia_chi_thuc_tap = companyRow.dia_chi_thuc_tap;
          }
        } catch (_) { /* ignore if table missing */ }
      }
      return res.json(result);
    } catch (err) {
      console.error('getAdvisorInfo error:', err);
      return res.status(500).json({ message: 'Lỗi lấy thông tin giảng viên hướng dẫn' });
    }
  },

  async deleteMySubmission(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      const { submissionId } = req.params;
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      const filePath = await TeacherSubmissions.deleteSubmission(Number(submissionId), maSinhVien);
      if (!filePath) return res.status(404).json({ message: 'Không tìm thấy bài nộp hoặc không có quyền xóa' });
      // Delete file from disk
      const fs = require('fs');
      if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch {} }
      return res.json({ success: true });
    } catch (err) {
      console.error('deleteMySubmission error:', err);
      return res.status(500).json({ message: 'Lỗi xóa bài nộp' });
    }
  },

  async listAllMySubmissions(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      const rows = await TeacherSubmissions.listAllMySubmissions(maSinhVien);
      return res.json(rows);
    } catch (err) {
      console.error('listAllMySubmissions error:', err);
      return res.status(500).json({ message: 'Lỗi lấy lịch sử nộp bài' });
    }
  },

  async listMySubmissions(req, res) {
    try {
      const maSinhVien = req.user?.maSinhVien || req.user?.userId;
      const { slotId } = req.params;
      if (!maSinhVien) return res.status(401).json({ message: 'Thiếu thông tin sinh viên' });
      const rows = await TeacherSubmissions.listStudentSubmissions(Number(slotId), maSinhVien);
      return res.json(rows);
    } catch (err) {
      console.error('listMySubmissions error:', err);
      return res.status(500).json({ message: 'Lỗi lấy danh sách bài đã nộp' });
    }
  }
};
