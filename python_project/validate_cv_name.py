#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Standalone CV name validation script.
Called directly by Node.js via child_process — no Flask service required.

Usage:
    python validate_cv_name.py <cv_file_path> <student_name>

Output (JSON to stdout):
    {"isMatch": bool, "nameInCV": str|null, "similarity": float, "message": str}
"""

import sys
import json
import os

# Resolve cv_analyzer services directory (../backend/cv_analyzer)
_HERE = os.path.dirname(os.path.abspath(__file__))
CV_ANALYZER_DIR = os.path.normpath(os.path.join(_HERE, '..', 'backend', 'cv_analyzer'))
sys.path.insert(0, CV_ANALYZER_DIR)


def main():
    if len(sys.argv) < 3:
        _exit_error("Usage: validate_cv_name.py <cv_path> <student_name>")

    cv_path = sys.argv[1]
    student_name = sys.argv[2].strip()

    if not os.path.isfile(cv_path):
        _exit_error(f"File not found: {cv_path}")

    try:
        from services.cv_processing import validate_student_name_in_cv
        result = validate_student_name_in_cv(cv_path, student_name)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        _exit_error(str(e))


def _exit_error(msg):
    print(json.dumps({"error": msg, "isMatch": False, "nameInCV": None, "similarity": 0.0, "message": msg},
                     ensure_ascii=False))
    sys.exit(1)


if __name__ == '__main__':
    main()
