const AdminReports = require('../models/AdminReports');

class AdminReportsController {
  // Get reports statistics for admin dashboard
  static async getReportsStats(req, res) {
    try {
      const stats = await AdminReports.getReportsStats();
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting reports stats:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thống kê báo cáo',
        error: error.message
      });
    }
  }

  // Get all submitted reports with pagination and filtering
  static async getSubmittedReports(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      const filters = {
        submitterType: req.query.submitterType,
        status: req.query.status,
        search: req.query.search
      };

      // Remove empty filters
      Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
      });

      const result = await AdminReports.getSubmittedReports(page, limit, filters);
      
      res.json({
        success: true,
        data: result.reports,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error getting submitted reports:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách báo cáo',
        error: error.message
      });
    }
  }

  // Get detailed report by ID
  static async getReportById(req, res) {
    try {
      const { id } = req.params;
      const report = await AdminReports.getReportById(id);

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      console.error('Error getting report by ID:', error);
      if (error.message === 'Report not found') {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy báo cáo'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy thông tin báo cáo',
        error: error.message
      });
    }
  }

  // Approve a report
  static async approveReport(req, res) {
    try {
      const { id } = req.params;
      const approvedBy = req.user?.ma_tai_khoan || 'admin';

      const result = await AdminReports.approveReport(id, approvedBy);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Error approving report:', error);
      if (error.message === 'Report not found') {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy báo cáo'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Lỗi khi duyệt báo cáo',
        error: error.message
      });
    }
  }

  // Reject a report
  static async rejectReport(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const rejectedBy = req.user?.ma_tai_khoan || 'admin';

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng nhập lý do từ chối'
        });
      }

      const result = await AdminReports.rejectReport(id, rejectedBy, reason);

      res.json({
        success: true,
        message: result.message
      });
    } catch (error) {
      console.error('Error rejecting report:', error);
      if (error.message === 'Report not found') {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy báo cáo'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Lỗi khi từ chối báo cáo',
        error: error.message
      });
    }
  }

  // Get teachers who haven't submitted reports
  static async getTeachersWithoutReports(req, res) {
    try {
      const { dotThucTapId } = req.params;
      
      if (!dotThucTapId) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn đợt thực tập'
        });
      }

      const teachers = await AdminReports.getTeachersWithoutReports(dotThucTapId);

      res.json({
        success: true,
        data: teachers
      });
    } catch (error) {
      console.error('Error getting teachers without reports:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách giảng viên chưa nộp báo cáo',
        error: error.message
      });
    }
  }

  // Get companies who haven't submitted reports
  static async getCompaniesWithoutReports(req, res) {
    try {
      const { dotThucTapId } = req.params;
      
      if (!dotThucTapId) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn đợt thực tập'
        });
      }

      const companies = await AdminReports.getCompaniesWithoutReports(dotThucTapId);

      res.json({
        success: true,
        data: companies
      });
    } catch (error) {
      console.error('Error getting companies without reports:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi lấy danh sách doanh nghiệp chưa nộp báo cáo',
        error: error.message
      });
    }
  }

  // Legacy submitted-report export retained for older maintenance paths.
  static async _legacyExportReports(req, res) {
    try {
      const filters = {
        submitterType: req.query.submitterType,
        status: req.query.status,
        search: req.query.search
      };

      // Remove empty filters
      Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
      });

      // Get all reports without pagination for export
      const result = await AdminReports.getSubmittedReports(1, 10000, filters);
      const reports = result.reports;

      // Create Excel workbook
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo cáo thực tập');

      // Add headers
      worksheet.columns = [
        { header: 'STT', key: 'stt', width: 10 },
        { header: 'Tiêu đề', key: 'title', width: 40 },
        { header: 'Loại người nộp', key: 'submitterType', width: 20 },
        { header: 'Mã số', key: 'submitterCode', width: 15 },
        { header: 'Tên người nộp', key: 'submitterName', width: 30 },
        { header: 'Ngày nộp', key: 'submittedDate', width: 15 },
        { header: 'Trạng thái', key: 'status', width: 15 },
        { header: 'Số sinh viên', key: 'studentCount', width: 15 },
        { header: 'Kỳ thực tập', key: 'internshipPeriod', width: 20 }
      ];

      // Add data
      reports.forEach((report, index) => {
        worksheet.addRow({
          stt: index + 1,
          title: report.title,
          submitterType: report.submitterType === 'giang_vien' ? 'Giảng viên' : 'Doanh nghiệp',
          submitterCode: report.submitterCode,
          submitterName: report.submitterName,
          submittedDate: report.submittedDate ? new Date(report.submittedDate).toLocaleDateString('vi-VN') : '',
          status: getStatusText(report.status),
          studentCount: report.studentCount || '',
          internshipPeriod: report.internshipPeriod || ''
        });
      });

      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };

      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=bao-cao-thuc-tap-${new Date().toISOString().split('T')[0]}.xlsx`
      );

      // Send file
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error exporting reports:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xuất báo cáo',
        error: error.message
      });
    }
  }
  static async exportReports(req, res) {
    try {
      const filters = {
        status: req.query.status,
        search: req.query.search
      };

      Object.keys(filters).forEach(key => {
        if (!filters[key]) delete filters[key];
      });

      const result = await AdminReports.getSubmittedReports(1, 10000, {
        ...filters,
        allowLargeLimit: true
      });
      const reports = result.reports;

      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Bao cao thuc tap');

      worksheet.columns = [
        { header: 'STT', key: 'stt', width: 8 },
        { header: 'Ma sinh vien', key: 'studentId', width: 18 },
        { header: 'Ho ten sinh vien', key: 'name', width: 30 },
        { header: 'Doanh nghiep thuc tap', key: 'company', width: 32 },
        { header: 'Giang vien huong dan', key: 'supervisor', width: 28 },
        { header: 'Trang thai', key: 'status', width: 18 },
        { header: 'So bao cao da nop', key: 'reportCount', width: 18 },
        { header: 'Ngay nop gan nhat', key: 'lastReportDate', width: 22 }
      ];

      reports.forEach((report, index) => {
        worksheet.addRow({
          stt: index + 1,
          studentId: report.studentId,
          name: report.name,
          company: report.company,
          supervisor: report.supervisor,
          status: AdminReports.getInternshipStatusText(report.status),
          reportCount: Number(report.reportCount) || 0,
          lastReportDate: report.lastReportDate
            ? new Date(report.lastReportDate).toLocaleString('vi-VN')
            : ''
        });
      });

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' }
      };

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=bao-cao-thuc-tap-${new Date().toISOString().split('T')[0]}.xlsx`
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error exporting reports:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xuất báo cáo',
        error: error.message
      });
    }
  }
}

// Helper function to convert status to Vietnamese
function getStatusText(status) {
  switch (status) {
    case 'da_duyet': return 'Đã duyệt';
    case 'da_nop': return 'Đã nộp';
    case 'tu_choi': return 'Từ chối';
    case 'chua_nop': return 'Chưa nộp';
    default: return status;
  }
}

// ====== PERIODIC UPDATES ======
AdminReportsController.getPeriodicUpdates = async (req, res) => {
  try {
    const data = await AdminReports.getPeriodicUpdates();
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting periodic updates:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy dữ liệu cập nhật định kỳ',
      error: error.message
    });
  }
};

AdminReportsController.getPeriodicUpdateDetails = async (req, res) => {
  try {
    const type = req.query.type || 'overall';
    const period = req.query.period || 'daily';
    const limit = req.query.limit || 50;
    const items = await AdminReports.getPeriodicUpdateDetails(type, period, limit);
    res.json({ success: true, data: items, meta: { type, period, count: items.length } });
  } catch (error) {
    console.error('Error getting periodic update details:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi khi lấy chi tiết cập nhật định kỳ',
      error: error.message
    });
  }
};

module.exports = AdminReportsController;
