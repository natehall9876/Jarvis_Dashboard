/** Stable public contract; timestamps are ISO 8601 UTC and money is USD. */
export type IntelligenceSource = 'internal' | 'external';
export type IntelligenceScope = 'invoices' | 'quotes' | 'jobs' | 'research';
export type IntelligenceState = 'new' | 'accepted' | 'watch' | 'dismissed' | 'completed';
export type SourceCoverage = {
  source: 'invoices' | 'quotes' | 'jobs' | 'homeworks' | 'quickbooks' | 'research';
  status: 'ok' | 'failed' | 'unverified';
  checked_at: string;
  detail: string;
  records: number | null;
};
export type IntelligenceSettings = {
  enabled: boolean;
  hourly_target: number;
  interests: string[];
  watches: string[];
  research_automation_id: string | null;
  research_cadence: string | null;
};
export type IntelligenceEvidence = {
  title: string;
  url: string;
  observed_at: string;
  published_at: string | null;
  source_type: 'record' | 'primary';
  note: string;
};
export type IntelligencePrepared = {
  kind: 'collection_draft' | 'quote_draft' | 'calculation' | 'worksheet' | 'experiment' | 'comparison' | 'outreach_draft';
  content: string;
  prepared_at: string;
  next_actor: string;
};
export type IntelligenceValidation = {
  mechanism: string;
  fit: string;
  entry_barrier: string;
  cheapest_test: string;
  success_metric: string;
  stop_rule: string;
};
/** Exact p_items entry shape for jarvis_import_intelligence. No state/outcome fields. */
export type IntelligenceFinding = {
  dedup_key: string;
  scope: IntelligenceScope;
  title: string;
  why_now: string;
  next_step: string;
  owner_label: string;
  confidence: 'low' | 'medium' | 'high';
  priority: number;
  priority_basis: string;
  impact: { kind: 'receivable_balance' | 'quoted_revenue' | 'planned_rate' | 'scenario' | 'unknown'; amount: number | null; unit: 'USD' | 'USD/hour' | null; basis: string };
  effort_hours: number | null;
  capital_required: number | null;
  facts: string[];
  inference: string;
  evidence: IntelligenceEvidence[];
  deadline: string | null;
  expires_at: string;
  prepared: IntelligencePrepared;
  validation: IntelligenceValidation | null;
};
export type IntelligenceOutcome = {
  notes: string;
  realized_revenue: number | null;
  realized_savings: number | null;
  hours_saved: number | null;
  recorded_at: string;
  attribution: 'owner_reported';
};
export type IntelligenceItem = IntelligenceFinding & {
  id: string;
  source: IntelligenceSource;
  state: IntelligenceState;
  outcome: IntelligenceOutcome | null;
  observed_at: string;
  created_at: string;
  updated_at: string;
  source_active: boolean;
  stale: boolean;
  stale_reason: string | null;
};
export type IntelligenceRunInput = {
  source: IntelligenceSource;
  run_key: string;
  started_at: string;
  finished_at: string;
  status: 'completed' | 'partial' | 'failed';
  summary: string;
  coverage: SourceCoverage[];
  /** Required only for internal worker imports; issued by jarvis_claim_intelligence. */
  lease_token?: string;
};
export type IntelligenceRun = Omit<IntelligenceRunInput, 'lease_token'> & { id: string; item_count: number; applied: boolean };
export type IntelligenceSnapshot = {
  settings: IntelligenceSettings;
  items: IntelligenceItem[];
  top: IntelligenceItem[];
  runs: IntelligenceRun[];
  coverage: {
    internal: { last_run: IntelligenceRun | null; stale: boolean };
    external: { last_run: IntelligenceRun | null; stale: boolean };
    sources: SourceCoverage[];
    limitations: string[];
  };
  has_more: boolean;
  generated_at: string;
};
export type IntelligenceAction =
  | { action: 'refresh' }
  | { action: 'preferences'; enabled: boolean; hourly_target: number; interests: string[]; watches: string[] }
  | { action: 'decision'; id: string; state: Exclude<IntelligenceState, 'new'> }
  | { action: 'outcome'; id: string; notes: string; realized_revenue: number | null; realized_savings: number | null; hours_saved: number | null };
