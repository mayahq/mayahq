#!/bin/bash
# Railway build script for yarn workspaces

# Install yarn globally (if not already available)
npm install -g yarn

# Install all dependencies from root
yarn install

# Build the specific service based on RAILWAY_SERVICE env var
if [ "$RAILWAY_SERVICE" = "maya-thoughts" ]; then
  yarn workspace @mayahq/maya-thoughts build
elif [ "$RAILWAY_SERVICE" = "maya-core" ]; then
  yarn workspace @mayahq/maya-core build
elif [ "$RAILWAY_SERVICE" = "memory-worker" ]; then
  yarn workspace @mayahq/memory-worker build
fi