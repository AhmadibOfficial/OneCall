#!/usr/bin/env bash

set -e

echo "======================================"
echo " OneCall Monorepo Migration"
echo "======================================"

ROOT=$(pwd)

echo "Project Root: $ROOT"

# Ensure we're in a Flutter project
if [ ! -f "pubspec.yaml" ]; then
    echo "Error: pubspec.yaml not found."
    echo "Run this script from the OneCall root."
    exit 1
fi

echo
echo "Creating monorepo directories..."

mkdir -p apps
mkdir -p apps/mobile

mkdir -p packages/shared
mkdir -p packages/ui
mkdir -p packages/config
mkdir -p packages/types

mkdir -p infrastructure/docker
mkdir -p infrastructure/nginx
mkdir -p infrastructure/postgres
mkdir -p infrastructure/scripts

mkdir -p docs
mkdir -p .github/workflows

echo
echo "Moving Flutter project..."

mv android apps/mobile/
mv ios apps/mobile/
mv lib apps/mobile/
mv linux apps/mobile/
mv macos apps/mobile/
mv web apps/mobile/
mv windows apps/mobile/

mv test apps/mobile/

mv pubspec.yaml apps/mobile/
mv pubspec.lock apps/mobile/

mv analysis_options.yaml apps/mobile/
mv .metadata apps/mobile/
mv onecall.iml apps/mobile/

# Move optional directories/files if they exist
[ -d ".idea" ] && mv .idea apps/mobile/
[ -f ".flutter-plugins-dependencies" ] && mv .flutter-plugins-dependencies apps/mobile/

echo
echo "Cleaning generated folders..."

rm -rf build
rm -rf .dart_tool

echo
echo "Moving backend..."

if [ -d backend ]; then
    mv backend apps/
fi

echo
echo "Creating root README..."

cat > README.md <<EOF
# OneCall

Enterprise Super App Monorepo

## Apps

- apps/mobile
- apps/backend
- apps/admin
- apps/website

EOF

echo
echo "Done!"

echo
echo "Final structure:"

find . -maxdepth 2 -type d | sort

echo
echo "Migration completed successfully."
