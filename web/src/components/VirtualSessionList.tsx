import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { SessionItem } from "./SessionItem";
import type { SessionSummary } from "@/lib/api";
import { ESTIMATE_SESSION_ITEM_HEIGHT } from "@/lib/constants";

interface Props {
  sessions: SessionSummary[];
  selectedIds: Set<string>;
  selectionMode: boolean;
  activeId?: string | null;
  onSelect: (id: string, mode: "click" | "checkbox") => void;
  onToggleCheckbox: (id: string) => void;
  onAction: (s: SessionSummary, action: "hide" | "show" | "trash" | "restore" | "permanent") => void;
  highlight?: string;
}

/**
 * Virtual scroll wrapper around `SessionItem` rows.
 *
 * Note: an earlier version of this component shipped a substantial
 * amount of sessionStorage scroll-restoration logic (read/save scroll
 * top, retry across frames waiting for the virtualizer to measure,
 * suppress the measure-induced clamp-to-zero scroll event). All of
 * that became dead weight once SessionsView started rendering inside
 * a Modal Route Pattern overlay parent — the list component never
 * unmounts when the user opens a session detail and presses back, so
 * scrollTop is naturally preserved by the DOM. The restoration
 * machinery is gone; if a future refactor drops the overlay setup,
 * git history (commit before this one) has the old implementation.
 */
export function VirtualSessionList({
  sessions,
  selectedIds,
  selectionMode,
  activeId,
  onSelect,
  onToggleCheckbox,
  onAction,
  highlight,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: sessions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATE_SESSION_ITEM_HEIGHT,
    overscan: 6,
    measureElement: (el) => el?.getBoundingClientRect().height ?? ESTIMATE_SESSION_ITEM_HEIGHT,
  });

  return (
    <div ref={parentRef} className="overflow-auto" style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const s = sessions[vi.index]!;
          return (
            <div
              key={s.id}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
              }}
              className="pb-2"
            >
              <SessionItem
                session={s}
                selected={selectedIds.has(s.id)}
                selectionMode={selectionMode}
                onSelect={onSelect}
                onToggleCheckbox={onToggleCheckbox}
                active={s.id === activeId}
                onAction={(a) => onAction(s, a)}
                highlight={highlight}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
