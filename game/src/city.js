// The city of Port Meridian, generated once from a seed: a road grid, building blocks,
// parks, plazas, a harbour car park and the beach with the sea along the east edge.
// Nothing here moves; it is the static map every other module reads. District names and
// landmark names are original, invented for this game.
import { ROAD, WORLD } from './config.js';
import { intBetween, pick } from './random.js';

export const DISTRICTS = [
  { name: 'Old Quay', x: 0, y: 0, w: 1350, h: 1350 },
  { name: 'Marina Row', x: 1350, y: 0, w: 1890, h: 1350 },
  { name: 'Palm Court', x: 0, y: 1350, w: 1350, h: 1350 },
  { name: 'Sunset Mile', x: 1350, y: 1350, w: 1890, h: 1350 },
  { name: 'Harbour Heights', x: 0, y: 2700, w: 3240, h: 900 },
];

export const LANDMARKS = [
  { name: 'Quay Market', x: 675, y: 675 },
  { name: 'Meridian Pier', x: 3300, y: 1125 },
  { name: 'Palm Court Gardens', x: 675, y: 2025 },
  { name: 'Sunset Mile Diner', x: 2025, y: 1575 },
  { name: 'Harbour Heights Depot', x: 1125, y: 3150 },
  { name: 'Coral Bay Beach', x: 3330, y: 2475 },
];

const BUILDING_COLORS = ['#d98a5f', '#e8b04b', '#7fb3d5', '#c97b8a', '#a98fd0', '#e0785a'];
const ROOF_COLORS = ['#b96a45', '#c08a2e', '#5d8fb0', '#a85e6c', '#8a6fb0', '#b85a42'];

/** True when the point is on a road (including the intersection squares). */
export function onRoad(x, y) {
  const half = ROAD.width / 2;
  const rx = ((x % ROAD.spacing) + ROAD.spacing) % ROAD.spacing;
  const ry = ((y % ROAD.spacing) + ROAD.spacing) % ROAD.spacing;
  return rx < half || rx > ROAD.spacing - half || ry < half || ry > ROAD.spacing - half;
}

/** The nearest road centre-line point to (x, y): where a car belongs. */
export function nearestRoadPoint(x, y) {
  const half = ROAD.width / 2;
  const rx = ((x % ROAD.spacing) + ROAD.spacing) % ROAD.spacing;
  const ry = ((y % ROAD.spacing) + ROAD.spacing) % ROAD.spacing;
  const distX = Math.min(rx, ROAD.spacing - rx);
  const distY = Math.min(ry, ROAD.spacing - ry);
  if (distX <= distY) {
    const cx = rx < half ? x - rx : x + (ROAD.spacing - rx);
    return { x: cx, y, horizontal: false };
  }
  const cy = ry < half ? y - ry : y + (ROAD.spacing - ry);
  return { x, y: cy, horizontal: true };
}

/** The district name at a point, for the HUD location line. */
export function districtAt(x, y) {
  for (const district of DISTRICTS) {
    if (x >= district.x && x < district.x + district.w && y >= district.y && y < district.y + district.h) {
      return district.name;
    }
  }
  return 'Coral Bay';
}

/**
 * Generate the static city. Buildings never sit on roads; parks and plazas fill whole
 * blocks; the harbour car park holds the parked cars the player can steal.
 */
export function createCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const plazas = [];
  const parkingSpots = [];
  const blockSize = ROAD.spacing;
  const inset = ROAD.width / 2 + 14;

  for (let bx = 0; bx * blockSize < WORLD.beachX; bx += 1) {
    for (let by = 0; by * blockSize < WORLD.size; by += 1) {
      const x0 = bx * blockSize + inset;
      const y0 = by * blockSize + inset;
      const x1 = (bx + 1) * blockSize - inset;
      const y1 = (by + 1) * blockSize - inset;
      if (x1 <= x0 || y1 <= y0) continue;
      const roll = random();
      // The block by the harbour (south-west) is the car park.
      if (bx === 1 && by === 6) {
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 5; col += 1) {
            parkingSpots.push({ x: x0 + 40 + col * 62, y: y0 + 44 + row * 92 });
          }
        }
        plazas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      if (roll < 0.16) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const treeCount = 6 + intBetween(random, 0, 5);
        for (let i = 0; i < treeCount; i += 1) {
          trees.push({ x: x0 + 24 + random() * (x1 - x0 - 48), y: y0 + 24 + random() * (y1 - y0 - 48), r: 10 + random() * 8 });
        }
        continue;
      }
      if (roll < 0.24) {
        plazas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      // A building block: 1-3 buildings with a yard and a couple of trees.
      const count = 1 + intBetween(random, 0, 2);
      const colorIndex = intBetween(random, 0, BUILDING_COLORS.length - 1);
      for (let i = 0; i < count; i += 1) {
        const bw = 90 + random() * 130;
        const bh = 80 + random() * 120;
        const bx0 = x0 + random() * Math.max(1, x1 - x0 - bw);
        const by0 = y0 + random() * Math.max(1, y1 - y0 - bh);
        buildings.push({
          x: bx0, y: by0, w: bw, h: bh,
          color: BUILDING_COLORS[colorIndex],
          roof: ROOF_COLORS[colorIndex],
          floors: 1 + intBetween(random, 0, 3),
        });
      }
      if (random() < 0.5) {
        trees.push({ x: x0 + 20 + random() * (x1 - x0 - 40), y: y0 + 20 + random() * (y1 - y0 - 40), r: 11 + random() * 6 });
      }
    }
  }

  // Beach trees along the sand.
  for (let y = 120; y < WORLD.size; y += 260) {
    trees.push({ x: WORLD.beachX + 40 + random() * 60, y, r: 12 + random() * 6 });
  }

  return {
    buildings, trees, parks, plazas, parkingSpots,
    roads: roadLines(),
    pick,
  };
}

/** The road centre lines, for the minimap and for traffic spawning. */
function roadLines() {
  const lines = [];
  for (let k = 0; k * ROAD.spacing <= WORLD.size; k += 1) {
    lines.push({ x1: 0, y1: k * ROAD.spacing, x2: WORLD.size, y2: k * ROAD.spacing, horizontal: true });
    lines.push({ x1: k * ROAD.spacing, y1: 0, x2: k * ROAD.spacing, y2: WORLD.size, horizontal: false });
  }
  return lines;
}

/** True when the circle at (x, y, r) overlaps any building: walls block feet and wheels. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/** Push a circle out of any building it overlaps; returns true when it was pushed. */
export function slideOutOfBuildings(city, body, r) {
  let pushed = false;
  for (const b of city.buildings) {
    if (body.x + r > b.x && body.x - r < b.x + b.w && body.y + r > b.y && body.y - r < b.y + b.h) {
      const left = body.x + r - b.x;
      const right = b.x + b.w - (body.x - r);
      const top = body.y + r - b.y;
      const bottom = b.y + b.h - (body.y - r);
      const min = Math.min(left, right, top, bottom);
      if (min === left) body.x = b.x - r;
      else if (min === right) body.x = b.x + b.w + r;
      else if (min === top) body.y = b.y - r;
      else body.y = b.y + b.h + r;
      pushed = true;
    }
  }
  return pushed;
}
