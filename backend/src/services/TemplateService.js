const ExcelJS = require('exceljs');
const path = require('path');

class TemplateService {
  static async createSinhVienTemplate() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sinh viên');

    // Giữ đúng bộ cột theo template người dùng gửi
    const headers = [
      'Mã SV',
      'Họ và tên',
      'Số điện thoại',
      'Lớp',
      'Ngày sinh',
      'TT Học',
      'TBCHT H10',
      'Xếp loại',
      'Số.TC TLũy',
      'Số.TC HT',
      'Năm thứ',
      'HP Nợ'
    ];

    worksheet.addRow(headers);

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    headers.forEach((header, index) => {
      const col = worksheet.getColumn(index + 1);
      col.width = Math.max(header.length + 2, 16);
    });

    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    worksheet.addRow([
      'SV001',
      'Nguyễn Văn A',
      '0123456789',
      'CNTT01',
      '26/06/2004',
      'Đang học',
      '3.50',
      'Giỏi',
      '110',
      '18',
      '3',
      '0'
    ]);

    return workbook;
  }

  static async saveTemplate() {
    const workbook = await this.createSinhVienTemplate();
    const templatePath = path.join(__dirname, '..', 'templates', 'template-sinh-vien.xlsx');
    await workbook.xlsx.writeFile(templatePath);
    return templatePath;
  }
}

module.exports = TemplateService;
