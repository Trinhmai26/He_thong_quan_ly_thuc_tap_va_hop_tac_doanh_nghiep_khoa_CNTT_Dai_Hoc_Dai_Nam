const db = require('../database/connection');
const ZaloService = require('../services/ZaloService');
const crypto = require('crypto');
const axios = require('axios');

/**
 * Xác thực webhook signature từ Zalo (HMAC-SHA256)
 */
function verifyZaloWebhook(req) {
  const secret = process.env.ZALO_WEBHOOK_SECRET || '';
  if (!secret) return true; // Bỏ qua verify nếu chưa cấu hình secret
  const signature = req.headers['x-zevent-signature'] || '';
  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
  return signature === expected;
}

class ZaloController {
  /**
   * GET /api/zalo/webhook - Xác thực webhook URL với Zalo OA
   */
  static async verifyWebhook(req, res) {
    // Zalo gửi challenge để xác thực URL
    const challenge = req.query.challenge || '';
    res.send(challenge);
  }

  /**
   * POST /api/zalo/webhook - Nhận sự kiện từ Zalo OA
   *
   * Luồng liên kết tài khoản:
   * 1. SV/GV follow OA trên Zalo
   * 2. Họ nhắn tin mã SV/GV vào OA (VD: "1671020196" hoặc "GV001")
   * 3. Webhook nhận message → tra DB → lưu zalo_user_id → gửi xác nhận
   */
  static async handleWebhook(req, res) {
    if (!verifyZaloWebhook(req)) {
      return res.status(403).json({ error: 'Invalid signature' });
    }

    res.sendStatus(200); // Phải trả 200 ngay cho Zalo

    try {
      const event = req.body;
      const eventName = event?.event_name;
      const senderId = event?.sender?.id; // Zalo user ID của người gửi
      const messageText = event?.message?.text?.trim() || '';

      console.log(`[ZaloWebhook] event=${eventName}, sender=${senderId}, text="${messageText}"`);

      if (eventName === 'follow') {
        // Người dùng follow OA → yêu cầu họ nhập mã để liên kết
        if (senderId) {
          await ZaloService.sendTextMessage(
            senderId,
            '👋 Chào mừng bạn đến với hệ thống Quản lý Thực tập – ĐH Đại Nam!\n\n' +
            'Để liên kết tài khoản, vui lòng nhắn tin mã số của bạn:\n' +
            '• Sinh viên: nhắn mã sinh viên (VD: 1671020196)\n' +
            '• Giảng viên: nhắn mã giảng viên (VD: GV001)\n\n' +
            'Sau khi liên kết, bạn sẽ nhận thông báo từ hệ thống qua Zalo.'
          );
        }
        return;
      }

      if (eventName === 'unfollow') {
        // Người dùng unfollow → xóa zalo_user_id
        if (senderId) {
          await db.query(
            "UPDATE sinh_vien SET zalo_user_id = NULL WHERE zalo_user_id = ?",
            [senderId]
          );
          await db.query(
            "UPDATE giang_vien SET zalo_user_id = NULL WHERE zalo_user_id = ?",
            [senderId]
          );
          console.log(`[ZaloWebhook] Unlinked zalo_user_id=${senderId}`);
        }
        return;
      }

      if (eventName === 'user_send_text' && senderId && messageText) {
        // Người dùng nhắn mã để liên kết
        await ZaloController._handleLinkRequest(senderId, messageText);
        return;
      }

    } catch (err) {
      console.error('[ZaloWebhook] Error handling event:', err.message);
    }
  }

  /**
   * Xử lý yêu cầu liên kết tài khoản từ tin nhắn mã SV/GV
   */
  static async _handleLinkRequest(zaloUserId, code) {
    const cleanCode = code.replace(/\s+/g, '').toUpperCase();

    // Kiểm tra có phải mã sinh viên không (toàn số)
    if (/^\d+$/.test(code.trim())) {
      const rows = await db.query(
        'SELECT id, ho_ten, ma_sinh_vien FROM sinh_vien WHERE TRIM(ma_sinh_vien) = ?',
        [code.trim()]
      );
      if (rows.length > 0) {
        const sv = rows[0];
        // Kiểm tra nếu mã này đã được liên kết với tài khoản Zalo khác
        const existing = await db.query(
          'SELECT id FROM sinh_vien WHERE zalo_user_id = ? AND id != ?',
          [zaloUserId, sv.id]
        );
        if (existing.length > 0) {
          await ZaloService.sendTextMessage(
            zaloUserId,
            '⚠️ Tài khoản Zalo này đã được liên kết với một sinh viên khác. Vui lòng liên hệ quản trị viên.'
          );
          return;
        }
        await db.query(
          'UPDATE sinh_vien SET zalo_user_id = ? WHERE id = ?',
          [zaloUserId, sv.id]
        );
        await ZaloService.sendTextMessage(
          zaloUserId,
          `✅ Liên kết thành công!\n\nChào ${sv.ho_ten} (${sv.ma_sinh_vien}),\nTừ nay bạn sẽ nhận thông báo từ hệ thống qua Zalo này.`
        );
        console.log(`[ZaloWebhook] Linked sinh_vien ${sv.ma_sinh_vien} ↔ zalo_user_id=${zaloUserId}`);
        return;
      }
    }

    // Kiểm tra mã giảng viên (bắt đầu bằng chữ hoặc hỗn hợp)
    const gvRows = await db.query(
      'SELECT id, ho_ten, ma_giang_vien FROM giang_vien WHERE UPPER(TRIM(ma_giang_vien)) = ?',
      [cleanCode]
    );
    if (gvRows.length > 0) {
      const gv = gvRows[0];
      await db.query(
        'UPDATE giang_vien SET zalo_user_id = ? WHERE id = ?',
        [zaloUserId, gv.id]
      );
      await ZaloService.sendTextMessage(
        zaloUserId,
        `✅ Liên kết thành công!\n\nChào ${gv.ho_ten} (${gv.ma_giang_vien}),\nTừ nay bạn sẽ nhận thông báo từ hệ thống qua Zalo này.`
      );
      console.log(`[ZaloWebhook] Linked giang_vien ${gv.ma_giang_vien} ↔ zalo_user_id=${zaloUserId}`);
      return;
    }

    // Không tìm thấy
    await ZaloService.sendTextMessage(
      zaloUserId,
      `❌ Không tìm thấy mã "${code}" trong hệ thống.\n\nVui lòng kiểm tra lại:\n• Sinh viên: nhắn đúng mã sinh viên (VD: 1671020196)\n• Giảng viên: nhắn đúng mã giảng viên (VD: GV001)\n\nHoặc liên hệ phòng đào tạo để được hỗ trợ.`
    );
  }

  /**
   * POST /api/zalo/send - Admin hoặc GV gửi thông báo Zalo
   * Body: { message, recipients: 'students'|'lecturers'|'all', filter?: { khoa?, lop? } }
   */
  static async sendNotification(req, res) {
    try {
      const { role } = req.user;
      const { message, recipients, filter = {} } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập nội dung tin nhắn' });
      }
      if (!recipients) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn người nhận' });
      }

      let targetList = [];

      if ((recipients === 'students' || recipients === 'all') && (role === 'admin' || role === 'giang-vien')) {
        let query = 'SELECT ho_ten, ma_sinh_vien, zalo_user_id FROM sinh_vien WHERE zalo_user_id IS NOT NULL';
        const params = [];
        if (filter.khoa) { query += ' AND khoa = ?'; params.push(filter.khoa); }
        if (filter.lop) { query += ' AND lop = ?'; params.push(filter.lop); }
        // Nếu là giảng viên, chỉ gửi cho SV được phân công
        if (role === 'giang-vien') {
          const gvRows = await db.query(
            'SELECT id FROM giang_vien WHERE account_id = ? LIMIT 1',
            [req.user.id]
          );
          if (gvRows.length > 0) {
            query += ' AND giang_vien_huong_dan = ?';
            params.push(gvRows[0].id);
          }
        }
        const rows = await db.query(query, params);
        targetList.push(...rows.map(r => ({ zaloUserId: r.zalo_user_id, name: `${r.ho_ten} (${r.ma_sinh_vien})` })));
      }

      if ((recipients === 'lecturers' || recipients === 'all') && role === 'admin') {
        const rows = await db.query(
          'SELECT ho_ten, ma_giang_vien, zalo_user_id FROM giang_vien WHERE zalo_user_id IS NOT NULL'
        );
        targetList.push(...rows.map(r => ({ zaloUserId: r.zalo_user_id, name: `${r.ho_ten} (${r.ma_giang_vien})` })));
      }

      if (targetList.length === 0) {
        return res.json({ success: true, message: 'Không có người nhận nào đã liên kết Zalo.', data: { sent: 0, failed: 0 } });
      }

      // Gửi bất đồng bộ, không block response
      res.json({
        success: true,
        message: `Đang gửi ${targetList.length} tin nhắn Zalo...`,
        data: { total: targetList.length }
      });

      // Gửi trong background
      ZaloService.sendBulk(targetList, message.trim()).then(result => {
        console.log(`[Zalo sendNotification] Sent: ${result.sent}, Failed: ${result.failed}`);
        if (result.errors.length > 0) {
          console.log('[Zalo] Failed recipients:', result.errors);
        }
      });

    } catch (err) {
      console.error('[ZaloController] sendNotification error:', err.message);
      return res.status(500).json({ success: false, message: 'Lỗi server khi gửi Zalo' });
    }
  }

  /**
   * GET /api/zalo/linked-status - Thống kê số lượng đã liên kết Zalo
   */
  static async getLinkedStatus(req, res) {
    try {
      const [svTotal] = await db.query('SELECT COUNT(*) AS cnt FROM sinh_vien');
      const [svLinked] = await db.query('SELECT COUNT(*) AS cnt FROM sinh_vien WHERE zalo_user_id IS NOT NULL');
      const [gvTotal] = await db.query('SELECT COUNT(*) AS cnt FROM giang_vien');
      const [gvLinked] = await db.query('SELECT COUNT(*) AS cnt FROM giang_vien WHERE zalo_user_id IS NOT NULL');

      return res.json({
        success: true,
        data: {
          sinh_vien: { total: svTotal.cnt, linked: svLinked.cnt },
          giang_vien: { total: gvTotal.cnt, linked: gvLinked.cnt },
          oa_configured: !!(process.env.ZALO_OA_ACCESS_TOKEN && process.env.ZALO_OA_ACCESS_TOKEN !== 'your_zalo_oa_access_token_here')
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * GET /api/zalo/students - Danh sách sinh viên kèm trạng thái Zalo (admin/GV)
   */
  static async getStudentZaloList(req, res) {
    try {
      const { role } = req.user;
      // giang_vien_huong_dan stores the lecturer's ho_ten (name), not their DB id
      let query = 'SELECT id, ma_sinh_vien, ho_ten, lop, khoa, so_dien_thoai, zalo_user_id FROM sinh_vien ORDER BY ho_ten';
      const params = [];

      if (role === 'giang-vien') {
        const gvRows = await db.query(
          'SELECT id, ho_ten FROM giang_vien WHERE account_id = ? LIMIT 1',
          [req.user.id]
        );
        if (gvRows.length > 0) {
          // Match by lecturer name (giang_vien_huong_dan stores ho_ten)
          query = `SELECT id, ma_sinh_vien, ho_ten, lop, khoa, so_dien_thoai, zalo_user_id
                   FROM sinh_vien WHERE giang_vien_huong_dan = ? ORDER BY ho_ten`;
          params.push(gvRows[0].ho_ten);
        }
      }

      const rows = await db.query(query, params);
      return res.json({
        success: true,
        data: rows.map(r => ({
          id: r.id,
          ma_sinh_vien: r.ma_sinh_vien,
          ho_ten: r.ho_ten,
          lop: r.lop,
          khoa: r.khoa,
          so_dien_thoai: r.so_dien_thoai,
          zalo_linked: !!r.zalo_user_id
        }))
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // ZALO LOCAL SERVICE — proxy đến Flask service (ZALO/ZALO/app.py)
  // Dùng zlapi (personal account) để gửi vào nhóm Zalo
  // ════════════════════════════════════════════════════════════════

  static _localUrl() {
    return (process.env.ZALO_LOCAL_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');
  }

  /**
   * GET /api/zalo/local/status
   * Kiểm tra Flask service có đang chạy không.
   * Service "online" ngay cả khi Zalo session hết hạn (401).
   */
  static async getLocalStatus(req, res) {
    try {
      // validateStatus: () => true → không throw dù status code nào
      const response = await axios.get(
        `${ZaloController._localUrl()}/api/health`,
        { timeout: 3000, validateStatus: () => true }
      );
      const data = response.data || {};
      const sessionError = data.error?.code === 'ZALO_LOGIN_ERROR';
      return res.json({
        success: true,
        data: {
          online: true,
          zalo_logged_in: data.zalo_logged_in ?? (!sessionError),
          zalo_session_verified: data.zalo_session_verified ?? (!sessionError),
          session_error: sessionError ? data.error?.message : null,
        }
      });
    } catch (err) {
      const offline = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(err.code);
      return res.json({ success: true, data: { online: !offline } });
    }
  }

  /**
   * GET /api/zalo/local/groups
   * Lấy danh sách nhóm Zalo từ Flask service.
   */
  static async getLocalGroups(req, res) {
    const flaskUrl = `${ZaloController._localUrl()}/api/groups`;
    try {
      const refresh = req.query.refresh === '1' ? '?refresh=1' : '';
      const response = await axios.get(
        `${flaskUrl}${refresh}`,
        { timeout: 15000, validateStatus: () => true }
      );

      console.log(`[ZaloGroups] Flask ${flaskUrl} → HTTP ${response.status}`);

      if (response.status === 200 && response.data?.ok) {
        const groups = response.data?.groups || [];
        return res.json({ success: true, data: groups });
      }

      // Flask trả lỗi rõ (ví dụ session hết hạn)
      const flaskMsg = response.data?.error?.message || response.data?.message || `Flask HTTP ${response.status}`;
      console.error(`[ZaloGroups] Flask error: ${flaskMsg}`);
      return res.status(502).json({
        success: false,
        message: `Flask service chạy nhưng không lấy được nhóm: ${flaskMsg}`,
      });
    } catch (err) {
      const offline = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(err.code);
      console.error(`[ZaloGroups] ${offline ? 'OFFLINE' : 'ERROR'}: ${err.message}`);
      return res.status(offline ? 503 : 500).json({
        success: false,
        message: offline
          ? 'Zalo local service chưa khởi động. Hãy chạy: cd ZALO/ZALO && python app.py'
          : `Lỗi kết nối Flask service: ${err.message}`,
      });
    }
  }

  /**
   * POST /api/zalo/local/send
   * Gửi tin nhắn vào nhóm Zalo qua Flask service.
   * Body: { group_id, message, mark_message? }
   */
  static async sendLocalMessage(req, res) {
    try {
      const { group_id, message, mark_message } = req.body || {};
      if (!group_id) return res.status(400).json({ success: false, message: 'group_id là bắt buộc' });
      if (!message?.trim()) return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được trống' });

      const response = await axios.post(
        `${ZaloController._localUrl()}/api/messages`,
        { group_id, message: message.trim(), ttl: 0, mark_message: mark_message ?? null },
        { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
      );

      if (response.data?.ok) {
        return res.json({ success: true, message: 'Đã gửi tin nhắn vào nhóm Zalo thành công', data: response.data });
      }
      return res.status(400).json({
        success: false,
        message: response.data?.error?.message || 'Flask service trả về lỗi',
      });
    } catch (err) {
      const offline = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(err.code);
      return res.status(offline ? 503 : 500).json({
        success: false,
        message: offline
          ? 'Zalo local service chưa khởi động. Hãy chạy: cd ZALO/ZALO && python app.py'
          : `Lỗi khi gửi tin nhắn: ${err.message}`,
      });
    }
  }

  /**
   * POST /api/zalo/local/send-individual
   * Gửi tin nhắn đến 1 số điện thoại qua Flask service.
   * Body: { phone, message }
   */
  static async sendLocalIndividual(req, res) {
    try {
      const { phone, message } = req.body || {};
      if (!phone?.trim()) return res.status(400).json({ success: false, message: 'phone là bắt buộc' });
      if (!message?.trim()) return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được trống' });

      const response = await axios.post(
        `${ZaloController._localUrl()}/api/send-individual`,
        { phone: phone.trim(), message: message.trim() },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true }
      );

      const data = response.data || {};
      if (data.ok) {
        return res.json({ success: true, message: 'Đã gửi tin nhắn Zalo thành công', data });
      }
      return res.status(422).json({
        success: false,
        message: data.error?.message || data.message || 'Gửi thất bại',
      });
    } catch (err) {
      const offline = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(err.code);
      return res.status(offline ? 503 : 500).json({
        success: false,
        message: offline
          ? 'Zalo local service chưa khởi động. Hãy chạy: cd ZALO/ZALO && python app.py'
          : `Lỗi khi gửi tin nhắn: ${err.message}`,
      });
    }
  }

  /**
   * POST /api/zalo/local/send-bulk
   * Gửi tin nhắn đến nhiều số điện thoại qua Flask service.
   * Body: { message, recipients: [{ name, phone, ma_sinh_vien }] }
   */
  static async sendLocalBulk(req, res) {
    try {
      const { message, recipients } = req.body || {};
      if (!message?.trim()) return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được trống' });
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ success: false, message: 'Danh sách người nhận không được trống' });
      }
      if (recipients.length > 200) {
        return res.status(400).json({ success: false, message: 'Tối đa 200 người nhận mỗi lần gửi' });
      }

      const response = await axios.post(
        `${ZaloController._localUrl()}/api/send-bulk-individual`,
        { message: message.trim(), recipients },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000, validateStatus: () => true }
      );

      const data = response.data || {};
      if (data.ok) {
        return res.json({ success: true, data });
      }
      return res.status(400).json({
        success: false,
        message: data.error?.message || 'Flask service trả về lỗi',
      });
    } catch (err) {
      const offline = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(err.code);
      return res.status(offline ? 503 : 500).json({
        success: false,
        message: offline
          ? 'Zalo local service chưa khởi động. Hãy chạy: cd ZALO/ZALO && python app.py'
          : `Lỗi khi gửi tin nhắn: ${err.message}`,
      });
    }
  }

  /**
   * POST /api/zalo/send-to-students
   * Gửi Zalo riêng từng sinh viên qua SĐT.
   * Body: { studentIds: [1,2,3], title: "...", message: "..." }
   */
  static async sendToStudents(req, res) {
    const { studentIds, title = '', message } = req.body || {};

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds là bắt buộc và không được rỗng' });
    }
    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được trống' });
    }
    if (studentIds.length > 200) {
      return res.status(400).json({ success: false, message: 'Tối đa 200 sinh viên mỗi lần gửi' });
    }

    const flaskBase = ZaloController._localUrl();

    // Tên người gửi: lấy từ JWT (hoTen) hoặc tra DB theo role
    const senderName = String(req.user?.hoTen || req.user?.ho_ten || '').trim();
    const senderRole = String(req.user?.role || '').toLowerCase();
    const senderLabel = senderRole.includes('admin')
      ? 'Ban Quản lý Khoa CNTT'
      : senderName ? `GV. ${senderName}` : 'Giảng viên hướng dẫn';

    try {
      // Lấy thông tin sinh viên từ DB
      const placeholders = studentIds.map(() => '?').join(',');
      const students = await db.query(
        `SELECT id, ho_ten, ma_sinh_vien, so_dien_thoai, zalo_user_id FROM sinh_vien WHERE id IN (${placeholders})`,
        studentIds
      );

      const results = [];
      const titleText = title.trim();
      const bodyText  = message.trim();

      for (const sv of students) {
        const phone = (sv.so_dien_thoai || '').trim();

        if (!phone) {
          console.warn(`[Zalo] SKIP SV="${sv.ho_ten}" (${sv.ma_sinh_vien}): không có SĐT`);
          results.push({
            id: sv.id, name: sv.ho_ten, ma_sinh_vien: sv.ma_sinh_vien, phone: '',
            success: false, reason: 'Sinh viên chưa có số điện thoại',
          });
          continue;
        }

        // Xây dựng tin nhắn cá nhân hoá
        const studentGreeting = sv.ho_ten ? `Kính gửi sinh viên ${sv.ho_ten},\n\n` : '';
        const signature       = `\n\nTrân trọng,\n${senderLabel}\nKhoa CNTT - ĐH Đại Nam`;
        const fullMessage     = titleText
          ? `📢 ${titleText}\n\n${studentGreeting}${bodyText}${signature}`
          : `${studentGreeting}${bodyText}${signature}`;

        const flaskEndpoint = `${flaskBase}/send-message`;
        const body = { phone, message: fullMessage };

        console.log(`[Zalo] SEND → SV="${sv.ho_ten}" (${sv.ma_sinh_vien}) SĐT=${phone}`);
        console.log(`[Zalo] API=${flaskEndpoint}`);
        console.log(`[Zalo] Nội dung:\n${fullMessage}`);

        try {
          const resp = await axios.post(flaskEndpoint, body, { timeout: 30000, validateStatus: () => true });

          console.log(`[Zalo] Response HTTP=${resp.status}:`, JSON.stringify(resp.data));

          const ok     = resp.data?.success === true;
          const reason = resp.data?.message || (ok ? 'Đã gửi thành công' : 'Zalo không gửi được');

          if (!ok) {
            console.error(`[Zalo] FAIL SV=${sv.ma_sinh_vien} SĐT=${phone}: ${reason}`);
          }

          results.push({
            id: sv.id, name: sv.ho_ten, ma_sinh_vien: sv.ma_sinh_vien, phone,
            success: ok, reason,
          });

          if (ok) {
            const notifTitle = titleText || 'Thông báo Zalo';
            try {
              await db.query(
                `INSERT INTO notifications (account_id, receiver_id, student_id, title, message, type, action_type, is_read, created_at)
                 VALUES (?, ?, ?, ?, ?, 'info', 'zalo_send', 0, NOW())`,
                [req.user.id, sv.id, sv.id, notifTitle, bodyText]
              );
            } catch (dbErr) {
              console.warn(`[Zalo] Không lưu notification SV ${sv.ma_sinh_vien}:`, dbErr.message);
            }
          }
        } catch (sendErr) {
          const errMsg = sendErr.code === 'ECONNREFUSED'
            ? 'Zalo Local Service chưa khởi động. Hãy chạy: cd ZALO/ZALO && python app.py'
            : `Lỗi kết nối Flask: ${sendErr.message}`;
          console.error(`[Zalo] ERROR SV=${sv.ma_sinh_vien} SĐT=${phone}:`, sendErr.message);
          results.push({
            id: sv.id, name: sv.ho_ten, ma_sinh_vien: sv.ma_sinh_vien, phone,
            success: false, reason: errMsg,
          });
        }

        if (students.indexOf(sv) < students.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }

      const sent   = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`[sendToStudents] Done: ${sent} thành công, ${failed} thất bại / ${results.length} tổng`);

      return res.json({ success: true, data: { sent, failed, total: results.length, results } });
    } catch (err) {
      console.error('[sendToStudents] Error:', err.message);
      return res.status(500).json({ success: false, message: `Lỗi server: ${err.message}` });
    }
  }

  /**
   * POST /api/zalo/trigger-reminders
   * Admin kích hoạt gửi nhắc hạn ngay lập tức — không cần chờ scheduled_at.
   * 1. Quét đợt nộp sắp hết hạn (23–25h) và queue tin mới nếu chưa có.
   * 2. Reset scheduled_at = NOW() cho tất cả tin deadline_24h_reminder đang pending.
   */
  static async triggerReminders(req, res) {
    try {
      const isAdmin = req.user?.role === 'admin';

      // Xác định giới hạn student_id nếu là GV (chỉ reset tin của SV mình)
      let studentIdFilter = '';
      const filterParams = [];
      if (!isAdmin) {
        const gvRows = await db.query(
          `SELECT sv.id FROM sinh_vien sv
           INNER JOIN giang_vien gv ON LOWER(TRIM(gv.ho_ten)) = LOWER(TRIM(sv.giang_vien_huong_dan))
           WHERE gv.account_id = ?`,
          [req.user.id]
        );
        if (!gvRows.length) {
          return res.json({ success: true, message: 'Không có sinh viên nào thuộc giảng viên này.', data: { reset_failed: 0, reset_pending_scheduled: 0 } });
        }
        const ids = gvRows.map(r => r.id);
        studentIdFilter = `AND student_id IN (${ids.map(() => '?').join(',')})`;
        filterParams.push(...ids);
      }

      if (isAdmin) {
        const { remindStudentsBeforeDeadline } = require('../services/deadlineReminder');
        await remindStudentsBeforeDeadline();
      }

      const resetFailed = await db.query(
        `UPDATE zalo_message_queue
         SET status = 'pending', retry_count = 0, failed_reason = NULL,
             scheduled_at = NOW(), updated_at = NOW()
         WHERE status IN ('failed', 'cancelled') ${studentIdFilter}`,
        filterParams
      );

      const resetPending = await db.query(
        `UPDATE zalo_message_queue
         SET scheduled_at = NOW(), updated_at = NOW()
         WHERE status = 'pending' AND scheduled_at > NOW() ${studentIdFilter}`,
        filterParams
      );

      return res.json({
        success: true,
        message: `Đã reset ${resetFailed.affectedRows} tin lỗi và ${resetPending.affectedRows} tin đang chờ → gửi ngay trong 30 giây.`,
        data: { reset_failed: resetFailed.affectedRows, reset_pending_scheduled: resetPending.affectedRows },
      });
    } catch (err) {
      console.error('[triggerReminders] Error:', err.message);
      return res.status(500).json({ success: false, message: `Lỗi server: ${err.message}` });
    }
  }

  /**
   * GET /api/zalo/lecturers - Danh sách giảng viên kèm SĐT (chỉ admin)
   */
  static async getLecturerZaloList(req, res) {
    try {
      const rows = await db.query(
        `SELECT id, ma_giang_vien, ho_ten, khoa, bo_mon, so_dien_thoai, zalo_user_id
         FROM giang_vien ORDER BY ho_ten`
      );
      return res.json({
        success: true,
        data: rows.map(r => ({
          id: r.id,
          ma_giang_vien: r.ma_giang_vien,
          ho_ten: r.ho_ten,
          khoa: r.khoa,
          bo_mon: r.bo_mon,
          so_dien_thoai: r.so_dien_thoai,
          zalo_linked: !!r.zalo_user_id,
        }))
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * POST /api/zalo/send-to-lecturers
   * Admin gửi Zalo riêng từng giảng viên qua SĐT.
   * Body: { lecturerIds: [1,2,3], title: "...", message: "..." }
   */
  static async sendToLecturers(req, res) {
    const { lecturerIds, title = '', message } = req.body || {};

    if (!Array.isArray(lecturerIds) || lecturerIds.length === 0)
      return res.status(400).json({ success: false, message: 'lecturerIds là bắt buộc và không được rỗng' });
    if (!message?.trim())
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được trống' });
    if (lecturerIds.length > 200)
      return res.status(400).json({ success: false, message: 'Tối đa 200 giảng viên mỗi lần gửi' });

    const flaskBase = ZaloController._localUrl();
    const senderLabel = 'Ban Quản lý Khoa CNTT';

    try {
      const placeholders = lecturerIds.map(() => '?').join(',');
      const lecturers = await db.query(
        `SELECT id, ho_ten, ma_giang_vien, so_dien_thoai FROM giang_vien WHERE id IN (${placeholders})`,
        lecturerIds
      );

      const results = [];
      const titleText = title.trim();
      const bodyText  = message.trim();

      for (const gv of lecturers) {
        const phone = (gv.so_dien_thoai || '').trim();

        if (!phone) {
          results.push({
            id: gv.id, name: gv.ho_ten, ma_giang_vien: gv.ma_giang_vien, phone: '',
            success: false, reason: 'Giảng viên chưa có số điện thoại',
          });
          continue;
        }

        const greeting  = gv.ho_ten ? `Kính gửi ${gv.ho_ten},\n\n` : '';
        const signature = `\n\nTrân trọng,\n${senderLabel}\nKhoa CNTT - ĐH Đại Nam`;
        const fullMessage = titleText
          ? `📢 ${titleText}\n\n${greeting}${bodyText}${signature}`
          : `${greeting}${bodyText}${signature}`;

        try {
          const resp = await axios.post(
            `${flaskBase}/send-message`,
            { phone, message: fullMessage },
            { timeout: 30000, validateStatus: () => true }
          );

          const ok     = resp.data?.success === true;
          const reason = resp.data?.message || (ok ? 'Đã gửi thành công' : 'Zalo không gửi được');

          results.push({
            id: gv.id, name: gv.ho_ten, ma_giang_vien: gv.ma_giang_vien, phone,
            success: ok, reason,
          });
        } catch (sendErr) {
          const errMsg = sendErr.code === 'ECONNREFUSED'
            ? 'Zalo Local Service chưa khởi động'
            : `Lỗi kết nối Flask: ${sendErr.message}`;
          results.push({
            id: gv.id, name: gv.ho_ten, ma_giang_vien: gv.ma_giang_vien, phone,
            success: false, reason: errMsg,
          });
        }

        if (lecturers.indexOf(gv) < lecturers.length - 1)
          await new Promise(resolve => setTimeout(resolve, 1200));
      }

      const sent   = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      return res.json({ success: true, data: { sent, failed, total: results.length, results } });
    } catch (err) {
      console.error('[sendToLecturers] Error:', err.message);
      return res.status(500).json({ success: false, message: `Lỗi server: ${err.message}` });
    }
  }

  /**
   * POST /api/zalo/send-to-my-students
   * Giảng viên gửi Zalo thủ công cho sinh viên CỦA MÌNH.
   * lecturer_id lấy từ JWT — không nhận từ frontend.
   * studentIds nào không thuộc giảng viên này sẽ bị loại bỏ.
   * Tin nhắn đi vào queue, không gửi trực tiếp.
   * Body: { studentIds: [1,2,3], title: "...", message: "..." }
   */
  static async sendToMyStudents(req, res) {
    const { studentIds, title = '', message } = req.body || {};
    if (!Array.isArray(studentIds) || studentIds.length === 0)
      return res.status(400).json({ success: false, message: 'studentIds là bắt buộc' });
    if (!message?.trim())
      return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được trống' });
    if (studentIds.length > 50)
      return res.status(400).json({ success: false, message: 'Tối đa 50 sinh viên mỗi lần gửi thủ công' });

    try {
      // Xác định giảng viên từ JWT
      const gvRows = await db.query(
        'SELECT id, ma_giang_vien, ho_ten FROM giang_vien WHERE account_id = ? LIMIT 1',
        [req.user.id]
      );
      if (!gvRows.length)
        return res.status(403).json({ success: false, message: 'Không tìm thấy thông tin giảng viên' });

      const { id: lecturerId, ma_giang_vien, ho_ten: gvHoTen } = gvRows[0];

      // Chỉ lấy SV thuộc giảng viên này (giang_vien_huong_dan lưu ho_ten, không phải ma_giang_vien)
      const placeholders = studentIds.map(() => '?').join(',');
      const students = await db.query(
        `SELECT id, ho_ten, ma_sinh_vien, so_dien_thoai
         FROM sinh_vien
         WHERE id IN (${placeholders})
           AND LOWER(TRIM(giang_vien_huong_dan)) = LOWER(TRIM(?))`,
        [...studentIds, gvHoTen]
      );

      const rejected = studentIds.length - students.length;
      if (rejected > 0)
        console.warn(`[sendToMyStudents] GV ${ma_giang_vien}: loại ${rejected} SV không thuộc mình`);

      if (!students.length)
        return res.status(403).json({ success: false, message: 'Không có sinh viên nào thuộc giảng viên này' });

      const flaskBase = ZaloController._localUrl();
      const gvLabel   = `GV. ${gvHoTen}`;
      const titleText = (title || '').trim() || 'Thông báo từ giảng viên';
      const bodyText  = message.trim();
      const results   = [];
      let sent = 0, skipped = 0;

      for (const sv of students) {
        const phone = (sv.so_dien_thoai || '').trim();
        if (!phone) { skipped++; results.push({ id: sv.id, ho_ten: sv.ho_ten, success: false, reason: 'Không có SĐT' }); continue; }

        const greeting    = `Kính gửi sinh viên ${sv.ho_ten},\n\n`;
        const signature   = `\n\nTrân trọng,\n${gvLabel}\nKhoa CNTT - ĐH Đại Nam`;
        const fullMessage = `📢 ${titleText}\n\n${greeting}${bodyText}${signature}`;

        try {
          const resp = await axios.post(
            `${flaskBase}/send-message`,
            { phone, message: fullMessage },
            { timeout: 30000, validateStatus: () => true }
          );
          const ok     = resp.data?.success === true;
          const reason = resp.data?.message || (ok ? 'Đã gửi' : 'Gửi thất bại');
          results.push({ id: sv.id, ho_ten: sv.ho_ten, phone, success: ok, reason });
          if (ok) sent++;
        } catch (e) {
          results.push({ id: sv.id, ho_ten: sv.ho_ten, phone, success: false, reason: e.message });
        }

        if (students.indexOf(sv) < students.length - 1)
          await new Promise(r => setTimeout(r, 1200));
      }

      return res.json({
        success: true,
        message: `Đã gửi ${sent}/${students.length} tin nhắn thành công.`,
        data: { sent, skipped_no_phone: skipped, rejected_not_mine: rejected, results },
      });
    } catch (err) {
      console.error('[sendToMyStudents] Error:', err.message);
      return res.status(500).json({ success: false, message: `Lỗi server: ${err.message}` });
    }
  }
}

module.exports = ZaloController;
