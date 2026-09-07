import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AskAdvisor } from "@/components/ai-advisor/ask-advisor";
import { isIntegrationConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function AIAdvisorPage() {
  const configured = isIntegrationConfigured("aiProvider");

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Advisor"
        description="Ask questions about today's operations, profitability, and pricing — grounded in your live Supabase data."
        action={<Badge tone={configured ? "accent" : "warning"}>{configured ? "Connected" : "Not Connected"}</Badge>}
      />

      {!configured ? (
        <Card className="border-[var(--color-warning)]/30">
          <CardBody className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              No AI provider is connected. Add <code className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-xs">AI_PROVIDER_API_KEY</code> to
              your environment (see Settings / Integrations) to enable real answers. Nothing on this page is simulated —
              questions will fail clearly until a provider is connected.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Ask Jarvis" description="Every answer is generated from your current business data — not canned responses" />
        <CardBody>
          <AskAdvisor />
        </CardBody>
      </Card>
    </div>
  );
}
