// Local camera processing: the page serves the pinned model/WASM itself.
// Camera frames never leave the browser. Avoid committing 45 MB of generated
// assets: npm ci copies the locked runtime and verifies Google's model bytes.
import { cp, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public/mediapipe');
const model = path.join(output, 'hand_landmarker.task');
const expected = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const valid = (bytes) => createHash('sha256').update(bytes).digest('hex') === expected;
await mkdir(output, { recursive: true });
await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), path.join(output, 'wasm'), { recursive: true });
let cached = false;
try { cached = valid(await readFile(model)); } catch { /* First install. */ }
if (!cached) {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Hand model download failed (${response.status}). Retry npm run postinstall.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes)) throw new Error('Hand model checksum mismatch; refusing to install it.');
  const temporary = `${model}.tmp`;
  try { await writeFile(temporary, bytes); await rename(temporary, model); }
  finally { await rm(temporary, { force: true }); }
}
console.log('Workshop hand tracking runtime and verified model are ready.');
