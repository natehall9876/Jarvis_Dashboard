// Real PostgreSQL (PGlite), isolated in memory. Never connects to Supabase.
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
try {
  await db.exec(read('scripts/fixtures/homeworks-production-schema-20261007.sql'));
  if (!process.argv.includes('--baseline')) {
    await db.exec(read('supabase/migrations/20261007030921_homeworks_ownership_guards.sql'));
  }
  const results = await db.exec(read('scripts/homeworks-ownership-regression.sql'));
  for (const result of results) for (const row of result.rows ?? []) {
    if (row.test_result) console.log(row.test_result);
  }
  const check = await db.query("select count(*)::int as n from public.clients where id::text like '90000000-%'");
  if (check.rows[0].n !== 0) throw new Error('Fixture rollback failed');
  console.log('PASS: ownership fixtures rolled back');
  // Existing sync/schedule tests require source fixtures. Create only synthetic
  // records, with the real projector and service-role privileges, in this DB.
  await db.exec(`SET ROLE service_role;
    SELECT public.homeworks_claim_lease('sync','80000000-0000-4000-8000-000000000001',280);
    SELECT public.homeworks_apply_page('80000000-0000-4000-8000-000000000001','seed','customers','[{"id":-800001,"firstName":"SYNTHETIC","status":"ACTIVE"}]',null,false);
    SELECT public.homeworks_apply_page('80000000-0000-4000-8000-000000000001','seed','properties','[{"id":-800002,"customerId":-800001,"name":"SYNTHETIC","isActive":true}]',null,false);
    SELECT public.homeworks_apply_page('80000000-0000-4000-8000-000000000001','seed','events','[{"id":-800003,"propertyId":-800002,"status":"OPEN","startDate":"2026-10-07","hasTime":false,"total":65,"budgetedHours":0.5,"users":[],"routeStops":[],"lineItems":[]}]',null,false);
    SELECT public.homeworks_apply_page('80000000-0000-4000-8000-000000000001','seed','invoices','[{"id":-800004,"customerId":-800001,"propertyId":-800002,"number":"SYNTHETIC","date":"2026-10-07","dueDate":"2026-10-10T00:00:00Z","status":"PENDING","subtotal":65,"tax":0,"total":65,"paidAmount":0,"lineItems":[{"id":-800005,"name":"Test line","quantity":1,"price":65,"subtotalWithTax":65}]}]',null,false);
    SELECT public.homeworks_release_lease('sync','80000000-0000-4000-8000-000000000001'); RESET ROLE;`);
  for (const script of ['scripts/homeworks-sync-regression.sql', 'scripts/schedule-authority-regression.sql']) {
    const results = await db.exec(read(script));
    for (const result of results) for (const row of result.rows ?? []) {
      if (row.test_result) console.log(row.test_result);
    }
    console.log('PASS: ' + script);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
