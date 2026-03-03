'use strict';

const WEAPONS = {
  rifle: {
    name:       'RIFLE',
    key:        '1',
    damage:     25,
    fireRate:   0.1,      // seconds between shots
    ammo:       30,
    reserve:    90,
    maxAmmo:    30,
    reloadTime: 1.8,
    spread:     0.02,     // ray jitter (radians)
    recoil:     0.03,     // pitchKick per shot (radians)
    auto:       true,     // hold mouse to fire
  },
  pistol: {
    name:       'PISTOL',
    key:        '2',
    damage:     18,
    fireRate:   0.3,
    ammo:       15,
    reserve:    60,
    maxAmmo:    15,
    reloadTime: 1.2,
    spread:     0.05,
    recoil:     0.015,
    auto:       false,
  },
  sniper: {
    name:       'SNIPER',
    key:        '3',
    damage:     80,
    fireRate:   1.5,
    ammo:       5,
    reserve:    20,
    maxAmmo:    5,
    reloadTime: 2.5,
    spread:     0.002,
    recoil:     0.08,
    auto:       false,
  },
};

const WEAPON_ORDER = ['rifle', 'pistol', 'sniper'];
