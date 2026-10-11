import { getIntelligence, intelligenceFailure, intelligenceOwner, readIntelligence, updateIntelligence } from '@/lib/intelligence/storage';
import { IntelligenceError, validateAction } from '@/lib/intelligence/model';
import { runIntelligenceWorker } from '@/lib/intelligence/worker';
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET() {
  try { return Response.json(await getIntelligence(), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return intelligenceFailure(e); }
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new IntelligenceError('An action is required.');
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 16384) { await reader.cancel(); throw new IntelligenceError('Action exceeds the 16 KiB limit.', 413); }
    parts.push(value);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new IntelligenceError('Send valid JSON for this action.'); }
}
async function mutate(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new IntelligenceError('This request must come from Jarvis.', 403);
    const { db, ownerId } = await intelligenceOwner();
    const action = validateAction(await readBody(request));
    if (action.action === 'refresh') {
      const refresh = await runIntelligenceWorker(ownerId);
      const receipt = refresh.receipts[0];
      if (!receipt || receipt.status === 'failed' && !receipt.run_id) throw new IntelligenceError('The refresh did not persist a result. Check storage and retry.', 503);
      if (receipt.status === 'skipped') throw new IntelligenceError(receipt.reason === 'disabled' ? 'Enable Intelligence before refreshing.' : 'A scan is running or was requested in the last minute. Try again shortly.', 409);
      return Response.json({ refresh, snapshot: await readIntelligence(db, ownerId) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    await updateIntelligence(db, action);
    return Response.json({ snapshot: await readIntelligence(db, ownerId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return intelligenceFailure(e); }
}
export const POST = mutate;
export const PATCH = mutate;
