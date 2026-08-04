#!/usr/bin/env bash
# smoke.rollout.sh — HEADLESS end-to-end drive of flow.rollout.offline against the
# Increment-IV-a STUB, using the real `praxec` binary + a scratch sqlite gateway.
# Proves the token-gated rollout spine — capture → per-surface apply(stub) →
# token-adherence + detect gates → collect / bounded-retry / ROLLOUT_REGRESSED —
# OFFLINE, no LLM, no gh. assert-don't-derive: every claim below is an explicit,
# atomic check on the engine's own JSON; any failure exits non-zero.
#
# What it proves:
#   1. HAPPY PATH — two on-system surfaces are rolled, both CLEAR the token-adherence
#      heart (0 off-system) + the detect floor, are COLLECTED, and the flow reaches
#      `done` / succeeded with rolled_count == 2 and reason ROLLOUT_COMPLETE. Each
#      rolled artifact exists on disk and is marked adherent.
#   2. ANTI-REGRESSION (the heart) — a surface list [adherent, OFF-SYSTEM] where the
#      off-system surface (defect:true ⇒ the stub emits an off-palette #123456 + the
#      off-stack `Inter` font). The adherent surface still COLLECTS (rolled_count == 1),
#      but the off-system surface FAILS token-adherence, exhausts the bounded retry,
#      and the flow reaches `failed` with reason ROLLOUT_REGRESSED — never collected.
#      The `off_system` findings name the offending color + font (the gate's shape).
#
# Requires: `praxec` (0.0.47+) on PATH, node, python3. Run from anywhere.
set -euo pipefail

PACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$PACK_DIR/scripts-library"
DS_PATH="$PACK_DIR/fixtures/design-system.sample.md"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DB="$WORK/rollout.db"
CFG="$WORK/gateway.yaml"

# gateway.models_yaml is REQUIRED because the pack ships `kind: agent` caps
# (design/cap.implement.apply-design-system, design/cap.implement.generate-direction)
# — the loader fails AGENT_MODELS_YAML_REQUIRED at gateway build otherwise, even
# though this OFFLINE drive never touches them. Point it at the pack's example
# models.yaml (must exist + load); the offline twin uses the deterministic stub, so
# no model binding is ever resolved and no OpenRouter key/credit is needed.
cat > "$CFG" <<YAML
version: "1.0.0"
gateway:
  principal: { subject: operator, roles: [human] }
  models_yaml: "$PACK_DIR/docs/models.example.yaml"
praxec:
  embeddings: { enabled: false }
  _writableRepos:
    - root: "."
      push: false
audit: { sink: stderr }
store: { kind: sqlite, path: "$DB" }
repos:
  - path: "$PACK_DIR"
YAML

DEF=design/flow.rollout.offline
pc() { praxec command --config "$CFG" "$@" 2>/dev/null; }
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== 1/2 HAPPY PATH: two on-system surfaces roll → token-adherent → collected → done =="
OUT1="$WORK/happy"; mkdir -p "$OUT1"
HAPPY_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "surfaces":[{"id":"landing","file":"src/pages/index.astro","layout_type":"landing"},
              {"id":"blog","file":"src/pages/blog/index.astro","layout_type":"blog"}],
  "design_system_path": sys.argv[2],
  "scripts_dir": sys.argv[3], "out_dir": sys.argv[4], "max_retry":1,
}}))' "$DEF" "$DS_PATH" "$SCRIPTS_DIR" "$OUT1")

eval "$(pc "$HAPPY_INPUT" | python3 -c '
import sys,json,os
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
rolled=c.get("rolled",[]) or []
toks=c.get("tokens",{}) or {}
print("HSTATE=%r"     % w.get("state"))
print("HSTATUS=%r"    % (d.get("result") or {}).get("status"))
print("HREASON=%r"    % c.get("reason"))
print("HCOUNT=%r"     % c.get("rolled_count"))
print("HNTOK=%r"      % len(toks.get("colors",[])))
print("HALLADHERE=%r" % (bool(rolled) and all(r.get("adherent") is True for r in rolled)))
print("HIDS=%r"       % " ".join(r.get("id","") for r in rolled))
# coding-write-evidence: every collected surface is a real file on disk.
print("HARTSOK=%r"    % (bool(rolled) and all(os.path.exists(r.get("artifact","")) for r in rolled)))
')"
[ "$HSTATE" = "done" ]              || fail "expected happy state=done, got $HSTATE"
[ "$HSTATUS" = "succeeded" ]        || fail "expected happy status=succeeded, got $HSTATUS"
[ "$HREASON" = "ROLLOUT_COMPLETE" ]|| fail "expected reason=ROLLOUT_COMPLETE, got $HREASON"
[ "$HCOUNT" -eq 2 ] 2>/dev/null    || fail "expected rolled_count=2, got $HCOUNT"
[ "$HNTOK" -eq 9 ] 2>/dev/null     || fail "expected 9 captured color tokens, got $HNTOK"
[ "$HALLADHERE" = "True" ]         || fail "every collected surface must be adherent, got $HALLADHERE"
[ "$HARTSOK" = "True" ]            || fail "every rolled artifact must exist on disk"
echo "   captured $HNTOK tokens; rolled [$HIDS] → all token-adherent + detect-clean → collected → done  ✓"

echo
echo "== 2/2 ANTI-REGRESSION: [adherent, OFF-SYSTEM] → adherent collects; off-system trips ROLLOUT_REGRESSED =="
OUT2="$WORK/regress"; mkdir -p "$OUT2"
# surface 0 is on-system (collects); surface 1 is defect:true — the stub emits an
# off-palette #123456 + the off-stack `Inter` font, so token-adherence BLOCKS it.
# max_retry:1 ⇒ one re-roll (deterministic stub ⇒ same off-system) ⇒ regressed.
REGRESS_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "surfaces":[{"id":"ok-landing","file":"src/pages/index.astro","layout_type":"landing"},
              {"id":"drifted","file":"src/pages/blog/index.astro","layout_type":"blog","defect":True}],
  "design_system_path": sys.argv[2],
  "scripts_dir": sys.argv[3], "out_dir": sys.argv[4], "max_retry":1,
}}))' "$DEF" "$DS_PATH" "$SCRIPTS_DIR" "$OUT2")

eval "$(pc "$REGRESS_INPUT" | python3 -c '
import sys,json
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
off=c.get("off_system",[]) or []
rolled=c.get("rolled",[]) or []
print("RSTATE=%r"   % w.get("state"))
print("RSTATUS=%r"  % (d.get("result") or {}).get("status"))
print("RREASON=%r"  % c.get("reason"))
print("RCOUNT=%r"   % c.get("rolled_count"))
print("ROFFN=%r"    % len(off))
print("RKINDS=%r"   % ",".join(sorted({o.get("kind","") for o in off})))
print("RHASCOLOR=%r"% any(o.get("kind")=="color" and "123456" in str(o.get("value","")) for o in off))
print("RHASFONT=%r" % any(o.get("kind")=="font" and "Inter" in str(o.get("value","")) for o in off))
print("RROLLEDIDS=%r" % " ".join(r.get("id","") for r in rolled))
# off_system shape: every finding carries kind + value + line.
print("RSHAPEOK=%r" % (bool(off) and all(set(["kind","value","line"]).issubset(o) for o in off)))
print("RSAMPLE=%r"  % json.dumps(off[:3]))
')"
[ "$RSTATE" = "failed" ]              || fail "expected regressed state=failed, got $RSTATE"
[ "$RSTATUS" = "failed" ]            || fail "expected regressed status=failed, got $RSTATUS"
[ "$RREASON" = "ROLLOUT_REGRESSED" ] || fail "expected reason=ROLLOUT_REGRESSED, got $RREASON"
[ "$RCOUNT" -eq 1 ] 2>/dev/null      || fail "adherent surface must still collect (rolled_count=1), got $RCOUNT"
[ "$ROFFN" -ge 1 ] 2>/dev/null       || fail "off_system must name >=1 offending token, got $ROFFN"
[ "$RHASCOLOR" = "True" ]            || fail "off_system must flag the off-palette #123456 color"
[ "$RHASFONT" = "True" ]             || fail "off_system must flag the off-stack Inter font"
[ "$RSHAPEOK" = "True" ]             || fail "each off_system finding must carry {kind,value,line}"
[ "$RROLLEDIDS" = "ok-landing" ]     || fail "only the adherent surface should be collected, got [$RROLLEDIDS]"
echo "   adherent 'ok-landing' collected; 'drifted' FAILED token-adherence (kinds=$RKINDS) → ROLLOUT_REGRESSED  ✓"
echo "   off_system shape: $RSAMPLE"

echo
echo "DRIVE OK — capture → per-surface apply(stub) → token-adherence + detect gates → collect;"
echo "           an off-system surface trips ROLLOUT_REGRESSED after bounded retry (the anti-regression floor)."
