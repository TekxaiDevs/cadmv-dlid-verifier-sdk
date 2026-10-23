/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
import config from '@digitalbazaar/eslint-config/universal-recommended';

export default [
  {
    ignores: [
      'bridge/js/dist/**',
      'bridge/js/test/**',
      'bridge/android/**',
      '**/node_modules/**'
    ]
  },
  ...config
];
