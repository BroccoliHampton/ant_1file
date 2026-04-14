// ================================================================
//  ALIEN ANT FARM — Simulation Constants
// ================================================================

export const W = 120;
export const H = 200;
export const S = 2;

export const T = {
  // Abiotic
  EMPTY:0, WALL:1, SAND:2, GOLD_SAND:3, WHITE_SAND:4,
  WATER:5, OIL:6, DETRITUS:7, FIRE:8, MUTAGEN:9,
  CLAY:10, CLAY_HARD:11,
  // Kingdom agents
  PLANT:20, ANT:21, QUEEN:22, SPIDER:23, FUNGI:24, WASP:25,
  // Derived states
  PLANT_WALL:26, WEB:27, SPORE:28, EGG:29,
  // Reproductive types
  SEED:30,
  QUEEN_SPIDER:31,
  QUEEN_WASP:32,
  FROGSTONE:33,
  // Classic sand elements
  LAVA:40, STONE:41, STEAM:42, ICE:43, SMOKE:44,
  WOOD:45, ASH:46, ACID:47, GUNPOWDER:48, SALT:49,
  // Fridge
  FRIDGE_WALL:50,
  CLOUD:51,
  BLOOM_CLOUD:52,
  BLOOM_FIRE:53,
  PROG_CLOUD:54,
  WEATHER_STATION:55,
  PROG_VOID:56,
  // Additional creatures from phone version
  TERMITE:60,
  QUEEN_TERMITE:61,
  // Conway's Game of Life machines
  MACHINE:70,
  MACHINE_DEAD:71,
  // HighLife bacteria (2×2 pixel scale)
  BACTERIA:74,
  BACTERIA_DEAD:75,
  // Wireworld (Quark) — 3-state wire automaton
  QUARK_CONDUCTOR:80, // yellow wire
  QUARK_HEAD:81,      // blue electron head
  QUARK_TAIL:82,      // red electron tail
  // Visual fractal elements (placed as single stamps, decay via TTL)
  FRACTAL:84,         // Sierpinski rule-90 triangle, rainbow rows
  JULIA:85,           // Cyclic Cellular Automaton (CCA) — spiraling color patterns
  // Custom lab creatures start here
  CUSTOM_BASE:100,
};

export const KINGDOM_HUE = {
  [T.PLANT]:130, [T.ANT]:100, [T.QUEEN]:35,
  [T.SPIDER]:0, [T.FUNGI]:280, [T.WASP]:40,
  [T.QUEEN_SPIDER]:285, [T.QUEEN_WASP]:50,
};

export const K_NAMES = {
  [T.PLANT]:'PLANT', [T.ANT]:'ANT', [T.QUEEN]:'QUEEN',
  [T.SPIDER]:'SPIDER', [T.FUNGI]:'FUNGI', [T.WASP]:'WASP',
  [T.QUEEN_SPIDER]:'Q.SPIDER', [T.QUEEN_WASP]:'Q.WASP',
};

export const K_COLORS = {
  [T.PLANT]:'#1a6b1a', [T.ANT]:'#39ff14', [T.QUEEN]:'#ff8800',
  [T.SPIDER]:'#505058', [T.FUNGI]:'#8c32c8', [T.WASP]:'#f5c000',
  [T.QUEEN_SPIDER]:'#cc44ff', [T.QUEEN_WASP]:'#ffe566',
  [T.TERMITE]:'#c87820', [T.QUEEN_TERMITE]:'#f0a030',
};

export const GENOME_DEFAULTS = {
  [T.PLANT]:          [[80,140],[10,40], [60,100],[0,30],  [100,180],[80,150]],
  [T.ANT]:            [[60,100],[120,200],[100,180],[80,150],[80,140],[100,180]],
  [T.QUEEN]:          [[100,160],[20,60],[80,140],[40,80],  [140,220],[180,255]],
  [T.SPIDER]:         [[80,140],[100,180],[80,160],[160,230],[120,200],[40,100]],
  [T.QUEEN_SPIDER]:   [[100,160],[80,160],[100,180],[180,255],[140,220],[120,200]],
  [T.FUNGI]:          [[40,80], [10,40], [100,180],[20,60], [80,160],[120,200]],
  [T.WASP]:           [[40,80], [160,230],[120,200],[60,120],[60,120],[140,220]],
  [T.QUEEN_WASP]:     [[60,100],[140,210],[140,210],[80,140],[100,180],[160,230]],
  [T.TERMITE]:        [[60,100],[100,180],[140,210],[40,100],[80,150],[80,160]],
  [T.QUEEN_TERMITE]:  [[100,160],[80,150],[160,230],[40,80], [120,200],[160,230]],
};

export const ELEMENTS = [
  // terrain
  {cat:'terrain', key:'jelly',    label:'JELLY',     col:'#c055a0', tag:'〰'},
  {cat:'terrain', key:'sand',     label:'SAND',      col:'#c4a35a', tag:'ρ5'},
  {cat:'terrain', key:'clay',     label:'CLAY',      col:'#7a8599', tag:'ρ5'},
  {cat:'terrain', key:'stone',    label:'STONE',     col:'#787878', tag:'ρ7'},
  {cat:'life', key:'wood',     label:'WOOD',      col:'#6e4020', tag:'🪵'},
  {cat:'terrain', key:'ice',      label:'ICE',       col:'#b4e0f0', tag:'ρ3'},
  {cat:'terrain', key:'goldSand', label:'GOLD SAND', col:'#ffc800', tag:'ρ8'},
  {cat:'terrain', key:'whiteSand',label:'WHT SAND',  col:'#dcdcd7', tag:'ρ3'},
  {cat:'terrain', key:'salt',     label:'SALT',      col:'#e0e0e0', tag:'ρ3'},
  {cat:'terrain', key:'water',    label:'WATER',     col:'#3c82c8', tag:'ρ2'},
  {cat:'terrain', key:'acid',     label:'ACID',      col:'#ddaa00', tag:'ρ2'},
  {cat:'terrain', key:'oil',      label:'OIL',       col:'#4a7a28', tag:'ρ1'},
  {cat:'terrain', key:'ash',      label:'ASH',       col:'#888880', tag:'ρ1'},
  {cat:'terrain', key:'smoke',    label:'SMOKE',     col:'#505050', tag:'↑'},
  {cat:'terrain', key:'steam',    label:'STEAM',     col:'#c0d8e8', tag:'↑'},
  {cat:'terrain', key:'gunpowder',label:'GUNPOWDER', col:'#504840', tag:'💥'},
  {cat:'terrain', key:'wall',     label:'WALL',      col:'#3c3c3c', tag:'ρ∞'},
  {cat:'terrain', key:'fire',     label:'FIRE',      col:'#ff4400', tag:'🔥'},
  {cat:'terrain', key:'lava',     label:'LAVA',      col:'#ff5500', tag:'ρ8'},
  // life
  {cat:'life', key:'worm',        label:'WORM',         col:'#c85040', tag:'🪱'},
  {cat:'life', key:'ant',         label:'ANT',          col:'#39ff14', tag:'🐜'},
  {cat:'life', key:'queen',       label:'QUEEN ANT',    col:'#ff8800', tag:'👑'},
  {cat:'life', key:'spider',      label:'SPIDER',       col:'#505058', tag:'🕷'},
  {cat:'life', key:'queenSpider', label:'QUEEN SPIDER', col:'#cc44ff', tag:'🕸👑'},
  {cat:'life', key:'termite',     label:'TERMITE',      col:'#c87820', tag:'🪲'},
  {cat:'life', key:'queenTermite',label:'Q.TERMITE',    col:'#f0a030', tag:'🪲👑'},
  {cat:'life', key:'wasp',        label:'WASP',         col:'#f5c000', tag:'🐝'},
  {cat:'life', key:'queenWasp',   label:'Q.WASP',       col:'#ffe566', tag:'🐝👑'},
  {cat:'life', key:'plant',       label:'PLANT',        col:'#1a6b1a', tag:'🌿'},
  {cat:'life', key:'seed',        label:'PLANT SEED',   col:'#4aaa22', tag:'🌱'},
  {cat:'life', key:'detritus',    label:'DETRITUS',     col:'#806545', tag:'🍂'},
  {cat:'life', key:'fungi',       label:'FUNGI',        col:'#8c32c8', tag:'🍄'},
  {cat:'life', key:'spore',       label:'SPORE',        col:'#a050dc', tag:'✦'},
  // virus (conway's game of life) + bacteria (highlife)
  {cat:'special', key:'machine',    label:'VIRUS',       col:'#00e5ff', tag:'🦠'},
  {cat:'special', key:'bacteria',   label:'BACTERIA',    col:'#44ff88', tag:'🧫'},
  {cat:'special', key:'quark',      label:'QUARK',       col:'#ff9900', tag:'⚡'},
  // RNA preset stamps (HighLife patterns)
  {cat:'special', key:'rna1',       label:'RNA GLIDER',  col:'#66ffaa', tag:'🔬'},
  // Visual fractal stamps
  {cat:'special', key:'fractal1',   label:'SIERP',       col:'#dd44ff', tag:'🔺'},
  {cat:'special', key:'fractal2',   label:'CCA',         col:'#00ccff', tag:'🌀'},
  // special
  {cat:'special', key:'mutagen',    label:'LIFE SEED',   col:'#cc00ee', tag:'⚛'},
  {cat:'special', key:'chromadust', label:'CHROMADUST',  col:'#cc88ff', tag:'✨'},
  {cat:'special', key:'cloud',      label:'CLOUD',       col:'#aaccee', tag:'☁'},
  {cat:'special', key:'bloomCloud', label:'BLOOM CLOUD', col:'#881020', tag:'💥'},
  {cat:'special', key:'progCloud',  label:'PROG CLOUD',  col:'#44aaff', tag:'⚙☁'},
  {cat:'special', key:'progVoid',   label:'PROG VOID',   col:'#220033', tag:'⚙▼'},
  // rx
  {cat:'rx', key:'lucid',       label:'LUCID',       col:'#dd88ff', tag:'🌈'},
  {cat:'rx', key:'crank',       label:'CRANK',       col:'#ff6600', tag:'💥'},
  {cat:'rx', key:'flaca',       label:'FLACA',       col:'#aaddff', tag:'🌬'},
];
