import test from "node:test";
import assert from "node:assert/strict";
import { createModeraServer } from "../src/modera-server.js";

test("Yomni wallpaper server restricts origins and requires capability for writes", async () => {
  const controller = new AbortController();
  const server = await createModeraServer(controller.signal);
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
    const allowed = await fetch(url, { headers: { Origin: "null", "X-Modera-Wallpaper": server.capability } });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { preview: server.endpoint + "/wallpaper-engine/preview/x" });
    assert.equal(calls, 1);
    controller.abort();
    await assert.rejects(fetch(url));
  } finally {
    server.close();
  }
});
