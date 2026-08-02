/* ==========================================================================
   Weapons.js
   Weapon stat definitions + the Weapon class which manages ammo, fire
   timing, recoil, bullet spread, reload state and ADS for a single
   weapon instance carried by the player or an enemy.
   ========================================================================== */

const WeaponDefs = {
  pistol: {
    id: 'pistol', name: 'PISTOL', damage: 24, headshotMultiplier: 2.5,
    fireRate: 0.28, automatic: false, magSize: 12, reserveMax: 60,
    reloadTime: 1.1, spread: 0.02, adsSpread: 0.004, adsZoom: 1.3,
    recoilKick: 0.02, recoilRecovery: 8, range: 60, pellets: 1
  },
  assault_rifle: {
    id: 'assault_rifle', name: 'ASSAULT RIFLE', damage: 18, headshotMultiplier: 2.2,
    fireRate: 0.1, automatic: true, magSize: 30, reserveMax: 150,
    reloadTime: 1.8, spread: 0.035, adsSpread: 0.008, adsZoom: 1.5,
    recoilKick: 0.012, recoilRecovery: 10, range: 80, pellets: 1
  },
  shotgun: {
    id: 'shotgun', name: 'SHOTGUN', damage: 12, headshotMultiplier: 2.0,
    fireRate: 0.75, automatic: false, magSize: 6, reserveMax: 36,
    reloadTime: 0.5 /* per-shell */, reloadIsPerShell: true, spread: 0.09, adsSpread: 0.05, adsZoom: 1.1,
    recoilKick: 0.06, recoilRecovery: 6, range: 22, pellets: 8
  },
  sniper_rifle: {
    id: 'sniper_rifle', name: 'SNIPER RIFLE', damage: 95, headshotMultiplier: 3.0,
    fireRate: 1.4, automatic: false, magSize: 5, reserveMax: 25,
    reloadTime: 2.4, spread: 0.006, adsSpread: 0.0004, adsZoom: 4.0,
    recoilKick: 0.09, recoilRecovery: 4, range: 200, pellets: 1
  }
};

class Weapon {
  constructor(defId) {
    this.def = WeaponDefs[defId];
    this.ammoInMag = this.def.magSize;
    this.ammoReserve = this.def.reserveMax;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.recoilAmount = 0;   // current visual recoil kick (decays)
    this.aiming = false;
    this.bobTime = 0;
  }

  canFire() {
    return !this.reloading && this.cooldown <= 0 && this.ammoInMag > 0;
  }

  needsReload() {
    return this.ammoInMag <= 0 && this.ammoReserve > 0 && !this.reloading;
  }

  startReload() {
    if (this.reloading || this.ammoReserve <= 0 || this.ammoInMag >= this.def.magSize) return false;
    this.reloading = true;
    this.reloadTimer = this.def.reloadTime;
    return true;
  }

  /** returns true if a shot was fired */
  fire() {
    if (!this.canFire()) return false;
    this.ammoInMag--;
    this.cooldown = this.def.fireRate;
    this.recoilAmount = Math.min(1, this.recoilAmount + this.def.recoilKick * 6);
    return true;
  }

  getCurrentSpread() {
    const base = this.aiming ? this.def.adsSpread : this.def.spread;
    return base + this.recoilAmount * base * 2;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    this.recoilAmount = Utils.damp(this.recoilAmount, 0, this.def.recoilRecovery, dt);

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        if (this.def.reloadIsPerShell) {
          // shotgun: load one shell, continue reloading if more room and ammo
          this.ammoInMag++;
          this.ammoReserve--;
          if (this.ammoInMag < this.def.magSize && this.ammoReserve > 0) {
            this.reloadTimer = this.def.reloadTime;
          } else {
            this.reloading = false;
          }
        } else {
          const needed = this.def.magSize - this.ammoInMag;
          const take = Math.min(needed, this.ammoReserve);
          this.ammoInMag += take;
          this.ammoReserve -= take;
          this.reloading = false;
        }
      }
    }
  }
}
