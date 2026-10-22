#!/usr/bin/env node
/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Option A: local Node HTTP service for Xamarin / .NET hosts.
 * Runs the full CA DMV JS verifier (crypto + status) online and returns
 * integer codes 1 / 0 / 2 / 10. Does not embed the SDK in Jint.
 *
 * Usage:
 *   node integration/http-service.mjs
 *   VERIFY_HOST=127.0.0.1 VERIFY_PORT=8787 node integration/http-service.mjs
 *
 * POST /v1/verify
 *   Body JSON: {
 *     "data": "<raw barcode string>",
 *     "mode": "prod" | "uat",
 *     "online": true,
 *     "verifyStatus": true,
 *     "requireGate": false,
 *     "state": "CA",
 *     "debug": false
 *   }
 *   Or { "dataBase64": "<base64 of raw bytes>" }
 *
 * Response JSON: {
 *   "code": 1 | 0 | 2 | 10,
 *   "valid": boolean,
 *   "errorMessage": string | null
 * }
 */
import {createServer} from 'node:http';

import {
  RESULT_CODES,
  verifyWithCode
} from '../lib/index.js';

const HOST = process.env.VERIFY_HOST || '127.0.0.1';
const PORT = Number(process.env.VERIFY_PORT || 8787);

/**
 * @param {import('node:http').IncomingMessage} req - Request.
 * @returns {Promise<string>} Raw body.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/**
 * @param {import('node:http').ServerResponse} res - Response.
 * @param {number} status - HTTP status.
 * @param {object} body - JSON body.
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  });
  res.end(payload);
}

/**
 * Sanitize verify error for host (no barcode / PII fields).
 *
 * @param {Error|undefined} error - Error.
 * @returns {string|null} Message.
 */
function sanitizeErrorMessage(error) {
  if(!error || typeof error.message !== 'string') {
    return null;
  }
  // Top-level messages only; do not serialize credential debug.
  return error.message;
}

const server = createServer(async (req, res) => {
  if(req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'cadmv-dlid-verifier-sdk',
      resultCodes: RESULT_CODES
    });
    return;
  }

  if(req.method === 'POST' && (req.url === '/v1/verify' ||
    req.url === '/verify')) {
    let body;
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      sendJson(res, 400, {
        code: RESULT_CODES.INVALID,
        valid: false,
        errorMessage: 'Invalid JSON body.'
      });
      return;
    }

    let data = body.data;
    if(data == null && typeof body.dataBase64 === 'string') {
      data = Buffer.from(body.dataBase64, 'base64');
    }
    if(data == null) {
      sendJson(res, 400, {
        code: RESULT_CODES.INVALID,
        valid: false,
        errorMessage: 'Missing data or dataBase64.'
      });
      return;
    }

    try {
      const coded = await verifyWithCode({
        data,
        online: body.online !== false,
        verifyStatus: body.verifyStatus !== false,
        requireGate: body.requireGate === true,
        state: body.state || 'CA',
        mode: body.mode === 'uat' ? 'uat' : 'prod',
        debug: body.debug === true
      });
      sendJson(res, 200, {
        code: coded.code,
        valid: coded.verifyResult?.valid === true,
        errorMessage: sanitizeErrorMessage(coded.verifyResult?.error),
        gate: coded.gate ?
          {
            shouldVerify: coded.gate.shouldVerify,
            hasVcb: coded.gate.hasVcb,
            issueDateOnOrAfterRequired:
              coded.gate.issueDateOnOrAfterRequired,
            issuerLooksCa: coded.gate.issuerLooksCa
          } :
          undefined
      });
    } catch(e) {
      sendJson(res, 500, {
        code: RESULT_CODES.INVALID,
        valid: false,
        errorMessage: e?.message || 'Verifier service error.'
      });
    }
    return;
  }

  sendJson(res, 404, {
    code: RESULT_CODES.INVALID,
    valid: false,
    errorMessage: 'Not found.'
  });
});

server.listen(PORT, HOST, () => {

  console.log(
    `cadmv-dlid-verifier-sdk HTTP service listening on http://${HOST}:${PORT}`);

  console.log('POST /v1/verify  GET /health');
});
