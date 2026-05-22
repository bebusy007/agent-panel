import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function NewSessionView() {
  const navigate = useNavigate();
  const [cwd, setCwd] = useState("");

  const handleStart = () => {
    if (!cwd.trim()) return;
    // Navigate to a special "new session" URL that SessionDetailView can handle
    // For now, store cwd in sessionStorage and navigate to a new-session placeholder
    sessionStorage.setItem("agent-panel:new-session-cwd", cwd.trim());
    navigate("/sessions/__new__");
  };

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
            Project directory (absolute path)
          </label>
          <input
            type="text"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            placeholder="/Users/you/project"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={handleStart}
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
