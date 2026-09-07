import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AskAdvisor } from "@/components/ai-advisor/ask-advisor";

export function AIAdvisorPanel() {
  return (
    <Card className="border-[var(--color-violet)]/25">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--color-violet)]" />
            AI Owner Advisor
          </span>
        }
        description="Ask questions grounded in your live data"
        action={
          <Link href="/ai-advisor" className="text-xs text-[var(--color-accent)] hover:underline">
            Open full advisor
          </Link>
        }
      />
      <CardBody>
        <AskAdvisor compact />
      </CardBody>
    </Card>
  );
}
