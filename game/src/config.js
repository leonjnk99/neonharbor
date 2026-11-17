// NEONHARBOR — tuning, city layout, vehicles, missions. One place for every number
// the rest of the game reads, so balancing is an edit here, not a hunt.
export const STEP = 1 / 60;
export const TILE = 64;
export const WORLD_W = 2560;
export const WORLD_H = 1792;
export const ROAD_HALF = 48;
export const WATER_X = 2432;

// Road centrelines. Avenues run north-south, streets east-west.
export const AVENUES = [320, 704, 1088, 1472, 1856, 2240];
export const STREETS = [256, 576, 896, 1216, 1536];

// Player on foot.
export const PLAYER = {
  walkSpeed: 215,
  radius: 14,
  maxHealth: 100,
  punchDamage: 22,
  punchRange: 48,
  punchInterval: 0.45,
};

// Cars. maxSpeed px/s, accel px/s^2, grip 0..1 (how much steering bites), size half-extents.
export const CAR_TYPES = {
  sedan: { name: 'Sedan', maxSpeed: 390, accel: 300, grip: 0.9, w: 46, l: 84, colors: ['#c94f4f', '#4f7ec9', '#c9a44f', '#7a7f8c'] },
  sport: { name: 'Sunray', maxSpeed: 530, accel: 380, grip: 1.0, w: 44, l: 86, colors: ['#f2c230', '#e85d3d'] },
  taxi: { name: 'Taxi', maxSpeed: 410, accel: 320, grip: 0.92, w: 46, l: 84, colors: ['#f2c230'] },
  van: { name: 'Van', maxSpeed: 330, accel: 250, grip: 0.8, w: 52, l: 96, colors: ['#8c8f96', '#5d7a5d'] },
  truck: { name: 'Hauler', maxSpeed: 300, accel: 220, grip: 0.75, w: 56, l: 110, colors: ['#6b5d8c', '#8c6b4f'] },
  police: { name: 'Cruiser', maxSpeed: 490, accel: 360, grip: 0.98, w: 46, l: 86, colors: ['#20242e'] },
};
export const CAR = {
  brake: 540,
  reverseMax: 170,
  turnRate: 2.5,
  handbrakeTurn: 1.7,
  enterRange: 100,
  damagePerHit: 14,
  maxHealth: 100,
};

// Wanted: heat 0..125, stars = ceil(heat / 25) capped at 5.
export const WANTED = {
  maxHeat: 125,
  perStar: 25,
  decayPerSec: 2.2,
  crime: { steal: 30, pedHit: 40, shoot: 25, copKill: 45, copHit: 20, trafficBump: 8, mission: 15 },
  maxFootCops: 4,
  maxPoliceCars: 3,
};

// Combat.
export const COMBAT = {
  pistolDamage: 34,
  pistolInterval: 0.22,
  pistolAmmoStart: 24,
  pistolAmmoPrice: 40,
  pistolAmmoCount: 12,
  bulletSpeed: 950,
  bulletRange: 720,
  guardHealth: 100,
  guardDamage: 8,
  guardInterval: 0.95,
  guardRange: 520,
};

// Economy.
export const ECONOMY = {
  startCash: 120,
  repairPrice: 80,
  healPrice: 60,
  taxiBase: 60,
  taxiPerPx: 0.045,
  deliveryPay: 50,
};

// Mission list: story order. Steps are data; missions.js runs them.
export const MISSIONS = [
  {
    id: 'fare', name: 'First Fare', giver: 'Mara', reward: 150,
    brief: 'Mara needs a driver. Pick up the fare at the Lantern Bar and drop them at the Marina — quick, and don\'t scratch the paint.',
    steps: [
      { type: 'goto', label: 'Pick up the fare at the Lantern Bar', zone: 'bar' },
      { type: 'pickup', label: 'Fare aboard — drive to the Marina', zone: 'marina', time: 75 },
    ],
  },
  {
    id: 'wheels', name: 'Hot Wheels', giver: 'Deke', reward: 300,
    brief: 'Deke wants a yellow Sunray, parked in the north lot. Take it — any way you like — and bring it to the Chop Shop.',
    steps: [
      { type: 'steal', label: 'Steal the yellow Sunray from the north lot', car: 'sunray' },
      { type: 'deliverCar', label: 'Deliver the Sunray to the Chop Shop', zone: 'chop' },
    ],
  },
  {
    id: 'tail', name: 'The Tail', giver: 'Mara', reward: 400,
    brief: 'A courier in a grey sedan is carrying something Mara wants to know about. Follow it to its hideout. Close enough to see, far enough to stay invisible.',
    steps: [
      { type: 'follow', label: 'Follow the grey sedan — stay 120 to 380 px back', car: 'target', duration: 45 },
    ],
  },
  {
    id: 'getaway', name: 'Getaway', giver: 'Deke', reward: 350,
    brief: 'The harbor patrol is all over you. Lose the heat — get to zero stars — then slip home to the Loft.',
    steps: [
      { type: 'loseWanted', label: 'Lose the cops — get to zero stars', startWanted: 75 },
      { type: 'goto', label: 'Slip home to Rook\'s Loft', zone: 'loft' },
    ],
  },
  {
    id: 'drop', name: 'The Drop', giver: 'Iris', reward: 450,
    brief: 'A parcel for the Marina, sixty seconds, and the patrol already knows your plates. Drive like the harbor is on fire.',
    steps: [
      { type: 'pickup', label: 'Grab the parcel at the Taxi Depot', zone: 'depot', startWanted: 50 },
      { type: 'deliver', label: 'Deliver the parcel to the Marina', zone: 'marina', time: 60 },
    ],
  },
  {
    id: 'heist', name: 'Harbor Heist', giver: 'Mara', reward: 1200,
    brief: 'The Harbor Bank vault, six seconds at the door, then out. Guards inside, patrol outside. Bring the cash home and the harbor is yours.',
    steps: [
      { type: 'goto', label: 'Get inside the Harbor Bank', zone: 'bank' },
      { type: 'hold', label: 'Hold at the vault — crack it open', zone: 'vault', hold: 6 },
      { type: 'escape', label: 'Escape! Lose the heat, then reach the Loft', zone: 'loft' },
    ],
  },
];

// Dusk palette for the sun-soaked coastal city.
export const COLORS = {
  ground: '#c9a06a',
  groundAlt: '#b98f5c',
  park: '#7fae62',
  sand: '#e0c184',
  water: '#2e6f8e',
  waterDeep: '#245a75',
  road: '#3a3f4a',
  roadEdge: '#565c6b',
  sidewalk: '#b9b3a4',
  laneDash: '#e8d44f',
  building: ['#d97b5f', '#e8a35c', '#7fb3c9', '#c97b9a', '#8fae7f', '#b3a06e', '#9a86c9', '#6e8fb3'],
  roof: ['#a85a44', '#b57e3f', '#5d8aa0', '#a35d78', '#6e8a5d', '#8c7d52', '#7a68a3', '#54708c'],
  palm: '#4f8f4f',
  palmTrunk: '#8a6a4a',
};
