const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function validateReleaseVersion(version) {
  assert.equal(typeof version, 'string', 'Missing expected release version');
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'Invalid expected release version');
  return version;
}

function readReleaseVersion(sourceRoot) {
  return validateReleaseVersion(JSON.parse(fs.readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')).version);
}

function assertPackagedVersion(actual, expected) {
  validateReleaseVersion(expected);
  assert.equal(actual, expected, `Wrong packaged version: expected ${expected}, received ${actual}`);
  return actual;
}

module.exports = { validateReleaseVersion, readReleaseVersion, assertPackagedVersion };
