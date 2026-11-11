import { fail } from "./domain.mjs";
const base = "https://api-m.sandbox.paypal.com";
export function createPayPal({ env = process.env, fetcher = fetch } = {}) {
  const client = env.PAYPAL_SANDBOX_CLIENT_ID,
    secret = env.PAYPAL_SANDBOX_CLIENT_SECRET;
  let token = null,
    tokenUntil = 0;
  const configured = Boolean(client && secret);
  async function request(
    path,
    { method = "GET", body, auth, headers = {} } = {},
  ) {
    if (!configured)
      fail(
        503,
        "PayPal sandbox is not configured. Add sandbox credentials on the server to create a real draft.",
      );
    if (
      !/^\/v[12]\/(?:oauth2\/token|invoicing\/(?:invoices(?:\/INV2-[A-Z0-9-]+)?|search-invoices)(?:\?page_size=100&total_required=true)?)$/.test(
        path,
      )
    )
      fail(500, "Unsupported PayPal operation.");
    let response;
    try {
      response = await fetcher(base + path, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: auth || "Bearer " + (await accessToken()),
          "Content-Type": auth
            ? "application/x-www-form-urlencoded"
            : "application/json",
          ...headers,
        },
        ...(body
          ? { body: typeof body === "string" ? body : JSON.stringify(body) }
          : {}),
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      const e = Error(
        "PayPal did not return a response. Reconcile this attempt before trying again.",
      );
      e.status = 502;
      e.uncertain = true;
      throw e;
    }
    const raw = await response.text();
    if (raw.length > 1_000_000)
      fail(502, "PayPal returned an oversized response.");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }
    if (!response.ok) {
      const e = Error(
        "PayPal sandbox rejected the request (" +
          response.status +
          "). " +
          String(data.name || "API_ERROR")
            .replace(/[^A-Z0-9_]/g, "")
            .slice(0, 80),
      );
      e.status = 502;
      e.uncertain = response.status >= 500;
      e.providerStatus = response.status;
      throw e;
    }
    return data;
  }
  async function accessToken() {
    if (token && Date.now() < tokenUntil) return token;
    const data = await request("/v1/oauth2/token", {
      method: "POST",
      body: "grant_type=client_credentials",
      auth: "Basic " + Buffer.from(client + ":" + secret).toString("base64"),
    });
    if (typeof data.access_token !== "string")
      fail(502, "PayPal sandbox did not provide an access token.");
    token = data.access_token;
    tokenUntil =
      Date.now() +
      Math.max(10, Math.min(Number(data.expires_in) || 300, 3600) - 30) * 1000;
    return token;
  }
  function invoiceId(data) {
    if (/^INV2-[A-Z0-9-]+$/.test(data?.id)) return data.id;
    try {
      const url = new URL(data?.href);
      if (
        url.origin === base &&
        /^\/v2\/invoicing\/invoices\/INV2-[A-Z0-9-]+$/.test(url.pathname)
      )
        return url.pathname.split("/").pop();
    } catch {}
    return null;
  }
  return {
    configured,
    merchantEmail: env.PAYPAL_SANDBOX_MERCHANT_EMAIL || "",
    async preflight() {
      await accessToken();
    },
    async create(payload) {
      const data = await request("/v2/invoicing/invoices", {
        method: "POST",
        body: payload,
        headers: { Prefer: "return=representation" },
      });
      const found = invoiceId(data);
      if (!found) {
        const e = Error(
          "PayPal created an invoice but returned no recognized identifier. Reconcile before continuing.",
        );
        e.uncertain = true;
        throw e;
      }
      return { id: found };
    },
    async get(id) {
      if (!/^INV2-[A-Z0-9-]+$/.test(id))
        fail(400, "Invalid invoice identifier.");
      return request("/v2/invoicing/invoices/" + id);
    },
    async search(number) {
      const data = await request(
        "/v2/invoicing/search-invoices?page_size=100&total_required=true",
        { method: "POST", body: { invoice_number: number } },
      );
      return (data.items || []).filter(
        (item) => item.detail?.invoice_number === number,
      );
    },
  };
}
