import test from "node:test";
import assert from "node:assert/strict";
import { createYomniServer } from "../src/yomni-server.js";

test("native application origin can preflight and save wallpaper settings", async () => {
  const server = await createYomniServer(new AbortController().signal);
  const origin = "yomni-application://0123456789abcdef0123456789abcdef";
  server.register({ kind: "exact", path: "/wallpaper-engine/settings", handler(_req, res) { res.end("saved"); } });
  const url = server.endpoint + "/wallpaper-engine/settings";
  try {
    const preflight = await fetch(url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,x-yomni-wallpaper" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
    assert.equal((await fetch(url, { method: "PUT", headers: { Origin: origin }, body: "{}" })).status, 403);
    const saved = await fetch(url, { method: "PUT", headers: { Origin: origin, "X-Yomni-Wallpaper": server.capability }, body: "{}" });
    assert.equal(saved.status, 200);
    assert.equal(await saved.text(), "saved");
  } finally { server.close(); }
});

test("Yomni wallpaper server restricts origins and requires capability for writes", async () => {
  const controller = new AbortController();
  const server = await createYomniServer(controller.signal);
  let calls = 0;
  server.register({
    kind: "exact",
    path: "/wallpaper-engine/settings",
    handler(_req, res) {
      calls++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ preview: "/wallpaper-engine/preview/x" }));
    },
  });
  const url = server.endpoint + "/wallpaper-engine/settings";
  try {
    assert.equal((await fetch(url, { headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await fetch(url, { headers: { Origin: "null" } })).status, 403);
    assert.equal((await fetch(url, { method: "PUT", body: "{}" })).status, 403);
    const allowed = await fetch(url, { headers: { Origin: "null", "X-Yomni-Wallpaper": server.capability } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { preview: server.endpoint + "/wallpaper-engine/preview/x" });
    assert.equal(calls, 1);
    controller.abort();
    await assert.rejects(fetch(url));
  } finally {
    server.close();
  }
});
