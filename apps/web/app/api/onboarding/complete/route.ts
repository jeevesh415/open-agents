import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import { userPreferences } from "@/lib/db/schema";
import { getServerSession } from "@/lib/session/get-server-session";

/**
 * POST /api/onboarding/complete
 *
 * Mark the user's onboarding as completed.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const [existing] = await db
      .select({ id: userPreferences.id })
      .from(userPreferences)
      .where(eq(userPreferences.userId, session.user.id))
      .limit(1);

    const now = new Date();

    if (existing) {
      await db
        .update(userPreferences)
        .set({ onboardingCompletedAt: now, updatedAt: now })
        .where(eq(userPreferences.userId, session.user.id));
    } else {
      await db.insert(userPreferences).values({
        id: nanoid(),
        userId: session.user.id,
        onboardingCompletedAt: now,
      });
    }

    return Response.json({ success: true, completedAt: now.toISOString() });
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
    return Response.json(
      { error: "Failed to complete onboarding" },
      { status: 500 },
    );
  }
}
