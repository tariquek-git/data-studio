#!/usr/bin/env node
/**
 * shape-diff.mjs — Response shape diff harness for Phase 2 API migrations.
 *
 * Usage:
 *   node api/__tests__/shape-diffs/shape-diff.mjs capture <url> <fixture-name>
 *   node api/__tests__/shape-diffs/shape-diff.mjs diff    <url> <fixture-name>
 *
 * Examples:
 *   node api/__tests__/shape-diffs/shape-diff.mjs capture http://localhost:7777/api/qa/status qa-status
 *   node api/__tests__/shape-diffs/shape-diff.mjs diff    http://localhost:7777/api/qa/status qa-status
 *
 * Run vercel dev on port 7777 to use localhost URLs:
 *   vercel dev --listen 7777
 *
 * Fixtures are stored as <fixture-name>.json in this directory.
 * The diff command compares the structural shape (keys + types) of the live
 * response against the fixture — ignoring concrete values so that data changes
 * don't produce false positives.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Fetch a URL and return parsed JSON. */
async function captureShape(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}`);
  return res.json();
}

/** Recursively extract the structural shape: keys + value types, no actual values. */
function extractShape(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    // Represent arrays by the shape of their first element
    return [extractShape(value[0], depth + 1)];
  }
  if (typeof value === 'object') {
    if (depth > 8) return '...'; // guard against deep nesting
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = extractShape(v, depth + 1);
    }
    return result;
  }
  return typeof value; // 'string' | 'number' | 'boolean'
}

/** Deep equality check — returns list of paths where shapes differ. */
function diffShapes(a, b, path = '') {
  const diffs = [];
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
    diffs.push(`${path || '(root)'}: expected ${JSON.stringify(a)} got ${JSON.stringify(b)}`);
    return diffs;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length > 0 && b.length > 0) {
      diffs.push(...diffShapes(a[0], b[0], `${path}[0]`));
    } else if (a.length > 0 && b.length === 0) {
      diffs.push(`${path}: fixture has array elements but live response returned []`);
    }
    return diffs;
  }
  if (typeof a === 'object' && a !== null && b !== null) {
    const aKeys = new Set(Object.keys(a));
    const bKeys = new Set(Object.keys(b));
    for (const k of aKeys) {
      if (!bKeys.has(k)) {
        diffs.push(`${path}.${k}: present in fixture but missing in live response`);
      } else {
        diffs.push(...diffShapes(a[k], b[k], `${path}.${k}`));
      }
    }
    for (const k of bKeys) {
      if (!aKeys.has(k)) {
        diffs.push(`${path}.${k}: present in live response but missing in fixture`);
      }
    }
    return diffs;
  }
  if (a !== b) {
    diffs.push(`${path || '(root)'}: type changed from ${a} to ${b}`);
  }
  return diffs;
}

// ── Commands ──────────────────────────────────────────────────────────────────

const [, , command, url, fixtureName] = process.argv;

if (!command || !url || !fixtureName) {
  console.error('Usage: shape-diff.mjs <capture|diff> <url> <fixture-name>');
  process.exit(1);
}

const fixturePath = join(__dir, `${fixtureName}.json`);

if (command === 'capture') {
  const data = await captureShape(url);
  const shape = extractShape(data);
  writeFileSync(fixturePath, JSON.stringify(shape, null, 2));
  console.log(`✓ Captured shape to ${fixturePath}`);
  process.exit(0);
}

if (command === 'diff') {
  if (!existsSync(fixturePath)) {
    console.error(`No fixture at ${fixturePath} — run capture first.`);
    process.exit(1);
  }
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf-8'));
  const data = await captureShape(url);
  const liveShape = extractShape(data);
  const diffs = diffShapes(fixture, liveShape);

  if (diffs.length === 0) {
    console.log('✓ No shape diffs — response structure matches fixture.');
    process.exit(0);
  } else {
    console.error(`✗ ${diffs.length} shape diff(s) found:`);
    for (const d of diffs) console.error(`  ${d}`);
    process.exit(1);
  }
}

console.error(`Unknown command: ${command}`);
process.exit(1);
