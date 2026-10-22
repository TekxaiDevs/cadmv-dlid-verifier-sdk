#!/usr/bin/env node
/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * End-to-end host acceptance (Option A) without a physical Android device:
 * asserts Xamarin contract codes and probes live UAT/prod status lists.
 *
 * Usage: node integration/e2e-host-acceptance.mjs
 */
import {setTimeout as delay} from 'node:timers/promises';
import {spawn} from 'node:child_process';

import {
  RESULT_CODES,
  VERIFIER_SCOPE,
  verifyWithCode
} from '../lib/index.js';

/* eslint-disable @stylistic/max-len */
const validUatExample = '@\n\u001e\rANSI 636014100102DL00410287ZC03280220DLDAQI8887059\nDCSFIVENINE\nDDEU\nDACTOMTEST\nDDFU\nDADNONE\nDDGU\nDCABM1\nDCBL80\nDCDNONE\nDBD08052025\nDBB01011980\nDBA01012030\nDBC1\nDAU070 IN\nDAYBLU\nDAG2415 1ST AVE 051\nDAISACRAMENTO\nDAJCA\nDAK958180000  \nDCF08/05/2025298TL/TLFD/30\nDCGUSA\nDAZBLN\nDAW200\nDCUIV\nDCK25217I88870590401\nDDAN\nDDB05202024\rZCZCABLU\nZCBBLN\nZCC\nZCD\nZCE2csdghoB2QXApgGCAQIYnYIYdhikGK6jGJwYphjEQRUYxhrmdn0HGLCiGJwYoBioRHX/cGAYtEEUGLalGJwYbBjMARjWGNwY2FhBephqE+tbyDCJM7XgRUzmFAY41xQu1cBinSYoLAAx/k6284STfQ0g1arQCtDpTWsqa96BLDbWzvj0R4JIrk/K5AAY2kEW\r';
/* eslint-enable @stylistic/max-len */

const UAT_STATUS =
  'https://api.uat-credentials.dmv.ca.gov/status/dlid/1/' +
  'status-lists/revocation/57';
const PROD_STATUS =
  'https://api.credentials.dmv.ca.gov/status/dlid/1/' +
  'status-lists/revocation/39';

const failures = [];

/**
 * @param {string} name - Assertion name.
 * @param {boolean} ok - Pass?
 * @param {string} [detail] - Detail.
 */
function assert(name, ok, detail = '') {
  if(ok) {
    console.log(`PASS  ${name}`);
  } else {
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
}

/**
 * @param {string} url - URL.
 * @returns {Promise<{status:number, ok:boolean}>} Probe result.
 */
async function probe(url) {
  try {
    const res = await fetch(url, {redirect: 'follow'});
    return {status: res.status, ok: res.ok};
  } catch(e) {
    return {status: 0, ok: false, error: e.message};
  }
}

async function runCodedContract() {
  const offline = await verifyWithCode({
    data: validUatExample, mode: 'uat', online: false
  });
  assert('offline → 10', offline.code === RESULT_CODES.OFFLINE);

  const valid = await verifyWithCode({
    data: validUatExample, mode: 'uat', verifyStatus: false, online: true
  });
  assert('valid UAT crypto → 1', valid.code === RESULT_CODES.VALID);

  const http = await fetchHttpRoundTrip();
  assert('HTTP /v1/verify offline → 10', http === RESULT_CODES.OFFLINE);
}

/**
 * Spin up the real service process briefly and POST offline.
 *
 * @returns {Promise<number>} Result code.
 */
async function fetchHttpRoundTrip() {
  const port = 18787;
  const child = spawn(
    process.execPath,
    ['integration/http-service.mjs'],
    {
      env: {
        ...process.env,
        VERIFY_HOST: '127.0.0.1',
        VERIFY_PORT: String(port)
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  try {
    await delay(800);
    const res = await fetch(`http://127.0.0.1:${port}/v1/verify`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        data: validUatExample,
        online: false,
        mode: 'uat'
      })
    });
    const body = await res.json();
    return body.code;
  } finally {
    child.kill('SIGTERM');
  }
}

async function runStatusProbes() {
  const uat = await probe(UAT_STATUS);
  const prod = await probe(PROD_STATUS);

  console.log(`INFO  UAT status → HTTP ${uat.status}`);
  console.log(`INFO  prod status → HTTP ${prod.status}`);

  assert(
    'prod status list reachable (live revocation infra)',
    prod.ok,
    `HTTP ${prod.status}`
  );

  if(uat.ok) {
    assert('live UAT revocation list reachable', true);
  } else {
    console.warn(
      'BLOCKED  live UAT revocation list not published ' +
      `(HTTP ${uat.status}). SDK fail-closed maps this to code 10. ` +
      'Unblock requires CA DMV to publish UAT status lists.');
  }
}

async function main() {
  console.log('=== Option A host e2e acceptance ===');
  await runCodedContract();
  await runStatusProbes();

  assert(
    'scope.physicalAuthenticity === false',
    VERIFIER_SCOPE.physicalAuthenticity === false
  );

  console.log(
    failures.length === 0 ?
      '=== RESULT: host e2e PASS (see BLOCKED notes above) ===' :
      `=== RESULT: ${failures.length} FAIL(s) ===`
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
