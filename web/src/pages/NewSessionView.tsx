import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Loader2 } from 'lucide-react';
import { useChatConnection } from '@/lib/conversation/use-chat-connection';

const RECENT_CWDS_KEY = 'agent-panel:recent-cwds';
const MAX_RECENT = 8;

function loadRecentCwds(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_CWDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveRecentCwd(cwd: string) {
  const prev = loadRecentCwds().filter((d) => d !== cwd);
  prev.unshift(cwd);
  sessionStorage.setItem(RECENT_CWDS_KEY, JSON.stringify(prev.slice(0, MAX_RECENT)));
}

export default function NewSessionView() {
  const navigate = useNavigate();
  const chat = useChatConnection();
  const [cwd, setCwd] = useState('');
  const recentCwds = useMemo(loadRecentCwds, []);

  const isConnecting = chat.state.phase === 'connecting';

  // When connection succeeds and we get a session_id, navigate to it
  useEffect(() => {
    if (chat.state.sessionId && chat.state.phase === 'idle') {
      const sid = chat.state.sessionId;
      saveRecentCwd(cwd.trim());
      navigate(`/sessions/${sid}`, { replace: true });
    }
  }, [chat.state.sessionId, chat.state.phase, navigate, cwd]);

  const handleStart = () => {
    const dir = cwd.trim();
    if (!dir) return;
    chat.connectNew(dir);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleStart();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-lg mx-auto px-4">
      <h1 className="typo-h1 mb-4">新建对话</h1>
      <p className="text-sm text-muted-foreground mb-8 text-center">
        在指定项目目录下启动 Claude Code 对话
      </p>

      <div className="w-full space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">工作目录</label>
          <input
            autoFocus
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/path/to/your/project"
            disabled={isConnecting}
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-border focus:ring-1 focus:ring-accent/30 placeholder:text-muted-foreground disabled:opacity-50"
          />
        </div>

        {recentCwds.length > 0 && (
          <div>
            <span className="block text-xs font-medium text-muted-foreground mb-2">
              最近使用的项目
            </span>
            <div className="flex flex-wrap gap-2">
              {recentCwds.map((d) => (
                <button
                  key={d}
                  onClick={() => !isConnecting && setCwd(d)}
                  disabled={isConnecting}
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:border-border hover:text-fg transition-colors disabled:opacity-50"
                >
                  {d.replace(/^\/Users\/[^/]+/, '~')}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!cwd.trim() || isConnecting}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              启动中...
            </>
          ) : (
            <>
              <Play className="size-4" />
              开始对话
            </>
          )}
        </button>
      </div>
    </div>
  );
}
