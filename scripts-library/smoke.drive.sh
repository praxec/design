#!/usr/bin/env bash
# smoke.drive.sh — HEADLESS end-to-end drive of flow.anneal.structure-first
# against the Increment-I STUB, using the real `praxec` binary + a scratch
# sqlite gateway (state persists across command calls). Proves the measurement-
# gated annealing spine to the human prune and back — offline, no LLM, no
# browser. assert-don't-derive: every claim below is an explicit, atomic check
# on the engine's own JSON, and any failure exits non-zero.
#
# What it proves:
#   1. HAPPY PATH   — start auto-drives the deterministic chain (fan-out →
#      score → detect → eligibility) and PARKS at `pruning` with >=1 ELIGIBLE
#      candidate (child human gate); submitting the human `pick` drives the
#      parent to `done` / succeeded with the survivor recorded.
#   2. COLLAPSE     — a round that yields ZERO eligible candidates (here forced
#      by a demanding tau above every stub G — the "all G<τ" collapse of spec
#      §9) reaches `failed` with reason DIVERGENCE_COLLAPSED and NEVER parks at
#      the human (never presents a collapsed set).
#   3. PURPOSE_UNSET — no app_type ⇒ `failed` with reason PURPOSE_UNSET.
#
# Requires: `praxec` (0.0.47+) on PATH, node, python3. Run from anywhere.
set -euo pipefail

PACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$PACK_DIR/scripts-library"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DB="$WORK/drive.db"
CFG="$WORK/gateway.yaml"

cat > "$CFG" <<YAML
version: "1.0.0"
gateway:
  principal: { subject: operator, roles: [human] }
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

DEF=design/flow.anneal.structure-first
pc() { praxec command --config "$CFG" "$@" 2>/dev/null; }
pq() { praxec query   --config "$CFG" "$@" 2>/dev/null; }

# ---- assertion helper: pull a field via python, compare, or die -------------
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== 1/3 HAPPY PATH: start → park at pruning → pick → done =="
OUT="$WORK/happy"; mkdir -p "$OUT"
START_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "app_type":"dashboard",
  "profile": json.dumps({"app":"dashboard","needs":["density","hierarchy"]}),
  "seeds":[{"corners":"square","type":"serif","grid":"asymmetric"}],
  "n":1, "tau":1.549, "fit_floor":1.0,
  "scripts_dir": sys.argv[2], "out_dir": sys.argv[3], "max_rounds":0,
}}))' "$DEF" "$SCRIPTS_DIR" "$OUT")

START=$(pc "$START_INPUT")
# ASSERT: parked at `pruning`, waiting, with a child human gate on >=1 eligible.
eval "$(printf '%s' "$START" | python3 -c '
import sys,json
d=json.load(sys.stdin)
w=d.get("workflow",{}); c=d.get("context",{}); ph=d.get("pending_human") or {}
state=w.get("state"); status=(d.get("result") or {}).get("status")
elig=c.get("eligible_count")
opts=(((ph.get("choices") or {}).get("options")) or [])
res=ph.get("resolve") or {}; args=res.get("args") or {}
print("PARENT_ID=%r" % w.get("id"))
print("STATE=%r"    % state)
print("STATUS=%r"   % status)
print("ELIG=%r"     % elig)
print("N_OPTS=%r"   % len(opts))
print("CHILD_ID=%r" % args.get("workflowId"))
print("CHILD_VER=%r"% args.get("expectedVersion"))
print("CHOSEN_ID=%r"% (opts[0]["value"] if opts else ""))
')"
[ "$STATE" = "pruning" ]        || fail "expected state=pruning, got $STATE"
[ "$STATUS" = "waiting" ]       || fail "expected status=waiting, got $STATUS"
[ "$ELIG" -ge 1 ] 2>/dev/null   || fail "expected eligible_count>=1, got $ELIG"
[ "$N_OPTS" -ge 1 ] 2>/dev/null || fail "expected >=1 presented option, got $N_OPTS"
[ -n "$CHILD_ID" ]              || fail "no child human-gate workflow id"
echo "   parked at pruning; eligible_count=$ELIG; presenting $N_OPTS candidate(s); child=$CHILD_ID"

# Resume: submit the human pick to the CHILD gate as a human principal.
PICK=$(python3 -c '
import json,sys
print(json.dumps({"workflowId":sys.argv[1],"expectedVersion":int(sys.argv[2]),
  "transition":"pick","arguments":{"chosen_id":sys.argv[3],"rationale":"smoke: strongest G, fit clears floor"}}))' \
  "$CHILD_ID" "$CHILD_VER" "$CHOSEN_ID")
praxec command --human --config "$CFG" "$PICK" >/dev/null 2>&1

# ASSERT: the parent re-drove to `done` / succeeded with the survivor recorded.
eval "$(pq "{\"workflowId\":\"$PARENT_ID\"}" | python3 -c '
import sys,json
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
print("FSTATE=%r"  % w.get("state"))
print("FSTATUS=%r" % (d.get("result") or {}).get("status"))
print("SURVIVOR=%r"% (c.get("chosen",{}) or {}).get("id"))
')"
[ "$FSTATE" = "done" ]         || fail "expected final state=done, got $FSTATE"
[ "$FSTATUS" = "succeeded" ]   || fail "expected status=succeeded, got $FSTATUS"
[ -n "$SURVIVOR" ]             || fail "no survivor recorded in chosen"
[ "$SURVIVOR" = "$CHOSEN_ID" ] || fail "survivor $SURVIVOR != picked $CHOSEN_ID"
echo "   pick drove parent to done; survivor=$SURVIVOR  ✓"

echo
echo "== 2/3 COLLAPSE: zero eligible (all G<τ) → DIVERGENCE_COLLAPSED, no human =="
OUT2="$WORK/collapse"; mkdir -p "$OUT2"
COLLAPSE_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "app_type":"dashboard",
  "profile": json.dumps({"app":"dashboard","needs":["density","hierarchy"]}),
  "seeds":[{"corners":"square","type":"serif","grid":"asymmetric"},
           {"corners":"round","type":"sans","grid":"symmetric"}],
  "n":2, "tau":5.0, "fit_floor":1.0,
  "scripts_dir": sys.argv[2], "out_dir": sys.argv[3], "max_rounds":1,
}}))' "$DEF" "$SCRIPTS_DIR" "$OUT2")
eval "$(pc "$COLLAPSE_INPUT" | python3 -c '
import sys,json
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
print("CSTATE=%r"  % w.get("state"))
print("CSTATUS=%r" % (d.get("result") or {}).get("status"))
print("CREASON=%r" % c.get("reason"))
print("CSCORED=%r" % len(c.get("scored",[])))
print("CELIG=%r"   % c.get("eligible_count"))
print("CHUMAN=%r"  % bool(d.get("pending_human")))
')"
[ "$CSTATE" = "failed" ]                 || fail "expected collapse state=failed, got $CSTATE"
[ "$CREASON" = "DIVERGENCE_COLLAPSED" ]  || fail "expected reason=DIVERGENCE_COLLAPSED, got $CREASON"
[ "$CELIG" -eq 0 ] 2>/dev/null           || fail "expected eligible_count=0, got $CELIG"
[ "$CSCORED" -ge 1 ] 2>/dev/null         || fail "collapse should still SCORE candidates, got $CSCORED"
[ "$CHUMAN" = "False" ]                  || fail "collapse must NOT park at the human gate"
echo "   scored=$CSCORED, eligible=0 → failed(DIVERGENCE_COLLAPSED), no human park  ✓"

echo
echo "== 3/3 PURPOSE_UNSET: no app_type → fail-fast =="
OUT3="$WORK/purpose"; mkdir -p "$OUT3"
PURPOSE_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "app_type":"", "profile":"", "seeds":[{"corners":"square"}], "n":1,
  "scripts_dir": sys.argv[2], "out_dir": sys.argv[3], "max_rounds":0,
}}))' "$DEF" "$SCRIPTS_DIR" "$OUT3")
eval "$(pc "$PURPOSE_INPUT" | python3 -c '
import sys,json
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
print("PSTATE=%r"  % w.get("state"))
print("PREASON=%r" % c.get("reason"))
')"
[ "$PSTATE" = "failed" ]           || fail "expected purpose state=failed, got $PSTATE"
[ "$PREASON" = "PURPOSE_UNSET" ]   || fail "expected reason=PURPOSE_UNSET, got $PREASON"
echo "   no app_type → failed(PURPOSE_UNSET)  ✓"

echo
echo "DRIVE OK — parks at the prune with >=1 eligible, pick → done; collapse + purpose fail-fast."
