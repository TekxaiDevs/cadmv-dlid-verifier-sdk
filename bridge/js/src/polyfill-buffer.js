/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * esbuild inject shim: PDF417 decode paths expect Node's Buffer.
 */
import {Buffer as NodeBuffer} from 'buffer';

export const Buffer = globalThis.Buffer || NodeBuffer;
if(typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
