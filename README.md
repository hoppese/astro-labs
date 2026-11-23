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

## The simulations (24, all drafts)

### Earth, Moon & sky
| Sim | What it shows |
|---|---|
| `moon-phases/` | Tilted 3D view of the Moon's orbit (drag the Moon to set the phase) + the same Moon seen from the ground; illuminated fraction, rise/set. |
| `seasons/` | Axial tilt vs distance: 3D orbit with the axis fixed in space, a Day & night globe tab, real Earth–Sun distance; noon Sun altitude, day length, sunbeam spreading. |
| `eclipses/` | Solar/lunar toggle in a draggable 3D view, plus a to-scale side view of umbra and penumbra; Total / Annular / Partial / Penumbral verdict; the 5° tilt and nodes. |
| `celestial-sphere/` | Draggable 3D celestial sphere with the observer's horizon (or a flat sky-map toggle); pole altitude = latitude, diurnal circles, circumpolar test. |
| `retrograde-motion/` | Real orbits with numbered snapshots of the Earth→planet sight line, and the planet's loop on a sky facing south. |
| `planetary-configurations/` | Phases of Venus: elongation, phase and apparent size changing together; configurations and synodic period; why Ptolemy's epicycle can't make a gibbous Venus. |

### Orbits & gravity
| Sim | What it shows |
|---|---|
| `keplers-laws/` | Ellipse with the Sun at a focus, Kepler's equation each frame, equal-area wedges, speed-over-orbit strip, P² vs a³. |
| `tides/` | Sun and Moon shown with real tidal-force vectors; two-bulge ocean, tide height in metres vs time; spring/neap. |
| `exoplanet-transit/` | Planet crossing a limb-darkened star, a side view showing inclination, and the light curve; depth = (Rp/R*)², period, duration, grazing transits. |
| `radial-velocity/` | Star + planet about the barycentre in a 3D orbit with the line of sight and inclination i; a spectral line sliding blue/red; RV curve, K, m·sin i. |

### Light & stars
| Sim | What it shows |
|---|---|
| `blackbody-spectrum/` | Live Planck curve, visible band, Wien peak, sRGB colour swatch, T⁴ output ratio, spectral class. |
| `atomic-spectra/` | Bohr energy levels and the photons they emit or absorb; Kirchhoff's three spectrum types; identify a gas by its lines. |
| `telescopes/` | What aperture buys: light-gathering ∝ D², resolution 1.22λ/D on a double star, and why magnification alone doesn't help. |
| `stellar-parallax/` | 3D view of Earth's orbit and the sight line, the star's yearly ellipse on a true-scale sky, ecliptic-latitude slider; d[pc] = 1/p["]. |
| `inverse-square-brightness/` | Light spreading over the 1-4-9 squares; flux vs distance (log), apparent/absolute magnitude, distance modulus, naked-eye limit. |
| `hr-diagram/` | L-vs-T plot with the main sequence, giants, white dwarfs, constant-R diagonals; click to place a star (spectral subtype, radius, region, white-dwarf type, mass, lifetime). |
| `hr-diagram-full/` | Spectral classification: OBAFGKM types × I–V luminosity classes as bands on the diagram; read off absolute magnitude. |

### Stellar lives & pairs
| Sim | What it shows |
|---|---|
| `hr-diagram-evolution/` | One star's whole life as a path across the H–R diagram, from protostar to white dwarf / brown dwarf / supernova, set by starting mass. |
| `hr-diagram-cluster/` | A synthetic cluster ageing; the main-sequence turnoff slides down and gives the cluster's age (Pleiades → M13). |
| `eclipsing-binary/` | Two stars eclipsing each other with a side-view inset; the deep and shallow dips give relative sizes and temperatures, and the eclipse type. |
| `spectroscopic-binary/` | One absorption line splitting in two as the stars swing toward/away at inclination i; K_A/K_B = M_B/M_A; RV curve. |

### Galaxies & cosmology
| Sim | What it shows |
|---|---|
| `galaxy-rotation/` | Why galaxies need dark matter: stars orbiting a tilted spiral, the flat observed rotation curve vs the visible-only fall-off, M(<r) = v²r/G. |
| `hubble-law/` | A field of galaxies flying apart; realistic noisy v-vs-d data with a fitted H₀; re-centre on any galaxy; age ≈ 1/H₀. |
| `cosmic-distance-ladder/` | The rungs (radar → parallax → main-sequence fitting → Cepheids → Type Ia → Hubble) on a log distance scale; the calibration chain for any distance. |

## Conventions

- Canvas art on a dark ground (`#080b12`), controls in a right-hand column, mobile
  breakpoint at 680 px.
- Accent colour per topic.
- KaTeX for formulas with a plain-text fallback if the CDN is blocked.
- Physics/geometry kept to the level of an algebra-based intro course; every sim
  states its approximations in the Info panel and a footer line.

## Not fact-checked yet

These are drafts, and the four newest (atomic spectra, telescopes, phases of Venus, galaxy rotation) are first drafts. The physics collection went through three content-audit
passes; this one has not. Spot-checks so far are good (Jupiter RV = 12.5 m/s,
Vega parallax = 0.130″, Betelgeuse radius = 776 R☉, Mars retrograde every
2.14 yr), but treat the numbers as illustrative until reviewed.
