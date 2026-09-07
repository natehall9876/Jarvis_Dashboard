import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withDataResult } from "@/lib/data/shared";
import type { DataResult, Equipment, EquipmentMaintenance } from "@/types/domain";

const MAINTENANCE_WARNING_DAYS = 14;
const MAINTENANCE_WARNING_HOURS = 20;

export type EquipmentWithMaintenanceFlag = Equipment & {
  maintenance_warning: boolean;
};

export async function getEquipment(): Promise<DataResult<EquipmentWithMaintenanceFlag[]>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("equipment").select("*").order("name");
    if (error) throw error;

    const now = Date.now();
    return (data ?? []).map((item) => {
      let warning = item.status === "needs_maintenance";
      if (!warning && item.maintenance_due_date) {
        const dueMs = new Date(item.maintenance_due_date).getTime();
        const daysUntilDue = (dueMs - now) / (1000 * 60 * 60 * 24);
        if (daysUntilDue <= MAINTENANCE_WARNING_DAYS) warning = true;
      }
      if (!warning && item.maintenance_due_hours !== null && item.current_hours !== null) {
        if (item.maintenance_due_hours - item.current_hours <= MAINTENANCE_WARNING_HOURS) warning = true;
      }
      return { ...item, maintenance_warning: warning };
    });
  });
}

export type EquipmentDetail = EquipmentWithMaintenanceFlag & {
  maintenance_history: EquipmentMaintenance[];
};

export async function getEquipmentById(id: string): Promise<DataResult<EquipmentDetail>> {
  return withDataResult(async () => {
    const supabase = await createSupabaseServerClient();

    const { data: item, error } = await supabase.from("equipment").select("*").eq("id", id).single();
    if (error) throw error;

    const { data: history } = await supabase
      .from("equipment_maintenance")
      .select("*")
      .eq("equipment_id", id)
      .order("service_date", { ascending: false });

    const now = Date.now();
    let warning = item.status === "needs_maintenance";
    if (!warning && item.maintenance_due_date) {
      const daysUntilDue = (new Date(item.maintenance_due_date).getTime() - now) / (1000 * 60 * 60 * 24);
      if (daysUntilDue <= MAINTENANCE_WARNING_DAYS) warning = true;
    }

    return { ...item, maintenance_warning: warning, maintenance_history: history ?? [] };
  });
}
