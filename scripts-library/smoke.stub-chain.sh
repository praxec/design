#!/usr/bin/env bash
# smoke.stub-chain.sh — exercise the Increment-I offline spine end to end:
#   generate (stub) → render (stub) → score (G/fit/seed) → detect (usability floor).
#
# It materializes each shipped scripts-library `body:` to a temp file exactly as
# the praxec script executor would (write body → chmod → exec via shebang), so
# this proves the AUTHORED bodies run — not a hand-rewritten copy. Offline; no
# gateway, no browser, no LLM. Exits non-zero on any broken link in the chain.
set -euo pipefail

PACK_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS_DIR="$PACK_DIR/scripts-library"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Extract a scripts-library body to $WORK/<subject>.body and print the path.
materialize() {
  local file="$1"
  local subject="$2"
  local out="$WORK/$subject.body"
  python3 - "$file" "$subject" "$out" <<'PY'
import sys, yaml
src, subject, out = sys.argv[1], sys.argv[2], sys.argv[3]
doc = yaml.safe_load(open(src))
body = doc["scripts"][subject]["body"]
open(out, "w").write(body)
PY
  chmod 0755 "$out"
  echo "$out"
}

echo "== 1/4 generate (stub) =="
GEN="$(materialize "$SCRIPTS_DIR/run.generate-direction.yaml" run.generate-direction)"
GEN_OUT="$("$GEN" "$WORK/candidates" '{"corners":"square","type":"serif","grid":"asymmetric"}' smoke-01)"
echo "$GEN_OUT"
ARTIFACT="$(printf '%s' "$GEN_OUT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["candidate"]["artifact"])')"
test -f "$ARTIFACT" || { echo "FAIL: candidate not written"; exit 1; }

echo "== 2/4 render (stub) =="
REN="$(materialize "$SCRIPTS_DIR/run.render-thumbnail.yaml" run.render-thumbnail)"
REN_OUT="$("$REN" "$ARTIFACT" "$WORK/thumbs" smoke-01)"
echo "$REN_OUT"
THUMB="$(printf '%s' "$REN_OUT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["thumbnail"]["artifact"])')"
test -f "$THUMB" || { echo "FAIL: thumbnail not written"; exit 1; }

echo "== 3/4 score (G + fit + seed-adherence) =="
SCO="$(materialize "$SCRIPTS_DIR/inspect.score-axes.yaml" inspect.score-axes)"
SCO_OUT="$("$SCO" "$SCRIPTS_DIR" "$ARTIFACT" \
  '{"corners":"square","grid":"asymmetric","type":"serif"}' \
  '{"app":"dashboard","needs":["density","hierarchy"]}')"
echo "$SCO_OUT"
printf '%s' "$SCO_OUT" | python3 -c '
import sys,json
d=json.load(sys.stdin)
assert "G" in d and isinstance(d["G"],(int,float)), "no numeric G"
assert d["seed_adherence"]["ok"] is True, "stub candidate should adhere to its own seed"
g=d["G"]; dist=d["distinctive"]; ok=d["seed_adherence"]["ok"]; fit=d["fit"]["score"]
print("   G=%.3f distinctive=%s seed_ok=%s fit=%s" % (g, dist, ok, fit))
'

echo "== 4/4 detect (usability floor) =="
DET="$(materialize "$SCRIPTS_DIR/verify.antipatterns.yaml" verify.antipatterns)"
DET_OUT="$("$DET" "$ARTIFACT")"
echo "$DET_OUT"
printf '%s' "$DET_OUT" | python3 -c '
import sys,json
d=json.load(sys.stdin)
assert "usable" in d and "antipattern_count" in d, "detect verdict missing fields"
print("   antipattern_count=%s usable=%s" % (d["antipattern_count"], d["usable"]))
'

echo
echo "== fail-fast: CANDIDATE_NOT_RENDERABLE on a missing candidate =="
if "$REN" "$WORK/does-not-exist.html" "$WORK/thumbs" 2>/tmp/renderr; then
  echo "FAIL: render should have failed fast on missing candidate"; exit 1
fi
grep -q CANDIDATE_NOT_RENDERABLE /tmp/renderr && echo "   OK: render fails fast (CANDIDATE_NOT_RENDERABLE)"

echo
echo "STUB CHAIN OK"
