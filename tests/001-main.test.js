/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  BitstringStatusList,
  createCredential
} from '@digitalbazaar/vc-bitstring-status-list';
import {existsSync, readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

import {verify} from '../lib/index.js';

// Vitest runs with the repository root as cwd.
// Client fixtures (untracked / gitignored):
// - Cali-1.raw: real production capture
// - Cali-Fake.raw: from a physically fake ID (barcode may still crypto-verify)
const CALI_1_RAW_PATH = `${process.cwd()}/Cali-1.raw`;
const CALI_FAKE_RAW_PATH = `${process.cwd()}/Cali-Fake.raw`;

/**
 * Load an untracked client capture without logging personal fields.
 *
 * @param {string} path - Absolute or cwd-relative fixture path.
 * @returns {{wrapped: string, wrappedBytes: Uint8Array, fileBytes: Uint8Array,
 *   pdf417: string, pdf417Bytes: Uint8Array}|null} Fixture views, or
 *   `null` if the file is absent.
 */
function loadClientRawFixture(path) {
  if(!existsSync(path)) {
    return null;
  }
  // Prefer plain Uint8Array for binary asserts; keep latin1 string for text.
  const fileBytes = new Uint8Array(readFileSync(path));
  const wrapped = Buffer.from(fileBytes).toString('latin1');
  const at = wrapped.indexOf('@');
  const pdf417 = at >= 0 ? wrapped.slice(at) : wrapped;
  return {
    wrapped,
    wrappedBytes: new TextEncoder().encode(wrapped),
    fileBytes,
    pdf417,
    pdf417Bytes: new TextEncoder().encode(pdf417)
  };
}

const cali1 = loadClientRawFixture(CALI_1_RAW_PATH);
const describeCali1 = cali1 ? describe : describe.skip;
const caliFake = loadClientRawFixture(CALI_FAKE_RAW_PATH);
const describeCaliFake = caliFake ? describe : describe.skip;

// Verifying Digital Signatures on California DL/ID Documents
// https://www.dmv.ca.gov/portal/file/verifying-digital-signatures-on-california-dlid-documents-pdf/
// Retrieved on 2026-02-13

// Example PDF417 with digital signature
// eslint-disable-next-line @stylistic/max-len
const validUatExample = '@\n\u001e\rANSI 636014100102DL00410287ZC03280220DLDAQI8887059\nDCSFIVENINE\nDDEU\nDACTOMTEST\nDDFU\nDADNONE\nDDGU\nDCABM1\nDCBL80\nDCDNONE\nDBD08052025\nDBB01011980\nDBA01012030\nDBC1\nDAU070 IN\nDAYBLU\nDAG2415 1ST AVE 051\nDAISACRAMENTO\nDAJCA\nDAK958180000  \nDCF08/05/2025298TL/TLFD/30\nDCGUSA\nDAZBLN\nDAW200\nDCUIV\nDCK25217I88870590401\nDDAN\nDDB05202024\rZCZCABLU\nZCBBLN\nZCC\nZCD\nZCE2csdghoB2QXApgGCAQIYnYIYdhikGK6jGJwYphjEQRUYxhrmdn0HGLCiGJwYoBioRHX/cGAYtEEUGLalGJwYbBjMARjWGNwY2FhBephqE+tbyDCJM7XgRUzmFAY41xQu1cBinSYoLAAx/k6284STfQ0g1arQCtDpTWsqa96BLDbWzvj0R4JIrk/K5AAY2kEW\r';

// Appendix B: Example PDF417 with revoked digital signature
// eslint-disable-next-line @stylistic/max-len
const invalidUatExample = '@\n\u001e\rANSI 636014100102DL00410281ZC03220220DLDAQI8889812\nDCSONETWO\nDDEU\nDACEERIETEST\nDDFU\nDADVON\nTWOMN\nDDGU\nDCAC\nDCBNONE\nDCDNONE\nDBD09042025\nDBB12121972\nDBA12122029\nDBC9\nDAU075\nIN\nDAYBLU\nDAG2415\n1ST\nAVE\nDAISACRAMENTO\nDAJCA\nDAK958180000  \nDCF09/04/2025796KP/12FD/29\nDCGUSA\nDAZBLN\nDAW159\nDCK25247I88898120401\nDDAN\nDDB05202024\rZCZCABLU\nZCBBLN\nZCC\nZCD\nZCE2csdghoB2QXApgGCAQIYnYIYdhikGK6jGJwYphjEQRUYxhrnDr7YGLCiGJwYoBioRHX/cGAYtEEUGLalGJwYbBjMARjWGNwY2FhBemJvZUdnBf+uJ1kK58r6AsaiKMDVR7OkfSWCdft/LTd9M0sgpUItYaZClwJUeX5s20C/bZJffuxHkFzcdUXRIXsY2kEW\r';

// as typed arrays
const encoder = new TextEncoder();
const validUatExampleBytes = encoder.encode(validUatExample);
const invalidUatExampleBytes = encoder.encode(invalidUatExample);

// Matches TerseBitstringStatusListEntry conversion in lib/index.js / DMV docs.
const TERSE_BITSTRING_STATUS_LIST_LENGTH = 67108864;
const VALID_UAT_TERSE_STATUS_LIST_INDEX = 3866524935;
const VALID_UAT_STATUS_LIST_INDEX =
  VALID_UAT_TERSE_STATUS_LIST_INDEX % TERSE_BITSTRING_STATUS_LIST_LENGTH;
const VALID_UAT_STATUS_LIST_URL =
  'https://api.uat-credentials.dmv.ca.gov/status/dlid/1/status-lists/' +
  'revocation/57';
const UAT_ISSUER = 'did:web:uat-credentials.dmv.ca.gov';

/**
 * Build an unsigned BitstringStatusListCredential for status-check mocks.
 *
 * Remote UAT status-list endpoints currently return HTTP 404 for the
 * documented example URLs, so happy-path and revocation tests inject an
 * in-memory list instead of depending on live infrastructure.
 *
 * @param {object} options - Options.
 * @param {boolean} [options.revoked=false] - Set the example credential bit.
 * @param {string} [options.statusPurpose='revocation'] - List purpose.
 * @returns {Promise<object>} Unsigned status list credential document.
 */
async function createMockStatusListCredential({
  revoked = false,
  statusPurpose = 'revocation'
} = {}) {
  const list = new BitstringStatusList({
    length: TERSE_BITSTRING_STATUS_LIST_LENGTH
  });
  if(revoked) {
    list.setStatus(VALID_UAT_STATUS_LIST_INDEX, true);
  }
  const statusListCredential = await createCredential({
    id: VALID_UAT_STATUS_LIST_URL,
    list,
    statusPurpose
  });
  statusListCredential.issuer = UAT_ISSUER;
  return statusListCredential;
}

/**
 * Common `_test` flags for unsigned in-memory status list documents.
 *
 * @param {object} statusListDocument - Mock status list credential.
 * @returns {object} `_test` options.
 */
function mockStatusListTestOptions(statusListDocument) {
  return {
    statusListDocument,
    // Mock documents are unsigned; skip only the status-list credential
    // proof check. Matching issuers and the credential bit are still checked.
    verifyBitstringStatusListCredential: false
  };
}

describe('main', () => {
  it('bad data, uat', async () => {
    const result = await verify({data: 'bogus', mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', false);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', false);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message',
      'AAMVA CA issuer not found.');
  });
  it('empty string input fails closed', async () => {
    const result = await verify({data: '', mode: 'uat', debug: true});
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error');
    expect(result).not.toHaveProperty('debug.issuerAccepted', true);
  });
  it('empty bytes input fails closed', async () => {
    const result = await verify({
      data: new Uint8Array(0), mode: 'uat', debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error');
  });
  it('missing @ leaves input unchanged and fails closed', async () => {
    const result = await verify({
      data: 'ParserVer: 3.1.8.0\n8/23/2026 2:49:47 PM\n\nNOBARCODE',
      mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message',
      'AAMVA CA issuer not found.');
  });
  it('null data fails closed without throwing', async () => {
    const result = await verify({data: null, mode: 'uat', debug: true});
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'PDF417 decode failed.');
  });
  it('scanner prefix before valid UAT payload still verifies', async () => {
    const wrapped = 'ParserVer: 3.1.8.0\n8/23/2026 2:49:47 PM\n\n' +
      validUatExample;
    expect(wrapped.indexOf('@')).toBeGreaterThan(0);
    expect(wrapped.slice(wrapped.indexOf('@')).startsWith('@')).toBe(true);
    const result = await verify({
      data: wrapped,
      mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('multiple @ keeps payload from first @ only', async () => {
    // First @ is the AAMVA compliance indicator; later @ must remain in body.
    const wrapped = 'meta\n' + validUatExample;
    const result = await verify({data: wrapped, mode: 'uat', debug: true});
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('AAMVA control bytes after @ are preserved (string)', async () => {
    // Standard shape: @ LF RS CR ANSI... — must not strip RS/CR.
    expect(validUatExample.charCodeAt(0)).toBe(0x40);
    expect(validUatExample.charCodeAt(1)).toBe(0x0a);
    expect(validUatExample.charCodeAt(2)).toBe(0x1e);
    expect(validUatExample.charCodeAt(3)).toBe(0x0d);
    const result = await verify({
      data: validUatExample, mode: 'uat', debug: true
    });
    expect(result).toHaveProperty('valid', true);
  });
  it('Node Buffer binary input verifies like Uint8Array', async () => {
    const buf = Buffer.from(validUatExample, 'utf8');
    expect(buf instanceof Uint8Array).toBe(true);
    expect(buf.constructor).not.toBe(Uint8Array);
    const result = await verify({data: buf, mode: 'uat', debug: true});
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('Buffer input does not falsely fail DAJ (Buffer→Uint8Array coerce)',
    async () => {
      // Regression: Node Buffer subclass previously broke field parsing so
      // DAJ looked wrong even for a valid CA barcode. Coercion must preserve
      // exact bytes and keep DAJ/issuer checks on the real payload.
      const buf = Buffer.from(validUatExample, 'latin1');
      const result = await verify({data: buf, mode: 'uat', debug: true});
      // Success implies DAJ parsed correctly (failure would be Invalid DAJ).
      expect(result).toHaveProperty('debug.issuerAccepted', true);
      expect(result).toHaveProperty('valid', true);
      expect(result).not.toHaveProperty('error');
    });
  it('empty Buffer fails closed without throwing', async () => {
    const result = await verify({
      data: Buffer.alloc(0), mode: 'uat', debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error');
  });
  it('string / Uint8Array / Buffer parity on same UAT payload', async () => {
    const bytes = new TextEncoder().encode(validUatExample);
    const buf = Buffer.from(validUatExample, 'utf8');
    const [rStr, rU8, rBuf] = await Promise.all([
      verify({data: validUatExample, mode: 'uat', debug: true}),
      verify({data: bytes, mode: 'uat', debug: true}),
      verify({data: buf, mode: 'uat', debug: true})
    ]);
    expect(rStr.valid).toBe(true);
    expect(rU8.valid).toBe(true);
    expect(rBuf.valid).toBe(true);
    expect(rStr.error).toBeUndefined();
    expect(rU8.error).toBeUndefined();
    expect(rBuf.error).toBeUndefined();
  });
  it('CRLF-mangled AAMVA header is repaired for verification', async () => {
    // Simulate .txt export: @\n\x1e\r → @\r\n\x1e\r\n and LF→CRLF in body.
    const body = validUatExample.slice('@\n\x1e\r'.length);
    const mangled = '@\r\n\x1e\r\n' + body.replace(/\n/g, '\r\n');
    expect(mangled.startsWith('@\r\n\x1e\r\nANSI')).toBe(true);
    const result = await verify({data: mangled, mode: 'uat', debug: true});
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('bad issuer id [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      _test: {
        issuerId: 'bogus'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', false);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', false);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message',
      'AAMVA CA issuer not found.');
  });
  it('bad DAJ field [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyVcb: 'always',
      _test: {
        issuedState: 'VA'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', false);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', false);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message',
      'Invalid DAJ field: "VA".');
  });

  it('valid data, string, uat, no debug', async () => {
    const result = await verify({data: validUatExample, mode: 'uat'});
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('debug');
    expect(result).not.toHaveProperty('error');
  });

  it('valid data, string, uat', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('valid data, bytes, uat', async () => {
    const result = await verify({data: validUatExampleBytes, mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });

  // [live-crypto] Public UAT invalid example — real DID + ecdsa-xi-2023;
  // no `_test` mocks. Status is not the failure reason.
  it('invalid data, string, uat [live-crypto]', async () => {
    const result = await verify({data: invalidUatExample, mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty(
      'error.cause.errors[0].message', 'Invalid signature.');
    expect(result.error.message).toBe('Verify error');
    expect(result.debug.verifyResult?.verified).toBe(false);
    expect(result.debug.verifyResult?.statusResult?.verified).not.toBe(true);
  });
  it('invalid data, bytes, uat [live-crypto]', async () => {
    const result = await verify({data: invalidUatExampleBytes, mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty(
      'error.cause.errors[0].message', 'Invalid signature.');
    expect(result.debug.verifyResult?.verified).toBe(false);
  });

  // [live-crypto] Tampering copies of the public UAT *valid* example.
  // Calls omit `_test`; rejection comes from real ecdsa-xi-2023 verification
  // (or earlier decode/issuer gates). Not client fixtures; originals untouched.
  it('tamper optical field → Invalid signature [live-crypto]', async () => {
    // Optical AAMVA field change breaks xi extraInformation hash binding.
    const tampered = validUatExample.replace('DACTOMTEST', 'DACXOMTEST');
    expect(tampered).not.toBe(validUatExample);
    const result = await verify({
      data: tampered, mode: 'uat', debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'Verify error');
    expect(result).toHaveProperty(
      'error.cause.errors[0].message', 'Invalid signature.');
    expect(result.debug.verifyResult?.verified).toBe(false);
    // Not a status/revocation classification.
    expect(result.error.message).not.toBe('Status error');
  });
  it('tamper late VCB/proof byte → Invalid signature [live-crypto]',
    async () => {
      // Controlled signature-region mutation: still decodes; proof fails.
      const nearEnd = validUatExample.length - 12;
      const ch = validUatExample[nearEnd];
      const repl = ch === 'E' ? 'F' : 'E';
      const tampered = validUatExample.slice(0, nearEnd) + repl +
        validUatExample.slice(nearEnd + 1);
      const result = await verify({
        data: tampered, mode: 'uat', debug: true
      });
      expect(result).toHaveProperty('debug.issuerAccepted', true);
      expect(result).toHaveProperty('debug.vcbPresent', true);
      expect(result).toHaveProperty('valid', false);
      expect(result).toHaveProperty('error.message', 'Verify error');
      expect(result).toHaveProperty(
        'error.cause.errors[0].message', 'Invalid signature.');
      expect(result.debug.verifyResult?.verified).toBe(false);
      expect(result.error.message).not.toBe('Status error');
    });
  it('tamper early VCB corruption → decode fail [deterministic unit]',
    async () => {
      // Rejected before cryptographic verify (CBOR-LD decode).
      const zce = validUatExample.indexOf('ZCE');
      const body = validUatExample.slice(zce + 3);
      const tampered = validUatExample.slice(0, zce + 3) +
        (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
      const result = await verify({
        data: tampered, mode: 'uat', debug: true
      });
      expect(result).toHaveProperty('debug.issuerAccepted', true);
      expect(result).toHaveProperty('debug.vcbPresent', false);
      expect(result).toHaveProperty('valid', false);
      expect(result).toHaveProperty(
        'error.message', 'VC Barcode decode failed.');
      expect(result.debug.verifyResult).toBeFalsy();
    });
  it('tamper DAJ change → issuer reject [deterministic unit]', async () => {
    // Rejected at DAJ gate before VCB crypto.
    const tampered = validUatExample.replace('DAJCA', 'DAJXX');
    const result = await verify({
      data: tampered, mode: 'uat', debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', false);
    expect(result).toHaveProperty('debug.vcbPresent', false);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty(
      'error.message', 'Invalid DAJ field: "XX".');
    expect(result.debug.verifyResult).toBeFalsy();
  });

  it('valid on required date [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      _test: {
        issuedDateField: '09292025'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', true);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });

  it('has vcb, required by date [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      _test: {
        issuedDateField: '10012025'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', true);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('has vcb, requireVcb=true', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      requireVcb: true,
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', true);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('no vcb, required by date [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      _test: {
        vcb: false,
        issuedDateField: '10012025'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', true);
    expect(result).toHaveProperty('debug.vcbPresent', false);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty(
      'error.message', 'VC Barcode data not found.');
  });
  it('no vcb, requiredVcb=true [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      requireVcb: true,
      _test: {
        vcb: false
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', true);
    expect(result).toHaveProperty('debug.vcbPresent', false);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty(
      'error.message', 'VC Barcode data not found.');
  });

  it('has vcb, not requied by date [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      _test: {
        issuedDateField: '09282025'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('has vcb, not required by date, requireVcb=true [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      requireVcb: true,
      _test: {
        issuedDateField: '09282025'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', true);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('no vcb, not required by date, requireVcb=true [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      requireVcb: true,
      _test: {
        vcb: false,
        issuedDateField: '09282025'
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', true);
    expect(result).toHaveProperty('debug.vcbPresent', false);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty(
      'error.message', 'VC Barcode data not found.');
  });

  it('verifyStatus=true', async () => {
    // Live UAT status-list URLs for the documented example currently return
    // HTTP 404, so this assertion uses an in-memory unrevoked status list.
    const statusListDocument = await createMockStatusListCredential();
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: mockStatusListTestOptions(statusListDocument),
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });
  it('verifyStatus=true, no credentialStatus [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: {
        noCredentialStatus: true
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty(
      'error.message', 'Status error');
    expect(result).toHaveProperty(
      'error.cause.message', '"credentialStatus" property not found.');
  });
  it('verifyStatus=true, mock revoked [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: {
        checkStatusError: true
      },
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty(
      'error.message', 'Status error');
    expect(result).toHaveProperty(
      'error.cause.message', '**TEST**: Status check failed.');
  });
  it('verifyStatus=true, revoked status bit [mock]', async () => {
    const statusListDocument = await createMockStatusListCredential({
      revoked: true
    });
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: mockStatusListTestOptions(statusListDocument),
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'Status error');
    expect(result).toHaveProperty(
      'error.cause.message', 'Credential status indicates revocation.');
  });
  it('verifyStatus=true, status list load failure preserves cause [mock]',
    async () => {
      const result = await verify({data: validUatExample, mode: 'uat',
        verifyStatus: true,
        _test: {
          // Force the status-list documentLoader path to fail without
          // replacing DID/context loading used for credential proofs.
          statusListLoadError: new Error(
            'Request failed with status code 404 Not Found: GET ' +
            VALID_UAT_STATUS_LIST_URL)
        },
        debug: true
      });
      expect(result).toHaveProperty('debug.issuerAccepted', true);
      expect(result).toHaveProperty('debug.vcbPresent', true);
      expect(result).toHaveProperty('valid', false);
      expect(result).toHaveProperty('error.message', 'Status error');
      expect(result.error.cause.message).not.toBe(
        '"credentialStatus" property not found.');
      expect(result.error.cause.message).toMatch(
        /Could not load "BitstringStatusListCredential"/);
    });
  it('verifyStatus=true, revocation distinguishable from load failure [mock]',
    async () => {
      const revokedList = await createMockStatusListCredential({
        revoked: true
      });
      const revoked = await verify({data: validUatExample, mode: 'uat',
        verifyStatus: true,
        _test: mockStatusListTestOptions(revokedList),
        debug: true
      });
      const unavailable = await verify({data: validUatExample, mode: 'uat',
        verifyStatus: true,
        _test: {
          statusListLoadError: new Error(
            'Request failed with status code 404 Not Found: GET ' +
            VALID_UAT_STATUS_LIST_URL)
        },
        debug: true
      });
      // Both fail closed; callers distinguish via error.cause.message.
      // No integer result codes are defined in this repository's public API.
      expect(revoked.valid).toBe(false);
      expect(unavailable.valid).toBe(false);
      expect(revoked.error.message).toBe('Status error');
      expect(unavailable.error.message).toBe('Status error');
      expect(revoked.error.cause.message).toBe(
        'Credential status indicates revocation.');
      expect(unavailable.error.cause.message).toMatch(
        /Could not load "BitstringStatusListCredential"/);
      expect(revoked.error.cause.message).not.toBe(
        unavailable.error.cause.message);
    });
  it('verifyStatus=true, status purpose mismatch [mock]', async () => {
    const statusListDocument = await createMockStatusListCredential({
      statusPurpose: 'suspension'
    });
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: mockStatusListTestOptions(statusListDocument),
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'Status error');
    expect(result.error.cause.message).toMatch(/status purpose/i);
    expect(result.error.cause.message).not.toBe(
      '"credentialStatus" property not found.');
  });
  it('verifyStatus=true, status list signature required [mock]', async () => {
    const statusListDocument = await createMockStatusListCredential();
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: {
        statusListDocument
        // verifyBitstringStatusListCredential defaults to true; unsigned
        // mock must fail closed.
      },
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'Status error');
    expect(result.error.cause.message).toMatch(
      /BitstringStatusListCredential" not verified/);
    expect(result.error.cause.message).not.toBe(
      '"credentialStatus" property not found.');
  });
  it('verifyStatus=true, issuer mismatch [mock]', async () => {
    const statusListDocument = await createMockStatusListCredential();
    statusListDocument.issuer = 'did:web:example.com';
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: mockStatusListTestOptions(statusListDocument),
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'Status error');
    expect(result.error.cause.message).toMatch(/Issuers .* do not match/i);
    expect(result.error.cause.message).not.toBe(
      '"credentialStatus" property not found.');
  });
  it('verifyStatus=true, invalid terseStatusListIndex [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: {
        credentialStatus: {
          type: 'TerseBitstringStatusListEntry',
          terseStatusListBaseUrl:
            'https://api.uat-credentials.dmv.ca.gov/status/dlid/1/status-lists',
          terseStatusListIndex: -1
        }
      },
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'Status error');
    expect(result.error.cause.message).toMatch(/terseStatusListIndex/);
  });
  it('verifyStatus=true, invalid terseStatusListBaseUrl [mock]', async () => {
    const result = await verify({data: validUatExample, mode: 'uat',
      verifyStatus: true,
      _test: {
        credentialStatus: {
          type: 'TerseBitstringStatusListEntry',
          terseStatusListBaseUrl: '',
          terseStatusListIndex: VALID_UAT_TERSE_STATUS_LIST_INDEX
        }
      },
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty('error.message', 'Status error');
    expect(result.error.cause.message).toMatch(/terseStatusListBaseUrl/);
  });
  it('verifyStatus=true, _test hooks ignored outside test env [mock]',
    async () => {
      const previousVitest = process.env.VITEST;
      const previousNodeEnv = process.env.NODE_ENV;
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      try {
        const result = await verify({data: validUatExample, mode: 'uat',
          verifyStatus: true,
          // If honored, this forces a distinctive test-only failure. Outside
          // test env it must be ignored and the real status path used.
          _test: {
            checkStatusError: true
          },
          debug: true
        });
        expect(result).toHaveProperty('valid', false);
        expect(result.error?.cause?.message).not.toBe(
          '**TEST**: Status check failed.');
      } finally {
        if(previousVitest === undefined) {
          delete process.env.VITEST;
        } else {
          process.env.VITEST = previousVitest;
        }
        if(previousNodeEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousNodeEnv;
        }
      }
    });
  it('reject uat in prod mode', async () => {
    const result = await verify({data: validUatExample,
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbRequired', false);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty('valid', false);
    expect(result).toHaveProperty(
      'error.message', 'Verify error');
    expect(result).toHaveProperty('error.cause.errors[0].message');
    expect(result.error.cause.errors[0].message).toMatch(
      /^URL not allowed: /);
  });
});

// [live-integration] Real production capture (Cali-1.raw). No `_test`.
// Skipped if absent. No PII logging. Does not prove physical-card authenticity.
describeCali1('client real fixture (Cali-1.raw) [live-integration]', () => {
  it('file bytes, prod, verifyStatus=true [live-crypto+status]', async () => {
    const result = await verify({
      data: cali1.fileBytes,
      mode: 'prod',
      verifyStatus: true,
      debug: true
    });
    expect(result).toHaveProperty('debug.issuerAccepted', true);
    expect(result).toHaveProperty('debug.vcbPresent', true);
    expect(result).toHaveProperty(
      'debug.credential.issuer', 'did:web:credentials.dmv.ca.gov');
    expect(result.debug.credential.proof?.cryptosuite).toBe('ecdsa-xi-2023');
    expect(result.debug.credential.credentialStatus.type)
      .toBe('TerseBitstringStatusListEntry');
    const base =
      result.debug.credential.credentialStatus.terseStatusListBaseUrl;
    const idx =
      result.debug.credential.credentialStatus.terseStatusListIndex;
    expect(base).toMatch(/^https:\/\/api\.credentials\.dmv\.ca\.gov\//);
    // Live status-list shard (no personal fields): /revocation/{floor(i/2^26)}
    const shard = Math.floor(idx / 67108864);
    expect(`${base}/revocation/${shard}`).toMatch(
      /\/status\/dlid\/1\/status-lists\/revocation\/39$/);
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
    expect(result.debug.verifyResult?.verified).toBe(true);
    expect(result.debug.verifyResult?.statusResult?.verified).toBe(true);
  });

  it('string / Uint8Array / Buffer parity with verifyStatus', async () => {
    const buf = Buffer.from(cali1.fileBytes);
    const [rStr, rU8, rBuf] = await Promise.all([
      verify({
        data: cali1.pdf417, mode: 'prod', verifyStatus: true, debug: true
      }),
      verify({
        data: cali1.fileBytes, mode: 'prod', verifyStatus: true, debug: true
      }),
      verify({
        data: buf, mode: 'prod', verifyStatus: true, debug: true
      })
    ]);
    for(const result of [rStr, rU8, rBuf]) {
      expect(result).toHaveProperty('debug.issuerAccepted', true);
      expect(result).toHaveProperty('valid', true);
      expect(result).not.toHaveProperty('error');
      expect(result.debug.verifyResult?.statusResult?.verified).toBe(true);
    }
  }, 20000);

  it('ParserVer-wrapped real barcode still verifies in prod', async () => {
    const wrapped = 'ParserVer: 3.1.8.0\n8/23/2026 2:49:47 PM\n\n' +
      cali1.pdf417;
    const result = await verify({
      data: wrapped,
      mode: 'prod',
      verifyStatus: true,
      debug: true
    });
    expect(result).toHaveProperty('valid', true);
    expect(result).not.toHaveProperty('error');
  });

  it('reject real prod barcode in uat mode', async () => {
    const result = await verify({
      data: cali1.fileBytes,
      mode: 'uat',
      debug: true
    });
    expect(result).toHaveProperty('valid', false);
    expect(result.error.cause.errors[0].message).toMatch(/^URL not allowed: /);
  });
});

// [live-integration] Physically fake ID barcode (Cali-Fake.raw). Evidence:
// VCB proof + status still succeed. SDK has no physical-card authenticity API.
describeCaliFake('client fake-ID fixture (Cali-Fake.raw) [live-integration]',
  () => {
    it('starts at @ (text-export control bytes may need transport repair)',
      () => {
        expect(caliFake.pdf417.startsWith('@')).toBe(true);
        expect(caliFake.fileBytes[0]).toBe(0x40);
      });

    it('file bytes, prod, verifyStatus=true [live-crypto+status]',
      async () => {
        const result = await verify({
          data: caliFake.fileBytes,
          mode: 'prod',
          verifyStatus: true,
          debug: true
        });
        expect(result).toHaveProperty('debug.issuerAccepted', true);
        expect(result).toHaveProperty('debug.vcbPresent', true);
        expect(result).toHaveProperty(
          'debug.credential.issuer', 'did:web:credentials.dmv.ca.gov');
        expect(result.debug.credential.proof?.cryptosuite)
          .toBe('ecdsa-xi-2023');
        const base =
          result.debug.credential.credentialStatus.terseStatusListBaseUrl;
        const idx =
          result.debug.credential.credentialStatus.terseStatusListIndex;
        const shard = Math.floor(idx / 67108864);
        // Same prod status-list shard as observed for Cali-1 (not a mock).
        expect(`${base}/revocation/${shard}`).toMatch(
          /\/status\/dlid\/1\/status-lists\/revocation\/39$/);
        // Physical fake still crypto+status valid — not Invalid signature.
        expect(result).toHaveProperty('valid', true);
        expect(result).not.toHaveProperty('error');
        expect(result.debug.verifyResult?.verified).toBe(true);
        expect(result.debug.verifyResult?.statusResult?.verified).toBe(true);
      });

    it('string / Buffer parity; not a signature-failure fixture',
      async () => {
        const buf = Buffer.from(caliFake.fileBytes);
        const [rStr, rBuf] = await Promise.all([
          verify({
            data: caliFake.pdf417,
            mode: 'prod',
            verifyStatus: true,
            debug: true
          }),
          verify({
            data: buf, mode: 'prod', verifyStatus: true, debug: true
          })
        ]);
        expect(rStr.valid).toBe(true);
        expect(rBuf.valid).toBe(true);
        expect(rStr).not.toHaveProperty('error');
        expect(rBuf).not.toHaveProperty('error');
      }, 20000);

    it('ParserVer-wrapped fake-ID barcode still verifies in prod',
      async () => {
        const wrapped = 'ParserVer: 3.1.8.0\n8/23/2026 2:49:47 PM\n\n' +
          caliFake.pdf417;
        const result = await verify({
          data: wrapped,
          mode: 'prod',
          verifyStatus: true,
          debug: true
        });
        expect(result).toHaveProperty('valid', true);
        expect(result).not.toHaveProperty('error');
      });

    it('reject fake-ID prod barcode in uat mode', async () => {
      const result = await verify({
        data: caliFake.fileBytes,
        mode: 'uat',
        debug: true
      });
      expect(result).toHaveProperty('valid', false);
      expect(result.error.cause.errors[0].message).toMatch(
        /^URL not allowed: /);
    });
  });
