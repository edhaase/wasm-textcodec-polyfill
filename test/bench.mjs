// @todo write benchmarks using ivm
import { TextEncoder as PolyfillTextEncoder, TextDecoder as PolyfillTextDecoder } from '../js/TextCodec.mjs';
// Benchmark: encodeInto with destination as a slice of shared WASM memory (zero-copy path)
import { TextEncoder as WasmBindgenTextEncoder, TextDecoder as WasmBindgenTextDecoder } from '../js/WasmBindgenSpecialized.mjs';
import { sharedCodec } from './wasm_module_pair.js';

const NativeTextEncoder = globalThis.TextEncoder;
const NativeTextDecoder = globalThis.TextDecoder;
import 'fastestsmallesttextencoderdecoder-encodeinto/EncoderDecoderTogether.min.js';


const JS_CHUNK_SIZE = 0x8000;

function makeInput(length) {
	const values = new Uint16Array(length);
	for (let index = 0; index < length; index += 1) {
		values[index] = 32 + (index % 95);
	}
	return values;
}

function makeInputStr(length) {
	return new NativeTextDecoder().decode(makeInput(length));
}

function formatNsPerUnit(totalNs, iterations, length) {
	return Number(totalNs) / iterations / length;
}

function timeLoop(iterations, work) {
	let checksum = 0;
	const start = process.hrtime.bigint();
	for (let iteration = 0; iteration < iterations; iteration += 1) {
		checksum += work(iteration);
	}
	const elapsed = process.hrtime.bigint() - start;
	return { elapsed, checksum };
}

function bench({ name, encode, decode, input, iterations }) {
	// Warmup
	encode(input);
	const encoded = encode(input);
	const decoded = decode(encoded);

	// console.log('input:', JSON.stringify(input), input.length, [...input].map(c => c.charCodeAt(0)));
	// console.log('decoded:', JSON.stringify(decoded), decoded.length, [...decoded].map(c => c.charCodeAt(0)));

	if (input != decoded)
		throw new TypeError(`Mismatch type: [${input}] !== [${decoded}] ${typeof input} ${typeof decoded}`);

	const encodeResult = timeLoop(iterations, () => {
		return encode(input).length;
	});
	const decodeResult = timeLoop(iterations, () => {
		return decode(encoded).length;
	});

	console.log(`${name} encode: ${(encodeResult.elapsed / BigInt(iterations))} ns/op`);
	console.log(`${name} decode: ${(decodeResult.elapsed / BigInt(iterations))} ns/op`);
}

// const inputLength = 10000;
const inputLength = 2*1024*1024;
// const inputLength = 25;
const iterations = 1000;
const input = makeInputStr(inputLength);

bench({
	name: 'Native',
	encode: (str) => new NativeTextEncoder().encode(str),
	decode: (buf) => new NativeTextDecoder('utf-8').decode(buf),
	input,
	iterations,
});

bench({
	name: 'WAT Polyfill',
	encode: (str) => new PolyfillTextEncoder().encode(str),
	decode: (buf) => new PolyfillTextDecoder('utf-8').decode(buf),
	input,
	iterations,
});


const encoder = new WasmBindgenTextEncoder();
// Allocate a buffer in shared WASM memory
// sharedCodec.memory.grow(256);
const sharedBuffer = new Uint8Array(sharedCodec.memory.buffer, 0, input.length * 4); // max possible size

bench({
	name: 'WasmBindgenSpecialization (shared memory)',
	encode: (str) => {
		const { written } = encoder.encodeInto(str, sharedBuffer);
		// Return a slice for decode
		// (simulate the actual written length)
		// For benchmark, just return the buffer
		return sharedBuffer.subarray(0, written);
	},
	decode: (buf) => new WasmBindgenTextDecoder('utf-8').decode(buf),
	input,
	iterations,
});
