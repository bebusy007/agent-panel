import type { AdaptedTimelineEntry } from '@/lib/conversation/history-adapter';

/**
 * Merge history timeline (loaded from JSONL via API) and live timeline
 * (from WebSocket ChatSessionStore) into a single unified timeline.
 *
 * Rules:
 * - Dedup by id: history entries are authoritative (contain usage/cost)
 * - Live entries only appear if they don't exist in history
 * - Preserve order: history first, then new live entries appended
 * - History entries never get discarded
 */
export function mergeTimelines(
  historyEntries: AdaptedTimelineEntry[],
  liveEntries: AdaptedTimelineEntry[],
): AdaptedTimelineEntry[] {
  if (liveEntries.length === 0) return historyEntries;
  if (historyEntries.length === 0) return liveEntries;

  const historyIdSet = new Set(historyEntries.map((e) => e.id));

  // Only include live entries that are NOT already in history
  const newLiveEntries = liveEntries.filter((e) => !historyIdSet.has(e.id));

  return [...historyEntries, ...newLiveEntries];
}

/**
 * Extract just the new entries from live timeline that don't exist in
 * the historical entry set. Useful for incremental updates.
 */
export function diffLiveEntries(
  historyEntries: AdaptedTimelineEntry[],
  liveEntries: AdaptedTimelineEntry[],
): AdaptedTimelineEntry[] {
  const historyIdSet = new Set(historyEntries.map((e) => e.id));
  return liveEntries.filter((e) => !historyIdSet.has(e.id));
}
