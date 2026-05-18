import {
  User,
  Sparkles,
  Wrench,
  CheckCircle2,
  Settings,
  Tag,
  Bot,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

export interface RoleTheme {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bgCard: string;
  borderCard: string;
  borderLeft: string;
  bgChip: string;
  bgChipActive: string;
  borderChip: string;
  borderChipActive: string;
}

const themes: Record<string, RoleTheme> = {
  user: {
    key: "user",
    label: "User",
    icon: User,
    color: "text-blue-400",
    bgCard: "bg-blue-500/5",
    borderCard: "border-blue-500/20",
    borderLeft: "border-l-blue-400",
    bgChip: "bg-card",
    bgChipActive: "bg-blue-500/15",
    borderChip: "border-border",
    borderChipActive: "border-blue-500/40",
  },
  assistant: {
    key: "assistant",
    label: "Assistant",
    icon: Sparkles,
    color: "text-purple-400",
    bgCard: "bg-purple-500/5",
    borderCard: "border-purple-500/20",
    borderLeft: "border-l-purple-400",
    bgChip: "bg-card",
    bgChipActive: "bg-purple-500/15",
    borderChip: "border-border",
    borderChipActive: "border-purple-500/40",
  },
  tool_use: {
    key: "tool_use",
    label: "Tool Use",
    icon: Wrench,
    color: "text-violet-400",
    bgCard: "bg-violet-500/5",
    borderCard: "border-violet-500/20",
    borderLeft: "border-l-violet-400",
    bgChip: "bg-card",
    bgChipActive: "bg-violet-500/15",
    borderChip: "border-border",
    borderChipActive: "border-violet-500/40",
  },
  tool_result: {
    key: "tool_result",
    label: "Tool Result",
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgCard: "bg-emerald-500/5",
    borderCard: "border-emerald-500/20",
    borderLeft: "border-l-emerald-400",
    bgChip: "bg-card",
    bgChipActive: "bg-emerald-500/15",
    borderChip: "border-border",
    borderChipActive: "border-emerald-500/40",
  },
  system: {
    key: "system",
    label: "System",
    icon: Settings,
    color: "text-amber-400",
    bgCard: "bg-amber-500/5",
    borderCard: "border-amber-500/20",
    borderLeft: "border-l-amber-400",
    bgChip: "bg-card",
    bgChipActive: "bg-amber-500/15",
    borderChip: "border-border",
    borderChipActive: "border-amber-500/40",
  },
  meta: {
    key: "meta",
    label: "Meta",
    icon: Tag,
    color: "text-muted-foreground",
    bgCard: "bg-muted/30",
    borderCard: "border-border/60",
    borderLeft: "border-l-muted-foreground/40",
    bgChip: "bg-card",
    bgChipActive: "bg-secondary",
    borderChip: "border-border",
    borderChipActive: "border-border",
  },
  image: {
    key: "image",
    label: "Image",
    icon: ImageIcon,
    color: "text-rose-400",
    bgCard: "bg-rose-500/5",
    borderCard: "border-rose-500/20",
    borderLeft: "border-l-rose-400",
    bgChip: "bg-card",
    bgChipActive: "bg-rose-500/15",
    borderChip: "border-border",
    borderChipActive: "border-rose-500/40",
  },
  subagent: {
    key: "subagent",
    label: "Subagent",
    icon: Bot,
    color: "text-cyan-400",
    bgCard: "bg-cyan-500/5",
    borderCard: "border-cyan-500/20",
    borderLeft: "border-l-cyan-400",
    bgChip: "bg-card",
    bgChipActive: "bg-cyan-500/15",
    borderChip: "border-border",
    borderChipActive: "border-cyan-500/40",
  },
};

const fallback: RoleTheme = {
  key: "unknown",
  label: "Unknown",
  icon: Tag,
  color: "text-muted-foreground",
  bgCard: "bg-card",
  borderCard: "border-border",
  borderLeft: "border-l-border",
  bgChip: "bg-card",
  bgChipActive: "bg-secondary",
  borderChip: "border-border",
  borderChipActive: "border-border",
};

export function getRoleTheme(role: string): RoleTheme {
  return themes[role] ?? fallback;
}

export function getAllRoleThemes(): RoleTheme[] {
  return Object.values(themes);
}
