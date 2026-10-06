import { OperationalReceivables } from "@/components/command-center/operational-receivables";
import { Suspense } from 'react';
import { QuickBooksMoney } from '@/components/command-center/live-integrations';
export const dynamic='force-dynamic';
export default function MoneyPage(){return <div className="space-y-5"><h1 className="text-2xl font-semibold">Money</h1><Suspense fallback={<p role="status">Loading recorded receivables…</p>}><OperationalReceivables /></Suspense><Suspense fallback={<p role="status">Reading QuickBooks invoices and payments…</p>}><QuickBooksMoney full/></Suspense></div>;}
