# Vortex OS - Host-Side Gateway Proxy Routing Specification

This document details the software specifications, endpoint payload structures, and message-passing protocols required to implement Host-Side Gateway Proxy Routing for `web-search` and `url-reader` actions inside `host-core.js`.

---

## 1. Gateway Security Contract

To prevent credentials leakage, the following rules are enforced inside the host gateway router:
- **No Token Downpass**: Under no circumstances should the Host return headers, raw response structures containing credentials, or endpoint configuration variables to the requesting iframe.
- **Strict Payload Sanitation**: Before relaying the API response back to the sandboxed app, the Host strips out all network-level headers and returns only the finalized JSON or markdown string payload.

---

## 2. Web Search API Routing (`web-search`)

When a sandboxed plugin triggers a web search request, the routing pipeline executes as follows:

### A. IPC Message Signature
The sandboxed iframe posts the following message over the `MessagePort`:
```json
{
  "action": "web-search",
  "token": "web-search",
  "payload": {
    "query": "Latest web operating systems in 2026"
  }
}
```

### B. Host-Side Execution Logic
1. **Verification**: The Host verifies that the plugin’s manifest declared the `"web-search"` permission token.
2. **Credential Loading**: Loads `vortex_search_api_key` and `vortex_search_endpoint` from the host's local storage.
3. **HTTP Fetch**:
   - Executes a POST fetch to the search endpoint (e.g. Tavily Search).
   - Appends the private API key to the request headers:
     ```http
     Authorization: Bearer <vortex_search_api_key>
     Content-Type: application/json
     ```
   - Passes the payload body containing the query parameters.
4. **Relay Response**: Once the external server responds, the Host extracts the search results array (e.g., list of `{ title, url, content }`), filters out tracking headers, and posts the sanitized result back to the iframe.

---

## 3. Web Page Scraping Routing (`url-reader`)

When a sandboxed plugin requests the full text content of an external web link, the scraping pipeline executes as follows:

### A. IPC Message Signature
The sandboxed iframe posts the following message over the `MessagePort`:
```json
{
  "action": "url-reader",
  "token": "url-reader",
  "payload": {
    "url": "https://en.wikipedia.org/wiki/Web_desktop"
  }
}
```

### B. Host-Side Execution Logic
1. **Verification**: Checks that the plugin’s manifest declared the `"url-reader"` permission token.
2. **Credential Loading**: Loads `vortex_read_api_key` and `vortex_read_endpoint` (defaulting to a Jina Reader endpoint such as `https://r.jina.ai/`).
3. **HTTP Fetch**:
   - Executes a GET request to the reader URL: `${readerEndpoint}/${targetUrl}`.
   - Appends the scraping API key to the headers:
     ```http
     Authorization: Bearer <vortex_read_api_key>
     ```
4. **Relay Response**: Extracts the formatted text or markdown content returned by the reader, sanitizes potential HTML injections, and relays the text cleanly back to the iframe.
