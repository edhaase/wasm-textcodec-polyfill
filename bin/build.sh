#!/bin/bash
# Compile src/codec.wat to WASM and run a test case
set -e

WAT=src/codec.wat
WASM=target/codec.wasm
WASM_AS="./node_modules/.bin/wasm-as"
WASM_OPT="./node_modules/.bin/wasm-opt"

# Define shared feature flags
FEATURES="--enable-gc \
          --enable-reference-types \
          --enable-bulk-memory \
          --enable-simd \
          --enable-relaxed-simd \
          --disable-custom-descriptors"

# Compile WAT to WASM using wasm-as

"$WASM_AS" "$WAT" -o "$WASM" $FEATURES
echo "Compiled $WAT to $WASM using wasm-as"
ls -lh "$WASM"

"$WASM_OPT" $FEATURES -O4 -o "$WASM" "$WASM" 
echo "Optimized $WASM with wasm-opt -O4"
ls -lh "$WASM"