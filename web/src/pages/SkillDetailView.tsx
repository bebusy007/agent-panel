import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { SkillDetail } from "@/components/SkillDetail";
import { useDetailNav } from "@/lib/use-detail-nav";

/**
 * Skill detail page. Two render modes:
 *  - overlay: opened from a listing via Modal Route Pattern, list
 *    underneath stays mounted. 返回 = navigate(-1).
 *  - standalone: deep link or page refresh, no list mounted. 返回 =
 *    navigate to /extensions?section=skills as a sensible fallback.
 *
 * Both modes render identically; the only branch is what the back
 * button does. Header height (h-12) matches IconRail brand chip
 * row so chrome aligns across columns.
 */
export default function SkillDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBack } = useDetailNav("/extensions?section=skills");

  if (!id) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        无效的 Skill id
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        <button
          onClick={goBack}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-fg"
          title="返回"
        >
          <ArrowLeft className="size-3.5" />
          返回
        </button>
        <ChevronRight className="size-3 text-muted-foreground" />
        <button
          onClick={() => navigate("/extensions?section=skills")}
          className="text-xs text-muted-foreground hover:text-fg transition-colors"
        >
          扩展 / Skills
        </button>
        <ChevronRight className="size-3 text-muted-foreground" />
        <span className="truncate text-xs font-medium text-fg">{id}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <SkillDetail id={id} />
      </div>
    </div>
  );
}
