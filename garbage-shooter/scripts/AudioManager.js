/* ==========================================================================
   AudioManager.js
   All sound effects are synthesized in real time via the Web Audio API
   (oscillators + filtered noise bursts). This avoids relying on binary
   sound asset files while still delivering distinct, correctly-timed
   audio feedback for every weapon/action. 3D positional audio uses
   PannerNodes attached to a listener that follows the camera.
   ========================================================================== */

class AudioManager {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.25;
    this.musicGain.connect(this.master);

    this.listenerPos = { x: 0, y: 0, z: 0 };
    this._musicNodes = [];
    this._noiseBuffer = this._buildNoiseBuffer();
  }

  setVolume(v) {
    this.master.gain.value = Utils.clamp(v, 0, 1);
  }

  resume() {
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  updateListener(position, forward) {
    this.listenerPos = position;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = position.x; l.positionY.value = position.y; l.positionZ.value = position.z;
      if (forward) { l.forwardX.value = forward.x; l.forwardY.value = forward.y; l.forwardZ.value = forward.z; }
    } else if (l.setPosition) {
      l.setPosition(position.x, position.y, position.z);
    }
  }

  _buildNoiseBuffer() {
    const len = this.ctx.sampleRate * 1.0;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Creates a positioned output node; if no position given, connects directly to master */
  _outputNode(position) {
    if (!position) return this.master;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 4;
    panner.maxDistance = 80;
    panner.rolloffFactor = 1.4;
    if (panner.positionX) {
      panner.positionX.value = position.x; panner.positionY.value = position.y; panner.positionZ.value = position.z;
    } else if (panner.setPosition) {
      panner.setPosition(position.x, position.y, position.z);
    }
    panner.connect(this.master);
    return panner;
  }

  _noiseBurst(destination, duration, filterFreq, filterType, gainStart) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType || 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainStart, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(filter); filter.connect(gain); gain.connect(destination);
    src.start();
    src.stop(this.ctx.currentTime + duration + 0.05);
  }

  _tone(destination, freqStart, freqEnd, duration, type, gainStart) {
    const osc = this.ctx.createOscillator();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), this.ctx.currentTime + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainStart, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(gain); gain.connect(destination);
    osc.start();
    osc.stop(this.ctx.currentTime + duration + 0.05);
  }

  // ---- Weapon sounds -----------------------------------------------------

  playGunshot(weaponType, position) {
    const dest = this._outputNode(position);
    switch (weaponType) {
      case 'pistol':
        this._noiseBurst(dest, 0.12, 1800, 'bandpass', 0.9);
        this._tone(dest, 220, 60, 0.08, 'square', 0.5);
        break;
      case 'assault_rifle':
        this._noiseBurst(dest, 0.09, 2200, 'bandpass', 1.0);
        this._tone(dest, 260, 70, 0.06, 'square', 0.6);
        break;
      case 'shotgun':
        this._noiseBurst(dest, 0.28, 900, 'bandpass', 1.1);
        this._tone(dest, 140, 40, 0.2, 'square', 0.7);
        break;
      case 'sniper_rifle':
        this._noiseBurst(dest, 0.4, 1500, 'bandpass', 1.2);
        this._tone(dest, 180, 30, 0.35, 'sawtooth', 0.8);
        break;
      default:
        this._noiseBurst(dest, 0.15, 1600, 'bandpass', 0.8);
    }
  }

  playReload(position) {
    const dest = this._outputNode(position);
    this._noiseBurst(dest, 0.05, 3000, 'highpass', 0.3);
    setTimeout(() => this._noiseBurst(dest, 0.05, 2500, 'highpass', 0.3), 220);
  }

  playDryFire(position) {
    const dest = this._outputNode(position);
    this._tone(dest, 800, 700, 0.04, 'square', 0.2);
  }

  playFootstep(position, surface) {
    const dest = this._outputNode(position);
    this._noiseBurst(dest, 0.08, surface === 'metal' ? 2600 : 700, 'lowpass', 0.25);
  }

  playJump(position) {
    const dest = this._outputNode(position);
    this._tone(dest, 200, 400, 0.12, 'sine', 0.3);
  }

  playLand(position) {
    const dest = this._outputNode(position);
    this._noiseBurst(dest, 0.1, 400, 'lowpass', 0.4);
  }

  playExplosion(position) {
    const dest = this._outputNode(position);
    this._noiseBurst(dest, 0.9, 400, 'lowpass', 1.4);
    this._tone(dest, 90, 30, 0.6, 'sawtooth', 0.9);
  }

  playHitmarker() {
    this._tone(this.master, 1400, 1400, 0.04, 'square', 0.2);
  }

  playHeadshotChime() {
    this._tone(this.master, 2000, 2000, 0.05, 'sine', 0.25);
    setTimeout(() => this._tone(this.master, 2500, 2500, 0.05, 'sine', 0.2), 50);
  }

  playHurt(position) {
    const dest = this._outputNode(position);
    this._noiseBurst(dest, 0.15, 500, 'lowpass', 0.5);
  }

  playEnemyAlert(position) {
    const dest = this._outputNode(position);
    this._tone(dest, 500, 900, 0.15, 'square', 0.4);
  }

  playEnemyDeath(position) {
    const dest = this._outputNode(position);
    this._tone(dest, 300, 80, 0.4, 'sawtooth', 0.5);
  }

  playPickup(position) {
    const dest = this._outputNode(position);
    this._tone(dest, 700, 1100, 0.15, 'sine', 0.3);
  }

  playUIClick() {
    this._tone(this.master, 600, 400, 0.05, 'square', 0.2);
  }

  // ---- Ambient music (procedural drone, no external files) ----------------

  startMusic() {
    this.stopMusic();
    const notes = [55, 58.27, 61.74, 65.41]; // low drone cluster (A1-ish)
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.06;
      osc.connect(gain); gain.connect(this.musicGain);
      osc.start();
      this._musicNodes.push(osc);
    });
  }

  stopMusic() {
    this._musicNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    this._musicNodes = [];
  }
}
