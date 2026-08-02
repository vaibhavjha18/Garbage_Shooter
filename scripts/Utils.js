/* ==========================================================================
   Utils.js - shared math / helper functions
   ========================================================================== */

const Utils = {
  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  randRange(min, max) {
    return min + Math.random() * (max - min);
  },

  randInt(min, max) {
    return Math.floor(this.randRange(min, max + 1));
  },

  distance2D(a, b) {
    const dx = a.x - b.x, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  },

  distance3D(a, b) {
    return a.distanceTo(b);
  },

  /** Returns true with probability p (0-1) */
  chance(p) {
    return Math.random() < p;
  },

  /** Simple exponential smoothing for camera/movement damping, framerate independent */
  damp(current, target, lambda, dt) {
    return Utils.lerp(current, target, 1 - Math.exp(-lambda * dt));
  },

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  /** Axis-aligned bounding box overlap test. Boxes: {min:{x,y,z}, max:{x,y,z}} */
  aabbIntersect(a, b) {
    return (
      a.min.x <= b.max.x && a.max.x >= b.min.x &&
      a.min.y <= b.max.y && a.max.y >= b.min.y &&
      a.min.z <= b.max.z && a.max.z >= b.min.z
    );
  },

  /** Build an AABB from a center position and half-extents */
  boxFromCenter(center, halfExtents) {
    return {
      min: {
        x: center.x - halfExtents.x,
        y: center.y - halfExtents.y,
        z: center.z - halfExtents.z
      },
      max: {
        x: center.x + halfExtents.x,
        y: center.y + halfExtents.y,
        z: center.z + halfExtents.z
      }
    };
  }
};
