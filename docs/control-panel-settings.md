# Vortex OS - Control Panel & API Key Management Design Specification

This document details the architectural study, secure storage strategies, and gateway routing models required to expand the Vortex OS **Control Panel (Settings)** to support user-configured API keys for LLM providers, Knowledge Bases, Web Search engines, and Web Scraping scrapers.

---

## 1. The Core Dilemma: Security vs. Utility

In a browser-based, client-side operating system:
- **Utility Requirement**: In-browser AI Agents and sandboxed plugins need to make requests to LLM engines (OpenAI/Anthropic), Web Search endpoints (Tavily/Serper), Scrapers (Jina/Firecrawl), and Knowledge Bases (KB-MCP).
- **Security Constraint**: Exposing raw API keys directly to sandboxed `<iframe>` plugins (which may be loaded from untrusted third-party URLs) creates a catastrophic security vulnerability. If a plugin is compromised, it can easily harvest all of the user's secret keys.

---

## 2. The Solution: Secure Host-Gateway Proxy Model

To bridge this security gap, Vortex OS implements a **Secure Host-Gateway Proxy (SHGP)** model:

```
┌─────────────────────────────────────────────────────────┐
│                      Vortex Host OS                     │
│                                                         │
│   ┌────────────────────┐       ┌────────────────────┐   │
│   │   Settings Panel   │──────>│ LocalStorage       │   │
│   │   (UI Inputs)      │       │ (Encrypted Keys)   │   │
│   └────────────────────┘       └─────────┬──────────┘   │
│                                          │              │
│                                          v              │
│   ┌────────────────────┐       ┌────────────────────┐   │
│   │ Sandboxed Plugin   │──────>│ Host Kernel Gateway│   │
│   │ (Request: Search)  │  IPC  │ (Attaches Secret   │   │
│   │                    │       │  & Executes Fetch) │   │
│   └────────────────────┘       └─────────┬──────────┘   │
└──────────────────────────────────────────┼──────────────┘
                                           │ (CORS Authorized Fetch)
                                           v
                               ┌──────────────────────────┐
                               │  External Search Engine  │
                               │  (Tavily / Serper API)   │
                               └──────────────────────────┘
```

### The Architectural Rules of SHGP:
1. **Host-Only Storage**: Raw API keys and endpoint domains are written and read **only** by the parent Host script. They are never serialized or passed to the sandboxed iframes.
2. **Encrypted LocalStorage**: Values are stored in `localStorage` using basic obfuscation or local web cryptography APIs (`WebCrypto`) keyed to a user-generated master pin.
3. **IPC Capability Gate**: When an app needs to invoke an LLM, crawl a URL, or perform a search, it posts a structured message containing only the query or payload (e.g. `{ action: 'llm:chat', payload: { prompt: '...' } }`) accompanied by its authorized permission token.
4. **Header Attachment**: The Host intercepts the IPC call, validates the token against the manifest, loads the API key from local storage, appends it to the HTTP Headers of a host-initiated `fetch()`, and returns only the final parsed payload.

---

## 3. Configuration Schema & Storage Registry

The Control Panel maps user inputs directly into the following local registry fields:

| Registry Key | Config Target | Typical Form Field / Label | Default Fallback / Placeholder | (中文解释) |
| :--- | :--- | :--- | :--- | :--- |
| `vortex_llm_provider` | LLM Gateway | Provider (OpenAI / Anthropic / Custom) | `openai` | (中文解释: 大模型提供商) |
| `vortex_llm_api_key` | LLM Key | OpenAI/Anthropic API Key | `sk-proj-...` | (中文解释: 大模型密钥) |
| `vortex_llm_endpoint` | LLM URL | Base URL Endpoint | `https://api.openai.com/v1` | (中文解释: 大模型端点) |
| `vortex_kb_api_key` | KB Key | KB-MCP Authorization Token | `Bearer ...` | (中文解释: 知识库密钥) |
| `vortex_kb_id` | KB ID | Target KB UUID | `ef046646-...` | (中文解释: 知识库标识) |
| `vortex_search_api_key` | Search Key | Web Search API Key (Tavily/Serper) | `tvly-...` | (中文解释: 网页搜索密钥) |
| `vortex_search_endpoint` | Search URL | Search Provider API Endpoint | `https://api.tavily.com/search` | (中文解释: 网页搜索端点) |
| `vortex_read_api_key` | Reader Key | ReadURL Scraper API Key (Jina/Firecrawl) | `jina-...` | (中文解释: 网页抓取密钥) |
| `vortex_read_endpoint` | Reader URL | Scraper API Endpoint | `https://r.jina.ai` | (中文解释: 网页抓取端点) |

---

## 4. UI/UX Panel Layout & User Flow

The Settings Panel is designed as a tabbed dialog with three distinct sub-sections:

- **Tab 1: Workspace & Proxy**:
  - Sets the CORS Proxy URL (for plugin installations).
  - Toggles between Desktop layouts and active wallpapers.
- **Tab 2: AI & LLM Engine**:
  - Dropdown to select provider (OpenAI / Claude / Local Ollama).
  - Encrypted Password input field for the API Key.
  - Input field to customize the API gateway route (enabling local hosting).
- **Tab 3: Search & Scraping (Orchestration Tools)**:
  - Settings for Web Search (Tavily API Key and endpoint).
  - Settings for Page Scraper (Jina Reader endpoint).
- **Tab 4: Knowledge Base (KB-MCP)**:
  - KB-ID and target project document store access credentials.

### Current KB-MCP Settings Implementation

The current Settings modal implements the KB-MCP subsection directly:

- `KB ID` writes `vortex_kb_id`.
- `KB API Key` writes `vortex_kb_api_key` only when the input is non-empty.
- Reopening Settings clears the API key input and shows only key presence, never the raw saved key.
- `Check KB` validates local configuration first, then calls the host `KBProxy` health path and reports missing-key, missing-KB, pass, or request-failed states.

Security note: the current browser implementation hides the saved key from the UI but still stores it in `localStorage`; it is not encrypted at rest yet. Sandboxed plugins never receive the raw key and must go through the host IPC capability gate.
