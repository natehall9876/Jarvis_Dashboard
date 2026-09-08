/**
 * MOCK DATA — for local UI development only. Not imported by the app.
 * See README.md in this directory.
 */
import type { Client, Job, Equipment } from "@/types/domain";

export const MOCK_CLIENTS: Client[] = [
  {
    id: "mock-client-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_name: "Sarah",
    last_name: "Delgado",
    company_name: null,
    email: "sarah.delgado@example.com",
    phone: "555-010-1234",
    preferred_contact_method: "sms",
    status: "active",
    notes: "Prefers morning appointments. Gate code changes seasonally.",
  },
];

export const MOCK_JOBS: Job[] = [
  {
    id: "mock-job-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    property_id: "mock-property-1",
    service_id: "mock-service-1",
    service_agreement_id: null,
    route_id: "mock-route-1",
    status: "scheduled",
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_start_time: "08:00:00",
    stop_order: 1,
    price: 65,
    budgeted_hours: 0.75,
    actual_hours: null,
    crew_size: 2,
    notes: null,
    completion_notes: null,
    started_at: null,
    completed_at: null,
  },
];

export const MOCK_EQUIPMENT: Equipment[] = [
  {
    id: "mock-equipment-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    name: "Zero-Turn Mower #2",
    category: "mower",
    manufacturer: "Scag",
    model: "Turf Tiger II",
    serial_number: "ST2-00219",
    purchase_date: "2023-03-01",
    purchase_price: 11500,
    status: "active",
    current_hours: 412,
    maintenance_due_date: null,
    maintenance_due_hours: 450,
    notes: null,
  },
];
