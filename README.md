# Wallpaper Engine for Yomni

This plugin ports [modera-ai/plugin-wallpaper-engine](https://github.com/modera-ai/plugin-wallpaper-engine) to Yomni. It keeps the upstream wallpaper inventory, local media and live scene renderer, appearance controls, and settings UI. The host entry, manifest, build, and desktop integration use Yomni's plugin API.

## Develop

From this plugin directory:

```sh
npm install
npm run build
npm test
npm run typecheck
npm run pack
```

The packaged plugin is written under `release/plugin-npm/`. During development, `npm run dev` starts the adjacent `D:\pals\yomni` checkout with this plugin.

The plugin needs the trusted `yomni.host.inject` permission to draw behind Yomni's UI. A user can point it at a Wallpaper Engine Steam library with `YOMNI_WALLPAPER_STEAM_ROOT`; otherwise the upstream library discovery runs. Data is stored in Yomni's plugin storage directory.

## Source and license

Imported from upstream commit `88d67ec91b2a91857b2689681a0f8c44f8c89d99`. See [NOTICE](NOTICE) and [LICENSE](LICENSE) for attribution and terms. Internal upstream names and protocols are retained where changing them would break wallpaper or settings compatibility.
