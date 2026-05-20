const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const SinhVien = require('../models/SinhVien');
const Account = require('../models/Account');
const RegistrationPeriod = require('../models/RegistrationPeriod');
const RegistrationController = require('../controllers/RegistrationController');
const connection = require('../database/connection');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { analyzeCvWithPython, extractStudentNameFromCv, validateCvOwnership, toAbsoluteCvPath, CV_ANALYZER_URL } = require('../services/CvAnalyzerService');
const { createNotification, ensureNotificationsTable } = require('../utils/notificationHelper');

// Configure multer for CV uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../uploads/cv');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Create unique filename: studentId_timestamp.pdf
    const studentId = req.user?.userId || 'unknown';
    const timestamp = Date.now();
    const extension = path.extname(file.originalname);
    cb(null, `${studentId}_${timestamp}${extension}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Only allow PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file PDF'), false);
    }
  }
});

const TOTAL_CREDITS_BY_MAJOR = {
  CNTT: 127,
  KHMT: 151
};

const ELIGIBLE_RATIO = 0.7;

function isAdminUser(user) {
  const raw = String(
    user?.role || user?.userRole || user?.vai_tro || user?.vaiTro || ''
  )
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-');

  return raw === 'admin' || raw.includes('admin') || (raw.includes('quan') && raw.includes('tri'));
}

function getLecturerCapacity(teacher) {
  const degreeText = `${teacher?.hoc_vi || ''} ${teacher?.bang_cap || ''} ${teacher?.ho_ten || ''}`.toLowerCase();
  if (/\b(ts\.?|ti[eế]n\s*s[iĩ])\b/.test(degreeText)) return 20;
  if (/\b(ths\.?|th[aạ]c\s*s[iĩ])\b/.test(degreeText)) return 15;
  return 15;
}

function normalizeMajor(rawMajor) {
  return String(rawMajor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeTextForMatch(rawText) {
  return String(rawText || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompactText(rawText) {
  return normalizeTextForMatch(rawText).replace(/\s+/g, '');
}

async function extractPdfTextFallback(absoluteCvPath) {
  if (!absoluteCvPath || !fs.existsSync(absoluteCvPath)) {
    return '';
  }

  try {
    const pdfBuffer = fs.readFileSync(absoluteCvPath);
    const parsed = await pdfParse(pdfBuffer);
    const textFromPdfParse = String(parsed?.text || '').trim();
    if (textFromPdfParse) {
      return textFromPdfParse;
    }

    // Fallback #2: some PDFs fail with pdf-parse but can be read via pdfjs-dist.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer) });
    const doc = await loadingTask.promise;
    let text = '';

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = (content.items || [])
        .map((item) => (typeof item?.str === 'string' ? item.str : ''))
        .join(' ')
        .trim();
      if (pageText) {
        text += `${pageText}\n`;
      }
    }

    return text.trim();
  } catch (error) {
    console.error('[CV_VALIDATION] Fallback PDF parse error:', error?.message || error);
    return '';
  }
}

function isStudentInfoFoundInCv(cvText, student) {
  const normalizedCvText = normalizeTextForMatch(cvText);
  const compactCvText = normalizeCompactText(cvText);
  const studentCode = normalizeCompactText(student?.ma_sinh_vien || '');
  const normalizedStudentName = normalizeTextForMatch(student?.ho_ten || '');
  const compactStudentName = normalizeCompactText(student?.ho_ten || '');

  if (!normalizedCvText || (!studentCode && !compactStudentName)) {
    return false;
  }

  // 1) Student code (e.g. "1771020065") appears in the CV — strongest signal.
  if (studentCode && (normalizedCvText.includes(studentCode) || compactCvText.includes(studentCode))) {
    console.log('[CV_VALIDATION] Matched via student code');
    return true;
  }

  // 2) Full compact name appears as one contiguous chunk (e.g. "nguyenthingocanh").
  if (compactStudentName && compactCvText.includes(compactStudentName)) {
    console.log('[CV_VALIDATION] Matched via full compact name');
    return true;
  }

  // 3) Name token match: split the student's full name into tokens (length >= 2)
  //    and count how many appear in the CV text AS STANDALONE WORDS. Substring
  //    matching is NOT used because short tokens like "anh"/"thi" appear inside
  //    common Vietnamese words ("ngành", "doanh", "thiết"), causing false
  //    positives that accept other people's CVs. Accept only if ALL tokens
  //    match as whole words (or full name matched compactly above).
  const nameTokens = normalizedStudentName
    ? normalizedStudentName.split(' ').filter((t) => t.length >= 2)
    : [];
  const cvWords = new Set(normalizedCvText.split(' ').filter(Boolean));
  const matchedTokens = nameTokens.filter((tok) => cvWords.has(tok));
  if (nameTokens.length > 0 && matchedTokens.length === nameTokens.length) {
    console.log(`[CV_VALIDATION] Matched via ALL name tokens as whole words: ${JSON.stringify(matchedTokens)}`);
    return true;
  }

  console.log(`[CV_VALIDATION] No match. studentCode="${studentCode}" tokens=${JSON.stringify(nameTokens)} matched=${JSON.stringify(matchedTokens)}`);
  return false;
}

function isStudentInfoFoundInFilename(fileName, student) {
  const normalizedName = normalizeTextForMatch(String(fileName || '').replace(/\.[^.]+$/, ''));
  const studentCode = normalizeTextForMatch(student?.ma_sinh_vien || '');
  const studentName = normalizeTextForMatch(student?.ho_ten || '');

  if (!normalizedName || (!studentCode && !studentName)) {
    return false;
  }

  const hasStudentCode = studentCode ? normalizedName.includes(studentCode) : false;

  const nameTokens = studentName
    ? studentName.split(' ').filter((token) => token.length >= 2)
    : [];
  const matchedTokens = nameTokens.filter((token) => normalizedName.includes(token));
  const hasStudentName = nameTokens.length >= 2
    ? matchedTokens.length >= Math.max(2, Math.ceil(nameTokens.length * 0.6))
    : matchedTokens.length >= 1;

  return hasStudentCode || hasStudentName;
}

function isStrongStudentInfoFoundInFilename(fileName, student) {
  const normalizedName = normalizeTextForMatch(String(fileName || '').replace(/\.[^.]+$/, ''));
  const compactName = normalizeCompactText(fileName || '');
  const studentCode = normalizeCompactText(student?.ma_sinh_vien || '');
  const studentName = normalizeTextForMatch(student?.ho_ten || '');
  const compactStudentName = normalizeCompactText(student?.ho_ten || '');

  if (!normalizedName || (!studentCode && !studentName)) {
    return false;
  }

  const hasStudentCode = studentCode
    ? normalizedName.includes(studentCode) || compactName.includes(studentCode)
    : false;

  const nameTokens = studentName
    ? studentName.split(' ').filter((token) => token.length >= 2)
    : [];

  const hasBoundaryName = nameTokens.length >= 2
    ? normalizedName.includes(nameTokens[0]) && normalizedName.includes(nameTokens[nameTokens.length - 1])
    : false;

  const hasCompactFullName = compactStudentName ? compactName.includes(compactStudentName) : false;

  return hasStudentCode && (hasCompactFullName || hasBoundaryName);
}

async function validateUploadedCvOwnershipOrThrow(uploadedFile, student) {
  const absoluteCvPath  = uploadedFile?.path;
  const originalFilename = uploadedFile?.originalname || '';
  const studentName      = String(student?.ho_ten || '').trim();
  const studentCode      = String(student?.ma_sinh_vien || '').trim();
  const studentEmail     = String(student?.email_ca_nhan || '').trim().toLowerCase();

  // Normalize: bỏ dấu + lowercase + bỏ ký tự đặc biệt + gộp khoảng trắng
  const normFn = (s) => String(s || '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normStudentName = normFn(studentName);
  const normStudentCode = normFn(studentCode);

  console.log(`\n[CV_VALIDATION] ===== START =====`);
  console.log(`[CV_VALIDATION] studentName     : "${studentName}"`);
  console.log(`[CV_VALIDATION] studentCode     : "${studentCode}"`);
  console.log(`[CV_VALIDATION] studentEmail    : "${studentEmail}"`);
  console.log(`[CV_VALIDATION] fileName        : "${originalFilename}"`);
  console.log(`[CV_VALIDATION] normStudentName : "${normStudentName}"`);
  console.log(`[CV_VALIDATION] normStudentCode : "${normStudentCode}"`);

  // ══════════════════════════════════════════════════════════════════════════
  // PRIMARY PATH: Python /api/validate-cv
  // Truyền name + code + email để Python có thể xác minh bằng nhiều cách.
  // Tên file KHÔNG được dùng làm điều kiện chấp nhận.
  // ══════════════════════════════════════════════════════════════════════════
  let pythonUnavailable = false;
  try {
    console.log(`[CV_VALIDATION] Calling Python /api/validate-cv...`);
    const validation = await validateCvOwnership({
      absoluteCvPath,
      studentName,
      studentCode,
      studentEmail,
      originalFilename: '', // không truyền filename để Python không dùng filename làm bằng chứng
    });

    console.log(`[CV_VALIDATION] Python result: is_match=${validation.is_match} ` +
      `content_match=${validation.content_match} extracted="${validation.extracted_name}" ` +
      `similarity=${validation.similarity} message="${validation.message}"`);

    if (validation.is_match) {
      console.log(`[CV_VALIDATION] ACCEPTED (Python)`);
      return;
    }

    // Python trả về không khớp → không throw ngay, để Node.js fallback kiểm tra thêm
    // (phòng trường hợp Python đọc sai font hoặc encoding, nhưng code/email vẫn đọc được)
    console.warn(`[CV_VALIDATION] Python: no match — trying Node.js fallback for code/email check`);
    pythonUnavailable = true;

  } catch (pyError) {
    if (pyError.code === 'CV_OWNER_MISMATCH') throw pyError;
    pythonUnavailable = true;
    console.warn(`[CV_VALIDATION] Python unavailable (${pyError.code || pyError.message}) — Node.js fallback`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FALLBACK: Node.js đọc PDF text trực tiếp + kiểm tra nội dung
  // Nếu không đọc được text → REJECT (không chấp nhận chỉ vì tên file đúng).
  // ══════════════════════════════════════════════════════════════════════════
  if (!pythonUnavailable) return;

  let cvText = '';
  try {
    cvText = await extractPdfTextFallback(absoluteCvPath);
  } catch (pdfErr) {
    console.warn(`[CV_VALIDATION] pdfParse error: ${pdfErr?.message}`);
  }

  const extractedLen = cvText ? cvText.length : 0;
  console.log(`[CV_VALIDATION] extractedTextLength : ${extractedLen}`);
  if (extractedLen > 0) {
    console.log(`[CV_VALIDATION] extractedText (1000): ${cvText.substring(0, 1000)}`);
  }

  // Không đọc được text → REJECT rõ ràng
  if (!cvText || cvText.trim().length < 20) {
    console.error(`[CV_VALIDATION] REJECTED: cannot read CV content`);
    const err = new Error(
      `Không đọc được nội dung CV. Vui lòng tải CV dạng PDF có thể copy text (không phải ảnh scan).`
    );
    err.code = 'CV_OWNER_MISMATCH';
    throw err;
  }

  // Normalize CV text
  const normCvText   = normFn(cvText);
  const cvTextRaw    = cvText.toLowerCase();

  // Kiểm tra nội dung CV
  const nameInCv  = normStudentName ? normCvText.includes(normStudentName) : false;
  const codeInCv  = studentCode
    ? (normCvText.includes(normStudentCode) || cvText.includes(studentCode))
    : false;
  const emailInCv = studentEmail ? cvTextRaw.includes(studentEmail) : false;
  const tokenMatch = isStudentInfoFoundInCv(cvText, student);
  const isValid   = nameInCv || codeInCv || emailInCv || tokenMatch;

  console.log(`[CV_VALIDATION] normalizedCvText (500): ${normCvText.substring(0, 500)}`);
  console.log(`[CV_VALIDATION] cvContainsStudentName : ${nameInCv}`);
  console.log(`[CV_VALIDATION] cvContainsStudentCode : ${codeInCv}`);
  console.log(`[CV_VALIDATION] cvContainsEmail       : ${emailInCv}`);
  console.log(`[CV_VALIDATION] cvTokenMatch          : ${tokenMatch}`);
  console.log(`[CV_VALIDATION] finalIsValid          : ${isValid}`);

  if (isValid) {
    console.log(`[CV_VALIDATION] ACCEPTED (fallback): CV content verified`);
    return;
  }

  // Nội dung không khớp → REJECT
  console.error(`[CV_VALIDATION] REJECTED: CV content does not match student info`);
  const rejectErr = new Error(
    `CV không khớp với tài khoản sinh viên. ` +
    `Nội dung CV không chứa họ tên hoặc mã sinh viên của "${studentName}" (${studentCode}). ` +
    `Vui lòng tải đúng CV của bạn.`
  );
  rejectErr.code = 'CV_OWNER_MISMATCH';
  rejectErr.rejectReason = `nameInCv=${nameInCv} codeInCv=${codeInCv} emailInCv=${emailInCv} tokenMatch=${tokenMatch}`;
  throw rejectErr;
}

function getMajorKey(student) {
  const majorNormalized = normalizeMajor(student?.nganh);
  const classNormalized = normalizeMajor(student?.lop);
  const facultyNormalized = normalizeMajor(student?.khoa);
  const combined = `${majorNormalized} ${classNormalized} ${facultyNormalized}`;

  if (combined.includes('KHMT') || combined.includes('KHOAHOCMAYTINH')) return 'KHMT';
  if (combined.includes('CNTT') || combined.includes('CONGNGHETHONGTIN')) return 'CNTT';
  return null;
}

function evaluateInternshipEligibility(student) {
  const majorKey = getMajorKey(student);
  if (!majorKey) {
    return { eligible: true, majorKey: null };
  }

  const totalCredits = TOTAL_CREDITS_BY_MAJOR[majorKey];
  const minCredits = Math.ceil(totalCredits * ELIGIBLE_RATIO);
  const accumulatedCredits = Number(student?.so_tc_tich_luy);
  const safeAccumulatedCredits = Number.isFinite(accumulatedCredits) ? accumulatedCredits : 0;

  return {
    eligible: safeAccumulatedCredits >= minCredits,
    majorKey,
    totalCredits,
    minCredits,
    accumulatedCredits: safeAccumulatedCredits,
    ratioRequired: ELIGIBLE_RATIO
  };
}

async function ensureDotColumnExists() {
  const rows = await connection.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'sinh_vien'
       AND COLUMN_NAME = 'dot_thuc_tap_admin'`
  );

  const exists = Number(rows?.[0]?.total || 0) > 0;
  if (exists) return;

  await connection.query(
    `ALTER TABLE sinh_vien
     ADD COLUMN dot_thuc_tap_admin ENUM('dot-1', 'dot-2') NULL DEFAULT NULL`
  );
}

async function getStudentNotificationContext(studentId) {
  const rows = await connection.query(
    `SELECT id, account_id, ma_sinh_vien, ho_ten, giang_vien_huong_dan, dot_thuc_tap_admin
     FROM sinh_vien
     WHERE id = ?
     LIMIT 1`,
    [studentId]
  );

  return rows?.[0] || null;
}

async function getLecturerNotificationContextByName(lecturerName) {
  const normalizedName = String(lecturerName || '').trim();
  if (!normalizedName) return null;

  const rows = await connection.query(
    `SELECT id, account_id, ho_ten, so_dien_thoai, email_ca_nhan
     FROM giang_vien
     WHERE LOWER(TRIM(ho_ten)) = LOWER(TRIM(?))
     LIMIT 1`,
    [normalizedName]
  );

  return rows?.[0] || null;
}

function buildLecturerContactText(lecturer) {
  const phone = String(lecturer?.so_dien_thoai || '').trim();
  const email = String(lecturer?.email_ca_nhan || '').trim();

  if (!phone && !email) return '';

  const parts = [];
  if (phone) parts.push(`SĐT: ${phone}`);
  if (email) parts.push(`Email: ${email}`);

  return ` (${parts.join(' | ')})`;
}

async function notifyLecturerAssignment({ studentId, lecturerName }) {
  try {
    await ensureNotificationsTable();

    const student = await getStudentNotificationContext(studentId);
    if (!student) return;

    const studentName = String(student.ho_ten || 'Sinh viên').trim();
    const studentCode = String(student.ma_sinh_vien || '').trim();

    const lecturer = await getLecturerNotificationContextByName(lecturerName);
    const lecturerContactText = buildLecturerContactText(lecturer);

    if (student.account_id) {
      await createNotification(
        student.account_id,
        'Đã phân công giảng viên hướng dẫn',
        `Bạn đã được phân công giảng viên hướng dẫn: ${lecturerName}${lecturerContactText}.`,
        'success',
        'assignment'
      );
    }

    if (lecturer?.account_id) {
      await createNotification(
        lecturer.account_id,
        'Có sinh viên mới được phân công',
        `Bạn được phân công hướng dẫn ${studentName}${studentCode ? ` (${studentCode})` : ''}.`,
        'info',
        'assignment'
      );
    }
  } catch (error) {
    console.error('[assign-lecturer] Lỗi gửi thông báo:', error);
  }
}

async function notifyBatchAssignment({ studentId, dot }) {
  try {
    await ensureNotificationsTable();

    const student = await getStudentNotificationContext(studentId);
    if (!student || !student.account_id) return;

    const dotLabel = dot === 'dot-1' ? 'Đợt 1' : 'Đợt 2';

    await createNotification(
      student.account_id,
      'Đã phân công đợt thực tập',
      `Bạn đã được phân công thực tập trong ${dotLabel}.`,
      'success',
      'assignment'
    );
  } catch (error) {
    console.error('[assign-batch] Lỗi gửi thông báo:', error);
  }
}

async function syncStudentToCurrentBatch(userId, specificBatchId = null) {
  // Ensure participant table exists in environments where setup script was not run.
  await connection.query(`
    CREATE TABLE IF NOT EXISTS sinh_vien_thuc_tap (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ma_sinh_vien VARCHAR(20) NOT NULL,
      dot_thuc_tap_id INT NOT NULL,
      ngay_dang_ky TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      trang_thai ENUM('dang-ky', 'duoc-phan-cong', 'hoan-thanh', 'huy') DEFAULT 'dang-ky',
      INDEX idx_ma_sinh_vien (ma_sinh_vien),
      INDEX idx_dot_thuc_tap (dot_thuc_tap_id),
      UNIQUE KEY unique_sinh_vien_dot (ma_sinh_vien, dot_thuc_tap_id),
      FOREIGN KEY (dot_thuc_tap_id) REFERENCES dot_thuc_tap(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const student = await SinhVien.getByUserId(userId);
  if (!student || !student.ma_sinh_vien) {
    return;
  }

  let batchId = specificBatchId ? Number(specificBatchId) : null;

  if (!batchId) {
    const [activeBatch] = await connection.query(
      `SELECT id
       FROM dot_thuc_tap
       WHERE DATE(NOW()) BETWEEN DATE(COALESCE(thoi_gian_dang_ky_tu, thoi_gian_bat_dau))
                            AND DATE(COALESCE(thoi_gian_dang_ky_den, thoi_gian_ket_thuc))
       ORDER BY created_at DESC
       LIMIT 1`
    );
    if (!activeBatch) return;
    batchId = activeBatch.id;
  }

  await connection.query(
    `INSERT IGNORE INTO sinh_vien_thuc_tap (ma_sinh_vien, dot_thuc_tap_id, trang_thai)
     VALUES (?, ?, 'dang-ky')`,
    [student.ma_sinh_vien, batchId]
  );

  const [countRow] = await connection.query(
    'SELECT COUNT(*) AS count FROM sinh_vien_thuc_tap WHERE dot_thuc_tap_id = ?',
    [batchId]
  );

  await connection.query(
    'UPDATE dot_thuc_tap SET so_sinh_vien_tham_gia = ? WHERE id = ?',
    [Number(countRow?.count || 0), batchId]
  );
}

async function resolveStudentFromAuthUser(authUser) {
  const candidates = [
    authUser?.userId,
    authUser?.user_id,
    authUser?.maSinhVien,
    authUser?.ma_sinh_vien
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const student = await SinhVien.getByUserId(candidate);
    if (student) {
      return { student, resolvedUserId: candidate };
    }
  }

  if (authUser?.maSinhVien) {
    const byStudentCode = await SinhVien.findByMaSinhVien(authUser.maSinhVien);
    if (byStudentCode) {
      return {
        student: byStudentCode,
        resolvedUserId: String(authUser.maSinhVien).trim()
      };
    }
  }

  return { student: null, resolvedUserId: '' };
}

async function syncStudentToAdminApprovalQueue(userId, payload) {
  try {
    const student = await SinhVien.getByUserId(userId);
    if (!student || !student.id) return;

    const desiredCompany = String(payload?.don_vi_thuc_tap || payload?.cong_ty_tu_lien_he || '').trim();

    // Queue item for admin approval workflow table if available.
    try {
      const existingWorkflowRows = await connection.query(
        'SELECT id FROM dang_ky_thuc_tap_sinh_vien WHERE sinh_vien_id = ? ORDER BY id DESC LIMIT 1',
        [student.id]
      );

      const rawPreference = String(payload?.nguyen_vong_thuc_tap || '').trim().toLowerCase();
      const workflowPreference = rawPreference === 'tu_lien_he' || rawPreference === 'tu-lien-he'
        ? 'tu-lien-he'
        : rawPreference
          ? 'khoa-gioi-thieu'
          : null;

      const workflowData = [
        workflowPreference,
        payload?.vi_tri_muon_ung_tuyen_thuc_tap || null,
        payload?.cong_ty_tu_lien_he || payload?.don_vi_thuc_tap || null,
        payload?.dia_chi_cong_ty || null,
        payload?.nguoi_lien_he_cong_ty || null,
        payload?.sdt_nguoi_lien_he || null,
        payload?.nguyen_vong_thuc_tap === 'tu_lien_he'
          ? 'Sinh vien tu lien he doanh nghiep'
          : 'Sinh vien dang ky cho khoa gioi thieu',
        'cho-duyet',
        'CHO_DUYET'
      ];

      const upsertWorkflowRow = async (includeWorkflowStatus = true) => {
        if (existingWorkflowRows && existingWorkflowRows.length > 0) {
          if (includeWorkflowStatus) {
            await connection.query(
              `UPDATE dang_ky_thuc_tap_sinh_vien
               SET nguyen_vong_thuc_tap = ?,
                   vi_tri_thuc_tap_mong_muon = ?,
                   ten_cong_ty = ?,
                   dia_chi_cong_ty = ?,
                   nguoi_lien_he = ?,
                   so_dien_thoai_lien_he = ?,
                   ghi_chu = ?,
                   trang_thai = ?,
                   workflow_status = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
              [...workflowData, existingWorkflowRows[0].id]
            );
            return;
          }

          await connection.query(
            `UPDATE dang_ky_thuc_tap_sinh_vien
             SET nguyen_vong_thuc_tap = ?,
                 vi_tri_thuc_tap_mong_muon = ?,
                 ten_cong_ty = ?,
                 dia_chi_cong_ty = ?,
                 nguoi_lien_he = ?,
                 so_dien_thoai_lien_he = ?,
                 ghi_chu = ?,
                 trang_thai = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [...workflowData.slice(0, 8), existingWorkflowRows[0].id]
          );
          return;
        }

        if (includeWorkflowStatus) {
          await connection.query(
            `INSERT INTO dang_ky_thuc_tap_sinh_vien
               (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
                dia_chi_cong_ty, nguoi_lien_he, so_dien_thoai_lien_he, ghi_chu, trang_thai, workflow_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [student.id, ...workflowData]
          );
          return;
        }

        await connection.query(
          `INSERT INTO dang_ky_thuc_tap_sinh_vien
             (sinh_vien_id, nguyen_vong_thuc_tap, vi_tri_thuc_tap_mong_muon, ten_cong_ty,
              dia_chi_cong_ty, nguoi_lien_he, so_dien_thoai_lien_he, ghi_chu, trang_thai)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [student.id, ...workflowData.slice(0, 8)]
        );
      };

      try {
        await upsertWorkflowRow(true);
      } catch (workflowColumnError) {
        if (workflowColumnError?.code !== 'ER_BAD_FIELD_ERROR' && workflowColumnError?.errno !== 1054) {
          throw workflowColumnError;
        }
        await upsertWorkflowRow(false);
      }
    } catch (workflowQueueError) {
      if (workflowQueueError?.code === 'ER_NO_SUCH_TABLE' || workflowQueueError?.errno === 1146) {
        console.warn('Warning: dang_ky_thuc_tap_sinh_vien table not found, continue sync with legacy queue table');
      } else {
        throw workflowQueueError;
      }
    }

    // Sync to admin overview table if there is a matching approved company registration.
    if (desiredCompany) {
      const matchedCompanyRegistration = await connection.query(
        `SELECT dkdn.id
         FROM dang_ky_doanh_nghiep dkdn
         INNER JOIN doanh_nghiep dn ON dn.id = dkdn.doanh_nghiep_id
         WHERE dkdn.trang_thai = 'da-duyet'
           AND LOWER(TRIM(dn.ten_cong_ty)) = LOWER(TRIM(?))
         ORDER BY dkdn.ngay_dang_ky DESC
         LIMIT 1`,
        [desiredCompany]
      );

      if (matchedCompanyRegistration && matchedCompanyRegistration.length > 0) {
        const dangKyDoanhNghiepId = matchedCompanyRegistration[0].id;
        const existingAdminRows = await connection.query(
          'SELECT id FROM dang_ky_sinh_vien WHERE sinh_vien_id = ? AND dang_ky_doanh_nghiep_id = ? LIMIT 1',
          [student.id, dangKyDoanhNghiepId]
        );

        const queueNote = `Tu dong tao tu dang ky sinh vien (${payload?.vi_tri_muon_ung_tuyen_thuc_tap || 'khong ro vi tri'})`;

        if (existingAdminRows && existingAdminRows.length > 0) {
          await connection.query(
            `UPDATE dang_ky_sinh_vien
             SET trang_thai = 'cho-duyet',
                 ly_do_tu_choi = NULL,
                 ghi_chu = ?,
                 ngay_dang_ky = NOW()
             WHERE id = ?`,
            [queueNote, existingAdminRows[0].id]
          );
        } else {
          await connection.query(
            `INSERT INTO dang_ky_sinh_vien
               (sinh_vien_id, dang_ky_doanh_nghiep_id, ghi_chu, trang_thai)
             VALUES (?, ?, ?, 'cho-duyet')`,
            [student.id, dangKyDoanhNghiepId, queueNote]
          );
        }
      }
    }
  } catch (error) {
    // Do not block student registration if admin queue sync fails.
    console.warn('Warning: failed to sync student registration to admin approval queue:', error.message || error);
  }
}

// GET /api/sinh-vien - Lấy danh sách sinh viên với phân trang
router.get('/', authenticateToken, async (req, res) => {
  try {
    let { page = 1, limit = 10, search = '', nguyen_vong = '', approved_only = '', trang_thai = '' } = req.query;

    const approvedOnly = ['1', 'true', 'yes', 'y'].includes(String(approved_only || '').toLowerCase().trim());
    const trangThaiFilter = String(trang_thai || '').toLowerCase().trim();

    // Normalize possible display strings to stored codes to make filter robust
    if (typeof nguyen_vong === 'string' && nguyen_vong) {
      const nv = nguyen_vong.toLowerCase().trim();
      if (nv === 'khoa giới thiệu' || nv === 'khoa-gioi-thieu' || nv === 'khoa_gioi_thieu') {
        nguyen_vong = 'khoa_gioi_thieu';
      } else if (nv === 'tự liên hệ' || nv === 'tu-lien-he' || nv === 'tu_lien_he') {
        nguyen_vong = 'tu_lien_he';
      }
    }

    // Recalculate assignment status for students before returning list (lightweight, idempotent)
    try {
      await SinhVien.recalcAssignmentStatus();
    } catch (err) {
      console.warn('Warning: failed to recalc assignment status:', err.message || err);
    }

    const result = await SinhVien.getAllWithPagination(
      parseInt(page),
      parseInt(limit),
      search,
      nguyen_vong,
      approvedOnly,
      trangThaiFilter
    );

    res.json({
      success: true,
      message: 'Lấy danh sách sinh viên thành công',
      data: {
        students: result.data || [],
        pagination: result.pagination || {
          current: parseInt(page),
          pageSize: parseInt(limit),
          total: 0,
          totalPages: 0
        }
      }
    });
  } catch (error) {
    console.error('Error in GET /api/sinh-vien:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy danh sách sinh viên'
    });
  }
});

// GET /api/sinh-vien/stats - Thống kê sinh viên
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await SinhVien.getStatistics();
    res.json({
      success: true,
      message: 'Lấy thống kê sinh viên thành công',
      data: stats
    });
  } catch (error) {
    console.error('Error in GET /api/sinh-vien/stats:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thống kê sinh viên'
    });
  }
});

// POST /api/sinh-vien - Tạo sinh viên mới (admin)
router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const maSinhVien = String(req.body?.ma_sinh_vien || req.body?.maSinhVien || '').trim();
    const hoTen = String(req.body?.ho_ten || req.body?.hoTen || '').trim();
    const emailInput = String(req.body?.email_ca_nhan || req.body?.email || '').trim();

    if (!maSinhVien) {
      return res.status(400).json({
        success: false,
        message: 'Mã sinh viên là bắt buộc'
      });
    }

    if (!hoTen) {
      return res.status(400).json({
        success: false,
        message: 'Họ tên sinh viên là bắt buộc'
      });
    }

    const existed = await SinhVien.findByMaSinhVien(maSinhVien);
    if (existed) {
      return res.status(409).json({
        success: false,
        message: 'Mã sinh viên đã tồn tại'
      });
    }

    // account_id is required in sinh_vien table, so ensure linked account exists.
    let accountId;
    const existingAccountRows = await connection.query(
      'SELECT id FROM accounts WHERE user_id = ? LIMIT 1',
      [maSinhVien]
    );

    if (existingAccountRows && existingAccountRows.length > 0) {
      accountId = Number(existingAccountRows[0].id);
    } else {
      const accountEmail = emailInput || `${maSinhVien}@student.dainam.local`;
      const accountResult = await Account.create({
        userId: maSinhVien,
        email: accountEmail,
        password: '123456',
        role: 'sinh-vien'
      });
      accountId = Number(accountResult.insertId);
    }

    const toOptionalNumber = (value) => {
      if (value === undefined || value === null || value === '') return undefined;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const dotValue = String(req.body?.dot_thuc_tap_admin || '').trim().toLowerCase();
    if (dotValue === 'dot-1' || dotValue === 'dot-2') {
      await ensureDotColumnExists();
    }

    const createResult = await SinhVien.create({
      accountId,
      maSinhVien,
      hoTen,
      lop: String(req.body?.lop || '').trim(),
      khoa: String(req.body?.khoa || '').trim(),
      nganh: String(req.body?.nganh || '').trim(),
      emailCaNhan: emailInput,
      soDienThoai: String(req.body?.so_dien_thoai || req.body?.soDienThoai || '').trim(),
      ngaySinh: String(req.body?.ngay_sinh || '').trim(),
      gioiTinh: req.body?.gioi_tinh,
      soTCTichLuy: toOptionalNumber(req.body?.so_tc_tich_luy),
      soTCHT: toOptionalNumber(req.body?.so_tc_ht),
      namThu: toOptionalNumber(req.body?.nam_thu),
      hpNo: toOptionalNumber(req.body?.hp_no),
      gpa: toOptionalNumber(req.body?.gpa),
      viTriMuonUngTuyenThucTap: String(req.body?.vi_tri_muon_ung_tuyen_thuc_tap || '').trim(),
      giangVienHuongDan: String(req.body?.giang_vien_huong_dan || '').trim(),
      nguyenVongThucTap: String(req.body?.nguyen_vong_thuc_tap || '').trim(),
      donViThucTap: String(req.body?.don_vi_thuc_tap || '').trim(),
      dotThucTapAdmin: dotValue === 'dot-1' || dotValue === 'dot-2' ? dotValue : undefined
    });

    const createdRows = await connection.query(
      'SELECT * FROM sinh_vien WHERE id = ? LIMIT 1',
      [createResult.insertId]
    );

    return res.status(201).json({
      success: true,
      message: 'Tạo sinh viên thành công',
      data: createdRows?.[0] || { id: createResult.insertId, ma_sinh_vien: maSinhVien, ho_ten: hoTen }
    });
  } catch (error) {
    console.error('Error in POST /api/sinh-vien:', error);

    if (error?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Mã sinh viên hoặc email đã tồn tại trong hệ thống'
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi tạo sinh viên'
    });
  }
});

// IMPORTANT: Place specific routes BEFORE dynamic parameter routes to avoid conflicts

// GET /api/sinh-vien/available-batches - Danh sách đợt thực tập có thể chọn
router.get('/available-batches', authenticateToken, async (req, res) => {
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS sinh_vien_thuc_tap (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ma_sinh_vien VARCHAR(20) NOT NULL,
        dot_thuc_tap_id INT NOT NULL,
        ngay_dang_ky TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        trang_thai ENUM('dang-ky', 'duoc-phan-cong', 'hoan-thanh', 'huy') DEFAULT 'dang-ky',
        INDEX idx_ma_sinh_vien (ma_sinh_vien),
        INDEX idx_dot_thuc_tap (dot_thuc_tap_id),
        UNIQUE KEY unique_sinh_vien_dot (ma_sinh_vien, dot_thuc_tap_id),
        FOREIGN KEY (dot_thuc_tap_id) REFERENCES dot_thuc_tap(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const { student } = await resolveStudentFromAuthUser(req.user || {});
    const maSinhVien = student?.ma_sinh_vien || null;

    const now = new Date();
    const batches = await connection.query(`
      SELECT
        dt.id, dt.ten_dot, dt.mo_ta, dt.trang_thai,
        dt.thoi_gian_bat_dau, dt.thoi_gian_ket_thuc,
        dt.thoi_gian_dang_ky_tu, dt.thoi_gian_dang_ky_den,
        dt.so_sinh_vien_tham_gia,
        (SELECT COUNT(*) FROM sinh_vien_thuc_tap svt WHERE svt.dot_thuc_tap_id = dt.id) AS registered_count
      FROM dot_thuc_tap dt
      WHERE dt.trang_thai != 'ket-thuc'
        AND dt.thoi_gian_dang_ky_tu IS NOT NULL
        AND dt.thoi_gian_dang_ky_den IS NOT NULL
      ORDER BY dt.thoi_gian_dang_ky_tu ASC
    `);

    let selectedBatchId = null;
    let selectedBatchIds = [];
    if (maSinhVien) {
      const rows = await connection.query(
        'SELECT dot_thuc_tap_id FROM sinh_vien_thuc_tap WHERE ma_sinh_vien = ?',
        [maSinhVien]
      );
      selectedBatchIds = (rows || []).map(r => r.dot_thuc_tap_id);
      if (selectedBatchIds.length > 0) selectedBatchId = selectedBatchIds[selectedBatchIds.length - 1];
    }

    const result = batches.map(b => {
      const regStart = b.thoi_gian_dang_ky_tu ? new Date(b.thoi_gian_dang_ky_tu) : null;
      const regEnd = b.thoi_gian_dang_ky_den ? new Date(b.thoi_gian_dang_ky_den) : null;
      if (regStart) regStart.setHours(0, 0, 0, 0);
      if (regEnd) regEnd.setHours(23, 59, 59, 999);
      const can_select = !!(regStart && regEnd && now >= regStart && now <= regEnd);
      return {
        ...b,
        registered_count: Number(b.registered_count || 0),
        is_selected: selectedBatchIds.includes(b.id),
        can_select
      };
    });

    res.json({ success: true, data: { batches: result, selectedBatchId } });
  } catch (error) {
    console.error('Error in GET /api/sinh-vien/available-batches:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi tải danh sách đợt thực tập' });
  }
});

// POST /api/sinh-vien/select-batch - Sinh viên chọn đợt thực tập
router.post('/select-batch', authenticateToken, async (req, res) => {
  try {
    const { dot_thuc_tap_id } = req.body;
    if (!dot_thuc_tap_id) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn đợt thực tập' });
    }

    const batchId = Number(dot_thuc_tap_id);
    const [batch] = await connection.query(
      'SELECT id, ten_dot, thoi_gian_dang_ky_tu, thoi_gian_dang_ky_den, trang_thai FROM dot_thuc_tap WHERE id = ?',
      [batchId]
    );
    if (!batch) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đợt thực tập' });
    }

    const now = new Date();
    const regStart = batch.thoi_gian_dang_ky_tu ? new Date(batch.thoi_gian_dang_ky_tu) : null;
    const regEnd = batch.thoi_gian_dang_ky_den ? new Date(batch.thoi_gian_dang_ky_den) : null;
    if (regStart) regStart.setHours(0, 0, 0, 0);
    if (regEnd) regEnd.setHours(23, 59, 59, 999);
    if (!regStart || !regEnd || now < regStart || now > regEnd) {
      return res.status(403).json({
        success: false,
        message: `Đợt "${batch.ten_dot}" hiện không trong thời gian đăng ký`
      });
    }

    const { student } = await resolveStudentFromAuthUser(req.user || {});
    if (!student || !student.ma_sinh_vien) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin sinh viên' });
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS sinh_vien_thuc_tap (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ma_sinh_vien VARCHAR(20) NOT NULL,
        dot_thuc_tap_id INT NOT NULL,
        ngay_dang_ky TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        trang_thai ENUM('dang-ky', 'duoc-phan-cong', 'hoan-thanh', 'huy') DEFAULT 'dang-ky',
        INDEX idx_ma_sinh_vien (ma_sinh_vien),
        INDEX idx_dot_thuc_tap (dot_thuc_tap_id),
        UNIQUE KEY unique_sinh_vien_dot (ma_sinh_vien, dot_thuc_tap_id),
        FOREIGN KEY (dot_thuc_tap_id) REFERENCES dot_thuc_tap(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await connection.query(
      `INSERT INTO sinh_vien_thuc_tap (ma_sinh_vien, dot_thuc_tap_id, trang_thai)
       VALUES (?, ?, 'dang-ky')
       ON DUPLICATE KEY UPDATE ngay_dang_ky = NOW()`,
      [student.ma_sinh_vien, batchId]
    );

    const [countRow] = await connection.query(
      'SELECT COUNT(*) AS count FROM sinh_vien_thuc_tap WHERE dot_thuc_tap_id = ?',
      [batchId]
    );
    await connection.query(
      'UPDATE dot_thuc_tap SET so_sinh_vien_tham_gia = ? WHERE id = ?',
      [Number(countRow?.count || 0), batchId]
    );

    res.json({ success: true, message: `Đã chọn đợt thực tập "${batch.ten_dot}" thành công` });
  } catch (error) {
    console.error('Error in POST /api/sinh-vien/select-batch:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi chọn đợt thực tập' });
  }
});

// POST /api/sinh-vien/register-internship - Student registers for internship
router.post('/register-internship', authenticateToken, upload.single('cv_file'), async (req, res) => {
  try {
    const { dot_thuc_tap_id } = req.body;
    const selectedBatchId = dot_thuc_tap_id ? Number(dot_thuc_tap_id) : null;

    if (selectedBatchId) {
      // Validate that the selected batch has an open registration period
      const [selectedBatch] = await connection.query(
        'SELECT id, ten_dot, trang_thai, thoi_gian_dang_ky_tu, thoi_gian_dang_ky_den FROM dot_thuc_tap WHERE id = ?',
        [selectedBatchId]
      );
      if (!selectedBatch) {
        return res.status(400).json({ success: false, message: 'Đợt thực tập không tồn tại' });
      }
      if (selectedBatch.thoi_gian_dang_ky_tu && selectedBatch.thoi_gian_dang_ky_den) {
        const now = new Date();
        const regStart = new Date(selectedBatch.thoi_gian_dang_ky_tu);
        regStart.setHours(0, 0, 0, 0);
        const regEnd = new Date(selectedBatch.thoi_gian_dang_ky_den);
        regEnd.setHours(23, 59, 59, 999);
        if (now < regStart || now > regEnd) {
          return res.status(403).json({
            success: false,
            message: `Đợt "${selectedBatch.ten_dot}" hiện không trong thời gian đăng ký`
          });
        }
      }
    } else {
      const batchStatus = await RegistrationController.getStatusFromInternshipBatch();
      if (batchStatus) {
        if (!batchStatus.is_open) {
          return res.status(403).json({
            success: false,
            message: batchStatus.message || 'Ngoài thời gian cho phép chỉnh sửa nguyện vọng thực tập',
            data: {
              status: batchStatus.status,
              period: batchStatus.period || null,
              timeUntilStart: batchStatus.timeUntilStart || null,
              timeUntilEnd: batchStatus.timeUntilEnd || null
            }
          });
        }
      } else {
        const isOpen = await RegistrationPeriod.isRegistrationOpen();
        if (!isOpen) {
          const status = await RegistrationPeriod.getRegistrationStatus();
          return res.status(403).json({
            success: false,
            message: status?.message || 'Ngoài thời gian cho phép chỉnh sửa nguyện vọng thực tập',
            data: {
              status: status?.status || 'closed',
              period: status?.period || null,
              timeUntilStart: status?.timeUntilStart || null,
              timeUntilEnd: status?.timeUntilEnd || null
            }
          });
        }
      }
    }

    const { student, resolvedUserId } = await resolveStudentFromAuthUser(req.user || {});
    const {
      nguyen_vong_thuc_tap,
      vi_tri_muon_ung_tuyen_thuc_tap,
      so_dien_thoai,
      email_ca_nhan,
      dia_chi,
      don_vi_thuc_tap,
      cong_ty_tu_lien_he,
      dia_chi_cong_ty,
      nguoi_lien_he_cong_ty,
      sdt_nguoi_lien_he
    } = req.body;

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin sinh viên'
      });
    }

    const eligibility = evaluateInternshipEligibility(student);
    if (!eligibility.eligible) {
      return res.status(400).json({
        success: false,
        message: 'Bạn không đủ điều kiện đăng kí thực tập',
        data: {
          major: eligibility.majorKey,
          accumulatedCredits: eligibility.accumulatedCredits,
          minCredits: eligibility.minCredits,
          totalCredits: eligibility.totalCredits,
          requiredPercent: Math.round(eligibility.ratioRequired * 100)
        }
      });
    }

    // Validate required fields
    if (!nguyen_vong_thuc_tap || !vi_tri_muon_ung_tuyen_thuc_tap) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng điền đầy đủ thông tin nguyện vọng thực tập và vị trí mong muốn'
      });
    }

    // If student chooses 'tu_lien_he', validate company info
    if (nguyen_vong_thuc_tap === 'tu_lien_he') {
      if (!cong_ty_tu_lien_he || !dia_chi_cong_ty || !nguoi_lien_he_cong_ty || !sdt_nguoi_lien_he) {
        return res.status(400).json({
          success: false,
          message: 'Khi chọn tự liên hệ, vui lòng điền đầy đủ thông tin công ty'
        });
      }
    }

    // Update student record
    const payload = {
      nguyen_vong_thuc_tap,
      vi_tri_muon_ung_tuyen_thuc_tap,
      so_dien_thoai: typeof so_dien_thoai === 'string' ? so_dien_thoai.trim() : so_dien_thoai,
      email_ca_nhan: typeof email_ca_nhan === 'string' && email_ca_nhan.trim() ? email_ca_nhan.trim() : undefined,
      dia_chi: typeof dia_chi === 'string' ? dia_chi.trim() : dia_chi,
      don_vi_thuc_tap: nguyen_vong_thuc_tap === 'tu_lien_he' ? cong_ty_tu_lien_he : don_vi_thuc_tap,
      cong_ty_tu_lien_he: nguyen_vong_thuc_tap === 'tu_lien_he' ? cong_ty_tu_lien_he : null,
      dia_chi_cong_ty: nguyen_vong_thuc_tap === 'tu_lien_he' ? dia_chi_cong_ty : null,
      nguoi_lien_he_cong_ty: nguyen_vong_thuc_tap === 'tu_lien_he' ? nguoi_lien_he_cong_ty : null,
      sdt_nguoi_lien_he: nguyen_vong_thuc_tap === 'tu_lien_he' ? sdt_nguoi_lien_he : null
    };

    if (req.file) {
      try {
        await validateUploadedCvOwnershipOrThrow(req.file, student);
      } catch (cvValidationError) {
        if (req.file?.path && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }

        if (cvValidationError?.code === 'CV_OWNER_MISMATCH') {
          return res.status(400).json({
            success: false,
            message: 'CV không phải của bạn. Vui lòng tải đúng CV có họ tên hoặc mã sinh viên của bạn.'
          });
        }

        const isAnalyzerConnectionError = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(cvValidationError?.code);
        if (isAnalyzerConnectionError) {
          return res.status(503).json({
            success: false,
            message: 'Không kết nối được dịch vụ xác minh CV. Vui lòng thử lại sau.',
            data: { analyzerUrl: CV_ANALYZER_URL }
          });
        }

        return res.status(422).json({
          success: false,
          message: cvValidationError?.message || 'Không thể xác minh CV tải lên'
        });
      }

      payload.cv_path = `/uploads/cv/${req.file.filename}`;
    }

    const userKeyForUpdate = resolvedUserId || String(student.ma_sinh_vien || '').trim();
    const result = await SinhVien.updateInternshipRegistration(userKeyForUpdate, payload);
    if (!result || result.success === false) {
      return res.status(400).json({
        success: false,
        message: result?.message || 'Không thể lưu đăng ký thực tập'
      });
    }

    try {
      await syncStudentToCurrentBatch(userKeyForUpdate, selectedBatchId);
    } catch (syncError) {
      console.warn('Warning: failed to sync student registration to internship batch:', syncError.message || syncError);
    }

    await syncStudentToAdminApprovalQueue(userKeyForUpdate, payload);

    // Gửi thông báo in-app cho sinh viên
    try {
      await ensureNotificationsTable();
      const accountId = student.account_id;
      if (accountId) {
        const viTri = String(vi_tri_muon_ung_tuyen_thuc_tap || '').trim();
        const congTy = nguyen_vong_thuc_tap === 'tu_lien_he'
          ? (cong_ty_tu_lien_he ? String(cong_ty_tu_lien_he).trim() : null)
          : null;
        await createNotification(
          accountId,
          'Đăng ký thực tập thành công ✅',
          `Bạn đã đăng ký thực tập thành công${congTy ? ` tại ${congTy}` : ''} – vị trí: ${viTri}. Hồ sơ đang chờ admin xét duyệt. Chúng tôi sẽ thông báo kết quả sớm nhất.`,
          'info',
          'registration_submitted'
        );
      }
    } catch (notifErr) {
      console.error('[register-internship] Lỗi gửi thông báo sinh viên:', notifErr);
    }

    // If result contains updated student data, return it
    res.json({
      success: true,
      message: 'Đăng ký thực tập thành công và đã gửi đến danh sách chờ admin duyệt',
      data: result.data || result
    });
  } catch (error) {
    console.error('Error in POST /api/sinh-vien/register-internship:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi đăng ký thực tập'
    });
  }
});

// GET /api/sinh-vien/test - Test endpoint without auth
router.get('/test', async (req, res) => {
  res.json({
    success: true,
    message: 'Test endpoint hoạt động',
    data: { timestamp: new Date() }
  });
});

// GET /api/sinh-vien/my-registration - Get current student's registration info
router.get('/my-registration', authenticateToken, async (req, res) => {
  try {
    const { student, resolvedUserId } = await resolveStudentFromAuthUser(req.user || {});
    const userId = resolvedUserId;
    console.log('[SinhVien/my-registration v2] User ID from token:', userId);
    
    if (!userId && !student) {
      return res.status(401).json({
        success: false,
        message: 'User ID không tìm thấy trong token'
      });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin sinh viên'
      });
    }

    res.json({
      success: true,
      message: 'Lấy thông tin đăng ký thành công',
      data: student
    });
  } catch (error) {
    console.error('Error in GET /api/sinh-vien/my-registration:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thông tin đăng ký'
    });
  }
});

// POST /api/sinh-vien/upload-cv - Upload/replace student's CV
router.post('/upload-cv', authenticateToken, upload.single('cv_file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file PDF để tải lên' });
    }

    const { student, resolvedUserId } = await resolveStudentFromAuthUser(req.user || {});
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin sinh viên' });
    }

    try {
      await validateUploadedCvOwnershipOrThrow(req.file, student);
    } catch (cvValidationError) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      if (cvValidationError?.code === 'CV_OWNER_MISMATCH') {
        return res.status(400).json({
          success: false,
          message: 'CV không phải của bạn. Vui lòng tải đúng CV có họ tên hoặc mã sinh viên của bạn.'
        });
      }

      const isAnalyzerConnectionError = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(cvValidationError?.code);
      if (isAnalyzerConnectionError) {
        return res.status(503).json({
          success: false,
          message: 'Không kết nối được dịch vụ xác minh CV. Vui lòng thử lại sau.',
          data: { analyzerUrl: CV_ANALYZER_URL }
        });
      }

      return res.status(422).json({
        success: false,
        message: cvValidationError?.message || 'Không thể xác minh CV tải lên'
      });
    }

    const cvPath = `/uploads/cv/${req.file.filename}`;
    await SinhVien.updateInternshipRegistration(resolvedUserId || student.ma_sinh_vien, { cv_path: cvPath });

    return res.json({
      success: true,
      message: 'Tải CV lên thành công',
      data: { cv_path: cvPath }
    });
  } catch (error) {
    console.error('upload-cv error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server khi tải CV' });
  }
});

// DELETE /api/sinh-vien/cv/remove - Delete student's current CV
// Uses two-segment path (/cv/remove) to avoid being intercepted by /:id route
router.delete('/cv/remove', authenticateToken, async (req, res) => {
  try {
    const { student, resolvedUserId } = await resolveStudentFromAuthUser(req.user || {});
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin sinh viên' });
    }

    const currentCvPath = String(student.cv_path || '').trim();
    if (!currentCvPath) {
      return res.status(400).json({ success: false, message: 'Bạn chưa có CV để xóa' });
    }

    const absoluteCvPath = toAbsoluteCvPath(currentCvPath);
    if (absoluteCvPath && fs.existsSync(absoluteCvPath)) {
      fs.unlinkSync(absoluteCvPath);
    }

    await SinhVien.updateInternshipRegistration(resolvedUserId || student.ma_sinh_vien, { cv_path: null });

    return res.json({
      success: true,
      message: 'Đã xóa CV thành công',
      data: { cv_path: null }
    });
  } catch (error) {
    console.error('delete-cv error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Lỗi server khi xóa CV' });
  }
});

// POST /api/sinh-vien/analyze-cv - Analyze current student's uploaded CV via Python service
router.post('/analyze-cv', authenticateToken, async (req, res) => {
  try {
    const { student, resolvedUserId } = await resolveStudentFromAuthUser(req.user || {});
    if (!resolvedUserId && !student) {
      return res.status(401).json({
        success: false,
        message: 'Không xác định được người dùng từ token'
      });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy thông tin sinh viên'
      });
    }

    if (!student.cv_path) {
      return res.status(400).json({
        success: false,
        message: 'Bạn chưa tải CV lên hệ thống'
      });
    }

    const absoluteCvPath = toAbsoluteCvPath(student.cv_path);
    if (!absoluteCvPath) {
      return res.status(400).json({
        success: false,
        message: 'Đường dẫn CV không hợp lệ'
      });
    }

    if (!fs.existsSync(absoluteCvPath)) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy file CV trên máy chủ'
      });
    }

    const jobPositions = Array.isArray(req.body?.jobPositions) ? req.body.jobPositions : [];
    const analysisResult = await analyzeCvWithPython({
      absoluteCvPath,
      jobPositions
    });

    return res.json({
      success: true,
      message: 'Phân tích CV thành công',
      data: {
        cv_path: student.cv_path,
        analyzerUrl: CV_ANALYZER_URL,
        result: analysisResult
      }
    });
  } catch (error) {
    const isConnectionError = ['ECONNREFUSED', 'ECONNABORTED', 'ENOTFOUND'].includes(error?.code);

    if (isConnectionError) {
      return res.status(503).json({
        success: false,
        message: 'Không kết nối được dịch vụ phân tích CV Python. Vui lòng chạy service cv_analyzer trước.',
        data: {
          analyzerUrl: CV_ANALYZER_URL,
          detail: error.message
        }
      });
    }

    console.error('Error in POST /api/sinh-vien/analyze-cv:', error?.response?.data || error);
    return res.status(500).json({
      success: false,
      message: error?.response?.data?.error || error.message || 'Lỗi server khi phân tích CV'
    });
  }
});

// GET /api/sinh-vien/address-suggestions?q=...
router.get('/address-suggestions', authenticateToken, async (req, res) => {
  try {
    const rawQuery = String(req.query?.q || '').trim();
    if (rawQuery.length < 3) {
      return res.json({
        success: true,
        message: 'Query quá ngắn',
        data: []
      });
    }

    const nominatimResponse = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: rawQuery,
        format: 'jsonv2',
        addressdetails: 1,
        countrycodes: 'vn',
        limit: 8
      },
      headers: {
        'User-Agent': 'DNU-Internship-System/1.0 (address-autocomplete)'
      },
      timeout: 10000
    });

    const rows = Array.isArray(nominatimResponse.data) ? nominatimResponse.data : [];
    const suggestions = rows.map((item) => ({
      display_name: item.display_name || '',
      lat: item.lat || null,
      lon: item.lon || null
    }));

    return res.json({
      success: true,
      message: 'Lấy gợi ý địa chỉ thành công',
      data: suggestions
    });
  } catch (error) {
    console.error('Error in GET /api/sinh-vien/address-suggestions:', error?.message || error);
    return res.status(500).json({
      success: false,
      message: 'Không thể lấy gợi ý địa chỉ từ dịch vụ bản đồ',
      data: []
    });
  }
});

// PATCH /api/sinh-vien/:id/assign-lecturer - Assign lecturer for a specific student (manual or random)
router.patch('/:id/assign-lecturer', authenticateToken, async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID sinh viên không hợp lệ'
      });
    }

    const useRandom = req.body?.random === true;
    const lecturerNameInput = String(req.body?.lecturerName || '').trim();
    let lecturerName = '';

    if (useRandom) {
      const teachers = await connection.query(`
        SELECT ho_ten, hoc_vi, bang_cap
        FROM giang_vien
        WHERE COALESCE(TRIM(ho_ten), '') <> ''
      `);

      if (!teachers || teachers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Không có giảng viên để phân công'
        });
      }

      const teacherLoads = await connection.query(
        `SELECT LOWER(TRIM(giang_vien_huong_dan)) AS lecturer_name, COUNT(*) AS total
         FROM sinh_vien
         WHERE COALESCE(TRIM(giang_vien_huong_dan), '') <> ''
           AND id <> ?
         GROUP BY LOWER(TRIM(giang_vien_huong_dan))`,
        [studentId]
      );

      const loadMap = new Map(
        teacherLoads.map((row) => [String(row.lecturer_name || ''), Number(row.total || 0)])
      );

      const availableTeachers = teachers.filter((teacher) => {
        const key = String(teacher.ho_ten || '').trim().toLowerCase();
        const currentLoad = loadMap.get(key) || 0;
        return currentLoad < getLecturerCapacity(teacher);
      });

      if (availableTeachers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Tất cả giảng viên đã đủ số lượng sinh viên hướng dẫn'
        });
      }

      const pickedTeacher = availableTeachers[Math.floor(Math.random() * availableTeachers.length)];

      lecturerName = String(pickedTeacher.ho_ten || '').trim();
    } else {
      if (!lecturerNameInput) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn giảng viên'
        });
      }

      const rows = await connection.query(
        `SELECT ho_ten
         FROM giang_vien
         WHERE LOWER(TRIM(ho_ten)) = LOWER(TRIM(?))
         LIMIT 1`,
        [lecturerNameInput]
      );

      if (!rows || rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy giảng viên đã chọn'
        });
      }

      lecturerName = String(rows[0].ho_ten || '').trim();
    }

    const result = await connection.query(
      `UPDATE sinh_vien
       SET giang_vien_huong_dan = ?, updated_at = NOW()
       WHERE id = ?`,
      [lecturerName, studentId]
    );

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sinh viên cần cập nhật'
      });
    }

    await SinhVien.recalcAssignmentStatus();
    await notifyLecturerAssignment({ studentId, lecturerName });

    return res.json({
      success: true,
      message: 'Cập nhật giảng viên hướng dẫn thành công',
      data: {
        studentId,
        giang_vien_huong_dan: lecturerName,
        random: useRandom
      }
    });
  } catch (error) {
    console.error('Error in PATCH /api/sinh-vien/:id/assign-lecturer:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi gán giảng viên hướng dẫn'
    });
  }
});

// PATCH /api/sinh-vien/:id/assign-batch - Assign batch period for a student (dot-1 | dot-2)
router.patch('/:id/assign-batch', authenticateToken, async (req, res) => {
  try {
    if (!isAdminUser(req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    const studentId = Number(req.params.id);
    const dotInput = String(req.body?.dot || '').trim().toLowerCase();

    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'ID sinh viên không hợp lệ'
      });
    }

    if (!['dot-1', 'dot-2'].includes(dotInput)) {
      return res.status(400).json({
        success: false,
        message: 'Đợt không hợp lệ. Chỉ chấp nhận dot-1 hoặc dot-2'
      });
    }

    await ensureDotColumnExists();

    const result = await connection.query(
      `UPDATE sinh_vien
       SET dot_thuc_tap_admin = ?, updated_at = NOW()
       WHERE id = ?`,
      [dotInput, studentId]
    );

    if (!result || result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy sinh viên cần cập nhật'
      });
    }

    await notifyBatchAssignment({ studentId, dot: dotInput });

    return res.json({
      success: true,
      message: 'Cập nhật đợt thực tập thành công',
      data: {
        studentId,
        dot: dotInput
      }
    });
  } catch (error) {
    console.error('Error in PATCH /api/sinh-vien/:id/assign-batch:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi cập nhật đợt thực tập'
    });
  }
});

// Dynamic parameter routes come LAST
// GET /api/sinh-vien/:id - Lấy thông tin sinh viên theo ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await connection.query(
      `SELECT *
       FROM sinh_vien
       WHERE id = ? OR account_id = ?
       LIMIT 1`,
      [id, id]
    );

    if (rows && rows.length > 0) {
      res.json({
        success: true,
        message: 'Lấy thông tin sinh viên thành công',
        data: rows[0]
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy sinh viên'
      });
    }
  } catch (error) {
    console.error('Error in GET /api/sinh-vien/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi lấy thông tin sinh viên'
    });
  }
});

// PUT /api/sinh-vien/:id - Cập nhật thông tin sinh viên
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = [
      'ho_ten',
      'lop',
      'khoa',
      'nganh',
      'khoa_hoc',
      'ngay_sinh',
      'gioi_tinh',
      'dia_chi',
      'so_dien_thoai',
      'email_ca_nhan',
      'gpa',
      'tinh_trang_hoc_tap',
      'so_tc_tich_luy',
      'so_tc_ht',
      'nam_thu',
      'hp_no',
      'dot_thuc_tap_admin',
      'vi_tri_muon_ung_tuyen_thuc_tap',
      'giang_vien_huong_dan',
      'nguyen_vong_thuc_tap',
      'don_vi_thuc_tap'
    ];
    const fields = [];
    const values = [];

    for (const field of allowed) {
      if (req.body?.[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Không có dữ liệu để cập nhật'
      });
    }

    const result = await connection.query(
      `UPDATE sinh_vien
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = ? OR account_id = ?`,
      [...values, id, id]
    );

    if (result && result.affectedRows > 0) {
      res.json({
        success: true,
        message: 'Cập nhật sinh viên thành công'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy sinh viên'
      });
    }
  } catch (error) {
    console.error('Error in PUT /api/sinh-vien/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi cập nhật sinh viên'
    });
  }
});

// DELETE /api/sinh-vien/:id - Xóa sinh viên
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên' });
    }
    const result = await connection.query(
      `DELETE FROM sinh_vien
       WHERE id = ? OR account_id = ?`,
      [id, id]
    );

    if (result && result.affectedRows > 0) {
      res.json({
        success: true,
        message: 'Xóa sinh viên thành công'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Không tìm thấy sinh viên'
      });
    }
  } catch (error) {
    console.error('Error in DELETE /api/sinh-vien/:id:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server khi xóa sinh viên'
    });
  }
});

// (Duplicate routes removed below to avoid conflicts)

module.exports = router;