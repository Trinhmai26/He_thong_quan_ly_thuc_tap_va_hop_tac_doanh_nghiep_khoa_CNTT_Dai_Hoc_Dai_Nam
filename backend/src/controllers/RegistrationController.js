const RegistrationPeriod = require('../models/RegistrationPeriod');
const connection = require('../database/connection');

class RegistrationController {
  static addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  static async getStatusFromInternshipBatch() {
    const rows = await connection.query(`
      SELECT
        id,
        ten_dot,
        mo_ta,
        trang_thai,
        thoi_gian_dang_ky_tu,
        thoi_gian_dang_ky_den,
        created_at
      FROM dot_thuc_tap
      WHERE thoi_gian_dang_ky_tu IS NOT NULL
        AND thoi_gian_dang_ky_den IS NOT NULL
      ORDER BY thoi_gian_dang_ky_tu ASC
    `);

    if (!rows.length) return null;

    const now = new Date();
    const atStartOfDay = (d) => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date;
    };
    const atEndOfDay = (d) => {
      const date = new Date(d);
      date.setHours(23, 59, 59, 999);
      return date;
    };

    const active = rows
      .filter(r => r.trang_thai !== 'ket-thuc')
      .find(r => {
        const from = atStartOfDay(r.thoi_gian_dang_ky_tu);
        const to = atEndOfDay(r.thoi_gian_dang_ky_den);
        return now >= from && now <= to;
      });

    const periodFromRow = (row) => ({
      title: row.ten_dot,
      start_time: row.thoi_gian_dang_ky_tu,
      end_time: row.thoi_gian_dang_ky_den,
      description: row.mo_ta || null,
      created_at: row.created_at,
      source: 'dot_thuc_tap',
      dot_thuc_tap_id: row.id
    });

    if (active) {
      const end = atEndOfDay(active.thoi_gian_dang_ky_den);
      return {
        status: 'active',
        message: 'Đang trong thời gian đăng ký',
        period: periodFromRow(active),
        timeUntilStart: null,
        timeUntilEnd: end.getTime() - now.getTime(),
        is_open: true
      };
    }

    const upcoming = rows
      .filter(r => r.trang_thai !== 'ket-thuc')
      .find(r => atStartOfDay(r.thoi_gian_dang_ky_tu) > now);

    if (upcoming) {
      const start = atStartOfDay(upcoming.thoi_gian_dang_ky_tu);
      return {
        status: 'before_start',
        message: 'Đăng ký chưa mở',
        period: periodFromRow(upcoming),
        timeUntilStart: start.getTime() - now.getTime(),
        timeUntilEnd: null,
        is_open: false
      };
    }

    const latest = rows[rows.length - 1];
    return {
      status: 'ended',
      message: 'Đã hết thời gian đăng ký',
      period: periodFromRow(latest),
      timeUntilStart: null,
      timeUntilEnd: null,
      is_open: false
    };
  }

  // GET /api/registration/period - Lấy thông tin đợt đăng ký hiện tại
  static async getCurrentPeriod(req, res) {
    try {
      const batchStatus = await RegistrationController.getStatusFromInternshipBatch();
      if (batchStatus?.period) {
        return res.json({
          success: true,
          data: batchStatus,
          message: 'Lấy thông tin đợt đăng ký thành công'
        });
      }

      const status = await RegistrationPeriod.getRegistrationStatus();
      
      res.json({
        success: true,
        data: status,
        message: 'Lấy thông tin đợt đăng ký thành công'
      });
    } catch (error) {
      console.error('Error getting registration period:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        data: null
      });
    }
  }

  // POST /api/registration/period - Tạo đợt đăng ký mới (Admin only)
  static async createPeriod(req, res) {
    try {
      const { title, start_time, end_time, description } = req.body;

      // Validate input
      if (!title || !start_time) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin bắt buộc: title, start_time',
          data: null
        });
      }

      // Validate time logic
      const startDate = new Date(start_time);
      const endDate = end_time
        ? new Date(end_time)
        : RegistrationController.addDays(startDate, 7);

      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Định dạng thời gian không hợp lệ',
          data: null
        });
      }
      
      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          message: 'Thời gian bắt đầu phải trước thời gian kết thúc',
          data: null
        });
      }

      const periodId = await RegistrationPeriod.createOrUpdate({
        title,
        start_time,
        end_time: endDate.toISOString().slice(0, 19).replace('T', ' '),
        description
      });

      res.status(201).json({
        success: true,
        message: end_time
          ? 'Tạo đợt đăng ký thành công'
          : 'Tạo đợt đăng ký thành công (mặc định thời gian 1 tuần)',
        data: {
          id: periodId,
          start_time,
          end_time: endDate.toISOString().slice(0, 19).replace('T', ' ')
        }
      });
    } catch (error) {
      console.error('Error creating registration period:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        data: null
      });
    }
  }

  // GET /api/registration/history - Lấy lịch sử các đợt đăng ký (Admin only)
  static async getHistory(req, res) {
    try {
      const history = await RegistrationPeriod.getHistory();
      
      res.json({
        success: true,
        data: history,
        message: 'Lấy lịch sử đăng ký thành công'
      });
    } catch (error) {
      console.error('Error getting registration history:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        data: null
      });
    }
  }

  // DELETE /api/registration/period/:id - Xóa đợt đăng ký (Admin only)
  static async deletePeriod(req, res) {
    try {
      const { id } = req.params;
      const deleted = await RegistrationPeriod.deletePeriod(id);
      
      if (deleted) {
        res.json({
          success: true,
          message: 'Xóa đợt đăng ký thành công',
          data: null
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy đợt đăng ký',
          data: null
        });
      }
    } catch (error) {
      console.error('Error deleting registration period:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        data: null
      });
    }
  }

  // PUT /api/registration/period/:id/status - Cập nhật trạng thái hoạt động (Admin only)
  static async updateStatus(req, res) {
    try {
      const { id } = req.params;
      const { is_active } = req.body;
      
      const updated = await RegistrationPeriod.updateActiveStatus(id, is_active);
      
      if (updated) {
        res.json({
          success: true,
          message: 'Cập nhật trạng thái thành công',
          data: null
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy đợt đăng ký',
          data: null
        });
      }
    } catch (error) {
      console.error('Error updating registration status:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        data: null
      });
    }
  }

  // PUT /api/registration/period/:id/extend - Gia hạn đợt đăng ký (Admin only)
  static async extendPeriod(req, res) {
    try {
      const { id } = req.params;
      const { new_end_time } = req.body;

      if (!new_end_time) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thời gian kết thúc mới (new_end_time)',
          data: null
        });
      }

      const result = await RegistrationPeriod.extendPeriod(id, new_end_time);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.message,
          data: null
        });
      }

      return res.json({
        success: true,
        message: result.message,
        data: result.data
      });
    } catch (error) {
      console.error('Error extending registration period:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        data: null
      });
    }
  }

  // GET /api/registration/check - Kiểm tra có thể đăng ký không
  static async checkRegistrationStatus(req, res) {
    try {
      const batchStatus = await RegistrationController.getStatusFromInternshipBatch();
      if (batchStatus) {
        return res.json({
          success: true,
          data: batchStatus,
          message: 'Kiểm tra trạng thái đăng ký thành công'
        });
      }

      const isOpen = await RegistrationPeriod.isRegistrationOpen();
      const status = await RegistrationPeriod.getRegistrationStatus();
      
      res.json({
        success: true,
        data: {
          is_open: isOpen,
          ...status
        },
        message: 'Kiểm tra trạng thái đăng ký thành công'
      });
    } catch (error) {
      console.error('Error checking registration status:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi hệ thống',
        data: null
      });
    }
  }
}

module.exports = RegistrationController;