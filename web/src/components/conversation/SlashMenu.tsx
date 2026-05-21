import React, { useState, useEffect, useRef, useCallback } from "react";
import type { SlashCommandInfo } from "@/lib/conversation/chat-protocol";

interface SlashMenuProps {
  query: string;
  commands: SlashCommandInfo[];
  onSelect: (command: string) => void;
  onClose: () => void;
}

const FALLBACK_COMMANDS: SlashCommandInfo[] = [
  { name: "status", description: "Show session status" },
  { name: "context", description: "Show context usage" },
  { name: "model", description: "Change model" },
  { name: "permission-mode", description: "Change permission mode" },
  { name: "review", description: "Review code" },
  { name: "test", description: "Run tests" },
  { name: "compact", description: "Compact conversation" },
  { name: "clear", description: "Clear conversation" },
  { name: "help", description: "Show help" },
];

const GROUPS: Record<string, string[]> = {
  Session: ["status", "context", "resume", "compact", "clear"],
  Coding: ["review", "test", "init"],
  Config: ["model", "permission-mode", "config"],
  Other: ["help", "logout"],
};

export function SlashMenu({ query, commands, onSelect, onClose }: SlashMenuProps) {
  const allCommands = commands.length > 0 ? commands : FALLBACK_COMMANDS;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = filterCommands(allCommands, query);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filtered.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (filtered[selectedIndex]) {
            onSelect("/" + filtered[selectedIndex].name);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filtered, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50">
      <div className="mx-4 rounded-lg border border-border bg-popover shadow-lg max-h-[300px] overflow-y-auto">
        <div ref={listRef} className="py-1">
          {filtered.map((cmd, index) => (
            <button
              key={cmd.name}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => onSelect("/" + cmd.name)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                index === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50"
              }`}
            >
              <span className="font-mono text-xs text-primary">/{cmd.name}</span>
              {cmd.description && (
                <span className="text-xs text-muted-foreground truncate">
                  {cmd.description}
                </span>
              )}
              {cmd.is_skill && (
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                  skill
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function filterCommands(commands: SlashCommandInfo[], query: string): SlashCommandInfo[] {
  if (!query) return commands;
  const lower = query.toLowerCase();
  return commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(lower) ||
      cmd.description?.toLowerCase().includes(lower) ||
      cmd.aliases?.some((a) => a.toLowerCase().includes(lower))
  );
}
