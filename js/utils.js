'use strict';

const Utils = (() => {

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
  function dist(x1, y1, x2, y2) { const dx = x2-x1, dy = y2-y1; return Math.sqrt(dx*dx+dy*dy); }
  function normalizeAngle(a) {
    while (a >  Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
  function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function randomChoice(arr)   { return arr[Math.floor(Math.random() * arr.length)]; }

  // Circle vs AABB in XZ plane.
  // cx/cz = circle centre, r = radius
  // rx/rz = rect min corner, rw = width (X), rd = depth (Z)
  function circleRect(cx, cz, r, rx, rz, rw, rd) {
    const nearX = clamp(cx, rx, rx + rw);
    const nearZ = clamp(cz, rz, rz + rd);
    const dx = cx - nearX;
    const dz = cz - nearZ;
    return dx * dx + dz * dz < r * r;
  }

  // Push a circle out of all overlapping walls.
  // walls: [{x, z, w, d}, ...]  (min-corner + width/depth)
  // Returns {x, z}
  function resolveWallCollision(cx, cz, r, walls) {
    let ox = cx, oz = cz;
    for (const wall of walls) {
      if (!circleRect(ox, oz, r, wall.x, wall.z, wall.w, wall.d)) continue;
      const nearX = clamp(ox, wall.x, wall.x + wall.w);
      const nearZ = clamp(oz, wall.z, wall.z + wall.d);
      const dx = ox - nearX;
      const dz = oz - nearZ;
      const d  = Math.sqrt(dx * dx + dz * dz);
      if (d === 0) {
        // Centre fully inside rect — push to nearest edge
        const overlapL = ox - wall.x;
        const overlapR = (wall.x + wall.w) - ox;
        const overlapT = oz - wall.z;
        const overlapB = (wall.z + wall.d) - oz;
        const min = Math.min(overlapL, overlapR, overlapT, overlapB);
        if      (min === overlapL) ox = wall.x - r;
        else if (min === overlapR) ox = wall.x + wall.w + r;
        else if (min === overlapT) oz = wall.z - r;
        else                       oz = wall.z + wall.d + r;
      } else {
        const overlap = r - d;
        ox += (dx / d) * overlap;
        oz += (dz / d) * overlap;
      }
    }
    return { x: ox, z: oz };
  }

  return { lerp, clamp, dist, normalizeAngle, randomInt, randomChoice, circleRect, resolveWallCollision };
})();
