#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
validate_cv_upload.py
======================
Standalone CV upload validation script.
Được gọi bởi Node.js qua child_process (không cần Flask service).

Hỗ trợ: .pdf, .docx
So sánh: tên account + tên file + tên trích xuất từ nội dung CV

Usage:
    python validate_cv_upload.py <file_path> <student_name> <original_filename>

Output (JSON stdout):
    {
        "expected_name":  "Nguyễn Văn A",
        "extracted_name": "Phan Văn Đằng",
        "filename_match": true,
        "content_match":  false,
        "is_match":       false,
        "similarity":     0.12,
        "message":        "Tên ứng viên trong CV không khớp..."
    }
"""

import sys
import io
import os
import json
import logging

# ── Force UTF-8 stdout (Windows cp1252 không encode được tiếng Việt) ──────────
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── Paths ──────────────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_CV_ANALYZER_DIR      = os.path.normpath(os.path.join(_HERE, '..', 'backend', 'cv_analyzer'))
_CV_ANALYZER_SVC_DIR  = os.path.join(_CV_ANALYZER_DIR, 'services')

# python_project/ ở index 0 → "services" package trỏ vào python_project/services/
# cv_analyzer/services/ ở index 1 → import trực tiếp cv_processing (không qua services.)
sys.path.insert(0, _HERE)
sys.path.insert(1, _CV_ANALYZER_SVC_DIR)

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(name)s | %(message)s',
    stream=sys.stderr,   # log ra stderr, không lẫn với JSON stdout
)
logger = logging.getLogger('validate_cv_upload')

# ── Allowed file extensions ───────────────────────────────────────────────────
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.doc'}


# ==============================================================================
# Validation helpers
# ==============================================================================

def _validate_file(file_path: str) -> str | None:
    """Trả về thông báo lỗi nếu file không hợp lệ, None nếu OK."""
    if not file_path or not file_path.strip():
        return "Đường dẫn file trống"
    if not os.path.isfile(file_path):
        return f"File không tồn tại: {file_path}"
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"Định dạng không hỗ trợ '{ext}'. Chỉ chấp nhận: {', '.join(ALLOWED_EXTENSIONS)}"
    size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if size_mb > 20:
        return f"File quá lớn ({size_mb:.1f} MB). Tối đa 20 MB"
    return None


def _extract_text(file_path: str) -> str:
    """Trích xuất văn bản từ file CV (PDF / DOCX)."""
    from cv_processing import extract_raw_text
    text = extract_raw_text(file_path, max_pages=2)
    logger.info("Extracted %d characters from '%s'", len(text), os.path.basename(file_path))
    return text


# ==============================================================================
# Main validation
# ==============================================================================

def validate_cv_upload(file_path: str, student_name: str, original_filename: str = '') -> dict:
    """
    Full CV upload validation — delegates to cv_processing.validate_upload
    which has full-text exact match + job-title-filtered name extraction
    + token-based fallback.

    Returns:
        dict: expected_name, extracted_name, filename_match, content_match,
              is_match, similarity, message
    """
    from services.name_comparator import build_result
    from cv_processing import validate_upload

    logger.info("=== CV Upload Validation START ===")
    logger.info("file        : %s", os.path.basename(file_path))
    logger.info("student_name: %s", student_name)
    logger.info("filename    : %s", original_filename)

    # ── 1. Validate file ──────────────────────────────────────────────────────
    file_error = _validate_file(file_path)
    if file_error:
        logger.warning("File validation FAILED: %s", file_error)
        return build_result(student_name, None, False, False, 0.0)

    # ── 2. Kiểm tra không có tên để so sánh ───────────────────────────────────
    if not student_name or not student_name.strip():
        logger.warning("student_name is empty — skip validation")
        return build_result(student_name, None, True, True, 1.0)

    # ── 3. Delegate to validate_upload (full-text search + token fallback) ────
    try:
        result = validate_upload(file_path, student_name, original_filename)
        # validate_upload may not include 'similarity'; add default if missing
        if 'similarity' not in result:
            result['similarity'] = 1.0 if result.get('is_match') else 0.0
        logger.info("is_match: %s | %s", result['is_match'], result['message'])
        logger.info("=== CV Upload Validation END ===")
        return result
    except Exception as exc:
        logger.error("validate_upload failed: %s", exc, exc_info=True)
        return build_result(student_name, None, False, False, 0.0)


# ==============================================================================
# Entry point (called by Node.js via child_process)
# ==============================================================================

def main():
    if len(sys.argv) < 4:
        _exit_error(
            "Usage: validate_cv_upload.py <file_path> <student_name> <original_filename>",
            ""
        )

    file_path         = sys.argv[1]
    student_name      = sys.argv[2].strip()
    original_filename = sys.argv[3].strip()

    try:
        result = validate_cv_upload(file_path, student_name, original_filename)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        logger.error("Unexpected error: %s", exc, exc_info=True)
        _exit_error(str(exc), student_name)


def _exit_error(msg: str, student_name: str):
    print(json.dumps({
        "expected_name":  student_name,
        "extracted_name": None,
        "filename_match": False,
        "content_match":  False,
        "is_match":       False,
        "similarity":     0.0,
        "message":        msg,
        "error":          msg,
    }, ensure_ascii=False))
    sys.exit(1)


if __name__ == '__main__':
    main()
