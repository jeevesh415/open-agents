"use client";

import { useMemo, useState } from "react";
import type { CustomSubagentProfile } from "@open-harness/agent/subagents/profiles";
import { useModelOptions } from "@/hooks/use-model-options";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import {
  getDefaultModelOptionId,
  withMissingModelOption,
} from "@/lib/model-options";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SubagentProfilesSection } from "./subagent-profiles-section";

export function SubagentsSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subagents</CardTitle>
        <CardDescription>
          Configure the built-in Explore subagent and any custom delegated
          specialists.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Skeleton className="h-[60px] w-full rounded-lg" />
          <Skeleton className="h-[60px] w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

export function SubagentsSection() {
  const { preferences, loading, updatePreferences } = useUserPreferences();
  const { modelOptions, loading: modelOptionsLoading } = useModelOptions();
  const [isSaving, setIsSaving] = useState(false);

  const selectedDefaultModelId =
    preferences?.defaultModelId ?? getDefaultModelOptionId(modelOptions);

  const subagentModelOptions = useMemo(
    () =>
      withMissingModelOption(modelOptions, preferences?.defaultSubagentModelId),
    [modelOptions, preferences?.defaultSubagentModelId],
  );

  const handleSubagentProfilesSave = async (
    subagentProfiles: CustomSubagentProfile[],
  ) => {
    setIsSaving(true);
    try {
      await updatePreferences({ subagentProfiles });
    } catch (error) {
      console.error("Failed to update subagent profiles:", error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <SubagentsSectionSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Subagents</CardTitle>
        <CardDescription>
          Configure the built-in Explore subagent and define custom subagents for
          delegated tasks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SubagentProfilesSection
          profiles={preferences?.subagentProfiles ?? []}
          modelItems={subagentModelOptions.map((option) => ({
            id: option.id,
            label: option.label,
            description: option.description,
            isVariant: option.isVariant,
          }))}
          defaultModelId={selectedDefaultModelId}
          disabled={isSaving || modelOptionsLoading}
          onSave={handleSubagentProfilesSave}
        />
      </CardContent>
    </Card>
  );
}
