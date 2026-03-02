import type { Metadata } from "next";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = {
  title: "Inbox",
  description: "Review sessions that need your attention.",
};

export default function InboxPage() {
  return <InboxView />;
}
