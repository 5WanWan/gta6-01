// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over. Progress
// (cash, mission, position) saves to localStorage at every mission and when the player
// pauses, and loads back with C on the title screen.
//
// ?seed=N fixes the city and the traffic. ?shot=chase|drive|mission|street (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createWorld, EVENT_OVER, EVENT_PUNCH, EVENT_SHOT } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { missionAt, storySoFar } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const city = createCity(createRandom(seed));
const world = createWorld(createRandom(seed + 101), city);
const renderer = createRenderer(canvas, city);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.cash !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.makeSave()));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, null);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let save = readSave();
  let lastMissionsDone = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    const mission = missionAt(0);
    if (mission) {
      for (const line of mission.brief) world.say(line);
      world.startMissionStep();
    }
    world.updateObjective();
    lastMissionsDone = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.setMusic(true);
    announce('Playing Port Meridian. Mission 1: First Wheels.');
  }

  function continueGame() {
    if (!save) return;
    world.reset();
    world.applySave(save);
    lastMissionsDone = world.state.stats.missionsDone;
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.setMusic(true);
    announce(`Continuing. Mission ${world.state.missionIndex + 1}. Cash $${world.state.player.cash}.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    writeSave();
    save = readSave();
    if (world.state.gameOver === 'busted') audio.busted();
    announce(world.state.gameOver === 'busted' ? 'Busted. The police took you in.' : 'Wasted. Rook went down.');
  }

  function saveInfo() {
    return {
      hasSave: Boolean(save),
      story: storySoFar(save ? save.missionsDone || 0 : 0),
    };
  }

  function handleActions(actions) {
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startNewGame();
      return actions & ~ACTION_CONFIRM;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
      return actions & ~ACTION_PAUSE;
    }
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return actions & ~(ACTION_PAUSE | ACTION_CONFIRM);
    }
    return actions;
  }

  function step(actions) {
    if (screen !== SCREEN_PLAY) return;
    const pointer = input.mouse();
    // The renderer scales the 1280x720 view to the window; convert the mouse to view space.
    const rect = canvas.getBoundingClientRect();
    const viewPointer = {
      x: (pointer.x / Math.max(1, rect.width)) * 1280,
      y: (pointer.y / Math.max(1, rect.height)) * 720,
    };
    const events = world.step(STEP, input, viewPointer, audio, actions);
    if (events & EVENT_OVER) endGame();
    if (world.state.stats.missionsDone > lastMissionsDone) {
      lastMissionsDone = world.state.stats.missionsDone;
      audio.missionDone();
      writeSave();
      save = readSave();
    }
    if (events & EVENT_SHOT) audio.gunshot();
    if (events & EVENT_PUNCH) audio.punch();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    // C continues a save from the title screen; Space/click starts new.
    if (screen === SCREEN_TITLE && save) {
      let continued = false;
      // The C key is read here through a keydown listener registered below.
      if (window.__continueRequested) {
        window.__continueRequested = false;
        continueGame();
        continued = true;
      }
      void continued;
    }
    const remaining = handleActions(actions);
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(remaining);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, saveInfo());
  }

  // C continues a saved game from the title screen.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && save && !event.repeat) {
      window.__continueRequested = true;
    }
    if (event.code === 'KeyM' && screen === SCREEN_PLAY && !event.repeat) {
      const mission = missionAt(world.state.missionIndex);
      if (mission) {
        for (const line of mission.brief) world.say(line);
        world.startMissionStep();
      }
    }
  });

  // Leaving the tab pauses a running game and saves, rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    }
  });

  // First click or keypress unlocks the synthesised audio.
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  // The title screen shows the city behind the panel, parked where the story starts.
  world.reset();
  const mission = missionAt(0);
  if (mission) {
    for (const line of mission.brief) world.say(line);
    world.startMissionStep();
  }
  announce('Port Meridian. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
