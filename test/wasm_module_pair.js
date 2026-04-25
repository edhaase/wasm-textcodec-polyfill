/**
 * Loads two instances of the codec:
 * 1. With private linear memory (default, not shared)
 * 2. With a shared WebAssembly.Memory object (to be shared with a wasm_bindgen module)
 *
 * ---
 * How to use the shared memory with wasm_bindgen:
 *
 * 1. Create a WebAssembly.Memory object and pass it to both the codec and your wasm_bindgen module:
 *
 *    const sharedMemory = new WebAssembly.Memory({ initial: 10, maximum: 100, shared: false });
 *    // For codec:
 *    const codecInstance = new WebAssembly.Instance(codecModule, { env: { memory: sharedMemory } });
 *    // For wasm_bindgen module:
 *    const bindgenInstance = new WebAssembly.Instance(bindgenModule, { env: { memory: sharedMemory } });
 *
 * 2. Both modules will read/write to the same linear memory, allowing zero-copy interop.
 * 3. Make sure both modules expect the same memory layout and do not overwrite each other's data unintentionally.
 *
 * Note: If using threads, set `shared: true` in the Memory constructor.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_PATH = '../target/codec.wasm';
const resolvedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), DEFAULT_PATH);
const wasmBuffer = fs.readFileSync(resolvedPath);

// 1. Instance with private linear memory (not shared).
// This instance is for arbritary slices.
const privateMemory = new WebAssembly.Memory({ initial: 32, maximum: 256 });
const privateImportObject = { env: { memory: privateMemory } };
const privateModule = new WebAssembly.Module(wasmBuffer, { builtins: ["js-string"] });
const privateInstance = new WebAssembly.Instance(privateModule, privateImportObject);
export const privateCodec = {
	module: privateModule,
	instance: privateInstance,
	exports: privateInstance.exports,
	memory: privateMemory
};

// 2. Instance with shared WebAssembly.Memory (to be shared with wasm_bindgen)
// This is used for reduced copy operations when integrated into a bot.
const sharedMemory = new WebAssembly.Memory({ initial: 256, maximum: 256 });
const sharedImportObject = { env: { memory: sharedMemory } };
const sharedModule = new WebAssembly.Module(wasmBuffer, { builtins: ["js-string"] });
const sharedInstance = new WebAssembly.Instance(sharedModule, sharedImportObject);
export const sharedCodec = {
	module: sharedModule,
	instance: sharedInstance,
	exports: sharedInstance.exports,
	memory: sharedMemory
};
