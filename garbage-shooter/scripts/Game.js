/* ==========================================================================
   Game.js
   Top-level orchestrator. Owns the Three.js scene/renderer/camera, the
   game state machine (menu / loading / playing / paused / end), the
   active level + player + enemies + grenades + particles, and the main
   animation loop. Also exposes the level registry other files (Menu.js)
   read from to build the level-select screen.

   Adding a new level later: 1) write scripts/levels/YourLevel.js extending
   Level, 2) add a <script> tag for it in index.html, 3) add an entry to
   Game.LEVEL_REGISTRY below.
   ========================================================================== */

class Game {
  static LEVEL_REGISTRY = [
    { id: 'training_ground', name: 'Training Ground', ctor: () => TrainingGround, next: 'city' },
    { id: 'city', name: 'City', ctor: () => City, next: null }
  ];

  constructor() {
    this.saveData = SaveManager.load();
    this.state = 'menu'; // menu | loading | playing | paused | end
    this.enemies = [];
    this.grenadesActive = [];
    this.keycards = 0;

    this._setupRenderer();
    this._setupScene();

    this.audio = new AudioManager();
    this.audio.setVolume(this.saveData.settings.volume);
    this.particles = new ParticleSystem(this.scene);
    this.hud = new HUD();
    this.menu = new Menu(this);

    this.input = new InputManager(this.renderer.domElement, this.saveData.settings.keybinds);

    this.clock = new THREE.Clock();
    this.level = null;
    this.player = null;

    this._bindGlobalHandlers();
    this.applyGraphicsQuality();
    this.menu.goToMainMenu();

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _setupRenderer() {
    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.saveData.settings.fov, window.innerWidth / window.innerHeight, 0.1, 500);
  }

  _bindGlobalHandlers() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) {
        this.input.requestLock();
        this.audio.resume();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'playing' && !this.input.locked) {
        this.pause();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pause();
      else if (e.code === 'Escape' && this.state === 'paused') this.resume();
    });
  }

  applyGraphicsQuality() {
    const q = this.saveData.settings.quality;
    const map = { low: 1, medium: Math.min(window.devicePixelRatio, 1.5), high: Math.min(window.devicePixelRatio, 2) };
    this.renderer.setPixelRatio(map[q] || 1);
    this.renderer.shadowMap.enabled = q !== 'low';
    if (this.level && this.level.sun) this.level.sun.castShadow = q !== 'low';
  }

  // ---- Flow control -------------------------------------------------------

  continueGame() {
    const ids = this.saveData.progress.completedLevels;
    const next = this.saveData.progress.unlockedLevels.find(id => !ids.includes(id)) || this.saveData.progress.unlockedLevels[this.saveData.progress.unlockedLevels.length - 1];
    if (next) this.startLevel(next);
    else this.menu.openLevelSelect();
  }

  startLevel(levelId) {
    this.menu.showLoading();
    // slight timeout lets the loading panel paint before heavy scene build
    setTimeout(() => this._buildLevel(levelId), 30);
  }

  _buildLevel(levelId) {
    this._teardownLevel();

    const entry = Game.LEVEL_REGISTRY.find(l => l.id === levelId);
    if (!entry) { console.error('Unknown level', levelId); this.menu.goToMainMenu(); return; }

    try {
      const LevelClass = entry.ctor();
      this.level = new LevelClass(this);
      this.level.build();
      this.level.spawnAllEnemies();

      this.player = new Player(this.camera, this);
      this.player.position.copy(this.level.playerSpawn);
      this.player.onDeath = () => this._onPlayerDeath();
      this.currentLevelEntry = entry;
    } catch (err) {
      // A level failing to build should never leave the player stuck on the
      // loading screen indefinitely - surface the error and return to the menu.
      console.error(`[Game] Failed to build level "${levelId}":`, err);
      this.level = null;
      this.menu.goToMainMenu();
      alert(`Sorry, "${entry.name}" failed to load due to an internal error. Please check the browser console for details.`);
      return;
    }

    this.audio.startMusic();
    this.state = 'playing';
    this.menu.hideAll();
    this.hud.show();
    this.hud.updateKills(0);
    this.input.requestLock();
  }

  _teardownLevel() {
    if (this.level) this.level.dispose();
    this.enemies.forEach(e => e.dispose());
    this.enemies = [];
    this.grenadesActive.forEach(g => { if (!g.exploded) { this.scene.remove(g.mesh); } });
    this.grenadesActive = [];
    this.keycards = 0;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.exitLock();
    this.menu.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.menu.hideAll();
    this.hud.show();
    this.input.requestLock();
  }

  quitToMenu() {
    this._teardownLevel();
    this.state = 'menu';
    this.hud.hide();
    this.input.exitLock();
    this.audio.stopMusic();
    this.menu.goToMainMenu();
  }

  _onPlayerDeath() {
    this.state = 'end';
    this.input.exitLock();
    this.audio.stopMusic();
    setTimeout(() => this.hud.hide(), 300);
    this.menu.showEndScreen(false, `Kills: ${this.player.kills}`);
  }

  _onMissionComplete() {
    this.state = 'end';
    this.input.exitLock();
    this.audio.stopMusic();
    this.hud.hide();
    const entry = this.currentLevelEntry;
    SaveManager.markLevelComplete(this.saveData, entry.id, entry.next, this.player.kills);
    this.menu.showEndScreen(true, `Kills: ${this.player.kills}  |  Grenades left: ${this.player.grenades}`);
  }

  // ---- Main loop ------------------------------------------------------------

  _handleWeaponHotkeys() {
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
    keys.forEach((code, i) => {
      if (this.input.keyWasPressed(code) && this.player.switchCooldown <= 0) {
        this.player.switchWeapon(i);
      }
    });
    if (this.input.keyWasPressed(this.saveData.settings.keybinds.grenade)) {
      this.player.throwGrenade(this.level);
    }
  }

  _applyScreenShake(dt) {
    // IMPORTANT: never write camera.rotation.x/y/z directly here. The camera's
    // orientation is built in Player.js purely via quaternion composition
    // (rotateY(yaw) then rotateX(pitch)), and reading that back as XYZ-order
    // Euler angles can produce large, non-obvious x/y values once yaw/pitch
    // are non-trivial (e.g. yaw=90, pitch=40 decomposes to euler ~(90,50,-90),
    // not the "obvious" (40,90,0)). Setting .rotation.z alone forces Three.js
    // to rebuild the whole quaternion from those x/y values plus the new z,
    // which reconstructs a DIFFERENT orientation: the forward (look) direction
    // stays correct, but the up vector - and therefore the on-screen horizon -
    // ends up tilted by an amount that grows with the current yaw/pitch. That
    // was the actual cause of the view appearing to roll/spin during play.
    // camera.rotateZ() avoids all of this: it post-multiplies the existing
    // quaternion by a small roll, which by construction can never change the
    // forward direction and never needs to read/rebuild from Euler angles.
    const s = this.hud.shakeIntensity;
    if (s > 0) {
      const rollJitter = (Math.random() - 0.5) * 0.02 * s;
      this.camera.rotateZ(rollJitter);
      this.camera.position.x += (Math.random() - 0.5) * 0.03 * s;
      this.camera.position.y += (Math.random() - 0.5) * 0.03 * s;
    }
    // No "else" reset needed: Player.js already rebuilds the camera's rotation
    // from scratch (rotation.set(0,0,0) + rotateY + rotateX) at the start of
    // every frame, before this method runs, so there is nothing left over to
    // clear when shake is inactive - each frame starts perfectly level.
  }

  _animate() {
    requestAnimationFrame(this._animate);
    const dt = Math.min(this.clock.getDelta(), 0.05); // clamp to avoid huge steps on tab-switch

    if (this.state === 'playing' && this.player && this.level) {
      this.player.update(dt, this.input, this.level);
      this.audio.updateListener(this.player.camera.position, (() => { const d = new THREE.Vector3(); this.player.camera.getWorldDirection(d); return d; })());

      for (const enemy of this.enemies) enemy.update(dt, this.level);
      this.enemies = this.enemies.filter(e => {
        if (e.isReadyForCleanup()) { e.dispose(); return false; }
        return true;
      });

      for (const g of this.grenadesActive) g.update(dt, this.level);
      this.grenadesActive = this.grenadesActive.filter(g => !g.exploded);

      this.level.updatePickups(dt);
      this.level.updateObjectives();
      this.particles.update(dt);
      this._handleWeaponHotkeys();
      this._applyScreenShake(dt);
      this.hud.update(dt, this);

      if (this.level.isMissionComplete()) this._onMissionComplete();

      this.input.endFrame();
    }

    this.renderer.render(this.scene, this.camera);
  }
}
