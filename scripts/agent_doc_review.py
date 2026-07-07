#!/usr/bin/env python3
"""Nana Agent Doc Review — thin entry point.

Output to doc/auditlog/ + doc/executionlog/ per project convention.
"""
import sys, os
from collections import Counter

engine_dir = os.path.normpath(os.path.join(
    os.path.dirname(__file__), '..', '..', 'FOFLocal', 'FOFDataMapping',
    'FOFCode', 'scripts', 'agent_doc_review'))
sys.path.insert(0, engine_dir)

from engine import reporter, utils

# ── Monkey-patch: docs/ → doc/ per project convention ────────────

def _nana_write_report(report, project_root):
    output_dir = os.path.join(project_root, "doc", "auditlog")
    os.makedirs(output_dir, exist_ok=True)
    report_path = utils.make_output_path(output_dir, report.meta.project, report.meta.cycle, "report")
    summary_path = utils.make_output_path(output_dir, report.meta.project, report.meta.cycle, "summary")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(reporter.generate_markdown_report(report))
    with open(summary_path, "w", encoding="utf-8") as f:
        f.write(reporter.generate_json_summary(report))
    return report_path, summary_path

def _nana_write_execution_log(report, project_root):
    output_dir = os.path.join(project_root, "doc", "executionlog")
    os.makedirs(output_dir, exist_ok=True)
    log_path = utils.make_output_path(output_dir, report.meta.project, report.meta.cycle, "execution_log")
    rule_counts = Counter(f.rule_id for f in report.findings)
    ft = "| Rule ID | Count |\n|---------|-------|\n" + \
         "\n".join(f"| {rid} | {c} |" for rid, c in sorted(rule_counts.items())) if rule_counts else ""
    by_sev = report.summary.by_severity
    content = reporter.EXEC_LOG_TEMPLATE.format(
        project=report.meta.project, cycle=report.meta.cycle,
        script_version=report.meta.script_version, rules_version=report.meta.rules_version,
        run_time=report.meta.run_time, duration=report.meta.duration_seconds,
        dry_run=str(report.meta.dry_run),
        items_checked=report.summary.items_checked, total_findings=report.summary.total_findings,
        by_severity=", ".join(f"{k}={v}" for k, v in sorted(by_sev.items()) if v > 0) or "none",
        risk_level=report.summary.risk_level.value,
        findings_table=ft, scan_roots_formatted="(see inventory auto_scan_roots)",
        recommendations_count=len(report.recommendations))
    with open(log_path, "w", encoding="utf-8") as f:
        f.write(content)
    return log_path

reporter.write_report = _nana_write_report
reporter.write_execution_log = _nana_write_execution_log

from main import main_with_args, parse_args

if __name__ == '__main__':
    argv = sys.argv[1:] + ['--project', 'nana']
    args = parse_args(argv)
    main_with_args(args, engine_dir=engine_dir)
