/**
 * TypeScript types for the WeedEater Lawn Care Supabase schema.
 *
 * Reconciled against the LIVE schema (queried via information_schema on
 * 2026-09-07) — column names, nullability, and foreign keys here match the
 * real database, not the original project-brief guesses. Shaped like
 * `supabase gen types typescript` output, so you can regenerate this file
 * with the Supabase CLI later and nothing else needs to change:
 *
 *   npx supabase gen types typescript --project-id pmxzldcltkfjkmtatvlu \
 *     --schema public > src/types/database.types.ts
 *
 * Note: the live database also has a capitalized "Properties" table
 * (distinct from "properties" — Postgres treats quoted-case identifiers as
 * separate tables). It has a subset of the real columns and appears to be
 * leftover cruft from initial setup. This app intentionally targets the
 * lowercase "properties" table and does not read from or modify "Properties".
 *
 * "Enum-like" text columns (status, role, frequency, etc.) are plain `text`
 * in the database with no CHECK constraint we could confirm, so their Row
 * type here is `string` — the exported *Status/*Role union types alongside
 * them document the values this app actually writes and expects, but the
 * database itself doesn't enforce them.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Expected values for text columns (documentation, not DB-enforced)
// ---------------------------------------------------------------------------

export type ClientStatus = "active" | "inactive" | "prospect";
export type ContactMethod = "sms" | "email" | "phone";
export type EmployeeRole = "owner" | "manager" | "crew_lead" | "crew_member" | "admin";
export type RouteDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
export type AgreementFrequency = "weekly" | "biweekly" | "monthly" | "seasonal" | "one_time";
export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "skipped";
export type EquipmentStatus = "active" | "maintenance" | "out_of_service";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export type InvoiceStatus = "draft" | "sent" | "paid" | "void";
export type PaymentMethod = "cash" | "check" | "credit_card" | "ach" | "other";
export type PhotoType = "before" | "after" | "issue" | "other";

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          first_name: string | null;
          last_name: string | null;
          company_name: string | null;
          email: string | null;
          phone: string | null;
          preferred_contact_method: string | null;
          status: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          first_name?: string | null;
          last_name?: string | null;
          company_name?: string | null;
          email?: string | null;
          phone?: string | null;
          preferred_contact_method?: string | null;
          status?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };

      properties: {
        Row: {
          id: string;
          created_at: string | null;
          updated_at: string;
          client_id: string | null;
          property_name: string | null;
          street: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          latitude: number | null;
          longitude: number | null;
          access_notes: string | null;
          service_notes: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string | null;
          updated_at?: string;
          client_id?: string | null;
          property_name?: string | null;
          street?: string | null;
          city?: string | null;
          state?: string | null;
          zip?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          access_notes?: string | null;
          service_notes?: string | null;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "properties_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };

      services: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          name: string;
          description: string | null;
          category: string | null;
          default_price: number | null;
          default_budgeted_hours: number | null;
          recurring_allowed: boolean;
          active: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          description?: string | null;
          category?: string | null;
          default_price?: number | null;
          default_budgeted_hours?: number | null;
          recurring_allowed?: boolean;
          active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["services"]["Insert"]>;
        Relationships: [];
      };

      employees: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          first_name: string;
          last_name: string | null;
          phone: string | null;
          email: string | null;
          role: string | null;
          hourly_rate: number | null;
          has_drivers_license: boolean;
          active: boolean;
          hire_date: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          first_name: string;
          last_name?: string | null;
          phone?: string | null;
          email?: string | null;
          role?: string | null;
          hourly_rate?: number | null;
          has_drivers_license?: boolean;
          active?: boolean;
          hire_date?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };

      routes: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          name: string;
          route_day: string | null;
          start_location: string | null;
          active: boolean;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          route_day?: string | null;
          start_location?: string | null;
          active?: boolean;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["routes"]["Insert"]>;
        Relationships: [];
      };

      service_agreements: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          property_id: string;
          service_id: string;
          route_id: string | null;
          recurring_price: number | null;
          frequency: string | null;
          preferred_day: string | null;
          budgeted_hours: number | null;
          start_date: string | null;
          end_date: string | null;
          active: boolean;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          property_id: string;
          service_id: string;
          route_id?: string | null;
          recurring_price?: number | null;
          frequency?: string | null;
          preferred_day?: string | null;
          budgeted_hours?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          active?: boolean;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["service_agreements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "service_agreements_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_agreements_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "service_agreements_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
        ];
      };

      route_stops: {
        Row: {
          id: string;
          created_at: string;
          route_id: string;
          property_id: string;
          stop_order: number | null;
          estimated_minutes: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          route_id: string;
          property_id: string;
          stop_order?: number | null;
          estimated_minutes?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["route_stops"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "route_stops_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "route_stops_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };

      jobs: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          property_id: string;
          service_id: string | null;
          service_agreement_id: string | null;
          route_id: string | null;
          scheduled_date: string | null;
          scheduled_start_time: string | null;
          stop_order: number | null;
          status: string;
          price: number | null;
          budgeted_hours: number | null;
          actual_hours: number | null;
          crew_size: number | null;
          notes: string | null;
          completion_notes: string | null;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          property_id: string;
          service_id?: string | null;
          service_agreement_id?: string | null;
          route_id?: string | null;
          scheduled_date?: string | null;
          scheduled_start_time?: string | null;
          stop_order?: number | null;
          status?: string;
          price?: number | null;
          budgeted_hours?: number | null;
          actual_hours?: number | null;
          crew_size?: number | null;
          notes?: string | null;
          completion_notes?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "jobs_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_service_agreement_id_fkey";
            columns: ["service_agreement_id"];
            isOneToOne: false;
            referencedRelation: "service_agreements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jobs_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
        ];
      };

      job_employees: {
        Row: {
          job_id: string;
          employee_id: string;
          hours_worked: number | null;
        };
        Insert: {
          job_id: string;
          employee_id: string;
          hours_worked?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["job_employees"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "job_employees_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_employees_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };

      time_entries: {
        Row: {
          id: string;
          created_at: string;
          employee_id: string;
          job_id: string | null;
          work_date: string | null;
          clock_in: string | null;
          clock_out: string | null;
          regular_hours: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          employee_id: string;
          job_id?: string | null;
          work_date?: string | null;
          clock_in?: string | null;
          clock_out?: string | null;
          regular_hours?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["time_entries"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "time_entries_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };

      equipment: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          name: string;
          category: string | null;
          manufacturer: string | null;
          model: string | null;
          serial_number: string | null;
          purchase_date: string | null;
          purchase_price: number | null;
          current_hours: number | null;
          status: string | null;
          maintenance_due_date: string | null;
          maintenance_due_hours: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          category?: string | null;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          purchase_date?: string | null;
          purchase_price?: number | null;
          current_hours?: number | null;
          status?: string | null;
          maintenance_due_date?: string | null;
          maintenance_due_hours?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment"]["Insert"]>;
        Relationships: [];
      };

      job_equipment: {
        Row: {
          job_id: string;
          equipment_id: string;
          hours_used: number | null;
        };
        Insert: {
          job_id: string;
          equipment_id: string;
          hours_used?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["job_equipment"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "job_equipment_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "job_equipment_equipment_id_fkey";
            columns: ["equipment_id"];
            isOneToOne: false;
            referencedRelation: "equipment";
            referencedColumns: ["id"];
          },
        ];
      };

      equipment_maintenance: {
        Row: {
          id: string;
          created_at: string;
          equipment_id: string;
          maintenance_date: string | null;
          maintenance_type: string | null;
          description: string | null;
          equipment_hours: number | null;
          parts_cost: number;
          labor_cost: number;
          next_service_hours: number | null;
          next_service_date: string | null;
          vendor: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          equipment_id: string;
          maintenance_date?: string | null;
          maintenance_type?: string | null;
          description?: string | null;
          equipment_hours?: number | null;
          parts_cost?: number;
          labor_cost?: number;
          next_service_hours?: number | null;
          next_service_date?: string | null;
          vendor?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment_maintenance"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "equipment_maintenance_equipment_id_fkey";
            columns: ["equipment_id"];
            isOneToOne: false;
            referencedRelation: "equipment";
            referencedColumns: ["id"];
          },
        ];
      };

      quotes: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          client_id: string;
          property_id: string | null;
          quote_number: string | null;
          status: string;
          subtotal: number;
          tax: number;
          total: number;
          valid_until: string | null;
          sent_at: string | null;
          accepted_at: string | null;
          declined_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          client_id: string;
          property_id?: string | null;
          quote_number?: string | null;
          status?: string;
          subtotal?: number;
          tax?: number;
          total?: number;
          valid_until?: string | null;
          sent_at?: string | null;
          accepted_at?: string | null;
          declined_at?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["quotes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };

      quote_items: {
        Row: {
          id: string;
          created_at: string;
          quote_id: string;
          service_id: string | null;
          description: string;
          quantity: number;
          unit_price: number;
          total: number;
          budgeted_hours: number | null;
          is_optional: boolean;
          sort_order: number | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          quote_id: string;
          service_id?: string | null;
          description: string;
          quantity?: number;
          unit_price?: number;
          total?: number;
          budgeted_hours?: number | null;
          is_optional?: boolean;
          sort_order?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["quote_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey";
            columns: ["quote_id"];
            isOneToOne: false;
            referencedRelation: "quotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quote_items_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };

      invoices: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          client_id: string;
          property_id: string | null;
          invoice_number: string | null;
          status: string;
          invoice_date: string | null;
          due_date: string | null;
          subtotal: number;
          tax: number;
          total: number;
          amount_paid: number;
          sent_at: string | null;
          paid_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          client_id: string;
          property_id?: string | null;
          invoice_number?: string | null;
          status?: string;
          invoice_date?: string | null;
          due_date?: string | null;
          subtotal?: number;
          tax?: number;
          total?: number;
          amount_paid?: number;
          sent_at?: string | null;
          paid_at?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_property_id_fkey";
            columns: ["property_id"];
            isOneToOne: false;
            referencedRelation: "properties";
            referencedColumns: ["id"];
          },
        ];
      };

      invoice_items: {
        Row: {
          id: string;
          created_at: string;
          invoice_id: string;
          job_id: string | null;
          service_id: string | null;
          description: string;
          quantity: number;
          unit_price: number;
          total: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          invoice_id: string;
          job_id?: string | null;
          service_id?: string | null;
          description: string;
          quantity?: number;
          unit_price?: number;
          total?: number;
        };
        Update: Partial<Database["public"]["Tables"]["invoice_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoice_items_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };

      payments: {
        Row: {
          id: string;
          created_at: string;
          invoice_id: string | null;
          client_id: string;
          amount: number;
          payment_date: string | null;
          payment_method: string | null;
          external_reference: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          invoice_id?: string | null;
          client_id: string;
          amount: number;
          payment_date?: string | null;
          payment_method?: string | null;
          external_reference?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };

      expenses: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          expense_date: string | null;
          category: string | null;
          vendor: string | null;
          description: string | null;
          amount: number;
          job_id: string | null;
          equipment_id: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          expense_date?: string | null;
          category?: string | null;
          vendor?: string | null;
          description?: string | null;
          amount: number;
          job_id?: string | null;
          equipment_id?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "expenses_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_equipment_id_fkey";
            columns: ["equipment_id"];
            isOneToOne: false;
            referencedRelation: "equipment";
            referencedColumns: ["id"];
          },
        ];
      };

      job_materials: {
        Row: {
          id: string;
          created_at: string;
          job_id: string;
          material_name: string;
          quantity: number | null;
          unit: string | null;
          unit_cost: number | null;
          total_cost: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          job_id: string;
          material_name: string;
          quantity?: number | null;
          unit?: string | null;
          unit_cost?: number | null;
          total_cost?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["job_materials"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "job_materials_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };

      job_photos: {
        Row: {
          id: string;
          created_at: string;
          job_id: string;
          photo_type: string | null;
          storage_path: string;
          caption: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          job_id: string;
          photo_type?: string | null;
          storage_path: string;
          caption?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["job_photos"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "job_photos_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
            referencedColumns: ["id"];
          },
        ];
      };

      integration_mappings: {
        Row: {
          id: string;
          created_at: string;
          system_name: string;
          entity_type: string;
          internal_id: string;
          external_id: string;
          last_synced_at: string | null;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          system_name: string;
          entity_type: string;
          internal_id: string;
          external_id: string;
          last_synced_at?: string | null;
          metadata?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["integration_mappings"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
