;; WASM polyfill for TextEncoder/TextDecoder.
;; Written directly in WAT format to leverage extern ref and wasm built-ins that aren't supported by rust.
(module
	;; Create helper types
	(type $array_i16 (array (mut i16)))
	(type $array_i8 (array (mut i8)))
	
	;; Imports must come first	

	;; Converts a Wasm GC array of UTF-16 code units to a JavaScript string.
	;;   @param (ref null $array_i16): Nullable reference to a Wasm array of i16 (UTF-16 code units).
	;;   @param i32: Start index in the array.
	;;   @param i32: Length of the slice to convert.
	;;   @returns (ref extern): JavaScript string object (externref).
	;;   If the array is null, the result is an empty string or throws, depending on the host.
	;;   See: https://github.com/WebAssembly/js-string-builtins/blob/main/proposals/js-string-builtins/Overview.md#wasmjs-string-fromcharcodearray
	(import "wasm:js-string" "fromCharCodeArray"
		(func $fromCharCodeArray (param (ref null $array_i16) i32 i32) (result (ref extern)))
	)

	;; Populates a Wasm GC array of UTF-16 code units from a JavaScript string.
	;;   @param externref: JavaScript string object.
	;;   @param (ref null $array_i16): Nullable reference to a Wasm array to fill.
	;;   @param i32: Start index in the array.
	;;   @returns i32: Number of code units written.
	;;   If the array is null, no operation is performed or an error may be thrown.
	;;   See: https://github.com/WebAssembly/js-string-builtins/blob/main/proposals/js-string-builtins/Overview.md#wasmjs-string-intocharcodearray
	(import "wasm:js-string" "intoCharCodeArray"
		(func $intoCharCodeArray (param externref (ref null $array_i16) i32) (result i32))
	)

	;; Returns the length (in UTF-16 code units) of a JavaScript string.
	;;   @param externref: JavaScript string object.
	;;   @returns i32: Length of the string.
	;;   See: https://github.com/WebAssembly/js-string-builtins/blob/main/proposals/js-string-builtins/Overview.md#wasmjs-string-length
	(import "wasm:js-string" "length"
		(func $string_length (param externref) (result i32))
	)
	
	;; This is required to have access to linear memory.
	;; Linear memory is required to transfer Uint8array and Uint16array data.
	;; (memory (export "memory") 32)
	(import "env" "memory" (memory 1))

	;; Mutable, reusuable, global scratch arrays. This reduces our allocation overhead and in theory GC penalties.
	(global $scratch_i16_array (mut (ref null $array_i16)) (ref.null $array_i16))		
	(global $scratch_i8_array (mut (ref null $array_i8)) (ref.null $array_i8))

	;; Initialize or grow the size of the scratch pad.	
	(func $grow_i16_scratch
		(param $len i32)

		global.get $scratch_i16_array
		ref.is_null
		if
			local.get $len
			array.new_default $array_i16
			global.set $scratch_i16_array
		else
			global.get $scratch_i16_array
			array.len
			local.get $len
			i32.lt_u
			if
				local.get $len
				array.new_default $array_i16
				global.set $scratch_i16_array
			end
		end
	)

	;; Initialize or grow the size of the scratch pad.
	(func $grow_i8_scratch
		(param $len i32)

		global.get $scratch_i8_array
		ref.is_null
		if
			local.get $len
			array.new_default $array_i8
			global.set $scratch_i8_array
		else
			global.get $scratch_i8_array
			array.len
			local.get $len
			i32.lt_u
			if
				local.get $len
				array.new_default $array_i8
				global.set $scratch_i8_array
			end
		end
	)

	;; Convert a Uint16Array to a string. This should be a fast path to get a string from character codes.
	;;
	;;	@param $ptr: Starting index of the slice in linear memory
	;;	@param $len: Length of the slice
	;;	@returns String: A Javascript string containing this data.
	(func $uint16array_to_string (export "uint16array_to_string")
		(param $ptr i32)
		(param $len i32)
		(result (ref extern))
		(local $array (ref null $array_i16))
		(local $index i32)
		(local $src_ptr i32)

		;; Start by initializing or growing the scratch pad.
		local.get $len
		call $grow_i16_scratch

		;; There are no helpers at this time for copying between linear memory and gc types.
		;; The rest of this block is just a loop to the correct memory type.
		;; SIMD is only available for linear memory, not GC memory, and can't help us here.
		global.get $scratch_i16_array
		local.set $array

		i32.const 0
		local.set $index
		local.get $ptr
		local.set $src_ptr

		block $done
			loop $loop
				local.get $index
				local.get $len
				i32.ge_u
				br_if $done

				;; Read one 16-bit code unit from linear memory and store it into
				;; the GC array at the same index.
				local.get $array
				local.get $index
				local.get $src_ptr
				i32.load16_u align=2
				array.set $array_i16

				local.get $src_ptr
				i32.const 2
				i32.add
				local.set $src_ptr

				local.get $index
				i32.const 1
				i32.add
				local.set $index
				br $loop
			end
		end

		;; Convert the populated GC array slice into a JavaScript string.
		local.get $array
		i32.const 0
		local.get $len
		call $fromCharCodeArray
	)

	;; Convert string to gcarray for conversion
	(func $string_to_gcarray (export "string_to_gcarray")
		(param $str (ref extern))
		(result (ref null $array_i16))
		(local $new_array (ref null $array_i16))		
		local.get $str
		call $string_length				;; Get the string length
		array.new_default $array_i16 	;; Allocate a new array of the exact size
		local.set $new_array			
		local.get $str
		local.get $new_array
		i32.const 0
		call $intoCharCodeArray			;; Fill the new array with the string's code units
		drop
		local.get $new_array
	)

	;; Encode a string into a UInt8Array.
	;; This provides our `encodeInto` functionality.
	(func $string_to_utf8 (export "string_to_utf8")
		(param $str (ref extern))
		(param $offset i32)
		(param $maxLength i32)
		(result i32) ;; written amount
		(local $utf16 (ref null $array_i16))
		(local $len i32)
		(local $i i32)
		(local $cp i32)
		(local $out i32)
		(local $written i32)
		(local $next i32)
		;; Convert string to UTF-16 GC array
		local.get $str
		call $string_to_gcarray
		local.set $utf16
		local.get $str
		call $string_length
		local.set $len
		local.get $offset
		local.set $out
		i32.const 0
		local.set $written
		i32.const 0
		local.set $i
		block $done
			loop $loop
				local.get $i
				local.get $len
				i32.ge_u
				br_if $done

				;; get code unit
				local.get $utf16
				local.get $i
				array.get $array_i16
				local.set $cp

				;; check for surrogate pair
				local.get $cp
				i32.const 0xD800
				i32.ge_u
				if
					local.get $cp
					i32.const 0xDBFF
					i32.le_u
					if
						local.get $i
						local.get $len
						i32.const 1
						 i32.add
						 i32.lt_u
						 if
							local.get $utf16
							local.get $i
							i32.const 1
							 i32.add
							 array.get $array_i16
							 local.set $next
							 local.get $next
							 i32.const 0xDC00
							 i32.ge_u
							 if
								local.get $next
								i32.const 0xDFFF
								i32.le_u
								if
									;; valid surrogate pair
									local.get $cp
									i32.const 0xD800
									i32.sub
									i32.const 10
									i32.shl
									local.get $next
									i32.const 0xDC00
									i32.sub
									i32.or
									i32.const 0x10000
									 i32.add
									local.set $cp
									local.get $i
									i32.const 1
									 i32.add
									local.set $i
								end
							end
						end
					end
				end

				;; encode $cp as UTF-8
				local.get $cp
				i32.const 0x80
				i32.lt_u
				if
					;; 1 byte
					local.get $written
					local.get $maxLength
					i32.ge_u
					br_if $done
					local.get $out
					local.get $cp
					i32.store8
					local.get $out
					i32.const 1
					i32.add
					local.set $out
					local.get $written
					i32.const 1
					 i32.add
					local.set $written
				else
					local.get $cp
					i32.const 0x800
					i32.lt_u
					if
						;; 2 bytes
						local.get $written
						local.get $maxLength
						i32.const 2
						 i32.add
						 i32.gt_u
						br_if $done
						local.get $out
						local.get $cp
						i32.const 6
						i32.shr_u
						i32.const 0xC0
						i32.or
						i32.store8
						local.get $out
						i32.const 1
						i32.add
						local.set $out
						local.get $out
						local.get $cp
						i32.const 0x3F
						i32.and
						i32.const 0x80
						i32.or
						i32.store8
						local.get $out
						i32.const 1
						i32.add
						local.set $out
						local.get $written
						i32.const 2
						 i32.add
						local.set $written
					else
						local.get $cp
						i32.const 0x10000
						 i32.lt_u
						if
							;; 3 bytes
							local.get $written
							local.get $maxLength
							i32.const 3
							 i32.add
							 i32.gt_u
							br_if $done
							local.get $out
							local.get $cp
							i32.const 12
							 i32.shr_u
							i32.const 0xE0
							 i32.or
							 i32.store8
							local.get $out
							i32.const 1
							 i32.add
							local.set $out
							local.get $out
							local.get $cp
							i32.const 6
							 i32.shr_u
							i32.const 0x3F
							 i32.and
							i32.const 0x80
							 i32.or
							 i32.store8
							local.get $out
							i32.const 1
							 i32.add
							local.set $out
							local.get $out
							local.get $cp
							i32.const 0x3F
							 i32.and
							i32.const 0x80
							 i32.or
							 i32.store8
							local.get $out
							i32.const 1
							 i32.add
							local.set $out
							local.get $written
							i32.const 3
							 i32.add
							local.set $written
						else
							;; 4 bytes
							local.get $written
							local.get $maxLength
							i32.const 4
							 i32.add
							 i32.gt_u
							br_if $done
							local.get $out
							local.get $cp
							i32.const 18
							 i32.shr_u
							i32.const 0xF0
							 i32.or
							 i32.store8
							local.get $out
							i32.const 1
							 i32.add
							local.set $out
							local.get $out
							local.get $cp
							i32.const 12
							 i32.shr_u
							i32.const 0x3F
							 i32.and
							i32.const 0x80
							 i32.or
							 i32.store8
							local.get $out
							i32.const 1
							 i32.add
							local.set $out
							local.get $out
							local.get $cp
							i32.const 6
							 i32.shr_u
							i32.const 0x3F
							 i32.and
							i32.const 0x80
							 i32.or
							 i32.store8
							local.get $out
							i32.const 1
							 i32.add
							local.set $out
							local.get $out
							local.get $cp
							i32.const 0x3F
							 i32.and
							i32.const 0x80
							 i32.or
							 i32.store8
							local.get $out
							i32.const 1
							 i32.add
							local.set $out
							local.get $written
							i32.const 4
							 i32.add
							local.set $written
						end
					end
				end
			
			local.get $i
			 i32.const 1
			 i32.add
			local.set $i
			br $loop
			end
		end
		local.get $written
		)


	;; Converts a UTF-8 string (stored in a Uint8Array slice) into a javascript string.
	;; Provides our `decode` functionality. 
	(func $utf8_to_string (export "utf8_to_string")
		(param $ptr i32) (param $len i32)
		(result (ref extern))
		(local $array (ref null $array_i16))
		(local $src i32) (local $end i32) (local $dst i32)
		(local $b0 i32) (local $b1 i32) (local $b2 i32) (local $b3 i32)
		(local $cp i32) (local $t i32)

		;; ensure capacity (len is safe upper bound)
		local.get $len
		call $grow_i16_scratch
		global.get $scratch_i16_array
		local.set $array

		local.get $ptr
		local.set $src
		local.get $ptr
		local.get $len
		i32.add
		local.set $end
		i32.const 0
		local.set $dst

		block $done
			loop $loop
			;; while (src < end)
			local.get $src
			local.get $end
			i32.ge_u
			br_if $done

			;; b0 = *src
			local.get $src
			i32.load8_u
			local.set $b0

			;; ASCII
			local.get $b0
			i32.const 0x80
			i32.lt_u
			if
				local.get $b0
				local.set $cp
				local.get $src
				i32.const 1
				i32.add
				local.set $src
			else
				;; 2-byte
				local.get $b0
				i32.const 0xE0
				i32.lt_u
				if
				;; b1
				local.get $src
				i32.const 1
				i32.add
				i32.load8_u
				local.set $b1

				;; cp = ((b0&0x1F)<<6) | (b1&0x3F)
				local.get $b0
				i32.const 0x1F
				i32.and
				i32.const 6
				i32.shl
				local.get $b1
				i32.const 0x3F
				i32.and
				i32.or
				local.set $cp

				local.get $src
				i32.const 2
				i32.add
				local.set $src
				else
				;; 3-byte
				local.get $b0
				i32.const 0xF0
				i32.lt_u
				if
					local.get $src
					i32.const 1
					i32.add
					i32.load8_u
					local.set $b1
					local.get $src
					i32.const 2
					i32.add
					i32.load8_u
					local.set $b2

					;; cp = ((b0&0x0F)<<12) | ((b1&0x3F)<<6) | (b2&0x3F)
					local.get $b0
					i32.const 0x0F
					i32.and
					i32.const 12
					i32.shl
					local.get $b1
					i32.const 0x3F
					i32.and
					i32.const 6
					i32.shl
					i32.or
					local.get $b2
					i32.const 0x3F
					i32.and
					i32.or
					local.set $cp

					local.get $src
					i32.const 3
					i32.add
					local.set $src
				else
					;; 4-byte
					local.get $src
					i32.const 1
					i32.add
					i32.load8_u
					local.set $b1
					local.get $src
					i32.const 2
					i32.add
					i32.load8_u
					local.set $b2
					local.get $src
					i32.const 3
					i32.add
					i32.load8_u
					local.set $b3

					;; cp = ((b0&0x07)<<18) | ((b1&0x3F)<<12) | ((b2&0x3F)<<6) | (b3&0x3F)
					local.get $b0
					i32.const 0x07
					i32.and
					i32.const 18
					i32.shl
					local.get $b1
					i32.const 0x3F
					i32.and
					i32.const 12
					i32.shl
					i32.or
					local.get $b2
					i32.const 0x3F
					i32.and
					i32.const 6
					i32.shl
					i32.or
					local.get $b3
					i32.const 0x3F
					i32.and
					i32.or
					local.set $cp

					local.get $src
					i32.const 4
					i32.add
					local.set $src
				end
				end
			end

			;; UTF-16 encode
			local.get $cp
			i32.const 0x10000
			i32.lt_u
			if
				;; single unit
				local.get $array
				local.get $dst
				local.get $cp
				array.set $array_i16
				local.get $dst
				i32.const 1
				i32.add
				local.set $dst
			else
				;; surrogate pair
				local.get $cp
				i32.const 0x10000
				i32.sub
				local.set $t

				;; high
				local.get $array
				local.get $dst
				i32.const 0xD800
				local.get $t
				i32.const 10
				i32.shr_u
				i32.or
				array.set $array_i16

				;; low
				local.get $array
				local.get $dst
				i32.const 1
				i32.add
				i32.const 0xDC00
				local.get $t
				i32.const 0x3FF
				i32.and
				i32.or
				array.set $array_i16

				local.get $dst
				i32.const 2
				i32.add
				local.set $dst
			end

			br $loop
			end
		end

		;; return JS string
		local.get $array
		i32.const 0
		local.get $dst
		call $fromCharCodeArray
	)

)
