/* ==========================================================================
   SaveManager.js - persistence layer using localStorage
   Handles: settings, mission progress, weapon unlocks, high scores
   ========================================================================== */

class SaveManager {
  static KEY = 'garbageShooter.saveData.v1';

  static defaultData() {
    return {
      settings: {
        sensitivity: 1.6,
        volume: 0.8,
        quality: 'medium',
        fov: 82,
        fullscreen: false,
        invertY: false,
        keybinds: {
          forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
          jump: 'Space', sprint: 'ShiftLeft', crouch: 'ControlLeft',
          reload: 'KeyR', grenade: 'KeyG'
        }
      },
      progress: {
        completedLevels: [],
        unlockedLevels: ['training_ground'],
        weaponUnlocks: ['pistol', 'assault_rifle', 'shotgun', 'sniper_rifle'],
        highScores: {}
      },
      hasSave: false
    };
  }

  static load() {
    try {
      const raw = localStorage.getItem(SaveManager.KEY);
      if (!raw) return SaveManager.defaultData();
      const parsed = JSON.parse(raw);
      // merge with defaults to survive future added fields
      const defaults = SaveManager.defaultData();
      return {
        settings: { ...defaults.settings, ...parsed.settings },
        progress: { ...defaults.progress, ...parsed.progress },
        hasSave: parsed.hasSave || false
      };
    } catch (e) {
      console.warn('[SaveManager] Failed to load save, using defaults.', e);
      return SaveManager.defaultData();
    }
  }

  static save(data) {
    try {
      localStorage.setItem(SaveManager.KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[SaveManager] Failed to save.', e);
      return false;
    }
  }

  static markLevelComplete(data, levelId, nextLevelId, score) {
    if (!data.progress.completedLevels.includes(levelId)) {
      data.progress.completedLevels.push(levelId);
    }
    if (nextLevelId && !data.progress.unlockedLevels.includes(nextLevelId)) {
      data.progress.unlockedLevels.push(nextLevelId);
    }
    if (score !== undefined) {
      const prev = data.progress.highScores[levelId] || 0;
      data.progress.highScores[levelId] = Math.max(prev, score);
    }
    data.hasSave = true;
    SaveManager.save(data);
  }

  static clear() {
    localStorage.removeItem(SaveManager.KEY);
  }
}
