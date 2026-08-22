---
name: drift-detection
description: "修改 /api/dashboard/drift 端点、/drift 视图、server/dashboard.py:get_drift_score 或其调用的 health score 算法前必读 — 含 AGENTS.md / CHARTER.md / README / ADR INDEX 四类漂移检测与阈值硬编码 4 条红线。"
authority: canonical
canonical_ref: ../../adr/0019-drift-detection.md
tags: [drift, dashboard, health, detection, governance]
---

# Drift Detection (governance 健康度)

> **When to read**: 改 /drift 视图、调 drift 评分公式、加新漂移检测项时必读。
> **Authority**: [`ADR-0019`](../../adr/0019-drift-detection.md)

## 1. 范围

- `server/dashboard.py:get_drift_score` — 计算单项目 0-100 健康分
- `/api/dashboard/drift` — 当前项目漂移详情 (HTML + JSON)
- `/drift` 视图 — `server/templates/drift.html` + Alpine 渲染
- 4 类漂移源:
  1. **AGENTS.md 必备项缺失** (`## 1.` / `## 2.` / `## 6.` 三节标题)
  2. **CHARTER.md 必备条款缺失** (`## 1.` / `## 5.` / `## 10.` 三节标题)
  3. **README.md 过期** (`version:` 与 `package.json` 不一致)
  4. **ADR INDEX 不全** (`docs/adr/INDEX.md` 编号跳跃)

## 2. 硬约束

- ❌ **不要把阈值硬编码到模板** — 0/20/40/60/80 五档边界写在 `dashboard.py`, 模板只渲染
- ❌ **不要让 `get_drift_score` 静默吞掉 IOError** — 文件缺失应返回 `None` + 详细分类, 不要默认满分
- ❌ **不要把 health score 与其他 score 混合** — ADR-0003 / 0005 已经定 KPI 三轨并行, 不可再加 blended
- ✅ drift 评分公式: `100 - sum(item.weight)` — 每个缺失项扣 `item.weight` (默认 20)
- ✅ drift 视图必须展示每个缺失项的修复建议 (1 行 ADR 链接 / 文件路径)

## 3. 反模式

- 把"未配置 peer URL"算 drift 项 — peer 是可选的, 不是 governance 健康度
- 用机器学习 / git history 推断漂移 — 阈值必须是确定性规则, 可解释
- 把 drift 评分藏到 KPI 总览里 — 必须独立 tab, 便于快速定位
- drift 视图用 ECharts 渲染 — 应是文字 + 列表 (低信息密度), 不是图表

## 4. 验收

```bash
# 1. 单元测试
npm test -- tests/drift.test.js   # all passed (drift endpoint + view)

# 2. 真实项目跑 (手动或 CI 验证)
curl -s http://127.0.0.1:$VCM_PORT/api/dashboard/drift | python3 -m json.tool
# 期望: 4 项都有 status: ok / missing, score 0-100

# 3. CI 卡口
bash scripts/routine_coverage.sh   # exit 0

# 4. ADR 一致性
python3 scripts/check_doc_drift.py
# 期望: ✓ 找到 N 个 markdown 文件
```

## 5. 相关文档

- [`ADR-0019`](../../adr/0019-drift-detection.md) — 漂移检测决策
- [`server/dashboard.py:get_drift_score`](../../server/dashboard.py) — 评分实现
- `tests/drift.test.js` — endpoint + 视图测试
- [`server/templates/drift.html`](../../server/templates/drift.html) — 视图模板
