import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userPreferences, vercelConnections } from "@/lib/db/schema";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [prefsRow, connectionRow] = await Promise.all([
    db
      .select({ onboardingCompletedAt: userPreferences.onboardingCompletedAt })
      .from(userPreferences)
      .where(eq(userPreferences.userId, session.user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        teamId: vercelConnections.teamId,
        teamSlug: vercelConnections.teamSlug,
        gatewayApiKey: vercelConnections.gatewayApiKey,
      })
      .from(vercelConnections)
      .where(eq(vercelConnections.userId, session.user.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  return Response.json({
    completed: !!prefsRow?.onboardingCompletedAt,
    completedAt: prefsRow?.onboardingCompletedAt?.toISOString() ?? null,
    hasTeamSelected: !!connectionRow?.teamId,
    hasGatewayKey: !!connectionRow?.gatewayApiKey,
    teamId: connectionRow?.teamId ?? null,
    teamSlug: connectionRow?.teamSlug ?? null,
  });
}
