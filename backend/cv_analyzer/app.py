import traceback
import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import pytesseract

from services.cv_processing import (
    process_pdf,
    extract_raw_text,
    extract_name_from_text,
    validate_upload,
)
from services.job_matching import match_cv_with_jobs

logging.basicConfig(level=logging.INFO, format='[%(levelname)s] %(name)s | %(message)s')
logger = logging.getLogger('cv_analyzer')

tesseract_cmd = os.getenv('TESSERACT_CMD', '').strip()
if tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
YOLO_MODEL_PATH = os.path.join(STATIC_DIR, "models", "best.pt")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "models"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "temp"), exist_ok=True)


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "success": True,
        "message": "CV analyzer service is running",
        "data": {
            "yolo_model_path": YOLO_MODEL_PATH,
            "model_exists": os.path.exists(YOLO_MODEL_PATH)
        }
    })


@app.route('/api/process-cv', methods=['POST'])
def process_cv():
    """
    Xử lý CV: YOLO+OCR (với fallback text extraction) + name extraction.

    Request JSON:
        filePath     (str)  – đường dẫn tuyệt đối tới file CV
        jobPositions (list) – danh sách vị trí việc làm để match (optional)
        studentName  (str)  – tên sinh viên để validate (optional)
        originalFilename (str) – tên file gốc để validate (optional)

    Response JSON:
        allSections          – các section trích xuất từ YOLO/OCR
        extractedText        – toàn bộ text ghép lại
        extractedName        – tên ứng viên tìm được trong CV (hoặc null)
        suggestedJobs        – danh sách việc làm phù hợp
        matchedJobPositionIDs
        validation           – kết quả so khớp tên (chỉ khi có studentName)
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        file_path         = data.get('filePath') or data.get('cvPath')
        job_positions     = data.get('jobPositions', [])
        student_name      = (data.get('studentName') or data.get('hoTen') or '').strip()
        original_filename = (data.get('originalFilename') or data.get('filename') or '').strip()

        if not file_path or not os.path.exists(file_path):
            return jsonify({"error": "File path is missing or file does not exist"}), 400

        logger.info("process-cv | file=%s | student=%s", os.path.basename(file_path), student_name)

        # ── YOLO + OCR processing (with fallback) ──────────────────────────
        cv_sections: dict = {}
        cv_sentences: list = []
        yolo_ok = False
        try:
            cv_sections, cv_sentences = process_pdf(file_path, YOLO_MODEL_PATH)
            yolo_ok = True
            logger.info("process-cv: YOLO/OCR succeeded")
        except Exception as proc_err:
            traceback.print_exc()
            logger.warning("process-cv: YOLO/OCR failed (%s) — using simple extraction", proc_err)
            raw_text = extract_raw_text(file_path, max_pages=5)
            cv_sentences = [raw_text] if raw_text else []
            cv_sections  = {"extractedText": raw_text} if raw_text else {}

        all_text = "\n".join(cv_sentences)

        # ── Name extraction ───────────────────────────────────────────────
        # Prefer full text; YOLO output may miss the name banner area
        name_search_text = all_text or extract_raw_text(file_path, max_pages=2)
        extracted_name = extract_name_from_text(name_search_text, max_lines=40)
        logger.info("process-cv: extractedName='%s'", extracted_name)

        # ── Job matching ──────────────────────────────────────────────────
        suggested_jobs = match_cv_with_jobs(all_text, job_positions) if job_positions else []
        matched_ids    = [job['id'] for job in suggested_jobs]

        # ── Name validation (only when studentName provided) ──────────────
        validation = None
        if student_name:
            try:
                validation = validate_upload(file_path, student_name, original_filename)
                logger.info("process-cv: validation is_match=%s", validation.get('is_match'))
            except Exception as val_err:
                logger.error("process-cv: validation error: %s", val_err)
                validation = {
                    'expected_name':  student_name,
                    'extracted_name': extracted_name,
                    'filename_match': False,
                    'content_match':  False,
                    'is_match':       False,
                    'similarity':     0.0,
                    'message':        f'Lỗi khi xác thực tên: {val_err}',
                }

        response = {
            "allSections":           cv_sections,
            "extractedText":         all_text,
            "extractedName":         extracted_name,
            "suggestedJobs":         suggested_jobs,
            "matchedJobPositionIDs": matched_ids,
            "yoloUsed":              yolo_ok,
        }
        if validation is not None:
            response["validation"] = validation

        return jsonify(response)

    except Exception as e:
        traceback.print_exc()
        logger.error("process-cv: unhandled exception: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route('/api/extract-name', methods=['POST'])
def extract_name_api():
    """
    Trích xuất họ tên ứng viên từ CV.

    Request JSON:
        filePath      (str) – đường dẫn tới file CV
        studentName   (str) – tên kỳ vọng để so sánh (optional)
        originalFilename (str) – tên file gốc (optional)

    Response JSON (khi KHÔNG có studentName):
        { name, extractedText, source }

    Response JSON (khi CÓ studentName — full validation):
        { expected_name, extracted_name, filename_match,
          content_match, is_match, similarity, message }
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        file_path         = data.get('filePath') or data.get('cvPath')
        student_name      = (data.get('studentName') or data.get('hoTen') or '').strip()
        original_filename = (data.get('originalFilename') or data.get('filename') or '').strip()

        if not file_path or not os.path.exists(file_path):
            return jsonify({"error": "File path is missing or file does not exist"}), 400

        logger.info("extract-name | file=%s | student=%s",
                    os.path.basename(file_path), student_name)

        # Full validation when studentName is provided
        if student_name:
            result = validate_upload(file_path, student_name, original_filename)
            logger.info("extract-name: is_match=%s extracted='%s'",
                        result.get('is_match'), result.get('extracted_name'))
            return jsonify(result)

        # Simple name extraction only
        raw_text = extract_raw_text(file_path, max_pages=2)
        name = extract_name_from_text(raw_text, max_lines=40)
        logger.info("extract-name: name='%s'", name)
        return jsonify({
            "name":          name,
            "studentCode":   None,
            "extractedText": raw_text,
            "source":        "pymupdf",
        })

    except Exception as e:
        traceback.print_exc()
        logger.error("extract-name: unhandled exception: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route('/api/validate-cv', methods=['POST'])
def validate_cv_api():
    """
    Dedicated endpoint: so khớp tên/mã SV/email trong nội dung CV với tài khoản upload.

    Request JSON:
        filePath         (str, required) – đường dẫn tới file CV
        studentName      (str, required) – tên sinh viên từ tài khoản
        studentCode      (str, optional) – mã sinh viên (ví dụ: 1671020196)
        studentEmail     (str, optional) – email sinh viên
        originalFilename (str, optional) – tên file gốc (chỉ để log)

    Response JSON:
        {
            "expected_name":  "Nguyễn Văn A",
            "extracted_name": "...",
            "filename_match": bool,
            "content_match":  bool,
            "is_match":       bool,
            "similarity":     float,
            "message":        "..."
        }

    HTTP 200 khi hợp lệ, HTTP 422 khi không khớp.
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        file_path         = data.get('filePath') or data.get('cvPath')
        student_name      = (data.get('studentName') or data.get('hoTen') or '').strip()
        student_code      = (data.get('studentCode') or data.get('maSinhVien') or '').strip()
        student_email     = (data.get('studentEmail') or data.get('email') or '').strip()
        original_filename = (data.get('originalFilename') or data.get('filename') or '').strip()

        if not file_path:
            return jsonify({"error": "filePath is required"}), 400
        if not os.path.exists(file_path):
            return jsonify({"error": f"File không tồn tại: {file_path}"}), 400
        if not student_name:
            return jsonify({"error": "studentName is required"}), 400

        logger.info("validate-cv | file=%s | student='%s' | code='%s' | email='%s'",
                    os.path.basename(file_path), student_name, student_code, student_email)

        result = validate_upload(
            file_path, student_name, original_filename,
            student_code=student_code, student_email=student_email
        )
        logger.info("validate-cv | is_match=%s similarity=%.3f extracted='%s'",
                    result['is_match'], result['similarity'], result.get('extracted_name'))

        http_status = 200 if result['is_match'] else 422
        return jsonify(result), http_status

    except Exception as e:
        traceback.print_exc()
        logger.error("validate-cv: unhandled exception: %s", e)
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(
        debug=os.getenv('FLASK_DEBUG', '0') == '1',
        port=int(os.getenv('PORT', '5000')),
        host='0.0.0.0'
    )
