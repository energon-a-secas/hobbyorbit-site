# Hobby Orbit

An installable hobby wheel and private, device-local journal. Zero build, browser
ES modules, no runtime npm dependencies or server. Port 8901. Domain:
`hobbyorbit.neorgon.com`.

## Work here

```bash
make serve
node --test tests/model.test.mjs
node scripts/build-offline.mjs
node scripts/build-offline.mjs --check
```

The offline asset list is generated and committed, not built by hosting. Run its
generator after changing any app file or asset. Service worker updates wait until
the user reloads; they must never clear personal data.

## Boundaries

- `data/catalog.json` is generated from the sibling Aficion site's catalog with
  `node scripts/build-catalog.mjs`. Aficion's source is read-only here.
- `js/model.js` owns mutations, with validation and observation helpers alongside.
- `js/state.js` owns the versioned local journal, recovery, and backups.
- `js/wheel.js` and its helpers own SVG geometry, selection, zoom, and spin.
- `js/render.js`, `js/events.js`, `js/dialogs.js`, and `js/ui-*.js` own UI.
- `js/pwa.js`, `sw.js`, `offline-assets.js` own installation and offline access.
- Fleet styles remain canonical CDN links and are cached for offline use. Never
  edit vendored `neorgon-*` files; update the kit and sync it.

## Invariants

A spin and a reorder never change current activity or create a journal entry.
Current activity, suggested activity, and the check-in draft are separate values.
Only explicit check-ins change current activity. Locking blocks a change of
activity, including rest, and allows repeated moods for the current hobby.
Deleted or renamed hobbies keep their historical snapshots. Empty history is
honest; never seed it with example personal records.

Never rename `hobbyorbit:state:v1` or silently overwrite malformed/future data.
Blocked/quota-limited storage has a persistent warning and an export path. Notes
are shared only after explicit opt-in and preview. No analytics is enabled.

Use text nodes for all user content, preserve drafts on unrelated renders, keep
`app.js` under 50 lines and site-owned JS modules under 500. The shared kit files
are exempt. Respect reduced motion and keep equivalent labeled controls for
small wheel sectors.
