# ADR-0005 — Cross-project comparison (leaderboard)

**状态**: 待实施（v0.4.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

v0.3.0 的 cockpit 视图回答「单个项目状态怎样」、「跨项目 skill 复用度」。但**项目间对比**回答不了：「3 个项目哪个 TDs 最多？」「哪个技能被最多项目复用？」「哪个项目治理最不健全？」。

`vcm peers` 已经为「关注外部项目」开了口子，但**自己仓库群**之间的对比却没有。这违背了 CHARTER §3「长期稳定 > 少 diff」——数据已经在 SQLite 里了（`states` 表），只是没汇总。

## 决策

新增 `/api/dashboard/leaderboard` 端点 + `/leaderboard` 视图，前者多维度排序项目，后者用条目卡 + 排序下拉。

### 端点形态

```json
GET /api/dashboard/leaderboard?sort=td_count&order=desc

{
  "sort": "td_count",
  "order": "desc",
  "rows": [
    {"name": "beta", "td_count": 42, "skills": 3, "adrs": 5,
     "branch": "develop", "dirty": true, "stale_days": 0,
     "compliance": 0.33},
    ...
  ]
}
```

支持的 `sort` 维度：
- `td_count` — Tech debt 数量
- `skills` — registered skills 数量
- `adrs` — ADR count
- `governance_compliance` — (`agents_md_present` + `charter_md_present` + `skills_count > 0`) / 3
- `last_seen_days` — staleness
- `dirty_clean` — working tree

### 视图

用 `lib/cli/leaderboard.js` 输出表格 → HTML。**不** 重新发明表格，沿用 v0.3.0 的 `data-table` 组件 + `tag` 行内标签 + 排序下拉（Alpine `x-model`）。

### 反对意见

- **Q**: 这个 leaderboard 不是「push-pull」仓库的？  
  **A**: 那是个**未来** ADR（gossip protocol / multi-server），不在 v0.4.0 scope。
- **Q**: 6 个 sort 维度会不会太多？  
  **A**: ADR-0001 的设计纪律「每个 view 答一个问题」。本 view 答的是「按 X 排序时谁在顶」。一次只让用户看一个 X，6 个选项 vs 1 个 = 6 倍 utility。

### 后果

#### 正面

- 用户能直接看出「团队整体 tech debt 集中在哪几个项目」
- 发现 stale 项目（last_seen > 30 天）
- /peers 之外的「内部 peer」视图

#### 负面 / 风险

- +1 endpoint + +1 view + +1 setting。债务 ~150 行 + 50 行测试。
- 与 `/api/dashboard/overview` 重叠——必须明确分工：overview = 列表，leaderboard = 排序。

### 验收

```bash
curl -s http://127.0.0.1:7338/api/dashboard/leaderboard?sort=td_count | jq '.rows | length'
```

### 不做

- ❌ Cross-server leaderboard（v0.5.0 gossip）
- ❌ 多 user filter（团队级别 leaderboard）
- ❌ 时间序列 graph（governance 趋势）

## 参考

- [repowise dashboard](https://repowise.dev) — 团队视角
- [`server/dashboard.py:get_overview`](../../server/dashboard.py) — 数据复用
