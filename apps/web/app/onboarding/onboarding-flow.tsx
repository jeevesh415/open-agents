"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Check,
  ChevronDown,
  Github,
  Loader2,
  Zap,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { ModelCombobox } from "@/components/model-combobox";
import { useModelOptions } from "@/hooks/use-model-options";
import { useSession } from "@/hooks/use-session";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { getDefaultModelOptionId } from "@/lib/model-options";
import { fetcher } from "@/lib/swr";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VercelTeam {
  id: string;
  slug: string;
  name: string;
  avatar: string | null;
  membership: { role: string };
}

interface TeamsResponse {
  teams: VercelTeam[];
}

type StepId = 1 | 2 | 3;

// ─── Main Component ─────────────────────────────────────────────────────────

export function OnboardingFlow() {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<StepId>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<StepId>>(
    new Set(),
  );
  const [isCompleting, setIsCompleting] = useState(false);

  const markComplete = useCallback((step: StepId) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(step);
      return next;
    });
    // Auto-advance to next step
    if (step < 3) {
      setActiveStep((step + 1) as StepId);
    }
  }, []);

  const canOpenStep = (step: StepId): boolean => {
    if (step === 1) return true;
    // Each step requires all prior steps completed
    for (let i = 1; i < step; i++) {
      if (!completedSteps.has(i as StepId)) return false;
    }
    return true;
  };

  const handleStepClick = (step: StepId) => {
    if (canOpenStep(step)) {
      setActiveStep(step);
    }
  };

  const handleGetStarted = async () => {
    setIsCompleting(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to complete onboarding");
      }
      router.push("/");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong",
      );
      setIsCompleting(false);
    }
  };

  const allDone = completedSteps.has(1) && completedSteps.has(2) && completedSteps.has(3);

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle grain overlay */}
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.025] dark:opacity-[0.04]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "256px 256px" }} />

      <div className="relative z-10 mx-auto max-w-2xl px-6 py-16 sm:py-24">
        {/* Header */}
        <div className="mb-12">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Zap className="size-3" />
            Quick Setup
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Welcome aboard
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Three quick steps and you&apos;re ready to go. This only takes a
            minute.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Timeline connector line */}
          <div className="absolute left-[19px] top-[40px] bottom-[40px] w-px bg-border dark:bg-border/50" />

          <div className="space-y-3">
            <StepAccordion
              step={1}
              title="Select Vercel Team"
              description="Choose which team to use for AI Gateway access"
              icon={<Zap className="size-4" />}
              isActive={activeStep === 1}
              isCompleted={completedSteps.has(1)}
              isLocked={!canOpenStep(1)}
              onClick={() => handleStepClick(1)}
            >
              <TeamSelector onComplete={() => markComplete(1)} />
            </StepAccordion>

            <StepAccordion
              step={2}
              title="Connect GitHub"
              description="Link your GitHub account for repository access"
              icon={<GitBranch className="size-4" />}
              isActive={activeStep === 2}
              isCompleted={completedSteps.has(2)}
              isLocked={!canOpenStep(2)}
              onClick={() => handleStepClick(2)}
            >
              <GitHubConnector onComplete={() => markComplete(2)} />
            </StepAccordion>

            <StepAccordion
              step={3}
              title="Model Preferences"
              description="Pick your default AI model"
              icon={<Sparkles className="size-4" />}
              isActive={activeStep === 3}
              isCompleted={completedSteps.has(3)}
              isLocked={!canOpenStep(3)}
              onClick={() => handleStepClick(3)}
            >
              <ModelSelector onComplete={() => markComplete(3)} />
            </StepAccordion>
          </div>
        </div>

        {/* Get Started button */}
        <div className="mt-10 flex justify-end">
          <Button
            size="lg"
            disabled={!allDone || isCompleting}
            onClick={handleGetStarted}
            className="min-w-[160px] gap-2"
          >
            {isCompleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Setting up…
              </>
            ) : (
              <>
                Get Started
                <Zap className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Step Accordion ─────────────────────────────────────────────────────────

interface StepAccordionProps {
  step: StepId;
  title: string;
  description: string;
  icon: React.ReactNode;
  isActive: boolean;
  isCompleted: boolean;
  isLocked: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function StepAccordion({
  step,
  title,
  description,
  icon,
  isActive,
  isCompleted,
  isLocked,
  onClick,
  children,
}: StepAccordionProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (isActive && contentRef.current) {
      // Measure height for smooth animation
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContentHeight(entry.contentRect.height);
        }
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }
  }, [isActive]);

  return (
    <div
      className={`
        relative rounded-xl border transition-all duration-300 ease-out
        ${
          isCompleted
            ? "border-emerald-500/30 bg-emerald-50/30 dark:border-emerald-500/20 dark:bg-emerald-950/20"
            : isActive
              ? "border-border bg-card shadow-sm dark:shadow-none"
              : isLocked
                ? "border-border/40 bg-muted/20 opacity-60"
                : "border-border/60 bg-card/50 hover:border-border"
        }
      `}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onClick}
        disabled={isLocked}
        className="flex w-full items-center gap-4 p-4 text-left disabled:cursor-not-allowed"
      >
        {/* Step number / checkmark */}
        <div
          className={`
            relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300
            ${
              isCompleted
                ? "border-emerald-500 bg-emerald-500 text-white"
                : isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground"
            }
          `}
        >
          {isCompleted ? (
            <Check className="size-4" strokeWidth={3} />
          ) : (
            step
          )}
        </div>

        {/* Title & description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${isCompleted ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}
            >
              {title}
            </span>
            {!isCompleted && (
              <span className="text-muted-foreground">{icon}</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>

        {/* Chevron */}
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${isActive ? "rotate-180" : ""}`}
        />
      </button>

      {/* Content with smooth height animation */}
      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ height: isActive ? contentHeight : 0 }}
      >
        <div ref={contentRef} className="px-4 pb-5 pt-1 pl-[72px]">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: Team Selector ──────────────────────────────────────────────────

function TeamSelector({ onComplete }: { onComplete: () => void }) {
  const { data, isLoading, error } = useSWR<TeamsResponse>(
    "/api/vercel/teams",
    fetcher,
  );
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isExchanging, setIsExchanging] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const autoSelectedRef = useRef(false);

  const teams = data?.teams ?? [];

  // Auto-select if only one team
  useEffect(() => {
    if (teams.length === 1 && !autoSelectedRef.current && !isDone) {
      autoSelectedRef.current = true;
      handleSelectTeam(teams[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams.length]);

  const handleSelectTeam = async (team: VercelTeam) => {
    setSelectedTeamId(team.id);
    setIsExchanging(true);
    try {
      const res = await fetch("/api/vercel/gateway-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, teamSlug: team.slug }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to exchange API key");
      }
      setIsDone(true);
      toast.success(`Connected to ${team.name}`);
      onComplete();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to connect team",
      );
      setSelectedTeamId(null);
    } finally {
      setIsExchanging(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load teams. Please refresh and try again.
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
        No Vercel teams found. Make sure your Vercel account has at least one
        team.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {teams.map((team) => {
        const isSelected = selectedTeamId === team.id;
        const isThisDone = isSelected && isDone;

        return (
          <button
            key={team.id}
            type="button"
            disabled={isExchanging || isDone}
            onClick={() => handleSelectTeam(team)}
            className={`
              flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all duration-200
              ${
                isThisDone
                  ? "border-emerald-500/40 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-950/30"
                  : isSelected
                    ? "border-foreground/20 bg-accent"
                    : "border-border/60 bg-background hover:border-border hover:bg-accent/50"
              }
              disabled:cursor-not-allowed
            `}
          >
            {/* Avatar */}
            {team.avatar ? (
              <img
                src={`https://vercel.com/api/www/avatar/${team.avatar}?s=40`}
                alt=""
                className="size-9 rounded-full bg-muted"
              />
            ) : (
              <div className="flex size-9 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {team.name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Info */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">
                {team.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {team.slug}
              </div>
            </div>

            {/* Status */}
            {isSelected && isExchanging && (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            )}
            {isThisDone && (
              <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500">
                <Check className="size-3.5 text-white" strokeWidth={3} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Step 2: GitHub Connector ───────────────────────────────────────────────

function GitHubConnector({ onComplete }: { onComplete: () => void }) {
  const { session, loading, hasGitHubAccount, hasGitHubInstallations } =
    useSession();
  const hasCalledComplete = useRef(false);

  const isConnected = hasGitHubAccount && hasGitHubInstallations;

  useEffect(() => {
    if (isConnected && !hasCalledComplete.current) {
      hasCalledComplete.current = true;
      onComplete();
    }
  }, [isConnected, onComplete]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50/30 p-3 dark:border-emerald-500/20 dark:bg-emerald-950/20">
        <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500">
          <Check className="size-4 text-white" strokeWidth={3} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-foreground">
            GitHub connected
          </div>
          {session?.user?.name && (
            <div className="text-xs text-muted-foreground">
              Signed in as {session.user.name}
            </div>
          )}
        </div>
        <Github className="size-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <a href="/api/auth/github/reconnect?next=/onboarding">
        <Button variant="outline" className="w-full gap-2">
          <Github className="size-4" />
          Connect GitHub
        </Button>
      </a>
      <button
        type="button"
        onClick={onComplete}
        className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Skip for now
      </button>
    </div>
  );
}

// ─── Step 3: Model Selector ─────────────────────────────────────────────────

function ModelSelector({ onComplete }: { onComplete: () => void }) {
  const { modelOptions, loading: modelsLoading } = useModelOptions();
  const { preferences, loading: prefsLoading, updatePreferences } =
    useUserPreferences();
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const defaultId = useMemo(
    () => getDefaultModelOptionId(modelOptions),
    [modelOptions],
  );
  const currentModelId = preferences?.defaultModelId ?? defaultId;

  const items = useMemo(
    () =>
      modelOptions.map((opt) => ({
        id: opt.id,
        label: opt.label,
        description: opt.description,
        isVariant: opt.isVariant,
      })),
    [modelOptions],
  );

  const handleModelChange = async (id: string) => {
    setIsSaving(true);
    try {
      await updatePreferences({ defaultModelId: id });
      toast.success("Default model saved");
      setIsDone(true);
      onComplete();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save preference",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirm = async () => {
    await handleModelChange(currentModelId);
  };

  if (modelsLoading || prefsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full max-w-xs rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm">Default Model</Label>
        <ModelCombobox
          value={currentModelId}
          items={items}
          placeholder="Select a model"
          searchPlaceholder="Search models…"
          emptyText="No models found."
          disabled={isSaving || isDone}
          onChange={handleModelChange}
        />
        <p className="text-xs text-muted-foreground">
          This will be used for new chats. You can change it anytime in
          settings.
        </p>
      </div>

      {!isDone && (
        <Button
          size="sm"
          disabled={isSaving}
          onClick={handleConfirm}
          className="gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : (
            "Confirm selection"
          )}
        </Button>
      )}

      {isDone && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="size-4" strokeWidth={3} />
          Model preference saved
        </div>
      )}
    </div>
  );
}
