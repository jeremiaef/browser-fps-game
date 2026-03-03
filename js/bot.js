'use strict';

const BOT_STATE = { PATROL: 'PATROL', ALERT: 'ALERT', ATTACK: 'ATTACK', DEAD: 'DEAD' };

class Bot {
  constructor(spawn, waypointGroup, id, scene) {
    this.id = id;
    this.x  = spawn.x;
    this.z  = spawn.z;
    this.y  = 1.0;       // fixed height (centre of 2-unit box)

    this.radius = 0.4;   // XZ collision radius
    this.yaw    = Math.random() * Math.PI * 2;

    this.hp    = 60;
    this.maxHp = 60;

    this.speed = { PATROL: 2.5, ALERT: 4.5, ATTACK: 5.0 };

    this.sightRange  = 18;
    this.attackRange = 15;
    this.loseRange   = 22;

    this.state      = BOT_STATE.PATROL;
    this.waypoints  = waypointGroup ? waypointGroup.map(p => ({ x: p.x, z: p.z }))
                                    : [{ x: spawn.x, z: spawn.z }];
    this.wpIndex    = 0;

    this.fireRate     = 0.7 + Math.random() * 0.5;
    this.fireCooldown = this.fireRate;
    this.damage       = 12;
    this.accuracy     = 0.08;  // ray jitter (radians)

    this.alertTimer    = 0;
    this.alertDuration = 4;
    this.lastKnownX    = spawn.x;
    this.lastKnownZ    = spawn.z;

    this.alive      = true;
    this.flashTimer = 0;
    this.deathTimer = 0;

    this._scene     = scene;
    this._raycaster = new THREE.Raycaster();

    // 3D mesh
    const geo = new THREE.BoxGeometry(0.8, 2.0, 0.8);
    const mat = new THREE.MeshLambertMaterial({ color: 0xcc2222 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(this.x, this.y, this.z);
    scene.add(this.mesh);

    // Tracer line
    this._tracerLine  = null;
    this._tracerTimer = 0;

    // DOM health bar
    this._barEl   = document.createElement('div');
    this._barEl.className = 'bot-health-bar';
    this._fillEl  = document.createElement('div');
    this._fillEl.className = 'bot-health-fill';
    this._barEl.appendChild(this._fillEl);
    document.getElementById('bot-health-bars').appendChild(this._barEl);
  }

  get dead() { return !this.alive && this.state === BOT_STATE.DEAD; }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.flashTimer = 0.12;
    if (this.hp <= 0) {
      this.alive = false;
      this.state = BOT_STATE.DEAD;
      this.mesh.material.transparent = true;
    }
  }

  update(dt, player, camera, renderer) {
    // Update tracer
    if (this._tracerTimer > 0) {
      this._tracerTimer -= dt;
      if (this._tracerTimer <= 0 && this._tracerLine) {
        this._scene.remove(this._tracerLine);
        this._tracerLine.geometry.dispose();
        this._tracerLine = null;
      }
    }

    // Death fade
    if (this.state === BOT_STATE.DEAD) {
      this.deathTimer += dt;
      this.mesh.material.opacity = Math.max(0, 1 - this.deathTimer / 0.7);
      this._updateHealthBar(camera, renderer, false);
      return;
    }

    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      // Flash material colour
      const t = this.flashTimer / 0.12;
      this.mesh.material.color.setRGB(0.8 + 0.2 * t, 0.2 * t, 0.2 * t);
    } else {
      this.mesh.material.color.setHex(0xcc2222);
    }

    // Update mesh position
    this.mesh.position.set(this.x, this.y, this.z);
    // Rotate mesh to face yaw
    this.mesh.rotation.y = -this.yaw;

    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist2D = Math.sqrt(dx * dx + dz * dz);

    const canSeePlayer = this._checkLOS(player, dist2D);

    // FSM transitions
    switch (this.state) {
      case BOT_STATE.PATROL:
        if (canSeePlayer) {
          this.state = BOT_STATE.ATTACK;
          this.alertTimer = this.alertDuration;
        }
        break;
      case BOT_STATE.ALERT:
        if (canSeePlayer) {
          this.state = BOT_STATE.ATTACK;
          this.alertTimer = this.alertDuration;
        } else {
          this.alertTimer -= dt;
          if (this.alertTimer <= 0) this.state = BOT_STATE.PATROL;
        }
        break;
      case BOT_STATE.ATTACK:
        if (canSeePlayer) {
          this.lastKnownX = player.x;
          this.lastKnownZ = player.z;
          this.alertTimer = this.alertDuration;
        } else {
          this.state = BOT_STATE.ALERT;
        }
        break;
    }

    // Behavior
    if (this.state === BOT_STATE.PATROL) {
      this._patrol(dt);
    } else if (this.state === BOT_STATE.ALERT) {
      this._moveToward(this.lastKnownX, this.lastKnownZ, dt, this.speed.ALERT);
    } else if (this.state === BOT_STATE.ATTACK) {
      this._attack(dt, player, dist2D, canSeePlayer);
    }

    this._updateHealthBar(camera, renderer, true);
  }

  _checkLOS(player, dist2D) {
    if (dist2D > this.sightRange) return false;
    const eyePos = new THREE.Vector3(this.x, 1.6, this.z);
    const playerEye = new THREE.Vector3(player.x, player.eyeY, player.z);
    const dir = playerEye.clone().sub(eyePos).normalize();
    this._raycaster.set(eyePos, dir);
    const hits = this._raycaster.intersectObjects(GameMap.wallMeshes);
    return hits.length === 0 || hits[0].distance > dist2D;
  }

  _patrol(dt) {
    const wp = this.waypoints[this.wpIndex];
    const d  = Utils.dist(this.x, this.z, wp.x, wp.z);
    if (d < 0.8) {
      this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
    } else {
      this._moveToward(wp.x, wp.z, dt, this.speed.PATROL);
    }
  }

  _moveToward(tx, tz, dt, spd) {
    const targetYaw = Math.atan2(tx - this.x, tz - this.z);
    const diff = Utils.normalizeAngle(targetYaw - this.yaw);
    this.yaw += diff * Math.min(1, 10 * dt);

    const nx = this.x + Math.sin(this.yaw) * spd * dt;
    const nz = this.z + Math.cos(this.yaw) * spd * dt;
    const resolved = GameMap.resolveWallCollision(nx, nz, this.radius);
    this.x = Utils.clamp(resolved.x, -19.5, 19.5);
    this.z = Utils.clamp(resolved.z, -14.5, 14.5);
  }

  _attack(dt, player, dist2D, canSeePlayer) {
    // Face player
    const targetYaw = Math.atan2(player.x - this.x, player.z - this.z);
    const diff = Utils.normalizeAngle(targetYaw - this.yaw);
    this.yaw += diff * Math.min(1, 12 * dt);

    // Range management
    const keepDist = 7.0;
    if (dist2D > keepDist + 1.5) {
      this._moveToward(this.lastKnownX, this.lastKnownZ, dt, this.speed.ATTACK);
    } else if (dist2D < keepDist - 1.5) {
      // Back away
      const nx = this.x - Math.sin(this.yaw) * this.speed.ATTACK * dt;
      const nz = this.z - Math.cos(this.yaw) * this.speed.ATTACK * dt;
      const r  = GameMap.resolveWallCollision(nx, nz, this.radius);
      this.x = Utils.clamp(r.x, -19.5, 19.5);
      this.z = Utils.clamp(r.z, -14.5, 14.5);
    }

    // Shoot
    if (this.fireCooldown > 0) { this.fireCooldown -= dt; return; }
    if (!canSeePlayer) return;
    this.fireCooldown = this.fireRate;
    this._shootAt(player);
  }

  _shootAt(player) {
    const botEye    = new THREE.Vector3(this.x, 1.6, this.z);
    const playerEye = new THREE.Vector3(player.x, player.eyeY, player.z);
    const dist3D    = botEye.distanceTo(playerEye);

    // Accuracy jitter
    const jX = (Math.random() - 0.5) * this.accuracy * 2;
    const jY = (Math.random() - 0.5) * this.accuracy * 2;
    const jZ = (Math.random() - 0.5) * this.accuracy * 2;
    const aimDir = new THREE.Vector3(
      playerEye.x - botEye.x + jX,
      playerEye.y - botEye.y + jY,
      playerEye.z - botEye.z + jZ
    ).normalize();

    this._raycaster.set(botEye, aimDir);
    const wallHits = this._raycaster.intersectObjects(GameMap.wallMeshes);
    const wallDist = wallHits.length ? wallHits[0].distance : Infinity;

    let tracerEnd;
    if (wallDist > dist3D * 0.95) {
      // Shot reaches player
      player.takeDamage(this.damage);
      tracerEnd = playerEye.clone();
    } else {
      tracerEnd = wallHits[0].point.clone();
    }

    this._spawnTracer(botEye, tracerEnd);
  }

  _spawnTracer(from, to) {
    if (this._tracerLine) {
      this._scene.remove(this._tracerLine);
      this._tracerLine.geometry.dispose();
    }
    const geo  = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat  = new THREE.LineBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.8 });
    this._tracerLine  = new THREE.Line(geo, mat);
    this._tracerTimer = 0.06;
    this._scene.add(this._tracerLine);
  }

  _updateHealthBar(camera, renderer, visible) {
    if (!visible) { this._barEl.style.display = 'none'; return; }
    const pos = new THREE.Vector3(this.x, 2.4, this.z);
    pos.project(camera);
    if (pos.z >= 1) { this._barEl.style.display = 'none'; return; }
    const w = renderer.domElement.clientWidth;
    const h = renderer.domElement.clientHeight;
    const sx = (pos.x + 1) / 2 * w;
    const sy = (-pos.y + 1) / 2 * h;
    this._barEl.style.display = 'block';
    this._barEl.style.left = sx + 'px';
    this._barEl.style.top  = sy + 'px';
    const pct = this.hp / this.maxHp;
    this._fillEl.style.width = (pct * 100) + '%';
    this._fillEl.style.background = pct > 0.5 ? '#4cff7a' : pct > 0.25 ? '#ffcc00' : '#ff4655';
  }

  removeFromScene() {
    this._scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    if (this._tracerLine) {
      this._scene.remove(this._tracerLine);
      this._tracerLine.geometry.dispose();
    }
    this._barEl.remove();
  }
}
