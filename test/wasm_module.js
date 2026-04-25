// js/wasm_module.js

/**
 * Minimal loader for textencoder_wasm.wasm
 *
 * This loader supports sharing a WebAssembly.Memory instance between modules.
 * Pass an existing memory object to share memory, or omit to let the module create its own.
 *
 * Buffer allocation strategy (no wasm_bindgen):
 * - For best safety and performance, JS should allocate buffers in WASM memory and pass pointers/lengths to WASM functions.
 * - This avoids memory corruption and lets JS manage buffer reuse and lifetime.
 * - If WASM allocates output buffers, you must provide a way for JS to discover the pointer/length and free memory, which is more error-prone without glue code.
 */

const DEFAULT_PATH = '../target/codec.wasm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// usage:
// const module = new WebAssembly.Module(wasmBytes, {
//		builtins: ["js-string"]
// });


const resolvedPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), DEFAULT_PATH);
const wasmBuffer = fs.readFileSync(resolvedPath);
const importObject = {};
export const memory = new WebAssembly.Memory({ initial: 32, maximum: 256 });
if (memory) {
	importObject.env = importObject.env || {};
	importObject.env.memory = memory;
}
export const module = new WebAssembly.Module(wasmBuffer, {
	builtins: ["js-string"]
});
export const instance = new WebAssembly.Instance(module, importObject);
export const { exports } = instance;
