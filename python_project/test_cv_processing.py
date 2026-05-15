#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Test script for CV name extraction and validation.
Run with: backend/cv_analyzer/.venv/Scripts/python.exe test_cv_processing.py
"""

import sys
import os

# Point to cv_analyzer service (the canonical code location)
CV_ANALYZER_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backend', 'cv_analyzer')
sys.path.insert(0, CV_ANALYZER_DIR)

from services.cv_processing import process_pdf, validate_student_name_in_cv, find_name_in_text, extract_raw_text_from_pdf

YOLO_MODEL_PATH = os.path.join(CV_ANALYZER_DIR, 'static', 'models', 'best.pt')
BACKEND_CV_DIR = os.path.join(CV_ANALYZER_DIR, '..', 'uploads', 'cv')


def test_name_extraction(cv_path):
    print(f"\n{'='*70}")
    print(f"File: {os.path.basename(cv_path)}")
    print(f"{'='*70}")

    if not os.path.exists(cv_path):
        print(f"ERROR: File not found: {cv_path}")
        return False

    text = extract_raw_text_from_pdf(cv_path, max_pages=1)
    name = find_name_in_text(text)
    print(f"Ten trich xuat: {name}")
    print(f"300 ky tu dau:\n{text[:300]}")
    return True


def test_validate(cv_path, student_name, expected_match):
    result = validate_student_name_in_cv(cv_path, student_name)
    ok = 'OK' if result['isMatch'] == expected_match else '!!! SAI'
    print(f"  [{ok}] Ten SV: '{student_name}'")
    print(f"         isMatch={result['isMatch']} | nameInCV={result['nameInCV']} | sim={result['similarity']}")
    print(f"         {result['message']}")


if __name__ == '__main__':
    backend_cv_path = os.path.normpath(BACKEND_CV_DIR)

    if not os.path.exists(backend_cv_path):
        print(f"ERROR: CV directory not found: {backend_cv_path}")
        sys.exit(1)

    cv_files = sorted([f for f in os.listdir(backend_cv_path) if f.endswith('.pdf')])
    if not cv_files:
        print(f"ERROR: No PDF files found in {backend_cv_path}")
        sys.exit(1)

    print(f"Found {len(cv_files)} CV files in uploads/cv/\n")

    for fname in cv_files:
        test_name_extraction(os.path.join(backend_cv_path, fname))

    sys.exit(0)
