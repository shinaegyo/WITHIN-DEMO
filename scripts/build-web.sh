#!/bin/bash
# Builds the shareable web version into dist/.
set -e
cd "$(dirname "$0")/.."
export PATH="/usr/local/opt/node@20/bin:$PATH"
rm -rf dist
npx expo export --platform web
node scripts/postprocess-web.mjs
echo
echo "Done. Deploy the dist/ folder."
