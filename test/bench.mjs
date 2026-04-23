// @todo write benchmarks using ivm
import { TextEncoder as PolyfillTextEncoder, TextDecoder as PolyfillTextDecoder } from '../js/TextCodec.mjs';

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
	decode(encoded);

	const encodeResult = timeLoop(iterations, () => {
		return encode(input).length;
	});
	const decodeResult = timeLoop(iterations, () => {
		return decode(encoded).length;
	});

	console.log(`${name} encode: ${(encodeResult.elapsed / BigInt(iterations))} ns/op`);
	console.log(`${name} decode: ${(decodeResult.elapsed / BigInt(iterations))} ns/op`);
}

function main() {
	const inputLength = 10000;
	const iterations = 1000;
	const input = makeInput(inputLength);

	bench({
		name: 'Native',
		encode: (str) => new NativeTextEncoder().encode(str),
		decode: (buf) => new NativeTextDecoder('utf-8').decode(buf),
		input,
		iterations,
	});

	bench({
		name: 'Polyfill',
		encode: (str) => new PolyfillTextEncoder().encode(str),
		decode: (buf) => new PolyfillTextDecoder('utf-8').decode(buf),
		input,
		iterations,
	});
}

main();