import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { MCPDetail } from "@/components/MCPDetail";
import { useDetailNav } from "@/lib/use-detail-nav";

/** MCP detail page — overlay vs standalone behaviour mirrors
 *  SkillDetailView; see that file for design rationale. */
export default function MCPDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBack } = useDetailNav("/extensions?section=mcp");

  if (!id) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        无效的 MCP id
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
          onClick={() => navigate("/extensions?section=mcp")}
          className="text-xs text-muted-foreground hover:text-fg transition-colors"
        >
          扩展 / MCP
        </button>
        <ChevronRight className="size-3 text-muted-foreground" />
        <span className="truncate text-xs font-medium text-fg">{id}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MCPDetail id={id} />
      </div>
    </div>
  );
}
