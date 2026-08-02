/* ==========================================================================
   HUD.js
   Manages all DOM-based heads-up-display elements. Reads player/game
   state each frame and updates bars, counters, crosshair state, the
   minimap, and transient effects (hit markers, damage vignette, screen
   shake magnitude which Game.js applies to the camera).
   ========================================================================== */

class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      crosshair: document.getElementById('crosshair'),
      hitmarker: document.getElementById('hitmarker'),
      vignette: document.getElementById('damage-vignette'),
      objectiveText: document.getElementById('objective-text'),
      minimap: document.getElementById('minimap'),
      healthBar: document.getElementById('health-bar'),
      armorBar: document.getElementById('armor-bar'),
      staminaBar: document.getElementById('stamina-bar'),
      ammoCurrent: document.getElementById('ammo-current'),
      ammoReserve: document.getElementById('ammo-reserve'),
      weaponName: document.getElementById('weapon-name'),
      killCount: document.getElementById('kill-count'),
      fpsValue: document.getElementById('fps-value'),
      reloadIndicator: document.getElementById('reload-indicator'),
      grenadeCount: document.getElementById('grenade-count'),
      interactPrompt: document.getElementById('interact-prompt')
    };
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.shakeIntensity = 0;
    this.vignetteTimer = 0;
    this._fpsFrames = 0;
    this._fpsTimer = 0;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  showHitmarker(isHeadshot) {
    const el = this.el.hitmarker;
    el.classList.remove('show');
    void el.offsetWidth; // restart animation
    el.style.background = isHeadshot
      ? 'linear-gradient(45deg, transparent 45%, #e8a13a 45%, #e8a13a 55%, transparent 55%), linear-gradient(-45deg, transparent 45%, #e8a13a 45%, #e8a13a 55%, transparent 55%)'
      : '';
    el.classList.add('show');
  }

  flashDamage() {
    this.el.vignette.classList.add('show');
    this.vignetteTimer = 0.4;
  }

  flashObjectiveComplete() {
    this.el.objectiveText.style.color = '#6f9a3c';
    setTimeout(() => { this.el.objectiveText.style.color = ''; }, 600);
  }

  shakeScreen(amount) {
    this.shakeIntensity = Math.min(1.5, this.shakeIntensity + amount);
  }

  updateKills(count) {
    this.el.killCount.textContent = count;
  }

  setInteractPrompt(text) {
    if (text) {
      this.el.interactPrompt.textContent = text;
      this.el.interactPrompt.classList.remove('hidden');
    } else {
      this.el.interactPrompt.classList.add('hidden');
    }
  }

  update(dt, game) {
    const player = game.player;
    const level = game.level;

    // Bars
    this.el.healthBar.style.width = `${Utils.clamp(player.health / player.maxHealth, 0, 1) * 100}%`;
    this.el.armorBar.style.width = `${Utils.clamp(player.armor / player.maxArmor, 0, 1) * 100}%`;
    this.el.staminaBar.style.width = `${Utils.clamp(player.stamina / player.maxStamina, 0, 1) * 100}%`;

    // Weapon / ammo
    const weapon = player.currentWeapon;
    this.el.ammoCurrent.textContent = weapon.ammoInMag;
    this.el.ammoReserve.textContent = weapon.ammoReserve;
    this.el.weaponName.textContent = weapon.def.name;
    this.el.reloadIndicator.classList.toggle('hidden', !weapon.reloading);
    this.el.crosshair.classList.toggle('ads', weapon.aiming);
    this.el.grenadeCount.textContent = player.grenades;

    // Objective
    const obj = level ? level.currentObjective : null;
    this.el.objectiveText.textContent = obj ? obj.description : 'Mission complete';

    // Vignette decay
    if (this.vignetteTimer > 0) {
      this.vignetteTimer -= dt;
      if (this.vignetteTimer <= 0) this.el.vignette.classList.remove('show');
    }

    // Shake decay
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Utils.damp(this.shakeIntensity, 0, 6, dt);
      if (this.shakeIntensity < 0.01) this.shakeIntensity = 0;
    }

    // FPS counter
    this._fpsFrames++;
    this._fpsTimer += dt;
    if (this._fpsTimer >= 0.5) {
      this.el.fpsValue.textContent = Math.round(this._fpsFrames / this._fpsTimer);
      this._fpsFrames = 0; this._fpsTimer = 0;
    }

    if (level) this._drawMinimap(player, level, game.enemies);
  }

  _drawMinimap(player, level, enemies) {
    const ctx = this.minimapCtx;
    const size = 140;
    const range = 40; // world units shown across the minimap radius
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(20,22,15,0.9)';
    ctx.fillRect(0, 0, size, size);

    const toMap = (worldX, worldZ) => {
      // rotate world into player-relative space so the map is forward-up
      const relX = worldX - player.position.x;
      const relZ = worldZ - player.position.z;
      const cos = Math.cos(-player.yaw), sin = Math.sin(-player.yaw);
      const rx = relX * cos - relZ * sin;
      const rz = relX * sin + relZ * cos;
      return { x: size / 2 + (rx / range) * (size / 2), y: size / 2 + (rz / range) * (size / 2) };
    };

    // enemies
    for (const e of enemies) {
      if (!e.alive) continue;
      const p = toMap(e.group.position.x, e.group.position.z);
      if (p.x < 0 || p.x > size || p.y < 0 || p.y > size) continue;
      ctx.fillStyle = e.state === 'attack' || e.state === 'chase' ? '#c93c34' : '#8a611f';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }

    // extraction point
    if (level.extractionPoint) {
      const p = toMap(level.extractionPoint.x, level.extractionPoint.z);
      ctx.fillStyle = '#3ab0e8';
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }

    // player (always centered, arrow points up/forward)
    ctx.fillStyle = '#e8a13a';
    ctx.beginPath();
    ctx.moveTo(size / 2, size / 2 - 6);
    ctx.lineTo(size / 2 - 5, size / 2 + 5);
    ctx.lineTo(size / 2 + 5, size / 2 + 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.strokeStyle = '#8a611f';
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2); ctx.stroke();
  }
}
