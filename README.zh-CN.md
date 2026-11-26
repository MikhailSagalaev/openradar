# openradar

<p align="right"><a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <b>简体中文</b></p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-white.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-black.png">
    <img alt="openradar" src="assets/logo-black.png" width="360">
  </picture>
</p>

<p align="center">
  <a href="https://openradar.fun"><img src="https://img.shields.io/badge/live-openradar.fun-10b981.svg" alt="Live hub: openradar.fun"></a>
  <a href="docs/stories.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FMikhailSagalaev%2Fopenradar%2Fmain%2Fdocs%2Fstories.json&query=%24.count&label=%F0%9F%8E%89%20found%20work%20through%20openradar&suffix=%20on%20the%20record&color=2ea44f" alt="Stories of work found through openradar"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-blue.svg" alt="License: AGPL v3"></a>
  <a href="docs/PROTOCOL.md"><img src="https://img.shields.io/badge/protocol-radar%2F2-purple.svg" alt="Protocol: radar/2"></a>
  <a href="https://glama.ai/mcp/servers/MikhailSagalaev/openradar"><img src="https://glama.ai/mcp/servers/MikhailSagalaev/openradar/badges/score.svg" alt="MikhailSagalaev/openradar MCP server"></a>
</p>

**openradar** 是一个开源的 IT、数字与创意产业职位及自由职业订单聚合库。解析器、自托管节点与开发者从招聘板、企业官网 ATS、RSS、Telegram 频道及邮件订阅采集职位与外包需求；中心枢纽通过 MinHash LSH 去重，维护统一、干净的实时数据流。

求职者与自由职业者不应为“订阅信息源”或“查看联系方式”付费。openradar 没有收费墙：联系方式保留在原帖中，你直接联系需求方；任何人都可以在本地或服务器上运行自己的节点。

**在线站点：** [openradar.fun](https://openradar.fun) · **API 文档：** [openradar.fun/docs](https://openradar.fun/docs) · **插件仓库：** [openradar-plugin](https://github.com/MikhailSagalaev/openradar-plugin)

---

## 核心特性

- **去重实时职位与自由职业订单流：** 覆盖远程技术岗位（We Work Remotely、Jobicy、RemoteOK、Hacker News、Greenhouse/Lever/Ashby/Workable 等 ATS）以及俄语与国际自由职业订单和 Telegram 频道，相同帖子自动合并为一条线索。
- **0–100 质量评分与薪资校准：** 结合薪资/预算明确度、技能清单、岗位细节与直接联系方式自动评分；明显低于同岗位行情的报价会自动标记「check the salary」，过滤垃圾广告与低质引流贴。
- **可引用的劳动力市场研究与开放数据集（CC BY 4.0）：** [openradar.fun/research](https://openradar.fun/research) 按岗位、职级、语言与城市统计真实挂牌薪资的分位数（p25 / 中位数 / p75），提供明瑟回归（Mincer OLS）与方差分解报告；支持每日 CSV（[/research/dataset.csv](https://openradar.fun/research/dataset.csv)）与完整 JSON 下载。
- **零门槛 MCP 接入（无需 API Key）：** 远程 Streamable HTTP 端点 `https://openradar.fun/mcp`，开放 `search_leads`、`get_lead_details`、`estimate_compensation`、`get_market_analytics`、`xray_generate_dorks` 等只读检索工具，以及带个人令牌的 `submit_lead`、`vote_lead`、`save_search`。
- **生产级 DeepSeek / Qwen 提取管道：** 内置 OpenAI 兼容 LLM 分类与薪资提取流水线（默认即支持 DeepSeek、Qwen3 等大模型与本地 Ollama / LM Studio）。
- **可自托管节点与 `radar/2` 签名协议：** 基于 Node.js 24 + PostgreSQL 18（支持 ParadeDB BM25 + pgvector）运行私人订阅节点，并可通过 BIP-340 Schnorr 签名向网络贡献新线索以解锁零延迟实时数据流。

---

## 快速连接 MCP（支持 Claude / Cursor / Qwen Code / Kimi CLI / Trae / Gemini CLI / OpenCode）

所有兼容 MCP 的客户端均连接同一远程端点 `https://openradar.fun/mcp`（Guest 只读模式开箱即用，访客流有 12 小时延迟且隐去私人联系方式，每条记录保留原始链接）。如需写入或按账号延迟读取，可在 [openradar.fun/me](https://openradar.fun/me) 签发个人 `mcp_…` 令牌并加入请求头 `Authorization: Bearer mcp_…`。

**Claude Code：**

```bash
claude mcp add --transport http openradar https://openradar.fun/mcp
```

**Qwen Code（`~/.qwen/settings.json`）/ iFlow CLI（`~/.iflow/settings.json`）/ Gemini CLI（`~/.gemini/settings.json`）：**

```json
{
  "mcpServers": {
    "openradar": {
      "httpUrl": "https://openradar.fun/mcp",
      "timeout": 30000
    }
  }
}
```

Gemini CLI 也可直接一键安装扩展：

```bash
gemini extensions install https://github.com/MikhailSagalaev/openradar
```

**Cursor（`~/.cursor/mcp.json`）/ Kimi CLI：**

```json
{ "mcpServers": { "openradar": { "url": "https://openradar.fun/mcp" } } }
```

**OpenCode（`opencode.json`）：**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "openradar": {
      "type": "remote",
      "url": "https://openradar.fun/mcp",
      "enabled": true
    }
  }
}
```

**Trae：** 设置 → MCP → 添加远程服务器（Streamable HTTP），填入 `https://openradar.fun/mcp`。

---

## 本地或 Docker 运行私有节点

需要 Node.js 22.19+（推荐 24 LTS）和 pnpm 12+：

```bash
git clone https://github.com/MikhailSagalaev/openradar.git
cd openradar
pnpm install
pnpm dev serve
```

如需持久化部署（PostgreSQL 18 + ParadeDB BM25）：

```bash
pnpm init:env
docker compose run --rm radar migrate
docker compose up -d
```

更多文档索引请参阅 [docs/README.md](docs/README.md) 与英文主说明 [README.md](README.md)。

## 开源协议

本项目基于 **AGPL-3.0** 协议开源，详见 [LICENSE](LICENSE)。研究报告与 `/research/dataset.csv` 采用 **CC BY 4.0** 开放许可。
