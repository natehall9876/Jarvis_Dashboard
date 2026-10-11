import { timingSafeEqual } from 'node:crypto';
import { runIntelligenceWorker } from '@/lib/intelligence/worker';
export const runtime = 'nodejs';
export const maxDuration = 120;
function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 24) return false;
  const actual = Buffer.from(request.headers.get('authorization') ?? ''), target = Buffer.from(`Bearer ${expected}`);
  return actual.length === target.length && timingSafeEqual(actual, target);
}
async function worker(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized worker request.' }, { status: 401 });
  try {
    const result = await runIntelligenceWorker();
    const failed = result.receipts.some(r => r.status === 'failed' && !r.run_id);
    return Response.json(result, { status: failed ? 503 : 200, headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'The intelligence worker failed; no successful run was recorded.' }, { status: 503 }); }
}
export const GET = worker;
export const POST = worker;
