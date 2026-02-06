#!/usr/bin/env node
/**
 * Robust directory removal helper.
 *
 * Why this exists:
 * - On macOS, Finder can create `.DS_Store` files inside build output dirs (like `.next/*`)
 *   while Node is recursively deleting, which can lead to flaky ENOTEMPTY failures.
 * - This script retries and aggressively removes `.DS_Store` / `._*` files to make
 *   builds more deterministic.
 */

import fs from 'node:fs';
import path from 'node:path';

function sleepMs(ms) {
  // Synchronous sleep without extra deps.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isIgnorableMetadata(name) {
  return name === '.DS_Store' || name.startsWith('._');
}

function deleteMetadataFiles(rootDir) {
  /** @type {string[]} */
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }

      if (ent.isSymbolicLink()) {
        // Don't follow symlinks; treat as a file entry.
        if (isIgnorableMetadata(ent.name)) {
          try {
            fs.unlinkSync(full);
          } catch {
            // ignore
          }
        }
        continue;
      }

      if (ent.isFile() && isIgnorableMetadata(ent.name)) {
        try {
          fs.unlinkSync(full);
        } catch {
          // ignore
        }
      }
    }
  }
}

function rmDirRobust(target) {
  if (!target) throw new Error('Usage: node scripts/rm_dir.mjs <path>');
  if (!fs.existsSync(target)) return;

  // A short retry loop covers transient ENOTEMPTY races caused by metadata files.
  const attempts = 25;
  for (let i = 0; i < attempts; i++) {
    deleteMetadataFiles(target);
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = err && typeof err === 'object' ? err.code : null;
      if (code === 'ENOTEMPTY' || code === 'EBUSY' || code === 'EPERM') {
        sleepMs(80);
        continue;
      }
      throw err;
    }
  }

  // Last attempt: try once more after deleting metadata; if it fails, surface error.
  deleteMetadataFiles(target);
  fs.rmSync(target, { recursive: true, force: true });
}

const target = process.argv[2];
rmDirRobust(target);

