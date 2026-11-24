#!/usr/bin/env python3
"""data/ephem/ from JPL DE440 and DE441 (NAIF SPK kernels). Needs numpy, scipy. Run in tools/ephem with JPL_RAW=<folder for the kernels>:
  curl -O https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp  (120 MB, into JPL_RAW)
  python3 get441.py                 the parts of DE441 for 3010 BC - AD 3010, by ranged requests (about 500 MB)
  python3 build.py ../../data/ephem near-*.bin (DE440, 1550-2249) and far-*.bin (DE441) + index.json: 1.5 minutes; prints the worst error of every body in km
  python3 moonfit.py; python3 dumpmoon.py    the Moon's series for the far set -> moon-far.json (2 minutes)
Format (read by js/jpl.js): for each body of a set, in order: [11 doubles of a reference ellipse for Mercury, Venus, Earth-Moon barycentre, Mars], bit widths of the
quantised Chebyshev coefficients (3 a degree), then the coefficients, degree by degree, axis by axis, segment after segment, offset binary, padded to a byte."""
print(__doc__)
