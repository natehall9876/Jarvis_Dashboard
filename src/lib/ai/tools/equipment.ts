import { getEquipment, getEquipmentById } from "@/lib/data/equipment";
import { unwrap, type ToolSpec } from "@/lib/ai/tool-types";

export const equipmentTools: ToolSpec[] = [
  {
    name: "get_equipment",
    description:
      "List all equipment with status, current hours, maintenance-due date/hours, and a maintenance_warning flag (true when service is due soon or overdue). Use for 'what needs attention' equipment questions.",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const result = await getEquipment();
      return unwrap(result, (equipment) => ({
        data: equipment.map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          status: e.status,
          current_hours: e.current_hours,
          maintenance_due_date: e.maintenance_due_date,
          maintenance_due_hours: e.maintenance_due_hours,
          maintenance_warning: e.maintenance_warning,
        })),
        references: equipment.map((e) => ({ type: "equipment" as const, id: e.id, label: e.name })),
      }));
    },
  },
  {
    name: "get_equipment_details",
    description: "One piece of equipment's full detail including its complete maintenance history (each service, date, and cost).",
    input_schema: {
      type: "object",
      properties: { equipment_id: { type: "string", description: "The equipment's UUID." } },
      required: ["equipment_id"],
    },
    execute: async (input) => {
      const result = await getEquipmentById(String(input.equipment_id));
      return unwrap(result, (item) => ({
        data: {
          id: item.id,
          name: item.name,
          category: item.category,
          manufacturer: item.manufacturer,
          model: item.model,
          status: item.status,
          current_hours: item.current_hours,
          maintenance_due_date: item.maintenance_due_date,
          maintenance_due_hours: item.maintenance_due_hours,
          maintenance_warning: item.maintenance_warning,
          notes: item.notes,
          maintenance_history: item.maintenance_history.map((m) => ({
            date: m.maintenance_date,
            type: m.maintenance_type,
            description: m.description,
            parts_cost: m.parts_cost,
            labor_cost: m.labor_cost,
            vendor: m.vendor,
          })),
        },
        references: [{ type: "equipment" as const, id: item.id, label: item.name }],
      }));
    },
  },
];
