// The story of Port Meridian: five missions from fixer Marla Quinn, each a chain of steps.
// A step is one job: go somewhere, get in a car, take down a number of thugs, or lose the
// police. Steps carry their own dialogue line, shown when the step starts. All names,
// places and people are original, invented for this game.
import { LANDMARKS } from './city.js';

const QUAY = LANDMARKS[0];
const PIER = LANDMARKS[1];
const GARDENS = LANDMARKS[2];
const DINER = LANDMARKS[3];
const DEPOT = LANDMARKS[4];
const BEACH = LANDMARKS[5];

export const MISSIONS = [
  {
    id: 1,
    title: 'First Wheels',
    giver: 'Marla Quinn',
    reward: 400,
    brief: [
      'Marla: "Rook, you are new in Port Meridian. First rule: wheels beat feet."',
      'Marla: "Meet me at Quay Market, then grab a car. Any car. It is Meridian."',
      'Marla: "Bring it to the Sunset Mile Diner. Easy money. Do not scratch it."',
    ],
    steps: [
      { kind: 'goto', label: 'Meet Marla at Quay Market', x: QUAY.x, y: QUAY.y, radius: 90, say: 'Marla: "There you are. Now find yourself a ride."' },
      { kind: 'enterCar', label: 'Steal a car (press E near one)', x: 0, y: 0, radius: 0, say: 'Marla: "Good. Now drive it to the diner, nice and easy."' },
      { kind: 'driveTo', label: 'Deliver the car to Sunset Mile Diner', x: DINER.x, y: DINER.y, radius: 110, say: 'Marla: "Clean. You drive like you mean it, Rook."' },
    ],
  },
  {
    id: 2,
    title: 'Harbor Run',
    giver: 'Marla Quinn',
    reward: 700,
    brief: [
      'Marla: "A parcel is waiting at the Harbour Heights Depot. No questions."',
      'Marla: "Take it to Meridian Pier. The buyer waits by the water."',
      'Marla: "Cops are thick near the pier today. Keep it smooth."',
    ],
    steps: [
      { kind: 'goto', label: 'Pick up the parcel at Harbour Heights Depot', x: DEPOT.x, y: DEPOT.y, radius: 90, say: 'Marla: "Parcel secured. Pier now — and keep your eyes open."' },
      { kind: 'driveTo', label: 'Deliver the parcel to Meridian Pier', x: PIER.x, y: PIER.y, radius: 110, say: 'Buyer: "Right on time. Marla picks good drivers."' },
    ],
  },
  {
    id: 3,
    title: 'The Collector',
    giver: 'Marla Quinn',
    reward: 900,
    brief: [
      'Marla: "A collector named Venn owes me. His thugs hold Palm Court Gardens."',
      'Marla: "Go in on foot. Fists or the pistol — your call, Rook."',
      'Marla: "When the gardens are quiet, lose the heat and come home."',
    ],
    steps: [
      { kind: 'goto', label: 'Reach Palm Court Gardens', x: GARDENS.x, y: GARDENS.y, radius: 120, say: 'Thug: "Venn owns this park, friend. Walk away." — Rook: "No."' },
      { kind: 'takedown', label: 'Take down Venn\u2019s thugs (0/3)', x: GARDENS.x, y: GARDENS.y, radius: 260, count: 3, say: 'Marla: "Three of them. Make it quick and make it loud."' },
      { kind: 'escape', label: 'Lose the police (wanted level to zero)', x: 0, y: 0, radius: 0, say: 'Marla: "Heat is on you now. Break line of sight and stay quiet."' },
    ],
  },
  {
    id: 4,
    title: 'Blue Light Special',
    giver: 'Marla Quinn',
    reward: 1200,
    brief: [
      'Marla: "Venn is hitting back. His crew is shaking down Sunset Mile."',
      'Marla: "Two of his enforcers at the diner. Send them a message."',
      'Marla: "Then get out of Sunset Mile before the whole precinct arrives."',
    ],
    steps: [
      { kind: 'goto', label: 'Reach the Sunset Mile Diner', x: DINER.x, y: DINER.y, radius: 120, say: 'Enforcer: "Venn sends his regards." — Rook: "Tell him I said hi."' },
      { kind: 'takedown', label: 'Take down the enforcers (0/2)', x: DINER.x, y: DINER.y, radius: 260, count: 2, say: 'Marla: "Two enforcers. The diner crowd is watching, Rook."' },
      { kind: 'escape', label: 'Lose the police (wanted level to zero)', x: 0, y: 0, radius: 0, say: 'Marla: "Sirens already. Vanish, Rook. Vanish."' },
    ],
  },
  {
    id: 5,
    title: 'Meridian Finale',
    giver: 'Marla Quinn',
    reward: 2000,
    brief: [
      'Marla: "It ends tonight, Rook. Venn himself is on Coral Bay Beach."',
      'Marla: "Four of his best guard him. Take them down, then take the ledger."',
      'Marla: "Bring the ledger to Quay Market. After this, Meridian is ours."',
    ],
    steps: [
      { kind: 'goto', label: 'Reach Coral Bay Beach', x: BEACH.x, y: BEACH.y, radius: 130, say: 'Venn: "You again. Boys — end this." — Rook: "Your boys first."' },
      { kind: 'takedown', label: 'Take down Venn\u2019s guards (0/4)', x: BEACH.x, y: BEACH.y, radius: 300, count: 4, say: 'Marla: "Four guards between you and the ledger. Go."' },
      { kind: 'goto', label: 'Take the ledger to Quay Market', x: QUAY.x, y: QUAY.y, radius: 100, say: 'Marla: "The ledger! Bring it home, Rook. Bring it home."' },
    ],
  },
];

/** The mission at index, or null when the story is finished. */
export function missionAt(index) {
  return index >= 0 && index < MISSIONS.length ? MISSIONS[index] : null;
}

/** A step's label with its live progress (takedowns show "1/3"). */
export function stepLabel(mission, stepIndex, takenDown) {
  const step = mission.steps[stepIndex];
  if (!step) return '';
  if (step.kind === 'takedown') {
    return step.label.replace(/\(\d+\/\d+\)/, `(${Math.min(takenDown, step.count)}/${step.count})`);
  }
  return step.label;
}

/** Short story-so-far text for the start screen, naming completed missions. */
export function storySoFar(completed) {
  if (completed <= 0) return 'New in town. Marla Quinn has work for a driver with nerve.';
  if (completed >= MISSIONS.length) return 'The ledger is home. Port Meridian is yours, Rook.';
  const last = MISSIONS[completed - 1];
  return `Done: ${last.title}. Next: ${MISSIONS[completed].title} — ${MISSIONS[completed].giver} is waiting.`;
}
