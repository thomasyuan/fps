# Strike Zone

A single-file three.js wave-survival FPS. No build step, no dependencies to install:
`index.html` contains the whole game and pulls three.js from a CDN (jsDelivr, then
unpkg, then esm.sh).

Play: https://thomasyuan.github.io/fps/ (mirror: https://www.cppcoder.net/fps/)
Version history: https://thomasyuan.github.io/fps/versions/

## Layout

```
index.html              the current build (this is what GitHub Pages serves at the site root)
versions/index.html     version history: what each release added, with a play link per release
versions/v<id>/         frozen snapshots, every one still playable
versions.json           release manifest the history page is generated from
test/                   headless test suite (mock DOM + mock three.js, no browser needed)
tools/build-hub.mjs     regenerates versions/index.html from versions.json
tools/release.mjs       snapshot + test + commit + tag in one step
```

## Controls

The same file runs on PC and on phones/tablets. The device is detected at load
time (coarse pointer, `ontouchstart`, `maxTouchPoints`); touch screens get an
on-screen control layer, pointer lock is skipped, and the renderer drops
shadows, antialiasing and the particle/debris budget so it holds a playable
frame rate.

**Touch**

| Action | Control |
| --- | --- |
| Move / sprint | left thumb stick (push to the edge to sprint) |
| Look / aim | drag anywhere on the right side |
| Fire | `FIRE` (hold) |
| Aim down sights | `AIM` (tap to toggle) |
| Reload / jump / crouch | `RELOAD` / `JUMP` / `CROUCH` (toggle) |
| Melee / grenade | `MELEE` / `FRAG` |
| Lean around cover | `< LEAN` / `LEAN >` (hold) |
| Swap weapon / pause | `GUN` / `II` |

Landscape is recommended; a rotate prompt appears in portrait. HUD panels
reflow for small screens and respect safe-area insets.

**Keyboard and mouse**

| Action | Keys |
| --- | --- |
| Move / look | `W` `A` `S` `D` + mouse |
| Fire | left mouse |
| Aim down sights | hold right mouse |
| Lean left / right | `Q` / `E` |
| Melee / backstab | `V` or `F` |
| Reload | `R` |
| Sprint / jump / crouch | `Shift` / `Space` / `Ctrl` or `C` |
| Grenade | `G` |
| Weapons | `1` `2` `3` |
| Pause / mute | `Esc` / `M` |

## Tests

The suite runs the real game module against a mock DOM and a mock three.js
implementation, then simulates tens of thousands of frames.

```bash
node test/smoke.mjs                  # tests index.html
GAME=versions/v1.0/index.html node test/smoke.mjs   # tests an old snapshot
```

It covers lean, aiming down sights, tracers, reload animation, melee and
backstabs, map destruction, wave scaling, regeneration, the whole touch control
layer (stick, drag-look, and every on-screen button), and runs a bot through
several waves to check that the balance has not become impossible. Kills happen
before a commit, so a bad build cannot land.

## Releasing a new version

```bash
# 1. edit index.html
node test/smoke.mjs
# 2. snapshot, bump the history page, commit and tag
node tools/release.mjs --id v1.1 --name "Strike Zone 1.1" \
  --summary "Short one-liner for the history page" \
  --notes "First change|Second change|Third change"
git push --follow-tags
```

GitHub Pages then serves the new build at the site root while `versions/` keeps
every earlier release playable.
