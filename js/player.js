'use strict';

class Player {
  constructor(camera) {
    // World position (XZ plane)
    const sp = GameMap.playerSpawn;
    this.x    = sp.x;
    this.z    = sp.z;
    this.eyeY = sp.y;    // 1.7

    this.radius = 0.35;  // XZ collision radius
    this.speed  = 6.0;   // units/second

    // Look angles
    this.yaw   = Math.PI; // face north (toward -Z)
    this.pitch = 0;
    this.pitchKick = 0;   // recoil amount, decays each frame

    // Weapon state (one ammo pool per weapon)
    this.currentWeapon = 'rifle';
    this.ammoState = {
      rifle:  { ammo: WEAPONS.rifle.ammo,  reserve: WEAPONS.rifle.reserve  },
      pistol: { ammo: WEAPONS.pistol.ammo, reserve: WEAPONS.pistol.reserve },
      sniper: { ammo: WEAPONS.sniper.ammo, reserve: WEAPONS.sniper.reserve },
    };
    this.reloading    = false;
    this.reloadTimer  = 0;
    this.fireCooldown = 0;

    // Health
    this.hp    = 100;
    this.maxHp = 100;
    this.alive = true;

    this.flashTimer = 0;  // hit-flash duration

    // Three.js camera ref
    this._camera = camera;
    this._raycaster = new THREE.Raycaster();

    // Apply initial camera transform
    this._applyCamera();
  }

  get weaponState() { return this.ammoState[this.currentWeapon]; }
  get weapon()      { return WEAPONS[this.currentWeapon]; }

  // Called by main.js mousemove handler when pointer is locked
  onMouseMove(movX, movY) {
    const SENS = 0.0018;
    this.yaw   += movX * SENS;
    this.pitch  = Utils.clamp(this.pitch + movY * SENS, -Math.PI * 0.47, Math.PI * 0.47);
  }

  switchWeapon(key) {
    const name = WEAPON_ORDER.find(n => WEAPONS[n].key === key);
    if (!name || name === this.currentWeapon) return;
    this.currentWeapon = name;
    this.fireCooldown  = 0;
    this.reloading     = false;
    this.reloadTimer   = 0;
  }

  startReload() {
    const ws  = this.weaponState;
    const wep = this.weapon;
    if (this.reloading || ws.ammo === wep.maxAmmo || ws.reserve === 0) return;
    this.reloading   = true;
    this.reloadTimer = wep.reloadTime;
  }

  // Hitscan shoot — returns { fired, botHit, tracerEnd }
  shoot(bots, scene) {
    const ws  = this.weaponState;
    const wep = this.weapon;
    if (!this.alive || this.reloading || this.fireCooldown > 0 || ws.ammo <= 0) return null;

    ws.ammo--;
    this.fireCooldown = wep.fireRate;
    this.pitchKick   += wep.recoil;

    // Build spread-jittered direction in camera space
    const spread = wep.spread;
    const jX = (Math.random() - 0.5) * spread * 2;
    const jY = (Math.random() - 0.5) * spread * 2;

    // Direction vector: slightly off-centre of camera
    const dir = new THREE.Vector3(jX, jY, -1)
      .normalize()
      .applyEuler(this._camera.rotation)
      .normalize();

    this._raycaster.set(this._camera.position, dir);

    // Intersect bots first
    const liveBotMeshes = bots.filter(b => b.alive).map(b => b.mesh);
    const botHits  = liveBotMeshes.length ? this._raycaster.intersectObjects(liveBotMeshes) : [];
    const wallHits = this._raycaster.intersectObjects(GameMap.wallMeshes);

    const botDist  = botHits.length  ? botHits[0].distance  : Infinity;
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;

    let tracerEnd, botHit = null;

    if (botDist < wallDist && botDist < Infinity) {
      // Hit a bot
      botHit    = bots.find(b => b.alive && b.mesh === botHits[0].object);
      tracerEnd = botHits[0].point.clone();
    } else if (wallDist < Infinity) {
      tracerEnd = wallHits[0].point.clone();
    } else {
      tracerEnd = this._camera.position.clone().addScaledVector(dir, 50);
    }

    return { fired: true, botHit, tracerEnd };
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flashTimer = 0.18;
    if (this.hp <= 0) this.alive = false;
  }

  update(dt, keys) {
    if (!this.alive) return;

    // Decay recoil
    this.pitchKick = Utils.lerp(this.pitchKick, 0, Math.min(1, 10 * dt));

    // Timers
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.flashTimer   > 0) this.flashTimer   -= dt;

    // Reload logic
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const ws     = this.weaponState;
        const wep    = this.weapon;
        const needed = wep.maxAmmo - ws.ammo;
        const take   = Math.min(needed, ws.reserve);
        ws.ammo    += take;
        ws.reserve -= take;
        this.reloading = false;
      }
    }
    // Auto-reload on empty
    if (!this.reloading) {
      const ws = this.weaponState;
      if (ws.ammo === 0 && ws.reserve > 0) this.startReload();
    }

    // WASD movement in XZ (yaw-relative)
    // forward = direction camera faces, projected to XZ plane
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const fwdX = -sinY, fwdZ = -cosY;
    const rgtX =  cosY, rgtZ = -sinY;

    let moveX = 0, moveZ = 0;
    if (keys['w'] || keys['arrowup'])    { moveX += fwdX; moveZ += fwdZ; }
    if (keys['s'] || keys['arrowdown'])  { moveX -= fwdX; moveZ -= fwdZ; }
    if (keys['a'] || keys['arrowleft'])  { moveX -= rgtX; moveZ -= rgtZ; }
    if (keys['d'] || keys['arrowright']) { moveX += rgtX; moveZ += rgtZ; }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    const nx = this.x + moveX * this.speed * dt;
    const nz = this.z + moveZ * this.speed * dt;

    // Slide collision: try X and Z independently
    const rX = GameMap.resolveWallCollision(nx, this.z, this.radius);
    const rZ = GameMap.resolveWallCollision(this.x, nz, this.radius);
    this.x = Utils.clamp(rX.x, -19.5, 19.5);
    this.z = Utils.clamp(rZ.z, -14.5, 14.5);

    this._applyCamera();
  }

  _applyCamera() {
    this._camera.rotation.order = 'YXZ';
    this._camera.rotation.y = -this.yaw;
    this._camera.rotation.x = -(this.pitch + this.pitchKick);
    this._camera.position.set(this.x, this.eyeY, this.z);
  }
}
