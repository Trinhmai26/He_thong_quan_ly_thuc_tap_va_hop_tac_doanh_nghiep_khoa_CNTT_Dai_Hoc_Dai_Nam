"""
services/name_comparator.py
============================
Service tách biệt xử lý so sánh tên ứng viên.

Chức năng:
  - Normalize tên (lowercase, trim, remove duplicate spaces, unicode)
  - Fuzzy matching (Nguyễn Văn A / NGUYEN VAN A / Nguyen Van A → match)
  - Kiểm tra tên trong filename
  - Kiểm tra tên trong nội dung CV
"""

import re
import os
import logging
import unicodedata
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Normalize
# ---------------------------------------------------------------------------

def normalize_name(text: str) -> str:
    """
    Normalize tên trước khi so sánh:
      1. Unicode NFKD decompose
      2. Bỏ dấu (combining characters)
      3. Lowercase
      4. Giữ lại chữ cái và khoảng trắng
      5. Xóa khoảng trắng thừa
    """
    if not text or not text.strip():
        return ''

    # NFKD decompose → tách chữ và dấu
    text = unicodedata.normalize('NFKD', text)
    # Bỏ combining characters (dấu thanh, dấu mũ …)
    text = ''.join(c for c in text if not unicodedata.combining(c))
    # Lowercase
    text = text.lower()
    # Chỉ giữ chữ cái a-z và khoảng trắng
    text = re.sub(r'[^a-z\s]', '', text)
    # Xóa khoảng trắng thừa
    text = re.sub(r'\s+', ' ', text).strip()

    return text


def _token_set_ratio(a: str, b: str) -> float:
    """
    So sánh theo tập token (thứ tự không quan trọng).
    Hữu ích khi tên bị đảo thứ tự họ/tên.
    """
    set_a = set(a.split())
    set_b = set(b.split())
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    # Jaccard similarity
    jaccard = len(intersection) / len(union)
    # SequenceMatcher trên chuỗi đã sort
    sorted_ratio = SequenceMatcher(
        None,
        ' '.join(sorted(set_a)),
        ' '.join(sorted(set_b))
    ).ratio()
    return max(jaccard, sorted_ratio)


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

def compare_names(expected: str, extracted: str, threshold: float = 0.80) -> dict:
    """
    So sánh tên kỳ vọng với tên trích xuất từ CV.

    Args:
        expected:  Tên sinh viên từ tài khoản đăng nhập
        extracted: Tên trích xuất từ nội dung CV
        threshold: Ngưỡng similarity để xem là khớp (default 0.80)

    Returns:
        {
            "match":      bool,
            "similarity": float,       # 0.0 – 1.0
            "method":     str,         # "exact" | "fuzzy" | "token_set" | "no_match"
            "normalized_expected":  str,
            "normalized_extracted": str,
        }
    """
    if not expected or not extracted:
        logger.debug("compare_names: one side is empty — no match")
        return _cmp_result(False, 0.0, 'no_match', expected, extracted)

    norm_exp = normalize_name(expected)
    norm_ext = normalize_name(extracted)

    logger.debug("compare_names | expected='%s' → '%s'", expected, norm_exp)
    logger.debug("compare_names | extracted='%s' → '%s'", extracted, norm_ext)

    # 1. Exact match sau normalize
    if norm_exp == norm_ext:
        logger.info("compare_names: EXACT match")
        return _cmp_result(True, 1.0, 'exact', norm_exp, norm_ext)

    # 2. Exact substring (tên trong CV có thể kèm chức vụ/thông tin thêm)
    if norm_exp in norm_ext or norm_ext in norm_exp:
        logger.info("compare_names: SUBSTRING match")
        return _cmp_result(True, 0.95, 'exact', norm_exp, norm_ext)

    # 3. SequenceMatcher fuzzy
    seq_ratio = SequenceMatcher(None, norm_exp, norm_ext).ratio()

    # 4. Token-set (đảo thứ tự họ tên)
    tok_ratio = _token_set_ratio(norm_exp, norm_ext)

    best_ratio = round(max(seq_ratio, tok_ratio), 3)
    method = 'fuzzy' if seq_ratio >= tok_ratio else 'token_set'

    is_match = best_ratio >= threshold
    logger.info(
        "compare_names: %s | ratio=%.3f (seq=%.3f, tok=%.3f) | threshold=%.2f",
        'MATCH' if is_match else 'NO MATCH', best_ratio, seq_ratio, tok_ratio, threshold
    )

    return _cmp_result(is_match, best_ratio, method if is_match else 'no_match',
                       norm_exp, norm_ext)


def _cmp_result(match, similarity, method, norm_exp, norm_ext):
    return {
        'match':                  match,
        'similarity':             similarity,
        'method':                 method,
        'normalized_expected':    norm_exp,
        'normalized_extracted':   norm_ext,
    }


# ---------------------------------------------------------------------------
# Filename check
# ---------------------------------------------------------------------------

def check_filename_match(filename: str, expected_name: str) -> bool:
    """
    Kiểm tra tên kỳ vọng có xuất hiện trong tên file không.
    Bỏ extension và so sánh normalized.
    """
    if not filename or not expected_name:
        return False

    stem = os.path.splitext(filename)[0]
    norm_fn = normalize_name(stem)
    norm_nm = normalize_name(expected_name)

    logger.debug("check_filename_match | filename='%s' → '%s'", stem, norm_fn)
    logger.debug("check_filename_match | expected='%s' → '%s'", expected_name, norm_nm)

    # Exact substring
    if norm_nm in norm_fn:
        logger.info("check_filename_match: MATCH (substring)")
        return True

    # Tất cả token của tên đều có trong filename
    tokens = [t for t in norm_nm.split() if len(t) > 1]
    if tokens and all(t in norm_fn for t in tokens):
        logger.info("check_filename_match: MATCH (all tokens)")
        return True

    # Fuzzy fallback
    ratio = SequenceMatcher(None, norm_nm, norm_fn).ratio()
    result = ratio >= 0.72
    logger.info("check_filename_match: %s (ratio=%.3f)", 'MATCH' if result else 'NO MATCH', ratio)
    return result


# ---------------------------------------------------------------------------
# Public summary helper
# ---------------------------------------------------------------------------

def build_result(
    expected_name:  str,
    extracted_name: str | None,
    filename_match: bool,
    content_match:  bool,
    similarity:     float = 0.0,
) -> dict:
    """Build chuẩn response JSON trả về cho backend."""
    # Chỉ chấp nhận khi nội dung CV khớp — tên file không đủ để xác thực
    is_match = content_match

    if content_match:
        message = "Tên ứng viên trong CV khớp với tài khoản upload"
    elif not extracted_name:
        message = "Không tìm thấy tên ứng viên trong nội dung CV"
    else:
        message = (
            f"Tên ứng viên trong CV ('{extracted_name}') "
            f"không khớp với tài khoản upload ('{expected_name}')"
        )

    return {
        "expected_name":  expected_name,
        "extracted_name": extracted_name,
        "filename_match": filename_match,
        "content_match":  content_match,
        "is_match":       is_match,
        "similarity":     round(similarity, 3),
        "message":        message,
    }
