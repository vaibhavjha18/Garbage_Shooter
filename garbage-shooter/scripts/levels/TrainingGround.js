/* ==========================================================================
   TrainingGround.js - Level 1
   A fenced-off military training yard. Teaches movement/combat with a
   handful of soldiers, then an extraction pad.
   ========================================================================== */

class TrainingGround extends Level {
  constructor(game) {
    super(game, 'training_ground', 'Training Ground');
  }

  build() {
    this.setSkyAndFog(0x9fb8c9, 0xaebfc9, 30, 110);
    this.addLighting(0x9fb8c9, 0x3a3324, 0xfff2d9, 1.1);
    this.addFloor(120, 120, 0x5c6653);

    // Perimeter walls
    this.addBox(0, 3, -60, 120, 6, 1, 0x555b4d);
    this.addBox(0, 3, 60, 120, 6, 1, 0x555b4d);
    this.addBox(-60, 3, 0, 1, 6, 120, 0x555b4d);
    this.addBox(60, 3, 0, 1, 6, 120, 0x555b4d);

    // Training obstacles / cover
    this.addBox(-8, 1, -10, 3, 2, 3, 0x8a7a5c);
    this.addBox(8, 1, -14, 3, 2, 3, 0x8a7a5c);
    this.addBox(0, 1, -25, 4, 2, 2, 0x8a7a5c);
    this.addBox(-15, 1.5, -30, 2, 3, 6, 0x6b7360);
    this.addBox(15, 1.5, -30, 2, 3, 6, 0x6b7360);
    this.addBox(0, 1, 10, 6, 2, 2, 0x8a7a5c);

    // Pickups
    this.addPickup(-8, 1.2, -6, 'health', 25);
    this.addPickup(8, 1.2, -6, 'armor', 30);
    this.addPickup(0, 1.2, -18, 'ammo', 40);

    // Player spawn
    this.playerSpawn.set(0, 0, 20);

    // Enemies: soldiers only, teaches basic combat
    this.spawnEnemyDef('soldier', -10, -20, [
      new THREE.Vector3(-10, 0, -20), new THREE.Vector3(-10, 0, -35), new THREE.Vector3(2, 0, -35)
    ]);
    this.spawnEnemyDef('soldier', 10, -22, [
      new THREE.Vector3(10, 0, -22), new THREE.Vector3(10, 0, -38)
    ]);
    this.spawnEnemyDef('heavy_soldier', 0, -40, [
      new THREE.Vector3(0, 0, -40), new THREE.Vector3(-6, 0, -45), new THREE.Vector3(6, 0, -45)
    ]);

    // Extraction
    this.setExtractionPoint(0, -50, 3.5);

    this.addObjective('Eliminate all hostiles', (game) =>
      game.enemies.every(e => !e.alive));
    this.addObjective('Proceed to the extraction point', (game) =>
      game.player.position.distanceTo(this.extractionPoint) < this.extractionRadius);
  }
}
