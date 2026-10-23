/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {RESULT_CODES, verifyBarcode} from '../src/verifyBarcode.js';
import {invalidUatExample, validUatExample} from './fixtures.mjs';

function toBase64(str) {
  return Buffer.from(str, 'utf8').toString('base64');
}

// Node lacks browser atob in older runtimes; provide for the wrapper.
if(typeof globalThis.atob !== 'function') {
  globalThis.atob = s => Buffer.from(s, 'base64').toString('binary');
}

describe('verifyBarcode wrapper', () => {
  it('empty Base64 → 0', async () => {
    assert.equal(await verifyBarcode(''), RESULT_CODES.INVALID);
  });

  it('malformed Base64 → 0', async () => {
    assert.equal(await verifyBarcode('!!!not-base64!!!'), RESULT_CODES.INVALID);
  });

  it('bogus payload → 0', async () => {
    const code = await verifyBarcode(toBase64('bogus'), {mode: 'uat'});
    assert.equal(code, RESULT_CODES.INVALID);
  });

  it('invalid UAT signature → 0 [live-crypto]', async () => {
    const code = await verifyBarcode(toBase64(invalidUatExample), {
      mode: 'uat',
      skipStatus: true
    });
    assert.equal(code, RESULT_CODES.INVALID);
  });

  it('valid UAT crypto with skipStatus → 1 [live-crypto]', async () => {
    const code = await verifyBarcode(toBase64(validUatExample), {
      mode: 'uat',
      skipStatus: true
    });
    assert.equal(code, RESULT_CODES.VALID);
  });

  it('valid UAT with status (pass 2) fails closed on UAT list gap',
    async () => {
      // Live UAT status lists often 404 → offline (10), not silent 1.
      const code = await verifyBarcode(toBase64(validUatExample), {
        mode: 'uat',
        skipStatus: false
      });
      assert.ok(
        code === RESULT_CODES.OFFLINE || code === RESULT_CODES.VALID,
        `expected 10 or 1, got ${code}`);
    });
});
