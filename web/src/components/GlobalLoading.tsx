import { Sparkles } from "lucide-react";

export function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground shadow-lg animate-pulse">
          <Sparkles className="size-6" />
        </div>
        <div className="text-sm text-muted-foreground animate-fade-in">
          加载中…
        </div>
      </div>
    </div>
  );
}
