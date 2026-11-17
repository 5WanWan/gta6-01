// The live minimap: the whole city shrunk into the HUD corner — roads, beach and sea,
// parks, the player's arrow, police, traffic, mission target and thugs, all in the same
// colours as the world itself. It reads the world state and draws only; it owns no rules.
import { WORLD } from './config.js';
import { LANDMARKS } from './city.js';
import { missionAt } from './missions.js';

export const MINIMAP = { x: 1052, y: 16, size: 212 };

/** Draw the minimap at its fixed HUD corner, in logical view coordinates. */
export function drawMinimap(context, state, city) {
  const { x: mx, y: my, size } = MINIMAP;
  const scale = size / WORLD.size;
  const toMapX = (wx) => mx + wx * scale;
  const toMapY = (wy) => my + wy * scale;

  context.save();
  context.fillStyle = 'rgba(12, 18, 30, 0.78)';
  context.fillRect(mx - 6, my - 6, size + 12, size + 12);
  context.strokeStyle = '#ffcf3f';
  context.lineWidth = 2;
  context.strokeRect(mx - 6, my - 6, size + 12, size + 12);
  context.beginPath();
  context.rect(mx, my, size, size);
  context.clip();

  // Ground, sea and beach.
  context.fillStyle = '#5d7a4a';
  context.fillRect(mx, my, size, size);
  context.fillStyle = '#2f8fb8';
  context.fillRect(toMapX(WORLD.seaX), my, size - (WORLD.seaX * scale), size);
  context.fillStyle = '#e8cf9a';
  context.fillRect(toMapX(WORLD.beachX), my, (WORLD.seaX - WORLD.beachX) * scale, size);

  // Parks and plazas.
  context.fillStyle = '#69a357';
  for (const park of city.parks) {
    context.fillRect(toMapX(park.x), toMapY(park.y), park.w * scale, park.h * scale);
  }
  // Roads.
  context.strokeStyle = '#3a3f4a';
  context.lineWidth = Math.max(2, 96 * scale);
  for (const road of city.roads) {
    context.beginPath();
    context.moveTo(toMapX(road.x1), toMapY(road.y1));
    context.lineTo(toMapX(road.x2), toMapY(road.y2));
    context.stroke();
  }
  // Landmark dots.
  context.fillStyle = '#ffe9a8';
  for (const mark of LANDMARKS) {
    context.beginPath();
    context.arc(toMapX(mark.x), toMapY(mark.y), 2.5, 0, Math.PI * 2);
    context.fill();
  }
  // Traffic as pale dots, thugs as red dots.
  context.fillStyle = 'rgba(255, 255, 255, 0.75)';
  for (const car of state.cars) {
    if (car.kind !== 'traffic') continue;
    context.fillRect(toMapX(car.x) - 1.5, toMapY(car.y) - 1.5, 3, 3);
  }
  context.fillStyle = '#ff5a4a';
  for (const thug of state.thugs) {
    context.beginPath();
    context.arc(toMapX(thug.x), toMapY(thug.y), 3, 0, Math.PI * 2);
    context.fill();
  }
  // Mission target: a pulsing yellow diamond.
  const current = currentMissionTarget(state);
  if (current) {
    const pulse = 4 + Math.sin(state.elapsed * 5) * 1.5;
    context.fillStyle = '#ffcf3f';
    context.beginPath();
    context.moveTo(toMapX(current.x), toMapY(current.y) - pulse);
    context.lineTo(toMapX(current.x) + pulse, toMapY(current.y));
    context.lineTo(toMapX(current.x), toMapY(current.y) + pulse);
    context.lineTo(toMapX(current.x) - pulse, toMapY(current.y));
    context.closePath();
    context.fill();
  }
  // Police as flashing blue-red dots.
  const flashBlue = Math.floor(state.elapsed * 4) % 2 === 0;
  context.fillStyle = flashBlue ? '#4a90e8' : '#ff3b30';
  for (const car of state.cars) {
    if (car.kind !== 'police') continue;
    context.beginPath();
    context.arc(toMapX(car.x), toMapY(car.y), 3.5, 0, Math.PI * 2);
    context.fill();
  }
  for (const cop of state.cops) {
    context.beginPath();
    context.arc(toMapX(cop.x), toMapY(cop.y), 2.5, 0, Math.PI * 2);
    context.fill();
  }
  // The player: a white arrow that points where they face.
  const px = toMapX(state.player.x);
  const py = toMapY(state.player.y);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#111111';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(px + Math.cos(state.player.angle) * 8, py + Math.sin(state.player.angle) * 8);
  context.lineTo(px + Math.cos(state.player.angle + 2.5) * 6, py + Math.sin(state.player.angle + 2.5) * 6);
  context.lineTo(px + Math.cos(state.player.angle - 2.5) * 6, py + Math.sin(state.player.angle - 2.5) * 6);
  context.closePath();
  context.fill();
  context.stroke();
  // Viewport rectangle: what the main camera sees.
  context.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  context.lineWidth = 1;
  context.strokeRect(toMapX(state.camera.x), toMapY(state.camera.y), 1280 * scale, 720 * scale);

  context.restore();
  context.font = 'bold 13px system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';
  context.fillStyle = '#fff7e6';
  context.fillText('PORT MERIDIAN', mx - 4, my + size + 10);
}

/** The current mission target point, if the active step has one on the map. */
function currentMissionTarget(state) {
  if (!state.missionActive) return null;
  const mission = missionAt(state.missionIndex);
  if (!mission) return null;
  const step = mission.steps[state.missionStep];
  if (!step || (step.kind !== 'goto' && step.kind !== 'driveTo' && step.kind !== 'takedown')) return null;
  return { x: step.x, y: step.y };
}
