# ADR-0007 — Live dashboard via Server-Sent Events

**状态**: 待实施（v0.4.0）
**日期**: 2026-08-21
**作者**: mm7 / pi

## 背景

v0.3.0 cockpit 在浏览器里定时轮询 `/api/dashboard/...`，但 5 个端点各自 fetch 一遍。 当状态频繁变化（CI 失败、`vcm push`）时，用户看到的列表 stale ~10s。Repowise 的 `Live banner` + `progress + log stream` 是这类「实时」信号的范例。

WebSocket 是常见选择，但 SSE 有 3 个对当前场景更优的特性：
1. Flask stdlib 不需要第三方包（uvicorn-only 场景需要 webhook；Flask 也只需 flask>=2.0 已支持 `Response(..., mimetype="text/event-stream")`）。
2. 单向推送 = vcm 永远 push 不到 client（我们是只读 dashboard），无双向复杂度。
3. HTTP/2 多路复用下 SSE 比 WS 更轻量。

## 决策

新增 `/api/dashboard/stream` 端点，**SSE** 发送以下事件：

```
event: project_push
data: {"name":"alpha","at":"2026-08-21T..."}

event: attention_changed
data: {"items":[...]}

event: heartbeat
data: {"ts":"..."}
```

客户端用 `EventSource('api/dashboard/stream')` 订阅。Alpine.js 加个 `Alpine.data('stream', ...)` 包装，监听 event 实时更新 reactive state。

### 节流

- `project_push`: server 每收到一次 POST `/api/collect` 推送。**不节流**——push 频率本身低。
- `attention_changed`: 每 30s 推送一次（避免噪声）。
- `heartbeat`: 每 15s，确保 link alive（穿过 corporate proxy）。

### 反对意见

- **Q: 不用 WebSocket？  
  **A: WebSocket 是 overkill。SSE 已经在主流浏览器、curl、httpie 上原生工作，且单向是这个场景 natural shape。
- **Q: 不用 long-polling？  
  **A: SSE = long-polling + 标准，`EventSource` API 比 `setTimeout`+`fetch` 简洁。
- **Q: 加 WebSocket server 影响 security？  
  **A: SSE 走 HTTP，与 ADR-0004 BasicAuth 同一层（`/api/*`）。新加 `/api/dashboard/stream`，auth 规则一致。

### 后果

#### 正面

- 跨 tab / 跨 user 实时同步
- 不引入 Python async；Flask `Response` + `yield` 一个 generator 就够
- 浏览器天然支持 reconnect（`EventSource` 自动）

#### 负面 / 风险

- SSE 占用一个 connection。每个 browser tab 1 个。办公室 10 个 tab = 10 没事。1000 个 tab 要反向代理缓冲。这是 v0.5.0+ 议题。
- Flask dev server 单线程，多 connection 要 tune `app.run(threaded=True)`。**生产**：gunicorn `--worker-class=gthread`。

### 验收

```bash
curl -N http://127.0.0.1:7338/api/dashboard/stream  # -N 不缓冲
# 等 5s,看到 "heartbeat" event
```

### 不做

- ❌ WebSocket (over spec)
- ❌ Multi-server fanout（v0.5.0+）
- ❌ Presence / typing indicator（纯客户端）
- ❌ Backpressure / event coalescing

## 参考

- [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [Flask SSE 2.0+ support](https://flask.palletsprojects.com/en/3.0.x/patterns/streaming/)
- [ADR-0004](0004-basicauth.md) — auth 一致
