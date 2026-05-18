import { Bell, Info, Users, type LucideIcon } from "lucide-react";

export interface XmlTagConfig {
  displayName: string | ((attrs: Record<string, string>) => string);
  icon: LucideIcon;
  color: string | ((attrs: Record<string, string>) => string);
  metaFields: string[];
  markdownFields: string[];
  statsFields: string[];
  attrFields?: string[];
  showHeaderBadge?: boolean;
}

export function resolveDisplay(
  cfg: XmlTagConfig,
  attrs: Record<string, string>,
): { name: string; color: string } {
  return {
    name: typeof cfg.displayName === "function" ? cfg.displayName(attrs) : cfg.displayName,
    color: typeof cfg.color === "function" ? cfg.color(attrs) : cfg.color,
  };
}

export const xmlTagRegistry: Record<string, XmlTagConfig> = {
  "task-notification": {
    displayName: "任务通知",
    icon: Bell,
    color: "blue",
    metaFields: ["task-id", "status", "tool-use-id"],
    markdownFields: ["summary", "result"],
    statsFields: ["usage"],
    showHeaderBadge: false,
  },
  "system-reminder": {
    displayName: "系统提醒",
    icon: Info,
    color: "amber",
    metaFields: [],
    markdownFields: [],
    statsFields: [],
  },
  "teammate-message": {
    displayName: (attrs) => attrs.teammate_id ? `队友: ${attrs.teammate_id}` : "队友消息",
    icon: Users,
    color: (attrs) => attrs.color || "cyan",
    metaFields: [],
    markdownFields: [],
    statsFields: [],
    attrFields: ["teammate_id", "summary"],
    showHeaderBadge: false,
  },
};
