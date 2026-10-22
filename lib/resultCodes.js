/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Integer result codes for the Xamarin / host-app integration contract.
 *
 * These codes are a thin mapping over `verify()` outcomes. They are not
 * part of the core `{valid, error, debug}` API; hosts that only need
 * boolean validity should keep using `verify()`.
 */
export const RESULT_CODES = Object.freeze({
  /** Barcode credential checks passed (including status when requested). */
  VALID: 1,
  /** Invalid, malformed, crypto failure, allowlist failure, or unknown. */
  INVALID: 0,
  /** Status list confirmed revocation bit is set. */
  REVOKED: 2,
  /** Host offline or verifier could not reach required network resources. */
  OFFLINE: 10
});

const REVOCATION_CAUSE =
  'Credential status indicates revocation.';

/**
 * Collect human-readable messages from an Error and its cause chain.
 *
 * @param {Error|undefined|null} error - Error to inspect.
 * @returns {string[]} Message strings (may be empty).
 */
export function collectErrorMessages(error) {
  const messages = [];
  const seen = new Set();
  let current = error;
  let depth = 0;
  while(current && depth < 8) {
    if(typeof current.message === 'string' && current.message &&
      !seen.has(current.message)) {
      seen.add(current.message);
      messages.push(current.message);
    }
    const nested = current.cause?.errors;
    if(Array.isArray(nested)) {
      for(const err of nested) {
        if(typeof err?.message === 'string' && err.message &&
          !seen.has(err.message)) {
          seen.add(err.message);
          messages.push(err.message);
        }
      }
    }
    current = current.cause;
    depth += 1;
  }
  return messages;
}

/**
 * True when messages indicate a network / status-list fetch failure.
 *
 * Allowlist rejections (`URL not allowed`) are NOT treated as offline.
 *
 * @param {string[]} messages - Error messages.
 * @returns {boolean} Whether the failure looks like network/unavailability.
 */
export function messagesIndicateOffline(messages) {
  const joined = messages.join('\n');
  if(/URL not allowed/i.test(joined)) {
    return false;
  }
  return /Could not load "BitstringStatusListCredential"/i.test(joined) ||
    /Request failed with status code/i.test(joined) ||
    /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET/i.test(joined) ||
    /TimeoutError|network error|fetch failed|Failed to fetch/i.test(joined) ||
    /socket hang up|getaddrinfo/i.test(joined);
}

/**
 * True when status verification confirmed revocation.
 *
 * @param {object} verifyResult - Result from `verify()`.
 * @returns {boolean} Whether the credential is confirmed revoked.
 */
export function isConfirmedRevocation(verifyResult) {
  if(!verifyResult?.error) {
    return false;
  }
  if(verifyResult.error.message !== 'Status error') {
    return false;
  }
  const messages = collectErrorMessages(verifyResult.error);
  return messages.some(m => m === REVOCATION_CAUSE ||
    /^Credential status indicates revocation\.?$/i.test(m));
}

/**
 * Map a `verify()` result object to an integer result code.
 *
 * @param {object} verifyResult - `{valid, error, debug?}` from `verify()`.
 * @returns {number} One of RESULT_CODES.
 */
export function mapVerifyResultToCode(verifyResult) {
  if(!verifyResult || typeof verifyResult !== 'object') {
    return RESULT_CODES.INVALID;
  }
  if(verifyResult.valid === true) {
    return RESULT_CODES.VALID;
  }
  if(isConfirmedRevocation(verifyResult)) {
    return RESULT_CODES.REVOKED;
  }
  const messages = collectErrorMessages(verifyResult.error);
  if(messagesIndicateOffline(messages)) {
    return RESULT_CODES.OFFLINE;
  }
  return RESULT_CODES.INVALID;
}
