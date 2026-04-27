#!/bin/bash
set -eo pipefail

if [ -z "$1" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

issues=$(gh issue list --state open --json number,title,body,comments)

npx tsx ./.sandcastle/main.ts "$issues" "$1"
