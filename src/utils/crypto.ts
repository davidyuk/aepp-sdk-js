import nacl from 'tweetnacl';
// js extension is required for mjs build, not importing the whole package to reduce bundle size
// eslint-disable-next-line import/extensions
import { blake2b } from 'blakejs/blake2b.js';
import { encode as varuintEncode } from 'varuint-bitcoin';

import { concatBuffers, isItemOfArray } from './other.js';
import { decode, encode, Encoded, Encoding } from './encoder.js';
import { ArgumentError } from './errors.js';

/**
 * Check if address is valid
 * @param maybeAddress - Address to check
 */
export function isAddressValid(maybeAddress: string): maybeAddress is Encoded.AccountAddress;
/**
 * Check if data is encoded in one of provided encodings
 * @param maybeEncoded - Data to check
 * @param encodings - Rest parameters with encodings to check against
 */
export function isAddressValid<E extends Encoding>(
  maybeEncoded: string,
  ...encodings: E[]
): maybeEncoded is Encoded.Generic<E>;
export function isAddressValid(maybeEncoded: string, ...encodings: Encoding[]): boolean {
  if (encodings.length === 0) encodings = [Encoding.AccountAddress];
  try {
    decode(maybeEncoded as Encoded.Any);
    const encoding = maybeEncoded.split('_')[0];
    if (!isItemOfArray(encoding, encodings)) {
      throw new ArgumentError(
        'Encoded string type',
        encodings.length > 1 ? `one of ${encodings.join(', ')}` : encodings[0],
        encoding,
      );
    }
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate a random salt (positive integer)
 * @returns random salt
 */
export function genSalt(): number {
  const [random] = new BigUint64Array(nacl.randomBytes(8).buffer);
  return Number(random % BigInt(Number.MAX_SAFE_INTEGER));
}

/**
 * Converts a positive integer to the smallest possible
 * representation in a binary digit representation
 * @param value - Value to encode
 * @returns Encoded number
 */
export function encodeUnsigned(value: number): Buffer {
  const binary = Buffer.allocUnsafe(4);
  binary.writeUInt32BE(value);
  return binary.slice(binary.findIndex((i) => i !== 0));
}

/**
 * Calculate 256bits Blake2b hash of `input`
 * @param input - Data to hash
 * @returns Hash
 */
export function hash(input: string | Uint8Array): Buffer {
  return Buffer.from(blake2b(input, undefined, 32)); // 256 bits
}

// Todo Duplicated in tx builder. remove
/**
 * Compute contract address
 * @category contract
 * @param owner - Address of contract owner
 * @param nonce - Round when contract was created
 * @returns Contract address
 */
export function encodeContractAddress(
  owner: Encoded.AccountAddress,
  nonce: number,
): Encoded.ContractAddress {
  const publicKey = decode(owner);
  const binary = concatBuffers([publicKey, encodeUnsigned(nonce)]);
  return encode(hash(binary), Encoding.ContractAddress);
}

/**
 * Verify that signature was signed by public key
 * @param data - Data that was signed
 * @param signature - Signature of data
 * @param address - Address to verify against
 * @returns is data was signed by address
 */
export function verify(
  data: Uint8Array,
  signature: Uint8Array,
  address: Encoded.AccountAddress,
): boolean {
  return nacl.sign.detached.verify(data, signature, decode(address));
}

const messagePrefix = Buffer.from('aeternity Signed Message:\n', 'utf8');
export const messagePrefixLength = varuintEncode(messagePrefix.length).buffer;

// TODO: consider rename to hashMessage
export function messageToHash(message: string): Buffer {
  const msg = Buffer.from(message, 'utf8');
  return hash(
    concatBuffers([messagePrefixLength, messagePrefix, varuintEncode(msg.length).buffer, msg]),
  );
}

/**
 * Verify that message was signed by address
 * @param message - Message that was signed
 * @param signature - Signature of message
 * @param address - Address to verify against
 * @returns is data was signed by address
 */
// TODO: deprecate in favour of `verify(messageToHash(message), ...`, also the name is confusing
// it should contain "signature"
export function verifyMessage(
  message: string,
  signature: Uint8Array,
  address: Encoded.AccountAddress,
): boolean {
  return verify(messageToHash(message), signature, address);
}
