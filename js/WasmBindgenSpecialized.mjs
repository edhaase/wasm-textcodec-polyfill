

/**
 * TextCodec polyfill for Rust/WASM interop.
 * 
 * Only supports UTF-8 <--> UTF-16 and String.
 * This version contains specializations for wasm_bindgen.
 * 
 */
// import * as wasm from '../test/wasm_module.js';
import { sharedCodec, privateCodec } from '../test/wasm_module_pair.js';

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

	constructor() {
		/**
		 * @type {string}
		 */
		this.encoding = 'utf-8';
	}

	/**
	 * Ensure WASM memory is large enough for the required number of bytes. This is only needed for the
	 * private-memory codec.
	 * @param {number} requiredBytes
	 */
	#ensureMemory(requiredBytes) {
		const memory = privateCodec.memory;
		const buffer = memory.buffer;
		if (buffer.byteLength < requiredBytes) {
			// Calculate required pages (64 KiB per page)
			const needed = requiredBytes - buffer.byteLength;
			const pages = Math.ceil(needed / PAGE_SIZE);
			memory.grow(pages);
		}
	}

	/**
	 * Encodes a given string into a new Uint8Array containing UTF-8 encoded bytes.
	 * 
	 * This method *always* uses the private codec.
	 * 
	 * @param {string} input - The string to encode.
	 * @returns {Uint8Array} The UTF-8 encoded bytes.
	 */
	encode(input) {
		const string = String(input);
		// Maximum possible size for UTF-8 is 4 bytes per code unit (worst case for non-BMP)
		const maxBytes = string.length * 4;
		// Ensure WASM memory is large enough
		this.#ensureMemory(maxBytes);
		const buffer = new Uint8Array(privateCodec.memory.buffer, SCRATCH_BASE, maxBytes);
		// Call WASM string_to_utf8 (returns written count)
		const written = privateCodec.exports.string_to_utf8(string, SCRATCH_BASE, maxBytes);
		// wasm_bindgen is unlikely to call encode(), but if it does, it
		// will make it's own copy of the buffer, so we remove the .slice() step as it's redundant.
		return new Uint8Array(buffer.buffer, buffer.byteOffset, written);
	}

	/**
	 * Encodes a string into a destination Uint8Array buffer.
	 * @param {string} source - The string to encode.
	 * @param {Uint8Array} destination - The buffer to write the UTF-8 bytes into.
	 * @returns {{read: number, written: number}} Object with the number of code units read and bytes written.
	 */
	encodeInto(source, destination) {
		const string = String(source);
		const srcLen = string.length;
		// Write into WASM memory at SCRATCH_BASE
		const maxBytes = destination.length;
		if (destination.buffer === sharedCodec.memory.buffer) {
			// We've received a shared memory object and can avoid a copy.
			const written = sharedCodec.exports.string_to_utf8(string, destination.byteOffset, destination.length);
			return { read: srcLen, written };
		} else {
			this.#ensureMemory(maxBytes);
			const written = privateCodec.exports.string_to_utf8(string, SCRATCH_BASE, maxBytes);
			const bufferOut = new Uint8Array(privateCodec.memory.buffer, SCRATCH_BASE, written);
			destination.set(bufferOut.subarray(0, written));
			return { read: srcLen, written };
		}
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
	}

	/**
	 * Ensure WASM memory is large enough for the required number of bytes.
	 * This is only needed for the private-memory codec.
	 * @param {number} requiredBytes
	 */
	#ensureMemory(requiredBytes) {
		const memory = privateCodec.memory;
		const buffer = memory.buffer;
		if (buffer.byteLength < requiredBytes) {
			// Calculate required pages (64 KiB per page)
			const needed = requiredBytes - buffer.byteLength;
			const pages = Math.ceil(needed / PAGE_SIZE);
			memory.grow(pages);
		}
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
		if (input.buffer === sharedCodec.memory.buffer) {
			return sharedCodec.exports.utf8_to_string(bytes.byteOffset, bytesLength);
		} else {
			// Copy input to WASM memory at SCRATCH_BASE
			this.#ensureMemory(bytesLength);
			const bufferIn = new Uint8Array(privateCodec.memory.buffer, SCRATCH_BASE, bytesLength);
			bufferIn.set(bytes);
			// Call WASM utf8_to_string (returns externref string)
			return privateCodec.exports.utf8_to_string(SCRATCH_BASE, bytesLength);
		}
	}


}