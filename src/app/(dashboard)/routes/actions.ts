"use server";

import { revalidatePath } from "next/cache";
import { updateRouteStopOrder } from "@/lib/data/routes";

export async function moveRouteStop(routeId: string, stops: { id: string; stop_order: number }[]) {
  const result = await updateRouteStopOrder(stops);
  if (result.error) throw new Error(result.error);
  revalidatePath(`/routes/${routeId}`);
  revalidatePath("/routes");
}
