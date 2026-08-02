/* ==========================================================================
   Enemy.js
   Enemy AI with a finite state machine: PATROL -> CHASE -> ATTACK -> SEARCH
   (returns to PATROL if search times out). Enemies use line-of-sight
   raycasts against level geometry to detect the player, and hitscan
   attacks of their own once in range. Each enemy is a body+head mesh pair
   so player shots can register headshots.
   ========================================================================== */

const EnemyDefs = {
  soldier: {
    name: 'Soldier', health: 80, moveSpeed: 2.6, sightRange: 22, fov: 100,
    attackRange: 16, fireRate: 0.9, damage: 8, accuracy: 0.65,
    color: 0x4a5a3c, scale: 1.0, weaponType: 'assault_rifle'
  },
  heavy_soldier: {
    name: 'Heavy Soldier', health: 180, moveSpeed: 1.6, sightRange: 18, fov: 90,
    attackRange: 10, fireRate: 1.3, damage: 14, accuracy: 0.55,
    color: 0x3c3c40, scale: 1.25, weaponType: 'shotgun'
  },
  sniper: {
    name: 'Sniper', health: 60, moveSpeed: 1.8, sightRange: 40, fov: 70,
    attackRange: 40, fireRate: 2.2, damage: 30, accuracy: 0.85,
    color: 0x2f3b2a, scale: 1.0, weaponType: 'sniper_rifle', keepsDistance: true
  },
  boss: {
    name: 'Warlord', health: 900, moveSpeed: 2.0, sightRange: 30, fov: 140,
    attackRange: 20, fireRate: 0.5, damage: 18, accuracy: 0.6,
    color: 0x6b1f1f, scale: 2.2, weaponType: 'assault_rifle', isBoss: true
  }
};

const EnemyState = { PATROL: 'patrol', CHASE: 'chase', ATTACK: 'attack', SEARCH: 'search', DEAD: 'dead' };

class Enemy {
  constructor(type, position, patrolPoints, scene, game) {
    this.type = type;
    this.def = EnemyDefs[type];
    this.game = game;
    this.scene = scene;
    this.health = this.def.health;
    this.alive = true;
    this.state = EnemyState.PATROL;
    this.patrolPoints = patrolPoints && patrolPoints.length ? patrolPoints : [position.clone()];
    this.patrolIndex = 0;
    this.position = position.clone();
    this.lastKnownPlayerPos = null;
    this.searchTimer = 0;
    this.attackCooldown = 0;
    this.alertedRecently = 0;
    this.deathTimer = 0;
    this.hitFlashTimer = 0;

    // Collision capsule (cylinder vs AABB, same technique as Player.js) so
    // enemies are blocked by and slide along walls/obstacles instead of
    // walking through them or getting stuck embedded inside them.
    this.radius = 0.42 * this.def.scale;
    this.height = 1.8 * this.def.scale;

    this._buildMesh();
  }

  _buildMesh() {
    const s = this.def.scale;
    this.group = new THREE.Group();

    // Three.js r128 has no CapsuleGeometry (added in r142+); approximate with a cylinder.
    const bodyGeo = new THREE.CylinderGeometry(0.32 * s, 0.38 * s, 1.3 * s, 8);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: this.def.color, roughness: 0.8 });
    this.bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.bodyMesh.position.y = 0.68 * s;
    this.bodyMesh.castShadow = true;
    this.bodyMesh.userData.enemy = this;
    this.bodyMesh.userData.isHead = false;

    const headGeo = new THREE.SphereGeometry(0.22 * s, 10, 10);
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xd9b18a, roughness: 0.9 });
    this.headMesh = new THREE.Mesh(headGeo, this.headMat);
    this.headMesh.position.y = 1.45 * s;
    this.headMesh.castShadow = true;
    this.headMesh.userData.enemy = this;
    this.headMesh.userData.isHead = true;

    this.group.add(this.bodyMesh, this.headMesh);
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.raycastTargets = [this.bodyMesh, this.headMesh];
  }

  raycastHit(raycaster) {
    if (!this.alive) return null;
    const hits = raycaster.intersectObjects(this.raycastTargets, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    return { point: hit.point, distance: hit.distance, isHeadshot: hit.object.userData.isHead };
  }

  takeDamage(amount, isHeadshot) {
    if (!this.alive) return false;
    this.health -= amount;
    this.hitFlashTimer = 0.12;
    if (this.state === EnemyState.PATROL || this.state === EnemyState.SEARCH) {
      this.state = EnemyState.CHASE;
      this.lastKnownPlayerPos = this.game.player.position.clone();
    }
    if (this.health <= 0) {
      this._die();
      return true;
    }
    return false;
  }

  _die() {
    this.alive = false;
    this.state = EnemyState.DEAD;
    this.deathTimer = 1.2;
    this.game.audio.playEnemyDeath(this.position);
    this.game.particles.bloodSplatter(this.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
  }

  _hasLineOfSight(playerPos, level) {
    const from = this.group.position.clone().add(new THREE.Vector3(0, 1.6 * this.def.scale, 0));
    const dir = playerPos.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(from, dir, 0.1, dist - 0.3);
    const hits = ray.intersectObjects(level.collisionMeshes, false);
    return hits.length === 0;
  }

  _canSeePlayer(playerPos, level) {
    const dist = Utils.distance3D(this.group.position, playerPos);
    if (dist > this.def.sightRange) return false;
    const toPlayer = playerPos.clone().sub(this.group.position).setY(0).normalize();
    const forward = new THREE.Vector3(Math.sin(this.facingYaw || 0), 0, Math.cos(this.facingYaw || 0));
    const angle = THREE.MathUtils.radToDeg(forward.angleTo(toPlayer));
    if (angle > this.def.fov / 2 && this.state !== EnemyState.CHASE && this.state !== EnemyState.ATTACK) return false;
    return this._hasLineOfSight(playerPos, level);
  }

  _resolveCollisions(nextPos, level) {
    // Cylinder (radius) vs axis-aligned box colliders, resolved per-axis -
    // identical technique to Player._resolveCollisions, so enemies respect
    // the exact same walls/obstacles the player does.
    for (const box of level.colliders) {
      const closestX = Utils.clamp(nextPos.x, box.min.x, box.max.x);
      const closestZ = Utils.clamp(nextPos.z, box.min.z, box.max.z);
      const dx = nextPos.x - closestX;
      const dz = nextPos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < this.radius * this.radius &&
          nextPos.y < box.max.y + 0.05 &&
          nextPos.y + this.height > box.min.y) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = this.radius - dist;
        nextPos.x += (dx / dist) * overlap;
        nextPos.z += (dz / dist) * overlap;
      }
    }
    return nextPos;
  }

  _moveToward(target, dt, speedMult, level) {
    const dir = target.clone().sub(this.group.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist < 0.15) return true;
    dir.normalize();
    const speed = this.def.moveSpeed * (speedMult || 1);
    const nextPos = this.group.position.clone().addScaledVector(dir, speed * dt);
    this._resolveCollisions(nextPos, level);
    this.group.position.copy(nextPos);
    this.facingYaw = Math.atan2(dir.x, dir.z);
    this.group.rotation.y = this.facingYaw;
    return false;
  }

  update(dt, level) {
    if (!this.alive) {
      this.deathTimer -= dt;
      // simple death animation: sink and tip over
      this.group.rotation.z = Utils.damp(this.group.rotation.z, Math.PI / 2, 4, dt);
      this.group.position.y = Utils.damp(this.group.position.y, this.position.y - 0.5, 4, dt);
      return;
    }

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      this.bodyMat.emissive = new THREE.Color(0xff0000);
      this.bodyMat.emissiveIntensity = this.hitFlashTimer > 0 ? 0.6 : 0;
    } else if (this.bodyMat.emissiveIntensity) {
      this.bodyMat.emissiveIntensity = 0;
    }

    const player = this.game.player;
    const playerVisible = player.alive && this._canSeePlayer(player.position, level);

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    switch (this.state) {
      case EnemyState.PATROL: {
        if (playerVisible) {
          this.state = EnemyState.CHASE;
          this.lastKnownPlayerPos = player.position.clone();
          this.game.audio.playEnemyAlert(this.group.position);
          break;
        }
        const target = this.patrolPoints[this.patrolIndex];
        if (this._moveToward(target, dt, 0.6, level)) {
          this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
        }
        break;
      }
      case EnemyState.CHASE: {
        if (playerVisible) {
          this.lastKnownPlayerPos = player.position.clone();
          const dist = Utils.distance3D(this.group.position, player.position);
          if (dist <= this.def.attackRange) {
            this.state = EnemyState.ATTACK;
          } else if (this.def.keepsDistance && dist < this.def.attackRange * 0.5) {
            // sniper backs off a bit
            this._moveToward(this.group.position.clone().addScaledVector(
              this.group.position.clone().sub(player.position).normalize(), 5), dt, 1, level);
          } else {
            this._moveToward(player.position, dt, 1, level);
          }
        } else if (this.lastKnownPlayerPos) {
          const reached = this._moveToward(this.lastKnownPlayerPos, dt, 1, level);
          if (reached) {
            this.state = EnemyState.SEARCH;
            this.searchTimer = 4;
          }
        }
        break;
      }
      case EnemyState.ATTACK: {
        if (!playerVisible) {
          this.state = EnemyState.CHASE;
          break;
        }
        this.lastKnownPlayerPos = player.position.clone();
        const dist = Utils.distance3D(this.group.position, player.position);
        // face player
        const toPlayer = player.position.clone().sub(this.group.position);
        this.facingYaw = Math.atan2(toPlayer.x, toPlayer.z);
        this.group.rotation.y = this.facingYaw;

        if (dist > this.def.attackRange * 1.15) {
          this.state = EnemyState.CHASE;
          break;
        }
        if (this.def.keepsDistance && dist < this.def.attackRange * 0.4) {
          this._moveToward(this.group.position.clone().addScaledVector(toPlayer.clone().normalize(), -3), dt, 1, level);
        }
        if (this.attackCooldown <= 0) {
          this._performAttack(player, level);
          this.attackCooldown = this.def.fireRate;
        }
        break;
      }
      case EnemyState.SEARCH: {
        if (playerVisible) {
          this.state = EnemyState.CHASE;
          break;
        }
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) {
          this.state = EnemyState.PATROL;
          this.lastKnownPlayerPos = null;
        }
        break;
      }
    }

    this.position.copy(this.group.position);
  }

  _performAttack(player, level) {
    const from = this.group.position.clone().add(new THREE.Vector3(0, 1.5 * this.def.scale, 0));
    const to = player.camera.position.clone();
    const dir = to.sub(from).normalize();
    // accuracy-based spread
    const spread = (1 - this.def.accuracy) * 0.25;
    dir.x += Utils.randRange(-spread, spread);
    dir.y += Utils.randRange(-spread, spread);
    dir.z += Utils.randRange(-spread, spread);
    dir.normalize();

    this.game.audio.playGunshot(this.def.weaponType, this.group.position);
    this.game.particles.muzzleFlash(from, dir);

    const ray = new THREE.Raycaster(from, dir, 0.1, this.def.sightRange + 10);
    const wallHits = ray.intersectObjects(level.collisionMeshes, false);
    const distToPlayer = from.distanceTo(player.camera.position);

    if (wallHits.length === 0 || wallHits[0].distance > distToPlayer) {
      // hit the player (probabilistic against accuracy already baked into spread)
      if (Utils.chance(this.def.accuracy)) {
        player.takeDamage(this.def.damage);
      }
    } else {
      this.game.particles.bulletImpact(wallHits[0].point, wallHits[0].face.normal.clone().transformDirection(wallHits[0].object.matrixWorld));
    }
  }

  isReadyForCleanup() {
    return !this.alive && this.deathTimer <= 0;
  }

  dispose() {
    this.scene.remove(this.group);
    this.bodyMesh.geometry.dispose(); this.bodyMat.dispose();
    this.headMesh.geometry.dispose(); this.headMat.dispose();
  }
}
