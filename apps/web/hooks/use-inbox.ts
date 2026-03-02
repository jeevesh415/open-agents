"use client";

import useSWR from "swr";
import type { InboxItem } from "@/app/api/inbox/route";
import { fetcherNoStore } from "@/lib/swr";

interface InboxResponse {
  items: InboxItem[];
}

const POLLING_INTERVAL_MS = 5_000;
const UNFOCUSED_POLLING_INTERVAL_MS = 15_000;

export function useInbox(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { data, error, isLoading, mutate } = useSWR<InboxResponse>(
    enabled ? "/api/inbox" : null,
    fetcherNoStore,
    {
      refreshInterval: () => {
        if (typeof document !== "undefined" && !document.hasFocus()) {
          return UNFOCUSED_POLLING_INTERVAL_MS;
        }
        return POLLING_INTERVAL_MS;
      },
      revalidateOnFocus: true,
      refreshWhenHidden: false,
    },
  );

  const items = data?.items ?? [];

  const needsInputCount = items.filter(
    (i) => i.attentionState === "needs_input",
  ).length;
  const needsReviewCount = items.filter(
    (i) => i.attentionState === "needs_review",
  ).length;
  const workingCount = items.filter(
    (i) => i.attentionState === "working",
  ).length;
  const actionableCount = needsInputCount + needsReviewCount;

  return {
    items,
    loading: isLoading,
    error,
    needsInputCount,
    needsReviewCount,
    workingCount,
    actionableCount,
    refresh: mutate,
  };
}
