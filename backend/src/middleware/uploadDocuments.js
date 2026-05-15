const multer = require('multer');
const fs = require('fs');
const path = require('path');

const tmpDir = path.join(process.cwd(), 'uploads', 'tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const allowedTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const uploadDocuments = multer({
  dest: tmpDir,
  fileFilter: (req, file, cb) => {
    if (allowedTypes.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Định dạng file không được hỗ trợ'));
  },
  limits: { fileSize: 25 * 1024 * 1024 },
});

module.exports = { uploadDocuments };
