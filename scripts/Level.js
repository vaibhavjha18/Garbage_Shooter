/* ==========================================================================
   Level.js
   Base class for all playable maps. Concrete levels (TrainingGround, City,
   ...) extend this and implement build(). The base class provides shared
   helpers for constructing geometry + colliders together, lighting/fog/
   skybox setup, pickups, enemy spawning, and a simple sequential
   objective tracker (eliminate -> extract, with optional keycards/hostages).

   To add a new level: create scripts/levels/YourLevel.js defining a class
   that extends Level and implements build(), then register it in
   Game.js's LEVEL_REGISTRY.
   ========================================================================== */

class Level {
  constructor(game, id, displayName) {
    this.game = game;
    this.scene = game.scene;
    this.id = id;
    this.displayName = displayName;
    this.colliders = [];          // AABBs for player capsule collision
    this.collisionMeshes = [];    // meshes for raycasting (bullets, AI sight)
    this.pickups = [];
    this.groundPlatforms = [];    // {minX,maxX,minZ,maxZ,y} for multi-height floors
    this.playerSpawn = new THREE.Vector3(0, 0, 0);
    this.enemySpawns = [];        // populated by subclasses via spawnEnemyDef
    this.objectives = [];         // sequential list, see addObjective
    this.objectiveIndex = 0;
    this.extractionPoint = null;
    this.extractionActive = false;
    this.surfaceType = 'ground';
    this.minimapScale = 4; // world units per minimap pixel radius unit

    this._group = new THREE.Group();
    this.scene.add(this._group);
  }

  // ---- Construction helpers ----------------------------------------------

  addFloor(width, depth, color, y = 0) {
    const geo = new THREE.PlaneGeometry(width, depth);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    this._group.add(mesh);
    this.collisionMeshes.push(mesh);
    this.groundPlatforms.push({ minX: -width / 2, maxX: width / 2, minZ: -depth / 2, maxZ: depth / 2, y });
    return mesh;
  }

  addBox(cx, cy, cz, w, h, d, color, isCollider = true) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this._group.add(mesh);
    this.collisionMeshes.push(mesh);
    if (isCollider) {
      this.colliders.push(Utils.boxFromCenter({ x: cx, y: cy, z: cz }, { x: w / 2, y: h / 2, z: d / 2 }));
    }
    return mesh;
  }

  addLighting(hemiColor = 0x8899aa, groundColor = 0x332211, sunColor = 0xfff2d9, sunIntensity = 1.0) {
    const hemi = new THREE.HemisphereLight(hemiColor, groundColor, 0.6);
    this._group.add(hemi);
    const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
    sun.shadow.camera.far = 150;
    this._group.add(sun);
    this.sun = sun;
  }

  setSkyAndFog(skyColor, fogColor, fogNear, fogFar) {
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
  }

  addPickup(x, y, z, type, amount) {
    const colors = { health: 0xc93c34, armor: 0x7b8570, ammo: 0xe8a13a, keycard: 0x3ab0e8 };
    const geo = type === 'keycard' ? new THREE.BoxGeometry(0.3, 0.4, 0.05) : new THREE.OctahedronGeometry(0.35);
    const mat = new THREE.MeshStandardMaterial({ color: colors[type] || 0xffffff, emissive: colors[type] || 0x000000, emissiveIntensity: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    this._group.add(mesh);
    this.pickups.push({ mesh, type, amount, active: true, spinSpeed: Utils.randRange(1, 2) });
  }

  spawnEnemyDef(type, x, z, patrolPoints) {
    this.enemySpawns.push({ type, position: new THREE.Vector3(x, 0, z), patrolPoints: patrolPoints || null });
  }

  setExtractionPoint(x, z, radius = 3) {
    this.extractionPoint = new THREE.Vector3(x, 0, z);
    this.extractionRadius = radius;
    const geo = new THREE.CylinderGeometry(radius, radius, 0.1, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3ab0e8, emissive: 0x1a5a72, transparent: true, opacity: 0.5 });
    this.extractMesh = new THREE.Mesh(geo, mat);
    this.extractMesh.position.set(x, 0.05, z);
    this._group.add(this.extractMesh);
  }

  addObjective(description, checkFn) {
    this.objectives.push({ description, checkFn, complete: false });
  }

  getGroundHeight(x, z) {
    let best = 0;
    for (const p of this.groundPlatforms) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
        best = Math.max(best, p.y);
      }
    }
    return best;
  }

  // ---- Runtime ------------------------------------------------------------

  spawnAllEnemies() {
    this.game.enemies = this.enemySpawns.map(spec =>
      new Enemy(spec.type, spec.position, spec.patrolPoints, this.scene, this.game)
    );
  }

  get currentObjective() {
    return this.objectives[this.objectiveIndex] || null;
  }

  updateObjectives() {
    const obj = this.currentObjective;
    if (!obj || obj.complete) return;
    if (obj.checkFn(this.game)) {
      obj.complete = true;
      this.objectiveIndex++;
      this.game.hud.flashObjectiveComplete();
    }
  }

  isMissionComplete() {
    return this.objectiveIndex >= this.objectives.length;
  }

  updatePickups(dt) {
    const playerPos = this.game.player.position;
    for (const pickup of this.pickups) {
      if (!pickup.active) continue;
      pickup.mesh.rotation.y += dt * pickup.spinSpeed;
      pickup.mesh.position.y += Math.sin(performance.now() * 0.002 + pickup.mesh.position.x) * 0.0015;
      if (Utils.distance2D(pickup.mesh.position, playerPos) < 1.2) {
        this._applyPickup(pickup);
        pickup.active = false;
        this._group.remove(pickup.mesh);
        this.game.audio.playPickup(pickup.mesh.position);
      }
    }
  }

  _applyPickup(pickup) {
    const player = this.game.player;
    switch (pickup.type) {
      case 'health': player.addHealth(pickup.amount); break;
      case 'armor': player.addArmor(pickup.amount); break;
      case 'ammo': Object.keys(player.weapons).forEach(id => player.addAmmo(id, pickup.amount)); break;
      case 'keycard': this.game.keycards = (this.game.keycards || 0) + 1; break;
    }
  }

  dispose() {
    this.scene.remove(this._group);
  }
}
