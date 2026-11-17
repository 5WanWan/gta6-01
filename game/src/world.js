// The game's rules and state, with no drawing and no browser in it: the player on foot
// and in cars, traffic and pedestrians, police and the wanted level, combat, pickups,
// particles and the five-mission story. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about screens.
import {
  CAR, CLOCK, PEDS, PLAYER, POLICE, ROAD, TRAFFIC, VIEW, WANTED, WORLD,
} from './config.js';
import { clamp, distance, intBetween, pick, wrapAngle } from './random.js';
import { districtAt, hitsBuilding, nearestRoadPoint, slideOutOfBuildings } from './city.js';
import { missionAt, stepLabel } from './missions.js';

export const EVENT_OVER = 1;
export const EVENT_MISSION_DONE = 2;
export const EVENT_SHOT = 4;
export const EVENT_PICKUP = 8;
export const EVENT_CRIME = 16;
export const EVENT_PUNCH = 32;

const CAR_COLORS = ['#e84a4a', '#4a90e8', '#e8c94a', '#7fd08a', '#b07fd0', '#e89a5a', '#d0d0d0', '#3a3f4a', '#ffcf3f'];
const THUG_NAMES = ['Venn’s crew', 'Venn’s crew', 'Venn’s crew'];

function overlapsCircleRect(cx, cy, r, rect) {
  const nearX = clamp(cx, rect.x, rect.x + rect.w);
  const nearY = clamp(cy, rect.y, rect.y + rect.h);
  return distance(cx, cy, nearX, nearY) < r;
}

export function createWorld(random, city) {
  const player = {
    x: 675, y: 760, angle: -Math.PI / 2, health: PLAYER.health, cash: 120,
    ammo: PLAYER.startAmmo, car: null, punchTimer: 0, shootTimer: 0,
    invulnerable: 0, moving: false,
  };
  const cars = [];
  const peds = [];
  const thugs = [];
  const cops = [];
  const bullets = [];
  const particles = [];
  const skids = [];
  const pickups = [];
  const log = [];
  const camera = { x: 0, y: 0 };
  const wanted = { heat: 0, stars: 0, quietTimer: 99 };
  const state = {
    player, cars, peds, thugs, cops, bullets, particles, skids, pickups, log, camera, wanted,
    clockMinutes: CLOCK.startHour * 60,
    missionIndex: 0, missionStep: 0, takenDown: 0, missionActive: true, thugsSpawned: false,
    storyDone: false, gameOver: null, elapsed: 0,
    dialogue: '', dialogueTtl: 0, dialogueQueue: [],
    stats: { carsStolen: 0, thugsDown: 0, missionsDone: 0 },
    objective: '', district: 'Old Quay',
  };

  function say(text, seconds) {
    state.dialogueQueue.push(text);
    if (state.dialogueTtl <= 0) nextDialogue();
    void seconds;
  }
  function nextDialogue() {
    if (state.dialogueQueue.length === 0) {
      state.dialogue = '';
      state.dialogueTtl = 0;
      return;
    }
    state.dialogue = state.dialogueQueue.shift();
    state.dialogueTtl = 4.5;
  }
  function addLog(text) {
    log.unshift(text);
    if (log.length > 6) log.pop();
  }
  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      if (particles.length > 320) return;
      const a = random() * Math.PI * 2;
      const s = (0.3 + random() * 0.7) * speed;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + random() * 0.4, maxLife: 0.9, color, size: 2 + random() * 3 });
    }
  }
  function addHeat(amount, reason) {
    wanted.heat = clamp(wanted.heat + amount, 0, 100);
    wanted.quietTimer = 0;
    if (reason) addLog(reason);
  }
  function starsFor(heat) {
    let stars = 0;
    for (let i = 0; i < WANTED.starThresholds.length; i += 1) {
      if (heat >= WANTED.starThresholds[i]) stars = i;
    }
    return stars;
  }
  function makeCar(x, y, angle, kind, color) {
    const car = {
      x, y, angle, speed: 0, color: color || pick(random, CAR_COLORS),
      kind, axis: 'h', dir: random() < 0.5 ? 1 : -1, lane: random() < 0.5 ? -1 : 1,
      cruise: TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin),
      driver: kind !== 'parked', police: kind === 'police', stolen: false, brakeLight: false,
    };
    cars.push(car);
    return car;
  }
  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    const roadIndex = intBetween(random, 1, 7);
    const along = 100 + random() * (WORLD.size - 200);
    const roadPos = roadIndex * ROAD.spacing;
    const lane = random() < 0.5 ? -ROAD.lane : ROAD.lane;
    if (horizontal) makeCar(along, roadPos + lane, random() < 0.5 ? 0 : Math.PI, 'traffic');
    else makeCar(roadPos + lane, along, random() < 0.5 ? Math.PI / 2 : -Math.PI / 2, 'traffic');
  }
  function spawnPed() {
    const x = 120 + random() * (WORLD.size - 240);
    const y = 120 + random() * (WORLD.size - 240);
    peds.push({
      x, y, angle: random() * Math.PI * 2, speed: PEDS.speedMin + random() * (PEDS.speedMax - PEDS.speedMin),
      color: pick(random, ['#e86a6a', '#6aa8e8', '#7fd08a', '#e8c96a', '#b07fd0', '#e89a5a']),
      flee: 0, retarget: 0, down: false,
    });
  }
  function spawnThugs(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      thugs.push({
        x: x + (random() - 0.5) * 320, y: y + (random() - 0.5) * 320,
        angle: random() * Math.PI * 2, health: 60, shootTimer: 1 + random(),
        speed: 95 + random() * 30, name: THUG_NAMES[0],
      });
    }
  }
  function spawnPoliceCar() {
    const angle = random() * Math.PI * 2;
    const dist = 700 + random() * 300;
    const road = nearestRoadPoint(player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist);
    const car = makeCar(clamp(road.x, 60, WORLD.size - 60), clamp(road.y, 60, WORLD.size - 60), 0, 'police', '#2f6fd0');
    car.speed = 200;
    return car;
  }
  function spawnFootCop() {
    const angle = random() * Math.PI * 2;
    const dist = 420 + random() * 200;
    cops.push({
      x: clamp(player.x + Math.cos(angle) * dist, 40, WORLD.size - 40),
      y: clamp(player.y + Math.sin(angle) * dist, 40, WORLD.size - 40),
      angle, speed: 190, arrestTimer: 0, hitTimer: 0,
    });
  }
  function dropPickup(x, y, kind, amount) {
    pickups.push({ x, y, kind, amount, ttl: 45 });
  }
  function placeStartPickups() {
    const spots = [
      { x: 900, y: 900, kind: 'health', amount: 40 },
      { x: 2250, y: 900, kind: 'ammo', amount: 24 },
      { x: 900, y: 2250, kind: 'cash', amount: 150 },
      { x: 2250, y: 2250, kind: 'ammo', amount: 24 },
      { x: 1800, y: 3150, kind: 'health', amount: 40 },
      { x: 3150, y: 1800, kind: 'cash', amount: 200 },
    ];
    for (const spot of spots) dropPickup(spot.x, spot.y, spot.kind, spot.amount);
  }

  function reset() {
    cars.length = 0;
    peds.length = 0;
    thugs.length = 0;
    cops.length = 0;
    bullets.length = 0;
    particles.length = 0;
    skids.length = 0;
    pickups.length = 0;
    log.length = 0;
    player.x = 675;
    player.y = 760;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.cash = 120;
    player.ammo = PLAYER.startAmmo;
    player.car = null;
    player.punchTimer = 0;
    player.shootTimer = 0;
    player.invulnerable = 0;
    wanted.heat = 0;
    wanted.stars = 0;
    wanted.quietTimer = 99;
    state.clockMinutes = CLOCK.startHour * 60;
    state.missionIndex = 0;
    state.missionStep = 0;
    state.takenDown = 0;
    state.missionActive = true;
    state.thugsSpawned = false;
    state.storyDone = false;
    state.gameOver = null;
    state.elapsed = 0;
    state.dialogue = '';
    state.dialogueTtl = 0;
    state.dialogueQueue = [];
    state.stats = { carsStolen: 0, thugsDown: 0, missionsDone: 0 };
    for (const spot of city.parkingSpots) {
      makeCar(spot.x, spot.y, Math.PI / 2, 'parked');
    }
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    placeStartPickups();
    camera.x = clamp(player.x - VIEW.width / 2, 0, WORLD.size - VIEW.width);
    camera.y = clamp(player.y - VIEW.height / 2, 0, WORLD.size - VIEW.height);
    updateObjective();
    addLog('RADIO: Morning in Port Meridian. Marla Quinn is looking for a driver.');
  }

  function currentMission() {
    return state.missionActive ? missionAt(state.missionIndex) : null;
  }
  function updateObjective() {
    const mission = currentMission();
    if (!mission) {
      state.objective = state.storyDone ? 'Story complete — free roam Port Meridian' : 'Free roam — press M for the next job';
      return;
    }
    state.objective = `M${mission.id} ${mission.title}: ${stepLabel(mission, state.missionStep, state.takenDown)}`;
  }
  function startMissionStep() {
    const mission = currentMission();
    if (!mission) return;
    const step = mission.steps[state.missionStep];
    if (!step) return;
    if (step.say) say(step.say);
    if (step.kind === 'takedown' && !state.thugsSpawned) {
      spawnThugs(step.x, step.y, step.count);
      state.thugsSpawned = true;
    }
    updateObjective();
  }
  function advanceMissionStep() {
    const mission = currentMission();
    if (!mission) return;
    state.missionStep += 1;
    state.takenDown = 0;
    state.thugsSpawned = false;
    if (state.missionStep >= mission.steps.length) {
      completeMission(mission);
      return;
    }
    startMissionStep();
  }
  function completeMission(mission) {
    player.cash += mission.reward;
    state.stats.missionsDone += 1;
    addLog(`MISSION COMPLETE: ${mission.title} — +$${mission.reward}`);
    say(`Marla: "${mission.title} done. $${mission.reward} is yours, Rook."`);
    state.missionIndex += 1;
    state.missionStep = 0;
    const next = missionAt(state.missionIndex);
    if (!next) {
      state.storyDone = true;
      state.missionActive = false;
      addLog('STORY COMPLETE: The ledger is home. Port Meridian is yours.');
      updateObjective();
      return;
    }
    for (const line of next.brief) say(line);
    startMissionStep();
  }
  function nearestCar(maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of cars) {
      const d = distance(player.x, player.y, car.x, car.y);
      if (d < bestDist) {
        bestDist = d;
        best = car;
      }
    }
    return best;
  }
  function enterCar() {
    const car = nearestCar(CAR.enterRange);
    if (!car) return false;
    if (car.kind === 'traffic' || car.kind === 'parked') {
      if (!car.stolen) {
        car.stolen = true;
        state.stats.carsStolen += 1;
        if (car.kind === 'traffic') {
          addHeat(WANTED.stealHeat, 'RADIO: Carjacking reported near ' + districtAt(player.x, player.y));
        } else {
          addHeat(WANTED.stealHeat / 2, 'RADIO: Vehicle theft reported near ' + districtAt(player.x, player.y));
        }
      }
    }
    if (car.kind === 'police') return false;
    car.driver = true;
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    return true;
  }
  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.speed = 0;
    car.driver = false;
    player.car = null;
    const side = player.angle + Math.PI / 2;
    player.x = clamp(car.x + Math.cos(side) * 44, 20, WORLD.size - 20);
    player.y = clamp(car.y + Math.sin(side) * 44, 20, WORLD.size - 20);
    slideOutOfBuildings(city, player, PLAYER.radius);
  }
  function fireBullet(x, y, angle, fromPlayer, damage) {
    bullets.push({ x, y, angle, speed: fromPlayer ? 950 : 720, life: 1.1, fromPlayer, damage });
  }
  function hurtPlayer(amount, cause) {
    if (player.invulnerable > 0) return;
    player.health -= amount;
    player.invulnerable = 0.35;
    burst(player.x, player.y, '#ff5a4a', 8, 160);
    if (player.health <= 0) {
      player.health = 0;
      state.gameOver = cause === 'arrest' ? 'busted' : 'wasted';
    }
  }
  function killThug(thug) {
    const index = thugs.indexOf(thug);
    if (index >= 0) thugs.splice(index, 1);
    state.stats.thugsDown += 1;
    state.takenDown += 1;
    burst(thug.x, thug.y, '#b03a3a', 16, 220);
    dropPickup(thug.x, thug.y, 'cash', 50 + intBetween(random, 0, 100));
    if (random() < 0.5) dropPickup(thug.x + 20, thug.y, 'ammo', 12);
    addLog('Thug down. Venn’s crew is thinning out.');
    updateObjective();
  }
  function stepPlayerOnFoot(dt, input, pointer, actions) {
    const move = input.move();
    player.moving = move.x !== 0 || move.y !== 0;
    if (player.moving) {
      player.x += move.x * PLAYER.walkSpeed * dt;
      player.y += move.y * PLAYER.walkSpeed * dt;
      player.x = clamp(player.x, 20, WORLD.size - 20);
      player.y = clamp(player.y, 20, WORLD.size - 20);
      slideOutOfBuildings(city, player, PLAYER.radius);
      for (const car of cars) {
        const d = distance(player.x, player.y, car.x, car.y);
        if (d < 34 && d > 0.01) {
          player.x += ((player.x - car.x) / d) * (34 - d);
          player.y += ((player.y - car.y) / d) * (34 - d);
        }
      }
    }
    const aimX = camera.x + pointer.x;
    const aimY = camera.y + pointer.y;
    player.angle = Math.atan2(aimY - player.y, aimX - player.x);
    if (player.punchTimer > 0) player.punchTimer -= dt;
    if (player.shootTimer > 0) player.shootTimer -= dt;
    if (player.invulnerable > 0) player.invulnerable -= dt;
    // Punch: short arc in front of the player.
    if (actions & 8) {
      if (player.punchTimer <= 0) {
        player.punchTimer = 0.45;
        let hitSomething = false;
        for (const thug of [...thugs]) {
          const d = distance(player.x, player.y, thug.x, thug.y);
          const ang = Math.abs(wrapAngle(Math.atan2(thug.y - player.y, thug.x - player.x) - player.angle));
          if (d < PLAYER.punchRange + 14 && ang < 1.1) {
            thug.health -= PLAYER.punchDamage;
            burst(thug.x, thug.y, '#ffd24a', 6, 140);
            hitSomething = true;
            if (thug.health <= 0) killThug(thug);
          }
        }
        for (const cop of cops) {
          const d = distance(player.x, player.y, cop.x, cop.y);
          if (d < PLAYER.punchRange + 14) {
            cop.x += Math.cos(player.angle) * 60;
            cop.y += Math.sin(player.angle) * 60;
            addHeat(WANTED.shootHeat, 'RADIO: Officer assaulted in ' + districtAt(player.x, player.y));
            hitSomething = true;
          }
        }
        if (hitSomething) return { punched: true };
      }
    }
    // Pistol: mouse aim, hold to fire.
    if (input.firing() && player.shootTimer <= 0 && player.ammo > 0) {
      player.shootTimer = 0.22;
      player.ammo -= 1;
      const mx = player.x + Math.cos(player.angle) * 24;
      const my = player.y + Math.sin(player.angle) * 24;
      fireBullet(mx, my, player.angle, true, PLAYER.pistolDamage);
      burst(mx, my, '#ffd24a', 4, 120);
      addHeat(2, null);
      return { shot: true };
    }
    return {};
  }
  function stepPlayerDriving(dt, input) {
    const car = player.car;
    const drive = input.drive();
    if (drive.throttle > 0) car.speed += CAR.accel * dt;
    else if (drive.throttle < 0) {
      if (car.speed > 20) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.accel * 0.5 * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 180 * dt;
      if (Math.abs(car.speed) < 8) car.speed = 0;
    }
    car.speed = clamp(car.speed, -CAR.reverseMax, CAR.maxSpeed);
    const steerAmount = drive.steer * CAR.turnRate * clamp(Math.abs(car.speed) / 220, 0, 1) * Math.sign(car.speed || 1);
    const prevAngle = car.angle;
    car.angle += steerAmount * dt;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    car.x = clamp(car.x, 30, WORLD.size - 30);
    car.y = clamp(car.y, 30, WORLD.size - 30);
    if (hitsBuilding(city, car.x, car.y, 26)) {
      car.x -= Math.cos(car.angle) * car.speed * dt;
      car.y -= Math.sin(car.angle) * car.speed * dt;
      if (Math.abs(car.speed) > 240) burst(car.x, car.y, '#ffb347', 10, 200);
      car.speed *= -0.25;
    }
    if (Math.abs(car.speed) > 300 && drive.steer !== 0) {
      skids.push({ x1: car.x - Math.cos(car.angle) * 20, y1: car.y - Math.sin(car.angle) * 20, x2: car.x, y2: car.y, life: 1.6 });
      if (skids.length > 240) skids.shift();
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    void prevAngle;
    // Running over a pedestrian is a crime.
    for (const ped of peds) {
      if (ped.down) continue;
      if (distance(car.x, car.y, ped.x, ped.y) < 36 && Math.abs(car.speed) > 60) {
        ped.down = true;
        ped.flee = 0;
        burst(ped.x, ped.y, '#ff5a4a', 14, 200);
        addHeat(WANTED.hitPedHeat, 'RADIO: Pedestrian struck in ' + districtAt(car.x, car.y));
      }
    }
  }
  function stepTraffic(dt) {
    for (const car of cars) {
      if (car.kind !== 'traffic') continue;
      if (car === player.car) continue;
      const nearLine = (v) => {
        const r = ((v % ROAD.spacing) + ROAD.spacing) % ROAD.spacing;
        return r < 26 || r > ROAD.spacing - 26;
      };
      if ((nearLine(car.x) || nearLine(car.y)) && random() < 0.012) {
        // Turn at an intersection: pick a new road and direction.
        car.axis = car.axis === 'h' ? 'v' : 'h';
        car.dir = random() < 0.5 ? 1 : -1;
        const road = nearestRoadPoint(car.x, car.y);
        car.x = road.x;
        car.y = road.y;
      }
      // Stay in lane and keep speed.
      if (car.axis === 'h') {
        const roadY = Math.round(car.y / ROAD.spacing) * ROAD.spacing;
        car.y += (roadY + car.lane * ROAD.lane - car.y) * Math.min(1, dt * 4);
        car.x += car.dir * car.cruise * dt;
        car.angle = car.dir > 0 ? 0 : Math.PI;
        if (car.x < 40) { car.x = 40; car.dir = 1; }
        if (car.x > WORLD.size - 40) { car.x = WORLD.size - 40; car.dir = -1; }
      } else {
        const roadX = Math.round(car.x / ROAD.spacing) * ROAD.spacing;
        car.x += (roadX + car.lane * ROAD.lane - car.x) * Math.min(1, dt * 4);
        car.y += car.dir * car.cruise * dt;
        car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (car.y < 40) { car.y = 40; car.dir = 1; }
        if (car.y > WORLD.size - 40) { car.y = WORLD.size - 40; car.dir = -1; }
      }
      // Gentle separation from other traffic.
      for (const other of cars) {
        if (other === car || other.kind !== 'traffic') continue;
        const d = distance(car.x, car.y, other.x, other.y);
        if (d < 58 && d > 0.01) {
          car.x += ((car.x - other.x) / d) * 20 * dt;
          car.y += ((car.y - other.y) / d) * 20 * dt;
        }
      }
      // Bump the player's car: slow both, spark, no crime for a tap.
      if (player.car && distance(car.x, car.y, player.car.x, player.car.y) < 62) {
        const push = 90 * dt;
        const a = Math.atan2(car.y - player.car.y, car.x - player.car.x);
        car.x += Math.cos(a) * push;
        car.y += Math.sin(a) * push;
        car.cruise = Math.max(90, car.cruise - 30 * dt);
        if (Math.abs(player.car.speed) > 200) burst(car.x, car.y, '#ffb347', 5, 140);
      }
    }
  }
  function stepPolice(dt) {
    const wantCars = wanted.stars >= 1 ? Math.min(POLICE.maxCars, wanted.stars + 1) : 0;
    const policeCars = cars.filter((car) => car.kind === 'police');
    if (policeCars.length < wantCars && random() < dt * 1.2) spawnPoliceCar();
    if (policeCars.length > wantCars && random() < dt * 0.5) {
      const far = policeCars.sort((a, b) => distance(b.x, b.y, player.x, player.y) - distance(a.x, a.y, player.x, player.y))[0];
      if (far && distance(far.x, far.y, player.x, player.y) > 900) cars.splice(cars.indexOf(far), 1);
    }
    for (const car of policeCars) {
      const targetAngle = Math.atan2(player.y - car.y, player.x - car.x);
      const diff = wrapAngle(targetAngle - car.angle);
      car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      const targetSpeed = Math.min(CAR.policeMaxSpeed, 380 + wanted.stars * 55);
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 0.9);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 30, WORLD.size - 30);
      car.y = clamp(car.y, 30, WORLD.size - 30);
      if (hitsBuilding(city, car.x, car.y, 26)) {
        car.x -= Math.cos(car.angle) * car.speed * dt;
        car.y -= Math.sin(car.angle) * car.speed * dt;
        car.angle += Math.PI / 2;
        car.speed *= 0.4;
      }
      // Ram the player: on foot it hurts, in a car it shoves.
      const d = distance(car.x, car.y, player.x, player.y);
      if (d < 52) {
        if (player.car) {
          player.car.speed *= 0.94;
          player.car.x += Math.cos(car.angle) * 40 * dt;
          player.car.y += Math.sin(car.angle) * 40 * dt;
        } else {
          hurtPlayer(6, 'rammed');
        }
        burst(player.x, player.y, '#7fb3ff', 5, 120);
      }
    }
    const wantFoot = wanted.stars >= 1 ? Math.min(POLICE.maxFoot, wanted.stars * 2) : 0;
    if (cops.length < wantFoot && random() < dt * 1.5) spawnFootCop();
    if (cops.length > wantFoot && random() < dt * 0.4) cops.shift();
    for (const cop of [...cops]) {
      const d = distance(cop.x, cop.y, player.x, player.y);
      const targetAngle = Math.atan2(player.y - cop.y, player.x - cop.x);
      cop.angle = targetAngle;
      cop.x += Math.cos(targetAngle) * cop.speed * dt;
      cop.y += Math.sin(targetAngle) * cop.speed * dt;
      slideOutOfBuildings(city, cop, 12);
      if (d < POLICE.arrestRange) {
        if (player.car) {
          cop.arrestTimer = 0;
        } else {
          cop.arrestTimer += dt;
          if (cop.arrestTimer > 1.2) {
            state.gameOver = 'busted';
            return;
          }
        }
      } else cop.arrestTimer = 0;
      if (d < 44 && !player.car) {
        cop.hitTimer -= dt;
        if (cop.hitTimer <= 0) {
          cop.hitTimer = 0.9;
          hurtPlayer(8, 'beaten');
        }
      }
    }
  }
  function stepPeds(dt) {
    for (const ped of peds) {
      if (ped.down) continue;
      const distToPlayer = distance(ped.x, ped.y, player.x, player.y);
      if (wanted.stars >= 2 && distToPlayer < 260) ped.flee = 2;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const away = Math.atan2(ped.y - player.y, ped.x - player.x);
        ped.x += Math.cos(away) * ped.speed * 2.1 * dt;
        ped.y += Math.sin(away) * ped.speed * 2.1 * dt;
      } else {
        ped.retarget -= dt;
        if (ped.retarget <= 0) {
          ped.retarget = 2 + random() * 4;
          ped.angle = random() * Math.PI * 2;
        }
        ped.x += Math.cos(ped.angle) * ped.speed * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * dt;
      }
      ped.x = clamp(ped.x, 20, WORLD.size - 20);
      ped.y = clamp(ped.y, 20, WORLD.size - 20);
      if (slideOutOfBuildings(city, ped, 10)) ped.angle += Math.PI / 2;
    }
    // Downed pedestrians get back up after a while, away from the action.
    for (const ped of peds) {
      if (ped.down && distance(ped.x, ped.y, player.x, player.y) > 500) {
        ped.down = false;
        ped.flee = 2;
      }
    }
    if (peds.length < PEDS.count && random() < dt * 0.2) spawnPed();
  }
  function stepThugs(dt) {
    for (const thug of [...thugs]) {
      const d = distance(thug.x, thug.y, player.x, player.y);
      const targetAngle = Math.atan2(player.y - thug.y, player.x - thug.x);
      thug.angle = targetAngle;
      if (d > 220) {
        thug.x += Math.cos(targetAngle) * thug.speed * dt;
        thug.y += Math.sin(targetAngle) * thug.speed * dt;
        slideOutOfBuildings(city, thug, 12);
      }
      thug.shootTimer -= dt;
      if (thug.shootTimer <= 0 && d < 460) {
        thug.shootTimer = 1.3 + random() * 0.7;
        fireBullet(thug.x + Math.cos(targetAngle) * 20, thug.y + Math.sin(targetAngle) * 20, targetAngle + (random() - 0.5) * 0.16, false, 8);
      }
    }
  }
  function stepBullets(dt) {
    for (const bullet of [...bullets]) {
      bullet.x += Math.cos(bullet.angle) * bullet.speed * dt;
      bullet.y += Math.sin(bullet.angle) * bullet.speed * dt;
      bullet.life -= dt;
      let dead = bullet.life <= 0 || bullet.x < 0 || bullet.y < 0 || bullet.x > WORLD.size || bullet.y > WORLD.size;
      if (!dead && hitsBuilding(city, bullet.x, bullet.y, 2)) {
        burst(bullet.x, bullet.y, '#cbbf9f', 4, 90);
        dead = true;
      }
      if (!dead && bullet.fromPlayer) {
        for (const thug of [...thugs]) {
          if (distance(bullet.x, bullet.y, thug.x, thug.y) < 17) {
            thug.health -= bullet.damage;
            burst(thug.x, thug.y, '#ff5a4a', 8, 160);
            if (thug.health <= 0) killThug(thug);
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const cop of [...cops]) {
            if (distance(bullet.x, bullet.y, cop.x, cop.y) < 15) {
              cops.splice(cops.indexOf(cop), 1);
              burst(cop.x, cop.y, '#7fb3ff', 10, 160);
              addHeat(WANTED.killHeat, 'RADIO: Officer down in ' + districtAt(player.x, player.y));
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const ped of peds) {
            if (!ped.down && distance(bullet.x, bullet.y, ped.x, ped.y) < 14) {
              ped.down = true;
              burst(ped.x, ped.y, '#ff5a4a', 10, 160);
              addHeat(WANTED.hitPedHeat, 'RADIO: Shots fired in ' + districtAt(player.x, player.y));
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const car of cars) {
            if (car === player.car) continue;
            if (distance(bullet.x, bullet.y, car.x, car.y) < 34) {
              burst(bullet.x, bullet.y, '#ffb347', 5, 120);
              dead = true;
              break;
            }
          }
        }
      }
      if (!dead && !bullet.fromPlayer) {
        if (distance(bullet.x, bullet.y, player.x, player.y) < (player.car ? 30 : 14)) {
          hurtPlayer(bullet.damage, 'shot');
          dead = true;
        }
      }
      if (dead) bullets.splice(bullets.indexOf(bullet), 1);
    }
  }
  function stepPickups(dt) {
    for (const pickup of [...pickups]) {
      pickup.ttl -= dt;
      if (pickup.ttl <= 0) {
        pickups.splice(pickups.indexOf(pickup), 1);
        continue;
      }
      if (distance(player.x, player.y, pickup.x, pickup.y) < (player.car ? 52 : 34)) {
        if (pickup.kind === 'cash') {
          player.cash += pickup.amount;
          addLog(`Picked up $${pickup.amount} in cash.`);
        } else if (pickup.kind === 'health') {
          player.health = Math.min(PLAYER.health, player.health + pickup.amount);
          addLog(`Picked up a first-aid kit (+${pickup.amount} health).`);
        } else {
          player.ammo = Math.min(PLAYER.maxAmmo, player.ammo + pickup.amount);
          addLog(`Picked up ${pickup.amount} rounds of ammo.`);
        }
        pickups.splice(pickups.indexOf(pickup), 1);
      }
    }
  }
  function stepWanted(dt) {
    const stars = starsFor(wanted.heat);
    if (stars !== wanted.stars) {
      wanted.stars = stars;
      if (stars > 0) addLog(`RADIO: Wanted level ${stars} — Port Meridian PD responding.`);
      else addLog('RADIO: All quiet. The heat is off, for now.');
      updateObjective();
    }
    wanted.quietTimer += dt;
    const nearestCop = Math.min(
      ...cops.map((cop) => distance(cop.x, cop.y, player.x, player.y)),
      ...cars.filter((car) => car.kind === 'police').map((car) => distance(car.x, car.y, player.x, player.y)),
      9999,
    );
    if (wanted.quietTimer > WANTED.quietSeconds && nearestCop > 380 && wanted.heat > 0) {
      wanted.heat = Math.max(0, wanted.heat - WANTED.decayPerSecond * dt);
    }
  }
  function stepMission(dt) {
    const mission = currentMission();
    if (!mission) return;
    const step = mission.steps[state.missionStep];
    if (!step) return;
    if (step.kind === 'goto' || step.kind === 'driveTo') {
      if (distance(player.x, player.y, step.x, step.y) < step.radius) {
        burst(step.x, step.y, '#ffcf3f', 18, 200);
        advanceMissionStep();
      }
    } else if (step.kind === 'enterCar') {
      if (player.car) advanceMissionStep();
    } else if (step.kind === 'takedown') {
      if (state.takenDown >= step.count) advanceMissionStep();
    } else if (step.kind === 'escape') {
      if (wanted.stars === 0) advanceMissionStep();
    }
    void dt;
  }

  /**
   * One fixed step. `input` is the input device, `pointer` the mouse in logical view
   * coordinates, `audio` the sound module (may be null in tests), and `actionsIn` the
   * one-shot flags already taken this frame (the caller takes them once, so a press is
   * never eaten twice). Returns event flags.
   */
  function step(dt, input, pointer, audio, actionsIn) {
    let events = 0;
    state.elapsed += dt;
    // Clock: 0.35 game-minutes per real second, so a full day takes about an hour.
    state.clockMinutes = (state.clockMinutes + CLOCK.minutesPerSecond * dt) % (24 * 60);
    if (state.dialogueTtl > 0) {
      state.dialogueTtl -= dt;
      if (state.dialogueTtl <= 0) nextDialogue();
    }
    if (state.gameOver) return EVENT_OVER;

    const actions = actionsIn === undefined ? input.takeActions() : actionsIn;
    if (actions & 4) {
      if (player.car) exitCar();
      else if (enterCar()) addLog('You are behind the wheel.');
    }

    let result = {};
    if (player.car) stepPlayerDriving(dt, input);
    else result = stepPlayerOnFoot(dt, input, pointer, actions);
    if (result.shot) events |= EVENT_SHOT;
    if (result.punched) events |= EVENT_PUNCH;

    stepTraffic(dt);
    stepPolice(dt);
    if (state.gameOver) return EVENT_OVER;
    stepPeds(dt);
    stepThugs(dt);
    stepBullets(dt);
    if (state.gameOver) return EVENT_OVER;
    stepPickups(dt);
    stepWanted(dt);
    stepMission(dt);

    // Particles and skid marks fade.
    for (const p of [...particles]) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) particles.splice(particles.indexOf(p), 1);
    }
    for (const s of [...skids]) {
      s.life -= dt;
      if (s.life <= 0) skids.splice(skids.indexOf(s), 1);
    }

    // Camera follows the player, clamped to the world.
    const targetX = clamp(player.x - VIEW.width / 2, 0, WORLD.size - VIEW.width);
    const targetY = clamp(player.y - VIEW.height / 2, 0, WORLD.size - VIEW.height);
    camera.x += (targetX - camera.x) * Math.min(1, dt * 6);
    camera.y += (targetY - camera.y) * Math.min(1, dt * 6);
    state.district = districtAt(player.x, player.y);

    if (audio) {
      audio.engine(player.car ? Math.abs(player.car.speed) / CAR.maxSpeed : 0, Boolean(player.car));
      audio.siren(wanted.stars > 0);
      if (audio.musicOn) audio.music(dt);
    }
    if (state.gameOver) events |= EVENT_OVER;
    return events;
  }

  function makeSave() {
    return {
      cash: player.cash, health: player.health, ammo: player.ammo,
      x: Math.round(player.x), y: Math.round(player.y),
      missionIndex: state.missionIndex, missionStep: state.missionStep,
      missionsDone: state.stats.missionsDone, storyDone: state.storyDone,
    };
  }
  function applySave(save) {
    if (!save) return false;
    player.cash = save.cash ?? 120;
    player.health = save.health ?? PLAYER.health;
    player.ammo = save.ammo ?? PLAYER.startAmmo;
    player.x = clamp(save.x ?? 675, 20, WORLD.size - 20);
    player.y = clamp(save.y ?? 760, 20, WORLD.size - 20);
    player.car = null;
    state.missionIndex = save.missionIndex ?? 0;
    state.missionStep = save.missionStep ?? 0;
    state.storyDone = Boolean(save.storyDone);
    state.missionActive = !state.storyDone && missionAt(state.missionIndex) !== null;
    state.takenDown = 0;
    state.thugsSpawned = false;
    camera.x = clamp(player.x - VIEW.width / 2, 0, WORLD.size - VIEW.width);
    camera.y = clamp(player.y - VIEW.height / 2, 0, WORLD.size - VIEW.height);
    const mission = currentMission();
    if (mission) {
      for (const line of mission.brief) say(line);
      startMissionStep();
    }
    updateObjective();
    return true;
  }

  // Staging helpers for the screenshot scenes (shots.js): put the player somewhere,
  // hand them a car, set the wanted level and start a mission step, all through the
  // same rules the live game uses.
  function teleportPlayer(x, y) {
    player.x = clamp(x, 20, WORLD.size - 20);
    player.y = clamp(y, 20, WORLD.size - 20);
    player.car = null;
    camera.x = clamp(player.x - VIEW.width / 2, 0, WORLD.size - VIEW.width);
    camera.y = clamp(player.y - VIEW.height / 2, 0, WORLD.size - VIEW.height);
  }
  function givePlayerCar(x, y, angle) {
    const car = makeCar(x, y, angle, 'parked', '#ffcf3f');
    car.stolen = true;
    car.driver = true;
    player.car = car;
    player.x = x;
    player.y = y;
    return car;
  }
  function setWantedStars(stars) {
    wanted.heat = stars <= 0 ? 0 : WANTED.starThresholds[stars] + 2;
    wanted.stars = stars;
    wanted.quietTimer = 0;
  }
  function startMission(index, stepIndex) {
    state.missionIndex = index;
    state.missionStep = stepIndex || 0;
    state.missionActive = true;
    state.storyDone = false;
    state.takenDown = 0;
    state.thugsSpawned = false;
    const mission = currentMission();
    if (mission) {
      for (const line of mission.brief) say(line);
      startMissionStep();
    }
    updateObjective();
  }

  reset();
  return {
    state, reset, step, makeSave, applySave, say, addLog,
    teleportPlayer, givePlayerCar, setWantedStars, startMission,
    spawnPoliceCar, spawnThugs, currentMission, updateObjective, startMissionStep,
  };
}
