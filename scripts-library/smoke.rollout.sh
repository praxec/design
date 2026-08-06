#!/usr/bin/env bash
# smoke.rollout.sh — HEADLESS end-to-end drive of flow.rollout.offline against the
# Increment-IV-c STUB, using the real `praxec` binary + a scratch sqlite gateway.
# Proves the token-gated rollout spine — capture → per-surface apply(stub, EDIT IN
# PLACE) → token-adherence + detect gates → collect / bounded-retry /
# ROLLOUT_REGRESSED — OFFLINE, no LLM, no gh. assert-don't-derive: every claim below
# is an explicit, atomic check on the engine's own JSON (or the edited files on
# disk); any failure exits non-zero.
#
# The IV-c change under test: the apply leaf no longer GENERATES a self-contained
# HTML file into an out_dir — it EDITS the target repo's EXISTING file IN PLACE
# (repo_root/<surface.file>), preserving the file's structure/framework and changing
# only the design tokens. The offline stub mirrors this: it reads a fixture surface,
# rewrites ONLY its color/font tokens, and writes it back to the SAME path. The
# gates run on the edited file at its own repo path.
#
# What it proves:
#   1. HAPPY PATH — a throwaway target repo with two OFF-SYSTEM fixture surfaces
#      (a global.css token layer + an index.astro page, each carrying a `@preserve`
#      marker + off-palette hexes + the off-stack `Inter` font). The rollout EDITS
#      each fixture IN PLACE: after the drive each file (a) still exists at its own
#      repo path (NOT an out_dir), (b) has CHANGED from its original, (c) still
#      carries its `@preserve` structural marker (framework preserved), (d) no longer
#      references `Inter` (tokens rewritten), and (e) is token-adherent on disk. Both
#      surfaces CLEAR the token-adherence heart + the detect floor, are COLLECTED,
#      and the flow reaches `done`/succeeded with rolled_count == 2 and reason
#      ROLLOUT_COMPLETE. Each collected artifact path == repo_root/<surface.file>.
#   2. ANTI-REGRESSION (the heart) — a surface list [adherent, OFF-SYSTEM] where the
#      off-system surface (defect:true ⇒ the stub injects an off-palette #123456 + the
#      off-stack `Inter` font into the edited file). The adherent surface still
#      COLLECTS (rolled_count == 1), but the off-system surface FAILS token-adherence,
#      exhausts the bounded retry, and the flow reaches `failed` with reason
#      ROLLOUT_REGRESSED — never collected. The `off_system` findings name the
#      offending color + font (the gate's shape).
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

# write_fixture <path> — an OFF-SYSTEM source file with a @preserve structural
# marker, off-palette hex literals, and the off-stack `Inter` font. The rollout must
# rewrite ONLY the tokens and keep everything else (the marker, selectors, var()
# refs, geometry) verbatim.
write_fixture() {
  mkdir -p "$(dirname "$1")"
  cat > "$1" <<'CSS'
/* @preserve framework: astro token layer — do not restructure */
:root {
  --paper: #eeddcc;
  --ink: #221100;
  --accent: #ff3366;
}
body {
  background: var(--paper);
  color: var(--ink);
  font-family: Inter, system-ui, sans-serif;
  border: 8px solid var(--ink);
  padding: 28px;
}
h1 { color: #3366ff; font-size: 40px; line-height: 1.05; }
.rule { border-top: 1px solid #999999; }
CSS
}

echo "== 1/2 HAPPY PATH: two OFF-SYSTEM fixtures EDITED IN PLACE → token-adherent → collected → done =="
REPO1="$WORK/target1"
F_CSS="$REPO1/src/styles/global.css"
F_ASTRO="$REPO1/src/pages/index.astro"
write_fixture "$F_CSS"
write_fixture "$F_ASTRO"
cp "$F_CSS"   "$WORK/orig.css"
cp "$F_ASTRO" "$WORK/orig.astro"

HAPPY_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "surfaces":[{"id":"tokens","file":"src/styles/global.css","layout_type":"utility"},
              {"id":"home","file":"src/pages/index.astro","layout_type":"landing"}],
  "design_system_path": sys.argv[2],
  "scripts_dir": sys.argv[3], "repo_root": sys.argv[4], "max_retry":1,
}}))' "$DEF" "$DS_PATH" "$SCRIPTS_DIR" "$REPO1")

eval "$(pc "$HAPPY_INPUT" | WORK="$WORK" REPO1="$REPO1" python3 -c '
import sys,json,os
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
# IV-b fan-in: `rolled` is the parallel fan-out result — each element is a branch
# ENVELOPE {ok, index, output}. The per-surface record lives under output.rolled
# and the adherent flag under output.adherent (one branch = one surface).
recs=[b.get("output",{}) for b in (c.get("rolled",[]) or []) if b.get("ok")]
toks=c.get("tokens",{}) or {}
# stash the captured token contract for the on-disk adherence re-check.
open(os.environ["WORK"]+"/tokens.json","w").write(json.dumps(toks))
repo=os.environ["REPO1"]
print("HSTATE=%r"     % w.get("state"))
print("HSTATUS=%r"    % (d.get("result") or {}).get("status"))
print("HREASON=%r"    % c.get("reason"))
print("HCOUNT=%r"     % c.get("rolled_count"))
print("HNTOK=%r"      % len(toks.get("colors",[])))
print("HALLADHERE=%r" % (bool(recs) and all(r.get("adherent") is True for r in recs)))
print("HIDS=%r"       % " ".join(r.get("rolled",{}).get("id","") for r in recs))
# coding-write-evidence: every collected surface is a real file on disk.
print("HARTSOK=%r"    % (bool(recs) and all(os.path.exists(r.get("rolled",{}).get("artifact","")) for r in recs)))
# edit-in-place: every artifact is the file at its OWN repo path (repo_root/file),
# NOT an out_dir artifact.
print("HINPLACE=%r"   % (bool(recs) and all(
  r.get("rolled",{}).get("artifact","") == os.path.join(repo, r.get("rolled",{}).get("file","")) for r in recs)))
')"
[ "$HSTATE" = "done" ]              || fail "expected happy state=done, got $HSTATE"
[ "$HSTATUS" = "succeeded" ]        || fail "expected happy status=succeeded, got $HSTATUS"
[ "$HREASON" = "ROLLOUT_COMPLETE" ]|| fail "expected reason=ROLLOUT_COMPLETE, got $HREASON"
[ "$HCOUNT" -eq 2 ] 2>/dev/null    || fail "expected rolled_count=2, got $HCOUNT"
[ "$HNTOK" -eq 9 ] 2>/dev/null     || fail "expected 9 captured color tokens, got $HNTOK"
[ "$HALLADHERE" = "True" ]         || fail "every collected surface must be adherent, got $HALLADHERE"
[ "$HARTSOK" = "True" ]            || fail "every edited artifact must exist on disk"
[ "$HINPLACE" = "True" ]           || fail "every artifact must be the file at repo_root/<surface.file> (edited in place)"

# The files were EDITED IN PLACE, preserving structure + changing only tokens:
#  - content CHANGED from the original fixture,
#  - the @preserve structural marker SURVIVED (framework preserved),
#  - the off-stack `Inter` font is GONE (tokens actually rewritten),
#  - the file is token-adherent ON DISK (independent of the flow's own gate).
for pair in "$F_CSS:$WORK/orig.css" "$F_ASTRO:$WORK/orig.astro"; do
  now="${pair%%:*}"; orig="${pair##*:}"
  cmp -s "$now" "$orig" && fail "fixture $now was NOT edited (identical to original)"
  grep -q "@preserve framework: astro token layer" "$now" || fail "$now lost its @preserve structural marker (framework not preserved)"
  grep -q "Inter" "$now" && fail "$now still references the off-stack Inter font (tokens not rewritten)"
  ADH=$(node "$SCRIPTS_DIR/token-adherence.mjs" "$now" "$WORK/tokens.json" | python3 -c 'import sys,json;print(json.load(sys.stdin)["adherent"])')
  [ "$ADH" = "True" ] || fail "$now is NOT token-adherent on disk after edit"
done
echo "   captured $HNTOK tokens; edited [$HIDS] IN PLACE (repo_root/<file>) → @preserve kept, Inter gone,"
echo "   token-adherent on disk + detect-clean → collected → done  ✓"

echo
echo "== 2/2 ANTI-REGRESSION: [adherent, OFF-SYSTEM] → adherent collects; off-system trips ROLLOUT_REGRESSED =="
REPO2="$WORK/target2"
write_fixture "$REPO2/src/pages/index.astro"
write_fixture "$REPO2/src/styles/global.css"
# surface 0 is on-system (edited in place, collects); surface 1 is defect:true — the
# stub injects an off-palette #123456 + the off-stack `Inter` font INTO the edited
# file, so token-adherence BLOCKS it. max_retry:1 ⇒ one re-edit (deterministic stub
# ⇒ same off-system) ⇒ regressed.
REGRESS_INPUT=$(python3 -c '
import json,sys
print(json.dumps({"definitionId": sys.argv[1], "input": {
  "surfaces":[{"id":"ok-landing","file":"src/pages/index.astro","layout_type":"landing"},
              {"id":"drifted","file":"src/styles/global.css","layout_type":"utility","defect":True}],
  "design_system_path": sys.argv[2],
  "scripts_dir": sys.argv[3], "repo_root": sys.argv[4], "max_retry":1,
}}))' "$DEF" "$DS_PATH" "$SCRIPTS_DIR" "$REPO2")

eval "$(pc "$REGRESS_INPUT" | REPO2="$REPO2" python3 -c '
import sys,json,os
d=json.load(sys.stdin); w=d.get("workflow",{}); c=d.get("context",{})
# IV-b fan-in: only the OK branches carry a rolled record. A regressed surface
# ends its branch `failed`, so it folds up as `fail_count` (the anti-regression
# reduce) — its per-surface off_system detail lives in that failed branch, not in
# the parent context. We assert the fold here + re-prove off-system ON DISK below.
recs=[b.get("output",{}) for b in (c.get("rolled",[]) or []) if b.get("ok")]
repo=os.environ["REPO2"]
print("RSTATE=%r"   % w.get("state"))
print("RSTATUS=%r"  % (d.get("result") or {}).get("status"))
print("RREASON=%r"  % c.get("reason"))
print("RCOUNT=%r"   % c.get("rolled_count"))
print("RFAIL=%r"    % c.get("fail_count"))
print("RROLLEDIDS=%r" % " ".join(r.get("rolled",{}).get("id","") for r in recs))
# the collected adherent surface is edited in place at its own repo path.
print("RINPLACE=%r" % (bool(recs) and all(
  r.get("rolled",{}).get("artifact","") == os.path.join(repo, r.get("rolled",{}).get("file","")) for r in recs)))
')"
[ "$RSTATE" = "failed" ]              || fail "expected regressed state=failed, got $RSTATE"
[ "$RSTATUS" = "failed" ]            || fail "expected regressed status=failed, got $RSTATUS"
[ "$RREASON" = "ROLLOUT_REGRESSED" ] || fail "expected reason=ROLLOUT_REGRESSED, got $RREASON"
[ "$RCOUNT" -eq 1 ] 2>/dev/null      || fail "adherent surface must still collect (rolled_count=1), got $RCOUNT"
[ "$RFAIL" -eq 1 ] 2>/dev/null        || fail "the off-system surface must fold through failed_count=1, got $RFAIL"
[ "$RROLLEDIDS" = "ok-landing" ]     || fail "only the adherent surface should be collected, got [$RROLLEDIDS]"
[ "$RINPLACE" = "True" ]             || fail "the collected surface must be edited at repo_root/<surface.file>"
# the drifted fixture was still edited IN PLACE (exists, non-empty) — it just failed the gate.
[ -s "$REPO2/src/styles/global.css" ] || fail "the drifted fixture must still have been edited in place"
# off_system detail now lives per-branch (a failed branch folds only failed_count
# up). Re-prove the offending color + font by re-checking the drifted file ON DISK
# (stronger than a context echo) via the SAME token-adherence core the gate uses.
DRIFT_OFF=$(node "$SCRIPTS_DIR/token-adherence.mjs" "$REPO2/src/styles/global.css" "$WORK/tokens.json" | python3 -c '
import sys,json
d=json.load(sys.stdin); off=d.get("off_system",[]) or []
kinds=",".join(sorted({o.get("kind","") for o in off}))
hascolor=any(o.get("kind")=="color" and "123456" in str(o.get("value","")) for o in off)
hasfont=any(o.get("kind")=="font" and "Inter" in str(o.get("value","")) for o in off)
shapeok=bool(off) and all(set(["kind","value","line"]).issubset(o) for o in off)
print("%s|%s|%s|%s|%s" % (kinds, hascolor, hasfont, shapeok, len(off)))')
IFS="|" read RKINDS RHASCOLOR RHASFONT RSHAPEOK ROFFN <<< "$DRIFT_OFF"
[ "$RHASCOLOR" = "True" ]            || fail "the drifted file on disk must flag the off-palette #123456 color"
[ "$RHASFONT" = "True" ]             || fail "the drifted file on disk must flag the off-stack Inter font"
[ "$RSHAPEOK" = "True" ]             || fail "each off_system finding must carry {kind,value,line}"
echo "   adherent 'ok-landing' edited in place + collected; 'drifted' FAILED token-adherence (kinds=$RKINDS, n=$ROFFN)"
echo "   → folded through failed_count=1 → ROLLOUT_REGRESSED  ✓"

echo
echo "DRIVE OK — capture → per-surface apply(stub, EDIT IN PLACE at repo_root/<file>) → token-adherence"
echo "           + detect gates → collect; an off-system edit trips ROLLOUT_REGRESSED after bounded retry"
echo "           (the anti-regression floor). Files are edited at their own repo paths, structure preserved."
