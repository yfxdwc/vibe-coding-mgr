# ADR-0010 — Governance trend dashboard

**状态**: 待实施（v0.5.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

v0.4.0 cockpit 答"项目现在怎么样"。leaderboard 答"按指标排谁在顶"。但是**没有回答**："团队的治理健康过去一个月在改善还是在恶化？"——这是管理者最直接关心的问题。

`states` 表里其实**已经有时间序列**：每次 `vcm push` 都插入一行，received_at 是时间戳。dashboard.py 现有的 `get_recent_activity` 只取了最近 20 条，扔掉 99% 的历史。

CHARTER §3「长期稳定」需要历史趋势。

## 决策

新增 `/api/dashboard/trend` + `/trends` 视图，**不引入新表、不引入新 schema**——纯函数在 `get_recent_activity` 之上聚合：

```bash
GET /api/dashboard/trend?metric=compliance&days=30
GET /api/dashboard/trend?metric=td_count&days=30
GET /api/dashboard/trend?project=alpha&metric=skills&days=30
```

### 输出结构

```json
{
  "metric": "compliance",
  "days": 30,
  "buckets": [
    {"date": "2026-07-22", "value": 0.5, "n": 3},
    {"date": "2026-07-29", "value": 0.7, "n": 4},
    ...
    {"date": "2026-08-21", "value": 0.9, "n": 5}
  ]
}
```

日期按周分桶（7 天一行），每桶聚合当天所有 push 的指标。空 bucket 显示 null（前端画虚线）。

### 支持的 metric

- `compliance` (0..1) — 治理合规度（AGENTS+CHARTER+skills_count）/3
- `td_count` (int) — 当前 tech debt 数量
- `skills` (int) — 当前 skill 注册数
- `adrs` (int) — ADR 数量
- `git_dirty` (0/1) — 工作树脏度
- `pushed` (count) — 每桶 push 次数

### View

`/trends` 视图：
- 顶部 metrics selector（dropdown）
- 项目 selector（"all" + 已注册项目）
- 单 line chart (ECharts) 跨时间
- 数字卡显示 % change vs 上一个 period

遵守 ADR-0001（repowise-inspired）规则：用 `c-card` + `kpi-grid` + DESIGN.md §4 组件。

### 反对意见

- **Q: 为啥不存 Redis?  
  **A: CHARTER §8 本地优先。States 表已经够用，零基础设施。
- **Q: 周分桶会不会盖掉 30 天内趋势?  
  **A: 大多数治理 issue 周期以周计。如果要精度，**支持 `?days=7`** bucket = day；v0.5.0 默认周。
- **Q: 实时更新?  
  **A: 不接 SSE（避免 ADR-0007 复合）。View render 时 fetch。

### 后果

#### 正面

- 答"治理健康在变好或变坏" (管理者视角)
- 不引入 schema / DB 表，纯 function
- 让 `states` 表的价值被打捞

#### 负面 / 风险

- 100k states 行 → query ~500ms。SQL 加 `received_at` index 缓解。可接受。
- View 渲染 N 条 bucket → 200 datapoints = OK。
- 没有 push 的日子就是 null，画虚线即可

### 验收

```bash
# endpoint
curl 'http://127.0.0.1:7338/api/dashboard/trend?metric=compliance&days=30' | jq '.buckets | length'

# UI
open http://127.0.0.1:7338/trends  # shows line chart
```

### 不做

- ❌ 引入 Redis / InfluxDB
- ❌ 跨机器 trending
- ❌ 预测 / 回归 (v0.7.0)
- ❌ Per-user contribution timeline

## 参考

- [states 表 schema](../../server/app.py) — 已存 `received_at`
- [CHARTER §3](../CHARTER.md) — 长期稳定
- [ADR-0001](0001-repowise-inspired-frontend.md) — UI 规则
