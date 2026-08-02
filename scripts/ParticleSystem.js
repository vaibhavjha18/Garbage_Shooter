/* ==========================================================================
   ParticleSystem.js
   Lightweight pooled particle system built on small billboard sprites and
   THREE.Mesh instances (no external texture assets required - particles are
   colored planes/points generated procedurally on a canvas texture).
   ========================================================================== */

class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particles = []; // active particles: {mesh, velocity, life, maxLife, gravity, fadeOut, spin}
    this.pool = [];
    this.material = new THREE.SpriteMaterial({
      map: ParticleSystem._buildDotTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.decals = []; // bullet holes - kept separate, don't fade
    this.maxDecals = 60;
  }

  static _buildDotTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  _getSprite(color) {
    let sprite = this.pool.pop();
    if (!sprite) {
      sprite = new THREE.Sprite(this.material.clone());
    }
    sprite.material.color.set(color);
    sprite.material.opacity = 1;
    sprite.visible = true;
    return sprite;
  }

  _spawn(position, opts) {
    const sprite = this._getSprite(opts.color || 0xffffff);
    sprite.position.copy(position);
    const scale = opts.scale || 0.3;
    sprite.scale.set(scale, scale, scale);
    this.scene.add(sprite);
    this.particles.push({
      mesh: sprite,
      velocity: opts.velocity || new THREE.Vector3(),
      life: 0,
      maxLife: opts.life || 0.5,
      gravity: opts.gravity !== undefined ? opts.gravity : -9.8,
      baseScale: scale,
      grow: opts.grow || 0
    });
  }

  muzzleFlash(position, direction) {
    for (let i = 0; i < 4; i++) {
      const vel = direction.clone().multiplyScalar(Utils.randRange(1, 3))
        .add(new THREE.Vector3(Utils.randRange(-0.5, 0.5), Utils.randRange(-0.5, 0.5), Utils.randRange(-0.5, 0.5)));
      this._spawn(position, { color: 0xffcc66, scale: Utils.randRange(0.15, 0.3), life: 0.06, velocity: vel, gravity: 0 });
    }
  }

  bloodSplatter(position) {
    for (let i = 0; i < 10; i++) {
      const vel = new THREE.Vector3(Utils.randRange(-2, 2), Utils.randRange(0.5, 3), Utils.randRange(-2, 2));
      this._spawn(position, { color: 0x8a0f0f, scale: Utils.randRange(0.08, 0.18), life: Utils.randRange(0.4, 0.8), velocity: vel, gravity: -9.8 });
    }
  }

  bulletImpact(position, normal) {
    for (let i = 0; i < 6; i++) {
      const vel = normal.clone().multiplyScalar(Utils.randRange(1, 3))
        .add(new THREE.Vector3(Utils.randRange(-1, 1), Utils.randRange(0, 1.5), Utils.randRange(-1, 1)));
      this._spawn(position, { color: 0xc9a26a, scale: Utils.randRange(0.05, 0.12), life: Utils.randRange(0.2, 0.4), velocity: vel, gravity: -6 });
    }
    this._addDecal(position, normal);
  }

  _addDecal(position, normal) {
    const geo = new THREE.CircleGeometry(0.08, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.8, depthWrite: false });
    const decal = new THREE.Mesh(geo, mat);
    decal.position.copy(position).addScaledVector(normal, 0.01);
    decal.lookAt(position.clone().add(normal));
    this.scene.add(decal);
    this.decals.push(decal);
    if (this.decals.length > this.maxDecals) {
      const old = this.decals.shift();
      this.scene.remove(old);
      old.geometry.dispose(); old.material.dispose();
    }
  }

  explosion(position) {
    for (let i = 0; i < 26; i++) {
      const dir = new THREE.Vector3(Utils.randRange(-1, 1), Utils.randRange(0.2, 1), Utils.randRange(-1, 1)).normalize();
      const vel = dir.multiplyScalar(Utils.randRange(3, 8));
      const color = Utils.chance(0.5) ? 0xff7733 : 0x555555;
      this._spawn(position, { color, scale: Utils.randRange(0.3, 0.7), life: Utils.randRange(0.5, 1.1), velocity: vel, gravity: -4 });
    }
  }

  shellEject(position, velocity) {
    this._spawn(position, { color: 0xd4af37, scale: 0.05, life: 0.6, velocity, gravity: -9.8 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.visible = false;
        this.pool.push(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.velocity.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      const t = p.life / p.maxLife;
      p.mesh.material.opacity = 1 - t;
      const s = p.baseScale * (1 + p.grow * t);
      p.mesh.scale.set(s, s, s);
    }
  }
}
