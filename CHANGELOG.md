# Changelog

Every release is snapshotted under `versions/<id>/` and stays playable from the
version history page (`versions/index.html`).

## v1.0 - 2026-10-18

First public release: a complete single-file three.js wave-survival FPS.

- Single-file game, three.js from CDN with two fallbacks.
- Rifle, shotgun and pistol with distinct spread, recoil and reload timing.
- Wave survival against grunts, scouts and brutes. Enemy HP and damage scale with
  the wave; accuracy is fixed per type and capped, so late waves are tankier, not
  more lethal to aim against.
- Aim down sights on hold right mouse: tighter spread, slower movement, lower
  sensitivity, scope overlay with a magnification readout.
- Lean left/right on `Q`/`E`: the camera slides and rolls around cover while the
  collision body stays behind it.
- Melee on `V`/`F`: fixed 62 damage, one-shot backstab when a hostile is not
  facing you.
- Reload animations (magazine drop, shotgun pump, pistol slide), staged reload
  audio and an on-screen reload bar.
- Tracers for player and enemy fire, colour-coded.
- Destructible cover: crates, exploding fuel barrels and low walls. Destroyed
  cover loses its collider; everything rebuilds on redeploy.
- Brighter arena lighting and textures, ACES tone mapping.
- Out-of-combat regeneration to 70%, wave-clear rewards, pickups.
- HUD with health/armor, ammo, radar, kill feed, hitmarkers, damage direction and
  an end-of-run summary including accuracy, backstabs and props destroyed.
- Headless test suite (mock DOM + mock three.js) covering all of the above.
