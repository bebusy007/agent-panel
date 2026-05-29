import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';

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
  const [cwd, setCwd] = useState('');
  const [starting, setStarting] = useState(false);
  const recentCwds = useMemo(loadRecentCwds, []);

  const handleStart = () => {
    if (!cwd.trim()) return;
    saveRecentCwd(cwd.trim());
    setStarting(true);
    // Navigate to new session — the actual WebSocket connection will be
    // managed by the SessionDetail's ConnectBar. For now, navigate with
    // a 'new' query param that the SessionDetail can read.
    navigate(`/sessions/new?cwd=${encodeURIComponent(cwd.trim())}`);
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
            className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm outline-none focus:border-border focus:ring-1 focus:ring-accent/30 placeholder:text-muted-foreground"
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
                  onClick={() => setCwd(d)}
                  className="text-xs px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:border-border hover:text-fg transition-colors"
                >
                  {d.replace(/^\/Users\/[^/]+/, '~')}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!cwd.trim() || starting}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Play className="size-4" />
          {starting ? '启动中...' : '开始对话'}
        </button>
      </div>
    </div>
  );
}
