'use strict';

const GameMap = (() => {

  // World: X -20 → +20, Z -15 → +15 (40 × 30 units)
  // Wall schema: { x, z, w, d }
  //   x/z = min corner,  w = width along X,  d = depth along Z
  // All walls are 3 units tall (floor Y=0, ceiling Y=3).

  const walls = [
    // ── Perimeter (4) ──────────────────────────────────────────────────────
    { x:-20,   z:-15,   w:40,   d:0.5  },  // North wall
    { x:-20,   z:14.5,  w:40,   d:0.5  },  // South wall
    { x:-20,   z:-15,   w:0.5,  d:30   },  // West wall
    { x:19.5,  z:-15,   w:0.5,  d:30   },  // East wall

    // ── NW room ────────────────────────────────────────────────────────────
    { x:-20,   z:-4,    w:12,   d:0.5  },  // NW south divider
    { x:-8.5,  z:-15,   w:0.5,  d:11.5 },  // NW east divider

    // ── NE room ────────────────────────────────────────────────────────────
    { x:8,     z:-4,    w:12,   d:0.5  },  // NE south divider
    { x:8,     z:-15,   w:0.5,  d:11.5 },  // NE west divider

    // ── SW room ────────────────────────────────────────────────────────────
    { x:-20,   z:3.5,   w:12,   d:0.5  },  // SW north divider
    { x:-8.5,  z:3.5,   w:0.5,  d:11   },  // SW east divider

    // ── SE room ────────────────────────────────────────────────────────────
    { x:8,     z:3.5,   w:12,   d:0.5  },  // SE north divider
    { x:8,     z:3.5,   w:0.5,  d:11   },  // SE west divider

    // ── Cover boxes (centre-west & centre-east) ────────────────────────────
    { x:-10,   z:-1,    w:4,    d:2    },  // West cover box
    { x:6,     z:-1,    w:4,    d:2    },  // East cover box

    // ── Central pillar ─────────────────────────────────────────────────────
    { x:-1,    z:-1,    w:2,    d:2    },

    // ── North corridor blocker (creates doorway feel) ──────────────────────
    { x:-3.5,  z:-15,   w:7,    d:0.5  },
  ];

  // Player spawn (south centre, facing north into the arena)
  const playerSpawn = { x: 0, y: 1.7, z: 12 };

  // Bot spawns (6 bots, spread across the map)
  const botSpawns = [
    { x:-15,  y: 1.0, z:-12 },  // NW
    { x:  0,  y: 1.0, z:-11 },  // North centre
    { x: 15,  y: 1.0, z:-12 },  // NE
    { x:-15,  y: 1.0, z:  0 },  // West mid
    { x: 15,  y: 1.0, z:  0 },  // East mid
    { x:  0,  y: 1.0, z: -5 },  // Centre (behind pillar)
  ];

  // Patrol waypoint groups (one group per bot, assigned by index % 3)
  const waypointGroups = [
    // Group 0 — NW/West loop
    [{ x:-15, z:-10 }, { x:-11, z:-10 }, { x:-11, z:-2 }, { x:-15, z:-2 }],
    // Group 1 — NE/East loop
    [{ x: 15, z:-10 }, { x: 11, z:-10 }, { x: 11, z:-2 }, { x: 15, z:-2 }],
    // Group 2 — Centre figure-8
    [{ x:  0, z:-10 }, { x: -4, z:  0 }, { x:  0, z:  6 }, { x:  4, z:  0 }],
  ];

  // Three.js meshes (populated by buildScene)
  let wallMeshes = [];

  function buildScene(scene) {
    wallMeshes = [];

    // ── Floor ──
    const floorGeo = new THREE.PlaneGeometry(40, 30);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    scene.add(floor);

    // ── Ceiling ──
    const ceilMat = new THREE.MeshLambertMaterial({ color: 0x111118 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 3, 0);
    scene.add(ceil);

    // ── Walls ──
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x1e1e2e });
    for (const w of walls) {
      const geo  = new THREE.BoxGeometry(w.w, 3, w.d);
      const mesh = new THREE.Mesh(geo, wallMat.clone());
      mesh.position.set(w.x + w.w / 2, 1.5, w.z + w.d / 2);
      scene.add(mesh);
      wallMeshes.push(mesh);
    }
  }

  // XZ circle vs all walls — returns true if overlap
  function collidesWithWalls(cx, cz, r) {
    for (const w of walls) {
      if (Utils.circleRect(cx, cz, r, w.x, w.z, w.w, w.d)) return true;
    }
    return false;
  }

  // Push circle out of all walls — returns {x, z}
  function resolveWallCollision(cx, cz, r) {
    return Utils.resolveWallCollision(cx, cz, r, walls);
  }

  return {
    walls,
    get wallMeshes() { return wallMeshes; },
    botSpawns,
    waypointGroups,
    playerSpawn,
    buildScene,
    collidesWithWalls,
    resolveWallCollision,
  };
})();
