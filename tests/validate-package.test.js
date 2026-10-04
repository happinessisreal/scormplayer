import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validatePackage } from '../server/validate-package.js';

const SAMPLE = path.resolve('examples/sample-course');
const hasXmllint = (() => { try { execFileSync('xmllint', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

/** Copy the sample course into a temp dir, optionally mutating files. */
function fixture(mutate = () => {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorm-'));
  fs.cpSync(SAMPLE, dir, { recursive: true });
  mutate(dir);
  return dir;
}
const msgs = (r, type) => r.logs.filter((l) => l.type === type).map((l) => l.msg).join('\n');

test('sample course is valid and launches index.html', () => {
  const r = validatePackage(fixture());
  assert.equal(r.ok, true, msgs(r, 'error'));
  assert.equal(r.launchHref, 'index.html');
  assert.equal(msgs(r, 'error'), '');
  assert.match(msgs(r, 'scorm'), /All referenced files are present/);
});

test('sample manifest passes the bundled ADL XSD schemas', { skip: !hasXmllint && 'xmllint not installed' }, () => {
  const r = validatePackage(fixture());
  assert.match(msgs(r, 'scorm'), /XSD Validation Passed/);
});

test('missing xmllint is a warning, not a failure', () => {
  const r = validatePackage(fixture(), { xmllint: 'xmllint-does-not-exist' });
  assert.equal(r.ok, true);
  assert.match(msgs(r, 'warn'), /xmllint is not installed/);
});

test('no manifest falls back to index.html', () => {
  const r = validatePackage(fixture((d) => fs.rmSync(path.join(d, 'imsmanifest.xml'))));
  assert.equal(r.ok, true);
  assert.equal(r.launchHref, 'index.html');
  assert.match(msgs(r, 'warn'), /Fallback/);
});

test('no manifest and no index.html is rejected', () => {
  const r = validatePackage(fixture((d) => fs.rmSync(d + '/imsmanifest.xml') || fs.rmSync(d + '/index.html')));
  assert.equal(r.ok, false);
  assert.match(r.error, /Missing imsmanifest.xml/);
});

test('malformed XML is rejected with the line number', () => {
  const r = validatePackage(fixture((d) => fs.writeFileSync(d + '/imsmanifest.xml', '<manifest>\n<organizations></manifest>')));
  assert.equal(r.ok, false);
  assert.equal(r.error, 'Manifest contains invalid XML syntax');
  assert.match(msgs(r, 'error'), /Line: \d+/);
});

test('files referenced by the manifest must exist', () => {
  const r = validatePackage(fixture((d) => fs.rmSync(d + '/index.html')));
  assert.match(msgs(r, 'warn'), /Missing file: index.html/);
});

test('manifest without resources has no launch file', () => {
  const r = validatePackage(fixture((d) => {
    const p = d + '/imsmanifest.xml';
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/<resources>[\s\S]*<\/resources>/, '<resources/>'));
  }), { xmllint: 'xmllint-does-not-exist' });
  assert.equal(r.ok, false);
  assert.match(msgs(r, 'error'), /No <resources> found/);
});
