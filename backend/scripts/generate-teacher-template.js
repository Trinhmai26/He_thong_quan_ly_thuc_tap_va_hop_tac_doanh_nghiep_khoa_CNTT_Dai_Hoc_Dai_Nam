const ExcelJS = require('exceljs');
const path = require('path');

(async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('DS CBGV Khoa CNTT');

  const FONT = { name: 'Times New Roman', size: 12 };

  const headers = [
    'STT',
    'MÃ ĐỊNH DANH MỚI',
    'HỌ VÀ TÊN',
    'NGÀY SINH',
    'PHÒNG BAN',
    'HỌC VỊ',
    'Chức danh',
    'Chức vụ',
    'Số điện thoại',
    'Căn cước công dân',
    'Email',
    'Chuyên môn đào tạo',
  ];

  worksheet.addRow(headers);

  const headerRow = worksheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // Enable auto-filter on header row
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };

  const colWidths = [6, 22, 25, 15, 32, 12, 20, 14, 18, 22, 30, 26];
  headers.forEach((_, i) => {
    worksheet.getColumn(i + 1).width = colWidths[i];
  });

  // Sample row matching the user's file
  worksheet.addRow([
    1,
    '99900009',
    'Nguyễn Văn A',
    '12/29/1991',
    'Khoa Công nghệ thông tin',
    'Thạc sĩ',
    '',
    '',
    '966751676',
    '',
    '',
    'CNTT',
  ]);

  const sampleRow = worksheet.getRow(2);
  sampleRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = FONT;
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  const templatePath = path.join(__dirname, '../src/templates/template-giang-vien.xlsx');
  await workbook.xlsx.writeFile(templatePath);
  console.log('✅ Template giảng viên đã được tạo tại:', templatePath);
  process.exit(0);
})();
