# Changelog

## v0.2.3 (2026-04-29)

### Features
- subagent conversations viewable inside parent session detail

### Other
Merge #6 branch 'feat/subagent-display' into 'master'

## v0.2.2 (2026-04-29)

### Features
- update mechanism — CLI hint + web banner + update.sh

### Fixes
- raise claude-history session cap from 200 to 2000

### Other
Merge #5 branch 'feat/update-mechanism' into 'master'
Merge #4 branch 'fix/history-session-cap' into 'master'

## v0.2.1 (2026-04-29)

### Features
- tool-card collapse-by-default + 5 ergonomic touches
- replace drawers with route detail pages + URL/scroll state preservation
- unify panel style + drop sidebar from non-session routes
- date-range hint, responsive heatmap, cost ? popover
- cost estimation across Claude Code + Codex
- /usage analytics page with multi-source breakdown
- unified /extensions view with Skills / MCP / Hooks / Agents
- persistent prompt-index + faceted /history search page
- add WebFetch / TodoWrite / Task / ExitPlanMode / AskUserQuestion cards
- tool card dispatcher with 6 core cards + raw JSON toggle
- right sidebar with Tools / Files / Info / Context tabs
- standalone session detail page with three-column layout
- unified tool call extraction across 5 sources
- two-tier sidebar with project folder tree + isRunning
- session sort, token counters, GitHub-style activity wall
- one-shot packaging script + distribution tutorial
- source-health UI, 30-day grave for permanent delete, cursor-composer fd fix
- in-pane search for Skill & MCP detail drawers
- cross-source cascade delete + row-level trash for Claude prompts

### Fixes
- preserve sidebar search + stop list "全量刷新" flash
- replace AgentDrawer with /agents/:id route
- pill alignment, drawer header height, favorite text cleanup
- heatmap horizontal scroll + sharper color steps
- heatmap cell tooltip: also wire onMouseOver
- search wrap-around no longer leaves last match half-off-screen
- long-message collapse, sidebar source icons, /extensions plugins+commands, delete auto-refresh
- heatmap month labels + reliable tooltips
- address review-agent findings (P0-P4 polish)
- strip <user_query>/<command-message> wrappers from displayed previews
- rebuild in-session search counter over source text

### Refactors
- Modal Route Pattern overlay + state-preserve cleanup
- merge /history into SessionsView as 双模式 search

### Other
- add scripts/release.sh for version bump + changelog + tag + push
Merge #3 branch 'feat/agent-panel-upgrade' into 'master'
- merge history into sessions, drop j/k shortcut
- add routing & navigation design doc
- restore executable bit on bin/agent-panel.mjs
- rename skill-panel → agent-panel, keep CLI alias
- 15s extensions cache + watch settings.json/agents
- amend plan v1 to address user feedback
- implementation plan v1 with research findings
- OpenCovibe research notes for agent-panel upgrade
- rewrite README with 5-tab product surface + subsystem map
- init skill-panel source tree
Initial commit
