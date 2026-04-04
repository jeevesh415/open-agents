"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Pencil, Plus, Trash2 } from "lucide-react";
import { BUILT_IN_SUBAGENT_METADATA } from "@open-harness/agent/subagents/registry";
import {
  customSubagentProfilesSchema,
  type CustomSubagentProfile,
  type SubagentAllowedToolName,
  type SubagentSkillRef,
} from "@open-harness/agent/subagents/profiles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModelCombobox } from "@/components/model-combobox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DEFAULT_ALLOWED_TOOLS: SubagentAllowedToolName[] = [
  "read",
  "write",
  "edit",
  "grep",
  "glob",
  "bash",
];

const TOOL_OPTIONS: Array<{
  id: SubagentAllowedToolName;
  label: string;
  description: string;
}> = [
  { id: "read", label: "Read", description: "Read file contents" },
  { id: "write", label: "Write", description: "Create or overwrite files" },
  { id: "edit", label: "Edit", description: "Apply precise edits" },
  { id: "grep", label: "Grep", description: "Search file contents" },
  { id: "glob", label: "Glob", description: "Find files by pattern" },
  { id: "bash", label: "Bash", description: "Run shell commands" },
  {
    id: "web_fetch",
    label: "Web fetch",
    description: "Fetch remote URLs",
  },
];

interface ModelItem {
  id: string;
  label: string;
  description?: string;
  isVariant?: boolean;
}

interface SubagentProfilesSectionProps {
  profiles: CustomSubagentProfile[];
  modelItems: ModelItem[];
  defaultModelId: string;
  disabled: boolean;
  onSave: (profiles: CustomSubagentProfile[]) => Promise<void>;
}

function slugifySubagentId(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\bsubagent[s]?\b/gi, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createEmptySubagentProfile(
  defaultModelId: string,
): CustomSubagentProfile & { skills: SubagentSkillRef[] } {
  return {
    id: "",
    name: "",
    description: "",
    model: defaultModelId,
    customPrompt: "",
    skills: [],
    allowedTools: [...DEFAULT_ALLOWED_TOOLS],
  };
}

// ---------------------------------------------------------------------------
// SubagentFormDialog — modal for creating or editing a custom subagent
// ---------------------------------------------------------------------------

interface SubagentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProfile: CustomSubagentProfile | null;
  modelItems: ModelItem[];
  defaultModelId: string;
  isSaving: boolean;
  onSubmit: (profile: CustomSubagentProfile) => Promise<true | string>;
}

function SubagentFormDialog({
  open,
  onOpenChange,
  editingProfile,
  modelItems,
  defaultModelId,
  isSaving,
  onSubmit,
}: SubagentFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState(defaultModelId);
  const [customPrompt, setCustomPrompt] = useState("");
  const [skills, setSkills] = useState<SubagentSkillRef[]>([]);
  const [allowedTools, setAllowedTools] = useState<SubagentAllowedToolName[]>(
    () => [...DEFAULT_ALLOWED_TOOLS],
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editingProfile) {
        setName(editingProfile.name);
        setDescription(editingProfile.description ?? "");
        setModel(editingProfile.model);
        setCustomPrompt(editingProfile.customPrompt);
        setSkills(editingProfile.skills.map((s) => ({ ...s })));
        setAllowedTools([...editingProfile.allowedTools]);
      } else {
        setName("");
        setDescription("");
        setModel(defaultModelId);
        setCustomPrompt("");
        setSkills([]);
        setAllowedTools([...DEFAULT_ALLOWED_TOOLS]);
      }
      setError(null);
    }
  }, [open, editingProfile, defaultModelId]);

  const generatedId = slugifySubagentId(name);

  const toggleTool = (toolName: SubagentAllowedToolName, enabled: boolean) => {
    setAllowedTools((current) =>
      enabled
        ? Array.from(new Set([...current, toolName]))
        : current.filter((t) => t !== toolName),
    );
  };

  const handleAddSkill = () => {
    setSkills((current) => [...current, { id: "" }]);
  };

  const handleRemoveSkill = (skillIndex: number) => {
    setSkills((current) => current.filter((_, i) => i !== skillIndex));
  };

  const handleUpdateSkill = (
    skillIndex: number,
    nextSkill: SubagentSkillRef,
  ) => {
    setSkills((current) =>
      current.map((s, i) => (i === skillIndex ? nextSkill : s)),
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    if (!model) {
      setError("Model is required");
      return;
    }

    if (allowedTools.length === 0) {
      setError("Select at least one tool");
      return;
    }

    setError(null);

    const profile: CustomSubagentProfile = {
      id: generatedId,
      name: name.trim(),
      description: description.trim(),
      model,
      customPrompt: customPrompt.trim(),
      skills: skills
        .filter((s) => s.id.trim())
        .map((s) => ({
          id: s.id.trim(),
          ...(s.args?.trim() ? { args: s.args.trim() } : {}),
        })),
      allowedTools,
    };

    const result = await onSubmit(profile);
    if (result === true) {
      onOpenChange(false);
    } else {
      setError(result);
    }
  };

  const isEditing = editingProfile !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Subagent" : "New Subagent"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the subagent configuration below."
              : "Configure a custom subagent for delegated tasks."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="subagent-name" className="text-xs font-medium">
              Name
            </Label>
            <Input
              id="subagent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Frontend Design"
              disabled={isSaving}
            />
            {generatedId && (
              <p className="text-[11px] text-muted-foreground">
                Id: <code>{generatedId}</code>
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label
              htmlFor="subagent-description"
              className="text-xs font-medium"
            >
              Description
            </Label>
            <Input
              id="subagent-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="When to use this subagent"
              disabled={isSaving}
            />
            <p className="text-[11px] text-muted-foreground">
              Shown to the model so it knows when to delegate to this subagent.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="subagent-model" className="text-xs font-medium">
              Model
            </Label>
            <ModelCombobox
              value={model}
              items={modelItems}
              placeholder="Select a model"
              searchPlaceholder="Search models..."
              emptyText="No models found."
              disabled={isSaving}
              onChange={setModel}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="subagent-prompt" className="text-xs font-medium">
              Custom Instructions
            </Label>
            <Textarea
              id="subagent-prompt"
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              className="min-h-20 resize-y"
              placeholder="Detailed instructions for this subagent's behavior."
              disabled={isSaving}
            />
          </div>

          {/* Skills */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-xs font-medium">Skills</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSkill}
                disabled={isSaving}
                className="h-7 text-xs"
              >
                Add skill
              </Button>
            </div>
            {skills.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No skills configured.
              </p>
            ) : null}
            {skills.map((skill, skillIndex) => (
              <div
                key={skillIndex}
                className="grid gap-2 rounded-md border border-border/60 p-2.5 md:grid-cols-[1fr_1fr_auto]"
              >
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Skill id
                  </Label>
                  <Input
                    value={skill.id}
                    onChange={(event) =>
                      handleUpdateSkill(skillIndex, {
                        ...skill,
                        id: event.target.value,
                      })
                    }
                    placeholder="frontend-design"
                    disabled={isSaving}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Args
                  </Label>
                  <Input
                    value={skill.args ?? ""}
                    onChange={(event) =>
                      handleUpdateSkill(skillIndex, {
                        ...skill,
                        args: event.target.value,
                      })
                    }
                    placeholder="--flag value"
                    disabled={isSaving}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveSkill(skillIndex)}
                    disabled={isSaving}
                    className="h-8 text-xs text-muted-foreground hover:text-destructive"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Allowed tools */}
          <div className="grid gap-2">
            <Label className="text-xs font-medium">Allowed Tools</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {TOOL_OPTIONS.map((toolOption) => {
                const enabled = allowedTools.includes(toolOption.id);
                return (
                  <div
                    key={toolOption.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-medium">{toolOption.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {toolOption.description}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(nextChecked) =>
                        toggleTool(toolOption.id, nextChecked)
                      }
                      disabled={isSaving}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving
                ? "Saving…"
                : isEditing
                  ? "Save Changes"
                  : "Create Subagent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// SubagentCard — compact list row for a single subagent (built-in or custom)
// ---------------------------------------------------------------------------

function SubagentCard({
  name,
  description,
  modelLabel,
  toolCount,
  builtIn,
  isSaving,
  onEdit,
  onDelete,
}: {
  name: string;
  description?: string;
  modelLabel?: string;
  toolCount: number;
  builtIn: boolean;
  isSaving: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="group relative rounded-lg border border-border bg-card transition-colors hover:border-border/80 hover:bg-accent/30">
      <div className="flex items-start gap-3 p-3.5">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70">
          <Bot className="size-3.5 text-muted-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium leading-tight">{name}</h3>
          {description && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {description}
            </p>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {modelLabel && (
              <span className="truncate text-xs text-muted-foreground">
                {modelLabel}
              </span>
            )}
            {modelLabel && (
              <span className="text-muted-foreground/40">·</span>
            )}
            <span className="text-xs text-muted-foreground">
              {toolCount} {toolCount === 1 ? "tool" : "tools"}
            </span>
          </div>
        </div>

        {builtIn ? (
          <span className="shrink-0 rounded-sm bg-muted/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Built-in
          </span>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={onEdit}
                  disabled={isSaving}
                  className="size-7"
                >
                  <Pencil className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit subagent</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  onClick={onDelete}
                  disabled={isSaving}
                  className="size-7 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete subagent</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubagentProfilesSection — main export
// ---------------------------------------------------------------------------

export function SubagentProfilesSection({
  profiles,
  modelItems,
  defaultModelId,
  disabled,
  onSave,
}: SubagentProfilesSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelLabelById = useMemo(
    () => new Map(modelItems.map((m) => [m.id, m.label])),
    [modelItems],
  );

  const editingProfile = editingIndex !== null ? profiles[editingIndex] ?? null : null;

  const handleOpenCreate = () => {
    setEditingIndex(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (index: number) => {
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleDelete = async (index: number) => {
    if (!window.confirm("Delete this subagent?")) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const nextProfiles = profiles.filter((_, i) => i !== index);
      await onSave(nextProfiles);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to delete subagent",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (
    profile: CustomSubagentProfile,
  ): Promise<true | string> => {
    // Validate against built-in names
    const reservedBuiltInIds = new Set(
      BUILT_IN_SUBAGENT_METADATA.map((p) => p.id.toLowerCase()),
    );
    const reservedBuiltInNames = new Set(
      BUILT_IN_SUBAGENT_METADATA.map((p) => p.name.toLowerCase()),
    );

    if (
      reservedBuiltInIds.has(profile.id.toLowerCase()) ||
      reservedBuiltInNames.has(profile.name.toLowerCase())
    ) {
      return "Custom subagent names cannot conflict with built-in subagents";
    }

    // Build the new list
    let nextProfiles: CustomSubagentProfile[];
    if (editingIndex !== null) {
      nextProfiles = profiles.map((p, i) => (i === editingIndex ? profile : p));
    } else {
      nextProfiles = [...profiles, profile];
    }

    // Validate the full list
    const parsed = customSubagentProfilesSchema.safeParse(nextProfiles);
    if (!parsed.success) {
      return (
        parsed.error.issues[0]?.message ??
        "Failed to validate subagent profiles"
      );
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(parsed.data);
      return true;
    } catch (saveError) {
      return saveError instanceof Error
        ? saveError.message
        : "Failed to save subagent";
    } finally {
      setIsSaving(false);
    }
  };

  const builtInExplore = BUILT_IN_SUBAGENT_METADATA[0];

  return (
    <>
      <div className="space-y-2">
        {/* Built-in Explore */}
        {builtInExplore ? (
          <SubagentCard
            name={builtInExplore.name}
            description={builtInExplore.description}
            modelLabel="Default model"
            toolCount={builtInExplore.allowedTools.length}
            builtIn
            isSaving={isSaving || disabled}
          />
        ) : null}

        {/* Custom subagents */}
        {profiles.map((profile, index) => (
          <SubagentCard
            key={profile.id || index}
            name={profile.name || "(unnamed)"}
            description={profile.description}
            modelLabel={modelLabelById.get(profile.model) ?? profile.model}
            toolCount={profile.allowedTools.length}
            builtIn={false}
            isSaving={isSaving || disabled}
            onEdit={() => handleOpenEdit(index)}
            onDelete={() => handleDelete(index)}
          />
        ))}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleOpenCreate}
          disabled={disabled || isSaving}
          className="mt-2 w-full"
        >
          <Plus className="size-3.5" />
          Add Subagent
        </Button>
      </div>

      <SubagentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProfile={editingProfile}
        modelItems={modelItems}
        defaultModelId={defaultModelId}
        isSaving={isSaving}
        onSubmit={handleSubmit}
      />
    </>
  );
}
