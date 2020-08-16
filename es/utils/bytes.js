/*
 * ISC License (ISC)
 * Copyright 2018 aeternity developers
 *
 *  Permission to use, copy, modify, and/or distribute this software for any
 *  purpose with or without fee is hereby granted, provided that the above
 *  copyright notice and this permission notice appear in all copies.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 *  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 *  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 *  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 *  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 *  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 *  PERFORMANCE OF THIS SOFTWARE.
 */
import BigNumber from 'bignumber.js'
import { isBase64, isHex } from './string'

/**
 * Bytes module
 * @module @aeternity/aepp-sdk/es/utils/bytes
 * @example import * as Crypto from '@aeternity/aepp-sdk/es/utils/bytes'
 */

/**
 * Left pad the input data with 0 bytes
 * @param length to pad to
 * @param inputBuffer data to pad
 * @return the padded data
 */
export function leftPad (length, inputBuffer) {
  const fill = length - inputBuffer.length
  if (fill > 0) {
    const fillArray = new Uint8Array(fill)
    fillArray.fill(0, fill)
    return Buffer.concat([fillArray, inputBuffer])
  } else {
    return inputBuffer
  }
}

/**
 * Right pad the input data with 0 bytes
 * @param length to pad to
 * @param inputBuffer data to pad
 * @return the padded data
 */
export function rightPad (length, inputBuffer) {
  const fill = length - inputBuffer.length
  if (fill > 0) {
    const fillArray = new Uint8Array(fill)
    fillArray.fill(0, fill)
    return Buffer.concat([inputBuffer, fillArray])
  } else {
    return inputBuffer
  }
}

/**
 * Convert bignumber to byte array
 * @param x bignumber instance
 * @return Buffer
 */
export function bigNumberToByteArray (x) {
  if (!x.isInteger()) throw new Error(`Unexpected not integer value: ${x.toFixed()}`)
  let hexString = x.toString(16)
  if (hexString.length % 2 > 0) hexString = '0' + hexString
  return Buffer.from(hexString, 'hex')
}
export function toBytes (val, big = false) {
  // """
  // Encode a value to bytes.
  // If the value is an int it will be encoded as bytes big endian
  // Raises ValueError if the input is not an int or string

  if (val === undefined || val === null) return Buffer.from([])
  if (Number.isInteger(val) || BigNumber.isBigNumber(val) || big) {
    if (!BigNumber.isBigNumber(val)) val = BigNumber(val)
    return bigNumberToByteArray(val)
  }
  if (typeof val === 'string') {
    return val.toString('utf-8')
  }
  throw new Error('Byte serialization not supported')
}

/**
 * Convert a string to a Buffer.  If encoding is not specified, hex-encoding
 * will be used if the input is valid hex.  If the input is valid base64 but
 * not valid hex, base64 will be used.  Otherwise, utf8 will be used.
 * @param {string} str String to be converted.
 * @param {string=} enc Encoding of the input string (optional).
 * @return {buffer} Buffer (bytearray) containing the input data.
 */
export function str2buf (str, enc) {
  if (!str || str.constructor !== String) return str
  if (!enc && isHex(str)) enc = 'hex'
  if (!enc && isBase64(str)) enc = 'base64'
  return Buffer.from(str, enc)
}
