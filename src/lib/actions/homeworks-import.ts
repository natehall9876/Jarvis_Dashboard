"use server";

import { LEGACY_HOMEWORKS_WRITE_DISABLED } from "@/lib/integrations/homeworks-sync";

export type ImportResultRow = {
  homeworksId: string;
  name: string;
  outcome: "created" | "updated" | "skipped_duplicate" | "error";
  detail?: string;
};

export type ImportResult =
  | {
      ok: true;
      totalCustomers: number;
      created: number;
      updated: number;
      skippedDuplicates: number;
      propertiesSynced: number;
      errors: number;
      rows: ImportResultRow[];
    }
  | { ok: false; message: string };

/** Retired: automatic sync owns the Homeworks projections. Performs no I/O. */
export async function confirmHomeworksImport(): Promise<ImportResult> {
  return { ok: false, message: LEGACY_HOMEWORKS_WRITE_DISABLED };
}
