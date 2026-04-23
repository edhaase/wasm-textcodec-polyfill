// Test runner for codec.wasm
import fs from 'fs';
// import { WASI } from 'wasi';
import { argv, env } from 'process';
import { readFile } from 'fs/promises';
import { TextEncoder, TextDecoder } from '../js/TextCodec.mjs';

const wasmPath = argv[2] || 'target/codec.wasm';

const inputStr = 'hello 𝄞 world';
const encoder = new TextEncoder();
const utf8 = encoder.encode(inputStr);

const decoder = new TextDecoder();
const outputStr = decoder.decode(utf8);
if (outputStr != inputStr)
	throw new Error(`${outputStr} does not expected ${inputStr}`);
