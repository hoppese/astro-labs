// air.js: the air over the place the observer stands. The Earth's is the one sky.js was tuned on; standing on Mars or Titan
// (state.surface, js/skyframe.js) the same model runs with that world's colours and haze. A visual model, like the Earth's:
//   Mars   butterscotch by day (fine red dust, optical depth about 0.5), a blue glow round the setting Sun (the dust scatters
//          blue forward: Spirit, Curiosity and Perseverance photographed it), long twilight, a black night sky.
//   Titan  orange-brown haze of optical depth about 5 in visible light: by day a dim orange sky, at night only the brightest
//          stars and planets get through, Saturn among them. The Sun is a faint disc in the glow.
// k: magnitudes of extinction per air mass, beyond the zenith's (the zenith's own is in `nelm`).

import { state } from './state.js';

const EARTH = {
  id: 'Earth', k: 0.2, kImg: 0.25, lightPollution: true, moon: true,
  zN: null, hN: null,                                  // night: from the light-pollution slider (sky.js)
  zD: [38, 96, 190], hD: [158, 196, 236], zT: [14, 28, 68], hT: [46, 62, 104],
  dusk: [215, 105, 18], aureole: [150, 140, 110], haze: [176, 196, 206], tint: [0.07, 0.13, 0.24],
};
const AIRS = {
  Mars: {
    id: 'Mars', k: 0.5, kImg: 0.5, nelm: 7.4, lightPollution: false, moon: false,
    zN: [3, 3, 5], hN: [6, 5, 6],
    zD: [150, 104, 70], hD: [206, 160, 116], zT: [30, 26, 34], hT: [58, 50, 54],
    dusk: [40, 90, 200], aureole: [70, 120, 190], haze: [196, 150, 112], tint: [0.30, 0.20, 0.12],
    note: 'butterscotch by day, blue round the setting Sun',
  },
  Titan: {
    id: 'Titan', k: 5, kImg: 5, nelm: 2.8, lightPollution: false, moon: false,
    zN: [3, 2, 1], hN: [6, 4, 2],
    zD: [118, 74, 30], hD: [166, 112, 52], zT: [26, 16, 6], hT: [48, 30, 12],
    dusk: [120, 66, 16], aureole: [150, 100, 40], haze: [150, 100, 48], tint: [0.9, 1.6, 2.8],
    note: 'an orange haze that only the brightest stars get through',
  },
};
/** Bodies with air drawn when standing on them. */
export const HAS_AIR = new Set(Object.keys(AIRS));
/** The air in force now (the Earth's when not standing on Mars or Titan). */
export function air() {
  return (state.vantage && state.surface && AIRS[state.vantage]) || EARTH;
}
