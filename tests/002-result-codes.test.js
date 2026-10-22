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
import {describe, expect, it} from 'vitest';

import {
  inspectBarcodeGate,
  mapVerifyResultToCode,
  RESULT_CODES,
  VERIFIER_SCOPE,
  verify,
  verifyWithCode
} from '../lib/index.js';

// eslint-disable-next-line @stylistic/max-len
const validUatExample = '@\n\u001e\rANSI 636014100102DL00410287ZC03280220DLDAQI8887059\nDCSFIVENINE\nDDEU\nDACTOMTEST\nDDFU\nDADNONE\nDDGU\nDCABM1\nDCBL80\nDCDNONE\nDBD08052025\nDBB01011980\nDBA01012030\nDBC1\nDAU070 IN\nDAYBLU\nDAG2415 1ST AVE 051\nDAISACRAMENTO\nDAJCA\nDAK958180000  \nDCF08/05/2025298TL/TLFD/30\nDCGUSA\nDAZBLN\nDAW200\nDCUIV\nDCK25217I88870590401\nDDAN\nDDB05202024\rZCZCABLU\nZCBBLN\nZCC\nZCD\nZCE2csdghoB2QXApgGCAQIYnYIYdhikGK6jGJwYphjEQRUYxhrmdn0HGLCiGJwYoBioRHX/cGAYtEEUGLalGJwYbBjMARjWGNwY2FhBephqE+tbyDCJM7XgRUzmFAY41xQu1cBinSYoLAAx/k6284STfQ0g1arQCtDpTWsqa96BLDbWzvj0R4JIrk/K5AAY2kEW\r';

// eslint-disable-next-line @stylistic/max-len
const invalidUatExample = '@\n\u001e\rANSI 636014100102DL00410281ZC03220220DLDAQI8889812\nDCSONETWO\nDDEU\nDACEERIETEST\nDDFU\nDADVON\nTWOMN\nDDGU\nDCAC\nDCBNONE\nDCDNONE\nDBD09042025\nDBB12121972\nDBA12122029\nDBC9\nDAU075\nIN\nDAYBLU\nDAG2415\n1ST\nAVE\nDAISACRAMENTO\nDAJCA\nDAK958180000  \nDCF09/04/2025796KP/12FD/29\nDCGUSA\nDAZBLN\nDAW159\nDCK25247I88898120401\nDDAN\nDDB05202024\rZCZCABLU\nZCBBLN\nZCC\nZCD\nZCE2csdghoB2QXApgGCAQIYnYIYdhikGK6jGJwYphjEQRUYxhrnDr7YGLCiGJwYoBioRHX/cGAYtEEUGLalGJwYbBjMARjWGNwY2FhBemJvZUdnBf+uJ1kK58r6AsaiKMDVR7OkfSWCdft/LTd9M0sgpUItYaZClwJUeX5s20C/bZJffuxHkFzcdUXRIXsY2kEW\r';

const TERSE_BITSTRING_STATUS_LIST_LENGTH = 67108864;
const VALID_UAT_TERSE_STATUS_LIST_INDEX = 3866524935;
const VALID_UAT_STATUS_LIST_INDEX =
  VALID_UAT_TERSE_STATUS_LIST_INDEX % TERSE_BITSTRING_STATUS_LIST_LENGTH;
const VALID_UAT_STATUS_LIST_URL =
  'https://api.uat-credentials.dmv.ca.gov/status/dlid/1/status-lists/' +
  'revocation/57';
const UAT_ISSUER = 'did:web:uat-credentials.dmv.ca.gov';

/**
 * @param {object} options - Options.
 * @param {boolean} [options.revoked=false] - Revocation bit.
 * @returns {Promise<object>} Mock status list credential.
 */
async function createMockStatusListCredential({revoked = false} = {}) {
  const list = new BitstringStatusList({
    length: TERSE_BITSTRING_STATUS_LIST_LENGTH
  });
  if(revoked) {
    list.setStatus(VALID_UAT_STATUS_LIST_INDEX, true);
  }
  const statusListCredential = await createCredential({
    id: VALID_UAT_STATUS_LIST_URL,
    list,
    statusPurpose: 'revocation'
  });
  statusListCredential.issuer = UAT_ISSUER;
  return statusListCredential;
}

describe('result codes [deterministic unit]', () => {
  it('exposes physicalAuthenticity as false', () => {
    expect(VERIFIER_SCOPE.physicalAuthenticity).toBe(false);
  });

  it('maps valid → 1', () => {
    expect(mapVerifyResultToCode({valid: true})).toBe(RESULT_CODES.VALID);
  });

  it('maps generic failure → 0', () => {
    expect(mapVerifyResultToCode({
      valid: false,
      error: new Error('Verify error', {
        cause: {errors: [{message: 'Invalid signature.'}]}
      })
    })).toBe(RESULT_CODES.INVALID);
  });

  it('maps confirmed revocation → 2', () => {
    expect(mapVerifyResultToCode({
      valid: false,
      error: new Error('Status error', {
        cause: new Error('Credential status indicates revocation.')
      })
    })).toBe(RESULT_CODES.REVOKED);
  });

  it('maps status-list load failure → 10', () => {
    expect(mapVerifyResultToCode({
      valid: false,
      error: new Error('Status error', {
        cause: new Error(
          'Could not load "BitstringStatusListCredential"; ' +
          'URL="https://example.test/status": Request failed')
      })
    })).toBe(RESULT_CODES.OFFLINE);
  });

  it('does not map URL not allowed to offline', () => {
    expect(mapVerifyResultToCode({
      valid: false,
      error: new Error('Verify error', {
        cause: {
          errors: [{
            message: 'URL not allowed: URL="did:web:credentials.dmv.ca.gov".'
          }]
        }
      })
    })).toBe(RESULT_CODES.INVALID);
  });
});

describe('verifyWithCode [live-crypto / mock]', () => {
  it('online=false returns 10 without calling crypto', async () => {
    const coded = await verifyWithCode({
      data: validUatExample,
      mode: 'uat',
      online: false
    });
    expect(coded.code).toBe(RESULT_CODES.OFFLINE);
    expect(coded.verifyResult.valid).toBe(false);
  });

  it('unsupported state returns 0', async () => {
    const coded = await verifyWithCode({
      data: validUatExample,
      state: 'NV',
      online: true
    });
    expect(coded.code).toBe(RESULT_CODES.INVALID);
  });

  it('valid UAT barcode → 1 [live-crypto]', async () => {
    const coded = await verifyWithCode({
      data: validUatExample,
      mode: 'uat',
      verifyStatus: false,
      online: true
    });
    expect(coded.code).toBe(RESULT_CODES.VALID);
  });

  it('invalid signature UAT barcode → 0 [live-crypto]', async () => {
    const coded = await verifyWithCode({
      data: invalidUatExample,
      mode: 'uat',
      verifyStatus: false,
      online: true
    });
    expect(coded.code).toBe(RESULT_CODES.INVALID);
  });

  it('revoked status bit → 2 [mock]', async () => {
    const statusListDocument = await createMockStatusListCredential({
      revoked: true
    });
    const coded = await verifyWithCode({
      data: validUatExample,
      mode: 'uat',
      verifyStatus: true,
      online: true,
      _test: {
        statusListDocument,
        verifyBitstringStatusListCredential: false
      }
    });
    expect(coded.code).toBe(RESULT_CODES.REVOKED);
  });

  it('status-list load failure → 10 [mock]', async () => {
    const coded = await verifyWithCode({
      data: validUatExample,
      mode: 'uat',
      verifyStatus: true,
      online: true,
      _test: {
        statusListLoadError: new Error(
          'Request failed with status code 404 Not Found: GET ' +
          VALID_UAT_STATUS_LIST_URL)
      }
    });
    expect(coded.code).toBe(RESULT_CODES.OFFLINE);
  });

  it('inspectBarcodeGate sees VCB on UAT example', async () => {
    const gate = await inspectBarcodeGate({data: validUatExample});
    expect(gate.ok).toBe(true);
    expect(gate.hasVcb).toBe(true);
    expect(gate.shouldVerify).toBe(true);
    expect(gate.issuerLooksCa).toBe(true);
  });

  it('allowlist failure maps to 0 not 10 [live-crypto]', async () => {
    const coded = await verifyWithCode({
      data: validUatExample,
      mode: 'prod',
      verifyStatus: false,
      online: true
    });
    expect(coded.code).toBe(RESULT_CODES.INVALID);
  });
});

describe('mapVerifyResultToCode with live verify()', () => {
  it('parity: verify valid → code 1', async () => {
    const result = await verify({
      data: validUatExample, mode: 'uat', verifyStatus: false
    });
    expect(mapVerifyResultToCode(result)).toBe(RESULT_CODES.VALID);
  });
});
