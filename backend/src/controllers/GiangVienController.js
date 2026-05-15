// Controller: GiangVien (Teacher) 
// File: src/controllers/GiangVienController.js

const GiangVien = require('../models/GiangVien');
const ExcelJS = require('exceljs');

// Xuất Excel danh sách giảng viên theo đúng format template mới
const exportToExcel = async (req, res) => {
  try {
    console.log('📊 Xuất Excel danh sách giảng viên...');

    const result = await GiangVien.getAll(1, 1000);
    const teachers = result.giangViens;

    const FONT = { name: 'Times New Roman', size: 12 };

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DS CBGV Khoa CNTT');

    const headers = [
      { header: 'STT',                   key: 'stt',              width: 6  },
      { header: 'MÃ ĐỊNH DANH MỚI',      key: 'maGiangVien',      width: 22 },
      { header: 'HỌ VÀ TÊN',             key: 'hoTen',            width: 25 },
      { header: 'NGÀY SINH',             key: 'ngaySinh',         width: 15 },
      { header: 'PHÒNG BAN',             key: 'khoa',             width: 32 },
      { header: 'HỌC VỊ',               key: 'hocVi',            width: 12 },
      { header: 'Chức danh',             key: 'chucDanh',         width: 20 },
      { header: 'Chức vụ',              key: 'chucVu',           width: 14 },
      { header: 'Số điện thoại',         key: 'soDienThoai',      width: 18 },
      { header: 'Căn cước công dân',     key: 'canCuocCongDan',   width: 22 },
      { header: 'Email',                 key: 'email',            width: 30 },
      { header: 'Chuyên môn đào tạo',   key: 'chuyenMon',        width: 26 },
    ];

    worksheet.columns = headers;

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length }
    };

    // Thêm dữ liệu
    teachers.forEach((teacher, index) => {
      const row = worksheet.addRow({
        stt: index + 1,
        maGiangVien: teacher.maGiangVien,
        hoTen: teacher.hoTen,
        ngaySinh: teacher.ngaySinh || '',
        khoa: teacher.khoa || '',
        hocVi: teacher.hocVi || '',
        chucDanh: teacher.chucDanh || '',
        chucVu: teacher.chucVu || '',
        soDienThoai: teacher.soDienThoai || '',
        canCuocCongDan: teacher.canCuocCongDan || '',
        email: teacher.email || '',
        chuyenMon: teacher.chuyenMon || '',
      });
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = FONT;
        cell.border = {
          top: { style: 'thin' }, left: { style: 'thin' },
          bottom: { style: 'thin' }, right: { style: 'thin' }
        };
      });
    });

    const filename = `DS-CBGV-KhoaCNTT-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

    console.log(`✅ Xuất Excel giảng viên thành công: ${teachers.length} giảng viên`);
  } catch (error) {
    console.error('❌ Lỗi xuất Excel giảng viên:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi xuất file Excel' });
  }
};

module.exports = {
  exportToExcel
};