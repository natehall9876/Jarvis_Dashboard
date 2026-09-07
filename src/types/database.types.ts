/**
 * Hand-authored TypeScript types for the WeedEater Lawn Care Supabase schema.
 *
 * These types are modeled directly on the table list and fields described in
 * the Jarvis project brief. They are shaped exactly like the output of
 * `supabase gen types typescript`, so once the real schema is confirmed you
 * can regenerate this file with the Supabase CLI and nothing else in the
 * codebase has to change:
 *
 *   npx supabase gen types typescript --project-id <project-id> \
 *     --schema public > src/types/database.types.ts
 *
 * Until then, treat this as the best-effort contract between the app and the
 * database — verify column names/types (and the Relationships below, which
 * drive typed joins/embeds) against the live schema before relying on it for
 * anything destructive.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Shared enum-like string unions
// ---------------------------------------------------------------------------

export type ClientStatus = "active" | "inactive" | "prospect";
export type ContactMethod = "phone" | "email" | "text";

export type EmployeeRole = "owner" | "manager" | "crew_lead" | "crew_member" | "admin";

export type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type AgreementFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "seasonal"
  | "one_time";

export type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "skipped";

export type EquipmentStatus = "operational" | "needs_maintenance" | "out_of_service";

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

export type InvoiceStatus = "draft" | "sent" | "partial" | "paid" | "overdue";

export type PaymentMethod = "cash" | "check" | "credit_card" | "ach" | "other";

export type PhotoType = "before" | "after" | "issue" | "other";

export type IntegrationName =
  | "homeworks"
  | "quickbooks"
  | "zapier"
  | "google_calendar";

export type IntegrationEntityType =
  | "client"
  | "property"
  | "invoice"
  | "quote"
  | "payment"
  | "job";

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
          name: string;
          company_name: string | null;
          email: string | null;
          phone: string | null;
          preferred_contact_method: ContactMethod | null;
          status: ClientStatus;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          company_name?: string | null;
          email?: string | null;
          phone?: string | null;
          preferred_contact_method?: ContactMethod | null;
          status?: ClientStatus;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["clients"]["Insert"]>;
        Relationships: [];
      };

      properties: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          client_id: string;
          route_id: string | null;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          postal_code: string;
          property_notes: string | null;
          access_notes: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          client_id: string;
          route_id?: string | null;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          postal_code: string;
          property_notes?: string | null;
          access_notes?: string | null;
          is_active?: boolean;
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
          {
            foreignKeyName: "properties_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
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
          is_active: boolean;
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
          is_active?: boolean;
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
          last_name: string;
          role: EmployeeRole;
          hourly_rate: number | null;
          is_active: boolean;
          phone: string | null;
          email: string | null;
          drivers_license_number: string | null;
          drivers_license_state: string | null;
          hire_date: string | null;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          first_name: string;
          last_name: string;
          role?: EmployeeRole;
          hourly_rate?: number | null;
          is_active?: boolean;
          phone?: string | null;
          email?: string | null;
          drivers_license_number?: string | null;
          drivers_license_state?: string | null;
          hire_date?: string | null;
          user_id?: string | null;
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
          day_of_week: DayOfWeek;
          crew_lead_id: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          day_of_week: DayOfWeek;
          crew_lead_id?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["routes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "routes_crew_lead_id_fkey";
            columns: ["crew_lead_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };

      service_agreements: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          client_id: string;
          property_id: string;
          service_id: string;
          route_id: string | null;
          frequency: AgreementFrequency;
          price: number;
          budgeted_hours: number | null;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          client_id: string;
          property_id: string;
          service_id: string;
          route_id?: string | null;
          frequency: AgreementFrequency;
          price: number;
          budgeted_hours?: number | null;
          start_date: string;
          end_date?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["service_agreements"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "service_agreements_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
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
          updated_at: string;
          route_id: string;
          property_id: string;
          service_agreement_id: string | null;
          stop_order: number;
          estimated_price: number | null;
          budgeted_minutes: number | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          route_id: string;
          property_id: string;
          service_agreement_id?: string | null;
          stop_order: number;
          estimated_price?: number | null;
          budgeted_minutes?: number | null;
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
          {
            foreignKeyName: "route_stops_service_agreement_id_fkey";
            columns: ["service_agreement_id"];
            isOneToOne: false;
            referencedRelation: "service_agreements";
            referencedColumns: ["id"];
          },
        ];
      };

      jobs: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          client_id: string;
          property_id: string;
          service_id: string | null;
          service_agreement_id: string | null;
          route_id: string | null;
          crew_lead_id: string | null;
          status: JobStatus;
          scheduled_date: string;
          scheduled_start_time: string | null;
          scheduled_end_time: string | null;
          actual_start_time: string | null;
          actual_end_time: string | null;
          price: number;
          budgeted_hours: number | null;
          actual_hours: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          client_id: string;
          property_id: string;
          service_id?: string | null;
          service_agreement_id?: string | null;
          route_id?: string | null;
          crew_lead_id?: string | null;
          status?: JobStatus;
          scheduled_date: string;
          scheduled_start_time?: string | null;
          scheduled_end_time?: string | null;
          actual_start_time?: string | null;
          actual_end_time?: string | null;
          price: number;
          budgeted_hours?: number | null;
          actual_hours?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "jobs_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
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
          {
            foreignKeyName: "jobs_crew_lead_id_fkey";
            columns: ["crew_lead_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
        ];
      };

      job_employees: {
        Row: {
          id: string;
          created_at: string;
          job_id: string;
          employee_id: string;
          role_on_job: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          job_id: string;
          employee_id: string;
          role_on_job?: string | null;
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
          job_id: string;
          employee_id: string;
          clock_in: string;
          clock_out: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          job_id: string;
          employee_id: string;
          clock_in: string;
          clock_out?: string | null;
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
          manufacturer: string | null;
          model: string | null;
          serial_number: string | null;
          status: EquipmentStatus;
          current_hours: number | null;
          purchase_date: string | null;
          maintenance_due_date: string | null;
          maintenance_due_hours: number | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          manufacturer?: string | null;
          model?: string | null;
          serial_number?: string | null;
          status?: EquipmentStatus;
          current_hours?: number | null;
          purchase_date?: string | null;
          maintenance_due_date?: string | null;
          maintenance_due_hours?: number | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["equipment"]["Insert"]>;
        Relationships: [];
      };

      job_equipment: {
        Row: {
          id: string;
          created_at: string;
          job_id: string;
          equipment_id: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          job_id: string;
          equipment_id: string;
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
          service_date: string;
          service_type: string;
          hours_at_service: number | null;
          cost: number | null;
          vendor: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          equipment_id: string;
          service_date: string;
          service_type: string;
          hours_at_service?: number | null;
          cost?: number | null;
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
          quote_number: string;
          client_id: string;
          property_id: string | null;
          status: QuoteStatus;
          issue_date: string;
          expiration_date: string | null;
          sent_at: string | null;
          responded_at: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          quote_number: string;
          client_id: string;
          property_id?: string | null;
          status?: QuoteStatus;
          issue_date?: string;
          expiration_date?: string | null;
          sent_at?: string | null;
          responded_at?: string | null;
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
          budgeted_hours: number | null;
          is_optional: boolean;
          sort_order: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          quote_id: string;
          service_id?: string | null;
          description: string;
          quantity?: number;
          unit_price: number;
          budgeted_hours?: number | null;
          is_optional?: boolean;
          sort_order?: number;
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
          invoice_number: string;
          client_id: string;
          property_id: string | null;
          job_id: string | null;
          status: InvoiceStatus;
          invoice_date: string;
          due_date: string;
          subtotal: number;
          tax_amount: number;
          total_amount: number;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          invoice_number: string;
          client_id: string;
          property_id?: string | null;
          job_id?: string | null;
          status?: InvoiceStatus;
          invoice_date?: string;
          due_date: string;
          subtotal?: number;
          tax_amount?: number;
          total_amount?: number;
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
          {
            foreignKeyName: "invoices_job_id_fkey";
            columns: ["job_id"];
            isOneToOne: false;
            referencedRelation: "jobs";
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
          description: string;
          quantity: number;
          unit_price: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          invoice_id: string;
          job_id?: string | null;
          description: string;
          quantity?: number;
          unit_price: number;
          sort_order?: number;
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
        ];
      };

      payments: {
        Row: {
          id: string;
          created_at: string;
          invoice_id: string;
          client_id: string;
          amount: number;
          payment_date: string;
          method: PaymentMethod;
          external_reference: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          invoice_id: string;
          client_id: string;
          amount: number;
          payment_date?: string;
          method?: PaymentMethod;
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
          expense_date: string;
          vendor: string;
          category: string;
          description: string | null;
          amount: number;
          job_id: string | null;
          equipment_id: string | null;
          receipt_url: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          expense_date: string;
          vendor: string;
          category: string;
          description?: string | null;
          amount: number;
          job_id?: string | null;
          equipment_id?: string | null;
          receipt_url?: string | null;
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
          quantity: number;
          unit: string | null;
          unit_cost: number | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          job_id: string;
          material_name: string;
          quantity: number;
          unit?: string | null;
          unit_cost?: number | null;
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
          photo_url: string;
          photo_type: PhotoType;
          caption: string | null;
          taken_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          job_id: string;
          photo_url: string;
          photo_type?: PhotoType;
          caption?: string | null;
          taken_at?: string | null;
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
          integration: IntegrationName;
          entity_type: IntegrationEntityType;
          internal_id: string;
          external_id: string;
          last_synced_at: string | null;
          metadata: Json | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          integration: IntegrationName;
          entity_type: IntegrationEntityType;
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
