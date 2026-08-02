/* ==========================================================================
   City.js - Level 2
   Ruined city block. Denser cover, a rooftop sniper, and a multi-step
   objective chain: clear hostiles -> rescue hostage -> find keycard ->
   extract.
   ========================================================================== */

class City extends Level {
  constructor(game) {
    super(game, 'city', 'City');
    this.hostageRescued = false;
  }

  build() {
    this.setSkyAndFog(0x4a4f52, 0x5a5f62, 20, 90);
    this.addLighting(0x66707a, 0x1c1c1c, 0xd9d2c2, 0.85);
    this.addFloor(140, 140, 0x3d3f3a);

    // Perimeter
    this.addBox(0, 4, -70, 140, 8, 1, 0x2c2e2a);
    this.addBox(0, 4, 70, 140, 8, 1, 0x2c2e2a);
    this.addBox(-70, 4, 0, 1, 8, 140, 0x2c2e2a);
    this.addBox(70, 4, 0, 1, 8, 140, 0x2c2e2a);

    // Buildings (boxes of varying height create an urban maze)
    const buildingColor = 0x54514a;
    this.addBox(-20, 6, -10, 10, 12, 10, buildingColor);
    this.addBox(15, 5, -15, 8, 10, 14, buildingColor);
    this.addBox(-10, 4, -35, 12, 8, 8, buildingColor);
    this.addBox(20, 7, -40, 10, 14, 10, buildingColor);
    this.addBox(0, 3, -55, 16, 6, 6, buildingColor);
    this.addBox(-25, 5, 15, 9, 10, 12, buildingColor);
    this.addBox(25, 4, 20, 10, 8, 10, buildingColor);

    // Low cover / rubble
    this.addBox(-5, 0.75, -5, 3, 1.5, 3, 0x6b6558);
    this.addBox(5, 0.75, -20, 3, 1.5, 3, 0x6b6558);
    this.addBox(-15, 0.75, -25, 3, 1.5, 3, 0x6b6558);

    // Pickups
    this.addPickup(-20, 1.2, -2, 'health', 30);
    this.addPickup(15, 1.2, -5, 'armor', 25);
    this.addPickup(0, 1.2, -30, 'ammo', 50);
    this.addPickup(20, 1.2, 30, 'health', 20);

    this.playerSpawn.set(0, 0, 55);

    // Enemies: mixed squad + rooftop sniper (fires from range across the plaza)
    this.spawnEnemyDef('soldier', -18, -5, [new THREE.Vector3(-18, 0, -5), new THREE.Vector3(-18, 0, -20)]);
    this.spawnEnemyDef('soldier', 15, -8, [new THREE.Vector3(15, 0, -8), new THREE.Vector3(5, 0, -8)]);
    this.spawnEnemyDef('heavy_soldier', 0, -25, [new THREE.Vector3(0, 0, -25), new THREE.Vector3(10, 0, -25)]);
    this.spawnEnemyDef('sniper', 22, -42, [new THREE.Vector3(22, 0, -42)]);
    this.spawnEnemyDef('soldier', -10, 20, [new THREE.Vector3(-10, 0, 20), new THREE.Vector3(-20, 0, 15)]);

    // Hostage marker (represented as a pickup-like flag the player must reach after clearing hostiles)
    this.hostagePos = new THREE.Vector3(-25, 0, 10);
    // Three.js r128 has no CapsuleGeometry (added in r142+); approximate with a cylinder,
    // matching the same fix already applied to enemy meshes in Enemy.js.
    const geo = new THREE.CylinderGeometry(0.3, 0.32, 1.5, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8d9a3 });
    this.hostageMesh = new THREE.Mesh(geo, mat);
    this.hostageMesh.position.copy(this.hostagePos).setY(1);
    this._group.add(this.hostageMesh);

    this.setExtractionPoint(0, 60, 4);

    this.addObjective('Eliminate all hostiles', (game) => game.enemies.every(e => !e.alive));
    this.addObjective('Rescue the hostage', (game) => {
      if (this.hostageRescued) return true;
      if (game.player.position.distanceTo(this.hostagePos) < 2) {
        this.hostageRescued = true;
        this._group.remove(this.hostageMesh);
        game.audio.playPickup(this.hostagePos);
      }
      return this.hostageRescued;
    });
    this.addObjective('Collect the keycard', (game) => (game.keycards || 0) > 0);
    this.addObjective('Proceed to the extraction point', (game) =>
      game.player.position.distanceTo(this.extractionPoint) < this.extractionRadius);

    // keycard pickup added after other objectives declared so pickup type registers
    this.addPickup(20, 1.2, -55, 'keycard', 1);
  }
}
