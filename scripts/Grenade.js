/* ==========================================================================
   Grenade.js
   Thrown projectile with arc physics, bounce, fuse timer, and an
   area-of-effect explosion that damages the player and nearby enemies.
   ========================================================================== */

class Grenade {
  constructor(position, velocity, game) {
    this.game = game;
    this.position = position.clone();
    this.velocity = velocity.clone();
    this.fuse = 2.2;
    this.exploded = false;
    this.radius = 0.12;
    this.damageRadius = 7;
    this.maxDamage = 120;

    const geo = new THREE.SphereGeometry(this.radius, 8, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a1c, roughness: 0.6 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(this.position);
    this.mesh.castShadow = true;
    game.scene.add(this.mesh);
  }

  update(dt, level) {
    if (this.exploded) return;
    this.velocity.y += -18 * dt;
    const next = this.position.clone().addScaledVector(this.velocity, dt);
    const groundY = level.getGroundHeight ? level.getGroundHeight(next.x, next.z) : 0;
    if (next.y <= groundY + this.radius) {
      next.y = groundY + this.radius;
      this.velocity.y *= -0.4;
      this.velocity.x *= 0.7;
      this.velocity.z *= 0.7;
    }
    this.position.copy(next);
    this.mesh.position.copy(this.position);

    this.fuse -= dt;
    if (this.fuse <= 0) this._explode();
  }

  _explode() {
    this.exploded = true;
    this.game.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    this.game.particles.explosion(this.position);
    this.game.audio.playExplosion(this.position);
    this.game.hud.shakeScreen(0.8);

    const player = this.game.player;
    const distToPlayer = this.position.distanceTo(player.position);
    if (distToPlayer < this.damageRadius) {
      const falloff = 1 - distToPlayer / this.damageRadius;
      player.takeDamage(this.maxDamage * falloff, true);
    }

    for (const enemy of this.game.enemies) {
      if (!enemy.alive) continue;
      const d = this.position.distanceTo(enemy.group.position);
      if (d < this.damageRadius) {
        const falloff = 1 - d / this.damageRadius;
        const killed = enemy.takeDamage(this.maxDamage * falloff, false);
        if (killed) {
          this.game.player.kills++;
          this.game.hud.updateKills(this.game.player.kills);
        }
      }
    }
  }
}
