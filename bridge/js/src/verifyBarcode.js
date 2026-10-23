/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Two-pass WebView wrapper: Base64 raw PDF417 bytes in → integer code out.
 * Pass 1 = signature only; Pass 2 = revocation. Fail closed.
 */
import {
  collectErrorMessages,
  isConfirmedRevocation,
  messagesIndicateOffline,
  RESULT_CODES,
  VERIFIER_SCOPE,
  verify
} from 'cadmv-dlid-verifier-sdk';

export {RESULT_CODES, VERIFIER_SCOPE};

/**
 * Decode a standard Base64 string to bytes.
 *
 * @param {string} base64Data - Base64 of raw PDF417 bytes.
 * @returns {Uint8Array} Decoded bytes.
 */
function decodeBase64ToBytes(base64Data) {
  if(typeof base64Data !== 'string' || base64Data.length === 0) {
    throw new Error('Empty or non-string Base64 input.');
  }
  // Strip whitespace that some bridges insert when chunking.
  const cleaned = base64Data.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Map a verify() result to 0 / 2 / 10 (never 1 here — caller decides).
 *
 * @param {object} result - `{valid, error}` from verify().
 * @returns {number} RESULT_CODES value excluding VALID when invalid.
 */
function mapFailure(result) {
  if(isConfirmedRevocation(result)) {
    return RESULT_CODES.REVOKED;
  }
  const messages = collectErrorMessages(result?.error);
  if(messagesIndicateOffline(messages)) {
    return RESULT_CODES.OFFLINE;
  }
  return RESULT_CODES.INVALID;
}

/**
 * Verify a CA DL/ID PDF417 barcode via two passes.
 *
 * @param {string} base64Data - Base64 encoding of raw scanner PDF417 bytes.
 * @param {object} [options] - Options.
 * @param {string} [options.mode='prod'] - `'prod'` or `'uat'`.
 * @param {boolean} [options.skipStatus=false] - Demo/test only: stop after
 *   pass 1 (crypto). Product path must leave this false.
 * @returns {Promise<number>} `1` | `0` | `2` | `10`.
 */
export async function verifyBarcode(base64Data, options = {}) {
  const mode = options.mode === 'uat' ? 'uat' : 'prod';
  const skipStatus = options.skipStatus === true;

  let data;
  try {
    data = decodeBase64ToBytes(base64Data);
  } catch {
    return RESULT_CODES.INVALID;
  }

  // Pass 1 — cryptographic signature only.
  let pass1;
  try {
    pass1 = await verify({
      data,
      mode,
      verifyStatus: false
    });
  } catch(err) {
    console.warn('[CaVerifier] pass1 threw', mode, err && err.message);
    return RESULT_CODES.INVALID;
  }

  if(!pass1?.valid) {
    const messages = collectErrorMessages(pass1?.error);
    console.warn('[CaVerifier] pass1 invalid', mode, 'bytes=' + data.length,
      messages.slice(0, 3).join(' | ') || '(no messages)');
    return mapFailure(pass1);
  }

  if(skipStatus) {
    return RESULT_CODES.VALID;
  }

  // Pass 2 — revocation / status list.
  let pass2;
  try {
    pass2 = await verify({
      data,
      mode,
      verifyStatus: true
    });
  } catch {
    return RESULT_CODES.INVALID;
  }

  if(pass2?.valid === true) {
    return RESULT_CODES.VALID;
  }

  return mapFailure(pass2);
}

// Browser / WebView IIFE global (also set by esbuild footer).
if(typeof globalThis !== 'undefined') {
  globalThis.CaVerifier = {
    verifyBarcode,
    RESULT_CODES,
    VERIFIER_SCOPE
  };
}
