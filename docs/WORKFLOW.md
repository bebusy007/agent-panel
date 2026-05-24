# Agent 开发分支模型

适用于任何使用 AI Agent（Claude Code 等）作为 developer/reviewer 的项目。核心原则：**master 只放人工确认过的代码，feature 分支是唯一开发单元，dev 是临时预览环境。**

---

## 分支定义

| 分支 | 用途 | 生命周期 |
|------|------|----------|
| `master` | 稳定发布分支，只含人工确认过的代码 | 长期 |
| `dev` | 开发预览/测试集成分支，非长期可信主干 | 可随时从 `master` 重建 |
| `feature/<task-name>` | 独立功能分支，每次 pipeline 一条 | 完成合并到 `master` 后删除 |

---

## 普通功能流程

### 1. 创建 feature 分支

```
git fetch origin
git checkout -b feature/<task-name> origin/master
```

始终从 `master` 切出，不从 `dev` 切。保证每个 feature 分支独立、干净。

### 2. Developer 在 feature 分支实现

developer agent（Claude Code 等）在 `feature/<task-name>` 上完成代码修改。所有 commit 提交到该分支。

### 3. Reviewer 在 feature 分支只读 review

reviewer agent 对 `feature/<task-name>` 做只读审查——读代码、审逻辑、跑测试，不直接修改代码。审查意见通过 PR comment 或其他渠道反馈给 developer。

### 4. Reviewer 通过后，light merge 到 dev

使用 `--no-ff` merge commit（不用 squash），保留 feature 分支的完整 commit 历史：

```
git checkout dev
git pull origin dev
git merge --no-ff origin/feature/<task-name> -m "preview: merge feature/<task-name> into dev"
git push origin dev
```

为什么用 `--no-ff`：
- 保留 feature 分支的独立历史，便于追溯
- 不用 squash 是因为 reviewer 已经审查过原始 commit，squash 会丢失粒度信息
- dev 是可重建的，commit 历史乱一点无关紧要

### 5. 人工验收

在 dev 环境预览、测试。确认功能符合预期。

### 6. PR 合并到 master

人工验收通过后，通过 GitHub PR 将 `feature/<task-name>` 合并到 `master`：

- PR 源分支：`feature/<task-name>`
- PR 目标分支：`master`
- 合并方式：由验收者决定（常规 merge / squash / rebase）
- 合并后删除 feature 分支

> ⚠️ **不要默认把 dev 整体合并进 master**，除非确认 dev 上所有变更都已人工验收。dev 可能包含多个 feature 的混合内容，直接合并会把未验收的代码带进稳定分支。

---

## dev 同步 master

当以下情况发生时，可以用 `master` 重建 `dev`：
- `master` 有新提交合并
- `dev` 被多个 feature 合并后混入了已废弃或冲突的内容

### 重建前必须确认

1. 当前工作区是 clean 的
2. `dev` 上没有需要保留但尚未推送到独立 feature 分支的代码
3. 所有仍需保留的开发内容都还在各自 feature 分支上

### 重建命令

```
git fetch origin
git checkout dev
git status                          # 确认 clean
git reset --hard origin/master
git push --force-with-lease origin dev
```

重建后，只需把当前需要预览的 feature 分支重新 light merge 回 dev：

```
git checkout dev
git merge --no-ff origin/feature/<task-name> -m "preview: merge feature/<task-name> into dev"
git push origin dev
```

> ⚠️ `git push --force-with-lease origin dev` **只允许用于"明确重建 dev"的场景**，不用于日常合并 feature。日常 feature 合并只需普通的 `git merge --no-ff` + `git push`。

---

## 分支模型图

```
master  ●────●──────────────────────●──
         \    \                      \
          \    \                      \
feature/a  \    ●────●──● (实现)       \
            \            \  (review ✓) \
feature/b    ●────●──● (实现)          \
                    \  (review ✓)       \
                     \                   \
dev                  ○────○── (preview)   ○── (rebuilt from master)
                      a    b
```

---

## 示例：Agent Panel M1 工程化

以 Agent Panel 项目的 M1 工程化任务为例：

```
master：Agent Panel 稳定发布分支
dev：Agent Panel 预览/测试集成分支
feature/m1-engineering-foundation：M1 工程化任务分支

流程：
1. git checkout -b feature/m1-engineering-foundation origin/master
2. developer 在 feature/m1-engineering-foundation 上实现 PRD、ROADMAP、CI 等
3. reviewer 审查 feature/m1-engineering-foundation
4. 通过后：
   git checkout dev
   git merge --no-ff origin/feature/m1-engineering-foundation -m "preview: merge feature/m1-engineering-foundation into dev"
   git push origin dev
5. 人工验收 dev 上的预览效果
6. 验收通过 → 创建 PR：feature/m1-engineering-foundation → master
7. 合并 PR，删除 feature/m1-engineering-foundation
```
