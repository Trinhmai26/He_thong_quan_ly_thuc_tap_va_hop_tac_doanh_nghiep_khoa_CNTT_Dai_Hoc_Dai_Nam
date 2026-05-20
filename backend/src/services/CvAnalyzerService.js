const path = require('path');
const fs = require('fs');
const axios = require('axios');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const UPLOADS_DIR = path.join(BACKEND_ROOT, 'uploads');
const CV_ANALYZER_URL = process.env.CV_ANALYZER_URL || 'http://127.0.0.1:5000/api/process-cv';
const CV_EXTRACT_NAME_URL = process.env.CV_EXTRACT_NAME_URL
  || CV_ANALYZER_URL.replace(/\/process-cv$/, '/extract-name');
const CV_VALIDATE_URL = CV_ANALYZER_URL.replace(/\/process-cv$/, '/validate-cv');
const CV_ANALYZER_TIMEOUT_MS = Number(process.env.CV_ANALYZER_TIMEOUT_MS || 180000);

function toAbsoluteCvPath(storedCvPath) {
  if (!storedCvPath || typeof storedCvPath !== 'string') {
    return null;
  }

  const normalized = storedCvPath.replace(/\\/g, '/').trim();
  const relativePath = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  const absolutePath = path.resolve(BACKEND_ROOT, relativePath);

  // Only allow files inside backend uploads directory.
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  if (!absolutePath.startsWith(uploadsRoot)) {
    return null;
  }

  return absolutePath;
}

async function analyzeCvWithPython({ absoluteCvPath, jobPositions = [] }) {
  if (!absoluteCvPath || !fs.existsSync(absoluteCvPath)) {
    throw new Error('Không tìm thấy file CV để phân tích');
  }

  const response = await axios.post(
    CV_ANALYZER_URL,
    {
      filePath: absoluteCvPath,
      jobPositions: Array.isArray(jobPositions) ? jobPositions : []
    },
    {
      timeout: CV_ANALYZER_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

async function extractStudentNameFromCv({ absoluteCvPath }) {
  if (!absoluteCvPath || !fs.existsSync(absoluteCvPath)) {
    throw new Error('Không tìm thấy file CV để trích xuất họ tên');
  }

  const response = await axios.post(
    CV_EXTRACT_NAME_URL,
    { filePath: absoluteCvPath },
    {
      timeout: CV_ANALYZER_TIMEOUT_MS,
      headers: { 'Content-Type': 'application/json' }
    }
  );

  return response.data || {};
}

/**
 * Gọi Python /api/validate-cv để xác thực tên/mã SV/email trong nội dung CV.
 *
 * @param {object} opts
 * @param {string} opts.absoluteCvPath    - Đường dẫn tuyệt đối tới file CV
 * @param {string} opts.studentName       - Họ tên sinh viên từ DB
 * @param {string} [opts.studentCode]     - Mã sinh viên (ví dụ: 1671020196)
 * @param {string} [opts.studentEmail]    - Email sinh viên
 * @param {string} [opts.originalFilename] - Tên file gốc (chỉ để log)
 *
 * @throws Nếu Python service không khả dụng (caller phải bắt và fallback).
 */
async function validateCvOwnership({
  absoluteCvPath,
  studentName,
  studentCode = '',
  studentEmail = '',
  originalFilename = '',
}) {
  if (!absoluteCvPath || !fs.existsSync(absoluteCvPath)) {
    throw new Error('Không tìm thấy file CV để xác thực');
  }

  const response = await axios.post(
    CV_VALIDATE_URL,
    {
      filePath:         absoluteCvPath,
      studentName:      studentName,
      studentCode:      studentCode,
      studentEmail:     studentEmail,
      originalFilename: originalFilename,
    },
    {
      timeout: Math.min(CV_ANALYZER_TIMEOUT_MS, 60000),
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true, // không throw trên 4xx/5xx
    }
  );

  if (response.status >= 500) {
    const err = new Error(`Python validate-cv returned ${response.status}`);
    err.code = 'ERR_BAD_RESPONSE';
    err.response = response;
    throw err;
  }

  return response.data;
}

module.exports = {
  toAbsoluteCvPath,
  analyzeCvWithPython,
  extractStudentNameFromCv,
  validateCvOwnership,
  CV_ANALYZER_URL,
  CV_EXTRACT_NAME_URL,
  CV_VALIDATE_URL,
};
