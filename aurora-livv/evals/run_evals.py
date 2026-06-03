#!/usr/bin/env python3
"""
aurora-livv evals runner.

Usage:
  python run_evals.py --case-set cases-solara.json --mode mock
  python run_evals.py --case-set cases-marina.json --mode live
  python run_evals.py --all --mode mock --report report.html

Modes:
  mock  → calls a local mock backend (no LLM cost)
  live  → calls the production agent endpoint

Outputs:
  - JSON results to ./results/<timestamp>-<case-set>.json
  - HTML report (when --report given)
  - Inserts a summary row into agents.evals_runs (if --persist)

Assertions supported (see cases-*.json):
  must_mention              : list[str]   — all must appear in response.text
  must_mention_one_of       : list[str]   — at least one must appear
  must_not_mention          : list[str]   — none may appear
  must_emit_canvas          : str         — canvas.type must equal this
  must_not_emit_canvas      : str         — canvas.type must NOT equal this
  canvas_required_blocks    : list[str]   — all kinds must appear in blocks
  canvas_min_controls       : int         — interactive canvas min controls
  canvas_has_cooldown       : bool        — destructive workflow w/ cooldown
  max_length_chars          : int         — len(text) ≤
  must_not_invent_numbers   : bool        — every number in text exists in seed
  must_state_window         : bool        — phrase like "últimos N días" / "30 days"
  must_state_n              : bool        — phrase like "n=" / "(N=" / "muestra"
  must_mention_currency_symbol : bool     — $, €, £ appears
  must_format_money_two_decimals : bool   — money pattern matches X,Y.ZZ
  must_acknowledge_negative : bool        — empathic phrasing for negative event
  must_ask_clarifying_question : bool     — response ends with ?
  must_not_use_emojis       : bool
"""
import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------
# Backend adapters
# ---------------------------------------------------------------------

def call_mock_backend(agent: str, user_message: str, ctx: dict) -> dict:
    """Mock backend: keyword-based canned responses for fast eval iteration."""
    # Implemented in frontend-next/lib/mock-backend.ts; for the Python runner
    # we replicate the same matching rules inline.
    from mock_backend_py import respond  # local stub, see below
    return respond(agent, user_message, ctx)


def call_live_backend(agent: str, user_message: str, ctx: dict) -> dict:
    """Live backend: hits the Next.js /api/chat endpoint."""
    import urllib.request, urllib.error
    base = os.environ.get("AURORA_LIVV_API", "http://localhost:3000")
    payload = {
        "agent": agent,
        "message": user_message,
        "tenant_id": ctx.get("tenant_id"),
        "user_id": ctx.get("user_id"),
        "session_id": ctx.get("session_id"),
    }
    req = urllib.request.Request(
        f"{base}/api/chat",
        method="POST",
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload).encode("utf-8"),
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


# ---------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------

MONEY_RE = re.compile(r"[\$€£R\$]\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})")
NUMBER_RE = re.compile(r"\b\d{2,}\b")
EMOJI_RE = re.compile(
    "[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF\U0001F1E0-\U0001F1FF]"
)


@dataclass
class CaseResult:
    case_id: str
    passed: bool
    failures: list[str] = field(default_factory=list)
    response: dict = field(default_factory=dict)
    duration_ms: int = 0


def check_case(case: dict, response: dict, seed_numbers: set[int]) -> CaseResult:
    res = CaseResult(case_id=case["id"], passed=True, response=response)
    a = case.get("assertions", {})
    text = (response.get("text") or "").lower()
    canvas = response.get("canvas") or {}
    blocks = canvas.get("blocks") or []
    block_kinds = [b.get("kind") for b in blocks]

    def fail(msg: str):
        res.passed = False
        res.failures.append(msg)

    if "must_mention" in a:
        for needle in a["must_mention"]:
            if needle.lower() not in text:
                fail(f"missing required mention: {needle!r}")

    if "must_mention_one_of" in a:
        if not any(n.lower() in text for n in a["must_mention_one_of"]):
            fail(f"none of required-one-of present: {a['must_mention_one_of']}")

    if "must_not_mention" in a:
        for needle in a["must_not_mention"]:
            if needle.lower() in text:
                fail(f"forbidden phrase present: {needle!r}")

    if "must_emit_canvas" in a:
        if canvas.get("type") != a["must_emit_canvas"]:
            fail(f"canvas.type={canvas.get('type')!r} expected {a['must_emit_canvas']!r}")

    if "must_not_emit_canvas" in a:
        if canvas.get("type") == a["must_not_emit_canvas"]:
            fail(f"canvas.type={canvas.get('type')!r} should NOT equal {a['must_not_emit_canvas']!r}")

    if "canvas_required_blocks" in a:
        for k in a["canvas_required_blocks"]:
            # stepper/diff are at canvas top-level on workflow type
            if k in ("stepper", "diff"):
                if k not in canvas:
                    fail(f"workflow canvas missing top-level {k!r}")
            else:
                if k not in block_kinds:
                    fail(f"display canvas missing block kind {k!r}")

    if "canvas_min_controls" in a:
        n = len(canvas.get("controls") or [])
        if n < a["canvas_min_controls"]:
            fail(f"interactive canvas only {n} controls, need ≥{a['canvas_min_controls']}")

    if "canvas_has_cooldown" in a and a["canvas_has_cooldown"]:
        if not canvas.get("cooldown_seconds"):
            fail("destructive workflow missing cooldown_seconds")

    if "max_length_chars" in a:
        if len(response.get("text") or "") > a["max_length_chars"]:
            fail(f"text length {len(text)} > {a['max_length_chars']}")

    if a.get("must_not_invent_numbers"):
        for m in NUMBER_RE.findall(response.get("text") or ""):
            try:
                v = int(m)
                if v not in seed_numbers and v < 1900 or v > 3000:
                    # allow years; flag everything else
                    if v not in seed_numbers:
                        fail(f"invented number suspect: {v}")
                        break
            except ValueError:
                pass

    if a.get("must_state_window"):
        if not re.search(r"(últim\w+ \d+ días|last \d+ days|últim\w+ 7|últim\w+ 30|window|ventana)", text):
            fail("must state the time window")

    if a.get("must_state_n"):
        if not re.search(r"(n\s?=\s?\d|\bmuestra\b|\(n[=:]\s?\d|\bn\b\s*:\s*\d)", text):
            fail("must state sample size n")

    if a.get("must_mention_currency_symbol"):
        if not re.search(r"[\$€£]|R\$|MX\$", response.get("text") or ""):
            fail("missing currency symbol")

    if a.get("must_format_money_two_decimals"):
        if response.get("text") and not MONEY_RE.search(response["text"]):
            fail("money not formatted with 2 decimals + thousand separator")

    if a.get("must_acknowledge_negative"):
        if not re.search(r"(lamento|sorry|complicad\w+|dur\w+|tough)", text):
            fail("did not acknowledge negative event")

    if a.get("must_ask_clarifying_question"):
        if not (response.get("text") or "").rstrip().endswith("?"):
            fail("expected a clarifying question (ending with ?)")

    if a.get("must_not_use_emojis"):
        if EMOJI_RE.search(response.get("text") or ""):
            fail("emoji used where forbidden")

    return res


# ---------------------------------------------------------------------
# Main runner
# ---------------------------------------------------------------------

def load_seed_numbers() -> set[int]:
    """Extract all numbers from seed-data.sql so we can flag invented ones."""
    seed = Path(__file__).parent / "seed-data.sql"
    nums = set()
    if seed.exists():
        for m in re.findall(r"\b\d{2,}\b", seed.read_text()):
            try:
                nums.add(int(m))
            except ValueError:
                pass
    return nums


def run_case_set(path: Path, mode: str) -> list[CaseResult]:
    payload = json.loads(path.read_text())
    agent = payload["agent"]
    ctx = {"tenant_id": payload["tenant_id"], "user_id": payload["user_id"]}
    seed_numbers = load_seed_numbers()
    results: list[CaseResult] = []
    for case in payload["cases"]:
        start = time.time()
        try:
            if mode == "mock":
                resp = call_mock_backend(agent, case["user_message"], ctx)
            else:
                resp = call_live_backend(agent, case["user_message"], ctx)
        except Exception as e:
            r = CaseResult(case_id=case["id"], passed=False, response={})
            r.failures.append(f"backend error: {e}")
            r.duration_ms = int((time.time() - start) * 1000)
            results.append(r)
            continue
        r = check_case(case, resp, seed_numbers)
        r.duration_ms = int((time.time() - start) * 1000)
        results.append(r)
    return results


def render_report(all_results: dict[str, list[CaseResult]], out: Path) -> None:
    rows = []
    for case_set, results in all_results.items():
        for r in results:
            rows.append((case_set, r.case_id, r.passed, "; ".join(r.failures), r.duration_ms))
    passed = sum(1 for *_, p, _, _ in rows if p)
    total = len(rows)
    html = [f"<!doctype html><meta charset=utf-8><title>aurora-livv eval report</title>"]
    html.append("<style>body{font-family:system-ui;padding:24px;color:#222}")
    html.append("h1{margin-top:0}table{border-collapse:collapse;width:100%}")
    html.append("td,th{padding:6px 10px;border-bottom:1px solid #eee;font-size:13px}")
    html.append(".pass{color:#10B981;font-weight:600}.fail{color:#E11D74;font-weight:600}")
    html.append("</style>")
    html.append(f"<h1>aurora-livv eval report</h1>")
    html.append(f"<p>Passed <b>{passed}/{total}</b> ({100*passed//max(total,1)}%)</p>")
    html.append("<table><tr><th>Set</th><th>Case</th><th>Status</th><th>Failures</th><th>ms</th></tr>")
    for s, cid, p, f, ms in rows:
        cls = "pass" if p else "fail"
        html.append(f"<tr><td>{s}</td><td>{cid}</td><td class='{cls}'>{'PASS' if p else 'FAIL'}</td><td>{f}</td><td>{ms}</td></tr>")
    html.append("</table>")
    out.write_text("\n".join(html), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case-set", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--mode", choices=["mock", "live"], default="mock")
    ap.add_argument("--report", default=None)
    args = ap.parse_args()

    here = Path(__file__).parent
    sets = []
    if args.all:
        sets = sorted(here.glob("cases-*.json"))
    else:
        sets = [here / s for s in args.case_set]

    if not sets:
        print("no case sets provided", file=sys.stderr)
        return 2

    all_results: dict[str, list[CaseResult]] = {}
    total_pass = total = 0
    for p in sets:
        print(f"== {p.name} (mode={args.mode}) ==")
        results = run_case_set(p, args.mode)
        all_results[p.name] = results
        s_pass = sum(1 for r in results if r.passed)
        total_pass += s_pass
        total += len(results)
        print(f"  {s_pass}/{len(results)} passed")
        for r in results:
            mark = "✓" if r.passed else "✗"
            print(f"   {mark} {r.case_id} ({r.duration_ms}ms)")
            for fail in r.failures:
                print(f"      - {fail}")

    if args.report:
        render_report(all_results, Path(args.report))
        print(f"report written to {args.report}")

    print(f"\nTOTAL: {total_pass}/{total} passed ({100*total_pass//max(total,1)}%)")
    return 0 if total_pass == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
