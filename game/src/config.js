// PORT MERIDIAN — tuning, palette and city constants.
// A sun-soaked original coastal city: road grid, beach on the east edge, parks and plazas.
// Every number the simulation and the renderer share lives here, so no rule below depends
// on the screen size. The playfield is a fixed 1280x720 logical view over a 3600x3600 world.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** World size in pixels; the beach and the sea sit along the east edge. */
export const WORLD = { size: 3600, beachX: 3240, seaX: 3420 };

/** Road grid: roads run every ROAD_SPACING pixels, each ROAD_WIDTH wide. */
export const ROAD = { spacing: 450, width: 96, lane: 24 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchDamage: 25,
  punchRange: 46,
  pistolDamage: 34,
  startAmmo: 24,
  maxAmmo: 120,
};

export const CAR = {
  length: 64,
  width: 30,
  maxSpeed: 620,
  policeMaxSpeed: 660,
  accel: 420,
  brake: 700,
  reverseMax: 180,
  turnRate: 2.6,
  // How close the driver must be to enter a car.
  enterRange: 70,
};

export const TRAFFIC = { count: 26, speedMin: 130, speedMax: 210 };
export const PEDS = { count: 42, speedMin: 34, speedMax: 66 };
export const POLICE = { maxCars: 6, maxFoot: 8, chaseRange: 1400, arrestRange: 34 };

/** Wanted heat: stars are heat thresholds; crime adds heat, hiding cools it. */
export const WANTED = {
  stealHeat: 22,
  shootHeat: 16,
  hitPedHeat: 14,
  killHeat: 30,
  decayPerSecond: 3.2,
  quietSeconds: 6,
  starThresholds: [0, 18, 38, 58, 78, 95],
};

export const CLOCK = { startHour: 9, minutesPerSecond: 0.35 };

export const PALETTE = {
  backdrop: '#0e1420',
  sky: '#ffd9a0',
  grass: '#7fae62',
  park: '#69a357',
  sand: '#e8cf9a',
  sea: '#2f8fb8',
  seaDeep: '#1f6f96',
  road: '#3a3f4a',
  roadEdge: '#2c303a',
  laneMark: '#e8d44f',
  sidewalk: '#b9b3a4',
  plaza: '#c9bfa9',
  building: '#d98a5f',
  buildingRoof: '#b96a45',
  building2: '#e8b04b',
  building3: '#7fb3d5',
  building4: '#c97b8a',
  window: '#2e4a66',
  tree: '#3f7d44',
  treeLight: '#57a05c',
  player: '#ffcf3f',
  playerCar: '#ffcf3f',
  police: '#2f6fd0',
  policeLight: '#ff3b30',
  thug: '#b03a3a',
  pedShirt: ['#e86a6a', '#6aa8e8', '#7fd08a', '#e8c96a', '#b07fd0', '#e89a5a'],
  text: '#fff7e6',
  muted: '#cbbf9f',
  hudPanel: 'rgba(12, 18, 30, 0.72)',
  hudAccent: '#ffcf3f',
  star: '#ffcf3f',
  starEmpty: '#5a5344',
  health: '#5fd06a',
  healthLow: '#ff5a4a',
  objective: '#ffe9a8',
  danger: '#ff5a4a',
  cash: '#7be382',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, mission progress, position) is kept between visits. */
export const SAVE_KEY = 'port-meridian.save.v1';
export const GAME_NAME = 'PORT MERIDIAN';
export const GAME_TAGLINE = 'Sun Coast Getaway — a Port Meridian story';
