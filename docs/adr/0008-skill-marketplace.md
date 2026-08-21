# ADR-0008 — Skill marketplace / publish / discover

**状态**: 待实施（v0.5.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

ADR-0006（lifecycle）让 skill 可退役，但**新 lifecycle 状态**只覆盖 deprecated / retired，没给"重新发布"留通道。一个项目里去掉了 `foo` 后下一个项目也想用 `foo` 时，必须重新 SKILL.md 写一遍——这违背 CHARTER §3「少重复，多复用」。

5 个 adopted standard 的市场各自独立。repowise.dev 的做法：单一 registry，本地镜像。vcm-mgr 借鉴：

## 决策

新增 4 个 CLI 命令 + 1 个 server endpoint，对应一个 **本地 registry 目录** `~/.vcm/registry/`：

```
~/.vcm/registry/
  └─── index.json                    # registry index
  └─── skills/
       └─── skill-name.json          # one file per skill (json)
       └─── another-skill.json
```

**注意是本地 registry，不是 cloud**——CHARTER §8 本地优先。多个 vcm-server 实例可在 LAN 上共享 NFS 路径。

### CLI

```bash
vcm skill publish <name>          # 把当前 .vcm-skill.json 拷到 registry
vcm skill unpublish <name>        # 从 registry 删除
vcm skill discover [--tag foo]    # 列出 registry 中所有 skill（可过滤标签）
vcm skill install <name> [--to <local-skills-dir>]
```

`publish` 前需要做以下校验：
- 当前 lifecycle.phase ∈ {active, deprecated}（**禁止 publish `retired`**）
- 当前 `.vcm-skill.json` 通过 vcm schema 校验
- 当前 `.vcm-skill.json` 与 registry 中已有版本不冲突（或者用 `--force`）

`discover` 输出按 `metadata.validation_count` 倒序排，热门 skill 浮顶。

### Server endpoint

```bash
GET /api/registry/skills           # list of all public skill metadata
GET /api/registry/skills/<name>    # one skill, full .vcm-skill.json
```

Registry 默认从 `~/.vcm/registry/` 读，可由 `VCM_REGISTRY_DIR` env var 改。

### 与已有 ADRs 的关系

- **ADR-0006（lifecycle）**: publish 必须 phase != retired；unpublish 等于 retire 的反向
- **ADR-0003（adapter）**: registry 里的 skill 是 **vcm 格式**；其它 5 个标准进入后先 convert → vcm，再 publish
- **ADR-0004（BasicAuth）**: GET 注册表仍然 public-readable（hot cache for agents）；只有 publish 写操作要求 auth（若开启）
- **CHARTER §6**：「写操作必经审批」: CLI `publish` 是用户主动行为，但 server 端不会自动同步——除非 `VCM_REGISTRY_WATCH_PUSHES` 自动从 state 提取（v0.6.0）

### 反对意见

- **Q: 不用 GitHub 风格 marketplace?  
  **A: 本地 registry 是 v0.5.0；GitHub / GitLab registry 是 v0.6.0 远景。本地优先 (CHARTER §8)。
- **Q: 不发网络请求，去重不彻底?  
  **A: 第一版不解决跨机器去重。同局域网多实例靠 `VCM_REGISTRY_DIR` 指向同一 NFS 路径。跨网同步是 v0.6.0。
- **Q: sign / verify?  
  **A: 不做。Open Source v0.5.0；signing 是 v0.7.0 (CHARTER §6 + 安全 community)。

### 后果

#### 正面

- 完成 lifecycle 闭环：discover → install → use → deprecate → publish-new
- 让 `vcm skill` 真正成为内部 marketplace
- 团队里 10 人共享 50 个 registry skill 比 10×50=500 个独立 SKILL.md 强

#### 负面 / 风险

- 文件 IO 多了一处 (`~/.vcm/registry/`)，CI 可能没建
- `publish` 加在 CLI 上需要 schema 校验，避免发垃圾
- 必须保证 `discover` 不扫整个文件系统 (DoS)；固定路径

### 验收

```bash
# 端到端
vcm skill add foo --desc "x" --tags demo && vcm skill publish foo
vcm skill discover --tag demo
vcm skill install foo --to /tmp/other-project/.pi/skills/

# server endpoint
curl http://127.0.0.1:7338/api/registry/skills | jq '.[0].name'
```

### 不做

- ❌ GitHub / GitLab / npm 同步
- ❌ Sign / verify
- ❌ 跨机器自动 sync
- ❌ Registry UI（discovery 通过 server endpoint + 未来 dashboard widget）

## 参考

- [repowise "durable skills" registry](https://docs.repowise.dev/concepts/skills)
- [ADR-0003](0003-skill-adapter-layer.md) — registry 永远收 vcm 格式
- [ADR-0006](0006-skill-lifecycle.md) — publish 限制 retired
- [CHARTER §6 §8](../CHARTER.md)
