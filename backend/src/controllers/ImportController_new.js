// Controller: Import với cấu trúc bảng mới
// File: src/controllers\ImportController.js

const ExcelImportService = require('../services/ExcelImportService'); // Sử dụng service đã cập nhật
const { deleteFile } = require('../middleware/uploadExcel');
const path = require('path');

class ImportController {
  
  // POST /api/import/sinh-vien - Import danh sách sinh viên từ Excel
  static async importSinhVien(req, res) {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file Excel được upload',
          data: null
        });
      }
      
      filePath = req.file.path;
      
      console.log('📁 Đang xử lý file sinh viên:', req.file.originalname);
      
      // Bước 1: Parse file Excel (hỗ trợ cả format cũ và Google Form)
      const parseResult = await ExcelImportService.parseExcelFile(filePath, 'sinh-vien');
      
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File Excel có lỗi và không có dữ liệu hợp lệ nào',
          data: {
            totalRows: parseResult.totalRows,
            errors: parseResult.errors
          }
        });
      }
      
        // Bước 2: Import vào database với auto-classification
        // Đồng bộ dữ liệu theo file import (cập nhật các trường có giá trị, không chỉ ô trống).
        const importResult = await ExcelImportService.importToDatabase('sinh-vien', parseResult.data, { fillEmptyOnly: false });
      
      // Bước 3: Tổng hợp kết quả
      const finalResult = {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          totalRows: parseResult.totalRows
        },
        parsing: {
          validRows: parseResult.data.length,
          errorRows: parseResult.errors.length,
          errors: parseResult.errors
        },
        import: {
          accountsCreated: importResult.accountsCreated,
          accountsUpdated: importResult.accountsUpdated,
          profilesCreated: importResult.profilesCreated,
          profilesUpdated: importResult.profilesUpdated,
          errors: importResult.errors
        },
        summary: {
          totalProcessed: parseResult.data.length,
          totalSuccess: importResult.accountsCreated + importResult.accountsUpdated,
          totalErrors: parseResult.errors.length + importResult.errors.length
        }
      };
      
      const hasErrors = finalResult.summary.totalErrors > 0;
      
      // Recalculate assignment status after import
      try {
        const SinhVien = require('../models/SinhVien');
        // Dọn trùng lặp trước khi cập nhật trạng thái
        await SinhVien.deduplicateByMaSinhVien();
        await SinhVien.recalcAssignmentStatus();
        console.log('✅ Đã cập nhật trạng thái phân công sau import sinh viên');
      } catch (e) {
        console.warn('⚠️ Không thể cập nhật trạng thái phân công:', e.message);
      }

      // Auto-assign lecturers by quota for students without lecturer after import
      try {
        const { autoAssignLecturersByQuota } = require('../services/AutoAssignService');
        const summary = await autoAssignLecturersByQuota();
        console.log('✅ Auto-assign lecturers after student import:', summary);
      } catch (e) {
        console.warn('⚠️ Không thể tự động phân công giảng viên sau khi import sinh viên:', e.message);
      }
      
      // After import, persist participation counts (derived from sinh_vien columns) into the latest active batch
      try {
        const { updateLatestActiveBatchCounts } = require('../services/BatchCountService');
        await updateLatestActiveBatchCounts();
      } catch (e) {
        console.warn('⚠️ Không thể cập nhật số liệu đợt thực tập sau khi import sinh viên:', e.message);
      }

      res.status(hasErrors ? 206 : 200).json({
        success: true,
        message: hasErrors ? 
          `Import hoàn thành với ${finalResult.summary.totalErrors} lỗi` : 
          'Import sinh viên thành công',
        data: finalResult
      });
      
    } catch (error) {
      console.error('❌ Lỗi import sinh viên:', error);
      
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server khi import sinh viên',
        data: null
      });
    } finally {
      // Cleanup: Xóa file tạm
      if (filePath) {
        try {
          await deleteFile(filePath);
        } catch (cleanupError) {
          console.error('Lỗi xóa file tạm:', cleanupError);
        }
      }
    }
  }

  // POST /api/import/sinh-vien-profile - Import profile sinh viên và đảm bảo có tài khoản đăng nhập
  static async importSinhVienProfile(req, res) {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file Excel được upload',
          data: null
        });
      }
      
      filePath = req.file.path;
      
      console.log('📁 Đang xử lý file sinh viên profile:', req.file.originalname);
      
      // Bước 1: Parse file Excel (không validation nghiêm ngặt)
      const parseResult = await ExcelImportService.parseExcelFile(filePath, 'sinh-vien-profile');
      
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File Excel có lỗi và không có dữ liệu hợp lệ nào',
          data: {
            totalRows: parseResult.totalRows,
            errors: parseResult.errors
          }
        });
      }
      
      // Bước 2: Import profile + tự tạo account sinh viên nếu còn thiếu
      const importResult = await ExcelImportService.importProfileOnly('sinh-vien', parseResult.data, { fillEmptyOnly: true });
      
      // Bước 3: Tổng hợp kết quả
      const finalResult = {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          totalRows: parseResult.totalRows
        },
        parsing: {
          validRows: parseResult.data.length,
          errorRows: parseResult.errors.length,
          errors: parseResult.errors
        },
        import: {
          accountsCreated: importResult.accountsCreated || 0,
          accountsLinked: importResult.accountsLinked || 0,
          profilesCreated: importResult.profilesCreated || 0,
          profilesUpdated: importResult.profilesUpdated,
          profilesSkipped: importResult.profilesSkipped || 0,
          errors: importResult.errors
        },
        summary: {
          totalProcessed: parseResult.data.length,
          totalSuccess: (importResult.profilesCreated || 0) + importResult.profilesUpdated,
          totalErrors: parseResult.errors.length + importResult.errors.length
        }
      };
      
      const hasErrors = finalResult.summary.totalErrors > 0;

      // Recalculate assignment status after profile import
      try {
        const SinhVien = require('../models/SinhVien');
        await SinhVien.deduplicateByMaSinhVien();
        await SinhVien.recalcAssignmentStatus();
        console.log('✅ Đã cập nhật trạng thái phân công sau import profile');
      } catch (e) {
        console.warn('⚠️ Không thể cập nhật trạng thái phân công:', e.message);
      }

      // Auto-assign lecturers by quota for students without lecturer after profile import
      try {
        const { autoAssignLecturersByQuota } = require('../services/AutoAssignService');
        const summary = await autoAssignLecturersByQuota();
        console.log('✅ Auto-assign lecturers after student profile import:', summary);
      } catch (e) {
        console.warn('⚠️ Không thể tự động phân công giảng viên sau khi import profile sinh viên:', e.message);
      }

      // After import, persist participation counts
      try {
        const { updateLatestActiveBatchCounts } = require('../services/BatchCountService');
        await updateLatestActiveBatchCounts();
      } catch (e) {
        console.warn('⚠️ Không thể cập nhật số liệu đợt thực tập sau khi import sinh viên profile:', e.message);
      }

      res.status(hasErrors ? 206 : 200).json({
        success: true,
        message: hasErrors ? 
          `Import hoàn thành với ${finalResult.summary.totalErrors} lỗi` : 
          'Import sinh viên profile thành công',
        data: finalResult
      });
      
    } catch (error) {
      console.error('❌ Lỗi import sinh viên profile:', error);
      
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server khi import sinh viên profile',
        data: null
      });
    } finally {
      // Cleanup: Xóa file tạm
      if (filePath) {
        try {
          await deleteFile(filePath);
        } catch (cleanupError) {
          console.error('Lỗi xóa file tạm:', cleanupError);
        }
      }
    }
  }

  // POST /api/import/phan-cong - Import phân công SV-GV-DN từ Excel
  static async importPhanCong(req, res) {
    let filePath = null;
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Không có file Excel được upload' });
      }
      filePath = req.file.path;

      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const ws = workbook.worksheets[0];
      if (!ws) return res.status(400).json({ success: false, message: 'File Excel rỗng' });

      // Map header -> column index (case-insensitive, trim)
      const headerRow = ws.getRow(1);
      const headerMap = {};
      headerRow.eachCell((cell, col) => {
        const key = String(cell.value || '').toLowerCase().trim();
        if (key) headerMap[key] = col;
      });

      // Expected columns (we accept various Vietnamese labels)
      const col = (names) => names.find(n => headerMap[n]);
      const get = (row, names) => {
        const k = col(names);
        return k ? (row.getCell(headerMap[k]).value || '').toString().trim() : '';
      };

      const rows = [];
      const errors = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        // Skip empty row
        if (row.values.filter(Boolean).length === 0) continue;
        try {
          const maSinhVien = get(row, ['mã sv', 'ma sv', 'ma_sinh_vien', 'mã sinh viên']);
          if (!maSinhVien) throw new Error('Thiếu Mã SV');
          const giangVien = get(row, ['giảng viên hướng dẫn', 'giang vien huong dan', 'gv hướng dẫn', 'giang_vien_huong_dan']);
          const doanhNghiep = get(row, ['doanh nghiệp thực tập', 'doanh nghiep thuc tap', 'đơn vị thực tập', 'don_vi_thuc_tap']);
          const viTri = get(row, ['vị trí mong muốn', 'vi tri mong muon', 'vi_tri_muon_ung_tuyen_thuc_tap']);
          const nguyenVong = get(row, ['nguyện vọng tt', 'nguyen vong tt', 'nguyện vọng thực tập', 'nguyen_vong_thuc_tap']);

          rows.push({ maSinhVien, giangVien, doanhNghiep, viTri, nguyenVong });
        } catch (e) {
          errors.push({ row: r, message: e.message });
        }
      }

      const SinhVien = require('../models/SinhVien');
  let updated = 0;
      let unchanged = 0;
      for (const item of rows) {
        try {
          // Fetch existing to enable idempotent updates (only update when different)
          const existing = await SinhVien.findByMaSinhVien(item.maSinhVien);
          if (!existing) {
            errors.push({ userId: item.maSinhVien, message: 'Không tìm thấy sinh viên với mã này' });
            continue;
          }
          const payload = {};
          if (item.giangVien && item.giangVien !== existing.giang_vien_huong_dan) payload.giangVienHuongDan = item.giangVien;
          if (item.doanhNghiep && item.doanhNghiep !== existing.don_vi_thuc_tap) payload.donViThucTap = item.doanhNghiep;
          if (item.viTri && item.viTri !== existing.vi_tri_muon_ung_tuyen_thuc_tap) payload.viTriMuonUngTuyen = item.viTri;
          if (item.nguyenVong && item.nguyenVong !== existing.nguyen_vong_thuc_tap) payload.nguyenVongThucTap = item.nguyenVong;

          if (Object.keys(payload).length === 0) {
            unchanged++;
            continue;
          }
          const resUpd = await SinhVien.updateByMaSinhVien(item.maSinhVien, payload);
          if (resUpd && resUpd.affectedRows > 0) updated++; else unchanged++;
        } catch (e) {
          errors.push({ userId: item.maSinhVien, message: e.message });
        }
      }

      // Recalculate assignment status
      await SinhVien.recalcAssignmentStatus();

      // Persist counts into dot_thuc_tap for the latest active batch
      try {
        const { updateLatestActiveBatchCounts } = require('../services/BatchCountService');
        await updateLatestActiveBatchCounts();
      } catch (e) {
        console.warn('⚠️ Không thể cập nhật số liệu đợt thực tập:', e.message);
      }

      // Persist counts from imported data only into the newest active batch
      try {
        const [latestActive] = await require('../database/connection').query(
          `SELECT id FROM dot_thuc_tap WHERE trang_thai IN ('sap-mo','dang-dien-ra') ORDER BY thoi_gian_bat_dau DESC LIMIT 1`
        );
        if (latestActive && latestActive.id) {
          // Count distinct normalized values in provided rows only
          const nonEmpty = rows.filter(r => r);
          const setSV = new Set(nonEmpty.map(r => r.maSinhVien).filter(Boolean));
          const setGV = new Set(nonEmpty.map(r => (r.giangVien || '').trim().toLowerCase()).filter(v => v));
          const setDN = new Set(nonEmpty.map(r => (r.doanhNghiep || '').trim().toLowerCase()).filter(v => v));
          await require('../database/connection').query(
            `UPDATE dot_thuc_tap SET so_sinh_vien_excel = ?, so_giang_vien_excel = ?, so_doanh_nghiep_excel = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [setSV.size, setGV.size, setDN.size, latestActive.id]
          );
        }
      } catch (e) {
        console.warn('⚠️ Không thể cập nhật số lượng vào dot_thuc_tap:', e.message);
      }

      res.status(errors.length ? 206 : 200).json({
        success: true,
        message: `Cập nhật phân công cho ${updated} sinh viên${unchanged ? `, ${unchanged} không thay đổi` : ''}${errors.length ? `, ${errors.length} lỗi` : ''}`,
        data: { updated, unchanged, errors }
      });
    } catch (error) {
      console.error('❌ Lỗi import phân công:', error);
      res.status(500).json({ success: false, message: error.message || 'Lỗi server khi import phân công' });
    } finally {
      if (filePath) {
        try { await deleteFile(filePath); } catch {}
      }
    }
  }

  // POST /api/import/giang-vien - Import danh sách giảng viên từ Excel
  static async importGiangVien(req, res) {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file Excel được upload',
          data: null
        });
      }
      
      filePath = req.file.path;
      
      console.log('📁 Đang xử lý file giảng viên:', req.file.originalname);
      
      // Bước 1: Parse file Excel
      const parseResult = await ExcelImportService.parseExcelFile(filePath, 'giang-vien');
      
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File Excel có lỗi và không có dữ liệu hợp lệ nào',
          data: {
            totalRows: parseResult.totalRows,
            errors: parseResult.errors
          }
        });
      }
      
      // Bước 2: Import vào database
      console.log('🔍 Bắt đầu import vào database, số dòng hợp lệ:', parseResult.data.length);
      const importResult = await ExcelImportService.importToDatabase('giang-vien', parseResult.data);
      console.log('✅ Kết quả import:', JSON.stringify(importResult, null, 2));
      
      // Bước 3: Tổng hợp kết quả
      const finalResult = {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          totalRows: parseResult.totalRows
        },
        parsing: {
          validRows: parseResult.data.length,
          errorRows: parseResult.errors.length,
          errors: parseResult.errors
        },
        import: {
          accountsCreated: importResult.accountsCreated,
          accountsUpdated: importResult.accountsUpdated,
          profilesCreated: importResult.profilesCreated,
          profilesUpdated: importResult.profilesUpdated,
          errors: importResult.errors
        },
        summary: {
          totalProcessed: parseResult.data.length,
          totalSuccess: importResult.accountsCreated + importResult.accountsUpdated,
          totalErrors: parseResult.errors.length + importResult.errors.length
        }
      };
      
      const hasErrors = finalResult.summary.totalErrors > 0;
      
      // Sau khi import giảng viên, dọn trùng sinh viên rồi chạy auto-assign cho SV chưa có GV
      try {
        const SinhVien = require('../models/SinhVien');
        await SinhVien.deduplicateByMaSinhVien();
        const { autoAssignLecturersByQuota } = require('../services/AutoAssignService');
        const summary = await autoAssignLecturersByQuota();
        console.log('✅ Auto-assign lecturers after teacher import:', summary);
      } catch (e) {
        console.warn('⚠️ Không thể tự động phân công sau khi import giảng viên:', e.message);
      }

      res.status(hasErrors ? 206 : 200).json({
        success: true,
        message: hasErrors ? 
          `Import hoàn thành với ${finalResult.summary.totalErrors} lỗi` : 
          'Import giảng viên thành công và đã phân công ngẫu nhiên cho sinh viên chưa có giảng viên (theo chỉ tiêu)',
        data: finalResult
      });
      
    } catch (error) {
      console.error('❌ Lỗi import giảng viên:', error);
      
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server khi import giảng viên',
        data: null
      });
    } finally {
      // Cleanup: Xóa file tạm
      if (filePath) {
        try {
          await deleteFile(filePath);
        } catch (cleanupError) {
          console.error('Lỗi xóa file tạm:', cleanupError);
        }
      }
    }
  }

  // POST /api/import/doanh-nghiep - Import danh sách doanh nghiệp từ Excel
  static async importDoanhNghiep(req, res) {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file Excel được upload',
          data: null
        });
      }
      
      filePath = req.file.path;
      
      console.log('📁 Đang xử lý file doanh nghiệp:', req.file.originalname);
      
      // Bước 1: Parse file Excel
      const parseResult = await ExcelImportService.parseExcelFile(filePath, 'doanh-nghiep');
      
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File Excel có lỗi và không có dữ liệu hợp lệ nào',
          data: {
            totalRows: parseResult.totalRows,
            errors: parseResult.errors
          }
        });
      }
      
      // Bước 2: Import vào database
      const importResult = await ExcelImportService.importToDatabase('doanh-nghiep', parseResult.data);
      
      // Bước 3: Tổng hợp kết quả
      const finalResult = {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          totalRows: parseResult.totalRows
        },
        parsing: {
          validRows: parseResult.data.length,
          errorRows: parseResult.errors.length,
          errors: parseResult.errors
        },
        import: {
          accountsCreated: importResult.accountsCreated,
          accountsUpdated: importResult.accountsUpdated,
          profilesCreated: importResult.profilesCreated,
          profilesUpdated: importResult.profilesUpdated,
          errors: importResult.errors
        },
        summary: {
          totalProcessed: parseResult.data.length,
          totalSuccess: importResult.accountsCreated + importResult.accountsUpdated,
          totalErrors: parseResult.errors.length + importResult.errors.length
        }
      };
      
      const hasErrors = finalResult.summary.totalErrors > 0;
      
      res.status(hasErrors ? 206 : 200).json({
        success: true,
        message: hasErrors ? 
          `Import hoàn thành với ${finalResult.summary.totalErrors} lỗi` : 
          'Import doanh nghiệp thành công',
        data: finalResult
      });
      
    } catch (error) {
      console.error('❌ Lỗi import doanh nghiệp:', error);
      
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server khi import doanh nghiệp',
        data: null
      });
    } finally {
      // Cleanup: Xóa file tạm
      if (filePath) {
        try {
          await deleteFile(filePath);
        } catch (cleanupError) {
          console.error('Lỗi xóa file tạm:', cleanupError);
        }
      }
    }
  }

  // POST /api/import/admin - Import danh sách admin từ Excel
  static async importAdmin(req, res) {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file Excel được upload',
          data: null
        });
      }
      
      filePath = req.file.path;
      
      console.log('📁 Đang xử lý file admin:', req.file.originalname);
      
      // Bước 1: Parse file Excel
      const parseResult = await ExcelImportService.parseExcelFile(filePath, 'admin');
      
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File Excel có lỗi và không có dữ liệu hợp lệ nào',
          data: {
            totalRows: parseResult.totalRows,
            errors: parseResult.errors
          }
        });
      }
      
      // Bước 2: Import vào database
      const importResult = await ExcelImportService.importToDatabase('admin', parseResult.data);
      
      // Bước 3: Tổng hợp kết quả
      const finalResult = {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          totalRows: parseResult.totalRows
        },
        parsing: {
          validRows: parseResult.data.length,
          errorRows: parseResult.errors.length,
          errors: parseResult.errors
        },
        import: {
          accountsCreated: importResult.accountsCreated,
          accountsUpdated: importResult.accountsUpdated,
          profilesCreated: importResult.profilesCreated,
          profilesUpdated: importResult.profilesUpdated,
          errors: importResult.errors
        },
        summary: {
          totalProcessed: parseResult.data.length,
          totalSuccess: importResult.accountsCreated + importResult.accountsUpdated,
          totalErrors: parseResult.errors.length + importResult.errors.length
        }
      };
      
      const hasErrors = finalResult.summary.totalErrors > 0;
      
      res.status(hasErrors ? 206 : 200).json({
        success: true,
        message: hasErrors ? 
          `Import hoàn thành với ${finalResult.summary.totalErrors} lỗi` : 
          'Import admin thành công',
        data: finalResult
      });
      
    } catch (error) {
      console.error('❌ Lỗi import admin:', error);
      
      res.status(500).json({
        success: false,
        message: error.message || 'Lỗi server khi import admin',
        data: null
      });
    } finally {
      // Cleanup: Xóa file tạm
      if (filePath) {
        try {
          await deleteFile(filePath);
        } catch (cleanupError) {
          console.error('Lỗi xóa file tạm:', cleanupError);
        }
      }
    }
  }

  // GET /api/import/templates/:type - Tải template Excel theo loại
  static async downloadTemplate(req, res) {
    try {
      const { type } = req.params;
      
      const validTypes = ['sinh-vien', 'giang-vien', 'doanh-nghiep', 'admin'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Loại template không hợp lệ. Chọn: sinh-vien, giang-vien, doanh-nghiep, admin'
        });
      }
      
      const templatePath = path.join(__dirname, '../templates', `template-${type}.xlsx`);
      
      // Kiểm tra file template tồn tại
      const fs = require('fs');
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({
          success: false,
          message: 'Template không tồn tại'
        });
      }
      
      res.download(templatePath, `template-${type}.xlsx`, (err) => {
        if (err) {
          console.error('Lỗi download template:', err);
          res.status(500).json({
            success: false,
            message: 'Lỗi tải template'
          });
        }
      });
      
    } catch (error) {
      console.error('❌ Lỗi download template:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi tải template'
      });
    }
  }

  // GET /api/import/status - Lấy thống kê import
  static async getImportStats(req, res) {
    try {
      const Account = require('../models/Account');
      const SinhVien = require('../models/SinhVien');
      const GiangVien = require('../models/GiangVien');
      const DoanhNghiep = require('../models/DoanhNghiep');
      const Admin = require('../models/Admin');
      
      // Thống kê số lượng account theo role
      const stats = {
        accounts: {
          total: await Account.count(),
          sinhVien: await Account.count('sinh-vien'),
          giangVien: await Account.count('giang-vien'),
          doanhNghiep: await Account.count('doanh-nghiep'),
          admin: await Account.count('admin')
        },
        profiles: {
          sinhVien: (await SinhVien.getAll(1, 1)).pagination.total,
          giangVien: (await GiangVien.getAll(1, 1)).pagination.total,
          doanhNghiep: (await DoanhNghiep.getAll(1, 1)).pagination.total,
          admin: (await Admin.getAll()).length
        }
      };
      
      res.json({
        success: true,
        message: 'Lấy thống kê thành công',
        data: stats
      });
      
    } catch (error) {
      console.error('❌ Lỗi lấy thống kê:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy thống kê'
      });
    }
  }

  // POST /api/import/preview/:type - Preview nội dung file Excel trước khi import
  static async previewFile(req, res) {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file Excel được upload'
        });
      }

      const { type } = req.params;
      const validTypes = ['sinh-vien', 'giang-vien', 'doanh-nghiep', 'admin'];
      
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `Loại tài khoản không hợp lệ: ${type}`
        });
      }

      filePath = req.file.path;
      
      console.log('👀 Preview file:', req.file.originalname, 'Type:', type);
      
      // Parse file Excel để lấy thông tin preview
      const parseResult = await ExcelImportService.parseExcelFile(filePath, type);
      
      // Lấy tối đa 5 dòng đầu làm sample data
      const sampleData = parseResult.data.slice(0, 5).map(row => {
        const sample = {};
        Object.keys(row).forEach(key => {
          sample[key] = String(row[key]).substring(0, 50); // Giới hạn độ dài
        });
        return sample;
      });

      // Lấy danh sách cột từ dữ liệu
      const columns = parseResult.data.length > 0 ? Object.keys(parseResult.data[0]) : [];
      
      // Trả về thông tin preview
      res.json({
        success: true,
        message: 'Preview file thành công',
        data: {
          fileName: req.file.originalname,
          totalRows: parseResult.data.length,
          columns: columns,
          sampleData: sampleData,
          parsingErrors: parseResult.errors.slice(0, 10) // Chỉ lấy 10 lỗi đầu
        }
      });
      
    } catch (error) {
      console.error('❌ Lỗi preview file:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi đọc file Excel. Vui lòng kiểm tra định dạng file.'
      });
    } finally {
      // Xóa file tạm sau khi preview
      if (filePath) {
        deleteFile(filePath);
      }
    }
  }

  // POST /api/import/thuc-tap-google-form - Import đăng ký thực tập từ Google Form
  static async importThucTapGoogleForm(req, res) {
    let filePath = null;
    
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Không có file Excel từ Google Form được upload',
          data: null
        });
      }
      
      filePath = req.file.path;
      
      console.log('📋 Đang xử lý file thực tập từ Google Form:', req.file.originalname);
      
      // Bước 1: Parse file Excel từ Google Form
      const parseResult = await ExcelImportService.parseGoogleFormFile(filePath);
      
      if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'File Excel từ Google Form có lỗi và không có dữ liệu hợp lệ nào',
          data: {
            totalRows: parseResult.totalRows,
            errors: parseResult.errors
          }
        });
      }
      
      // Bước 2: Cập nhật thông tin thực tập cho sinh viên
      const importResult = await ExcelImportService.updateInternshipInfo(parseResult.data, req.user.id);
      
      // Bước 3: Tự động phân loại sinh viên theo vị trí
      const classificationResult = await ExcelImportService.autoClassifyStudents();
      
      // Bước 4: Tổng hợp kết quả
      const finalResult = {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          totalRows: parseResult.totalRows
        },
        import: {
          successful: importResult.successful,
          failed: importResult.failed,
          errors: [...parseResult.errors, ...importResult.errors]
        },
        classification: classificationResult,
        summary: {
          totalProcessed: parseResult.totalRows,
          successfullyImported: importResult.successful,
          hasErrors: parseResult.errors.length > 0 || importResult.errors.length > 0
        }
      };
      
      const statusCode = finalResult.summary.hasErrors ? 206 : 200; // 206 = Partial Content nếu có lỗi
      
      return res.status(statusCode).json({
        success: true,
        message: finalResult.summary.hasErrors 
          ? `Import hoàn thành với một số lỗi. Đã cập nhật thành công ${finalResult.import.successful}/${finalResult.file.totalRows} bản ghi và tự động phân loại ${classificationResult.totalClassified} sinh viên.`
          : `Import thành công ${finalResult.import.successful} bản ghi thực tập và tự động phân loại ${classificationResult.totalClassified} sinh viên.`,
        data: finalResult
      });
      
    } catch (error) {
      console.error('🚨 Lỗi khi import thực tập từ Google Form:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Có lỗi xảy ra khi import dữ liệu thực tập',
        data: {
          error: error.message
        }
      });
      
    } finally {
      // Xóa file sau khi xử lý
      if (filePath) {
        try {
          deleteFile(filePath);
          console.log('🗑️  Đã xóa file Google Form tạm:', filePath);
        } catch (cleanupError) {
          console.warn('⚠️  Không thể xóa file tạm:', cleanupError.message);
        }
      }
    }
  }
}

module.exports = ImportController;