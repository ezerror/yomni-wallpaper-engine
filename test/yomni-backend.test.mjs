import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import plugin from "../dist/index.cjs";

test("Yomni activates the wallpaper service and preserves upstream media routes", async () => {
  const storagePath = await mkdtemp(join(tmpdir(), "yomni-wallpaper-"));
  const resourcePath = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifest = JSON.parse(await readFile(join(resourcePath, "yomni-manifest.json"), "utf8"));
  assert.ok(!manifest.extensions.includes("yomni.window.overlay"));
  process.env.YOMNI_WALLPAPER_STEAM_ROOT = join(storagePath, "empty-steam");
  const controller = new AbortController();
  const activate = async () => {
    const contributions = await plugin.activate({
      storagePath,
      resourcePath,
      signal: controller.signal,
    });
    assert.deepEqual(manifest.declarations.provides.ui.map(({ id, slot }) => ({ id, slot })),
      contributions.ui.map(({ id, slot }) => ({ id, slot })));
    assert.equal(contributions.ui[0].id, "yomni.wallpaper-engine.connection");
    assert.equal(contributions.ui[0].slot, "yomni.ui.panel");
    assert.equal(contributions.ui[0].launcher, undefined);
    return (await contributions.ui[0].render()).data;
  };
  const connection = await activate();
  const request = (path, options = {}) =>
    fetch(connection.endpoint + "/wallpaper-engine" + path, {
      ...options,
      headers: {
        "X-Yomni-Wallpaper": connection.capability,
        ...options.headers,
      },
    });
  try {
    assert.equal((await request("/settings")).status, 200);
    assert.equal((await request("/inventory")).status, 200);
    const put = await request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blur: 17, playbackRate: 1.5 }),
    });
    assert.equal(put.status, 200);
    assert.equal(JSON.parse(await readFile(join(storagePath, "config.json"), "utf8")).settings.blur, 17);
    const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
    const upload = await request("/upload?title=Integration", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: image,
    });
    assert.equal(upload.status, 200);
    const uploaded = await upload.json();
    const inventory = await (await request("/inventory")).json();
    const item = inventory.wallpapers.find((entry) => entry.id === uploaded.id);
    assert.ok(item?.media.startsWith(connection.endpoint));
    const range = await fetch(item.media, {
      headers: { Range: "bytes=0-7", "X-Yomni-Wallpaper": connection.capability },
    });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), image.subarray(0, 8));
    const renderer = await request("/scene-live/assets/yomni-renderer.js");
    assert.equal(renderer.status, 200);
    assert.ok((await renderer.text()).includes("__yomniWallpaperSearch"));
    const oldUrl = connection.endpoint;
    await plugin.deactivate();
    await assert.rejects(fetch(oldUrl + "/wallpaper-engine/settings"));
    assert.equal(JSON.parse(await readFile(join(storagePath, "config.json"), "utf8")).settings.blur, 17);
  } finally {
    controller.abort();
    await plugin.deactivate();
  }
});
