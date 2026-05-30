const ReportBatchModel = require('../models/ReportBatch');
const ExcelJS = require('exceljs');
const db = require('../database/connection');
const { enqueueBatch } = require('../services/zaloQueue');

class ReportBatchController {
  // GET /api/report-batches - Lấy danh sách đợt báo cáo
  static async getReportBatches(req, res) {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10,
        trang_thai: req.query.trang_thai,
        loai_bao_cao: req.query.loai_bao_cao,
        dot_thuc_tap_id: req.query.dot_thuc_tap_id
      };

      const result = await ReportBatchModel.getReportBatches(filters);

      res.json({
        success: true,
        message: 'Lấy danh sách đợt báo cáo thành công',
        data: result.batches,
        pagination: result.pagination
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // GET /api/report-batches/:id - Lấy chi tiết đợt báo cáo
  static async getReportBatchById(req, res) {
    try {
      const { id } = req.params;
      const batch = await ReportBatchModel.getReportBatchById(id);

      res.json({
        success: true,
        message: 'Lấy chi tiết đợt báo cáo thành công',
        data: batch
      });
    } catch (error) {
      const statusCode = error.message.includes('Không tìm thấy') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // POST /api/report-batches - Tạo đợt báo cáo mới
  static async createReportBatch(req, res) {
    try {
      const batchData = req.body;

      // Validate dữ liệu bắt buộc
      const requiredFields = ['ten_dot', 'dot_thuc_tap_id', 'loai_bao_cao', 'han_nop'];
      const missingFields = requiredFields.filter(field => !batchData[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Thiếu thông tin bắt buộc: ${missingFields.join(', ')}`,
          data: null
        });
      }

      // Validate loại báo cáo
      const validTypes = ['weekly', 'final'];
      if (!validTypes.includes(batchData.loai_bao_cao)) {
        return res.status(400).json({
          success: false,
          message: 'Loại báo cáo không hợp lệ',
          data: null
        });
      }

      // Validate trạng thái
      const validStatuses = ['chua-mo', 'dang-mo', 'da-dong'];
      if (batchData.trang_thai && !validStatuses.includes(batchData.trang_thai)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái không hợp lệ',
          data: null
        });
      }

      // Validate hạn nộp (phải trong tương lai)
      const deadline = new Date(batchData.han_nop);
      if (deadline <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Hạn nộp phải trong tương lai',
          data: null
        });
      }

      const newBatch = await ReportBatchModel.createReportBatch(batchData);

      res.status(201).json({
        success: true,
        message: 'Tạo đợt báo cáo thành công',
        data: newBatch
      });

      // Gửi thông báo Zalo cho sinh viên trong background (không block response)
      _notifyStudentsNewBatch(newBatch, batchData).catch(err =>
        console.error('[ReportBatch] Zalo notify error:', err.message)
      );
    } catch (error) {
      const statusCode = error.message.includes('đã tồn tại') ? 409 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // PUT /api/report-batches/:id - Cập nhật đợt báo cáo
  static async updateReportBatch(req, res) {
    try {
      const { id } = req.params;
      const batchData = req.body;

      // Validate trạng thái nếu có
      const validStatuses = ['chua-mo', 'dang-mo', 'da-dong'];
      if (batchData.trang_thai && !validStatuses.includes(batchData.trang_thai)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái không hợp lệ',
          data: null
        });
      }

      // Validate hạn nộp nếu có
      if (batchData.han_nop) {
        const deadline = new Date(batchData.han_nop);
        if (deadline <= new Date()) {
          return res.status(400).json({
            success: false,
            message: 'Hạn nộp phải trong tương lai',
            data: null
          });
        }
      }

      const updatedBatch = await ReportBatchModel.updateReportBatch(id, batchData);

      res.json({
        success: true,
        message: 'Cập nhật đợt báo cáo thành công',
        data: updatedBatch
      });
    } catch (error) {
      const statusCode = error.message.includes('Không tìm thấy') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // DELETE /api/report-batches/:id - Xóa đợt báo cáo
  static async deleteReportBatch(req, res) {
    try {
      const { id } = req.params;
      const result = await ReportBatchModel.deleteReportBatch(id);

      res.json({
        success: true,
        message: result.message,
        data: null
      });
    } catch (error) {
      const statusCode = error.message.includes('Không tìm thấy') ? 404 : 
                        error.message.includes('Chỉ có thể xóa') ? 400 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // GET /api/report-batches/stats - Lấy thống kê đợt báo cáo
  static async getReportBatchStats(req, res) {
    try {
      const stats = await ReportBatchModel.getReportBatchStats();

      res.json({
        success: true,
        message: 'Lấy thống kê đợt báo cáo thành công',
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // GET /api/report-batches/:id/export - Xuất báo cáo Excel cho một đợt
  static async exportReportBatch(req, res) {
    try {
      const { id } = req.params;
      const { batch, reports } = await ReportBatchModel.exportReportBatch(id);

      // Tạo workbook Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo cáo');

      // Thêm header thông tin đợt
      worksheet.addRow([`Đợt báo cáo: ${batch.ten_dot}`]);
      worksheet.addRow([`Loại báo cáo: ${batch.loai_bao_cao === 'weekly' ? 'Báo cáo hàng tuần' : 'Báo cáo cuối kỳ'}`]);
      worksheet.addRow([`Hạn nộp: ${new Date(batch.han_nop).toLocaleDateString('vi-VN')}`]);
      worksheet.addRow([`Trạng thái: ${batch.trang_thai}`]);
      worksheet.addRow([]);

      // Định nghĩa cột cho báo cáo tuần hoặc cuối kỳ
      if (batch.loai_bao_cao === 'weekly') {
        worksheet.columns = [
          { header: 'Mã sinh viên', key: 'ma_sinh_vien', width: 15 },
          { header: 'Họ tên sinh viên', key: 'ho_ten_sinh_vien', width: 25 },
          { header: 'Tuần', key: 'tuan', width: 8 },
          { header: 'Nội dung', key: 'noi_dung', width: 50 },
          { header: 'Ngày nộp', key: 'ngay_nop', width: 15 },
          { header: 'Trạng thái', key: 'trang_thai', width: 15 },
          { header: 'Điểm', key: 'diem', width: 10 },
          { header: 'Nhận xét GV', key: 'nhan_xet_giang_vien', width: 40 },
          { header: 'Giảng viên', key: 'ho_ten_giang_vien', width: 25 },
          { header: 'Doanh nghiệp', key: 'ten_doanh_nghiep', width: 30 }
        ];
      } else {
        worksheet.columns = [
          { header: 'Mã sinh viên', key: 'ma_sinh_vien', width: 15 },
          { header: 'Họ tên sinh viên', key: 'ho_ten_sinh_vien', width: 25 },
          { header: 'Tiêu đề', key: 'tieu_de', width: 40 },
          { header: 'Tóm tắt', key: 'tom_tat', width: 50 },
          { header: 'Ngày nộp', key: 'ngay_nop', width: 15 },
          { header: 'Trạng thái', key: 'trang_thai', width: 15 },
          { header: 'Điểm GV', key: 'diem_giang_vien', width: 10 },
          { header: 'Điểm DN', key: 'diem_doanh_nghiep', width: 10 },
          { header: 'Nhận xét GV', key: 'nhan_xet_giang_vien', width: 40 },
          { header: 'Nhận xét DN', key: 'nhan_xet_doanh_nghiep', width: 40 },
          { header: 'Giảng viên', key: 'ho_ten_giang_vien', width: 25 },
          { header: 'Doanh nghiệp', key: 'ten_doanh_nghiep', width: 30 }
        ];
      }

      // Thêm dữ liệu
      reports.forEach(report => {
        const row = { ...report };
        if (row.ngay_nop) {
          row.ngay_nop = new Date(row.ngay_nop).toLocaleDateString('vi-VN');
        }
        worksheet.addRow(row);
      });

      // Style header
      const headerRow = worksheet.getRow(6); // Row chứa header cột
      headerRow.font = { bold: true };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6E6FA' }
      };

      // Set response headers
      const filename = `bao-cao-${batch.loai_bao_cao}-${batch.id}-${Date.now()}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }

  // POST /api/report-batches/:id/toggle-status - Chuyển đổi trạng thái đợt báo cáo
  static async toggleBatchStatus(req, res) {
    try {
      const { id } = req.params;
      const { trang_thai } = req.body;

      if (!trang_thai) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin trạng thái',
          data: null
        });
      }

      const validStatuses = ['chua-mo', 'dang-mo', 'da-dong'];
      if (!validStatuses.includes(trang_thai)) {
        return res.status(400).json({
          success: false,
          message: 'Trạng thái không hợp lệ',
          data: null
        });
      }

      const updatedBatch = await ReportBatchModel.updateReportBatch(id, { trang_thai });

      res.json({
        success: true,
        message: 'Cập nhật trạng thái đợt báo cáo thành công',
        data: updatedBatch
      });
    } catch (error) {
      const statusCode = error.message.includes('Không tìm thấy') ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message,
        data: null
      });
    }
  }
}

/**
 * Đưa thông báo Zalo vào hàng đợi cho toàn bộ sinh viên của đợt thực tập
 * khi một đợt nộp báo cáo / nhật ký mới được tạo.
 */
async function _notifyStudentsNewBatch(newBatch, batchData) {
  const dotThucTapId = batchData.dot_thuc_tap_id;
  const loai = batchData.loai_bao_cao; // 'weekly' | 'final'
  const queueType = loai === 'weekly' ? 'new_diary_period' : 'new_report_period';

  const loaiLabel  = loai === 'weekly' ? 'Nhật ký thực tập' : 'Báo cáo thực tập';
  const hanNop     = new Date(batchData.han_nop).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const title   = `📋 Mở đợt nộp ${loaiLabel} mới`;
  const message = `Đợt "${batchData.ten_dot}" vừa được mở.\nHạn nộp: ${hanNop}.\nVui lòng đăng nhập hệ thống để nộp đúng hạn.`;

  // Ưu tiên lấy SV đã phân công trong đợt thực tập
  let students = [];
  try {
    students = await db.query(
      `SELECT sv.id AS student_id, sv.so_dien_thoai AS phone
       FROM sinh_vien sv
       INNER JOIN phan_cong_thuc_tap pc ON pc.sinh_vien_id = sv.id
       WHERE pc.dot_thuc_tap_id = ?`,
      [dotThucTapId]
    );
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }

  // Fallback: lấy từ sinh_vien_thuc_tap nếu bảng phan_cong chưa có
  if (!students.length) {
    try {
      students = await db.query(
        `SELECT sv.id AS student_id, sv.so_dien_thoai AS phone
         FROM sinh_vien sv
         INNER JOIN sinh_vien_thuc_tap svtt ON svtt.ma_sinh_vien = sv.ma_sinh_vien
         WHERE svtt.dot_thuc_tap_id = ?`,
        [dotThucTapId]
      );
    } catch (e) {
      if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
  }

  if (!students.length) {
    console.log(`[ReportBatch] Không có sinh viên nào để thông báo cho đợt thực tập #${dotThucTapId}`);
    return;
  }

  const messages = students.map(sv => ({
    studentId: sv.student_id,
    phone:     sv.phone || null,
    title,
    message,
    type:      queueType,
    relatedId: newBatch.id,
    priority:  3,
  }));

  const count = await enqueueBatch(messages);
  console.log(`[ReportBatch] Đã queue ${count} tin nhắn Zalo (${queueType}) cho đợt báo cáo #${newBatch.id}`);
}

module.exports = ReportBatchController;