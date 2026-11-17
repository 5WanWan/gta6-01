// The screenshot scenes behind ?shot=chase|drive|mission|street. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (road-following driver, on-foot shooter that closes on the nearest thug), so
// the frame is what a short game really looks like and the same seed always gives the
// same frame. After the drive, a few police cars, traffic cars and pedestrians are pulled
// close to the player so the frame is dense — the staging every screenshot needs.
import { CAR, STEP } from './config.js';
import { clamp, wrapAngle } from './random.js';
import { missionAt } from './missions.js';
import { SCREEN_PLAY } from './render.js';

const CHASE_SECONDS = 5;
const DRIVE_SECONDS = 5;
const MISSION_SECONDS = 9;
const STREET_SECONDS = 4;

/** A fake input device the autopilot drives the world with. */
function fakeInput(driveFn, moveFn, firingFn) {
  return {
    move: moveFn || (() => ({ x: 0, y: 0 })),
    drive: driveFn || (() => ({ throttle: 0, steer: 0 })),
    firing: firingFn || (() => false),
    takeActions: () => 0,
  };
}

/** The current mission step's target point, or a fallback point in the city. */
function missionTarget(world) {
  const state = world.state;
  const mission = missionAt(state.missionIndex);
  if (!mission) return { x: 2025, y: 1575 };
  const step = mission.steps[state.missionStep];
  if (!step || step.x === 0) return { x: 2025, y: 1575 };
  return { x: step.x, y: step.y };
}

/** Steer a car along the road grid toward a target: snap the heading to the nearest
 * 90-degree road direction that closes the distance fastest. */
function drivePilot(world, target) {
  const state = world.state;
  const car = state.player.car;
  if (!car) return { throttle: 0, steer: 0 };
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const direct = Math.atan2(dy, dx);
  const snap = Math.round(direct / (Math.PI / 2)) * (Math.PI / 2);
  const diff = wrapAngle(snap - car.angle);
  const steer = clamp(diff * 2.2, -1, 1);
  let throttle = 1;
  if (Math.abs(diff) > 1.4) throttle = 0.25;
  // Ease off when a traffic car is right ahead.
  for (const other of state.cars) {
    if (other === car || other.kind !== 'traffic') continue;
    const ahead = (other.x - car.x) * Math.cos(car.angle) + (other.y - car.y) * Math.sin(car.angle);
    const side = Math.abs((other.x - car.x) * Math.sin(car.angle) - (other.y - car.y) * Math.cos(car.angle));
    if (ahead > 0 && ahead < 90 && side < 40) throttle = 0;
  }
  return { throttle, steer };
}

/** Pull the nearest police cars in close behind the player, for a dense chase frame. */
function closePolice(world) {
  const state = world.state;
  const police = state.cars.filter((car) => car.kind === 'police');
  const spots = [
    { dx: -260, dy: 120, angle: 0 },
    { dx: 300, dy: -140, angle: Math.PI },
    { dx: -120, dy: -280, angle: Math.PI / 2 },
  ];
  police.forEach((car, i) => {
    const spot = spots[i % spots.length];
    car.x = clamp(state.player.x + spot.dx, 40, 3560);
    car.y = clamp(state.player.y + spot.dy, 40, 3560);
    car.angle = Math.atan2(state.player.y - car.y, state.player.x - car.x);
    car.speed = 420;
  });
  for (let i = police.length; i < 3; i += 1) world.spawnPoliceCar();
}

/** Pull traffic onto the player's road, ahead and behind, for a dense street frame. */
function closeTraffic(world, count) {
  const state = world.state;
  const traffic = state.cars.filter((car) => car.kind === 'traffic');
  const car = state.player.car;
  traffic.slice(0, count).forEach((other, i) => {
    const ahead = (i % 2 === 0 ? 1 : -1) * (180 + i * 90);
    if (car) {
      other.x = clamp(car.x + Math.cos(car.angle) * ahead, 40, 3560);
      other.y = clamp(car.y + Math.sin(car.angle) * ahead + (i % 3 - 1) * 46, 40, 3560);
      other.angle = car.angle + (i % 2 === 0 ? 0 : Math.PI);
    } else {
      other.x = clamp(state.player.x + ahead, 40, 3560);
      other.y = clamp(state.player.y + (i % 3 - 1) * 90, 40, 3560);
    }
  });
}

/** Pull pedestrians into a loose crowd around the player. */
function closePeds(world, count) {
  const state = world.state;
  state.peds.slice(0, count).forEach((ped, i) => {
    const angle = (i / count) * Math.PI * 2;
    const dist = 120 + (i % 4) * 70;
    ped.x = clamp(state.player.x + Math.cos(angle) * dist, 40, 3560);
    ped.y = clamp(state.player.y + Math.sin(angle) * dist, 40, 3560);
    ped.down = false;
  });
}

function runSteps(world, seconds, input, pointerFn) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const pointer = pointerFn ? pointerFn() : { x: 640, y: 360 };
    world.step(STEP, input, pointer, null);
    if (world.state.gameOver) break;
  }
}

/**
 * Set `world` to the named scene (chase, drive, mission or street; any other name is
 * street) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'chase') {
    world.startMission(2, 1);
    // Start on the road at the Palm Court intersection, heading east along it.
    world.teleportPlayer(450, 1800);
    world.givePlayerCar(450, 1800, 0);
    world.setWantedStars(3);
    world.spawnPoliceCar();
    world.spawnPoliceCar();
    const input = fakeInput(() => drivePilot(world, { x: 3150, y: 1800 }));
    runSteps(world, CHASE_SECONDS, input);
    closePolice(world);
    closeTraffic(world, 6);
    world.setWantedStars(3);
    world.say('Marla: "Three stars, Rook — and every cop in Meridian is coming."');
    world.addLog('RADIO: Pursuit in Palm Court — units converge on the yellow car.');
    world.addLog('RADIO: Air support is ten minutes out. Ground units, take him down.');
    return { screen: SCREEN_PLAY };
  }
  if (name === 'drive') {
    world.startMission(0, 2);
    // Start on the road at the Old Quay intersection, heading west along it.
    world.teleportPlayer(3150, 900);
    world.givePlayerCar(3150, 900, Math.PI);
    const input = fakeInput(() => drivePilot(world, { x: 450, y: 900 }));
    runSteps(world, DRIVE_SECONDS, input);
    closeTraffic(world, 7);
    closePeds(world, 6);
    world.say('Marla: "Nice and easy through Sunset Mile. The diner is waiting."');
    world.addLog('RADIO: Traffic is light on Sunset Mile this morning.');
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    world.startMission(2, 1);
    world.teleportPlayer(675, 2100);
    const pointerFn = () => {
      const thug = state.thugs[0];
      if (!thug) return { x: 640, y: 360 };
      return { x: thug.x - state.camera.x, y: thug.y - state.camera.y };
    };
    const moveFn = () => {
      const thug = state.thugs[0];
      if (!thug) return { x: 0, y: 0 };
      const dx = thug.x - state.player.x;
      const dy = thug.y - state.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 200) return { x: 0, y: 0 };
      return { x: dx / d, y: dy / d };
    };
    const input = fakeInput(null, moveFn, () => true);
    runSteps(world, MISSION_SECONDS, input, pointerFn);
    // Keep at least two thugs in frame even if the autopilot landed its shots.
    if (state.thugs.length < 2) world.spawnThugs(state.player.x + 220, state.player.y - 120, 2);
    closePeds(world, 5);
    world.say('Marla: "Three of them, Rook. Make it quick and make it loud."');
    world.addLog('RADIO: Shots reported in Palm Court Gardens.');
    return { screen: SCREEN_PLAY };
  }
  // street: on foot in Sunset Mile, mission target ahead, crowd around.
  world.startMission(0, 0);
  world.teleportPlayer(1800, 1800);
  const input = fakeInput(null, () => ({ x: 1, y: 0 }), () => false);
  runSteps(world, STREET_SECONDS, input);
  closePeds(world, 10);
  closeTraffic(world, 5);
  world.say('Marla: "Quay Market first, Rook. Then we talk about wheels."');
  world.addLog('RADIO: A sunny morning on Sunset Mile. Watch the crossings.');
  return { screen: SCREEN_PLAY };
}
