# ADR-0019 — Cross-project drift detection view

**状态**: 待实施（v0.10.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

cockpit 已能列出所有项目的当前状态（ADR-0004 + ADR-0005），
但**看不出哪个项目最需要 attention**。`get_attention()` 只标"有
问题"，没有定量的 drift score。

CHARTER §6 写操作必经审批——隐含要求：操作者能定位
**最需要操作的**项目。10 个项目都用 vcm 但 5 个停在 v0.2 状态，
vcm 的 operator 怎么知道该升级哪个？

## 决策

新增 `/api/dashboard/drift` + `/drift` view。

### Drift score (0–100, 越高越需 attention)

```python
def drift_score(project):
    s = 0
    if not project['governance']['agents_md_present']: s += 25
    if not project['governance']['charter_md_present']: s += 20
    if project['git']['dirty']: s += 10
    days = project['days_since_last_push']
    if days > 90: s += 20
    elif days > 30: s += 10
    if project['governance']['adrs_count'] < 3: s += 15
    if project['governance']['skills_count'] == 0: s += 10
    return min(s, 100)
```

权重：缺 AGENTS.md (25) > 缺 CHARTER.md (20) > ADR < 3 (15) > 其他。

### View

`/drift` 视图排序项目按 drift score desc，每行：
- 项目名 + 链接
- 分数（数字 + 颜色：< 30 绿，30–70 黄，> 70 红）
- 顶部 KPI：50%+ drift 的项目数、平均 drift score、最长未推送时间

### Endpoint

```json
GET /api/dashboard/drift
  → {"projects": [{name, score, days_idle, missing: [...], recommendations: [...]}],
     "summary": {over_50_count, avg_score, max_days_idle}}
```

### 反对意见

- **Q: 权重怎么定的？  
  **A: 经验值：AGENTS.md 是 AI 起手模板（CHARTER §10），缺它最致命。
  ADR < 3 表示项目没在写决策记录（CHARTER §6）。其他是滞后信号。
- **Q: 不让用户自定义权重？  
  **A: v0.10.0 hardcode。v0.11.0 加 `vcm drift --config` JSON 覆盖。
- **Q: 不查 vcm 版本（项目卡在 v0.2）？  
  **A: drift 已经隐含——`days_idle > 90` 指向 stale。版本检查再加。

### 后果

#### 正面

- Operator 知道该升级哪个项目（actionable insight）
- 健康项目不被噪声打扰（按 drift desc 显示）
- 推动"哪些 ADR 应该 review"的讨论

#### 负面 / 风险

- 权重值是 opinionated——用户可能不同意
- 5 个项目时有用，50 个项目时可能过载（v0.11.0 加 filter）

### 验收

```bash
curl /api/dashboard/drift | jq '.summary.over_50_count'
# Returns number of projects with drift > 50

# Visit /drift in browser
# See sorted list, top is the most stale
```

### 不做

- ❌ 自定义权重（v0.11.0）
- ❌ 自动修复（`vcm drift --fix`）（CHARTER §6 隐含反对）
- ❌ 时间序列 drift 趋势（v0.12.0 + ADR-0010 趋势 dashboard 已存在）

## 参考

- [ADR-0004 BasicAuth](0004-basicauth.md) — auth 字段
- [ADR-0010 趋势 dashboard](0010-trend-dashboard.md) — sibling
- [CHARTER §6](../CHARTER.md) — 写操作必经审批
