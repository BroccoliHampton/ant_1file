# ALIEN ANT FARM — Master Reference

A complete breakdown of every creature, element, and system in the simulation.

---

## TABLE OF CONTENTS
1. [Genome System](#genome-system)
2. [Creatures](#creatures)
3. [Terrain & Physics Elements](#terrain--physics-elements)
4. [Biological Elements](#biological-elements)
5. [Special / Programmable Elements](#special--programmable-elements)
6. [Pharmacy / Drugs](#pharmacy--drugs)
7. [Machine & Bacteria (GoL Systems)](#machine--bacteria-gol-systems)
8. [Events & Entropy](#events--entropy)

---

## GENOME SYSTEM

Every living creature carries a 6-gene genome (each gene 0–255). Genes drift on reproduction. When drift exceeds a threshold a new **strain** is registered — strains are tracked in the population ledger and can evolve unique behaviors.

| Index | Gene | Effect |
|-------|------|--------|
| [0] | **Density / Size** | Body mass, maps to physics density 2–6 |
| [1] | **Speed / Mobility** | Movement frequency and step distance |
| [2] | **Appetite** | Food consumption rate and hunger |
| [3] | **Aggression** | Attack intensity, hunt range |
| [4] | **Resilience** | Damage reduction from hazards |
| [5] | **Reproduction** | Spawn rate, queen/egg laying frequency |

**Mutation** is controlled by the Mutation slider. At high rates genes drift heavily each generation; at zero, strains are fixed forever.

---

## CREATURES

### 🐜 ANT
**Color:** Neon green · **Cap:** 300 workers, 100 queens

- **Eats:** Fungi (+30 energy), Wasps (+15), Detritus/Ash (+8). Needs to eat to sustain energy.
- **Movement:** Follows pheromone trails through open space and clay. Tunnels through **Clay Hard** (soft clay becomes tunnel walls). Climbs plants (15+ energy required).
- **Combat:** High-aggression ants retaliate against adjacent spiders using nearby Salt, Ash, or Gunpowder as weapons (12–50 HP splash damage).
- **Death:** Energy ≤ 0, HP ≤ 0, drowning (water drains HP), fire, acid.
- **Queen promotion:** Worker becomes Queen when energy ≥ 115 and it has eaten a plant. Queens only spawn if none are within 5 cells.
- **Variants:** Tank Ant (double HP, slow), Forager (2× plant eating), Acid-Walker (immune to acid), Aquatic Ant (water survival), Fire-Runner (immune to fire/lava), Jumper Ant (short-range teleport 8% per tick), Tunnel-Master (3× clay dig speed).
- **Genome defaults:** [60–100, 120–200, 100–180, 80–150, 80–140, 100–180]

### 👑 QUEEN ANT
**Color:** Orange · **Cap:** 100

- **Energy:** Gains from sunlight (+light×0.3 +0.1/tick). Slowly starves without sun (−0.15/tick, taking 2 HP/tick when empty).
- **Spawns:** Workers on a variable interval (20–100 ticks based on gene[5]). Lays Eggs every 100 ticks (40% chance).
- **Fed by workers:** Adjacent ants with >160 energy tithe 25 energy to the queen.
- **Sessile** — never moves.

---

### 🕷 SPIDER
**Color:** Dark gray · **Cap:** 120 workers, 25 queens

- **Eats:** Ants, Termites, Wasps, Eggs (25 energy on hit + 10 on kill). Scavenges Detritus (+12).
- **Movement:** **Web-constrained.** Can only move onto WEB cells or empty cells directly adjacent to web. Will never walk open ground. Falls and bleeds out (6 HP/tick) if stranded on sand/clay with no surface to cling to.
- **Clinging surfaces:** Wall, Plant Wall, Fridge Wall, Web, Wood, Ice, Stone.
- **Hunting:** Detects prey within 5–10 cells (gene[3]-scaled). Smoke blinds to 2 cells. Moves toward prey along the web network; attacks adjacent prey even if the attack crosses a non-web gap.
- **Web laying:** 8–20% chance per tick to lay web in an adjacent empty cell. Prefers frontier cells (expands outward rather than carpet-bombing). Worker web lasts **450–600 ticks**. Queen web lasts **500–700 ticks**.
- **Special attacks:** Acid spit toward prey (aggression >0.75, energy >180, 2% chance, costs 15 energy). Fire herding (aggression >0.7, pushes prey toward adjacent fire/lava).
- **Queen promotion:** After kills with energy ≥ 110 (6% per kill), or passively at ≥ 110 energy (2% per tick). Checks 8-cell radius for existing queens.
- **Variants:** Ambusher (hunt radius 2 cells, instant kill), Web-Master (3× web rate), Venomous (one-shot kill), Acrobat (3× speed, half HP), Pack-Hunter (2× damage with adjacent spider).
- **Genome defaults:** [80–140, 100–180, 80–160, 160–230, 120–200, 120–220]

### 🕸 QUEEN SPIDER
**Color:** Vivid purple · **Cap:** 25

- **Energy:** Sun-powered (+light×2 +0.4/tick). Immune to energy starvation.
- **Spawns:** Workers every 12–52 ticks (faster with high gene[5]). Lays up to 2 web cells every 12 ticks (70% chance) to seed territory.
- **Sessile** — never moves. Dies only from direct HP damage (fire, events, plague).

---

### 🪲 TERMITE
**Color:** Warm amber · **Cap:** 250 workers, 40 queens

- **Eats:** Wood (primary, 30 energy, consumed at appetite×0.18 rate). Fungi (+25). Wasps (+15). Detritus/Ash (+8). **Does not eat plants** (traverses them instead).
- **Movement:** Deposits pheromone near wood/clay. Can walk through Plant and Plant Wall cells (traversal, no destruction). Cannot dig tunnel walls.
- **Combat:** Fighter variant attacks adjacent Spiders for 12 HP.
- **Queen dependency:** Queens starve without adjacent wood — they drain 0.14 energy/tick and gain only from wood-adjacent workers feeding them. Dormant queens with no wood supply die.
- **Queen promotion:** Drop queen at 110+ energy (1.8% per tick, 60-tick cooldown). Spontaneous queen spawn at 130+ energy (1.8% chance).
- **Variants:** Wood-Borer (3× wood eating), Mound-Builder (leaves clay trail 12%), Soldier (double HP, attacks spiders), Fungus-Farmer (never eats fungi, fungi grow faster nearby).
- **Genome defaults:** [60–100, 100–180, 140–210, 40–100, 80–150, 80–160]

### 🪲 QUEEN TERMITE
**Color:** Bright golden-orange · **Cap:** 40

- **Energy:** Sun + worker feeding (+light×0.3 +0.1/tick, requires workers to bring food).
- **Spawns:** Workers every 12–40 ticks. Spawns 1–3 workers at once (burst on high gene[5]).
- **Starvation:** Unlike ant/spider queens, termite queens are NOT immune to energy death. Without adjacent wood, they die.
- **Sessile** — never moves.

---

### 🐝 WASP
**Color:** Yellow-gold · **Cap:** 200 workers, 10 queens

- **Eats:** Spiders (primary prey, attacks when within queen's hive radius). Scavenges Detritus/Ash (+8) as fallback.
- **Movement:** Fast and skittery. Obeys gravity (falls/floats based on density gene).
- **Hive behavior:** Wasps check for a **Queen Wasp within 15 cells** every tick. If a queen is nearby, they actively hunt spiders (including Queen Spider). If **no queen is within range, they wander passively** and do not attack or die — they simply idle.
- **Combat:** Attacks adjacent spiders (12–40 HP damage based on aggression gene). Gains 18 energy per hit, 12 bonus on kill.
- **Queen promotion:** Passively at energy ≥ 220 (0.6% per tick, checks 20-cell radius for existing queens). On kill at energy ≥ 185 (5%, 20-cell radius check).
- **Worker budding:** At energy > 200 (1.2% per tick × gene[5]).
- **Variants:** Sentinel (attacks spiders within 2 cells on sight), Drone (2× reproduction rate, half HP), Soldier (double HP, attacks on contact).
- **Genome defaults:** [40–80, 160–230, 120–200, 60–120, 60–120, 140–220]

### 🐝 QUEEN WASP
**Color:** Bright yellow · **Cap:** 10

- **Energy:** Sun-powered (+light×2 +0.4/tick).
- **Spawns:** Workers every 20–100 ticks (interval based on gene[5]).
- **Sessile** — never moves. The presence of a queen within 15 cells activates nearby wasps to hunt.

---

### 🍄 FUNGI
**Color:** Purple · **Cap:** 300

- **Eats:** Wood (rots to Detritus, 0.8% chance when adjacent, +15 energy). Ash (+2). Gold Sand (+10, 4%). Water (moisture boost to spread rate).
- **Parasitism:** Drains HP from adjacent Ants, Termites, Wasps, and Spiders (8–20 energy drain + 3 HP, gene[2]-based). Spider death at fungi's hands triggers a 3–5 cell fruiting burst.
- **Spreads:** Into adjacent empty dark cells (light < 0.4) or Stone cells. Spread rate = speed gene × 0.02 + moisture bonus.
- **Produces:** Spores (acid spore offensive launch, 0.3% per tick upward when aggression gene > 180).
- **Deaths:** Salt (40 HP instant), Lava/Acid (50 HP), Sunlight > 0.6 causes burn damage (light × 4 × sensitivity × resilience factor). Ice presence completely stops energy drain (dormant).
- **Parasite trait:** Drains 1 HP/tick from ALL adjacent creatures (ants, termites, wasps, spiders).
- **Explode trait:** On death, bursts 3–5 new Fungi into nearby dark cells.
- **Genome defaults:** [40–80, 10–40, 100–180, 20–60, 80–160, 120–200]

---

### 🌿 PLANT
**Color:** Dark green · **Cap:** 800

- **Energy:** Photosynthesis (+light×3 +0.3/tick, +light×0.4 bonus near smoke). Boosted 6× by adjacent Water.
- **Movement:** Grows upward toward sun (preferred), sideways, and rarely downward. Hardens older cells into **Plant Wall** (immovable).
- **Produces:** Seeds (sideways/downward), Oxygen (upward or every 12–40 ticks when light > 0.3).
- **Water:** Consumes adjacent Water cells (15% chance), heavily accelerates growth.
- **Deaths:** Lava/Acid (40 HP). Ants eat it. Adjacent Wasps are killed (12% chance — plants deter wasps).
- **Spider interaction:** Plants convert nearby Web to Plant Wall (aggressive choke at 82% per tick).
- **Genome defaults:** [80–140, 10–40, 60–100, 0–30, 100–180, 80–150]

---

### 🪱 WORM
**Color:** Segmented pink-red

- **Body:** Snake-like chain of 2–30 cells (head leads, tail follows).
- **Movement:** Head advances forward/left/right every 3rd tick. Entire body follows head path.
- **Eats:** Jelly (+30 energy, body grows up to 30 cells). Ants, Termites, Spiders, Wasps, Queens (+20 energy).
- **Death:** Self-collision kills the whole worm. Energy depletion (drains 0.015/tick × body length).

---

### 🐸 FROGSTONE
**Color:** Green (sun-reactive)

- **Structure:** 10×5 cell dome. Hub cell at bottom-center handles all behavior.
- **Tongue:** Instantaneous snap-kill on any creature within range. Tongue renders visually for 4 ticks.
- **Range:** 6–12 cells base + sun power bonus. Reload: 2–8 ticks (10× faster when sun is close).
- **Sun power:** 0.15–1.0, based on distance from sun dot. Closer sun = longer range, faster reload.
- **Eats:** Any creature with a genome (including custom lab creatures). Immune to fungi drain.
- **Healing:** +0.04 HP/tick, +40 HP per kill. Immune to energy starvation.

---

### 🧬 CUSTOM CREATURES *(Creature Lab / Chromadust)*

Generated procedurally with randomized attributes:
- **Archetype:** Creature, Plant, or Fungi-style behavior base
- **Movement:** Climber, Burrower, Floater, Walker, Sessile
- **Diet:** Carnivore, Herbivore, Omnivore, Detritivore, Photosynthetic
- **Reproduction:** Budding, Egg-laying, Spore-release, Binary fission
- **Size:** Tiny to Large (affects population cap)
- **Specials:** Random selections from trait pool

Chromadust spawns one custom creature type per hue bucket (12 possible, 30° apart). Each hue = a distinct species with persistent identity.

---

## TERRAIN & PHYSICS ELEMENTS

Elements follow a **density-based gravity** system. Heavier elements fall through lighter ones. Agents (creatures) are treated as density-3 masses.

### Falling Solids

| Element | Density | Behavior |
|---------|---------|----------|
| **Sand** | 5 | Falls, slides laterally. Bedrock of most terrains. |
| **Gold Sand** | 8 | Falls slower (heavier). Boosts plant/ant energy when adjacent. |
| **White Sand** | 3 | Falls, lighter than normal sand. |
| **Clay** | 5 | Falls and **settles** after 25 ticks → becomes Clay Hard (immovable, 30% chance ant-proof). |
| **Stone** | 7 | Falls until resting for 3 ticks, then immobile. |
| **Salt** | 3 | Falls. Dissolves in Water (6% per tick). Damages creatures 0.8% per tick adjacent. |
| **Ash** | 0.8 | Falls slowly, drifts sideways 8%. Gives adjacent plants a small energy boost. |
| **Detritus** | 4 | Falls. Nutrition source for most organisms. |
| **Wood** | 4 | Grows upward (trunk) and sideways (branches). Roots needed (sand/clay/detritus). Burns at 0.4% per tick near fire. Termites gnaw it. |

### Liquids

| Element | Density | Behavior |
|---------|---------|----------|
| **Water** | 2 | Flows downward and sideways. Extinguishes Fire → Steam. Dissolves Salt. Boosts plant growth. |
| **Oil** | 1 | Flows, floats on water. **Extremely flammable** (100% ignition rate). |
| **Acid** | 2.1 | Flows. TTL 300. Dissolves most materials 4%/tick (removes 8 TTL per dissolve). Damages creatures 4%/tick. |
| **Lava** | 8 | Flows slowly. TTL 300–700. Solidifies to Stone on Water contact (spawns Steam). Melts Ice. Ignites flammables. |

### Gases (Rising)

| Element | Density | Behavior |
|---------|---------|----------|
| **Smoke** | 0.15 | Rises, drifts 40%. TTL 60 ticks. Blinds spiders (reduces hunt range to 2 cells). |
| **Steam** | 0.1 | Rises, drifts 30%. TTL 80. Eventually becomes Water. |
| **Oxygen** | 0.12 | Rises, drifts 30%. TTL 120. **Chain ignition:** if 3+ adjacent oxygen cells contact Fire/Lava, all ignite simultaneously. Released by plants. |

### Reactive / Explosive

| Element | Notes |
|---------|-------|
| **Fire** | TTL 15–60. Spreads to flammable neighbors (Oil 100%, Web 95%, Plant 85%, Fungi 80%, Wood 50%, Gunpowder 100%). Damages creatures (8–40 HP based on resilience). Leaves Ash on death 20%. |
| **Gunpowder** | Falls. **Explodes** on Fire/Lava contact — 5-cell radius blast of fire. Chain-detonates adjacent gunpowder. |
| **Ice** | TTL 600–1200. Static. Melts near Fire/Lava/Steam → Water. Slows plant growth (+1 timer per tick). Creates traction for mites. |

### Walls / Structures

| Element | Notes |
|---------|-------|
| **Wall** | Fully immovable. Indestructible except by Erase tool. |
| **Clay Hard** | Hardened Clay. 30% of hardened clay is "reinforced" (ant-proof — ants cannot tunnel it). |
| **Fridge Wall** | Special wall that freezes Mutagen activity inside its boundary. |
| **Plant Wall** | Immovable plant structure. Spiders can cling to it. |
| **Tunnel Wall** | Left behind when ants excavate Clay Hard. Structural, soft. |

---

## BIOLOGICAL ELEMENTS

### 🌱 Seed
- Falls with gravity until landing on Sand, Stone, Clay, Detritus, Ash, or Plant.
- Instantly germinates into a Plant on landing.
- Drains 0.2 energy/tick — dies at ≤5 energy without rooting.

### ✦ Spore
- Floats slowly upward.
- Germinates into **Fungi** when it lands in a dark cell (light < 0.4).
- Burns in Fire/Acid on contact.

### 🥚 Egg
- TTL 60 ticks.
- Hatches into a mutated **Ant** (inherits parent genome with drift).
- Destroyed instantly by Fire, Lava, or Acid.

### 🕸 Web
- Built by Spiders and Queen Spiders.
- **Worker-laid:** TTL 450–600 ticks.
- **Queen-laid:** TTL 500–700 ticks.
- Burns easily (95% fire ignition rate). Flammable, consumed by plant growth.
- Provides a cling surface for spiders. Spiders without web die slowly.

### 🪵 Wood
- Grows upward (trunk, priority 4), sideways (branches, 3), diagonal (2), rarely downward (1).
- **Root requirement:** Must be anchored to Sand, Detritus, Gold Sand, Clay, or existing Wood.
- **Fire:** 0.4% chance to self-ignite per tick when adjacent to fire.
- **Termites:** Worker termites gnaw wood cells (appetite × 0.18 damage, 5% chance per tick to consume a cell outright).

---

## SPECIAL / PROGRAMMABLE ELEMENTS

### ☁ Cloud
- Floats upward, drifts sideways (phase-based oscillation).
- **Rain:** Drops Water every 80–60 ticks (scales with charge). Bursts 3 drops at charge ≥ 220.
- **Charge:** Gains from Steam (+20), Water contact (+5), passive (+0.15/tick). Never below 30.
- **Lightning:** Rare (0.3%) at charge ≥ 240 — strikes a 15-cell vertical column of Fire, dealing 60 HP to any creature hit. Costs 80 charge.
- Destroyed by Fire, Lava, or Acid.

### 💥 Bloom Cloud
- Inert dark powder, falls with gravity.
- **Reaction:** Water or Steam contact → spawns a **Bloom Fire** cell above it (8-tick cooldown).
- Destroyed by Fire, Lava, Acid.

### 🔥 Bloom Fire
- TTL 60–140. Floats upward and drifts sideways.
- Burns Plant (60%), Wood (40%), Oil (80%), Fungi (50%), Web (70%).
- Deals 12 HP to creatures (35% chance).
- Leaves trailing sparks.

### ⚙☁ Prog Cloud *(Programmable)*
- **Stationary and indestructible** — anchors itself, cannot be moved or destroyed by fire/lava/acid.
- Configurable emitter. Emits any selected element type every N ticks (default 30).
- **Terrain options:** Water, Acid, Sand, Gold Sand, Lava, Oil, Salt, Ice, Fire, Steam, Ash, Smoke, Gunpowder, Detritus, Stone, Clay, White Sand.
- **Creature options:** Ant, Queen Ant, Spider, Queen Spider, Fungi, Wasp, Queen Wasp, Termite, Queen Termite, Plant — spawns with a random genome.
- Configured via dropdown + rate slider in the toolbar.

### ⚙▼ Prog Void *(Programmable)*
- Stationary eraser. Destroys a selected element type within a configurable radius (default 2).
- **Terrain options:** Same as Prog Cloud above.
- **Creature options:** Target individual creature types to selectively cull populations.
- **Special modes:** "All Sand" (destroys all sand variants), "All Agents" (destroys all creatures).
- Pulses visually when it absorbs something. Anchors itself — reclaims its cell if displaced.

### 🌡 Weather Station
- Configures a persistent rain zone. Set rain type (Water, Acid, etc.), rate, and toggle active.
- No movement, no physics.

---

## PHARMACY / DRUGS

These are liquid-like elements that flow and interact with creatures on contact.

### ⚛ Life Seed *(Mutagen)*
- TTL 120–160. Flows and drifts randomly.
- **Mutates** adjacent creature genes (8% chance, ±60 delta per gene per tick).
- **Self-replicates** near Gold Sand or Detritus at energy ≥ 80 (1.2% chance).
- **Frozen** by Fridge Wall — no activity inside fridge zones.
- *Recipe: base element*

### ✨ Chromadust
- TTL 150–230. Pulses with rainbow colors while falling, then shifts to colony hue.
- **On expiry:** Spawns a custom procedural creature matched to its hue. Each of 12 hue buckets (0°, 30°, 60°...330°) is a distinct species that persists across sessions.
- Creatures from the same hue form a single colony.

### 🌈 Lucid
- TTL 200. Flows.
- **On creature contact:** Creates an expanding fractal rainbow wave overlay across the map (visual only). Wave propagates outward from the struck creature.
- *Recipe: Mutagen + Ice*

### 💥 Crank
- TTL 200. Flows.
- **On creature contact:** Launches the creature 25–55 cells in a random direction, leaving a sparse fire trail. **5% chance** of explosion at landing (5×5 fire blast).
- *Recipe: Gold Sand + Fire*

### 🌬 Flaca
- TTL 200. Flows.
- **On creature contact:** Slows creature movement and reduces energy drain for 60 ticks.
- *Recipe: Water + Ice*

---

## FRACTAL ELEMENTS

### 🔺 SIERP *(Sierpinski Triangle)*
- **Placement:** Single-dot seed placed anywhere on the grid.
- **Growth:** Expands row-by-row using Rule-90 cellular automaton. Each new row = XOR of the two cells above it. Grows 38 rows from the seed point.
- **Color:** Rainbow rows, each row gets a distinct hue that slowly rotates with time. Brightness pulses wave-like.
- **TTL:** Cells decay after ~750–830 ticks. Growth is fixed; all cells placed on first stamp.
- **Immovable** while alive.

### ◈ JULIA *(Julia Set Fractal)*
- **Placement:** Single-dot seed placed anywhere on the grid.
- **Growth:** Expands ring-by-ring outward from the seed using escape-time iteration (c = −0.4 + 0.6i). Grows up to radius 250, filling a large portion of the world.
- **Color:** Exterior cells (escaped) colored by escape-time bands — cycling hues with animated drift. Interior cells (non-escaping Julia set region) rendered as dark pulsing purple.
- **TTL:** Cells decay after ~800–920 ticks. Growth continues until radius 250 or grid edge.
- **Immovable** while alive.

---

## MACHINE & BACTERIA (GoL SYSTEMS)

### 🦠 Virus *(Machine / Conway's Game of Life)*
- Runs standard **Conway's Game of Life** (B3/S23) on the simulation grid.
- **Activation:** Auto-starts 5 seconds after last placement.
- **Infection:** Spreads to adjacent organic cells (Ant, Queen, Spider, Plant, Fungi, Web, Detritus, Spore, Egg, Wood) at 6% contact rate, chain-infects infected neighbors at 18%.
- **Color:** Cycles through a rainbow hue per generation (hue = 37 × generation % 360).
- **Dies from:** Contact with Sand, Salt, Gunpowder, Ash, and most hazard elements.
- **Dead cells:** Fade to red, auto-clear after 5 ticks.

### 🧫 Bacteria *(HighLife B36/S23)*
- Runs **HighLife** rules on a **2×2 coarse grid** (each logical cell = 4 pixels).
- **Rules:** Born on 3 **or 6** neighbors (the B6 rule enables self-replication). Survives on 2 or 3 neighbors.
- **Activation:** Auto-starts 5 seconds after last placement.
- **Self-replication:** The B6 rule allows stable patterns to spontaneously copy themselves — this is HighLife's key property vs. standard GoL.
- **Visualization:** Bioluminescent cyan-green diagonal wave animation (dormant = dim blue-green).

### RNA Stamps *(HighLife preset patterns)*
Pre-built HighLife patterns you can stamp directly:
- **🔬 RNA Glider** — Small 5-cell pattern, travels diagonally across the grid.

---

## EVENTS & ENTROPY

### Named Events *(UI-triggered)*

| Event | Effect |
|-------|--------|
| **Drought** | 30% of all Water cells destroyed. |
| **Bloom** | 80 Gold Sand particles scattered randomly across the grid. |
| **Wildfire** | 8 random Plant/Plant Wall cells ignited (Fire TTL 30). |
| **Plague** | 30% of all agents take 40 HP damage. Weak individuals die first. |
| **Spore Storm** | 30 Fungi colonies spontaneously establish in dark zones. |
| **Rainstorm** | Activates rain for 200–400 ticks. |
| **Acid Rain** | Activates acid rain for 80–160 ticks. |

---

### Entropy System *(Chaos Slider)*

The Entropy slider (0–100%) drives constant background chaos events across four tiers. Each tier fires on its own probability curve per tick.

**Tier 1 — Atmospheric** *(fires at rate × 14%)*
Spark, smoke, steam, water drip, detritus, ash — minor environmental noise.

**Tier 2 — Chemical** *(fires at rate × 6%)*
Acid pool, oil slick, lava vein, ice block, salt scatter, Life Seed, Lucid, Crank. Rare: Chromadust shower (3–6 particles from above).

**Tier 3 — Biological** *(fires at rate × 3.5%)*
Random creature spawns: Ant (22%), Spider (16%), Wasp (12%), Termite (12%), Fungi (10%), Plant (10%), Seed (6%), Spore (5%), Egg (4%).

**Tier 4 — Cosmic** *(fires at rate × 1% — rare, high-impact)*

| Event | Effect |
|-------|--------|
| ☄️ Meteorite | Lava core + 3-cell fire blast at a random location. |
| ⚡ Lightning | 8–28 cell vertical fire column strikes from the top. |
| 👑 Queen Spawn | A random queen type (Ant, Spider, Wasp, Termite) appears. |
| 🦠 Virus | 2–4 Machine cells materialize. |
| 🧫 Bacteria | A 2×2 Bacteria block appears. |
| 🪱 Worm | A 5-cell worm chain spawns and begins hunting. |
| 💥 Gunpowder Chain | 4–10 Gunpowder cells scatter near existing fire. |
| 🧬 Custom Creature | A random lab-created creature spontaneously appears. |
| 🌊 Flood Surge | 5–15 Water cells erupt from a random grid edge. |

---

## VARIANT SYSTEM

Most creatures can speciate into a **named variant** when mutation is active. Variants are inherited by offspring (70% chance) and provide distinct behavioral traits.

| Creature | Variant | Trait |
|----------|---------|-------|
| Ant | Tunnel-Master | Digs through clay 3× faster |
| Ant | Forager | Eats plants twice as aggressively |
| Ant | Tank Ant | Double HP, slower movement |
| Ant | Acid-Walker | Immune to acid — walks through acid pools |
| Ant | Aquatic Ant | Survives in water without drowning |
| Ant | Fire-Runner | Immune to fire and lava damage |
| Ant | Jumper Ant | Teleports short distances erratically |
| Spider | Ambusher | Only strikes when prey is within 2 cells — instant kill |
| Spider | Web-Master | Produces web 3× faster, creating dense networks |
| Spider | Venomous | Single bite kills any creature instantly |
| Spider | Acrobat | Moves 3× faster but has half HP |
| Spider | Pack-Hunter | Doubles damage when another spider is adjacent |
| Termite | Wood-Borer | Consumes wood 3× faster |
| Termite | Mound-Builder | Leaves clay trail behind when moving |
| Termite | Soldier | Double HP, attacks spiders on contact |
| Termite | Fungus-Farmer | Never eats fungi; fungi grow faster nearby |
| Wasp | Sentinel | Attacks spiders within 2 cells on sight |
| Wasp | Drone | 2× reproduction rate, half HP |
| Wasp | Soldier | Double HP, attacks on contact |
| Fungi | Bioluminescent | Glows in dark, immune to light damage |
| Fungi | Parasitic | Drains HP from all adjacent creatures |
| Fungi | Explosive | Bursts into spores on death |
| Plant | Thorny | Damages creatures that eat it |
| Plant | Rapid-Growth | Grows 3× faster, spreads aggressively |
| Plant | Deep-Root | Grows downward into sand and clay |

---

*File: GAME_REFERENCE.md — Alien Ant Farm*
