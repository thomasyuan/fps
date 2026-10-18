import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { makeDom, makeAudio, THREE } from './mock.mjs';

// GAME=../index.html by default; CI/release can point it at any build.
const here = dirname(fileURLToPath(import.meta.url));
const gamePath = resolve(here, process.env.GAME || '../index.html');
const html = readFileSync(gamePath, 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/const CDNS = \[[\s\S]*?\];/, "const CDNS = ['./mock.mjs'];")
  .replace('THREE = await import(url);', 'THREE = (await import(url)).THREE;');
writeFileSync(resolve(here, 'game.mjs'), src + `
globalThis.__T = { state, P, keys, enemies, WEAPONS, pickups, grenades, worldBoxes, SPAWNS, TYPES,
  camera, vms, knife, vmHolder, breakables, debris, Enemy,
  startGame, resetGame, gameOver, throwNade, switchWeapon, startReload, tryFire, tryMelee, damagePlayer,
  damageBreakable, destroyBreakable, resetBreakables, breakablesInRadius,
  nextWave, spawnEnemy, step, updateHUD, drawRadar, explode, hitscan, playerEye, circleBlocked, segBlocked,
  enemyShoot,
  waveHpScale, waveDmgScale, LEAN_MAX, MELEE_DMG, MELEE_RANGE, ADS_ZOOM, TRACER_LIFE,
  get reloading() { return reloading; }, get tracers() { return tracers; }, get bloom() { return bloom; },
  setFiring: v => { firing = v; }, setLocked: v => { state.locked = v; } };
`);

const { doc, els } = makeDom();
global.window = { AudioContext: makeAudio() };
global.document = doc;
global.innerWidth = 1280; global.innerHeight = 720; global.devicePixelRatio = 1;
global.addEventListener = (t, fn) => { (global.__wh = global.__wh || {})[t] = (global.__wh[t] || []).concat(fn); };
global.requestAnimationFrame = () => 0;
global.performance = { now: () => 0 };

await import('./game.mjs');
const T = globalThis.__T;
const fire = (o) => (global.__wh['mousedown'] || []).forEach(fn => fn(o));
const key = (code, down) => (global.__wh[down ? 'keydown' : 'keyup'] || []).forEach(fn => fn({ code, preventDefault() {} }));

els.playBtn.handlers.click[0]();
T.setLocked(true);
const dt = 1 / 60;
// deterministic RNG so every run of the suite is reproducible
let globalSeed = 987654321;
Math.random = () => { globalSeed = (globalSeed * 1103515245 + 12345) & 0x7fffffff; return globalSeed / 0x7fffffff; };
let fail = 0;
const bad = (m) => { console.log('FAIL:', m); fail++; };
const mkEnemy = (type, x, z) => { const e = new T.Enemy(type, x, z); T.enemies.push(e); return e; };

// ---- lean behaviour -------------------------------------------------------
T.P.yaw = Math.PI / 2;                       // facing +X  => right vector is -Z
key('KeyQ', true);
for (let i = 0; i < 40; i++) T.step(dt);
const leanL = { eff: T.P.leanEff, x: T.P.leanX, z: T.P.leanZ };
if (leanL.eff > -0.95) bad('Q does not lean left (eff=' + leanL.eff.toFixed(2) + ')');
if (Math.hypot(leanL.x, leanL.z) < 0.5) bad('lean did not move the eye: ' + Math.hypot(leanL.x, leanL.z).toFixed(2));
const eyeLeaned = T.playerEye(new THREE.Vector3()).clone();
key('KeyQ', false); key('KeyE', true);
for (let i = 0; i < 40; i++) T.step(dt);
if (T.P.leanEff < 0.95) bad('E does not lean right (eff=' + T.P.leanEff.toFixed(2) + ')');
const eyeLeanR = T.playerEye(new THREE.Vector3());
if (Math.hypot(eyeLeanR.x - eyeLeaned.x, eyeLeanR.z - eyeLeaned.z) < 1.0) bad('Q and E lean to the same side');
key('KeyE', false);
for (let i = 0; i < 40; i++) T.step(dt);
if (Math.abs(T.P.leanEff) > 0.05) bad('lean does not return to centre: ' + T.P.leanEff.toFixed(2));

// lean must be blocked by geometry (lean toward the wall at z 17.5..20.5)
T.P.pos.set(0, 0, 17.0); T.P.yaw = 0; T.P.lean = 0; T.P.leanEff = 0;
key('KeyQ', true);                       // Q = left of view = +z when facing -z... test both
for (let i = 0; i < 40; i++) T.step(dt);
let worst = 0, inside = false;
for (const k of ['KeyQ', 'KeyE']) {
  T.P.lean = 0; T.P.leanEff = 0;
  key(k, true);
  for (let i = 0; i < 40; i++) {
    T.step(dt);
    const e = T.playerEye(new THREE.Vector3());
    worst = Math.max(worst, Math.abs(T.P.leanEff) * T.LEAN_MAX);
    for (const b of T.worldBoxes) {
      if (e.x > b.min.x && e.x < b.max.x && e.z > b.min.z && e.z < b.max.z && e.y > b.min.y && e.y < b.max.y) inside = true;
    }
  }
  key(k, false);
}
if (inside) bad('lean pushed the eye inside a wall');
console.log('lean: max offset near cover', worst.toFixed(2), 'm (limit ' + T.LEAN_MAX + ')');
if (T.LEAN_MAX < 0.8) bad('lean offset is still too small to feel useful');

// camera roll must match the lean direction (lean left => head tilts left)
T.P.lean = 0; T.P.leanEff = 0; T.P.pos.set(0, 0, 30); T.P.yaw = 0;
key('KeyQ', true); for (let i = 0; i < 40; i++) T.step(dt); key('KeyQ', false);
if (T.camera.rotation.z < 0) bad('leaning left rolls the camera the wrong way (z=' + T.camera.rotation.z.toFixed(3) + ')');
const rollL = T.camera.rotation.z;
key('KeyE', true); for (let i = 0; i < 40; i++) T.step(dt); key('KeyE', false);
if (T.camera.rotation.z > 0) bad('leaning right rolls the camera the wrong way (z=' + T.camera.rotation.z.toFixed(3) + ')');
console.log('lean roll: Q z=+' + rollL.toFixed(3), '(tilt matches the side you peek)', 'E z=' + T.camera.rotation.z.toFixed(3));

// ---- ADS / scope ----------------------------------------------------------
T.resetGame(); T.startGame(); T.setLocked(true);
T.switchWeapon(0);
T.P.pos.set(0, 0, 30); T.P.yaw = 0; T.P.pitch = 0;
for (let i = 0; i < 20; i++) T.step(dt);
const fovHip = T.camera.fov;
fire({ button: 2 });
for (let i = 0; i < 60; i++) { T.step(dt); T.updateHUD(); }
const fovScoped = T.camera.fov;
if (!T.P.ads) bad('RMB did not engage ADS');
if (T.P.adsT < 0.9) bad('adsT never reached 1: ' + T.P.adsT.toFixed(2));
if (fovScoped > fovHip - 20) bad('ADS did not narrow the view: ' + fovHip + ' -> ' + fovScoped);
if (!T.vms[0].userData.scope.visible) bad('rifle scope overlay did not appear');
if (els.scope.style.opacity === '' || els.scope.style.opacity === '0') bad('HUD scope vignette stayed off');
if (els.cross.style.opacity === '1') bad('crosshair did not fade while scoped');
T.keys['KeyW'] = true; T.P.pos.set(0, 0, 30); T.P.vel.set(0, 0, 0);
for (let i = 0; i < 60; i++) T.step(dt);
const spdScoped = Math.hypot(T.P.vel.x, T.P.vel.z);
T.keys['KeyW'] = false;
if (spdScoped > 6.4 * 0.55 + 0.6) bad('ADS did not slow movement: ' + spdScoped.toFixed(2));
T.keys['KeyW'] = true; T.P.ads = false; T.P.pos.set(0, 0, 30); T.P.vel.set(0, 0, 0);
for (let i = 0; i < 60; i++) T.step(dt);
const spdHip = Math.hypot(T.P.vel.x, T.P.vel.z);
T.keys['KeyW'] = false;
(global.__wh['mouseup'] || []).forEach(fn => fn({ button: 2 }));
for (let i = 0; i < 60; i++) T.step(dt);
if (T.P.adsT > 0.1) bad('ADS did not release on RMB up');
if (T.camera.fov < fovHip - 5) bad('FOV did not return to normal: ' + T.camera.fov);
console.log('ads: fov', fovHip, '->', fovScoped.toFixed(1), '| move speed hip', spdHip.toFixed(2), 'scoped', spdScoped.toFixed(2));

// the scoped view must be clear: no viewmodel part may cover the screen centre
function occluders(wi) {
  T.camera.updateMatrixWorld(true);
  const m = T.camera.matrixWorld.r;
  const dir = new THREE.Vector3(-m[6], -m[7], -m[8]).normalize();
  const eye = new THREE.Vector3(m[0], m[1], m[2]);
  const out = [];
  const vm = T.vms[wi];
  const walk = (o) => {
    for (const c of o.children) {
      if (c.isMesh && c.visible !== false) {
        const c2 = c.localToWorld(new THREE.Vector3());
        const vx = c2.x - eye.x, vy = c2.y - eye.y, vz = c2.z - eye.z;
        const fwd = vx * dir.x + vy * dir.y + vz * dir.z;
        if (fwd <= 0.02) continue;
        const px = vx - dir.x * fwd, py = vy - dir.y * fwd, pz = vz - dir.z * fwd;
        const perp = Math.hypot(px, py, pz);
        const a = (c.geometry.args || [1, 1, 1]);
        const rad = Math.max(a[0], a[1], a[2]) * 0.5;
        if (perp - rad < 0.18) out.push({ part: a.join('x'), fwd: +fwd.toFixed(2), perp: +perp.toFixed(2), rad: +rad.toFixed(2) });
      }
      walk(c);
    }
  };
  walk(vm);
  return out;
}
T.resetGame(); T.startGame(); T.setLocked(true);
T.switchWeapon(0); T.P.pos.set(0, 0, 30); T.P.yaw = 0; T.P.pitch = 0;
T.P.ads = false;
for (let i = 0; i < 40; i++) T.step(dt);
const hipOcc = occluders(0);
const hipMats = T.vms[0].userData.mats;
if (!T.vms[0].visible) bad('hip-fire viewmodel was hidden');
if (hipMats[0].opacity < 0.9) bad('hip-fire viewmodel was faded: ' + hipMats[0].opacity);
T.P.ads = true;
for (let i = 0; i < 60; i++) T.step(dt);
const scopedOcc = occluders(0);
const scopedOpacity = Math.max(...T.vms[0].userData.mats.map(m => m.opacity));
if (scopedOcc.length) bad('scoped view still blocked by viewmodel parts: ' + JSON.stringify(scopedOcc));
if (scopedOpacity > 0.05) bad('scoped rifle viewmodel did not fade out: ' + scopedOpacity);
if (T.vms[0].visible) bad('scoped rifle viewmodel stayed visible');
T.switchWeapon(2); T.P.ads = false; for (let i = 0; i < 30; i++) T.step(dt);
T.P.ads = true; for (let i = 0; i < 60; i++) T.step(dt);
const pisOcc = occluders(2);
const pisOpacity = Math.max(...T.vms[2].userData.mats.map(m => m.opacity));
if (pisOcc.length) bad('aimed pistol blocks the centre: ' + JSON.stringify(pisOcc));
if (pisOpacity < 0.35 || pisOpacity > 0.65) bad('aimed pistol should stay half-visible: ' + pisOpacity);
console.log('clear view: hip occluders', hipOcc.length, '| scoped rifle occluders', scopedOcc.length,
  '(rifle opacity', scopedOpacity.toFixed(2) + ', hidden)', '| aimed pistol occluders', pisOcc.length,
  '(opacity', pisOpacity.toFixed(2) + ')');

// ADS must actually make you more accurate (seeded RNG so the sample is stable)
let seed = 12345;
const seededRandom = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function shootGroup(ads, shots) {
  const realRandom = Math.random;
  Math.random = seededRandom;
  T.resetGame(); T.startGame(); T.setLocked(true); T.switchWeapon(2);
  T.enemies.length = 0; T.state.spawnQueue = 0;
  T.P.pos.set(0, 0, 40); T.P.yaw = 0; T.P.pitch = 0; T.P.lean = 0; T.P.leanEff = 0; T.P.leanX = 0; T.P.leanZ = 0;
  const e = mkEnemy('grunt', 0, 8);
  e.hp = 1e9; e.alert = 1; e.cooldown = 1e9;
  T.P.health = 1e6; T.P.armor = 0;
  T.P.pos.set(0, 0, 30);
  if (ads) { T.P.ads = true; for (let i = 0; i < 60; i++) { e.hp = 1e9; e.cooldown = 1e9; T.step(dt); } }
  let hits = 0;
  for (let s = 0; s < shots; s++) {
    e.hp = 1e9; e.cooldown = 1e9;
    e.pos.set(0, 0, 8); e.updateBoxes();          // pin the target: pure spread test
    T.WEAPONS[2].ammo = 14;                       // never interrupt the sample with a reload
    // aim exactly at the chest, compensating accumulated recoil, so this
    // measures inherent spread/bloom rather than recoil management
    const dx = e.pos.x - T.P.pos.x, dz = e.pos.z - T.P.pos.z, hd = Math.max(0.5, Math.hypot(dx, dz));
    T.P.yaw = Math.atan2(-dx, -dz) - T.P.recoilYaw;
    T.P.pitch = Math.atan2(e.pos.y + 1.1 - (T.P.pos.y + 1.62), hd) - T.P.recoilPitch;
    const before = T.state.shotsHit;
    T.tryFire();
    if (T.state.shotsHit > before) hits++;
    for (let i = 0; i < 14; i++) { e.hp = 1e9; e.cooldown = 1e9; e.pos.set(0, 0, 8); e.updateBoxes(); T.WEAPONS[2].ammo = 14; T.step(dt); }
  }
  T.P.ads = false;
  Math.random = realRandom;
  return hits / shots;
}
const accHip = shootGroup(false, 80), accAds = shootGroup(true, 80);
console.log('inherent accuracy, pinned target at 22m: hip', (accHip * 100).toFixed(0) + '% vs ADS', (accAds * 100).toFixed(0) + '%');
if (!(accAds > accHip + 0.1)) bad('ADS is not clearly more accurate than hip fire');
if (accAds < 0.9) bad('ADS accuracy too low to be worth using: ' + (accAds * 100).toFixed(0) + '%');

// ---- tracers --------------------------------------------------------------
T.resetGame(); T.startGame(); T.setLocked(true); T.switchWeapon(0);
for (const t of T.tracers) t.life = 0;
T.P.pos.set(0, 0, 40); T.P.yaw = 0; T.P.pitch = 0;
T.tryFire();
const live = T.tracers.filter(t => t.life > 0 && t.m.visible);
if (!live.length) bad('firing produced no tracer');
else console.log('tracer: live', live.length, 'len', live[0].m.scale.x.toFixed(1), 'm life', T.TRACER_LIFE + 's');

// ---- reload animation + HUD bar ------------------------------------------
T.resetGame(); T.startGame(); T.setLocked(true); T.switchWeapon(0);
T.WEAPONS[0].ammo = 4;
T.startReload();
let magDrop = 0, barSeen = false, maxBar = 0;
for (let i = 0; i < 140; i++) {
  T.step(dt);
  T.updateHUD();
  if (T.reloading > 0) {
    const u = T.vms[0].userData;
    magDrop = Math.min(magDrop, u.mag.position.y - u.magY);
    if (!els.reloadWrap.classList.contains('hidden')) barSeen = true;
    maxBar = Math.max(maxBar, parseFloat(els.reloadFill.style.width) || 0);
  }
}
if (T.reloading !== 0) bad('reload never finished');
if (T.WEAPONS[0].ammo !== T.WEAPONS[0].mag) bad('reload did not top up the mag: ' + T.WEAPONS[0].ammo);
if (magDrop > -0.1) bad('magazine did not move during reload: ' + magDrop.toFixed(3));
if (!barSeen) bad('reload progress bar never shown');
if (maxBar < 90) bad('reload bar never reached ~100%: ' + maxBar);
if (Math.abs(T.vms[0].userData.mag.position.y - T.vms[0].userData.magY) > 1e-6) bad('mag not restored after reload');
console.log('reload: mag drop', magDrop.toFixed(3), 'm, bar max', maxBar.toFixed(0) + '%');

// shotgun pump + pistol slide must animate too
T.resetGame(); T.startGame(); T.setLocked(true);
T.switchWeapon(1); T.WEAPONS[1].ammo = 1; T.startReload();
let pumpMove = 0;
for (let i = 0; i < 160; i++) { T.step(dt); if (T.reloading > 0) pumpMove = Math.max(pumpMove, Math.abs(T.vms[1].userData.pump.position.z - T.vms[1].userData.pumpZ)); }
if (pumpMove < 0.05) bad('shotgun pump did not cycle');
T.switchWeapon(2); T.WEAPONS[2].ammo = 1; T.startReload();
let slideMove = 0;
for (let i = 0; i < 100; i++) { T.step(dt); if (T.reloading > 0) slideMove = Math.max(slideMove, Math.abs(T.vms[2].userData.slide.position.z - T.vms[2].userData.slideZ)); }
if (slideMove < 0.05) bad('pistol slide did not cycle');
console.log('reload anim: pump', pumpMove.toFixed(3), 'm, slide', slideMove.toFixed(3), 'm');

// ---- melee: backstab is one shot, frontal melee is fixed damage -----------
function meleeSetup(enemyYaw) {
  T.resetGame(); T.startGame(); T.setLocked(true);
  T.enemies.length = 0; T.state.spawnQueue = 0;
  T.P.pos.set(0, 0, 40); T.P.yaw = 0; T.P.pitch = 0; T.P.lean = 0; T.P.leanEff = 0; T.P.leanX = 0; T.P.leanZ = 0;
  const e = mkEnemy('brute', 0, 37.4);
  e.yaw = enemyYaw; e.alert = 1; e.cooldown = 1e9; e.hp = 900; e.maxHp = 900;
  e.updateBoxes();
  return e;
}
let e = meleeSetup(0);            // hostile looking away from us -> backstab
T.tryMelee();
for (let i = 0; i < 45; i++) { e.hp = Math.max(e.hp, 900); T.step(dt); }
if (!e.dead) bad('backstab did not kill (hp left ' + e.hp.toFixed(0) + ')');
const bsScore = T.state.kills;
if (bsScore !== 1) bad('backstab kill was not counted');
const hpAfterBackstab = e.hp;
e = meleeSetup(Math.PI);          // hostile looking straight at us -> normal melee
T.tryMelee();
for (let i = 0; i < 45; i++) T.step(dt);
if (e.dead) bad('frontal melee killed a 900 HP brute instantly');
const dealt = 900 - e.hp;
if (Math.abs(dealt - T.MELEE_DMG) > 1) bad('frontal melee damage off: ' + dealt.toFixed(1) + ' expected ' + T.MELEE_DMG);
console.log('melee: backstab kills a 900 HP brute (hp untouched', hpAfterBackstab.toFixed(0) + '), frontal hit deals', dealt.toFixed(0));
// melee must not count as a gunshot for accuracy stats
if (T.state.shotsFired !== 0) bad('melee polluted the shot statistics');

// ---- map destruction ------------------------------------------------------
T.resetGame(); T.startGame(); T.setLocked(true);
const crates = T.breakables.filter(b => b.kind === 'crate');
const barrels = T.breakables.filter(b => b.kind === 'barrel');
const slabs = T.breakables.filter(b => b.kind === 'slab');
console.log('props:', { crates: crates.length, barrels: barrels.length, slabs: slabs.length, colliders: T.worldBoxes.length });
const colliderCount0Before = T.worldBoxes.length;
if (crates.length < 10 || barrels.length < 8 || slabs.length < 4) bad('not enough destructible cover on the map');

// shoot a crate apart with the pistol
T.switchWeapon(2);
const crate = crates[0];
T.P.pos.set(crate.cx, 0, crate.cz + 7); T.P.yaw = 0; T.P.pitch = -0.15;
T.P.lean = 0; T.P.leanEff = 0; T.P.leanX = 0; T.P.leanZ = 0;
let shots = 0;
for (let i = 0; i < 400 && !crate.dead; i++) {
  if (i % 14 === 0) { T.tryFire(); shots++; }
  T.step(dt);
}
if (!crate.dead) bad('crate survived ' + shots + ' pistol shots');
if (T.worldBoxes.indexOf(crate.col) !== -1) bad('destroyed crate collider was not removed');
if (crate.mesh.visible) bad('destroyed crate mesh is still visible');
if (!T.debris.some(d => d.life > 0)) bad('destruction produced no debris');
console.log('destruction: crate died in', shots, 'shots, debris active', T.debris.filter(d => d.life > 0).length,
  'colliders now', T.worldBoxes.length);

// barrels detonate and hurt nearby hostiles
const barrel = barrels[0];
T.enemies.length = 0;
const near = mkEnemy('grunt', barrel.cx + 3, barrel.cz);
near.hp = 400; near.maxHp = 400;
T.damageBreakable(barrel, 500, { x: barrel.cx, y: 0.7, z: barrel.cz });
if (!barrel.dead) bad('barrel did not blow up');
if (near.hp >= 400) bad('barrel blast did not damage a hostile 3m away (hp ' + near.hp.toFixed(0) + ')');
console.log('barrel blast: brute grunt hp 400 ->', near.hp.toFixed(0));

// enemies shoot cover apart too: straight-line misses are clipped by whatever
// is in the way, so a crate between shooter and target takes the damage.
T.enemies.length = 0;
const crate2 = crates[1];
T.P.pos.set(crate2.cx, 0, crate2.cz + 3); T.P.yaw = Math.PI; T.P.pitch = 0;
T.P.y = 0; T.P.health = 100; T.P.armor = 0;
T.P.crouch = true;                   // ducked behind the crate so hostile rounds clip it
const shooter = mkEnemy('grunt', crate2.cx, crate2.cz - 6);
shooter.hp = 1e9; shooter.maxHp = 1e9;
const crateHp0 = crate2.hp;
const realRandom = Math.random;
Math.random = () => 0.5;             // every pellet rolls a straight miss, no spread
for (let i = 0; i < 24 && !crate2.dead; i++) { T.P.crouch = true; T.enemyShoot(shooter, 9); T.step(dt); }
Math.random = realRandom;
T.P.crouch = false;
if (crate2.hp >= crateHp0) bad('hostile fire never damaged cover');
console.log('cover erosion: hostile fire chewed', (crate2.maxHp - crate2.hp).toFixed(0), '/', crate2.maxHp,
  'HP over 24 volleys', crate2.dead ? '(destroyed)' : '(still standing)');

// destroyed cover must rebuild on redeploy
const colliderCount0 = colliderCount0Before;
T.resetGame(); T.startGame(); T.setLocked(true);
const stillUp = T.breakables.filter(b => !b.dead).length;
if (stillUp !== T.breakables.length) bad('redeploy did not rebuild destroyed cover');
if (T.worldBoxes.length !== colliderCount0) bad('collider count wrong after rebuild: ' + T.worldBoxes.length + ' vs ' + colliderCount0);
console.log('rebuild: all', stillUp, 'props restored, colliders', T.worldBoxes.length);

// grenades wreck the map as well
T.resetGame(); T.startGame(); T.setLocked(true);
const crate3 = crates[2];
T.explode(new THREE.Vector3(crate3.cx, 0.6, crate3.cz), 7.5);
if (!crate3.dead) bad('a grenade at a crate did not destroy it');

// ---- wave scaling ---------------------------------------------------------
const accBase = { grunt: T.TYPES.grunt.acc, scout: T.TYPES.scout.acc, brute: T.TYPES.brute.acc };
const rows = [];
for (let w = 1; w <= 12; w++) {
  T.state.wave = w;
  T.enemies.length = 0;
  T.spawnEnemy();
  const e = T.enemies[0];
  rows.push({ w, type: e.type, hp: Math.round(e.hp), base: T.TYPES[e.type].hp, dmg: +(e.T.dmg * e.dmgScale).toFixed(1), acc: e.T.acc, hpScale: +e.hpScale.toFixed(2) });
  if (Math.abs(e.T.acc - accBase[e.type]) > 1e-9) bad('accuracy changed with wave for ' + e.type);
  if (e.hp < T.TYPES[e.type].hp - 1) bad('hp shrank at wave ' + w);
}
console.table(rows);

// ---- semi-auto fires on a single click ------------------------------------
T.resetGame(); T.startGame(); T.setLocked(true);
T.switchWeapon(2);
for (let i = 0; i < 20; i++) T.step(dt);
const before = T.WEAPONS[2].ammo;
fire({ button: 0 });
if (T.WEAPONS[2].ammo !== before - 1) bad('pistol did not fire on mousedown (' + before + ' -> ' + T.WEAPONS[2].ammo + ')');
T.switchWeapon(0);

// ---- long randomised run --------------------------------------------------
T.resetGame(); T.startGame(); T.setLocked(true);
let maxWave = 0, deaths = 0;
const pick2 = a => a[Math.floor(Math.random() * a.length)];
for (let f = 0; f < 14000; f++) {
  T.step(dt);
  T.state.time += dt;
  if (!isFinite(T.P.pos.x) || !isFinite(T.P.pos.y) || !isFinite(T.P.pos.z)) { bad('NaN player pos'); break; }
  if (!isFinite(T.P.leanEff) || !isFinite(T.P.leanX)) { bad('NaN lean'); break; }
  for (const e of T.enemies) if (!isFinite(e.pos.x) || !isFinite(e.pos.y)) { bad('NaN enemy'); break; }
  if (T.enemies.length > 40) { bad('enemy leak'); break; }
  if (T.circleBlocked(T.P.pos.x, T.P.pos.z, T.P.radius, T.P.pos.y + 0.2, T.P.pos.y + T.P.height - 0.2) && T.P.onGround && T.P.pos.y < 1) {
    bad('player stuck inside geometry at ' + T.P.pos.x.toFixed(1) + ',' + T.P.pos.z.toFixed(1)); break;
  }
  T.setFiring(f % 3 !== 0);
  if (f % 9 === 0) fire({ button: 0 });
  if (f % 13 === 0) (global.__wh['mouseup'] || []).forEach(fn => fn({ button: 0 }));
  if (f % 17 === 0) (global.__wh['mousemove'] || []).forEach(fn => fn({ movementX: (Math.random() - 0.5) * 120, movementY: (Math.random() - 0.5) * 60 }));
  if (f % 7 === 0) key(Math.random() < 0.5 ? 'KeyQ' : 'KeyE', true);
  if (f % 23 === 0) key(pick2(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft']), true);
  if (f % 29 === 0) key(pick2(['KeyW', 'KeyA', 'KeyS', 'KeyD']), false);
  if (f % 11 === 0) { key('KeyQ', false); key('KeyE', false); }
  if (f % 90 === 0) T.startReload();
  if (f % 211 === 0) T.throwNade();
  if (f % 37 === 0) T.tryMelee();
  if (f % 120 === 0) T.P.ads = !T.P.ads;
  if (f % 300 === 0) T.switchWeapon(Math.floor(Math.random() * 3));
  maxWave = Math.max(maxWave, T.state.wave);
  if (T.state.over) { deaths++; T.resetGame(); T.startGame(); T.setLocked(true); }
}
console.log('run:', { maxWave, deaths, kills: T.state.kills, health: Math.round(T.P.health), armor: Math.round(T.P.armor), ammo: T.WEAPONS.map(w => w.ammo + '/' + w.reserve) });

// ---- how punishing is wave 1 for a player who never moves or shoots? ------
T.resetGame(); T.startGame(); T.setLocked(true);
T.state.spawnQueue = 0; T.enemies.length = 0;
for (let i = 0; i < 5; i++) { T.state.wave = 1; T.spawnEnemy(); }
let survived = 0;
while (!T.state.over && survived < 120) { T.state.time += dt; T.step(dt); survived += dt; }
console.log('AFK wave-1 survival:', survived.toFixed(1) + 's', survived < 12 ? 'TOO PUNISHING' : '');
if (survived < 12) bad('wave 1 kills an AFK player in under 12s');

// ---- out-of-combat regen --------------------------------------------------
T.resetGame(); T.startGame(); T.setLocked(true);
T.enemies.length = 0; T.state.spawnQueue = 0;
T.P.health = 30; T.P.lastHurt = -99;
const regenTick = () => {
  T.enemies.length = 0; T.state.spawnQueue = 0; T.state.clearTimer = -1;
  T.pickups.length = 0;                 // no healing pickups in this measurement
  T.state.time += dt; T.step(dt);
  T.pickups.length = 0;
  if (T.P.health > 70) T.P.health = 70; // undoes any wave-clear reward, keeps the test about regen
};
for (let i = 0; i < 600; i++) regenTick();
const regenHp = T.P.health;
if (regenHp < 68) bad('regen did not run (hp=' + regenHp.toFixed(1) + ')');
for (let i = 0; i < 600; i++) regenTick();
if (T.P.health > 71) bad('regen exceeds the 70% cap: ' + T.P.health.toFixed(1));
T.damagePlayer(10, 0, 0);
for (let i = 0; i < 300; i++) { T.enemies.length = 0; T.state.spawnQueue = 0; T.state.clearTimer = -1; T.state.time += dt; T.step(dt); }
if (T.P.health > 60.5) bad('regen resumes immediately after taking damage: ' + T.P.health.toFixed(1));
console.log('regen: 30 ->', regenHp.toFixed(1), '-> capped', T.P.health.toFixed(1));

// ---- competent bot: how far does a decent player get? ---------------------
function botTick(f) {
  const eye = T.playerEye(new THREE.Vector3());
  let vis = null, vd = 1e9, near = null, nd = 1e9;
  for (const e of T.enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.pos.x - T.P.pos.x, e.pos.z - T.P.pos.z);
    if (d < nd) { nd = d; near = e; }
    if (!T.segBlocked(eye.x, eye.y, eye.z, e.pos.x, e.pos.y + 1.2, e.pos.z) && d < vd) { vd = d; vis = e; }
  }
  // no shot line? lean out (Q/E) alternately, like a player would
  const leanCycle = Math.floor(f / 45) % 3;
  T.keys['KeyQ'] = false; T.keys['KeyE'] = false;
  if (!vis && near && nd < 30) { if (leanCycle === 1) T.keys['KeyQ'] = true; if (leanCycle === 2) T.keys['KeyE'] = true; }

  const tgt = vis || near;
  if (tgt) {
    const dx = tgt.pos.x - T.P.pos.x, dz = tgt.pos.z - T.P.pos.z, hd = Math.max(0.5, Math.hypot(dx, dz));
    T.P.yaw = Math.atan2(-dx, -dz) + (vis ? (Math.random() - 0.5) * 0.06 : 0.4);
    T.P.pitch = Math.atan2(tgt.pos.y + 1.25 - (T.P.pos.y + 1.62), hd);
  }
  // movement: keep mid range, circle strafe, never walk into geometry
  if (tgt) {
    const base = Math.atan2(tgt.pos.x - T.P.pos.x, tgt.pos.z - T.P.pos.z);
    let want = base;
    if (nd > 20) want = base; else if (nd < 10) want = base + Math.PI; else want = base + Math.PI / 2 * (f % 200 < 100 ? 1 : -1);
    let dir = null;
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
      const a = want + off, nx = T.P.pos.x + Math.sin(a) * 2, nz = T.P.pos.z + Math.cos(a) * 2;
      if (!T.circleBlocked(nx, nz, T.P.radius, T.P.pos.y + 0.2, T.P.pos.y + T.P.height - 0.2)) { dir = a; break; }
    }
    if (dir !== null) {
      const fx = -Math.sin(T.P.yaw), fz = -Math.cos(T.P.yaw), rx = Math.cos(T.P.yaw), rz = -Math.sin(T.P.yaw);
      const ix = Math.sin(dir) * rx + Math.cos(dir) * rz, iz = Math.sin(dir) * fx + Math.cos(dir) * fz;
      T.keys['KeyW'] = iz > 0.2; T.keys['KeyS'] = iz < -0.2; T.keys['KeyD'] = ix > 0.2; T.keys['KeyA'] = ix < -0.2;
    }
  }
  T.setFiring(!!vis && vd < 45);
  T.P.ads = !!vis && vd > 13;                       // scope at range, hip in CQB
  if (near && nd < 2.4 && f % 40 === 0) T.tryMelee();
}
T.resetGame(); T.startGame(); T.setLocked(true);
let botDeaths = 0, botMaxWave = 0;
const realRandomBot = Math.random;
let botSeed = 20260101;
Math.random = () => { botSeed = (botSeed * 1103515245 + 12345) & 0x7fffffff; return botSeed / 0x7fffffff; };
for (let f = 0; f < 90000 && botDeaths < 4; f++) {
  botTick(f);
  T.state.time += dt;
  T.step(dt);
  if (f % 130 === 0) T.startReload();
  if (f % 700 === 0) T.throwNade();
  botMaxWave = Math.max(botMaxWave, T.state.wave);
  if (T.state.over) {
    console.log('  bot died: wave', T.state.wave, 'after', Math.round(T.state.time) + 's, kills', T.state.kills, 'acc', (T.state.shotsHit / Math.max(1, T.state.shotsFired) * 100).toFixed(0) + '%');
    botDeaths++; T.resetGame(); T.startGame(); T.setLocked(true);
  }
}
console.log('bot run:', { botMaxWave, botDeaths, kills: T.state.kills, score: T.state.score, accuracy: (T.state.shotsHit / Math.max(1, T.state.shotsFired) * 100).toFixed(0) + '%' });
Math.random = realRandomBot;
if (botMaxWave < 5) bad('a competent player cannot reach wave 5 — still too punishing');
console.log(fail ? 'SMOKE FAILED (' + fail + ')' : 'SMOKE PASSED');
process.exit(fail ? 1 : 0);
