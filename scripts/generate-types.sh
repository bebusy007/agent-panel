#!/bin/bash
set -e
cd "$(dirname "$0")/../src-server"
cargo test export_ts -- --test-output-format pretty 2>/dev/null || cargo test 2>/dev/null
cp bindings/*.ts ../web/src/types/
echo "Generated TypeScript types in web/src/types/"
