/* IDrive api.js — fetch client with bearer token and uniform errors. */
(() => {
"use strict";
const TOKEN_KEY = "idrive-auth";
const Api = {
  token() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } },
  setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} },

  async req(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    const tok = Api.token();
    if (tok) headers["Authorization"] = "Bearer " + tok;
    let res;
    try {
      res = await fetch(path, {
        method: opts.method || "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      const err = new Error("network error");
      err.code = "network";
      throw err;
    }
    if (res.status === 401) {
      const err = new Error("authentication required");
      err.code = "auth_required";
      err.status = 401;
      throw err;
    }
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("json") ? await res.json() : null;
    if (!res.ok) {
      const detail = data && data.detail;
      const err = new Error(typeof detail === "string" ? detail : (detail && detail.detail) || "request failed");
      err.code = (detail && detail.code) || (data && data.code) || "error";
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  get(path) { return Api.req(path); },
  post(path, body) { return Api.req(path, { method: "POST", body: body || {} }); },
  put(path, body) { return Api.req(path, { method: "PUT", body: body || {} }); },
};
window.Api = Api;
})();
