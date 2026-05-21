import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { ConversationPanel } from "@/components/conversation/ConversationPanel";

export default function NewSessionView() {
  const navigate = useNavigate();
  const [cwd, setCwd] = useState(() => {
    // Default to home directory or last used project
    return "";
  });
  const [started, setStarted] = useState(false);

  if (started && cwd) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-sidebar px-4 py-2.5">
          <button
            onClick={() => navigate("/sessions")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-fg"
          >
            <ArrowLeft className="size-4" />
          </button>
          <h1 className="text-sm font-medium text-fg">New Conversation</h1>
          <span className="text-xs text-muted-foreground font-mono truncate">
            {cwd}
          </span>
        </header>
        <div className="flex-1 min-h-0">
          <ConversationPanel cwd={cwd} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center p-8 animate-fade-in">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="typo-h1">New Conversation</h1>
          <p className="text-sm text-muted-foreground">
            Choose a project directory to start a new Claude Code conversation.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Project directory
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              placeholder="/Users/you/project"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              title="Browse..."
              className="rounded-lg border border-border px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <FolderOpen className="size-4" />
            </button>
          </div>
        </div>

        <button
          onClick={() => cwd.trim() && setStarted(true)}
          disabled={!cwd.trim()}
          className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Start Conversation
        </button>

        <button
          onClick={() => navigate("/sessions")}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to sessions
        </button>
      </div>
    </div>
  );
}
