// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player over a 3600x3600 city; the 1280x720 logical view is scaled to fit
// the window. Sun-soaked palette, warm daylight that shifts with the game clock, skid
// marks, particles, screen shake on damage, and the full HUD (cash, health, ammo, wanted
// stars, clock, speed, objective, radio log, dialogue) plus the live minimap.
import { CAR, FONT, PALETTE, PLAYER, ROAD, VIEW, WORLD } from './config.js';
import { clamp, distance } from './random.js';
import { districtAt } from './city.js';
import { missionAt } from './missions.js';
import { drawMinimap } from './minimap.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const SHAKE_DECAY = 26;

function roundedRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

export function createRenderer(canvas, city) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  let lastHealth = PLAYER.health;
  let shake = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, bold) {
    const key = size + (bold ? 'b' : '');
    if (!fonts.has(key)) fonts.set(key, `${bold ? 'bold ' : ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function clockText(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function dayTint(minutes) {
    const hour = minutes / 60;
    if (hour >= 17 && hour < 20) return 'rgba(255, 140, 60, 0.10)';
    if (hour >= 20 || hour < 6) return 'rgba(20, 40, 90, 0.22)';
    if (hour >= 6 && hour < 9) return 'rgba(255, 190, 110, 0.08)';
    return 'rgba(255, 220, 150, 0.03)';
  }

  function drawGround(state) {
    const cam = state.camera;
    const x0 = cam.x - 40;
    const y0 = cam.y - 40;
    const x1 = cam.x + VIEW.width + 40;
    const y1 = cam.y + VIEW.height + 40;
    // Grass base, sand strip, then the sea.
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    context.fillStyle = PALETTE.sand;
    context.fillRect(Math.max(x0, WORLD.beachX), y0, Math.min(x1, WORLD.seaX) - Math.max(x0, WORLD.beachX), y1 - y0);
    context.fillStyle = PALETTE.sea;
    context.fillRect(Math.max(x0, WORLD.seaX), y0, x1 - Math.max(x0, WORLD.seaX), y1 - y0);
    context.fillStyle = PALETTE.seaDeep;
    for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
      context.fillRect(Math.max(x0, WORLD.seaX) + 30, y, 60, 4);
    }
    // Parks and plazas.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    for (const plaza of city.plazas) {
      context.fillStyle = PALETTE.plaza;
      context.fillRect(plaza.x, plaza.y, plaza.w, plaza.h);
    }
    // Roads: pale sidewalk border, then asphalt, then dashed centre line.
    context.fillStyle = PALETTE.sidewalk;
    for (const road of city.roads) {
      if (road.horizontal) context.fillRect(road.x1, road.y1 - ROAD.width / 2 - 8, road.x2 - road.x1, ROAD.width + 16);
      else context.fillRect(road.x1 - ROAD.width / 2 - 8, road.y1, ROAD.width + 16, road.y2 - road.y1);
    }
    context.fillStyle = PALETTE.road;
    for (const road of city.roads) {
      if (road.horizontal) context.fillRect(road.x1, road.y1 - ROAD.width / 2, road.x2 - road.x1, ROAD.width);
      else context.fillRect(road.x1 - ROAD.width / 2, road.y1, ROAD.width, road.y2 - road.y1);
    }
    context.fillStyle = PALETTE.laneMark;
    for (const road of city.roads) {
      if (road.horizontal) {
        for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) {
          if (x > road.x1 && x < road.x2) context.fillRect(x, road.y1 - 2, 22, 4);
        }
      } else {
        for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) {
          if (y > road.y1 && y < road.y2) context.fillRect(road.x1 - 2, y, 4, 22);
        }
      }
    }
    // Trees.
    for (const tree of city.trees) {
      if (tree.x < x0 || tree.x > x1 || tree.y < y0 || tree.y > y1) continue;
      context.fillStyle = PALETTE.tree;
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.treeLight;
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.55, 0, Math.PI * 2);
      context.fill();
    }
    // Buildings: body, roof inset, window grid.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
      context.fillStyle = PALETTE.window;
      const cols = Math.max(1, Math.floor((b.w - 24) / 26));
      const rows = Math.max(1, Math.floor((b.h - 24) / 26));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          context.fillRect(b.x + 16 + cx * 26, b.y + 16 + cy * 26, 12, 10);
        }
      }
    }
  }

  function drawMissionMarker(state) {
    if (!state.missionActive) return;
    const mission = missionAt(state.missionIndex);
    if (!mission) return;
    const step = mission.steps[state.missionStep];
    if (!step || (step.kind !== 'goto' && step.kind !== 'driveTo' && step.kind !== 'takedown')) return;
    const pulse = 1 + Math.sin(state.elapsed * 4) * 0.15;
    const r = 46 * pulse;
    context.strokeStyle = '#ffcf3f';
    context.lineWidth = 4;
    context.beginPath();
    context.arc(step.x, step.y, r, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = 'rgba(255, 207, 63, 0.18)';
    context.beginPath();
    context.arc(step.x, step.y, r, 0, Math.PI * 2);
    context.fill();
    // A light beacon so the target reads from far away.
    context.fillStyle = 'rgba(255, 207, 63, 0.10)';
    context.fillRect(step.x - 6, step.y - 220, 12, 220);
    context.fillStyle = '#ffcf3f';
    context.beginPath();
    context.moveTo(step.x, step.y - 64);
    context.lineTo(step.x - 12, step.y - 88);
    context.lineTo(step.x + 12, step.y - 88);
    context.closePath();
    context.fill();
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      const bob = Math.sin(state.elapsed * 3 + pickup.x) * 3;
      const y = pickup.y + bob;
      if (pickup.kind === 'cash') {
        context.fillStyle = '#1f7a33';
        context.beginPath();
        context.arc(pickup.x, y, 13, 0, Math.PI * 2);
        context.fill();
        text('$', pickup.x, y + 5, 16, '#7be382', 'center', true);
      } else if (pickup.kind === 'health') {
        context.fillStyle = '#e8e8e8';
        context.fillRect(pickup.x - 12, y - 12, 24, 24);
        context.fillStyle = '#d23b2e';
        context.fillRect(pickup.x - 3, y - 9, 6, 18);
        context.fillRect(pickup.x - 9, y - 3, 18, 6);
      } else {
        context.fillStyle = '#ffcf3f';
        context.fillRect(pickup.x - 11, y - 8, 22, 16);
        context.fillStyle = '#111111';
        context.fillRect(pickup.x - 7, y - 4, 4, 8);
        context.fillRect(pickup.x, y - 4, 4, 8);
        context.fillRect(pickup.x + 7, y - 4, 4, 8);
      }
    }
  }

  function drawCar(car, state) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const halfL = CAR.length / 2;
    const halfW = CAR.width / 2;
    // Shadow.
    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
    roundedRect(context, -halfL + 3, -halfW + 4, CAR.length, CAR.width, 8);
    context.fill();
    // Body.
    context.fillStyle = car.color;
    roundedRect(context, -halfL, -halfW, CAR.length, CAR.width, 8);
    context.fill();
    // Roof and windshield.
    context.fillStyle = 'rgba(0, 0, 0, 0.28)';
    roundedRect(context, -halfL + 14, -halfW + 5, 26, CAR.width - 10, 5);
    context.fill();
    context.fillStyle = '#bfe3ef';
    context.fillRect(halfL - 16, -halfW + 5, 8, CAR.width - 10);
    context.fillRect(-halfL + 8, -halfW + 5, 6, CAR.width - 10);
    // Headlights and tail lights.
    context.fillStyle = '#fff6c9';
    context.fillRect(halfL - 2, -halfW + 3, 3, 6);
    context.fillRect(halfL - 2, halfW - 9, 3, 6);
    context.fillStyle = car.brakeLight ? '#ff2e2e' : '#8a2a2a';
    context.fillRect(-halfL - 1, -halfW + 3, 3, 6);
    context.fillRect(-halfL - 1, halfW - 9, 3, 6);
    if (car.kind === 'police') {
      // White doors and a flashing light bar.
      context.fillStyle = '#f2f2f2';
      context.fillRect(-6, -halfW + 2, 16, CAR.width - 4);
      const flashRed = Math.floor(state.elapsed * 5) % 2 === 0;
      context.fillStyle = flashRed ? '#ff3b30' : '#2f6fd0';
      context.fillRect(-4, -halfW - 2, 8, 7);
      context.fillStyle = flashRed ? '#2f6fd0' : '#ff3b30';
      context.fillRect(-4, halfW - 5, 8, 7);
      text('PD', 0, 5, 11, '#1c2a44', 'center', true);
    }
    if (car === state.player.car) {
      context.strokeStyle = '#ffcf3f';
      context.lineWidth = 3;
      roundedRect(context, -halfL - 6, -halfW - 6, CAR.length + 12, CAR.width + 12, 10);
      context.stroke();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, shirt, down, gun) {
    context.save();
    context.translate(x, y);
    if (down) {
      context.rotate(angle + Math.PI / 2);
      context.fillStyle = '#6a6a6a';
      roundedRect(context, -14, -6, 28, 12, 6);
      context.fill();
      context.restore();
      return;
    }
    context.rotate(angle);
    context.fillStyle = shirt;
    roundedRect(context, -8, -9, 16, 18, 6);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(9, 0, 7, 0, Math.PI * 2);
    context.fill();
    if (gun) {
      context.strokeStyle = '#222222';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(12, 4);
      context.lineTo(24, 4);
      context.stroke();
    }
    context.restore();
  }

  function drawWorld(state) {
    drawGround(state);
    // Skid marks.
    for (const skid of state.skids) {
      context.strokeStyle = `rgba(20, 20, 24, ${clamp(skid.life, 0, 0.7)})`;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(skid.x1, skid.y1);
      context.lineTo(skid.x2, skid.y2);
      context.stroke();
    }
    drawMissionMarker(state);
    drawPickups(state);
    for (const car of state.cars) drawCar(car, state);
    for (const ped of state.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.down, false);
    }
    for (const cop of state.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#2c4a7a', false, false);
      context.fillStyle = '#1c2a44';
      context.beginPath();
      context.arc(cop.x + Math.cos(cop.angle) * 9, cop.y + Math.sin(cop.angle) * 9, 5, 0, Math.PI * 2);
      context.fill();
    }
    for (const thug of state.thugs) {
      drawPerson(thug.x, thug.y, thug.angle, '#b03a3a', false, true);
      // Health bar over a thug.
      context.fillStyle = 'rgba(0,0,0,0.5)';
      context.fillRect(thug.x - 16, thug.y - 26, 32, 5);
      context.fillStyle = '#ff5a4a';
      context.fillRect(thug.x - 16, thug.y - 26, 32 * clamp(thug.health / 60, 0, 1), 5);
    }
    // The player, on foot: bright yellow with a facing tick and the pistol line.
    const player = state.player;
    if (!player.car) {
      drawPerson(player.x, player.y, player.angle, PALETTE.player, false, player.ammo > 0);
      context.strokeStyle = '#ffcf3f';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, 19, 0, Math.PI * 2);
      context.stroke();
    }
    // Bullets: short bright streaks.
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 3;
    for (const bullet of state.bullets) {
      context.beginPath();
      context.moveTo(bullet.x - Math.cos(bullet.angle) * 12, bullet.y - Math.sin(bullet.angle) * 12);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
    }
    // Particles.
    for (const p of state.particles) {
      context.fillStyle = p.color;
      context.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // Warm daylight over everything.
    context.fillStyle = dayTint(state.clockMinutes);
    context.fillRect(state.camera.x - 40, state.camera.y - 40, VIEW.width + 80, VIEW.height + 80);
  }

  function drawStars(state) {
    const stars = state.wanted.stars;
    const cx = VIEW.width / 2;
    const y = 34;
    for (let i = 0; i < 5; i += 1) {
      const x = cx + (i - 2) * 34;
      text('★', x, y, 30, i < stars ? PALETTE.star : PALETTE.starEmpty, 'center', true);
    }
    if (stars > 0) text('WANTED', cx, 62, 14, PALETTE.danger, 'center', true);
  }

  function drawHud(state) {
    const player = state.player;
    // Top-left panel: cash, health, ammo, district, clock.
    context.fillStyle = PALETTE.hudPanel;
    roundedRect(context, 14, 12, 250, 108, 10);
    context.fill();
    text(`$${player.cash}`, 28, 44, 26, PALETTE.cash, 'left', true);
    text(`AMMO ${player.ammo}`, 196, 44, 16, PALETTE.text, 'left', true);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(28, 56, 222, 12);
    context.fillStyle = player.health < 30 ? PALETTE.healthLow : PALETTE.health;
    context.fillRect(28, 56, 222 * clamp(player.health / PLAYER.health, 0, 1), 12);
    text(`HP ${Math.ceil(player.health)}`, 28, 88, 14, PALETTE.text, 'left', true);
    text(clockText(state.clockMinutes), 196, 88, 14, PALETTE.text, 'left', true);
    text(`${state.district}  •  M${Math.min(state.missionIndex + 1, 5)}/5`, 28, 110, 14, PALETTE.muted, 'left');
    drawStars(state);
    // Dialogue line, centre-top under the stars.
    if (state.dialogue) {
      const lines = wrapDialogue(state.dialogue, 92);
      const height = 16 + lines.length * 22;
      context.fillStyle = PALETTE.hudPanel;
      roundedRect(context, VIEW.width / 2 - 330, 74, 660, height, 10);
      context.fill();
      lines.forEach((line, i) => text(line, VIEW.width / 2, 74 + 26 + i * 22, 17, PALETTE.objective, 'center'));
    }
    // Objective banner, bottom-centre.
    context.fillStyle = PALETTE.hudPanel;
    const objWidth = 640;
    roundedRect(context, VIEW.width / 2 - objWidth / 2, VIEW.height - 52, objWidth, 38, 10);
    context.fill();
    text(`◆ ${state.objective}`, VIEW.width / 2, VIEW.height - 26, 17, PALETTE.objective, 'center', true);
    // Radio log, bottom-left.
    state.log.forEach((line, i) => {
      context.globalAlpha = 1 - i * 0.14;
      text(line, 16, VIEW.height - 66 - i * 20, 14, PALETTE.muted, 'left');
    });
    context.globalAlpha = 1;
    // Speed, bottom-right.
    if (player.car) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.24);
      text(`${kmh}`, VIEW.width - 24, VIEW.height - 84, 44, PALETTE.text, 'right', true);
      text('KM/H', VIEW.width - 24, VIEW.height - 62, 13, PALETTE.muted, 'right');
    } else {
      text('WASD move  •  E enter car  •  F punch  •  Click shoot', VIEW.width - 24, VIEW.height - 66, 13, PALETTE.muted, 'right');
    }
    // Off-screen mission arrow: points at the target from the view edge.
    const mission = missionAt(state.missionIndex);
    if (state.missionActive && mission) {
      const step = mission.steps[state.missionStep];
      if (step && (step.kind === 'goto' || step.kind === 'driveTo' || step.kind === 'takedown')) {
        const tx = step.x - state.camera.x;
        const ty = step.y - state.camera.y;
        if (tx < 0 || tx > VIEW.width || ty < 0 || ty > VIEW.height) {
          const angle = Math.atan2(ty - VIEW.height / 2, tx - VIEW.width / 2);
          const ax = VIEW.width / 2 + Math.cos(angle) * 300;
          const ay = VIEW.height / 2 + Math.sin(angle) * 210;
          const dist = Math.round(distance(player.x, player.y, step.x, step.y));
          context.save();
          context.translate(ax, ay);
          context.rotate(angle);
          context.fillStyle = '#ffcf3f';
          context.beginPath();
          context.moveTo(18, 0);
          context.lineTo(-10, -12);
          context.lineTo(-10, 12);
          context.closePath();
          context.fill();
          context.restore();
          text(`${dist}m`, ax, ay + 30, 14, '#ffcf3f', 'center', true);
        }
      }
    }
    // Busted warning when a foot cop is closing in.
    const closingCop = state.cops.some((cop) => cop.arrestTimer > 0.25);
    if (closingCop) {
      const blink = Math.floor(state.elapsed * 6) % 2 === 0;
      if (blink) text('BUSTED INCOMING — RUN!', VIEW.width / 2, 120, 24, PALETTE.danger, 'center', true);
    }
    // Low-health vignette.
    if (player.health < 30 && !state.gameOver) {
      const pulse = 0.18 + Math.sin(state.elapsed * 5) * 0.08;
      context.strokeStyle = `rgba(255, 60, 40, ${pulse})`;
      context.lineWidth = 14;
      context.strokeRect(0, 0, VIEW.width, VIEW.height);
    }
    drawMinimap(context, state, city);
  }

  function wrapDialogue(line, maxChars) {
    if (line.length <= maxChars) return [line];
    const words = line.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxChars && current) {
        lines.push(current);
        current = word;
      } else current = (current + ' ' + word).trim();
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawPanel(title, lines, prompt) {
    const width = 680;
    const height = 150 + lines.length * 30;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(10, 14, 24, 0.88)';
    roundedRect(context, x, y, width, height, 14);
    context.fill();
    context.strokeStyle = '#ffcf3f';
    context.lineWidth = 2;
    roundedRect(context, x, y, width, height, 14);
    context.stroke();
    text(title, VIEW.width / 2, y + 62, 46, PALETTE.text, 'center', true);
    lines.forEach((line, i) => text(line, VIEW.width / 2, y + 108 + i * 30, 19, PALETTE.muted, 'center'));
    text(prompt, VIEW.width / 2, y + height - 26, 20, PALETTE.hudAccent, 'center', true);
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel. */
  function draw(state, screen, saveInfo) {
    if (state.player.health < lastHealth) shake = 9;
    lastHealth = state.player.health;
    shake = Math.max(0, shake - SHAKE_DECAY * (1 / 60));
    const shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.translate(-state.camera.x + shakeX, -state.camera.y + shakeY);
    drawWorld(state);
    context.restore();

    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(8, 12, 22, 0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const story = saveInfo && saveInfo.story ? saveInfo.story : 'New in town. Marla Quinn has work for a driver with nerve.';
      drawPanel('PORT MERIDIAN', [
        'Sun Coast Getaway — an open-world story in the spirit of the coast.',
        story,
        'WASD move  •  E steal / enter car  •  Click shoot  •  F punch  •  P pause',
        'Five missions. Steal cars, lose the police, take down Venn’s crew.',
      ], saveInfo && saveInfo.hasSave ? 'SPACE start new  •  C continue your save' : 'Press SPACE or click to start');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8, 12, 22, 0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('Paused', [
        'The city waits for you.',
        'WASD move  •  E enter car  •  Click shoot  •  F punch',
        'Your progress saves automatically at every mission.',
      ], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      context.fillStyle = 'rgba(8, 12, 22, 0.6)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const busted = state.gameOver === 'busted';
      drawPanel(busted ? 'BUSTED' : 'WASTED', [
        busted ? 'The Port Meridian PD took you in.' : 'Rook went down in the streets of Meridian.',
        `Cash $${state.player.cash}  •  Missions done ${state.stats.missionsDone}/5  •  Cars stolen ${state.stats.carsStolen}`,
        'Your save keeps your cash and mission progress.',
      ], 'Press SPACE to try again');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
