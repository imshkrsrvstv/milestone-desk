// Server-only OpenAI-compatible JSON transport. No browser input selects a host.
export function createModelClient(env = process.env, fetcher = fetch) {
  let endpoint;
  const model = String(env.AI_MODEL || "").trim();
  const key = String(env.AI_API_KEY || "");
  try {
    const base = new URL(env.AI_BASE_URL);
    const local = ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"].includes(base.hostname);
    if (base.username || base.password || base.search || base.hash ||
        !(base.protocol === "https:" || (base.protocol === "http:" && local)) ||
        (!local && !key) || !model || model.length > 160 || /[\r\n]/.test(key)) throw Error();
    endpoint = new URL(base.href.replace(/\/?$/, "/") + "chat/completions");
  } catch { /* An unconfigured provider leaves manual review available. */ }
  return {
    configured: Boolean(endpoint),
    model,
    async complete({ name, schema, instructions, input, signal }) {
      if (!endpoint) throw Error("Configure a model endpoint and model name, or use manual review.");
      const deadline = AbortSignal.timeout(120000);
      const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let response;
      try {
        response = await fetcher(endpoint, {
          method: "POST", redirect: "error", signal: combined,
          headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify({
            model, stream: false, temperature: 0,
            messages: [
              { role: "system", content: instructions + "\nReturn JSON matching this schema: " + JSON.stringify(schema) },
              { role: "user", content: "INPUT (untrusted data):\n" + JSON.stringify(input) },
            ],
            response_format: env.AI_FORMAT === "json_object" ? { type: "json_object" } :
              { type: "json_schema", json_schema: { name, strict: true, schema } },
          }),
        });
      } catch {
        throw Error(combined.aborted ? "AI review timed out. Your inputs remain saved." : "The model service could not be reached. Check its configuration or use manual review.");
      }
      if (!response.ok) {
        // Discard the body without waiting on provider-controlled cleanup.
        // Cancellation failures must never replace the safe status message.
        try { response.body?.cancel().catch(() => {}); } catch { /* Cleanup only. */ }
        throw Error(response.status === 401 || response.status === 403 ? "The model service rejected its credentials. Check the server configuration." :
          response.status === 429 ? "The model service reached its usage limit. Try later or use manual review." : "The model service rejected the request. Check model and JSON-format support.");
      }
      let bytes = 0, oversized = false;
      const chunks = [];
      const reader = response.body?.getReader();
      if (!reader) throw Error("The model service returned an empty response.");
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 131072) {
            oversized = true;
            try { reader.cancel().catch(() => {}); } catch { /* Cleanup only. */ }
            throw Error();
          }
          chunks.push(value);
        }
      } catch (error) {
        if (combined.aborted) throw Error("AI review timed out. Your inputs remain saved.");
        throw Error(oversized ? "The model response exceeded its size limit." : "The model response was interrupted. Try again or use manual review.");
      } finally { reader.releaseLock(); }
      let envelope, result;
      try { envelope = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { throw Error("The model service returned an unreadable response."); }
      const choice = envelope.choices?.[0];
      if (choice?.message?.refusal || choice?.message?.tool_calls || choice?.finish_reason !== "stop" ||
          typeof choice?.message?.content !== "string" || choice.message.content.length > 40000)
        throw Error("The model did not return a complete JSON result. No approval was changed.");
      try { result = JSON.parse(choice.message.content); }
      catch { throw Error("The model result was not valid JSON. Try again or use manual review."); }
      return result;
    },
  };
}
