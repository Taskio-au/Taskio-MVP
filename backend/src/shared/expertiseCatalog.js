'use strict';

// Backend view of the Phase 1 expertise catalog (single source of truth lives in /shared).
// This wrapper keeps import paths simple inside backend code.

const path = require('path');

// backend/src/shared -> Taskio-MVP/shared
// eslint-disable-next-line import/no-dynamic-require, global-require
const catalog = require(path.resolve(__dirname, '../../../shared/expertiseCatalog.js'));

module.exports = catalog;








