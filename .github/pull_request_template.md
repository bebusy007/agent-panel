## Summary

<!-- 简述改动内容和原因 -->

## Changelog

<!--
  写一条用户能懂的描述，会出现在 Release notes 里。
  格式：Added / Fixed / Changed / Removed
  例如：
  - Added: 新增搜索过滤功能
  - Fixed: 修复 Dashboard 白屏
  纯工程基础设施（CI、lint、格式化）可以不写。
-->

## Related Issue

<!-- Fixes #xxx -->

## Checklist

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm format:check` 通过
- [ ] `pnpm lint` 通过
- [ ] `cargo clippy` 通过（如有 Rust 改动）
- [ ] 新增/修改的功能有对应测试
- [ ] UI 改动遵循设计系统（如有）
- [ ] Changelog 已填写（如有用户可见变更）
