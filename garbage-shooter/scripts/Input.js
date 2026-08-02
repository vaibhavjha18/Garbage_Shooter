/* ==========================================================================
   Input.js - keyboard + mouse input via Pointer Lock API
   ========================================================================== */

class InputManager {
  constructor(domElement, keybinds) {
    this.dom = domElement;
    this.keybinds = keybinds;
    this.keys = {};        // code -> bool
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseButtons = { left: false, right: false };
    this.scrollDelta = 0;
    this.locked = false;
    this._skipNextMouseSample = false;
    this._justPressed = new Set();
    this._justReleased = new Set();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
    this._onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    document.addEventListener('contextmenu', this._onContextMenu);
  }

  requestLock() {
    this.dom.requestPointerLock();
  }

  exitLock() {
    document.exitPointerLock();
  }

  _onPointerLockChange() {
    const wasLocked = this.locked;
    this.locked = document.pointerLockElement === this.dom;
    if (this.locked && !wasLocked) {
      // Some browsers report a spurious, oversized movementX/movementY on the
      // very first mousemove event right after pointer lock is acquired. Drop
      // that one sample so it can't cause a sudden large camera snap.
      this._skipNextMouseSample = true;
    }
  }

  _onKeyDown(e) {
    if (!this.keys[e.code]) this._justPressed.add(e.code);
    this.keys[e.code] = true;
  }

  _onKeyUp(e) {
    this.keys[e.code] = false;
    this._justReleased.add(e.code);
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    if (this._skipNextMouseSample) {
      this._skipNextMouseSample = false;
      return;
    }
    // Clamp a single event's delta as a safety net against any other anomalous
    // spike (e.g. a frame hitch or a coalesced batch of events), so one bad
    // sample can never rotate the camera further than a small, sane step.
    const MAX_DELTA = 120;
    this.mouseDX += Utils.clamp(e.movementX || 0, -MAX_DELTA, MAX_DELTA);
    this.mouseDY += Utils.clamp(e.movementY || 0, -MAX_DELTA, MAX_DELTA);
  }

  _onMouseDown(e) {
    if (e.button === 0) this.mouseButtons.left = true;
    if (e.button === 2) this.mouseButtons.right = true;
  }

  _onMouseUp(e) {
    if (e.button === 0) this.mouseButtons.left = false;
    if (e.button === 2) this.mouseButtons.right = false;
  }

  _onWheel(e) {
    this.scrollDelta += e.deltaY;
  }

  isDown(action) {
    const code = this.keybinds[action];
    return !!this.keys[code];
  }

  wasPressed(action) {
    const code = this.keybinds[action];
    return this._justPressed.has(code);
  }

  keyWasPressed(code) {
    return this._justPressed.has(code);
  }

  /** Call at the end of every frame to clear "just pressed/released" sets and mouse delta */
  endFrame() {
    this._justPressed.clear();
    this._justReleased.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.scrollDelta = 0;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
    document.removeEventListener('contextmenu', this._onContextMenu);
  }
}
