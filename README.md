# Xenobiotic Vivarium — Procedural 3D Artificial Life Terrarium

A modular TypeScript + Vite + Three.js procedural 3D Alife terrarium simulation inspired by [XenobioticAbyss](https://github.com/DaveVoorhis/XenobioticAbyss). Populated by **flying, walking, crawling, slithering, and bouncing** alien creatures alongside dynamically constructed **plants and fungi** — all evolved from composable alife primitives.

## Key Features

- **5 Distinct Locomotion Physics & Articulated Body Plans**:
  - **Flying (`aerial_glider`)**: 3D aerodynamic lift, wing flapping, banking turns, thermal soaring, and perching.
  - **Walking (`hexapod_walker`)**: 6-legged articulated tripod gait synchronized to ground speed and terrain slopes.
  - **Crawling (`armored_crawler`)**: Low-slung segmented carapace with metachronal 8–10 leg scuttle hugging the terrain normal.
  - **Slithering (`serpentine_slitherer`)**: 8–12 sinuous spine segments propagating lateral S-waves across the mossy floor.
  - **Bouncing (`spring_bouncer`)**: Real ballistic hop arcs with crouch anticipation, airborne leg extension, and landing squash-and-stretch.
- **Composable Plants & Fungi**:
  - **Flora**: `spiral_fern`, `canopy_blossom`, `pitcher_trap` (carnivorous snapping flora), `tendril_vine`, `crystal_succulent`.
  - **Fungi**: `parasol_mushroom`, `shelf_cluster`, `puffball_mycelium`, `coral_fungus` with saprotrophic carcass decomposition and mycorrhizal plant mutualism.
- **Full Lifecycles**: Egg incubation & hatching / live birth / budding fission → Neonate → Larva or Nymph I–III ecdysis molts → Adult courtship, mating, and spawning → Elder senescence → Old age & death → Decomposing carcass → Fertile soil nutrient patch.
- **Complex Emergent Interactions**: Pack hunting, flocking/herding with alarm pulses, pollinator-blossom mutualism, mycorrhizal fungal-plant symbiosis, territorial duels, ambush pounces, dazzling bio-flashes, spore-cloud escapes, and carnivorous pitcher traps.

## Quick Start

```bash
npm install
npm run dev
```

Build, typecheck, and run automated unit tests:

```bash
npm run build
npm run typecheck
npm test
```

## Controls & Shortcuts

| Shortcut | Action |
| :--- | :--- |
| **Click Organism** | Select & inspect organism |
| **Drag / Scroll** | Orbit / zoom camera |
| `Space` | Pause / resume simulation |
| `G` | Toggle **Feed Mode** (click terrarium to drop nutrient fruit) |
| `C` | Toggle **Species Codex & Lineage** drawer |
| `E` | Toggle **Environment & Genesis Lab** drawer |
| `V` | Toggle Fullscreen **Creature-Eye POV** |
| `P` | Toggle Live **Picture-in-Picture Eye-Cam** |
| `F` | Toggle **Follow Cam** on selected organism |
| `M` | Toggle procedural **Terrarium Ambient Audio** |
| `H` | Hide / restore HUD |
| `Esc` | Exit POV / Feed Mode / close drawers |
