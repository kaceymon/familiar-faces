#!/bin/sh
# Builds the LG webOS TV app (.ipk) from the same files as the website.
# Needs the webOS CLI: npm install -g @webos-tools/cli
# Run from the repo root: sh webos/build.sh   ->   dist/com.kaceymon.familiarfaces_<version>_all.ipk
set -e
cd "$(dirname "$0")/.."
rm -rf dist/app && mkdir -p dist/app/assets
cp index.html game.js dist/app/
cp webos/appinfo.json webos/icon.png webos/largeIcon.png webos/splash.png dist/app/
for f in screen.jpg faces.webp combos.webp settings.webp ribbon.webp Inter-ExtraBold.ttf Inter-SemiBold.ttf OFL.txt \
         fd_drop.wav fd_merge.wav fd_big.wav fd_over.wav fd_start.wav fd_click.wav; do
  cp "assets/$f" dist/app/assets/
done
ares-package dist/app -o dist
ls -la dist/*.ipk
