#!/bin/bash

# Set higher memory limit for Node (8GB)
export NODE_OPTIONS="--max-old-space-size=8192"

# Set env vars to optimize for memory usage with large content
export MAX_CONTENT_LENGTH=500  # Shorter chunks
export BATCH_SIZE=10           # Process in smaller batches

# Run the indexer with expose-gc flag to allow manual garbage collection
node --expose-gc portable-indexer.js "$@" 