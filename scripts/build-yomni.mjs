import { createRequire } from "node:module";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireBuild = createRequire(join(root, "package.json"));
const { build } = requireBuild("esbuild");
const outputRoot = resolve(root, "dist");
if (!outputRoot.startsWith(root + sep))
  throw new Error("Build output escapes plugin workspace");
await rm(outputRoot, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [join(root, "scripts/build-client.mjs"), "--out", "dist/generated/client.js"],
  {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  },
);
await mkdir(join(root, "dist/ui"), { recursive: true });
await cp(join(root, "lib"), join(root, "dist/upstream"), {
  recursive: true,
  filter: (path) =>
    !path.endsWith(".md") && path !== join(root, "lib/client.js"),
});
await writeFile(
  join(root, "dist/upstream/package.json"),
  '{"type":"module"}\n',
);
// Runtime package reads are relative to lib/index.js, including the original release notices.
await cp(join(root, "package.json"), join(root, "dist/package.json"));
const client = await readFile(join(root, "dist/generated/client.js"), "utf8");
const factory = client.replace(
  "window.__ModuleLoader__.load({",
  "const plugin = load({",
);
await writeFile(
  join(root, "dist/generated/upstream-client.js"),
  `export function createUpstream(yomniHost, React, ReactDOM) {\nconst load = entry => entry.factory(id => { if (id === 'react') return React; if (id === 'react-dom') return ReactDOM; throw new Error('Unknown upstream dependency: ' + id); });\n${factory}\nreturn plugin;\n}\n`,
);
const html = await readFile(join(root, "lib/webwallgl/index.html"), "utf8");
const entry = html.match(
  /src="\/wallpaper-engine\/scene-live\/([^\"]+\.js)"/,
)[1];
const rendererPath = join(root, "lib/webwallgl", entry);
const originalRenderer = await readFile(rendererPath, "utf8");
const originCheck = "new URL(t,location.href).origin===location.origin";
if (!originalRenderer.includes(originCheck))
  throw new Error("Upstream web-origin adapter anchor changed");
// Our backend already injects the original WE shim. Load that HTTP document directly;
// a blob copy would inherit the parent's CSP and block the wallpaper's own scripts.
const diagnosticsOrigin = "new URL(e.mediaBase,window.location.href).origin";
const webSandbox = 's.setAttribute("sandbox",i.strictSandbox?';
if (
  !originalRenderer.includes(diagnosticsOrigin) ||
  !originalRenderer.includes(webSandbox)
)
  throw new Error("Upstream media adapter anchors changed");
const adaptedRenderer = originalRenderer
  .replace(
    originCheck,
    "new URL(t,location.href).origin===new URL(globalThis.__yomniWallpaperOrigin).origin",
  )
  .replaceAll(diagnosticsOrigin, "globalThis.__yomniWallpaperOrigin")
  .replace(webSandbox, 's.setAttribute("allow","autoplay");' + webSandbox);
const renderer = await build({
  stdin: {
    contents: adaptedRenderer,
    resolveDir: dirname(rendererPath),
    sourcefile: rendererPath,
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
  minify: true,
  define: {
    "location.search": "globalThis.__yomniWallpaperSearch",
    "location.origin": "globalThis.__yomniWallpaperOrigin",
  },
  logLevel: "silent",
});
await writeFile(
  join(root, "dist/upstream/webwallgl/assets/yomni-renderer.js"),
  renderer.outputFiles[0].text,
);
await build({
  entryPoints: [join(root, "host-ui/host.js")],
  outfile: join(root, "dist/ui/host.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  minify: true,
  nodePaths: [dirname(requireBuild.resolve("react/package.json")) + "/.."],
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});
const { THEME_TYPE_ROLES } = await import(
  new URL("../src/font/typography.js", import.meta.url)
);
const roleTokens = THEME_TYPE_ROLES.map((role) => {
  const token = "--dsw-font-" + role.id;
  return `${token}-font-size:${role.defaultPx}px;${token}-line-height:1.6;${token}-font-weight:${role.prefix || 400};${token}-font-family:var(--dsw-font-family);${token}:var(${token}-font-weight) var(${token}-font-size)/var(${token}-line-height) var(${token}-font-family);`;
}).join("\n");
await writeFile(
  join(root, "dist/ui/host.css"),
  (await readFile(join(root, "host-ui/host.css"), "utf8")) +
    `\nbody[data-yomni-wallpaper]{${roleTokens}}\n`,
);
await cp(join(root, "host-ui/index.html"), join(root, "dist/ui/index.html"));
await rm(join(outputRoot, "generated"), { recursive: true, force: true });
