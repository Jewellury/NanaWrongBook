#!/usr/bin/env python3
"""Nana Agent Doc Review — thin entry point.

Usage:
    python scripts/agent_doc_review.py --mode weekly
    python scripts/agent_doc_review.py --mode monthly --apply
    python scripts/agent_doc_review.py --mode quarterly
"""
import sys
import os

engine_dir = os.path.normpath(os.path.join(
    os.path.dirname(__file__), '..', '..', 'FOFLocal', 'FOFDataMapping',
    'FOFCode', 'scripts', 'agent_doc_review'))
sys.path.insert(0, engine_dir)

from main import main_with_args, parse_args

if __name__ == '__main__':
    argv = sys.argv[1:] + ['--project', 'nana']
    args = parse_args(argv)
    main_with_args(args, engine_dir=engine_dir)
