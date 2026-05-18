import { useEffect, useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { api } from "@/lib/api";
import { COPY_FEEDBACK_UPDATE_MS } from "@/lib/constants";

const DISMISS_KEY = "agent-panel:update-dismissed";

export function UpdateBanner() {
  const [info, setInfo] = useState<{
    current: string;
    latest: string | null;
    hasUpdate: boolean;
    repoRoot: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const prev = sessionStorage.getItem(DISMISS_KEY);
    if (prev) {
      setDismissed(true);
      return;
    }
    api.version().then((v) => { }).catch(() => {});
  }, []);

  if (dismissed || !info?.hasUpdate) return null;

  const cmd = `cd ${info.repoRoot} && ./scripts/update.sh`;

  const handleCopy = () => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), COPY_FEEDBACK_UPDATE_MS);
    });
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, info.latest ?? "");
  };

  return (
    <div className="flex items-center gap-3 border-b border-accent/30 bg-accent/10 px-4 py-2 text-sm">
      <ArrowUpCircle className="h-4 w-4 shrink-0 text-accent" />
      <span>
        新版本可用：
        <span className="font-mono text-muted-foreground">v{info.current}</span>
        {" → "}
        <span className="font-mono font-semibold">{info.latest}</span>
      </span>
      <button
        onClick={handleCopy}
        className="ml-1 rounded bg-accent/20 px-2 py-0.5 font-mono text-xs text-accent hover:bg-accent/30 transition-colors"
      >
        {copied ? "已复制" : "复制更新命令"}
      </button>
      <button
        onClick={handleDismiss}
        className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-fg hover:bg-sidebar transition-colors"
        title="本次会话不再提示"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
