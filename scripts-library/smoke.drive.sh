#!/usr/bin/env bash
# smoke.drive.sh — HEADLESS end-to-end drive of flow.anneal.structure-first
# against the Increment-I STUB, using the real `praxec` binary + a scratch
# sqlite gateway (state persists across command calls). Proves the measurement-
# gated annealing spine THROUGH the prune-and-steer gate AND back around the
# refine loop — offline, no LLM, no browser. assert-don't-derive: every claim
# below is an explicit, atomic check on the engine's own JSON, any failure exits
# non-zero.
#
# What it proves:
#   1. HAPPY PATH + LOOP CLOSURE (spec §6b) — start auto-drives the deterministic
#      chain (fan-out → score → detect → eligibility), builds the contact sheet,
#      and PARKS at `pruning` on the prune-and-steer gate with >=1 ELIGIBLE
#      candidate (child human gate). Resuming with STRUCTURED per-candidate
#      feedback ({verdict, rank, likes, dislikes}) + the survivor `keep_id`:
#        (a) aggregates the human's reactions into the `steer` {amplify, avoid};
#        (b) refines round 1 with the survivor's seed AND FOLDS THE STEER into the
#            tightened `round_seeds` (loop closure — the human's taste reaches the
#            next divergence). Asserted at the SEED level: the offline stub ignores
#            seed semantics, so the drive proves the PLUMBING (steer lands in the
#            seed); the EFFECT only manifests with the real Kimi generation cap.
#        (c) resuming the round-1 gate drives the parent to `done` / succeeded
#            with the survivor recorded.
#   2. COLLAPSE     — a round that yields ZERO eligible candidates. Increment I-f:
#      the ONLY hard floor is real usability, so the collapse is forced by EVERY
#      candidate carrying a BLOCKING detect finding (seeds set `defect:true` ⇒ the
#      stub emits a gpt-thin-border-wide-shadow the detector blocks). tau/fit_floor
#      stay NORMAL — fit/G are advisory and never collapse a round. Reaches
#      `failed` with reason DIVERGENCE_COLLAPSED and NEVER parks at the human.
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

# gateway.models_yaml is REQUIRED because the pack now ships a `kind: agent`
# cap (design/cap.implement.generate-direction) — the loader fails
# AGENT_MODELS_YAML_REQUIRED at gateway build otherwise, even though this drive
# never touches that cap. Point it at the pack's example models.yaml (must exist
# + load); the OFFLINE twin below uses the deterministic stub, so no model
# binding is ever resolved and no OpenRouter key/credit is needed.
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

# The OFFLINE twin (stub generation) — production flow.anneal.structure-first
# wires the real `kind: agent` generation and needs a live key/credit.
DEF=design/flow.anneal.structure-first.offline
pc() { praxec command --config "$CFG" "$@" 2>/dev/null; }
pq() { praxec query   --config "$CFG" "$@" 2>/dev/null; }

# ---- assertion helper: pull a field via python, compare, or die -------------
fail() { echo "FAIL: $*" >&2; exit 1; }

echo "== 1/3 HAPPY PATH + LOOP CLOSURE: park at prune-and-steer → resume(feedback) → steer folds into round-1 seeds → resume → done =="
OUT="$WORK/happy"; mkdir -p "$OUT"
# max_rounds:1 so the survivor refines ONE round — that refine is where the steer
# is folded into the tightened seeds (the loop-closure assertion below). Two
# in-seed seeds ⇒ a >=2-candidate spread the human reacts across.
START_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "app_type":"dashboard",
  "profile": json.dumps({"app":"dashboard","needs":["density","hierarchy"]}),
  "seeds":[{"corners":"square","type":"serif","grid":"asymmetric"},
           {"corners":"round","type":"sans","grid":"symmetric"}],
  "n":2, "tau":1.549, "fit_floor":1.0,
  "scripts_dir": sys.argv[2], "out_dir": sys.argv[3], "max_rounds":1,
}}))' "$DEF" "$SCRIPTS_DIR" "$OUT")

START=$(pc "$START_INPUT")
# ASSERT: parked at `pruning` on the prune-and-steer gate, waiting, with a child
# human gate on >=1 eligible; the gate resumes via the `resolve` transition.
eval "$(printf '%s' "$START" | python3 -c '
import sys,json
d=json.load(sys.stdin)
w=d.get("workflow",{}); c=d.get("context",{}); ph=d.get("pending_human") or {}
res=ph.get("resolve") or {}; args=res.get("args") or {}
elig=c.get("eligible",[])
print("PARENT_ID=%r" % w.get("id"))
print("STATE=%r"    % w.get("state"))
print("STATUS=%r"   % (d.get("result") or {}).get("status"))
print("ELIG=%r"     % c.get("eligible_count"))
print("CHILD_ID=%r" % args.get("workflowId"))
print("CHILD_VER=%r"% args.get("expectedVersion"))
print("CHILD_TR=%r" % args.get("transition"))
print("GATE_DEF=%r" % ph.get("definition_id"))
print("KEEP_ID=%r"  % (elig[0]["id"] if elig else ""))
print("ELIG_IDS=%r" % " ".join(x.get("id","") for x in elig))
')"
[ "$STATE" = "pruning" ]                              || fail "expected state=pruning, got $STATE"
[ "$STATUS" = "waiting" ]                             || fail "expected status=waiting, got $STATUS"
[ "$ELIG" -ge 1 ] 2>/dev/null                        || fail "expected eligible_count>=1, got $ELIG"
[ -n "$CHILD_ID" ]                                    || fail "no child prune-and-steer gate id"
[ "$CHILD_TR" = "resolve" ]                           || fail "expected child transition=resolve, got $CHILD_TR"
[ "$GATE_DEF" = "design/cap.gate.prune-and-steer" ]  || fail "expected prune-and-steer gate, got $GATE_DEF"
echo "   parked at prune-and-steer; eligible_count=$ELIG; presenting [$ELIG_IDS]; child=$CHILD_ID"

# Resume: submit VALENCED STRUCTURED per-candidate feedback (verdict / rank /
# likes / dislikes — each like/dislike is { axis, toward }, one entry per PRESENTED
# candidate, no silent partial prune) plus the survivor keep_id, as a human
# principal. Survivor liked type→"geometric sans", disliked color→"restrained
# palette"; the rejected sibling disliked space→"tighter density" — so the
# aggregated steer is deterministic AND directional:
#   amplify=[{type,"geometric sans"}]  (likes of the carried-forward survivor)
#   avoid=[{color,"restrained palette"},{space,"tighter density"}]  (all dislikes)
RESUME=$(python3 -c '
import json,sys
ids=sys.argv[4].split(); keep=sys.argv[3]
fb=[]
for i,cid in enumerate(ids):
    fb.append({"candidate_id":cid,
      "verdict":("keep" if cid==keep else "reject"),
      "rank":i+1,
      "likes":([{"axis":"type","toward":"geometric sans"}] if cid==keep else []),
      "dislikes":([{"axis":"color","toward":"restrained palette"}] if cid==keep
                  else [{"axis":"space","toward":"tighter density"}]),
      "notes":"smoke: taste reaction"})
print(json.dumps({"workflowId":sys.argv[1],"expectedVersion":int(sys.argv[2]),
  "transition":"resolve","arguments":{"keep_id":keep,"feedback":fb}}))' \
  "$CHILD_ID" "$CHILD_VER" "$KEEP_ID" "$ELIG_IDS")
praxec command --human --config "$CFG" "$RESUME" >/dev/null 2>&1

# ASSERT LOOP CLOSURE: the parent aggregated the steer and refined round 1, and
# the tightened `round_seeds` CARRY THE STEER (folded into the seed's `notes`).
# This is the plumbing proof at the SEED level — the whole point of I-b.
P2=$(pq "{\"workflowId\":\"$PARENT_ID\"}")
eval "$(printf '%s' "$P2" | python3 -c '
import sys,json
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
ph=d.get("pending_human") or {}; args=(ph.get("resolve") or {}).get("args") or {}
rs=c.get("round_seeds") or [{}]
steer=c.get("steer") or {}
c2elig=c.get("eligible",[])
print("R2STATE=%r" % w.get("state"))
print("R2ROUND=%r" % c.get("round"))
print("R2NOTES=%r" % ((rs[0] or {}).get("notes","")))
print("R2AMP=%r"   % ",".join(a.get("axis","") for a in steer.get("amplify",[])))
print("R2AVOID=%r" % ",".join(a.get("axis","") for a in steer.get("avoid",[])))
print("C2_ID=%r"   % args.get("workflowId"))
print("C2_VER=%r"  % args.get("expectedVersion"))
print("C2_KEEP=%r" % (c2elig[0]["id"] if c2elig else ""))
print("C2_IDS=%r"  % " ".join(x.get("id","") for x in c2elig))
')"
[ "$R2STATE" = "pruning" ]        || fail "expected re-park at pruning (round 1), got $R2STATE"
[ "$R2ROUND" -eq 1 ] 2>/dev/null  || fail "expected refined round=1, got $R2ROUND"
[ "$R2AMP" = "type" ]             || fail "expected steer.amplify axes=[type], got [$R2AMP]"
[ "$R2AVOID" = "color,space" ]    || fail "expected steer.avoid axes=[color,space], got [$R2AVOID]"
# Valenced fold: the DIRECTION (toward), not just the axis, must reach the seed notes.
case "$R2NOTES" in *"amplify: type→geometric sans"*) : ;; *) fail "valenced amplify not folded into round_seeds notes: '$R2NOTES'";; esac
# The REDIRECT target reaches the seed as an instruction to GO somewhere, not
# as a prohibition: a human who asks for a restrained palette must never
# produce "avoid: color→restrained palette" in the generation prompt.
case "$R2NOTES" in *"on color, go toward: restrained palette"*) : ;; *) fail "valenced redirect not folded into round_seeds notes: '$R2NOTES'";; esac
case "$R2NOTES" in *"avoid: color"*) fail "redirect target rendered as a prohibition (valence inverted): '$R2NOTES'";; *) : ;; esac
echo "   loop closed: round=1 seeds carry the VALENCED steer → notes='$R2NOTES'  ✓"

# Resume the round-1 gate → the parent reaches `done` / succeeded with a survivor.
RESUME2=$(python3 -c '
import json,sys
ids=sys.argv[4].split(); keep=sys.argv[3]
fb=[{"candidate_id":cid,"verdict":("keep" if cid==keep else "reject"),"rank":i+1,
     "likes":[],"dislikes":[],"notes":""} for i,cid in enumerate(ids)]
print(json.dumps({"workflowId":sys.argv[1],"expectedVersion":int(sys.argv[2]),
  "transition":"resolve","arguments":{"keep_id":keep,"feedback":fb}}))' \
  "$C2_ID" "$C2_VER" "$C2_KEEP" "$C2_IDS")
praxec command --human --config "$CFG" "$RESUME2" >/dev/null 2>&1

eval "$(pq "{\"workflowId\":\"$PARENT_ID\"}" | python3 -c '
import sys,json
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
print("FSTATE=%r"  % w.get("state"))
print("FSTATUS=%r" % (d.get("result") or {}).get("status"))
print("SURVIVOR=%r"% (c.get("chosen",{}) or {}).get("id"))
')"
[ "$FSTATE" = "done" ]       || fail "expected final state=done, got $FSTATE"
[ "$FSTATUS" = "succeeded" ] || fail "expected status=succeeded, got $FSTATUS"
[ -n "$SURVIVOR" ]           || fail "no survivor recorded in chosen"
echo "   resume round-1 gate → parent done; survivor=$SURVIVOR  ✓"

echo
echo "== 2/3 COLLAPSE: EVERY candidate has a blocking detect finding → DIVERGENCE_COLLAPSED, no human =="
# Increment I-f: the ONLY hard eligibility floor is real usability (detect-clean).
# fit + G are ADVISORY — they NEVER collapse a round. So the collapse case is
# forced by REAL usability errors: every seed carries `defect:true`, making the
# stub emit the gpt-thin-border-wide-shadow anti-pattern that `impeccable detect`
# flags as BLOCKING (antipattern_count>0 ⇒ usable=false). tau/fit_floor stay at
# their NORMAL values — proving the collapse is the usability floor, not fit/G.
OUT2="$WORK/collapse"; mkdir -p "$OUT2"
COLLAPSE_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "app_type":"dashboard",
  "profile": json.dumps({"app":"dashboard","needs":["density","hierarchy"]}),
  "seeds":[{"corners":"square","type":"serif","grid":"asymmetric","defect":True},
           {"corners":"round","type":"sans","grid":"symmetric","defect":True}],
  "n":2, "tau":1.549, "fit_floor":1.0,
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
sc=c.get("scored",[])
# The collapse is a USABILITY collapse: every scored candidate is usable:false
# (blocking detect finding). Proves fit/G did not cause it (Increment I-f).
print("CALLUNUSABLE=%r" % (bool(sc) and all((x.get("why") or {}).get("usable")==False for x in sc)))
print("CANYBLOCK=%r"    % (bool(sc) and all((x.get("antipattern_count",0))>0 for x in sc)))
')"
[ "$CSTATE" = "failed" ]                 || fail "expected collapse state=failed, got $CSTATE"
[ "$CREASON" = "DIVERGENCE_COLLAPSED" ]  || fail "expected reason=DIVERGENCE_COLLAPSED, got $CREASON"
[ "$CELIG" -eq 0 ] 2>/dev/null           || fail "expected eligible_count=0, got $CELIG"
[ "$CSCORED" -ge 1 ] 2>/dev/null         || fail "collapse should still SCORE candidates, got $CSCORED"
[ "$CHUMAN" = "False" ]                  || fail "collapse must NOT park at the human gate"
[ "$CALLUNUSABLE" = "True" ]             || fail "collapse must be a USABILITY collapse (every scored usable:false), got $CALLUNUSABLE"
[ "$CANYBLOCK" = "True" ]                || fail "every collapsed candidate must carry a blocking detect finding, got $CANYBLOCK"
echo "   scored=$CSCORED (all usable:false, blocking detect), eligible=0 → failed(DIVERGENCE_COLLAPSED), no human park  ✓"

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
echo "DRIVE OK — parks at prune-and-steer with >=1 eligible; structured feedback → steer folds into the tightened round-1 seeds (loop closure) → done; collapse + purpose fail-fast."
