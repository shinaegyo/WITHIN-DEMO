#!/bin/bash
# Builds the shareable web version into dist/.
set -e
cd "$(dirname "$0")/.."
export PATH="/usr/local/opt/node@20/bin:$PATH"
rm -rf dist

# Stamp the build into the bundle and alongside it, so a running app can tell
# whether it is the current one. Vercel checks out a detached HEAD; its own
# commit variable is the reliable source there.
BUILD="${VERCEL_GIT_COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo dev)}"
export EXPO_PUBLIC_BUILD="${BUILD:0:7}"

npx expo export --platform web
node scripts/postprocess-web.mjs
printf '{"build":"%s"}' "${EXPO_PUBLIC_BUILD}" > dist/version.json
echo
echo "Done. Deploy the dist/ folder."
