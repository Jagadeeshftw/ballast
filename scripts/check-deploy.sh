#!/usr/bin/env bash
# Compare the commit the LIVE site was built from against local HEAD.
#
# Exists because "pushed" and "deployed" are different things, and on Vickrey four commits
# sat pushed-and-undeployed with nothing to reveal it. Run before recording anything.
set -euo pipefail

URL="${1:-${BALLAST_URL:-}}"
if [ -z "$URL" ]; then
  echo "usage: scripts/check-deploy.sh https://your-deployment.example" >&2
  exit 2
fi

HEAD_SHA="$(git rev-parse HEAD)"
REMOTE="$(curl -fsS "${URL%/}/api/version")" || { echo "FAIL: could not reach ${URL%/}/api/version" >&2; exit 1; }
LIVE_SHA="$(printf '%s' "$REMOTE" | sed -n 's/.*"commit":"\([^"]*\)".*/\1/p')"
BUILT_AT="$(printf '%s' "$REMOTE" | sed -n 's/.*"builtAt":"\([^"]*\)".*/\1/p')"

echo "local HEAD : $HEAD_SHA"
echo "live build : $LIVE_SHA"
echo "built at   : $BUILT_AT"

if [ "$LIVE_SHA" = "$HEAD_SHA" ]; then
  echo "OK — the live site is running local HEAD."
  exit 0
fi

if git cat-file -e "${LIVE_SHA}^{commit}" 2>/dev/null; then
  BEHIND="$(git rev-list --count "${LIVE_SHA}..HEAD" 2>/dev/null || echo '?')"
  echo "DRIFT — the live site is $BEHIND commit(s) behind local HEAD."
  git --no-pager log --oneline "${LIVE_SHA}..HEAD" 2>/dev/null | sed 's/^/    /' || true
else
  echo "DRIFT — the live build's commit is not in this repository."
fi
exit 1
