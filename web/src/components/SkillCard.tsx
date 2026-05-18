import type { SkillSummary } from "@/lib/api";
import { SkillSourceBadge } from "./SourceBadge";
import { Link2, Terminal, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { highlightJsx } from "@/lib/highlight";

export function SkillCard({
  skill,
  onClick,
  active,
  highlight,
}: {
  skill: SkillSummary;
  onClick?: () => void;
  active?: boolean;
  highlight?: string;
}) {
  const broken = !!skill.symlinkTo && skill.fileSize === 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group block w-full text-left rounded-xl border bg-card p-4 transition-all duration-200 hover:shadow-e2 focus:outline-none",
        active ? "border-2 border-primary bg-[color-mix(in_srgb,var(--primary)_5%,transparent)]" : "border-border",
        broken && "border-destructive/40 bg-destructive/5"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold tracking-tight truncate">
              {highlight ? highlightJsx(skill.name, highlight) : skill.name}
            </span>
            {broken && (
              <span className="text-[10px] uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-md">
                broken
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <SkillSourceBadge source={skill.source} />
            {skill.symlinkTo && (
              <span title={skill.symlinkTo} className="inline-flex items-center gap-0.5 truncate">
                <Link2 className="size-3" /> 软链
              </span>
            )}
          </div>
        </div>
      </div>

      {skill.description && (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
          {highlight ? highlightJsx(skill.description, highlight) : skill.description}
        </p>
      )}

      {skill.triggers && skill.triggers.length > 0 && (
        <div className="mt-3 flex items-center gap-1 flex-wrap">
          <Tag className="size-3 text-muted-foreground" />
          {skill.triggers.slice(0, 6).map((t) => (
            <span
              key={t}
              className="text-[11px] rounded-md bg-secondary px-1.5 py-0.5 text-secondary-foreground"
            >
              {t}
            </span>
          ))}
          {skill.triggers.length > 6 && (
            <span className="text-[10px] text-muted-foreground">+{skill.triggers.length - 6}</span>
          )}
        </div>
      )}

      {skill.cliCommands.length > 0 && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <Terminal className="size-3 text-muted-foreground" />
          {skill.cliCommands.slice(0, 4).map((c) => (
            <span
              key={c}
              className="text-[11px] font-mono rounded-md bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] text-primary px-1.5 py-0.5"
            >
              {c}
            </span>
          ))}
          {skill.cliCommands.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{skill.cliCommands.length - 4}</span>
          )}
        </div>
      )}
    </button>
  );
}
