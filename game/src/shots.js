// Screenshot presets: ?shot=1-start|2-drive|3-chase|4-mission. Each one puts the
// world in a readable, representative state for the kit's 4 screenshots.
import { makeCar } from './vehicles.js';
import { addHeat, makePoliceCar, makeFootCop } from './police.js';
import { startMission, currentMissionDef } from './missions.js';

export function applyShot(world, name) {
  const player = world.player;
  const city = world.city;
  switch (name) {
    case '1-start': {
      // Rook on foot by the Loft, a parked car beside him, traffic passing.
      player.x = 320;
      player.y = 1400;
      world.camX = player.x;
      world.camY = player.y;
      return;
    }
    case '2-drive': {
      // Driving a sport car down an avenue with traffic around.
      const car = makeCar('sport', 704, 700, Math.PI / 2, world.rng, { driver: 'player' });
      car.speed = 320;
      world.cars.push(car);
      player.car = car;
      player.x = car.x;
      player.y = car.y;
      world.camX = car.x;
      world.camY = car.y;
      world.spawnTrafficNear(704, 700, 4);
      return;
    }
    case '3-chase': {
      // Three stars, two police cars closing in and a foot cop on the hunt.
      const car = makeCar('sport', 1088, 900, 0, world.rng, { driver: 'player' });
      car.speed = 380;
      world.cars.push(car);
      player.car = car;
      player.x = car.x;
      player.y = car.y;
      addHeat(world.wanted, 70);
      const pc1 = makePoliceCar(city, world.rng, 900, 900);
      pc1.car.angle = 0;
      pc1.car.speed = 420;
      const pc2 = makePoliceCar(city, world.rng, 1088, 1088);
      pc2.car.angle = -Math.PI / 2;
      pc2.car.speed = 420;
      world.policeCars.push(pc1, pc2);
      world.cars.push(pc1.car, pc2.car);
      world.footCops.push(makeFootCop(1180, 850));
      world.camX = car.x;
      world.camY = car.y;
      return;
    }
    case '4-mission': {
      // Mission 1 active: drive to the Lantern Bar to pick up the fare.
      const def = currentMissionDef(world.missions);
      if (def) startMission(world.missions, def, world);
      const car = makeCar('taxi', 320, 1100, -Math.PI / 2, world.rng, { driver: 'player' });
      car.speed = 200;
      world.cars.push(car);
      player.car = car;
      player.x = car.x;
      player.y = car.y;
      world.camX = car.x;
      world.camY = car.y;
      return;
    }
    default:
      return;
  }
}
