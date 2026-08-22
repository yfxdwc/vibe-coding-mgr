# ADR-0031 — DB path hygiene + startup self-check

**状态**: 已采纳（未实施）
**日期**: 2026-08-22
**作者**: mm7 / pi
**前置**: [ADR-0030](0030-sidebar-and-multi-project.md) §决策.8

## 背景

ADR-0030 §决策.8 在起草时基于对仓库根 `vcm.db` 的查询写下"projects 表
silent-broken"判断，**与事实不符**——v0.18.0 启动时核对发现：

| 路径 | 状态 | 内容 |
|---|---|---|
| `<repo>/server/vcm.db` | service 实际用的 | 4 表齐全 + 2 个项目（vcm-smoke / sales-ai）|
| `<repo>/vcm.db`（根） | 孤儿文件 | 3 表：`audit_events / tokens / users`，缺 `projects / states` |

根 `vcm.db` 来自某次手动 init / CLI / 测试残留创建（创建时间
2026-08-21 10:47:12，比 service db 晚 3 分钟）。service 进程**不读**
根 db（`DB_PATH = Path(ROOT / "server" / "vcm.db")`，`VCM_SERVER_DB`
env 未设）。

**事实**：service 当前 silent 工作正常——`/api/projects` 通过
BasicAuth 后会正常返回项目列表。**没有** silent-broken。

**真正的风险**（不是现状，是未来某次）：
- 有人改 `VCM_SERVER_DB` 指向根 db，或 service 因 cwd / 路径变更误
  读根 db。
- 任何 ad-hoc Python 脚本直接 `sqlite3.connect('vcm.db')` 走到根 db，
  得到"看似健康"的 3 表 schema，缺 `projects` 时一切写操作报错。
- `init_db()` 现在**不**自检——CREATE TABLE IF NOT EXISTS 是幂等的，
  但如果 db 文件存在但 schema 损坏（人手改坏、SQLite 版本不兼容），
  service 不会拒绝启动，照常 silent-broken。

## 决策

### 1. `init_db()` 末尾加 PRAGMA 自检 + log 警告（不抛）

`server/dashboard.py` 的 `init_db()` 末尾增加：

```python
# ADR-0031: post-init self-check. Log ERROR on missing tables
# (do NOT raise — backward-compatible with services that started
# before this ADR; operators can decide to fix the db).
EXPECTED = {"projects", "states", "users", "tokens"}
present = {row["name"] for row in conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table'")}
missing = EXPECTED - present
if missing:
    log.error(
        "init_db: db at %s is missing expected tables: %s. "
        "Service will start but writes may fail. "
        "Run scripts/check_db_schema.py to diagnose.",
        DB_PATH, sorted(missing),
    )
else:
    log.info("init_db: %s OK (4/4 tables present)", DB_PATH)
```

约束：
- **不抛**：保持向后兼容；缺表只是 log ERROR，让运维看到。
- **不修改 db**：自检是只读，不重建任何表（重建由未来单独 ADR 决策）。
- **明确路径**：log 打印完整 DB 路径（不是 cwd 相对的），方便诊断。

### 2. 新建 `scripts/check_db_schema.py`

```python
#!/usr/bin/env python3
"""check_db_schema.py — ADR-0031: assert service db has 4 expected tables.

Exits 0 if all 4 tables present, 1 otherwise. Hooked into
routine_coverage.sh as the 7th check.
"""
import os, sys, sqlite3
from pathlib import Path

ROOT = Path(os.environ.get("VCM_ROOT", ".")).resolve()
DB = Path(os.environ.get("VCM_SERVER_DB", ROOT / "server" / "vcm.db"))

EXPECTED = {"projects", "states", "users", "tokens"}

def main():
    if not DB.exists():
        print(f"  ✗ DB file missing: {DB}")
        return 1
    conn = sqlite3.connect(str(DB))
    present = {row[0] for row in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    missing = EXPECTED - present
    extra = present - EXPECTED
    if missing:
        print(f"  ✗ DB {DB} missing tables: {sorted(missing)}")
        return 1
    print(f"  ✓ DB {DB} OK ({len(EXPECTED)}/4 tables present"
          + (f"; extras: {sorted(extra)}" if extra else "")
    return 0
```

约束：
- **路径真理源**：`VCM_SERVER_DB` env，与 `server/app.py:40` 和
  `server/dashboard.py:12` 的默认值一致。
- **不抛**：smoke 是只读探测。
- **extras 容忍**：项目表可能有其他表（如 audit_events），不报错，
  只 info 打印。

### 3. 钩进 `scripts/routine_coverage.sh`

`CHECKS` 数组里加 `"check_db_schema.py"`，放在 `"check_data_layout.py"`
之后（语义邻近）。

### 4. DB path 真理源文档化（**不删文件**，仅 grep + README 警告）

`scripts/routine_coverage.sh` 跑完后，新增一个 grep 自检：

```bash
# ADR-0031 §4: forbid accidental root-db creation.
ROOT_DIR="${VCM_ROOT:-$ROOT}"
hits=$(grep -rnE "sqlite3\.connect\(['\"]vcm\.db" \
       --include='*.py' --include='*.js' "$ROOT_DIR/bin" \
       "$ROOT_DIR/lib" "$ROOT_DIR/server" 2>/dev/null \
       | grep -v "server/vcm.db" | head -5)
if [ -n "$hits" ]; then
  echo "  ⚠ Found relative-path sqlite3.connect('vcm.db') calls:"
  echo "$hits"
  echo "  → Use VCM_SERVER_DB or absolute path to server/vcm.db"
fi
```

**只警告，不 fail**——避免误伤历史代码，让 owner 看见后人工改。

仓库根 `vcm.db`（孤儿文件）**不**在本 ADR 删除——owner 可在 review
时决定是用 `git rm` 加进 .gitignore、还是手动 `rm`。本 ADR 只保证
未来不再创建。

## 反对意见（self-argue）

- **Q: service 正常还要自检，是不是 paranoid？**  
  **A:** 不是。`init_db()` 加 3 行 `log.error` + 5 行 PRAGMA 是无
  成本防御。`check_db_schema.py` 加进 routine_coverage 让 7 个 hard
  check 锁住 DB 假设——这是 vcm 自己的"治理"。等真出事再补，违反
  Charter §1 治本。

- **Q: 为什么不直接抛 AssertionError？**  
  **A:** 抛出会让 service 在错误 db 下**拒启动**——这是 breaking
  change。v0.18.0 之前可能有人在用根 db（虽然 service 没读），
  突然抛出会让一些边缘场景失活。log ERROR + 7th check + future
  PR 决定什么时候 hard-fail——是渐进治理。

- **Q: grep 检查会不会太 strict？**  
  **A:** 是 warn-only（exit 0），不 fail。发现历史代码就走 review，
  不强加 deadline。

- **Q: 不删孤儿 db 文件，留着不脏吗？**  
  **A:** 留。删用户数据（即使是 orphan）违反 Charter §6。owner
  自己定。本 ADR 只保证未来不会再创建。

## 后果

### 正面

- service db 4 表假设被 7 hard check 锁住，未来 schema drift 会
  在 CI 阶段发现。
- `init_db()` 自检给运维一个早期信号：缺表 → journalctl ERROR +
  指向 `scripts/check_db_schema.py`。
- DB path 真理源（`VCM_SERVER_DB` env + 默认 `server/vcm.db`）
  被 grep 文档化，新人 grep 一下就懂。
- ADR-0030 §决策.8 的事实错误被**修正**——doc-level 治理债还掉。

### 负面 / 风险

- 启动时多打 1 行 log（negligible）。
- `check_db_schema.py` 跑得很快（<10ms sqlite open + query），不会拖
  CI。
- 7 个 check 而不是 6 个——commit message / 文档提及 hard check 数
  时要记得改。

## 验收

```bash
# 1. 7 hard check 全过（新增 check_db_schema.py）
bash scripts/routine_coverage.sh   # exit 0，最后一行应是 check_db_schema

# 2. service 自检 log 出现
journalctl --user -u vcm-server.service -n 50 --no-pager \
  | grep -E "init_db:.*OK|init_db:.*missing"
# → 应看到 "init_db: <path> OK (4/4 tables present)"

# 3. 模拟 db 损坏：删 service db，重启服务
mv server/vcm.db server/vcm.db.bak
systemctl --user restart vcm-server
sleep 2
sqlite3 server/vcm.db ".tables" | tr -s ' ' '\n' | sort -u \
  | grep -E "^(projects|states|users|tokens)$" | wc -l
# → 4（init_db() 重建）

# 4. grep 自检不报警（仓库内无 vcm.db 直接 connect）
bash scripts/routine_coverage.sh
# → 仓库内 grep vcm.db 应只命中 "server/vcm.db" / VCM_SERVER_DB
```

## 不做

- ❌ 不删仓库根 `vcm.db`（orphan）—— owner 自决
- ❌ 不改 DB_PATH 默认值（`server/vcm.db` 已是事实标准）
- ❌ 不引入新依赖（sqlite3 是 stdlib）
- ❌ 不把 `init_db()` 自检改成 throw（保持 backward-compat）
- ❌ 不在 `check_db_schema.py` 里自动重建表（重建是 destructive，需
  单独 ADR 决策）

## 参考

- [ADR-0030 §决策.8](0030-sidebar-and-multi-project.md) — 本 ADR 的
  触发点（误判纠正）
- [ADR-0025 persistent runtime](0025-persistent-vcm-server.md) — service
  启动顺序不需改
- [server/dashboard.py:524](../../server/dashboard.py) — `init_db()`
  当前实现
- [server/app.py:40](../../server/app.py) — `DB_PATH` 默认值
- [CHARTER §1 治本](../../CHARTER.md) — 防御性自检符合"治本"