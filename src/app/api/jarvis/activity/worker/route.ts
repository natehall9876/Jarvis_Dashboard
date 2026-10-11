import {timingSafeEqual} from 'node:crypto';
import {runActivityWorker} from '@/lib/jarvis/background-worker';
export const runtime='nodejs';
export const maxDuration=120;
function authorized(request:Request){const expected=process.env.CRON_SECRET;if(!expected||expected.length<24)return false;const actual=request.headers.get('authorization')??'';const a=Buffer.from(actual),b=Buffer.from(`Bearer ${expected}`);return a.length===b.length&&timingSafeEqual(a,b);}
async function worker(request:Request){if(!authorized(request))return Response.json({error:'Unauthorized worker request.'},{status:401});try{return Response.json(await runActivityWorker(),{headers:{'Cache-Control':'no-store'}});}catch{ return Response.json({error:'The activity worker failed; no success was recorded. Check activity storage and server logs.'},{status:503});}}
export const GET=worker;
export const POST=worker;
