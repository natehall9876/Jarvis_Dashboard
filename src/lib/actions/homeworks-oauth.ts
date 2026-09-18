"use server";

import { getSampleCustomers, type HomeworksCustomerSample } from "@/lib/integrations/homeworks-api";
import { disconnectHomeworks as disconnect } from "@/lib/integrations/homeworks-connection";
import { revalidatePath } from "next/cache";

export type VerifyResult =
  | { ok: true; customers: HomeworksCustomerSample[] }
  | { ok: false; message: string };

/** Read-only. The only way to actually prove the connection works — a "Connected" badge alone is not evidence. */
export async function verifyHomeworksConnection(): Promise<VerifyResult> {
  const result = await getSampleCustomers(5);
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, customers: result.data.customers };
}

export async function disconnectHomeworksAction(): Promise<void> {
  await disconnect();
  revalidatePath("/settings");
}
