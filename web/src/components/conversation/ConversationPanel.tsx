import React, { useState, useEffect, useCallback } from "react";
import { useChatConnection } from "@/lib/conversation/use-chat-connection";
import { isConnected, isRunning } from "@/lib/conversation/chat-session-store";
import { ConversationTimeline } from "./ConversationTimeline";
import { ConversationPrompt } from "./ConversationPrompt";
import { ConversationStatusBar } from "./ConversationStatusBar";
import { PermissionPanel } from "./PermissionPanel";
import { SlashMenu } from "./SlashMenu";

interface ConversationPanelProps {
  sessionId?: string;
  cwd?: string;
}

export function ConversationPanel({ sessionId, cwd }: ConversationPanelProps) {
  const {
    state,
    connectionState,
    connect,
    disconnect,
    sendMessage,
    respondPermission,
    interrupt,
  } = useChatConnection({ sessionId, cwd });

  const [slashQuery, setSlashQuery] = useState<string | null>(null);

  const connected = isConnected(state);
  const running = isRunning(state);
  const hasPendingPermission = state.pendingPermissions.length > 0;

  // Global Esc handler (Plan 16)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (slashQuery !== null) {
          setSlashQuery(null);
          return;
        }
        if (running) {
          interrupt();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slashQuery, running, interrupt]);

  const handleSlashSelect = useCallback(
    (command: string) => {
      setSlashQuery(null);
      sendMessage(command);
    },
    [sendMessage]
  );

  const handleSend = useCallback(
    (text: string) => {
      setSlashQuery(null);
      sendMessage(text);
    },
    [sendMessage]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Timeline */}
      <ConversationTimeline state={state} />

      {/* Permission panel (floats above input) */}
      <PermissionPanel
        permissions={state.pendingPermissions}
        onRespond={respondPermission}
        onInterrupt={interrupt}
      />

      {/* Slash menu */}
      <div className="relative">
        {slashQuery !== null && (
          <SlashMenu
            query={slashQuery}
            commands={state.slashCommands}
            onSelect={handleSlashSelect}
            onClose={() => setSlashQuery(null)}
          />
        )}
      </div>

      {/* Status bar */}
      {connected && <ConversationStatusBar state={state} />}

      {/* Input */}
      <ConversationPrompt
        isConnected={connected}
        isRunning={running}
        connectionState={connectionState}
        hasPendingPermission={hasPendingPermission}
        error={state.error}
        onSend={handleSend}
        onInterrupt={interrupt}
        onConnect={connect}
        onSlashTrigger={setSlashQuery}
        onSlashClose={() => setSlashQuery(null)}
      />
    </div>
  );
}
