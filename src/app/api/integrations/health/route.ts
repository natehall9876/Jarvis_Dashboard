import { requireIntegrationOwner } from "@/lib/integrations/owner-auth";
import { getWorkspaceReadiness } from "@/lib/data/integrations";

export const dynamic = "force-dynamic";
export async function GET() {
  const owner = await requireIntegrationOwner();
  const headers = { "cache-control": "private, no-store" };
  if (!owner.ok) return Response.json({ error: "Owner sign-in required" }, { status: 401, headers });
  try {
    return Response.json(await getWorkspaceReadiness(), { headers });
  } catch {
    return Response.json({ error: "Connection checks are unavailable. Retry in Connections." }, { status: 503, headers });
  }
}
