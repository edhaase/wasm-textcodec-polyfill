

TextCodec
===

Pure WAT polyfill for TextEncoder/TextDecoder leveraging the wasm `js-string` builtin to provide fast conversion.

I built this to support WASM in `isolated-vm` projects, which do not and _can not_ access native TextEncoder/TextDecoder.

The specific use case was supporting Rust `wasm_bindgen` projects.

## Usage

Building WAT file will produce a WASM module you can load:
```
const wasmModule = new WebAssembly.Module(wasmBytes, {
		builtins: ["js-string"]
});
```

## Methods exported from src/codec.wat

### uint16array_to_string
Convert a region of WASM linear memory (interpreted as a Uint16Array of UTF-16 code units) to a JavaScript string. This is a fast path to get a string from character codes.

### string_to_gcarray
Converts a javascript string to a wasm gc array.

### string_to_utf8
Provides our `encodeInto` behavior. Converts a javascript string to UTF-8, populating a Uint8Array slice.

### utf8_to_string
Converts a UTF-8 string (stored in a Uint8Array slice) into a javascript string.
Provides our `decode` functionality. 

---

## Stuff I might add later

- Streaming support: Functions that maintain state for incremental encoding/decoding
- Support for fatal/non-fatal decoding
- Support for BOM handling
- Support for other encodings (optional, rarely needed
