// Shared state for the A7 Jobs list.
// GET  /api/list                 -> current state
// POST /api/list {changes:{...}} -> merge changed fields (last write wins per field)
// POST /api/list {reset:true}    -> start a new, empty list
//
// Optional: set an ACCESS_CODE environment variable in Netlify to require a shared code.

import { getStore } from "@netlify/blobs";

const DAY = 24 * 60 * 60 * 1000; // list lives 24h from first edit
const KEY = "current";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function clean(v) {
  if (Array.isArray(v)) return v.slice(0, 40).map((x) => String(x).slice(0, 60));
  return String(v ?? "").slice(0, 2000);
}

export default async (req) => {
  const code = Netlify.env.get("ACCESS_CODE");
  if (code && req.headers.get("x-access-code") !== code) {
    return json({ error: "auth" }, 401);
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "method" }, 405);
  }

  const store = getStore({ name: "a7-jobs-list", consistency: "strong" });
  const now = Date.now();
  let state = (await store.get(KEY, { type: "json" })) || { startedAt: null, fields: {} };

  // 24h expiry
  if (state.startedAt && now - state.startedAt > DAY) {
    state = { startedAt: null, fields: {} };
  }

  if (req.method === "POST") {
    let body = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }

    if (body.reset) {
      state = { startedAt: null, fields: {} };
    } else {
      const changes = body.changes || {};
      const keys = Object.keys(changes).slice(0, 600);
      if (keys.length && !state.startedAt) state.startedAt = now; // autosave clock starts at first edit
      for (const k of keys) {
        if (!/^[A-Za-z0-9]+\|[A-Za-z]+$/.test(k)) continue;
        state.fields[k] = { v: clean(changes[k]), t: now };
      }
    }
    await store.setJSON(KEY, state);
  }

  return json({ ...state, now });
};

export const config = { path: "/api/list" };
