# astro-labs

Interactive simulations for an introductory (non-majors) astronomy course, built
as a companion to [`Intro-physics-sims`](https://github.com/hoppese/Intro-physics-sims)
and in the same house style. (This repo grew out of an earlier set of H–R
diagram and binary-star apps; those have been reworked into the shared style and
folded in.)

Each sim is **one self-contained HTML file** (`<sim-name>/index.html`): fonts and
KaTeX load from a CDN, everything else is inline, and the page works dropped into
Moodle with an `<iframe>`. Layout follows the physics sims — an **Info** panel
(what this shows / how to use / relevant relationships / learn more), a **Worked
example**, and an inputs → results split.

Open `index.html` for the catalog, or serve the folder statically:

```
python3 -m http.server 8000
```

## The simulations (all drafts)

### Earth, Moon & sky
| Sim | What it shows |
|---|---|
| `moon-phases/` | Sun–Moon–Earth geometry sets the phase; space view + Earth view with a terminator-ellipse drawing; illuminated fraction, rise/set. |
| `seasons/` | Axial tilt vs distance; heliocentric top view with the axis fixed in space; noon Sun altitude, day length, sunbeam-spreading panel. |
| `eclipses/` | Solar/lunar toggle, edge-on shadow geometry with the 5° tilt; Total / Annular / Partial / Penumbral verdict from real angular sizes. |
| `celestial-sphere/` | Azimuthal sky map, celestial pole at altitude = latitude, a star's diurnal circle (solid above / dashed below), circumpolar test. |
| `retrograde-motion/` | Real orbits + the Earth→planet→stars sight line, and the apparent sky track that reverses each time Earth laps the outer planet. |

### Orbits & gravity
| Sim | What it shows |
|---|---|
| `keplers-laws/` | Ellipse with the Sun at a focus, Kepler's equation each frame, equal-area wedges, speed-over-orbit strip, P² vs a³. |
| `tides/` | Two-bulge ocean + tidal-force arrows; water-level-vs-time curve; Moon elongation & Sun toggle drive spring/neap. |
| `exoplanet-transit/` | Planet crossing a star and the light curve; depth = (Rp/R*)², Kepler period, duration, flat-bottomed vs grazing. |
| `radial-velocity/` | Star + planet about the barycentre, a spectral line sliding blue/red, the RV curve; K, m·sin i, inclination. |

### Light & stars
| Sim | What it shows |
|---|---|
| `blackbody-spectrum/` | Live Planck curve, visible band, Wien peak, sRGB colour swatch, T⁴ output ratio, spectral class. |
| `stellar-parallax/` | Earth's orbit + swinging sight line, the star's yearly ellipse on the sky, d[pc] = 1/p["]. |
| `inverse-square-brightness/` | Light spreading over 4× the area per doubling; flux-vs-distance (log), apparent/absolute magnitude, distance modulus. |
| `hr-diagram/` | L-vs-T plot with the main sequence, giants, white dwarfs, constant-R diagonals; click to place a star (radius, region, mass, lifetime). |
| `hr-diagram-full/` | Spectral classification: OBAFGKM types × I–V luminosity classes as bands on the diagram; read off absolute magnitude. |

### Stellar lives & pairs
| Sim | What it shows |
|---|---|
| `hr-diagram-evolution/` | One star's whole life as a path across the H–R diagram, from protostar to white dwarf / brown dwarf / supernova, set by starting mass. |
| `hr-diagram-cluster/` | A synthetic cluster ageing; the main-sequence turnoff slides down and gives the cluster's age (Pleiades → M13). |
| `eclipsing-binary/` | Two stars eclipsing each other; the light curve's deep and shallow dips give relative sizes and temperatures. |
| `spectroscopic-binary/` | One absorption line splitting in two as the stars swing toward/away; K_A/K_B = M_B/M_A; RV curve. |

### Cosmology
| Sim | What it shows |
|---|---|
| `hubble-law/` | A field of galaxies flying apart; v-vs-d Hubble diagram; re-centre on any galaxy; age ≈ 1/H₀. |
| `cosmic-distance-ladder/` | The rungs (radar → parallax → main-sequence fitting → Cepheids → Type Ia → Hubble) on a log distance scale; the calibration chain for any distance. |

## Conventions

- Canvas art on a dark ground (`#080b12`), controls in a right-hand column, mobile
  breakpoint at 680 px.
- Accent colour per topic.
- KaTeX for formulas with a plain-text fallback if the CDN is blocked.
- Physics/geometry kept to the level of an algebra-based intro course; every sim
  states its approximations in the Info panel and a footer line.

## Not fact-checked yet

These are first drafts. The physics collection went through three content-audit
passes; this one has not. Spot-checks so far are good (Jupiter RV = 12.5 m/s,
Vega parallax = 0.130″, Betelgeuse radius = 776 R☉, Mars retrograde every
2.14 yr), but treat the numbers as illustrative until reviewed.
