#!/bin/bash
# Apply patches from root directory where node_modules are hoisted
cd "$(dirname "$0")/../.." && npx patch-package --patch-dir patches
