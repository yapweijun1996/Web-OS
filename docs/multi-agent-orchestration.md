# Vortex OS - Multi-Agent Orchestration & Tool Use Specification

This document details the architectural design and communication contracts required to enable the background **OrchestratorAgent** inside `agent-core.js` to coordinate specialized sub-agents (e.g. Search and Scraper agents) and invoke host-side gateway tools like `web-search` and `url-reader`.

---

## 1. Multi-Agent Coordination Topology

To execute complex, autonomous research workflows, the system-level `OrchestratorAgent` delegates tasks to specialized, capability-gated sub-agents. This enforces the **Principle of Least Privilege** (中文解释: 最小特权原则) even within the agent runtime.

```
                  +--------------------------------+
                  |       OrchestratorAgent        |
                  | (Coordinator, Epic: VORTEX-104)|
                  +----------------┬---------------+
                                   |
           ┌───────────────────────┼───────────────────────┐
           v (Spawn)               v (Spawn)               v (Spawn)
+--------------------+   +--------------------+   +--------------------+
|    SearchAgent     |   |    ScraperAgent    |   |  SummarizerAgent   |
|                    |   |                    |   |                    |
| - Token:           |   | - Token:           |   | - Token:           |
|   "web-search"     |   |   "url-reader"     |   |   "fs:write"       |
+---------┬----------+   +---------┬----------+   +---------┬----------+
          |                        |                        |
          v (Invokes)              v (Invokes)              v (Invokes)
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│ web-search Gateway │   │ url-reader Gateway │   │ VFS Storage Engine │
│ (Tavily Search API)│   │ (Jina Scraper API) │   │ (JSONL.gz File)    │
└────────────────────┘   └────────────────────┘   └────────────────────┘
```

---

## 2. Capability Guard Isolation for Sub-Agents

Every spawned sub-agent is initialized with a distinct `CapabilitySet` containing only the specific capability tokens required for its task:

1. **`SearchAgent` (Research Explorer)**:
   - *Granted Token*: `"web-search"`
   - *Role*: Queries search engines, extracts relevant URLs, and filters search metadata.
2. **`ScraperAgent` (Content Gatherer)**:
   - *Granted Token*: `"url-reader"`
   - *Role*: Hits page reader endpoints and retrieves structured markdown/text from external pages.
3. **`SummarizerAgent` (Data Analyst)**:
   - *Granted Token*: `"fs:write:/reports"`, `"agent:orchestrate"`
   - *Role*: Feeds crawled data into the local LLM gateway proxy, consolidates findings, and writes the final `.jsonl.gz` report.

---

## 3. Tool Invocation Contracts inside Agent Core

Although agents run on the Host side, they are strictly prohibited from directly calling arbitrary network fetch requests. Instead, they must invoke helper methods that validate their own local `guard` against the specified action verb.

### A. Web Search Tool Request Contract

The `SearchAgent` invokes the search function as follows:

```javascript
// Inside SearchAgent definition (English Coding Only)
async function searchWeb(query) {
  // Validate token against internal capability guard
  const token = this.guard.request('web-search');
  
  const apiKey = localStorage.getItem('vortex_search_api_key');
  const endpoint = localStorage.getItem('vortex_search_endpoint') || 'https://api.tavily.com/search';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  
  const result = await response.json();
  return result.results; // Returns only the sanitized array of results
}
```

### B. URL Reader Tool Request Contract

The `ScraperAgent` invokes the scraper function as follows:

```javascript
// Inside ScraperAgent definition (English Coding Only)
async function fetchPageContent(targetUrl) {
  const token = this.guard.request('url-reader');
  
  const apiKey = localStorage.getItem('vortex_read_api_key');
  const endpoint = localStorage.getItem('vortex_read_endpoint') || 'https://r.jina.ai/';

  const response = await fetch(`${endpoint}${targetUrl}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  });
  
  return await response.text(); // Returns clean scraped markdown text
}
```

---

## 4. End-to-End Orchestrated Workflow Example

When the user types a research request (e.g. "Draft a summary on latest Wasm runtimes"):
1. **Trigger**: `SystemEventBus` triggers `SystemEvents.COMMAND_SEND` with the query.
2. **Dispatch**: `OrchestratorAgent` catches the event, spawns a `SearchAgent` to query Tavily for "latest Wasm runtimes".
3. **Scraping**: The orchestrator receives 5 relevant URLs from the search agent, and spawns `ScraperAgent` instances in parallel to grab their full page text.
4. **Synthesis**: The orchestrator passes the consolidated raw texts to a `SummarizerAgent`, which prompts the LLM Gateway to compile a executive summary.
5. **VFS Commit**: The summarizer writes the finalized report into `/reports/wasm-summary.jsonl` via `storageEngine.appendToGzFile()`.
