'use strict';

// ── Rank tiers (Valorant-inspired) ─────────────────────────────────────────
const RANKS = [
  { name: 'IRON',      color: '#8e9297', minScore: 0    },
  { name: 'BRONZE',    color: '#9c6d3e', minScore: 50   },
  { name: 'SILVER',    color: '#b0b8c1', minScore: 120  },
  { name: 'GOLD',      color: '#f0c040', minScore: 220  },
  { name: 'PLATINUM',  color: '#5fddce', minScore: 360  },
  { name: 'DIAMOND',   color: '#a070ff', minScore: 550  },
  { name: 'ASCENDANT', color: '#4cff7a', minScore: 800  },
  { name: 'IMMORTAL',  color: '#ff4655', minScore: 1100 },
  { name: 'RADIANT',   color: '#ffe050', minScore: 1500 },
];
function getRank(score) {
  let rank = RANKS[0];
  for (const r of RANKS) { if (score >= r.minScore) rank = r; }
  return rank;
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const canvas         = document.getElementById('game-canvas');
const menuScreen     = document.getElementById('menu-screen');
const lockScreen     = document.getElementById('lock-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const btnPlay        = document.getElementById('btn-play');
const btnRestart     = document.getElementById('btn-restart');
const healthBar      = document.getElementById('health-bar');
const healthVal      = document.getElementById('health-val');
const hudScore       = document.getElementById('hud-score');
const hudKills       = document.getElementById('hud-kills');
const ammoCur        = document.getElementById('ammo-cur');
const ammoRes        = document.getElementById('ammo-res');
const crosshair      = document.getElementById('crosshair');
const killfeed       = document.getElementById('killfeed');
const rankBadge      = document.getElementById('rank-badge');
const goTitle        = document.getElementById('go-title');
const goScore        = document.getElementById('go-score');
const goKills        = document.getElementById('go-kills');
const goRank         = document.getElementById('go-rank');
const goRankBadge    = document.getElementById('go-rank-badge');
const reloadWrap     = document.getElementById('reload-bar-wrap');
const reloadFill     = document.getElementById('reload-bar-fill');
const deathVignette  = document.getElementById('death-vignette');
const hitFlash       = document.getElementById('hit-flash');

// ── Three.js core ──────────────────────────────────────────────────────────
let renderer, scene, camera;

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);
  scene.fog = new THREE.Fog(0x0a0a0f, 22, 42);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 80);

  // Lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0, 10, 0);
  scene.add(dirLight);
}

// ── Game state ─────────────────────────────────────────────────────────────
const GS = { MENU: 'MENU', PLAYING: 'PLAYING', DEAD: 'DEAD', WIN: 'WIN' };
let state = GS.MENU;

let player, bots;
let score = 0, kills = 0;
const TOTAL_BOTS = 6;

let deathDelay    = 0;
let pointerLocked = false;

// Input
const keys         = {};
let mouseDownLeft  = false;
let justFired      = false;   // single-frame flag for semi-auto weapons

// Player tracers
const playerTracers = [];   // [{line, timer}]

// ── Pointer Lock ────────────────────────────────────────────────────────────
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (state === GS.PLAYING) {
    lockScreen.classList.toggle('active', !pointerLocked);
  }
});

document.addEventListener('mousemove', e => {
  if (pointerLocked && state === GS.PLAYING && player && player.alive) {
    player.onMouseMove(e.movementX, e.movementY);
  }
});

// Click on lock-screen (or canvas when unlocked) to re-acquire lock
lockScreen.addEventListener('click', () => {
  if (state === GS.PLAYING) canvas.requestPointerLock();
});
canvas.addEventListener('click', () => {
  if (state === GS.PLAYING && !pointerLocked) canvas.requestPointerLock();
});

// ── Input ──────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (state !== GS.PLAYING) return;
  if (k === 'r') player.startReload();
  if (k === '1' || k === '2' || k === '3') player.switchWeapon(k);
});
window.addEventListener('keyup',      e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('mousedown',  e => { if (e.button === 0) { mouseDownLeft = true;  justFired = true; } });
window.addEventListener('mouseup',    e => { if (e.button === 0)   mouseDownLeft = false; });

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ── Buttons ────────────────────────────────────────────────────────────────
btnPlay.addEventListener('click', () => {
  startGame();
  canvas.requestPointerLock();
});
btnRestart.addEventListener('click', () => {
  startGame();
  canvas.requestPointerLock();
});

// ── Start game ─────────────────────────────────────────────────────────────
function startGame() {
  score = kills = 0;
  deathDelay = 0;

  // Clear previous bots
  if (bots) bots.forEach(b => b.removeFromScene());
  bots = [];

  // Clear previous tracers
  playerTracers.forEach(t => { scene.remove(t.line); t.line.geometry.dispose(); });
  playerTracers.length = 0;

  // Rebuild scene geometry (re-add lights after clearing)
  // Remove non-light objects first
  const toRemove = [];
  scene.traverse(obj => { if (obj !== scene) toRemove.push(obj); });
  toRemove.forEach(obj => scene.remove(obj));

  // Re-add lights
  const ambient  = new THREE.AmbientLight(0xffffff, 0.45);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0, 10, 0);
  scene.add(ambient);
  scene.add(dirLight);

  GameMap.buildScene(scene);

  // Player (camera passed from Three.js init)
  player = new Player(camera);

  // Spawn bots
  for (let i = 0; i < TOTAL_BOTS; i++) {
    const spawn   = GameMap.botSpawns[i];
    const wpGroup = GameMap.waypointGroups[i % GameMap.waypointGroups.length];
    bots.push(new Bot(spawn, wpGroup, i, scene));
  }

  // UI
  menuScreen.classList.remove('active');
  gameoverScreen.classList.remove('active');
  lockScreen.classList.remove('active');
  deathVignette.style.display = 'none';
  deathVignette.style.opacity = '0';

  state = GS.PLAYING;
  updateRankBadge();
}

// ── Kill feed ──────────────────────────────────────────────────────────────
function addKillFeed(msg) {
  const el = document.createElement('div');
  el.className = 'kill-entry';
  el.textContent = msg;
  killfeed.prepend(el);
  setTimeout(() => el.remove(), 2600);
}

// ── Rank badge ─────────────────────────────────────────────────────────────
function updateRankBadge() {
  const rank = getRank(score);
  rankBadge.textContent = rank.name;
  rankBadge.style.color = rank.color;
  rankBadge.style.borderColor = rank.color + '66';
}

// ── Player tracer ──────────────────────────────────────────────────────────
function spawnPlayerTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffe050, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  playerTracers.push({ line, timer: 0.06 });
}

// ── HUD ────────────────────────────────────────────────────────────────────
function updateHUD() {
  if (!player) return;
  const pct = player.hp / player.maxHp;
  healthBar.style.width = (pct * 100) + '%';
  healthBar.style.background = pct > 0.5 ? '#ff4655' : pct > 0.25 ? '#ffcc00' : '#ff8800';
  healthVal.textContent = Math.max(0, Math.ceil(player.hp));
  hudScore.textContent  = score;
  hudKills.textContent  = kills + ' / ' + TOTAL_BOTS;

  const ws  = player.weaponState;
  const wep = player.weapon;
  ammoCur.textContent = ws.ammo;
  ammoRes.textContent = ws.reserve;
  ammoCur.style.color = player.reloading ? '#555' : '#fff';

  // Weapon selector highlight
  for (const name of WEAPON_ORDER) {
    const el = document.getElementById('wslot-' + name);
    if (el) el.classList.toggle('active', name === player.currentWeapon);
  }

  // Reload bar
  if (player.reloading) {
    reloadWrap.style.display = 'block';
    const progress = 1 - player.reloadTimer / wep.reloadTime;
    reloadFill.style.width = (progress * 100) + '%';
  } else {
    reloadWrap.style.display = 'none';
  }

  // Hit flash
  if (player.flashTimer > 0) {
    hitFlash.style.opacity = String(player.flashTimer / 0.18);
  } else {
    hitFlash.style.opacity = '0';
  }
}

// ── End game ───────────────────────────────────────────────────────────────
function endGame(won) {
  state = won ? GS.WIN : GS.MENU;
  document.exitPointerLock();
  lockScreen.classList.remove('active');

  const rank = getRank(score);
  goTitle.textContent    = won ? 'VICTORY' : 'ELIMINATED';
  goTitle.style.color    = won ? '#4cff7a' : '#ff4655';
  goScore.textContent    = score;
  goKills.textContent    = kills;
  goRank.textContent     = rank.name;
  goRank.style.color     = rank.color;
  goRankBadge.textContent = rank.name;
  goRankBadge.style.color = rank.color;
  gameoverScreen.classList.add('active');
}

// ── Update ─────────────────────────────────────────────────────────────────
function update(dt) {
  if (state !== GS.PLAYING && state !== GS.DEAD) return;

  if (state === GS.PLAYING && player && player.alive && pointerLocked) {
    const wep = player.weapon;
    const wantsShoot = wep.auto ? mouseDownLeft : justFired;

    if (wantsShoot) {
      const result = player.shoot(bots, scene);
      if (result) {
        // Flash crosshair
        crosshair.classList.add('shooting');
        setTimeout(() => crosshair.classList.remove('shooting'), 80);

        if (result.botHit) {
          const bot = result.botHit;
          const wasDead = !bot.alive;
          bot.takeDamage(player.weapon.damage);
          // Check if this shot killed the bot
          if (!wasDead && !bot.alive) {
            const pts = 50 + kills * 10;
            score += pts;
            kills++;
            addKillFeed('YOU eliminated BOT-' + bot.id + '  +' + pts);
            updateRankBadge();
          }
        }

        spawnPlayerTracer(camera.position.clone(), result.tracerEnd);
      }
    }
  }
  justFired = false;

  // Update player
  if (player) player.update(dt, keys);

  // Update bots
  for (const bot of bots) {
    bot.update(dt, player, camera, renderer);
  }

  // Update player tracers
  for (let i = playerTracers.length - 1; i >= 0; i--) {
    const t = playerTracers[i];
    t.timer -= dt;
    t.line.material.opacity = Math.max(0, t.timer / 0.06 * 0.9);
    if (t.timer <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      playerTracers.splice(i, 1);
    }
  }

  // Clean up bots that finished death animation
  for (let i = bots.length - 1; i >= 0; i--) {
    if (bots[i].deathTimer > 1.0) {
      bots[i].removeFromScene();
      bots.splice(i, 1);
    }
  }

  // Win condition
  if (kills === TOTAL_BOTS) {
    endGame(true);
    return;
  }

  // Death
  if (player && !player.alive) {
    if (state === GS.PLAYING) { state = GS.DEAD; deathDelay = 1.5; }
  }
  if (state === GS.DEAD) {
    deathDelay -= dt;
    const progress = Math.min(1, (1.5 - deathDelay) / 1.5);
    deathVignette.style.display = 'block';
    deathVignette.style.opacity = String(progress * 0.95);
    if (deathDelay <= 0) { endGame(false); return; }
  }

  updateHUD();
}

// ── Draw ───────────────────────────────────────────────────────────────────
function draw() {
  renderer.render(scene, camera);
}

// ── Loop ───────────────────────────────────────────────────────────────────
let lastTime = 0;
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ── Boot ───────────────────────────────────────────────────────────────────
initThree();
requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
