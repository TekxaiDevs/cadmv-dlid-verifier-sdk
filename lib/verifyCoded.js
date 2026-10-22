/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {aamva} from '@digitalbazaar/pdf417-dl-canonicalizer';

import {
  mapVerifyResultToCode,
  RESULT_CODES
} from './resultCodes.js';
import {verify} from './index.js';

/** CA IIN; matches core verifier. */
const CA_IIN = '636014';

/** Start of day in CA when digital signature / VCB is required. */
const DIGITAL_SIGNATURE_REQUIRED_DATE = _dateFromMonthDayYear('09292025');

/**
 * Lightweight barcode gate used by host apps before calling full verify.
 *
 * Per client flow: call the cryptographic verifier when the issue date is
 * on/after 2025-09-29 and/or a VCB (ZCE) field is present. This helper only
 * inspects structure — it does not prove authenticity.
 *
 * @param {object} options - Options.
 * @param {Uint8Array|string} options.data - Raw scanner barcode.
 * @param {string} [options.encoding='utf8'] - String encoding.
 * @returns {Promise<object>} Gate details (no personal field values).
 */
export async function inspectBarcodeGate({
  data,
  encoding = 'utf8'
} = {}) {
  const out = {
    ok: false,
    shouldVerify: false,
    hasVcb: false,
    issueDateOnOrAfterRequired: false,
    issuerLooksCa: false,
    error: null
  };
  try {
    const normalized = _stripToAt(data);
    const decoded = await aamva.decode({data: normalized, encoding});
    out.issuerLooksCa =
      decoded.issuerIdentificationNumber === CA_IIN;
    let issuedSelection;
    try {
      issuedSelection = await aamva.select({
        object: decoded,
        selector: {
          subfile: ['DL', 'ID'],
          fields: ['DBD']
        }
      });
    } catch {
      issuedSelection = null;
    }
    if(issuedSelection) {
      const dbd = issuedSelection.get('DBD');
      if(typeof dbd === 'string' && dbd.length >= 8) {
        const issued = _dateFromMonthDayYear(dbd);
        out.issueDateOnOrAfterRequired =
          issued >= DIGITAL_SIGNATURE_REQUIRED_DATE;
      }
    }
    try {
      const vcbSelection = await aamva.select({
        object: decoded,
        selector: {
          subfile: ['ZC'],
          fields: ['ZCE']
        }
      });
      const zce = vcbSelection?.get('ZCE');
      out.hasVcb = typeof zce === 'string' && zce.length > 0;
    } catch {
      out.hasVcb = false;
    }
    out.shouldVerify = out.hasVcb || out.issueDateOnOrAfterRequired;
    out.ok = true;
  } catch(e) {
    out.error = e;
    out.shouldVerify = false;
  }
  return out;
}

/**
 * Run cryptographic verification and return an integer result code.
 *
 * Option A host flow:
 * 1. Host checks device online; if offline and verifier would be called → 10
 * 2. Host may use `inspectBarcodeGate` to decide whether to call
 * 3. This function calls `verify({ verifyStatus: true })` by default and maps
 *    to 1 / 0 / 2 / 10.
 *
 * @param {object} options - Options (same as `verify`, plus coded extras).
 * @param {Uint8Array|string} options.data - Raw barcode.
 * @param {boolean} [options.online=true] - Host connectivity. `false` → 10
 *   without calling `verify`.
 * @param {boolean} [options.verifyStatus=true] - Revocation check (default on
 *   for coded API so revoked can map to 2).
 * @param {boolean} [options.requireGate=false] - If true, return INVALID (0)
 *   when gate says shouldVerify is false (without full crypto).
 * @param {string} [options.state='CA'] - Jurisdiction plugin id. Only `CA`
 *   is implemented; others return INVALID.
 * @param {string} [options.mode='prod'] - `prod` or `uat`.
 * @param {boolean} [options.debug=false] - Include verify debug payload.
 * @param {string} [options.encoding='utf8'] - String encoding if data is a
 *   string.
 * @param {boolean} [options.requireVcb=false] - Forwarded to `verify()`.
 * @param {Function} [options.documentLoader=null] - Forwarded to `verify()`.
 * @param {object} [options._test={}] - Test-only hooks forwarded to `verify()`.
 * @returns {Promise<object>} `{ code, verifyResult?, gate? }`.
 */
export async function verifyWithCode({
  data,
  online = true,
  verifyStatus = true,
  requireGate = false,
  state = 'CA',
  mode = 'prod',
  debug = false,
  encoding = 'utf8',
  requireVcb = false,
  documentLoader = null,
  _test = {}
} = {}) {
  if(state !== 'CA') {
    return {
      code: RESULT_CODES.INVALID,
      verifyResult: {
        valid: false,
        error: new Error(`Unsupported state plugin: "${state}".`)
      }
    };
  }

  if(online === false) {
    return {
      code: RESULT_CODES.OFFLINE,
      verifyResult: {
        valid: false,
        error: new Error('Internet not available.')
      }
    };
  }

  let gate;
  if(requireGate) {
    gate = await inspectBarcodeGate({data, encoding});
    if(!gate.shouldVerify) {
      return {
        code: RESULT_CODES.INVALID,
        gate,
        verifyResult: {
          valid: false,
          error: new Error(
            'Barcode gate: issue date before 2025-09-29 and no VCB field.')
        }
      };
    }
  }

  const verifyResult = await verify({
    data,
    encoding,
    requireVcb,
    verifyStatus,
    documentLoader,
    mode,
    debug,
    _test
  });

  return {
    code: mapVerifyResultToCode(verifyResult),
    gate,
    verifyResult
  };
}

/**
 * @param {Uint8Array|string} data - Input.
 * @returns {Uint8Array|string} Payload from first `@` when present.
 */
function _stripToAt(data) {
  if(typeof data === 'string') {
    const at = data.indexOf('@');
    return at > 0 ? data.slice(at) : data;
  }
  if(ArrayBuffer.isView(data)) {
    const bytes = (data instanceof Uint8Array &&
      data.constructor === Uint8Array) ?
      data :
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const at = bytes.indexOf(0x40);
    return at > 0 ? bytes.subarray(at) : bytes;
  }
  return data;
}

/**
 * @param {string} dateStr - MMDDCCYY.
 * @returns {Date} Date at CA morning.
 */
function _dateFromMonthDayYear(dateStr) {
  const month = dateStr.slice(0, 2);
  const day = dateStr.slice(2, 4);
  const year = dateStr.slice(4);
  return new Date(`${year}-${month}-${day}T07:00:00.000Z`);
}
