/* ==========================================================================
   Menu.js
   Handles all DOM screen transitions and wires up button/settings inputs.
   Talks to Game.js through a small set of callback hooks passed in at
   construction time, keeping menu/UI logic decoupled from core game logic.
   ========================================================================== */

class Menu {
  constructor(game) {
    this.game = game;
    this.screens = {
      mainMenu: document.getElementById('main-menu'),
      levelSelect: document.getElementById('level-select'),
      settings: document.getElementById('settings-menu'),
      controls: document.getElementById('controls-menu'),
      credits: document.getElementById('credits-menu'),
      pause: document.getElementById('pause-menu'),
      end: document.getElementById('end-screen'),
      loading: document.getElementById('loading-screen')
    };
    this._returnTo = 'mainMenu'; // where "back" goes from settings (menu or pause)

    this._bindButtons();
    this._bindSettingsInputs();
    this._initMenuBackground();
  }

  _bindButtons() {
    document.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._handleAction(btn.dataset.action));
    });
  }

  _handleAction(action) {
    this.game.audio.playUIClick();
    switch (action) {
      case 'new-game': this.openLevelSelect(); break;
      case 'continue': this.game.continueGame(); break;
      case 'settings': this._returnTo = this.game.state === 'paused' ? 'pause' : 'mainMenu'; this.showOnly('settings'); break;
      case 'controls': this.showOnly('controls'); break;
      case 'credits': this.showOnly('credits'); break;
      case 'exit': this._handleExit(); break;
      case 'back-to-menu': this.showOnly(this._returnTo); break;
      case 'resume': this.game.resume(); break;
      case 'quit-to-menu': this.game.quitToMenu(); break;
    }
  }

  _handleExit() {
    // Browsers block window.close() on tabs the user opened themselves.
    // Best-effort attempt, with a friendly fallback message.
    window.close();
    alert('Thanks for playing GARBAGE SHOOTER! You can close this browser tab.');
  }

  showOnly(key) {
    Object.entries(this.screens).forEach(([k, el]) => {
      el.classList.toggle('hidden', k !== key);
    });
  }

  hideAll() {
    Object.values(this.screens).forEach(el => el.classList.add('hidden'));
  }

  openLevelSelect() {
    const list = document.getElementById('level-list');
    list.innerHTML = '';
    const progress = this.game.saveData.progress;
    Game.LEVEL_REGISTRY.forEach(entry => {
      const unlocked = progress.unlockedLevels.includes(entry.id);
      const completed = progress.completedLevels.includes(entry.id);
      const card = document.createElement('div');
      card.className = 'level-card' + (unlocked ? '' : ' locked');
      card.innerHTML = `<span class="lname">${entry.name}</span><span class="lstatus">${completed ? 'COMPLETED' : (unlocked ? 'READY' : 'LOCKED')}</span>`;
      if (unlocked) {
        card.addEventListener('click', () => {
          this.game.audio.playUIClick();
          this.game.startLevel(entry.id);
        });
      }
      list.appendChild(card);
    });
    this.showOnly('levelSelect');
  }

  showPause() { this.showOnly('pause'); }

  showEndScreen(success, stats) {
    document.getElementById('end-title').textContent = success ? 'MISSION COMPLETE' : 'YOU DIED';
    document.getElementById('end-stats').textContent = stats;
    this.showOnly('end');
  }

  showLoading() { this.showOnly('loading'); }

  goToMainMenu() { this.showOnly('mainMenu'); }

  _bindSettingsInputs() {
    const s = this.game.saveData.settings;
    const sensitivity = document.getElementById('opt-sensitivity');
    const volume = document.getElementById('opt-volume');
    const quality = document.getElementById('opt-quality');
    const fov = document.getElementById('opt-fov');
    const fullscreen = document.getElementById('opt-fullscreen');
    const invert = document.getElementById('opt-invert');

    const refresh = () => {
      sensitivity.value = s.sensitivity;
      document.getElementById('val-sensitivity').textContent = s.sensitivity.toFixed(1);
      volume.value = s.volume;
      document.getElementById('val-volume').textContent = Math.round(s.volume * 100) + '%';
      quality.value = s.quality;
      fov.value = s.fov;
      document.getElementById('val-fov').textContent = s.fov;
      fullscreen.checked = s.fullscreen;
      invert.checked = s.invertY;
    };
    refresh();

    sensitivity.addEventListener('input', () => {
      s.sensitivity = parseFloat(sensitivity.value);
      document.getElementById('val-sensitivity').textContent = s.sensitivity.toFixed(1);
      this._persist();
    });
    volume.addEventListener('input', () => {
      s.volume = parseFloat(volume.value);
      document.getElementById('val-volume').textContent = Math.round(s.volume * 100) + '%';
      this.game.audio.setVolume(s.volume);
      this._persist();
    });
    quality.addEventListener('change', () => {
      s.quality = quality.value;
      this.game.applyGraphicsQuality();
      this._persist();
    });
    fov.addEventListener('input', () => {
      s.fov = parseInt(fov.value, 10);
      document.getElementById('val-fov').textContent = s.fov;
      if (this.game.player) this.game.player.baseFov = s.fov;
      this._persist();
    });
    fullscreen.addEventListener('change', () => {
      s.fullscreen = fullscreen.checked;
      if (s.fullscreen) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
      this._persist();
    });
    invert.addEventListener('change', () => {
      s.invertY = invert.checked;
      this._persist();
    });
  }

  _persist() {
    SaveManager.save(this.game.saveData);
  }

  /** Small animated 3D background behind the main menu: drifting low-poly
   *  drone shapes over a fog horizon, rendered with its own tiny Three.js
   *  scene on the #menu-bg canvas. */
  _initMenuBackground() {
    const canvas = document.getElementById('menu-bg');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x11140d);
    scene.fog = new THREE.Fog(0x11140d, 10, 55);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 4, 14);
    camera.lookAt(0, 2, 0);

    const hemi = new THREE.HemisphereLight(0x556644, 0x111108, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xe8a13a, 0.9);
    sun.position.set(-10, 20, 10);
    scene.add(sun);

    const floorGeo = new THREE.PlaneGeometry(200, 200);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1c1f16, roughness: 1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const shapes = [];
    const geoTypes = [
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1, 0),
      new THREE.TetrahedronGeometry(1.2, 0)
    ];
    for (let i = 0; i < 14; i++) {
      const geo = geoTypes[i % geoTypes.length];
      const mat = new THREE.MeshStandardMaterial({ color: 0x3d4a30, roughness: 0.6, metalness: 0.2, flatShading: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(Utils.randRange(-20, 20), Utils.randRange(1, 8), Utils.randRange(-30, 5));
      mesh.scale.setScalar(Utils.randRange(0.5, 1.8));
      scene.add(mesh);
      shapes.push({ mesh, speed: Utils.randRange(0.2, 0.6), spin: Utils.randRange(0.2, 0.8) });
    }

    const clock = new THREE.Clock();
    const animate = () => {
      if (!this.screens.mainMenu.classList.contains('hidden')) {
        const dt = clock.getDelta();
        shapes.forEach(s => {
          s.mesh.rotation.x += s.spin * dt;
          s.mesh.rotation.y += s.spin * 0.7 * dt;
          s.mesh.position.y += Math.sin(performance.now() * 0.0005 * s.speed) * 0.01;
        });
        camera.position.x = Math.sin(performance.now() * 0.00012) * 4;
        camera.lookAt(0, 2, -5);
        renderer.render(scene, camera);
      }
      requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
}
