import type { Metadata } from "next";
import { SubagentsSection } from "../subagents-section";

export const metadata: Metadata = {
  title: "Subagents",
  description: "Configure delegated subagents and custom subagent profiles.",
};

export default function SubagentsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Subagents</h1>
      <SubagentsSection />
    </>
  );
}
