

/**
 * TextCodec polyfill for Rust/WASM interop.
 * 
 * Only supports UTF-8 <--> UTF-16 and String.
 * 
 * WASM/JS string interop notes:
 * 
 */
// import * as wasm from '../test/wasm_module.js';
import * as wasm from '../test/wasm_module.js';

// Align SCRATCH_BASE to 64 bytes for SIMD
const SCRATCH_BASE = 0;
const PAGE_SIZE = 65536;

/**
 * TextEncoder encodes JavaScript strings (UTF-16) into UTF-8 byte arrays.
 * @see https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder
 */
export class TextEncoder {
	/**
	 * The encoding used by this TextEncoder instance (always 'utf-8').
	 * @type {string}
	 */
	encoding;

	#memory;

	constructor() {
		/**
		 * @type {string}
		 */
		this.encoding = 'utf-8';
		this.#memory = wasm.exports.memory;
	}

	/**
	 * Encodes a given string into a new Uint8Array containing UTF-8 encoded bytes.
	 * @param {string} input - The string to encode.
	 * @returns {Uint8Array} The UTF-8 encoded bytes.
	 */
	encode(input) {
		const string = String(input);
		// Maximum possible size for UTF-8 is 4 bytes per code unit (worst case for non-BMP)
		const maxBytes = string.length * 4;
		// Ensure WASM memory is large enough
		this.#ensureMemory(maxBytes);
		const buffer = new Uint8Array(this.#memory.buffer, SCRATCH_BASE, maxBytes);
		// Call WASM string_to_utf8 (returns written count)
		const written = wasm.exports.string_to_utf8(string, SCRATCH_BASE, maxBytes);
		// Copy result to a new buffer to avoid exposing WASM memory
		return new Uint8Array(buffer.buffer, buffer.byteOffset, written).slice();
	}

	/**
	 * Ensure WASM memory is large enough for the required number of bytes.
	 * @param {number} requiredBytes
	 */
	#ensureMemory(requiredBytes) {
		const memory = this.#memory;
		const buffer = memory.buffer;
		if (buffer.byteLength < requiredBytes) {
			// Calculate required pages (64 KiB per page)
			const needed = requiredBytes - buffer.byteLength;
			const pages = Math.ceil(needed / PAGE_SIZE);
			memory.grow(pages);
		}
	}

	/**
	 * Encodes a string into a destination Uint8Array buffer.
	 * @param {string} source - The string to encode.
	 * @param {Uint8Array} destination - The buffer to write the UTF-8 bytes into.
	 * @returns {{read: number, written: number}} Object with the number of code units read and bytes written.
	 */
	encodeInto(source, destination) {
		const srcLen = source.length;
		// Write into WASM memory at SCRATCH_BASE
		const maxBytes = destination.length;
        this.#ensureMemory(maxBytes);
		const written = wasm.exports.string_to_utf8(source, SCRATCH_BASE, maxBytes);
		// Copy from WASM memory to destination
		const bufferOut = new Uint8Array(this.#memory.memory.buffer, SCRATCH_BASE, written);
		destination.set(bufferOut.subarray(0, written));
		return { read: srcLen, written };
	}

}

/**
 * TextDecoder decodes UTF-8 byte arrays into JavaScript strings (UTF-16).
 * @see https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder
 */
export class TextDecoder {
	/**
	 * The encoding used by this TextDecoder instance (usually 'utf-8').
	 * @type {string}
	 */
	encoding;
	/**
	 * Whether decoding errors are fatal.
	 * @type {boolean}
	 */
	fatal;
	/**
	 * Whether to ignore the BOM (Byte Order Mark).
	 * @type {boolean}
	 */
	ignoreBOM;

	#memory;

	/**
	 * @param {string} [label='utf-8'] - The label of the encoding.
	 * @param {{fatal?: boolean, ignoreBOM?: boolean}} [options={}] - Decoder options.
	 */
	constructor(label = 'utf-8', options = {}) {
		/** @type {string} */
		this.encoding = label.toLowerCase();
		/** @type {boolean} */
		this.fatal = options.fatal || false;
		/** @type {boolean} */
		this.ignoreBOM = options.ignoreBOM || false;

		this.#memory = wasm.exports.memory;
	}

	/**
	 * Decodes a UTF-8 byte array or ArrayBuffer into a JavaScript string.
	 * @param {Uint8Array|ArrayBuffer} input - The data to decode.
	 * @param {{stream?: boolean}} [options={}] - Decoder options.
	 * @returns {string} The decoded string.
	 * @throws {TypeError} If input is not a Uint8Array or ArrayBuffer.
	 */
	decode(input, options = {}) {
		if (input == undefined)
			return;
		if (!(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) {
			throw new TypeError('Input must be a Uint8Array or ArrayBuffer');
		}
		const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
		const bytesLength = bytes.length;
		// Copy input to WASM memory at SCRATCH_BASE
		this.#ensureMemory(bytesLength);
		const bufferIn = new Uint8Array(this.#memory.buffer, SCRATCH_BASE, bytesLength);
		bufferIn.set(bytes);
		// Call WASM utf8_to_string (returns externref string)
		const result = wasm.exports.utf8_to_string(SCRATCH_BASE, bytesLength);
		// The returned value is a JS string (via string builtins)
		return result;
	}

	/**
	 * Ensure WASM memory is large enough for the required number of bytes.
	 * @param {number} requiredBytes
	 */
	#ensureMemory(requiredBytes) {
		const memory = this.#memory;
		const buffer = memory.buffer;
		if (buffer.byteLength < requiredBytes) {
			// Calculate required pages (64 KiB per page)
			const needed = requiredBytes - buffer.byteLength;
			const pages = Math.ceil(needed / PAGE_SIZE);
			memory.grow(pages);
		}
	}
}