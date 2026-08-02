/* ==========================================================================
   Player.js
   First person player controller. Owns the camera, movement physics
   (acceleration/deceleration, gravity, jump, sprint, crouch, stamina,
   fall damage), simple cylinder-vs-box collision against level walls,
   the weapon inventory, and hitscan shooting logic.
   ========================================================================== */

class Player {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;

    // Transform
    this.position = new THREE.Vector3(0, 1.7, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.4;
    this.standHeight = 1.7;
    this.crouchHeight = 1.05;
    this.currentHeight = this.standHeight;

    // Stats
    this.maxHealth = 100; this.health = 100;
    this.maxArmor = 100; this.armor = 0;
    this.maxStamina = 100; this.stamina = 100;
    this.alive = true;

    // Movement state
    this.grounded = false;
    this.sprinting = false;
    this.crouching = false;
    this.wasFalling = false;
    this.fallStartY = 0;
    this.speedWalk = 5.0;
    this.speedSprint = 8.2;
    this.speedCrouch = 2.6;
    this.jumpForce = 6.0;
    this.gravity = -18;

    // Combat
    this.weaponOrder = ['pistol', 'assault_rifle', 'shotgun', 'sniper_rifle'];
    this.weapons = {
      pistol: new Weapon('pistol'),
      assault_rifle: new Weapon('assault_rifle'),
      shotgun: new Weapon('shotgun'),
      sniper_rifle: new Weapon('sniper_rifle')
    };
    this.currentWeaponIndex = 0;
    this.switchCooldown = 0;
    this.grenades = 3;
    this.grenadeThrowCooldown = 0;
    this.kills = 0;
    this.footstepTimer = 0;

    this.headBobPhase = 0;
    this.baseFov = game.saveData.settings.fov;
    this.currentFovOffset = 0;

    this.onDeath = null; // callback
  }

  get currentWeapon() {
    return this.weapons[this.weaponOrder[this.currentWeaponIndex]];
  }

  takeDamage(amount, isExplosion) {
    if (!this.alive) return;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.6);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    this.game.audio.playHurt(this.position);
    this.game.hud.flashDamage();
    this.game.hud.shakeScreen(isExplosion ? 0.5 : 0.25);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      if (this.onDeath) this.onDeath();
    }
  }

  addHealth(amount) { this.health = Math.min(this.maxHealth, this.health + amount); }
  addArmor(amount) { this.armor = Math.min(this.maxArmor, this.armor + amount); }
  addAmmo(weaponId, amount) {
    const w = this.weapons[weaponId];
    if (w) w.ammoReserve = Math.min(w.def.reserveMax * 2, w.ammoReserve + amount);
  }

  handleMouseLook(dx, dy, sensitivity, invertY) {
    this.yaw -= dx * sensitivity * 0.0022;
    const dir = invertY ? 1 : -1;
    this.pitch += dy * sensitivity * 0.0022 * dir;
    this.pitch = Utils.clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
  }

  _resolveCollisions(nextPos, level) {
    // Cylinder (radius) vs axis-aligned box colliders, resolved per-axis.
    for (const box of level.colliders) {
      const closestX = Utils.clamp(nextPos.x, box.min.x, box.max.x);
      const closestZ = Utils.clamp(nextPos.z, box.min.z, box.max.z);
      const dx = nextPos.x - closestX;
      const dz = nextPos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < this.radius * this.radius && nextPos.y < box.max.y + 0.05 && nextPos.y + this.currentHeight > box.min.y) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = this.radius - dist;
        nextPos.x += (dx / dist) * overlap;
        nextPos.z += (dz / dist) * overlap;
      }
    }
    return nextPos;
  }

  update(dt, input, level) {
    if (!this.alive) return;

    const settings = this.game.saveData.settings;

    // ---- Look ----
    if (input.locked) {
      this.handleMouseLook(input.mouseDX, input.mouseDY, settings.sensitivity, settings.invertY);
    }
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);

    // ---- Crouch ----
    this.crouching = input.isDown('crouch');
    const targetHeight = this.crouching ? this.crouchHeight : this.standHeight;
    this.currentHeight = Utils.damp(this.currentHeight, targetHeight, 10, dt);

    // ---- Sprint / stamina ----
    const wantsSprint = input.isDown('sprint') && !this.crouching;
    const moving = input.isDown('forward') || input.isDown('back') || input.isDown('left') || input.isDown('right');
    this.sprinting = wantsSprint && moving && this.stamina > 0.5;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - 22 * dt);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 14 * dt);
    }

    // ---- Horizontal movement (accel/decel) ----
    let targetSpeed = this.crouching ? this.speedCrouch : (this.sprinting ? this.speedSprint : this.speedWalk);
    const moveDir = new THREE.Vector3();
    const forward = new THREE.Vector3(Math.sin(this.yaw) * -1, 0, Math.cos(this.yaw) * -1);
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    if (input.isDown('forward')) moveDir.add(forward);
    if (input.isDown('back')) moveDir.sub(forward);
    if (input.isDown('right')) moveDir.add(right);
    if (input.isDown('left')) moveDir.sub(right);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const targetVel = moveDir.multiplyScalar(targetSpeed);
    const accel = this.grounded ? 10 : 3;
    this.velocity.x = Utils.damp(this.velocity.x, targetVel.x, accel, dt);
    this.velocity.z = Utils.damp(this.velocity.z, targetVel.z, accel, dt);

    // ---- Jump / gravity ----
    if (this.grounded && input.wasPressed('jump')) {
      this.velocity.y = this.jumpForce;
      this.grounded = false;
      this.game.audio.playJump(this.position);
    }
    if (!this.grounded) {
      this.velocity.y += this.gravity * dt;
      if (!this.wasFalling && this.velocity.y < -0.1) {
        this.wasFalling = true;
        this.fallStartY = this.position.y;
      }
    }

    // ---- Integrate position ----
    const nextPos = this.position.clone();
    nextPos.x += this.velocity.x * dt;
    nextPos.z += this.velocity.z * dt;
    nextPos.y += this.velocity.y * dt;

    // Ground collision (flat ground at y=0 baseline, plus level-defined platforms)
    const groundY = level.getGroundHeight ? level.getGroundHeight(nextPos.x, nextPos.z) : 0;
    if (nextPos.y <= groundY) {
      if (this.wasFalling) {
        const fallDist = this.fallStartY - groundY;
        if (fallDist > 4.2) {
          const dmg = Math.floor((fallDist - 4.2) * 9);
          this.takeDamage(dmg);
          this.game.audio.playLand(this.position);
        }
        this.wasFalling = false;
      }
      nextPos.y = groundY;
      this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this._resolveCollisions(nextPos, level);
    this.position.copy(nextPos);
    this.camera.position.set(this.position.x, this.position.y + this.currentHeight, this.position.z);

    // ---- Head bob ----
    const speedFrac = Math.min(1, new THREE.Vector2(this.velocity.x, this.velocity.z).length() / this.speedSprint);
    if (this.grounded && speedFrac > 0.05) {
      this.headBobPhase += dt * (this.sprinting ? 14 : 9);
      const bob = Math.sin(this.headBobPhase) * 0.045 * speedFrac;
      this.camera.position.y += bob;
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.game.audio.playFootstep(this.position, level.surfaceType || 'ground');
        this.footstepTimer = this.sprinting ? 0.28 : 0.42;
      }
    } else {
      this.headBobPhase = 0;
    }

    // ---- Weapons ----
    const weapon = this.currentWeapon;
    weapon.update(dt);
    weapon.aiming = input.mouseButtons.right && !weapon.reloading;

    // FOV for ADS / sprint
    const targetFovOffset = weapon.aiming ? -(this.baseFov - this.baseFov / weapon.def.adsZoom) : (this.sprinting ? 6 : 0);
    this.currentFovOffset = Utils.damp(this.currentFovOffset, targetFovOffset, 10, dt);
    this.camera.fov = this.baseFov + this.currentFovOffset;
    this.camera.updateProjectionMatrix();

    if (this.switchCooldown > 0) this.switchCooldown -= dt;
    if (this.grenadeThrowCooldown > 0) this.grenadeThrowCooldown -= dt;

    // Weapon switching (number keys handled in Game.js via keyWasPressed; scroll here)
    if (input.scrollDelta !== 0 && this.switchCooldown <= 0) {
      const dir = input.scrollDelta > 0 ? 1 : -1;
      this.switchWeapon((this.currentWeaponIndex + dir + this.weaponOrder.length) % this.weaponOrder.length);
    }

    if (input.wasPressed('reload')) {
      if (weapon.startReload()) this.game.audio.playReload(this.position);
    }

    // Firing
    if (input.mouseButtons.left) {
      this._tryFire(weapon, level);
    }
  }

  switchWeapon(index) {
    if (index === this.currentWeaponIndex) return;
    this.currentWeaponIndex = index;
    this.switchCooldown = 0.35;
    this.currentWeapon.aiming = false;
  }

  _tryFire(weapon, level) {
    if (weapon.reloading) return;
    if (weapon.ammoInMag <= 0) {
      if (weapon.cooldown <= 0) {
        this.game.audio.playDryFire(this.position);
        weapon.cooldown = 0.25;
      }
      return;
    }
    if (!weapon.fire()) return;

    this.game.audio.playGunshot(weapon.def.id, this.position);
    this.game.hud.shakeScreen(0.06 + weapon.def.recoilKick);

    const muzzlePos = this.camera.position.clone();
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    this.game.particles.muzzleFlash(muzzlePos.clone().addScaledVector(camDir, 0.5), camDir);

    const rightVec = new THREE.Vector3().crossVectors(camDir, this.camera.up).normalize();
    const upVec = new THREE.Vector3().crossVectors(rightVec, camDir).normalize();

    for (let p = 0; p < weapon.def.pellets; p++) {
      const spread = weapon.getCurrentSpread();
      const dir = camDir.clone()
        .addScaledVector(rightVec, Utils.randRange(-spread, spread))
        .addScaledVector(upVec, Utils.randRange(-spread, spread))
        .normalize();
      this._fireHitscan(muzzlePos, dir, weapon, level);
    }
  }

  _fireHitscan(origin, dir, weapon, level) {
    const raycaster = new THREE.Raycaster(origin, dir, 0.1, weapon.def.range);
    let closestHit = null;
    let closestDist = Infinity;
    let hitEnemy = null;
    let isHeadshot = false;

    for (const enemy of this.game.enemies) {
      if (!enemy.alive) continue;
      const hit = enemy.raycastHit(raycaster);
      if (hit && hit.distance < closestDist) {
        closestDist = hit.distance;
        closestHit = hit.point;
        hitEnemy = enemy;
        isHeadshot = hit.isHeadshot;
      }
    }

    // Level geometry (walls)
    const levelHits = raycaster.intersectObjects(level.collisionMeshes, false);
    if (levelHits.length > 0 && levelHits[0].distance < closestDist) {
      closestDist = levelHits[0].distance;
      closestHit = levelHits[0].point;
      this.game.particles.bulletImpact(levelHits[0].point, levelHits[0].face.normal.clone().transformDirection(levelHits[0].object.matrixWorld));
      hitEnemy = null;
    }

    if (hitEnemy) {
      const mult = isHeadshot ? weapon.def.headshotMultiplier : 1;
      const dmg = weapon.def.damage * mult;
      const killed = hitEnemy.takeDamage(dmg, isHeadshot);
      this.game.particles.bloodSplatter(closestHit);
      this.game.hud.showHitmarker(isHeadshot);
      this.game.audio.playHitmarker();
      if (isHeadshot) this.game.audio.playHeadshotChime();
      if (killed) {
        this.kills++;
        this.game.hud.updateKills(this.kills);
      }
    }
  }

  throwGrenade(level) {
    if (this.grenades <= 0 || this.grenadeThrowCooldown > 0) return;
    this.grenades--;
    this.grenadeThrowCooldown = 0.8;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const grenade = new Grenade(this.camera.position.clone().addScaledVector(dir, 0.8), dir.multiplyScalar(14).add(new THREE.Vector3(0, 4, 0)), this.game);
    this.game.grenadesActive.push(grenade);
  }
}
