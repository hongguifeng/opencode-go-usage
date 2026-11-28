# OpenCode Go 用量

在输入框下方的 composer 区域 —— 也就是上下文环（context meter）所在那一行 —— 加一个小胶囊。**默认只显示本月已用额度**，点击展开气泡查看全部窗口：

```
… 42%   ● 已用 41%        ← 收起：只显示本月已用百分比
        ↑ 宿主上下文环   ↑ 本插件
```

点开后（气泡）：

```
5 小时窗口   已用 3%
             剩 97%                  2h59m 后
本周         已用 8%
             剩 92%       11月30日 08:00 重置 · 3 天后
本月         已用 41%
             剩 59%         12月5日 00:47 重置 · 8 天后
更新于 08:59:12                      ↻ 刷新
```

气泡里每一行都以已用百分比为主，行下方补上该窗口的剩余百分比；进度条同样按已用比例填充。

气泡向上弹出、贴齐胶囊、随窗口尺寸与滚动重新定位，点击外部或按 Esc 关闭；它 portal 到 `document.body`，因此不会被输入卡片的叠层裁掉。该槽位是会话级的：只在打开会话时出现，和上下文环同一行居中排列。

## 数据来源

Host 侧轮询 OpenCode Go 推理网关的公开用量接口：

```
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <OPENCODE_GO_API_KEY>
```

响应中的 `usage.rolling / weekly / monthly` 各带 `status`、`percent`、`resetsAt`。插件只把百分比与重置时间送到页面，API Key 始终留在 Host 进程内。

快照里附带一个 `reads` 计数（页面读取次数），用来确认页面是否正在轮询。

API Key 按以下顺序解析：

1. 插件配置里的 `apiKey`（可选，不推荐，会把密钥写进配置）；
2. 当前 profile 凭据库中的 `OPENCODE_GO_API_KEY`（与 `opencode-go` 模型 provider 用的是同一个引用，密钥轮换后下一次轮询自动生效）；
3. 进程环境变量 `OPENCODE_GO_API_KEY`。

## 刷新时机

- Host 每 30 秒轮询一次，页面每 15 秒读一次缓存快照；
- 页面隐藏时暂停读取，重新可见时立即读取；
- 每个回合结束时（`agent/status` 变为 `idle`）追加一次刷新，带 5 秒冷却，避免请求风暴；
- 点击状态栏右侧的 ↻ 立即刷新（`?force=1`）。

## 配置

在 profile 的 `cordis.patch.yml` 里覆盖 `opencode-go-usage` 这一行即可，例如：

```yaml
- id: opencode-go-usage
  config:
    credentialRef: OPENCODE_GO_API_KEY
    refreshIntervalMs: 15000
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `credentialRef` | `OPENCODE_GO_API_KEY` | 凭据库中的键名 |
| `apiKey` | 无 | 直接指定 Key，优先级最高 |
| `endpoint` | `https://opencode.ai/zen/go/v1/usage` | 用量接口 |
| `refreshIntervalMs` | `30000` | Host 轮询间隔，最小 10000 |
| `minimumIntervalMs` | `5000` | 两次轮询的最小间隔（含页面触发的刷新） |
| `timeoutMs` | `10000` | 单次请求超时 |

## 状态

| 显示 | 含义 |
| --- | --- |
| 三段进度条 | 正常，颜色在 ≥60% 变黄、≥85% 变红 |
| 已限流 | 该窗口已触发限流（`status: rate-limited`） |
| 未配置 OPENCODE_GO_API_KEY | 凭据库里没有这个键 |
| API Key 无效 | 网关返回 401 |
| 未订阅 Go 套餐 | 网关返回 403 |
| 用量插件未连接 | 页面找不到 Host 路由（插件被禁用或 Host 未运行） |

## 组成

- `index.js` —— Host 半：轮询、缓存、`/opencode-go-usage/state` 只读路由；
- `client.js` —— Client 半：填充 `conversation.composer.dock` 槽位（输入框下方、上下文环同行）、本地化文案、15 秒轮询；
- `cordis.patch.yml` —— 插入插件行及其默认配置；
- `locale/*.json`、`icon.svg` —— 插件管理器中显示的名称、描述与图标。
