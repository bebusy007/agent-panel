import React, { useState, useCallback } from "react";
import { ShieldAlert, Check, X, Ban } from "lucide-react";
import type { ChatPermissionRequest } from "@/lib/conversation/chat-protocol";

interface PermissionPanelProps {
  permissions: ChatPermissionRequest[];
  onRespond: (requestId: string, decision: "allow" | "deny") => void;
  onInterrupt?: () => void;
}

export function PermissionPanel({
  permissions,
  onRespond,
  onInterrupt,
}: PermissionPanelProps) {
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  const handleRespond = useCallback(
    (requestId: string, decision: "allow" | "deny") => {
      if (submittedIds.has(requestId)) return;
      setSubmittedIds((prev) => new Set(prev).add(requestId));
      onRespond(requestId, decision);
    },
    [onRespond, submittedIds]
  );

  const handleAllowAll = useCallback(() => {
    for (const perm of permissions) {
      if (!submittedIds.has(perm.request_id)) {
        handleRespond(perm.request_id, "allow");
      }
    }
  }, [permissions, submittedIds, handleRespond]);

  const handleDenyAndStop = useCallback(
    (requestId: string) => {
      handleRespond(requestId, "deny");
      onInterrupt?.();
    },
    [handleRespond, onInterrupt]
  );

  if (permissions.length === 0) return null;

  const pending = permissions.filter((p) => !submittedIds.has(p.request_id));
  if (pending.length === 0) return null;

  return (
    <div className="border-t border-border bg-card px-4 py-3 space-y-2">
      {/* Batch actions for multiple permissions */}
      {pending.length > 1 && (
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground">
            {pending.length} permissions pending
          </span>
          <button
            onClick={handleAllowAll}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Allow all ({pending.length})
          </button>
        </div>
      )}

      {/* Permission cards */}
      {pending.map((perm) => (
        <PermissionCard
          key={perm.request_id}
          permission={perm}
          isSubmitting={submittedIds.has(perm.request_id)}
          onAllow={() => handleRespond(perm.request_id, "allow")}
          onDeny={() => handleRespond(perm.request_id, "deny")}
          onDenyAndStop={() => handleDenyAndStop(perm.request_id)}
        />
      ))}
    </div>
  );
}

interface PermissionCardProps {
  permission: ChatPermissionRequest;
  isSubmitting: boolean;
  onAllow: () => void;
  onDeny: () => void;
  onDenyAndStop: () => void;
}

function PermissionCard({
  permission,
  isSubmitting,
  onAllow,
  onDeny,
  onDenyAndStop,
}: PermissionCardProps) {
  const inputPreview = permission.tool_input
    ? JSON.stringify(permission.tool_input, null, 2)
    : null;

  return (
    <div className="rounded-lg border border-border bg-secondary/30 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/40">
        <ShieldAlert className="w-4 h-4 text-warning" />
        <span className="text-sm font-medium text-foreground">
          {permission.tool_name}
        </span>
      </div>

      {inputPreview && (
        <div className="px-3 py-2 text-xs font-mono text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap border-t border-border">
          {inputPreview.length > 500 ? inputPreview.slice(0, 500) + "..." : inputPreview}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
        <button
          onClick={onAllow}
          disabled={isSubmitting}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium hover:bg-green-500/20 disabled:opacity-50 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Allow
        </button>
        <button
          onClick={onDeny}
          disabled={isSubmitting}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 disabled:opacity-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Deny
        </button>
        <button
          onClick={onDenyAndStop}
          disabled={isSubmitting}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 disabled:opacity-50 transition-colors ml-auto"
        >
          <Ban className="w-3.5 h-3.5" />
          Deny & Stop
        </button>
      </div>
    </div>
  );
}
