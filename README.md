# GARBAGE SHOOTER
Developed by **Vaibhav Jha** — a lightweight, browser-based first-person shooter built with vanilla HTML/CSS/JavaScript and Three.js (no game engine).

## Running it
Just open `index.html` in a modern desktop browser (Chrome/Edge/Firefox). No build step, no server required — all scripts are plain `<script>` tags loaded in dependency order, and Three.js is pulled from a CDN.

Click the window once in-game to lock the mouse pointer (required by the browser's Pointer Lock API for mouse-look).

## Controls
| Action | Key |
|---|---|
| Move | W A S D |
| Look | Mouse |
| Jump | Space |
| Sprint | Shift |
| Crouch | Ctrl / C |
| Fire | Left Click |
| Aim Down Sights | Right Click |
| Reload | R |
| Switch Weapon | 1–4 / Scroll Wheel |
| Throw Grenade | G |
| Pause | Esc |

## What's implemented (fully playable, no stubs)
- **Player controller**: accelerated/damped WASD movement, gravity, jump, sprint, crouch, stamina drain/regen, fall damage, cylinder-vs-box collision against level geometry, head bob, footstep audio.
- **4 weapons** (Pistol, Assault Rifle, Shotgun, Sniper Rifle) each with distinct damage, fire rate, magazine size, reload time (shotgun reloads shell-by-shell), spread/recoil, ADS zoom + spread tightening, muzzle flash, shell-eject particles, dry-fire click.
- **Combat**: hitscan raycasting, headshot multipliers via a dedicated head hitbox per enemy, hit markers + audio cue, blood/impact particles + persistent bullet-hole decals, screen shake, damage vignette, grenades with arc physics and splash-damage explosions.
- **Enemy AI**: a real finite-state machine (Patrol → Chase → Attack → Search → back to Patrol) driven by field-of-view + raycasted line-of-sight checks, four distinct archetypes (Soldier, Heavy Soldier, Sniper who tries to keep range, and a tanky Boss), death animation, alert sounds.
- **2 full levels** built on a reusable `Level` base class: **Training Ground** (tutorial combat course) and **City** (multi-objective mission: clear hostiles → rescue hostage → find keycard → extract), each with cover geometry, pickups, patrol routes, and a sequential objective tracker.
- **Full HUD**: health/armor/stamina bars, ammo/weapon readout, dynamic crosshair, hit marker, mission objective box, rotating minimap, FPS counter, kill counter, reload/grenade indicators.
- **Main menu** with an animated 3D background (drifting low-poly shapes over a foggy floor), New Game (level select), Continue, Settings, Controls, Credits, Exit, plus a pause menu and end-of-mission screen.
- **Settings** (sensitivity, master volume, graphics quality, FOV, fullscreen, invert-Y) persisted via `localStorage`, along with mission progress, level unlocks, and high scores (`SaveManager.js`).
- **Audio**: every sound (gunshots per weapon, reloads, footsteps, jumps/landing, explosions, hit markers, enemy alerts/death, pickups, UI clicks, ambient music drone) is synthesized in real time with the Web Audio API — oscillators and filtered noise bursts — so there are no missing/broken binary sound files, and 3D positional audio is done with PannerNodes tracking a listener that follows the camera.

## Honest scope note
The original brief describes a AAA-scale campaign (6 full maps, 4 enemy types with cover-seeking, a full pre-recorded voice/music/SFX library, etc.). Delivering that as genuinely working, non-placeholder code isn't realistic in one pass, so this build focuses on making every system above **actually work end-to-end** across two complete, winnable levels, using an architecture designed to be extended rather than rewritten:

- **Add a level**: create `scripts/levels/YourLevel.js` extending `Level` (see `TrainingGround.js`/`City.js` for the helper methods — `addFloor`, `addBox`, `addPickup`, `spawnEnemyDef`, `setExtractionPoint`, `addObjective`), add a `<script>` tag in `index.html`, and register it in `Game.LEVEL_REGISTRY`.
- **Add an enemy type**: add an entry to `EnemyDefs` in `Enemy.js` with its stats — the state machine, hitboxes, and combat already support any new archetype automatically.
- **Add a weapon**: add an entry to `WeaponDefs` in `Weapons.js` and to `Player.weaponOrder`.
- **Swap synthesized audio for real files**: `AudioManager.js` is the single place sound is produced; each `play*` method can be pointed at an `<audio>`/buffer source instead of an oscillator without touching any other file.

## Folder structure
```
garbage-shooter/
├── index.html
├── css/
│   └── style.css
└── scripts/
    ├── Utils.js          # math helpers
    ├── SaveManager.js     # localStorage persistence
    ├── AudioManager.js    # synthesized SFX + music + 3D positional audio
    ├── Input.js           # keyboard/mouse + Pointer Lock
    ├── ParticleSystem.js  # muzzle flash / blood / impact / explosion / decals
    ├── Weapons.js         # weapon stat defs + Weapon class
    ├── Player.js          # first-person controller + shooting
    ├── Enemy.js           # enemy archetypes + AI state machine
    ├── Grenade.js         # grenade projectile + explosion
    ├── Level.js           # base level class (shared build helpers, objectives)
    ├── levels/
    │   ├── TrainingGround.js
    │   └── City.js
    ├── HUD.js             # DOM heads-up display
    ├── Menu.js            # DOM menu screens + animated menu background
    ├── Game.js            # state machine + main loop
    └── main.js            # boot
```
