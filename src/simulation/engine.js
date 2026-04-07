// src/simulation/engine.js
// Wraps the legacy simulation JS in a module that exports createEngine.
// The legacy code is adapted to run without direct DOM access at import time.

import { W, H, S } from './constants.js';

// ─── Stub DOM helper ─────────────────────────────────────────────
// Returns a safe no-op stub when an element doesn't exist in React's DOM
function _dom(id) {
  const el = document.getElementById(id);
  if (el) return el;
  // Return a proxy object that silently ignores property sets
  return new Proxy({style:{},dataset:{},classList:{add:()=>{},remove:()=>{},toggle:()=>{},contains:()=>false},innerHTML:'',textContent:'',value:'',checked:false}, {
    get(t, k) { return t[k] !== undefined ? t[k] : () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function _domQ(sel) {
  const el = document.querySelector(sel);
  return el || _dom('__none__');
}
function _domAll(sel) {
  return document.querySelectorAll(sel);
}

// ─── Module-level canvas refs (set by createEngine) ──────────────
let canvas, ctx, wrap;

// ─── State callback for React ────────────────────────────────────
let _stateCallback = null;

// ─── Engine control ───────────────────────────────────────────────
let _running = false;
let _paused  = false;
let _rafId   = null;
let _canvasAC = null; // AbortController for canvas event listeners — aborted on stop()

let boxTurns=0,boxAngle=0;
const GDIRS=[{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0}];
let gv={x:0,y:1};
function applyRot(d){
  boxTurns=((boxTurns+d)%4+4)%4;
  boxAngle=boxTurns*90;
  gv=GDIRS[boxTurns];
  wrap.style.transform=`rotate(${boxAngle}deg)`;
  _dom('ang').textContent=`${boxAngle}°`;
  // Counter-rotate hint text so it always reads right-side-up
  _dom('hint-text').style.transform=`rotate(${-boxAngle}deg)`;
}
_dom('rcw').addEventListener('click',()=>applyRot(2));
_dom('rccw').addEventListener('click',()=>applyRot(2));

// ================================================================
//  CELL TYPES
//  0-19: abiotic   20-99: kingdom agents   100+: special
// ================================================================
const T = {
  // Abiotic
  EMPTY:0, WALL:1, SAND:2, GOLD_SAND:3, WHITE_SAND:4,
  WATER:5, OIL:6, DETRITUS:7, FIRE:8, MUTAGEN:9,
  CLAY:10, CLAY_HARD:11, // clay: falls like sand, hardens when settled — ants tunnel through
  // Kingdom agents — each has a genome
  PLANT:20, ANT:21, QUEEN:22, SPIDER:23, FUNGI:24, MITE:25,
  TERMITE:34,      // former ant behavior — chews through clay aggressively
  // Derived states
  PLANT_WALL:26, WEB:27, SPORE:28, EGG:29,
  TUNNEL_WALL:35,  // ant-excavated clay — persistent, never re-dug, marks tunnel edges
  // New reproductive types
  SEED:30,         // plant seed — falls, germinates on surface
  QUEEN_SPIDER:31, // spider queen — sessile, spawns workers
  QUEEN_MITE:32,   // mite queen — sessile, spawns workers
  QUEEN_TERMITE:36,// termite queen — sessile, spawns worker termites, fed by workers
  FROGSTONE:33,    // large stationary predator — sun-powered tongue, eats nearby creatures
  // Classic sand elements
  LAVA:40, STONE:41, STEAM:42, ICE:43, SMOKE:44,
  WOOD:45, ASH:46, ACID:47, GUNPOWDER:48, SALT:49,
  // Fridge
  FRIDGE_WALL:50,
  CLOUD:51,       // water spout — floats, spawns water droplets, recharges from moisture
  BLOOM_CLOUD:52, // incendiary substance — water contact triggers fire blooms
  BLOOM_FIRE:53,  // floating fireball launched by bloom cloud
  PROG_CLOUD:54,  // programmable cloud — emits any chosen element at set rate
  WEATHER_STATION:55, // programmable weather controller
  PROG_VOID:56,   // programmable void — destroys any chosen element on contact
  OXYGEN:57,       // released by plants — rises, flammable at high concentration
  // Pharmacy drugs
  LUCID:60,        // Mutagen + Ice → fractal wave visual
  CHROMADUST:61,   // Mutagen + Water → rainbow jumping
  CRANK:62,        // Gold Sand + Fire → fire explosion
  VENOM_BREW:63,   // Acid + Spore → poison
  PHEROMONE:64,    // Detritus + Oil → swarming
  CALCIFIER:65,    // Salt + Stone → armor + slow
  SPORE_BOMB:66,   // Fungi + Gunpowder → explode on death
  GIGANTISM:67,    // Lava + Ice → double HP/damage
  // Conway's Game of Life machines
  MACHINE:70,      // live GoL cell
  MACHINE_DEAD:71, // recently-died GoL cell (fades out)
  // New substances & creatures
  JELLY:72,        // wiggly solid — falls slowly, wobbles, worms burrow through
  WORM:73,         // snake-like creature — burrows jelly, eats ants/spiders
  // HighLife bacteria (2×2 pixel scale)
  BACTERIA:74,
  BACTERIA_DEAD:75,
  CUSTOM_BASE:100, // custom lab creatures start at 100+
};

// Fridge zones — {x1,y1,x2,y2} bounding boxes; mutagen inside = frozen
let fridgeZones=[];
function inFridge(x,y){ return fridgeZones.some(f=>x>f.x1&&x<f.x2&&y>f.y1&&y<f.y2); }

// Abiotic density table (higher=heavier)
const DENSITY={
  [T.WALL]:999,[T.FRIDGE_WALL]:999,[T.CLAY_HARD]:999,
  [T.GOLD_SAND]:8,[T.SAND]:5,[T.CLAY]:5,[T.DETRITUS]:4,
  [T.WHITE_SAND]:3,[T.WATER]:2,[T.MUTAGEN]:2,[T.OIL]:1,
  [T.FIRE]:0.5,[T.SPORE]:1,
  [T.PLANT]:3,[T.ANT]:3,[T.TERMITE]:3,[T.QUEEN]:5,[T.SPIDER]:3,[T.FUNGI]:2,[T.TUNNEL_WALL]:3,
  [T.MITE]:2,[T.PLANT_WALL]:999,[T.WEB]:1,[T.EGG]:3,
  [T.SEED]:4,[T.QUEEN_SPIDER]:5,[T.QUEEN_MITE]:5,[T.QUEEN_TERMITE]:5,[T.HUNTSMAN]:3,[T.QUEEN_HUNTSMAN]:5,
  // Classic elements
  [T.LAVA]:8,[T.STONE]:7,[T.STEAM]:0.1,[T.ICE]:3,
  [T.SMOKE]:0.15,[T.OXYGEN]:0.12,[T.WOOD]:4,[T.ASH]:0.8,[T.ACID]:2.1,[T.GUNPOWDER]:4.5,[T.SALT]:3,
  // Pharmacy drugs (liquid-like)
  [T.LUCID]:2,[T.CHROMADUST]:2,[T.CRANK]:2,
  [T.JELLY]:4.5,
};

// Worm entity tracking — each worm is a snake-like chain of grid cells
const worms = new Map(); // wid → {cells:[[x,y],...], dir:[dx,dy], energy, tick}
let wormNextId = 0;
function killWorm(wid){
  const w=worms.get(wid);if(!w)return;
  for(const[cx,cy]of w.cells)grid[idx(cx,cy)]=null;
  worms.delete(wid);
}

// ================================================================
//  PHARMACY — crafting recipes (1 A + 1 B → 1 C, 100% on contact)
// ================================================================
const RECIPES={};
function recipeKey(a,b){return a<b?a+'-'+b:b+'-'+a;}
RECIPES[recipeKey(T.MUTAGEN,T.WATER)]     ={product:T.CHROMADUST,ttl:350};
RECIPES[recipeKey(T.MUTAGEN,T.ICE)]       ={product:T.LUCID,ttl:300};
RECIPES[recipeKey(T.GOLD_SAND,T.FIRE)]    ={product:T.CRANK,ttl:250};

const CRAFT_ELIGIBLE=new Set([
  T.GOLD_SAND,T.FIRE,T.MUTAGEN,T.WATER,T.ICE
]);

function tryCraft(x,y,p){
  if(!CRAFT_ELIGIBLE.has(p.t))return false;
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);if(!np)continue;
    const key=recipeKey(p.t,np.t);
    const recipe=RECIPES[key];
    if(!recipe)continue;
    // Consume both, produce drug at this cell
    if(np.g)popDecr(np); // if consuming a creature (e.g. fungi)
    grid[idx(nx,ny)]=null;
    grid[idx(x,y)]={t:recipe.product,age:0,ttl:recipe.ttl};
    return true;
  }
  return false;
}

function getDens(p){
  if(!p) return 0;
  if(p.g) return 2+(p.g[0]/255)*4; // genome density gene maps 2–6
  return DENSITY[p.t]??2;
}

// ================================================================
//  GENOME SYSTEM — kingdom-specific genes
//  Each kingdom has 6 genes (0–255) named for their role.
//  Genes mutate during reproduction; drift > threshold = new strain.
// ================================================================

// Gene indices are the same across kingdoms but mean different things
// [0] size/density   [1] speed/mobility  [2] hunger/appetite
// [3] aggression     [4] resilience      [5] reproduction_rate

const GENE_NAMES=[
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
  ['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'],
];

// Kingdom-specific default genome ranges (min,max per gene)
const GENOME_DEFAULTS = {
  [T.PLANT]:   [[80,140],[10,40], [60,100],[0,30],  [100,180],[80,150]],
  [T.ANT]:     [[60,100],[120,200],[100,180],[80,150],[80,140],[100,180]],
  [T.QUEEN]:   [[100,160],[20,60],[80,140],[40,80],  [140,220],[180,255]],
  [T.SPIDER]:  [[80,140],[100,180],[80,160],[160,230],[120,200],[120,220]],
  [T.FUNGI]:   [[40,80], [10,40], [100,180],[20,60], [80,160],[120,200]],
  [T.MITE]:    [[40,80], [160,230],[120,200],[60,120],[60,120],[140,220]],
  [T.TERMITE]:       [[60,100],[120,200],[100,180],[80,150],[80,140],[100,180]],
  [T.QUEEN_TERMITE]: [[100,160],[20,60],[80,140],[40,80],[140,220],[180,255]],
  [T.QUEEN_SPIDER]:  [[80,140],[100,180],[80,160],[160,230],[120,200],[120,220]],
  [T.HUNTSMAN]:      [[80,140],[100,180],[80,160],[160,230],[120,200],[40,100]],
  [T.QUEEN_HUNTSMAN]:[[80,140],[100,180],[80,160],[160,230],[120,200],[120,220]],
  [T.QUEEN_MITE]:   [[40,80],[160,230],[120,200],[60,120],[60,120],[140,220]],
};

// ================================================================
//  SISTER SPECIES — dramatic speciation events
// ================================================================
const SPECIATION_CHANCE=0.025; // 2.5% per reproduction
const VARIANT_INHERIT=0.70;   // 70% offspring inherit variant
const VARIANT_POOL={
  [T.ANT]:[
    {name:'Tunnel-Master',traits:['fast_dig'],hueShift:160,desc:'Digs through clay 3x faster'},
    {name:'Forager',traits:['fast_eat'],hueShift:80,desc:'Eats plants twice as aggressively'},
    {name:'Tank Ant',traits:['tank'],hueShift:200,desc:'Double HP but moves slower'},
    {name:'Acid-Walker',traits:['acid_immune'],hueShift:120,desc:'Immune to acid \u2014 walks through acid pools'},
    {name:'Aquatic Ant',traits:['aquatic'],hueShift:240,desc:'Can survive in water without drowning'},
    {name:'Fire-Runner',traits:['fire_immune'],hueShift:280,desc:'Immune to fire and lava damage'},
    {name:'Jumper Ant',traits:['jumper'],hueShift:60,desc:'Teleports short distances erratically'},
  ],
  [T.SPIDER]:[
    {name:'Ambusher',traits:['ambush'],hueShift:100,desc:'Only strikes when prey is within 2 cells \u2014 instant kill'},
    {name:'Web-Master',traits:['web_boost'],hueShift:180,desc:'Produces web 3x faster, creating dense networks'},
    {name:'Venomous',traits:['venom'],hueShift:260,desc:'Single bite kills any creature instantly'},
    {name:'Acrobat',traits:['fast'],hueShift:70,desc:'Moves 3x faster but has half HP'},
    {name:'Pack-Hunter',traits:['pack'],hueShift:320,desc:'Doubles damage when another spider is adjacent'},
  ],
  [T.HUNTSMAN]:[
    {name:'Ambusher',traits:['ambush'],hueShift:100,desc:'Only strikes when prey is within 2 cells'},
    {name:'Web-Spinner',traits:['web_boost'],hueShift:180,desc:'Spins web 3x faster'},
    {name:'Venomous',traits:['venom'],hueShift:260,desc:'Single bite kills any creature instantly'},
    {name:'Acrobat',traits:['fast'],hueShift:70,desc:'Moves faster but has half HP'},
    {name:'Pack-Hunter',traits:['pack'],hueShift:320,desc:'Doubles damage when another huntsman is adjacent'},
  ],
  [T.TERMITE]:[
    {name:'Wood-Borer',traits:['fast_eat_wood'],hueShift:90,desc:'Consumes wood 3x faster'},
    {name:'Mound-Builder',traits:['clay_trail'],hueShift:200,desc:'Leaves clay behind when moving'},
    {name:'Soldier',traits:['fighter'],hueShift:300,desc:'Double HP, attacks spiders on contact'},
    {name:'Fungus-Farmer',traits:['fungus_friend'],hueShift:150,desc:'Never eats fungi \u2014 fungi grow near it'},
  ],
  [T.MITE]:[
    {name:'Ice-Skater',traits:['ice_boost'],hueShift:220,desc:'Moves 3x faster on ice surfaces'},
    {name:'Acid-Mite',traits:['acid_trail'],hueShift:110,desc:'Leaves acid trail as it moves'},
    {name:'Swarmer',traits:['fast_repro'],hueShift:60,desc:'Reproduces 3x faster but half HP'},
  ],
  [T.FUNGI]:[
    {name:'Bioluminescent',traits:['biolum'],hueShift:180,desc:'Glows in dark, immune to light damage'},
    {name:'Parasitic',traits:['parasite'],hueShift:300,desc:'Drains HP from adjacent creatures'},
    {name:'Explosive',traits:['explode'],hueShift:80,desc:'Bursts into spores on death'},
  ],
  [T.PLANT]:[
    {name:'Thorny',traits:['thorns'],hueShift:280,desc:'Damages creatures that eat it'},
    {name:'Rapid-Growth',traits:['fast_grow'],hueShift:60,desc:'Grows 3x faster, spreads aggressively'},
    {name:'Deep-Root',traits:['deep_root'],hueShift:180,desc:'Grows downward into sand and clay'},
  ],
};
// Maps worker type → queen type for speciation promotions
const WORKER_QUEEN_MAP={
  [T.ANT]:T.QUEEN,[T.TERMITE]:T.QUEEN_TERMITE,
  [T.SPIDER]:T.QUEEN_SPIDER,[T.MITE]:T.QUEEN_MITE,
  [T.HUNTSMAN]:T.QUEEN_HUNTSMAN,
};
function trySpeciate(type,parentGenome,parentVariant){
  if(mutRate===0)return null; // mutations disabled — no speciation or variant inheritance
  // Existing variant: inherit or revert
  if(parentVariant){return Math.random()<VARIANT_INHERIT?{...parentVariant}:null;}
  // Check for new speciation
  if(Math.random()>=SPECIATION_CHANCE)return null;
  const pool=VARIANT_POOL[type];if(!pool||!pool.length)return null;
  const template=pool[Math.floor(Math.random()*pool.length)];
  // Dramatically shift 2-3 genes
  const ng=[...parentGenome];
  const geneCount=2+Math.floor(Math.random()*2);
  const shifted=new Set();
  for(let i=0;i<geneCount;i++){let g;do{g=Math.floor(Math.random()*6);}while(shifted.has(g));shifted.add(g);
    ng[g]=Math.min(255,Math.max(0,ng[g]+Math.floor((Math.random()-0.5)*200)));}
  const hue=(KINGDOM_HUE[type]+template.hueShift)%360;
  return{name:template.name,traits:[...template.traits],color:{hue,sat:90},desc:template.desc,genome:ng};
}

// Helper: spawn offspring with speciation check. Returns the new agent.
function spawnWithSpeciation(type,parentGenome,parentSid,parentVariant,extra={}){
  const ng=mutateGenome(parentGenome,mutRate);
  const variant=trySpeciate(type,ng,parentVariant);
  const finalGenome=variant?.genome||ng;
  // Brand-new species → spawn as a queen so the colony can establish itself
  const isNewSpecies=variant&&!parentVariant;
  const spawnType=isNewSpecies&&WORKER_QUEEN_MAP[type]?WORKER_QUEEN_MAP[type]:type;
  const a=agentWithStrain(spawnType,finalGenome,parentSid,{energy:180,...extra});
  if(variant)a.variant=variant;
  // HP modifiers for variant traits
  if(variant?.traits?.includes('tank'))a.hp=Math.min(255,a.hp*2);
  if(variant?.traits?.includes('fast')||variant?.traits?.includes('swarmer')||variant?.traits?.includes('fast_repro'))a.hp=Math.floor(a.hp*0.5);
  // Announce NEW speciation (not inherited)
  if(isNewSpecies)showEventToast('\u{1F9EC} NEW SPECIES',`${variant.name} ${K_NAMES[type]||'creature'} evolved \u2014 ${variant.desc}`);
  return a;
}

function randomGenome(type){
  const def=GENOME_DEFAULTS[type]||[[0,255],[0,255],[0,255],[0,255],[0,255],[0,255]];
  return def.map(([lo,hi])=>Math.floor(lo+Math.random()*(hi-lo)));
}

function mutateGenome(g,rate){
  const ng=[...g];
  for(let i=0;i<6;i++){
    if(Math.random()<rate)
      ng[i]=Math.min(255,Math.max(0,ng[i]+Math.floor((Math.random()-0.5)*80))); // ±40 magnitude
  }
  return ng;
}

// Strain registry — unique genome strains per kingdom
const strainRegistry=new Map(); // strainId -> {type,genome,color,pop,born,peak}
let nextStrain=1;
let mutRate=0; // starts off — user controls via slider
let entropyRate=0; // chaos event frequency — 0 (off) to 1 (max)

function registerStrain(type,genome,parentId=null){
  const id=nextStrain++;
  const hue=KINGDOM_HUE[type]+(genome[3]/255)*40-20; // aggression shifts hue
  const [r,g2,b]=hslToRgb(hue,60+genome[4]/255*30,30+genome[5]/255*20);
  strainRegistry.set(id,{id,type,genome:[...genome],color:`rgb(${r},${g2},${b})`,pop:0,born:tickCount,peak:0,parentId});
  return id;
}

// Kingdom base hues (for color generation)
const KINGDOM_HUE={[T.PLANT]:130,[T.ANT]:100,[T.TERMITE]:175,[T.QUEEN]:35,[T.QUEEN_TERMITE]:170,[T.SPIDER]:0,[T.FUNGI]:280,[T.MITE]:40,[T.QUEEN_SPIDER]:285,[T.QUEEN_MITE]:50,[T.HUNTSMAN]:22,[T.QUEEN_HUNTSMAN]:38};

// ================================================================
//  WORLD STATE
// ================================================================
let grid=new Array(W*H).fill(null);
let lightGrid=new Float32Array(W*H);
let pheroGrid=new Float32Array(W*H); // ant pheromone trail
let sunX=Math.floor(W*0.5),sunY=10,sunActive=true;
let tickCount=0;
let imageData,pixels;

// Population counters (fast, updated each tick)
const POP={[T.PLANT]:0,[T.ANT]:0,[T.TERMITE]:0,[T.QUEEN]:0,[T.QUEEN_TERMITE]:0,[T.SPIDER]:0,[T.FUNGI]:0,[T.MITE]:0,[T.QUEEN_SPIDER]:0,[T.QUEEN_MITE]:0,[T.HUNTSMAN]:0,[T.QUEEN_HUNTSMAN]:0};
const POP_MAX={[T.PLANT]:800,[T.ANT]:300,[T.TERMITE]:250,[T.QUEEN]:100,[T.QUEEN_TERMITE]:40,[T.SPIDER]:120,[T.FUNGI]:300,[T.MITE]:200,[T.QUEEN_SPIDER]:25,[T.QUEEN_MITE]:10,[T.HUNTSMAN]:120,[T.QUEEN_HUNTSMAN]:25};

// Population history — sampled every 100 ticks, max 80 samples kept
const POP_HISTORY={
  [T.PLANT]:[],[T.ANT]:[],[T.TERMITE]:[],[T.QUEEN]:[],[T.QUEEN_TERMITE]:[],
  [T.SPIDER]:[],[T.FUNGI]:[],[T.MITE]:[],
  [T.QUEEN_SPIDER]:[],[T.QUEEN_MITE]:[],
  [T.HUNTSMAN]:[],[T.QUEEN_HUNTSMAN]:[],
};
const POP_GRAPH_MAX=80; // max samples retained
let lastPopSample=0;

let currentTool='draw',currentEl='sand',brushSize=3,isDown=false,speedMult=1;

// ================================================================
//  MACHINE (CONWAY'S GAME OF LIFE) STATE
// ================================================================
let machineRunning=false;
let machineGeneration=0;
let machineBestGen=0;
let lastMachinePlacedTime=0;       // Date.now() at last placement; 0=never placed
const MACHINE_TICK_RATE=24;
const MACHINE_ACTIVATION_DELAY=5000; // ms after last placement before auto-start
let machineUniX0=0,machineUniY0=0,machineUniX1=W-1,machineUniY1=H-1;
try{machineBestGen=parseInt(localStorage.getItem('ant1_machineBest')||'0');}catch(e){}

// ================================================================
//  BACTERIA (HIGHLIFE — B36/S23) STATE
// ================================================================
let bacteriaRunning=false;
let bacteriaGeneration=0;
let bacteriaBestGen=0;
let lastBacteriaPlacedTime=0;
let bacteriaWaveTick=0;            // increments each sim tick — drives color wave
const BACTERIA_TICK_RATE=28;
const BACTERIA_ACTIVATION_DELAY=5000;
let bacteriaUniX0=0,bacteriaUniY0=0,bacteriaUniX1=W-1,bacteriaUniY1=H-1;
try{bacteriaBestGen=parseInt(localStorage.getItem('ant1_bacteriaBest')||'0');}catch(e){}

// ================================================================
//  HELPERS
// ================================================================
const idx=(x,y)=>y*W+x;
const inB=(x,y)=>x>=0&&x<W&&y>=0&&y<H;
const get=(x,y)=>inB(x,y)?grid[idx(x,y)]:null;

function isImmovable(t){ return t===T.WALL||t===T.FRIDGE_WALL||t===T.WOOD||t===T.WEATHER_STATION; }
// Stone is immovable only once age>1 (after it has had one tick to fall)
function isStoneStatic(p){ return p&&p.t===T.STONE&&(p.settled||0)>=3; }
function isWall(t){ return t===T.WALL||t===T.FRIDGE_WALL||t===T.CLAY_HARD; }
function isSolid(t){
  return t===T.WALL||t===T.FRIDGE_WALL||t===T.CLAY_HARD||
         t===T.SAND||t===T.GOLD_SAND||t===T.WHITE_SAND||t===T.CLAY||
         t===T.QUEEN;
}

function set(x,y,v){
  if(!inB(x,y))return;
  const c=grid[idx(x,y)];
  if(c&&isWall(c.t))return; // walls immovable except erase
  grid[idx(x,y)]=v;
}

function erase(x,y){ if(inB(x,y)) grid[idx(x,y)]=null; }

function swap(x1,y1,x2,y2){
  const a=grid[idx(x1,y1)],b=grid[idx(x2,y2)];
  if((a&&(isWall(a.t)||isImmovable(a.t)||isStoneStatic(a)))||
     (b&&(isWall(b.t)||isImmovable(b.t)||isStoneStatic(b))))return;
  grid[idx(x1,y1)]=b; grid[idx(x2,y2)]=a;
}

// ── Pre-computed neighbor/cardinal lookup tables ──────────────────────────
// Built once at startup. getNeighbors/getCardinals now return stable cached
// arrays instead of allocating new ones every call — eliminates the biggest
// source of GC pressure in the hot simulation path.
const _NBR  = new Array(W*H); // 8-direction coords [[nx,ny],...]
const _CARD = new Array(W*H); // 4-direction coords [[nx,ny],...]
const _CX   = new Uint8Array(W*H); // pre-computed x for each linear index
const _CY   = new Uint8Array(W*H); // pre-computed y for each linear index
(()=>{
  const D8=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  const D4=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const i=y*W+x; _CX[i]=x; _CY[i]=y;
    const n8=[],n4=[];
    for(const[dx,dy] of D8){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<W&&ny>=0&&ny<H)n8.push([nx,ny]);}
    for(const[dx,dy] of D4){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<W&&ny>=0&&ny<H)n4.push([nx,ny]);}
    _NBR[i]=n8; _CARD[i]=n4;
  }
})();
function getNeighbors(x,y){ return _NBR[y*W+x]; }
function getCardinals(x,y){ return _CARD[y*W+x]; }
function getPerp(){ return gv.y!==0?[{x:-1,y:0},{x:1,y:0}]:[{x:0,y:-1},{x:0,y:1}]; }

// Particle factories
function abiotic(t,extra={}){ return {t,age:0,...extra}; }
function agent(type,genome,extra={}){
  const sid=registerStrain(type,genome);
  const p={t:type,g:genome,sid,age:0,hp:100,energy:150,...extra};
  return p;
}
function agentWithStrain(type,genome,sid,extra={}){
  return {t:type,g:genome,sid,age:0,hp:100,energy:150,...extra};
}

function hslToRgb(h,s,l){
  h=((h%360)+360)%360;s/=100;l/=100;
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  let r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}
  else if(h<180){g=c;b=x;}else if(h<240){g=x;b=c;}
  else if(h<300){r=x;b=c;}else{r=c;b=x;}
  return[Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
}

// Kingdom display colors (stable, not genome-derived for UI)
const K_COLORS={
  [T.PLANT]:'#1a6b1a',[T.ANT]:'#39ff14',[T.TERMITE]:'#20b8a8',[T.QUEEN]:'#ff8800',[T.QUEEN_TERMITE]:'#40d8c0',
  [T.SPIDER]:'#505058',[T.FUNGI]:'#8c32c8',[T.MITE]:'#ff8c00',
  [T.QUEEN_SPIDER]:'#cc44ff',[T.QUEEN_MITE]:'#ffdd44',
  [T.HUNTSMAN]:'#c86020',[T.QUEEN_HUNTSMAN]:'#e89000',
};
const K_NAMES={
  [T.PLANT]:'PLANT',[T.ANT]:'ANT',[T.TERMITE]:'TERMITE',[T.QUEEN]:'QUEEN',[T.QUEEN_TERMITE]:'Q.TERMITE',
  [T.SPIDER]:'SPIDER',[T.FUNGI]:'FUNGI',[T.MITE]:'MITE',
  [T.QUEEN_SPIDER]:'Q.SPIDER',[T.QUEEN_MITE]:'Q.MITE',
  [T.HUNTSMAN]:'HUNTSMAN',[T.QUEEN_HUNTSMAN]:'Q.HUNTSMAN',
};

// ================================================================
//  PHYSICS — density-based gravity, works with gravVec
// ================================================================
function tryFall(x,y,p){
  const nx=x+gv.x,ny=y+gv.y;
  if(!inB(nx,ny))return false;
  const below=get(nx,ny);
  if(below&&isWall(below.t))return false;
  const myD=getDens(p),belD=getDens(below);
  if(!below||belD<myD-0.3){
    swap(x,y,nx,ny);return true;
  }
  const perp=getPerp();
  const order=Math.random()<0.5?perp:[...perp].reverse();
  for(const d of order){const dx=nx+d.x,dy=ny+d.y;if(inB(dx,dy)&&!get(dx,dy)){swap(x,y,dx,dy);return true;}}
  return false;
}
function tryFlow(x,y){
  const nx=x+gv.x,ny=y+gv.y;
  if(inB(nx,ny)&&!get(nx,ny)){swap(x,y,nx,ny);return;}
  const perp=getPerp();
  const order=Math.random()<0.5?perp:[...perp].reverse();
  for(const d of order){const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy)){swap(x,y,sx,sy);return;}}
}
function tryRise(x,y){
  const nx=x-gv.x,ny=y-gv.y;
  if(inB(nx,ny)&&!get(nx,ny)){swap(x,y,nx,ny);return;}
  const perp=getPerp();
  const order=Math.random()<0.5?perp:[...perp].reverse();
  for(const d of order){const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy)){swap(x,y,sx,sy);return;}}
}

// ================================================================
//  LIGHT SYSTEM
// ================================================================
function updateLight(){
  for(let i=0;i<lightGrid.length;i++)lightGrid[i]*=0.85;
  if(!sunActive)return;
  for(let r=0;r<60;r++){
    const a=(r/60)*Math.PI*2;
    let rx=sunX,ry=sunY,dx=Math.cos(a),dy=Math.sin(a),iv=1.0;
    for(let s=0;s<100;s++){
      rx+=dx;ry+=dy;
      const gx=Math.floor(rx),gy=Math.floor(ry);
      if(!inB(gx,gy))break;
      const i=idx(gx,gy);
      lightGrid[i]=Math.max(lightGrid[i],iv);
      const p=grid[i];
      if(p){if(isWall(p.t))break;iv*=0.82;if(iv<0.04)break;}
    }
  }
}

// ================================================================
//  KINGDOM BEHAVIORS
// ================================================================

// ---- PLANT ----
// Plants grow toward sun, harden into woody stems. Nearly immortal — only
// ants eating them or fire destroys them. Plants kill mites on contact (root toxins).
// Gene [1]=growth_rate [5]=branching
// ---- PLANT ----
// Persistent, photosynthetic. Grows toward sun. Edible by ants, burns in fire.
// Never hardens — stays as soft plant cells. Kills mites on contact.
// ================================================================
//  ELEMENTAL INTERACTION SYSTEM
// ================================================================
function nearType(x,y,...types){
  for(const[nx,ny] of getNeighbors(x,y)){const t=get(nx,ny)?.t;if(t!==undefined&&types.includes(t))return true;}
  return false;
}
function hazardPenalty(nx,ny,resilience){
  const t=get(nx,ny)?.t;
  if(t===T.FIRE||t===T.LAVA)return -8+resilience*4;
  if(t===T.ACID)return -6+resilience*3;
  if(t===T.SALT)return -2;
  if(t===T.WATER)return -1;
  return 0;
}
function envDamage(x,y,p){
  const res=p.g[4]/255;let hp=0,en=0;
  const evt=p.variant?.traits||[];
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);if(!np)continue;
    switch(np.t){
      case T.FIRE:if(!evt.includes('fire_immune'))hp-=Math.max(2,15*(1-res*0.7));break;
      case T.LAVA:if(!evt.includes('fire_immune'))hp-=Math.max(4,25*(1-res*0.6));break;
      case T.ACID:if(!evt.includes('acid_immune')){hp-=Math.max(3,20*(1-res*0.5));en-=5;}break;
      case T.SALT:hp-=Math.max(1,4*(1-res*0.4));en-=3;break;
      case T.SMOKE:en-=0.5;break;
      case T.ICE:en-=1;break;
      case T.GOLD_SAND:en+=0.5;break;
      case T.ASH:en+=0.2;break;
      case T.STEAM:hp-=0.5;break;
    }
  }
  p.hp+=hp;p.energy=Math.min(255,p.energy+en);
  if(p.hp<=0||p.energy<=0){
    // Ants can "stand on" a plant cell by carrying it as an underlay (p.under).
    // If the ant dies while on a plant, restore the plant.
    if(p.t===T.ANT&&p.under?.t===T.PLANT){set(x,y,p.under);p.under=null;}
    else set(x,y,null);
    popDecr(p);
    return true;
  }
  return false;
}

// ================================================================
//  BUFF SYSTEM — temporary drug effects on creatures
// ================================================================
function applyBuff(p,type,ttl){
  if(type==='gigantism'&&p.buff?.type!=='gigantism') p.hp=Math.min(255,p.hp*2);
  p.buff={type,ttl};
}
function processBuff(p){
  if(!p.buff)return;
  p.buff.ttl--;
  if(p.buff.ttl<=0){
    if(p.buff.type==='gigantism')p.hp=Math.min(100,p.hp);
    p.buff=null;return;
  }
  switch(p.buff.type){
    case 'nectar':p.hp=Math.min(255,p.hp+0.5);p.energy=Math.min(255,p.energy+0.3);break;
    case 'venom':p.hp-=0.5;p.energy-=0.3;break;
    case 'gigantism':p.energy-=0.15;break;
  }
}

// ================================================================
//  PLANT
// ================================================================
function stepPlant(x,y,p){
  p.age++;
  processBuff(p);
  const lv=lightGrid[idx(x,y)];
  const smokeNear=nearType(x,y,T.SMOKE);
  p.energy+=((smokeNear?lv*0.4:lv)*3)+0.3;
  p.energy=Math.min(255,p.energy);
  // Photosynthesis releases oxygen — more light = more oxygen
  if(lv>0.3&&Math.random()<lv*0.012){
    const ox=x-gv.x,oy=y-gv.y;
    if(inB(ox,oy)&&!get(ox,oy)) grid[idx(ox,oy)]={t:T.OXYGEN,age:0,ttl:80+Math.floor(Math.random()*80)};
  }
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}
  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.ACID||np.t===T.LAVA){p.hp-=40;if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.SALT)p.energy=Math.max(0,p.energy-1);
    if(np.t===T.ASH)p.energy=Math.min(255,p.energy+0.5);
    if(np.t===T.MITE&&Math.random()<0.12){set(nx,ny,null);popDecr(np);}
    // Plants choke out spider web — convert adjacent web into plant cells (fast takeover)
    if(np.t===T.WEB&&Math.random()<0.20&&POP[T.PLANT]<POP_MAX[T.PLANT]){
      const ng=mutateGenome(p.g,mutRate);
      grid[idx(nx,ny)]=agentWithStrain(T.PLANT,ng,p.sid,{energy:100,growTimer:Math.floor(15+Math.random()*20)});
      popIncr({t:T.PLANT,sid:p.sid});
    }
  }
  // Water turbo-charges plant: consumes adjacent water cells, spends them for growth
  const waterNear=nearType(x,y,T.WATER);
  let waterBoost=0;
  if(waterNear){
    p.energy=Math.min(255,p.energy+2.5);
    waterBoost=6.0; // grow timer drains ~6x faster near water
    // Consume adjacent water (plant drinks it)
    for(const[wx,wy] of nbrs){
      if(get(wx,wy)?.t===T.WATER&&Math.random()<0.15){grid[idx(wx,wy)]=null;break;}
    }
  }
  // Seeds drop SIDEWAYS or DOWN only — never into the growth direction above the plant
  // This prevents seeds from blocking the plant's upward spread
  const seedChance=waterNear?0.008:0.002;
  if(p.age>20&&Math.random()<seedChance){
    const perp=getPerp(); // perpendicular to gravity = sideways
    const dropCandidates=[];
    // Sideways cells
    for(const d of perp){
      const sx=x+d.x,sy=y+d.y;
      if(inB(sx,sy)&&!get(sx,sy)) dropCandidates.push([sx,sy]);
    }
    // Below cell (gravity direction) — seeds fall away from growth
    const downX=x+gv.x,downY=y+gv.y;
    if(inB(downX,downY)&&!get(downX,downY)) dropCandidates.push([downX,downY]);
    if(dropCandidates.length){
      const[sx,sy]=dropCandidates[Math.floor(Math.random()*dropCandidates.length)];
      grid[idx(sx,sy)]={t:T.SEED,age:0,g:[...p.g],sid:p.sid,energy:100};
    }
  }
  if(p.growTimer===undefined)p.growTimer=Math.floor(8+Math.random()*12); // start fast
  p.growTimer-=(1+waterBoost);
  if(nearType(x,y,T.ICE))p.growTimer+=1;
  if(p.growTimer<=0&&POP[T.PLANT]<POP_MAX[T.PLANT]){
    p.growTimer=Math.floor(15+Math.random()*25+(1-p.g[1]/255)*20); // fast reset
    let dx=0,dy=-1;
    if(sunActive){const ddx=sunX-x,ddy=sunY-y,len=Math.sqrt(ddx*ddx+ddy*ddy)||1;dx=ddx/len;dy=ddy/len;}
    const primary=[Math.round(dx),Math.round(dy)];const candidates=[primary];
    if(primary[0]!==0&&primary[1]!==0)candidates.push([primary[0],0],[0,primary[1]]);
    else if(primary[0]===0){candidates.push([-1,primary[1]],[1,primary[1]]);if(Math.random()<p.g[5]/255*0.3)candidates.push([-1,0],[1,0]);}
    else candidates.push([primary[0],-1],[primary[0],1]);
    for(const[cdx,cdy] of candidates){
      const tx=x+cdx,ty=y+cdy;if(!inB(tx,ty))continue;
      const target=get(tx,ty);
      // Can grow into: empty, ash, detritus, seeds, or web (plants overgrow spider web)
      if(target&&target.t!==T.ASH&&target.t!==T.DETRITUS&&target.t!==T.SEED&&target.t!==T.WEB)continue;
      const ng=mutateGenome(p.g,mutRate);
      grid[idx(tx,ty)]=agentWithStrain(T.PLANT,ng,p.sid,{energy:120,growTimer:Math.floor(12+Math.random()*18)});
      popIncr({t:T.PLANT,sid:p.sid});maybeMutateStrain(p,ng);
      // Growth releases oxygen — emitted upward (against gravity)
      const ox=x-gv.x,oy=y-gv.y;
      if(inB(ox,oy)&&!get(ox,oy)) grid[idx(ox,oy)]={t:T.OXYGEN,age:0,ttl:100+Math.floor(Math.random()*60)};
      break;
    }
  }
}
// stepPlantWall is a no-op

// ================================================================
//  ANT — terrain-smart tunneler, alpha system, pheromone following
// ================================================================
// ALPHA PROMOTION: ants with aggression>0.7, energy>200, near clay, no other alpha
// within radius 15 become alpha tunnelers. Alpha ants dig harder, faster, deeper,
// and leave pheromone trails. Non-alpha ants score pheromone in movement candidates.
function stepAnt(x,y,p){
  p.age++;
  processBuff(p);
  // Chromadust: erratic jumping
  if(p.buff?.type==='chromadust'&&Math.random()<0.3){const jx=x+Math.floor((Math.random()-0.5)*6),jy=y+Math.floor((Math.random()-0.5)*6);if(inB(jx,jy)&&!get(jx,jy)){swap(x,y,jx,jy);return;}}
  // Spore bomb: explode on death
  if((p.hp<=0||p.energy<=0)&&p.buff?.type==='sporebomb'){for(let i=0;i<6+Math.floor(Math.random()*3);i++){const sx2=x+Math.floor((Math.random()-0.5)*6),sy2=y+Math.floor((Math.random()-0.5)*6);if(inB(sx2,sy2)&&!get(sx2,sy2))grid[idx(sx2,sy2)]={t:T.SPORE,age:0,g:p.g,sid:p.sid||0,energy:60};}}
  const speed=p.g[1]/255,appetite=p.g[2]/255,aggression=p.g[3]/255;
  const vt=p.variant?.traits||[];
  const plantConsumeChance=vt.includes('fast_eat')?0.25:0.10;
  p.energy-=vt.includes('tank')?0.06:(0.10+speed*0.10);
  if(p.hp<=0||p.energy<=0){
    if(p.under?.t===T.PLANT){set(x,y,p.under);p.under=null;}
    else set(x,y,abiotic(T.DETRITUS));
    popDecr(p);
    return;
  }
  if(envDamage(x,y,p))return;
  if(p.qcd===undefined) p.qcd=0;
  if(p.qcd>0) p.qcd--;
  const gx2=gv.x,gy2=gv.y,bx=x+gx2,by=y+gy2;
  const belowCell=inB(bx,by)?grid[idx(bx,by)]:null;
  if(belowCell?.t===T.WATER&&!vt.includes('aquatic')){
    p.hp-=(5*(1-p.g[4]/255*0.5));
    if(p.hp<=0){
      if(p.under?.t===T.PLANT){set(x,y,p.under);p.under=null;}
      else set(x,y,abiotic(T.DETRITUS));
      popDecr(p);
      return;
    }
  }
  const touchingSolid=getNeighbors(x,y).some(([nx,ny])=>{const np=grid[idx(nx,ny)];return np&&isSolid(np.t);});
  const nbrs=getNeighbors(x,y);
  p.cellX=x;p.cellY=y;

  function isPlantLikeCell(cell){return cell?.t===T.PLANT||(cell?.t===T.ANT&&cell.under?.t===T.PLANT);}
  function isPlantLikeAt(cx,cy){return isPlantLikeCell(get(cx,cy));}
  function plantNeighborCount(cx,cy){let n=0;for(const[nx,ny] of getNeighbors(cx,cy))if(isPlantLikeAt(nx,ny))n++;return n;}
  function isPlantInterior(cx,cy){return plantNeighborCount(cx,cy)>=6;}
  function isPlantEdgeCell(cx,cy){return plantNeighborCount(cx,cy)<=5;}

  function moveAntTo(nx,ny,{consumePlant=false}={}){
    const originI=idx(x,y),destI=idx(nx,ny);
    const dest=grid[destI];
    grid[originI]=(p.under?.t===T.PLANT)?p.under:null;
    p.under=null;
    if(dest?.t===T.PLANT){if(consumePlant){popDecr(dest);}else{p.under=dest;}}
    grid[destI]=p;
    p.cellX=nx;p.cellY=ny;
  }

  if(!touchingSolid&&!belowCell){if(inB(bx,by)){if(!get(bx,by)){moveAntTo(bx,by);return;}}}

  function tryDropQueenFromPlantEat(atX,atY){
    if(p.qcd>0)return false;
    if(POP[T.QUEEN]>=POP_MAX[T.QUEEN])return false;
    if(p.energy<115)return false;
    const ng=mutateGenome(p.g,mutRate);
    const localNbrs=getNeighbors(atX,atY);
    const spawnCells=localNbrs.filter(([nx,ny])=>{const t=get(nx,ny);return(!t)||t.t===T.PLANT;});
    if(spawnCells.length){
      const[qx,qy]=spawnCells[Math.floor(Math.random()*spawnCells.length)];
      const prev=get(qx,qy);if(prev?.t===T.PLANT)popDecr(prev);
      grid[idx(qx,qy)]=agentWithStrain(T.QUEEN,ng,p.sid,{energy:200});
      popIncr({t:T.QUEEN,sid:p.sid});p.energy=Math.max(0,p.energy-75);p.qcd=60;return true;
    }
    const cell=grid[idx(atX,atY)];
    if(cell===p){if(p.under?.t===T.PLANT){popDecr(p.under);p.under=null;}
      grid[idx(atX,atY)]=agentWithStrain(T.QUEEN,ng,p.sid,{energy:200});popDecr(p);popIncr({t:T.QUEEN,sid:p.sid});p.qcd=60;return true;}
    return false;
  }

  // EATING
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.FUNGI&&Math.random()<appetite*0.25){p.energy+=30;popDecr(np);grid[idx(nx,ny)]=null;break;}
    if(np.t===T.MITE&&Math.random()<appetite*0.5){p.energy+=15;grid[idx(nx,ny)]=null;break;}
    if((np.t===T.DETRITUS||np.t===T.ASH)&&Math.random()<appetite*0.15){p.energy+=8;grid[idx(nx,ny)]=null;break;}
  }
  p.energy=Math.min(255,p.energy);

  // OFFENSE
  if(aggression>0.85&&Math.random()<aggression*0.015){
    for(const[nx,ny] of nbrs){const np=get(nx,ny);
      if(np?.t===T.SPIDER||np?.t===T.QUEEN_SPIDER||np?.t===T.HUNTSMAN||np?.t===T.QUEEN_HUNTSMAN){for(const[sx,sy] of nbrs){const sp=get(sx,sy);if(sp?.t===T.SALT||sp?.t===T.ASH||sp?.t===T.GUNPOWDER){np.hp-=sp.t===T.GUNPOWDER?50:12;grid[idx(sx,sy)]=null;break;}}break;}
    }
  }

  // ALPHA PROMOTION
  if(!p.alpha&&aggression>0.9&&p.energy>220){
    const nearClay=nbrs.some(([nx,ny])=>get(nx,ny)?.t===T.CLAY_HARD);
    if(nearClay){let alphaFound=false;for(let dy=-15;dy<=15&&!alphaFound;dy++)for(let dx=-15;dx<=15&&!alphaFound;dx++){const tp=get(x+dx,y+dy);if(tp?.t===T.ANT&&tp.alpha)alphaFound=true;}
      if(!alphaFound&&Math.random()<0.04)p.alpha=true;}
  }
  if(p.alpha&&p.energy<80)p.alpha=false;

  // PHEROMONE DEPOSIT
  {let wallCount=0;for(const[nx,ny] of nbrs){const ap=get(nx,ny);if(ap&&(isWall(ap.t)||ap.t===T.CLAY_HARD))wallCount++;}
    if(p.alpha){pheroGrid[idx(x,y)]=Math.min(1,pheroGrid[idx(x,y)]+0.35);p.energy-=0.05;}
    else if(wallCount>=2){pheroGrid[idx(x,y)]=Math.min(1,pheroGrid[idx(x,y)]+0.12);}}

  // MOVEMENT
  if(Math.random()<0.55+speed*0.35){
    const moveCandidates=[],digCandidates=[];
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);
      const isOpen=(!np)||np.t===T.PLANT||np.t===T.DETRITUS;
      if(isOpen){
        let wc=0;for(const[ax,ay] of getNeighbors(nx,ny)){if(ax===x&&ay===y)continue;const ap=get(ax,ay);if(ap&&(isWall(ap.t)||ap.t===T.CLAY_HARD))wc++;}
        let score=wc>=3?20:wc>=1?8:1;
        if(np?.t===T.PLANT){score+=10;const ddx=nx-x,ddy=ny-y;const isUp=(ddx===-gx2&&ddy===-gy2);if(isPlantEdgeCell(nx,ny))score+=isUp?26:14;else score+=isUp?10:2;}
        const phero=pheroGrid[idx(nx,ny)];
        if(!p.alpha){if(phero>0.05)score+=Math.floor(phero*30);}else{if(phero<0.15)score+=3;}
        score+=hazardPenalty(nx,ny,p.g[4]/255);
        const db=get(nx+gx2,ny+gy2);if(db?.t===T.WATER||db?.t===T.LAVA||db?.t===T.ACID)score-=5;
        moveCandidates.push([nx,ny,score]);
      } else if(np.t===T.CLAY_HARD&&!np.reinforced){
        const ddx=nx-x,ddy=ny-y;const isDown=(ddx===gx2&&ddy===gy2),isUp=(ddx===-gx2&&ddy===-gy2);
        const weight=p.alpha?(isDown?1:isUp?8:5):(isDown?1:isUp?4:2);
        digCandidates.push([nx,ny,weight]);
      }
    }
    lucidConstrainMoves(moveCandidates,x,y);
    if(moveCandidates.length){
      moveCandidates.sort((a,b)=>b[2]-a[2]);const best=moveCandidates[0][2];
      const bestCells=moveCandidates.filter(c=>c[2]===best);
      const[mx,my]=bestCells[Math.floor(Math.random()*bestCells.length)];
      const trulySurrounded=best<=1&&moveCandidates.every(c=>c[2]<=1);
      if(trulySurrounded&&digCandidates.length){/*fall through*/}
      else{
        const dest=get(mx,my);
        if(dest?.t===T.PLANT){const interior=isPlantInterior(mx,my);const edgeNibbleChance=0.02;const eatChance=interior?plantConsumeChance:edgeNibbleChance;
          if(Math.random()<eatChance){p.energy+=40;moveAntTo(mx,my,{consumePlant:true});tryDropQueenFromPlantEat(mx,my);}else{moveAntTo(mx,my,{consumePlant:false});}}
        else if(dest?.t===T.DETRITUS){grid[idx(mx,my)]=null;moveAntTo(mx,my);}
        else{if(!dest){moveAntTo(mx,my);}}
        return;
      }
    }
    if(!moveCandidates.length||(moveCandidates[0][2]<=1&&moveCandidates.every(c=>c[2]<=1)&&digCandidates.length)){
      if(digCandidates.length){const total=digCandidates.reduce((s,c)=>s+c[2],0);let r2=Math.random()*total;
        let chosen=digCandidates[digCandidates.length-1];for(const c of digCandidates){r2-=c[2];if(r2<=0){chosen=c;break;}}
        const digChance=(p.alpha?0.50:0.18)*(vt.includes('fast_dig')?3:1);
        if(Math.random()<digChance){grid[idx(chosen[0],chosen[1])]=null;pheroGrid[idx(chosen[0],chosen[1])]=p.alpha?1.0:0.6;pheroGrid[idx(x,y)]=Math.min(1,pheroGrid[idx(x,y)]+0.4);}
      }
    }
  }

  // JUMPER trait: occasional teleport 3-5 cells away
  if(vt.includes('jumper')&&Math.random()<0.08){
    const jdist=3+Math.floor(Math.random()*3);
    const jangle=Math.random()*Math.PI*2;
    const jx=x+Math.round(Math.cos(jangle)*jdist),jy=y+Math.round(Math.sin(jangle)*jdist);
    if(jx>=0&&jx<W&&jy>=0&&jy<H&&!grid[idx(jx,jy)]){
      const originI=idx(x,y);grid[originI]=(p.under?.t===T.PLANT)?p.under:null;p.under=null;grid[idx(jx,jy)]=p;p.cellX=jx;p.cellY=jy;
    }
  }

  // Workers tithe to adjacent queen
  const axN=getNeighbors(p.cellX,p.cellY);
  if(p.energy>160){for(const[nx,ny] of axN){const np=get(nx,ny);if(np?.t===T.QUEEN&&p.energy>80){np.energy=Math.min(255,np.energy+25);p.energy-=20;break;}}}
}

// ================================================================
//  TERMITE — aggressive chewer (former ant behavior)
//  Chews through clay destructively. No tunnel architecture.
// ================================================================
function stepTermite(x,y,p){
  p.age++;
  processBuff(p);
  if(p.buff?.type==='chromadust'&&Math.random()<0.3){const jx=x+Math.floor((Math.random()-0.5)*6),jy=y+Math.floor((Math.random()-0.5)*6);if(inB(jx,jy)&&!get(jx,jy)){swap(x,y,jx,jy);return;}}
  const tvt=p.variant?.traits||[];
  const speed=p.g[1]/255,appetite=p.g[2]/255,aggression=p.g[3]/255;
  const woodConsumeChance=tvt.includes('fast_eat_wood')?0.20:0.10;
  if(p.qcd>0)p.qcd--;
  // Drop a termite queen near (atX,atY) — called on wood eat and spontaneously
  function tryDropQueenTermite(atX,atY){
    if(p.qcd>0)return false;
    if(POP[T.QUEEN_TERMITE]>=POP_MAX[T.QUEEN_TERMITE])return false;
    if(p.energy<110)return false;
    // No existing queen within radius 5
    for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){if(get(atX+dx,atY+dy)?.t===T.QUEEN_TERMITE)return false;}
    // Allow empty cells OR wood cells as spawn targets (termites live inside wood)
    const spawnCells=getNeighbors(atX,atY).filter(([nx,ny])=>{const c=get(nx,ny);return !c||c.t===T.WOOD;});
    if(!spawnCells.length)return false;
    const[qx,qy]=spawnCells[Math.floor(Math.random()*spawnCells.length)];
    const prev=get(qx,qy);if(prev?.t===T.WOOD)grid[idx(qx,qy)]=null;
    const ng=mutateGenome(p.g,mutRate);
    const q=agentWithStrain(T.QUEEN_TERMITE,ng,p.sid,{energy:180});
    if(p.variant)q.variant=p.variant;
    grid[idx(qx,qy)]=q;popIncr(q);
    p.energy=Math.max(0,p.energy-75);p.qcd=60;
    return true;
  }
  p.energy-=0.10+speed*0.10;
  if(p.hp<=0||p.energy<=0){
    if(p.under?.t===T.WOOD){set(x,y,p.under);p.under=null;}
    else set(x,y,abiotic(T.DETRITUS));
    popDecr(p);return;
  }
  if(envDamage(x,y,p))return;
  const gx2=gv.x,gy2=gv.y,bx=x+gx2,by=y+gy2;
  const belowCell=inB(bx,by)?grid[idx(bx,by)]:null;
  if(belowCell?.t===T.WATER){p.hp-=(5*(1-p.g[4]/255*0.5));if(p.hp<=0){
    if(p.under?.t===T.WOOD){set(x,y,p.under);p.under=null;}else set(x,y,abiotic(T.DETRITUS));popDecr(p);return;}}
  const touchingSolid=getNeighbors(x,y).some(([nx,ny])=>{const np=grid[idx(nx,ny)];return np&&(isSolid(np.t)||np.t===T.WOOD);});
  const nbrs=getNeighbors(x,y);
  p.cellX=x;p.cellY=y;

  // Movement helper — like ant's moveAntTo but for wood underlay
  function moveTermiteTo(nx,ny,{consumeWood=false}={}){
    const originI=idx(x,y),destI=idx(nx,ny);
    const dest=grid[destI];
    grid[originI]=(p.under?.t===T.WOOD)?p.under:null;
    p.under=null;
    if(dest?.t===T.WOOD){if(consumeWood){/* wood consumed, becomes nothing */}else{p.under=dest;}}
    grid[destI]=p;p.cellX=nx;p.cellY=ny;
  }

  // Gravity
  if(!touchingSolid&&!belowCell){if(inB(bx,by)){if(!get(bx,by)){moveTermiteTo(bx,by);return;}}}

  // EATING — termites gnaw adjacent wood directly (main energy source) + other food
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    // Wood: primary food source — gnaw from adjacent cells each tick
    if(np.t===T.WOOD&&Math.random()<appetite*0.18){
      p.energy+=30;
      // Small chance to fully consume the wood cell (leave space)
      if(Math.random()<0.05){grid[idx(nx,ny)]=null;}
      tryDropQueenTermite(nx,ny);
      break;
    }
    // Termites traverse plant but do NOT eat it
    if(np.t===T.FUNGI&&!tvt.includes('fungus_friend')&&Math.random()<appetite*0.25){p.energy+=30;popDecr(np);grid[idx(nx,ny)]=null;break;}
    if(np.t===T.MITE&&Math.random()<appetite*0.5){p.energy+=15;grid[idx(nx,ny)]=null;break;}
    if((np.t===T.DETRITUS||np.t===T.ASH)&&Math.random()<appetite*0.15){p.energy+=8;grid[idx(nx,ny)]=null;break;}
  }
  p.energy=Math.min(255,p.energy);
  // Spontaneous queen drop when well-fed — like ants/spiders, not only tied to wood movement
  if(p.energy>=130&&p.qcd===0&&Math.random()<0.018&&POP[T.QUEEN_TERMITE]<POP_MAX[T.QUEEN_TERMITE]){
    tryDropQueenTermite(x,y);
  }

  // fighter trait: termites attack adjacent spiders
  if(tvt.includes('fighter')&&Math.random()<0.08){
    for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np?.t===T.SPIDER||np?.t===T.QUEEN_SPIDER||np?.t===T.HUNTSMAN||np?.t===T.QUEEN_HUNTSMAN){np.hp-=12;p.energy+=5;if(np.hp<=0){grid[idx(nx,ny)]=null;popDecr(np);}break;}}
  }

  // Pheromone — inside wood structures or near walls
  {let wc=0;for(const[nx,ny] of nbrs){const ap=get(nx,ny);if(ap&&(isWall(ap.t)||ap.t===T.CLAY_HARD||ap.t===T.WOOD))wc++;}
    if(wc>=2)pheroGrid[idx(x,y)]=Math.min(1,pheroGrid[idx(x,y)]+0.12);}

  // MOVEMENT — traverse wood like ants traverse plants
  if(Math.random()<0.55+speed*0.35){
    const moveCandidates=[],digCandidates=[];
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);
      const isOpen=(!np)||np.t===T.WOOD||np.t===T.DETRITUS||np.t===T.PLANT||np.t===T.PLANT_WALL;
      if(isOpen){
        let score=1;let wc=0;
        for(const[ax,ay] of getNeighbors(nx,ny)){if(ax===x&&ay===y)continue;const ap=get(ax,ay);if(ap&&(isWall(ap.t)||ap.t===T.CLAY_HARD||ap.t===T.WOOD))wc++;}
        if(wc>=3)score+=15;else if(wc>=1)score+=5;
        if(np?.t===T.WOOD)score+=12; // prefer traversing wood
        const phero=pheroGrid[idx(nx,ny)];if(phero>0.05)score+=Math.floor(phero*20);
        score+=hazardPenalty(nx,ny,p.g[4]/255);
        moveCandidates.push([nx,ny,score]);
      } else if(np.t===T.CLAY_HARD&&!np.reinforced){
        const ddx=nx-x,ddy=ny-y;
        const weight=(ddx===gx2&&ddy===gy2)?3:5;
        digCandidates.push([nx,ny,weight]);
      }
    }
    lucidConstrainMoves(moveCandidates,x,y);
    if(moveCandidates.length){
      moveCandidates.sort((a,b)=>b[2]-a[2]);
      const best=moveCandidates[0][2];
      const bestCells=moveCandidates.filter(c=>c[2]===best);
      const[mx,my]=bestCells[Math.floor(Math.random()*bestCells.length)];
      if(best<=1&&digCandidates.length){/*fall through*/}
      else{
        const dest=get(mx,my);
        if(dest?.t===T.WOOD){
          // Traverse or consume wood
          if(Math.random()<woodConsumeChance){
            p.energy+=20;moveTermiteTo(mx,my,{consumeWood:true});
            tryDropQueenTermite(mx,my);
          } else{moveTermiteTo(mx,my,{consumeWood:false});tryDropQueenTermite(mx,my);}
        } else if(dest?.t===T.PLANT||dest?.t===T.PLANT_WALL){
          // Traverse plant without eating it
          swap(x,y,mx,my);
        } else {
          if(dest?.t===T.DETRITUS)grid[idx(mx,my)]=null;
          moveTermiteTo(mx,my);
        }
        // clay_trail: leave clay behind after moving
        if(tvt.includes('clay_trail')&&Math.random()<0.12&&!grid[idx(x,y)]){grid[idx(x,y)]={t:T.CLAY,age:0};}
        return;
      }
    }
    if(digCandidates.length&&Math.random()<0.3){
      const total=digCandidates.reduce((s,c)=>s+c[2],0);let r2=Math.random()*total;
      let chosen=digCandidates[digCandidates.length-1];
      for(const c of digCandidates){r2-=c[2];if(r2<=0){chosen=c;break;}}
      grid[idx(chosen[0],chosen[1])]=null;
      pheroGrid[idx(chosen[0],chosen[1])]=0.5;
    }
  }
  // Feed queen termite if adjacent
  if(p.energy>140){
    for(const[nx,ny] of nbrs){const np=get(nx,ny);
      if(np?.t===T.QUEEN_TERMITE&&p.energy>80){np.energy=Math.min(255,np.energy+20);p.energy-=15;break;}}
  }
}

// ================================================================
//  QUEEN TERMITE — sessile, spawns worker termites, fed by workers
// ================================================================
function stepQueenTermite(x,y,p){
  p.age++;
  processBuff(p);
  // Queen termites absorb energy from surrounding wood — must be near wood or fed by workers
  const qnbrs=getNeighbors(x,y);
  let woodBonus=0;
  for(const[nx,ny] of qnbrs){if(get(nx,ny)?.t===T.WOOD)woodBonus+=0.25;}
  p.energy=Math.min(255,p.energy+woodBonus);
  p.energy-=0.14; // starves without wood adjacency or worker feeding
  if(p.energy<=0){p.hp-=2;}
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}
  if(envDamage(x,y,p))return;

  // Spawn workers — into empty OR wood cells (termites burrow directly through wood)
  const spawnRate=18+Math.floor((1-p.g[5]/255)*50);
  if(p.age%spawnRate===0&&p.energy>60&&POP[T.TERMITE]<POP_MAX[T.TERMITE]){
    const spawnTargets=qnbrs.filter(([nx,ny])=>{const c=get(nx,ny);return !c||c.t===T.WOOD;});
    if(spawnTargets.length){
      // Spawn up to 2 workers if high energy and well-fed
      const count=(p.energy>180&&spawnTargets.length>=2)?2:1;
      for(let i=0;i<count&&POP[T.TERMITE]<POP_MAX[T.TERMITE];i++){
        const[nx,ny]=spawnTargets[Math.floor(Math.random()*spawnTargets.length)];
        if(get(nx,ny)?.t!==T.WOOD&&get(nx,ny)!==null)continue; // may have been filled
        const woodUnder=get(nx,ny);
        const spawned=spawnWithSpeciation(T.TERMITE,p.g,p.sid,p.variant,{energy:120});
        if(woodUnder?.t===T.WOOD)spawned.under=woodUnder;
        set(nx,ny,spawned);popIncr(spawned);
        p.energy-=30;
      }
    }
  }
}

// ================================================================
//  QUEEN ANT
// ================================================================
function stepQueen(x,y,p){
  p.age++;
  processBuff(p);
  const lv=lightGrid[idx(x,y)];
  // Queens get minimal energy from light — they depend on ants bringing food
  p.energy=Math.min(255,p.energy+lv*0.3+0.1);
  p.energy-=0.15; // slow drain — starves without ant feeding
  if(p.energy<=0){p.hp-=2;} // starvation damages hp
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}
  if(envDamage(x,y,p))return;
  const spawnRate=20+Math.floor((1-p.g[5]/255)*80);
  if(p.age%spawnRate===0&&POP[T.ANT]<POP_MAX[T.ANT]){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){const[nx,ny]=nbrs[Math.floor(Math.random()*nbrs.length)];const spawned=spawnWithSpeciation(T.ANT,p.g,p.sid,p.variant,{energy:120});set(nx,ny,spawned);popIncr(spawned);}
  }
  if(p.age%100===0&&Math.random()<0.4){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){const[ex,ey]=nbrs[Math.floor(Math.random()*nbrs.length)];set(ex,ey,{t:T.EGG,age:0,g:p.g,sid:p.sid,hp:20,energy:80});}
  }
}

// ================================================================
//  EGG
// ================================================================
function stepEgg(x,y,p){
  p.age++;
  for(const[nx,ny] of getNeighbors(x,y)){const np=get(nx,ny);if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.ACID){grid[idx(x,y)]=null;return;}}
  if(p.age>60){const ng=mutateGenome(p.g,mutRate);set(x,y,agentWithStrain(T.ANT,ng,p.sid,{energy:100}));popIncr({t:T.ANT,sid:p.sid});}
}

// ================================================================
//  SPIDER — acid-spit offense, surface tension water-walking
// ================================================================
function isSpiderSurface(t){return t===T.WALL||t===T.PLANT_WALL||t===T.FRIDGE_WALL||t===T.WEB||t===T.WOOD||t===T.ICE||t===T.STONE;}

function stepSpider(x,y,p){
  p.age++;
  processBuff(p);
  if(p.buff?.type==='chromadust'&&Math.random()<0.3){const jx=x+Math.floor((Math.random()-0.5)*6),jy=y+Math.floor((Math.random()-0.5)*6);if(inB(jx,jy)&&!get(jx,jy)){swap(x,y,jx,jy);return;}}
  const svt=p.variant?.traits||[];
  const aggression=p.g[3]/255,resilience=p.g[4]/255;
  p.energy-=0.05+p.g[1]/255*0.06;
  if(envDamage(x,y,p))return;
  const gx2=gv.x,gy2=gv.y,bx=x+gx2,by=y+gy2;
  const belowCell=inB(bx,by)?grid[idx(bx,by)]:null;

  // Spider movement helper — handles wood/web underlay like ant+plant
  function moveSpiderTo(nx,ny){
    const originI=idx(x,y),destI=idx(nx,ny);
    const dest=grid[destI];
    grid[originI]=(p.under?.t===T.WOOD)?p.under:null;
    p.under=null;
    if(dest?.t===T.WOOD){p.under=dest;}
    else if(dest?.t===T.WEB||dest?.t===T.DETRITUS){/* consume, don't store */}
    grid[destI]=p; x=nx; y=ny;
  }

  // Gravity — spider requires a valid surface (web/wall/wood/stone/ice) or water to stand on.
  // If it lands on open ground (sand/clay/etc) it falls through empty space below it,
  // and drains HP rapidly if truly stuck — preventing ground pooling.
  const onSurface=belowCell&&(isSpiderSurface(belowCell.t)||belowCell.t===T.WATER);
  const canCling=getCardinals(x,y).some(([nx,ny])=>{const np=get(nx,ny);return np&&isSpiderSurface(np.t);});
  if(!onSurface&&!canCling){
    // Try to fall into empty space
    if(inB(bx,by)&&!get(bx,by)){moveSpiderTo(bx,by);return;}
    // Stuck on non-surface ground (sand, clay…) — bleed out
    p.hp-=6;
    if(p.hp<=0){set(x,y,null);popDecr(p);return;}
  }
  const nbrs=getNeighbors(x,y);

  // Lay web — prefer cells that expand the network (not already surrounded by web)
  if(Math.random()<(0.08+p.g[5]/255*0.12)*(svt.includes('web_boost')?1.8:1)){
    const wc=nbrs.filter(([nx,ny])=>!get(nx,ny)&&!nearType(nx,ny,T.ACID,T.LAVA));
    if(wc.length){
      // Prefer frontier cells (fewer existing web neighbors = more expansion)
      const scored=wc.map(([nx,ny])=>{
        const adjWeb=getNeighbors(nx,ny).filter(([ax,ay])=>get(ax,ay)?.t===T.WEB).length;
        return[nx,ny,6-adjWeb]; // fewer web neighbors → higher score (expand outward)
      });
      scored.sort((a,b)=>b[2]-a[2]);
      const[wx,wy]=scored[0];
      grid[idx(wx,wy)]={t:T.WEB,age:0,ttl:450+Math.floor(Math.random()*150)};
    }
  }

  // A cell is valid for spider movement only if it IS web, or is empty/detritus
  // directly adjacent to existing web. No exceptions — spiders never walk open ground.
  function onWebNetwork(nx,ny){
    const np=get(nx,ny);
    if(np?.t===T.WEB)return true;
    if(!np||np.t===T.DETRITUS)
      return getNeighbors(nx,ny).some(([ax,ay])=>get(ax,ay)?.t===T.WEB);
    return false;
  }

  const smokeBlind=nearType(x,y,T.SMOKE);
  const radius=smokeBlind?2:(svt.includes('ambush')?2:5+Math.floor(aggression*5));
  let tx2=-1,ty2=-1,bd=999;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const tp=get(x+dx,y+dy);
    if(tp&&(tp.t===T.ANT||tp.t===T.TERMITE||tp.t===T.MITE||tp.t===T.EGG)){const d=Math.abs(dx)+Math.abs(dy);if(d<bd){bd=d;tx2=x+dx;ty2=y+dy;}}
  }
  if(tx2>=0){
    const ddx=Math.sign(tx2-x),ddy=Math.sign(ty2-y),nx=x+ddx,ny=y+ddy,np=get(nx,ny);
    // Fire herding
    if(aggression>0.7&&Math.random()<aggression*0.15){
      const bx2=tx2+ddx,by2=ty2+ddy;const beyond=inB(bx2,by2)?get(bx2,by2):null;
      if(beyond?.t===T.FIRE||beyond?.t===T.LAVA){if(np?.t===T.ANT||np?.t===T.MITE){np.hp-=30;p.energy+=15;}}
    }
    // Step toward prey only along web network (lucid: only if destination is on a wave node)
    if(onWebNetwork(nx,ny)&&(lucidFieldAt(x,y)<0.08||isLucidNode(nx,ny))){moveSpiderTo(nx,ny);}
    // Attack prey that is directly adjacent regardless of web (reach through the gap)
    else if(np?.t===T.ANT||np?.t===T.TERMITE||np?.t===T.MITE||np?.t===T.EGG){
      const packBonus=svt.includes('pack')&&getNeighbors(x,y).some(([ax,ay])=>{const ap=get(ax,ay);return ap?.t===T.SPIDER;})?2:1;
      const dmg=(15+Math.floor(aggression*35))*packBonus;
      if(svt.includes('venom'))np.hp=0;else np.hp-=dmg;
      p.energy+=25;
      if(np.hp<=0){
        grid[idx(nx,ny)]=null;if(np.t===T.ANT||np.t===T.TERMITE||np.t===T.MITE)popDecr(np);
        p.energy+=10;
        if(p.energy>=110&&Math.random()<0.06&&POP[T.QUEEN_SPIDER]<POP_MAX[T.QUEEN_SPIDER]){
          let qNear2=false;
          for(let dy2=-8;dy2<=8&&!qNear2;dy2++)for(let dx2=-8;dx2<=8&&!qNear2;dx2++){if(get(x+dx2,y+dy2)?.t===T.QUEEN_SPIDER)qNear2=true;}
          if(!qNear2){
            const qSpot=getNeighbors(x,y).filter(([qx,qy])=>!get(qx,qy)||get(qx,qy)?.t===T.WEB);
            if(qSpot.length){
              const[qx,qy]=qSpot[Math.floor(Math.random()*qSpot.length)];
              const ng=mutateGenome(p.g,mutRate);
              grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_SPIDER,ng,p.sid,{energy:180});
              popIncr({t:T.QUEEN_SPIDER,sid:p.sid});p.energy-=90;
            }
          }
        }
      }
    }
    // ACID SAC: spit acid ahead toward prey
    if(aggression>0.75&&p.energy>180&&Math.random()<aggression*0.02){
      const midX=x+Math.sign(tx2-x),midY=y+Math.sign(ty2-y);
      if(inB(midX,midY)&&!get(midX,midY)){grid[idx(midX,midY)]={t:T.ACID,age:0,ttl:60};p.energy-=15;}
    }
  } else {
    // No prey — wander along web network only; sit still if no web reachable
    const spiderMoveChance=svt.includes('fast')?0.6:0.4;
    if(Math.random()<spiderMoveChance){
      const scored=nbrs.map(([nx,ny])=>{
        const np=get(nx,ny);
        if(np?.t===T.WEB)return[nx,ny,8+hazardPenalty(nx,ny,resilience)];
        if(!np||np.t===T.DETRITUS){
          if(getNeighbors(nx,ny).some(([ax,ay])=>get(ax,ay)?.t===T.WEB))
            return[nx,ny,3+hazardPenalty(nx,ny,resilience)];
        }
        return null;
      }).filter(Boolean);
      lucidConstrainMoves(scored,x,y);
      scored.sort((a,b)=>b[2]-a[2]);
      const best=scored[0];
      if(best&&best[2]>0)moveSpiderTo(best[0],best[1]);
    }
  }
  for(const[nx,ny] of nbrs){if(get(nx,ny)?.t===T.FUNGI&&Math.random()<0.06){p.hp-=5;break;}}
  // Eat nearby detritus for supplemental energy (scavenging)
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(np?.t===T.DETRITUS&&Math.random()<0.3){p.energy+=12;grid[idx(nx,ny)]=null;break;}
  }
  if(p.energy>=110&&POP[T.QUEEN_SPIDER]<POP_MAX[T.QUEEN_SPIDER]){
    let qNear=false;for(let dy=-8;dy<=8&&!qNear;dy++)for(let dx=-8;dx<=8&&!qNear;dx++){if(get(x+dx,y+dy)?.t===T.QUEEN_SPIDER)qNear=true;}
    if(!qNear&&Math.random()<0.02){
      const on=nbrs.filter(([nx,ny])=>!get(nx,ny));
      if(on.length){const[qx,qy]=on[Math.floor(Math.random()*on.length)];const ng=mutateGenome(p.g,mutRate);grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_SPIDER,ng,p.sid,{energy:180});popIncr({t:T.QUEEN_SPIDER,sid:p.sid});p.energy-=90;}
    }
  }
  if(p.energy>120&&Math.random()<p.g[5]/255*0.006&&POP[T.SPIDER]<POP_MAX[T.SPIDER]){
    const on=nbrs.filter(([nx,ny])=>!get(nx,ny));
    if(on.length){const[nx,ny]=on[Math.floor(Math.random()*on.length)];set(nx,ny,spawnWithSpeciation(T.SPIDER,p.g,p.sid,p.variant,{energy:80}));popIncr({t:T.SPIDER,sid:p.sid});p.energy-=80;}
  }
}

// ================================================================
//  QUEEN SPIDER
// ================================================================

// ================================================================
//  FUNGI — wood rot, moisture boost, salt death, acid spore offense
// ================================================================
function stepFungi(x,y,p){
  p.age++;
  processBuff(p);
  const fvt=p.variant?.traits||[];
  const lv=lightGrid[idx(x,y)],lightSens=p.g[3]/255,spreadSpeed=p.g[1]/255,resilience=p.g[4]/255;
  if(lv>0.6&&!fvt.includes('biolum')){p.hp-=lv*4*lightSens*(1-resilience*0.4);if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
  const nbrs=getNeighbors(x,y);
  let moistureBoost=0;
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.SALT){p.hp-=40;if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.LAVA||np.t===T.ACID){p.hp-=50;if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.WOOD&&Math.random()<spreadSpeed*0.008){grid[idx(nx,ny)]=abiotic(T.DETRITUS);p.energy=Math.min(255,p.energy+15);}
    if((np.t===T.SPIDER||np.t===T.HUNTSMAN)&&Math.random()<p.g[2]/255*0.08){
      const drain=8+Math.floor(p.g[2]/255*12);np.energy=Math.max(0,np.energy-drain);np.hp-=3;p.energy+=drain*0.7;
      if(np.hp<=0){
        set(nx,ny,null);popDecr(np);
        // Spider death feeds a fruiting burst — bloom 3-5 new fungi nearby if well-fed
        if(p.energy>=160&&POP[T.FUNGI]<POP_MAX[T.FUNGI]){
          const richNear=nearType(x,y,T.DETRITUS,T.ASH,T.GOLD_SAND,T.WATER);
          const burstCount=richNear?3+Math.floor(Math.random()*3):1+Math.floor(Math.random()*2);
          const empties=getNeighbors(x,y).filter(([bx2,by2])=>!get(bx2,by2)&&lightGrid[idx(bx2,by2)]<0.4);
          for(let b=0;b<burstCount&&b<empties.length;b++){
            const[bx2,by2]=empties[b];
            const ng=mutateGenome(p.g,mutRate);
            set(bx2,by2,agentWithStrain(T.FUNGI,ng,p.sid,{energy:80}));
            popIncr({t:T.FUNGI,sid:p.sid});
          }
          p.energy-=30;
        }
      }
      break;
    }
    if(np.t===T.ASH)p.energy=Math.min(255,p.energy+2);
    if(np.t===T.GOLD_SAND&&Math.random()<0.04)p.energy=Math.min(255,p.energy+10);
    if(np.t===T.WATER)moistureBoost+=0.015;
  }
  // parasite trait: drain 1 HP from adjacent creatures each tick
  if(fvt.includes('parasite')){
    for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np&&(np.t===T.ANT||np.t===T.TERMITE||np.t===T.MITE||np.t===T.SPIDER||np.t===T.HUNTSMAN)){np.hp-=1;p.energy=Math.min(255,p.energy+1);}}
  }
  if(nearType(x,y,T.ICE)){p.energy=Math.min(255,p.energy+0.1);return;}
  p.energy-=0.04;if(p.energy<=0||p.hp<=0){
    // explode trait: burst spores to 3-5 nearby empty cells on death
    if(fvt.includes('explode')&&POP[T.FUNGI]<POP_MAX[T.FUNGI]){
      const burstCount=3+Math.floor(Math.random()*3);
      const empties=nbrs.filter(([nx,ny])=>!get(nx,ny));
      for(let b=0;b<burstCount&&b<empties.length;b++){
        const[nx,ny]=empties[b];const ng=mutateGenome(p.g,mutRate);
        set(nx,ny,agentWithStrain(T.FUNGI,ng,p.sid,{energy:60}));popIncr({t:T.FUNGI,sid:p.sid});
      }
    }
    set(x,y,null);popDecr(p);return;
  }
  // Network sharing
  for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np?.t===T.FUNGI&&np.energy<p.energy-20){const share=Math.min(5,(p.energy-np.energy)*0.3);p.energy-=share;np.energy+=share;}}
  const spreadChance=spreadSpeed*0.02+moistureBoost;
  if(Math.random()<spreadChance&&POP[T.FUNGI]<POP_MAX[T.FUNGI]){
    const targets=nbrs.filter(([nx,ny])=>{const np=get(nx,ny);if(!np)return lightGrid[idx(nx,ny)]<0.35;return np.t===T.STONE&&Math.random()<0.3;});
    if(targets.length){
      const[nx,ny]=targets[Math.floor(Math.random()*targets.length)];
      if(get(nx,ny)?.t===T.STONE)grid[idx(nx,ny)]=abiotic(T.DETRITUS);
      const ng=mutateGenome(p.g,mutRate);set(nx,ny,agentWithStrain(T.FUNGI,ng,p.sid,{energy:80}));popIncr({t:T.FUNGI,sid:p.sid});
    }
  }
  // ACID SPORE offense
  if(p.g[3]>180&&p.energy>150&&Math.random()<0.003){
    const above=y-gv.y,ax=x-gv.x;
    if(inB(ax,above)&&!get(ax,above)){set(ax,above,{t:T.ACID,age:0,ttl:25});p.energy-=20;}
  }
  if(Math.random()<p.g[5]/255*0.005){const above=y-gv.y,ax=x-gv.x;if(inB(ax,above)&&!get(ax,above))set(ax,above,{t:T.SPORE,age:0,g:p.g,sid:p.sid,energy:60});}
}

// ================================================================
//  SPORE
// ================================================================
function stepSpore(x,y,p){
  tryRise(x,y);p.energy--;
  if(p.energy<=0){
    const np=get(x+gv.x,y+gv.y);
    if(np&&np.t!==T.WALL&&np.t!==T.PLANT_WALL&&lightGrid[idx(x,y)]<0.4&&POP[T.FUNGI]<POP_MAX[T.FUNGI]){
      set(x,y,agentWithStrain(T.FUNGI,mutateGenome(p.g,mutRate),p.sid,{energy:60}));popIncr({t:T.FUNGI,sid:p.sid});
    } else{set(x,y,null);}
  }
}

// ================================================================
//  MITE — ice-skater, salt-tolerant, fire-fleer, salt/acid offense
// ================================================================
function stepMite(x,y,p){
  p.age++;
  processBuff(p);
  if(p.buff?.type==='chromadust'&&Math.random()<0.3){const jx=x+Math.floor((Math.random()-0.5)*6),jy=y+Math.floor((Math.random()-0.5)*6);if(inB(jx,jy)&&!get(jx,jy)){swap(x,y,jx,jy);return;}}
  const mvt=p.variant?.traits||[];
  const speed=p.g[1]/255,aggression=p.g[3]/255,resilience=p.g[4]/255;
  p.energy-=0.1+speed*0.1;
  if(p.hp<=0||p.energy<=0){set(x,y,null);popDecr(p);return;}
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.FIRE||np.t===T.LAVA){p.hp-=Math.max(3,18*(1-resilience*0.6));if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.ACID){p.hp-=Math.max(4,22*(1-resilience*0.5));if(p.hp<=0){set(x,y,null);popDecr(p);return;}}
    if(np.t===T.SALT&&Math.random()<0.08){p.energy=Math.min(255,p.energy+5);grid[idx(nx,ny)]=null;}
  }
  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(np?.t===T.FUNGI&&Math.random()<p.g[2]/255*0.3){
      p.energy+=25;set(nx,ny,null);popDecr(np);
      // Gorging on fungi while well-fed → chance to drop a queen mite
      if(p.energy>=185&&Math.random()<0.05&&POP[T.QUEEN_MITE]<POP_MAX[T.QUEEN_MITE]){
        let qNear2=false;
        for(let dy2=-20;dy2<=20&&!qNear2;dy2++)for(let dx2=-20;dx2<=20&&!qNear2;dx2++){if(get(x+dx2,y+dy2)?.t===T.QUEEN_MITE)qNear2=true;}
        if(!qNear2){
          const qSpot2=getNeighbors(x,y).filter(([qx,qy])=>!get(qx,qy));
          if(qSpot2.length){
            const[qx,qy]=qSpot2[Math.floor(Math.random()*qSpot2.length)];
            const ng=mutateGenome(p.g,mutRate);
            grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_MITE,ng,p.sid,{energy:160});
            popIncr({t:T.QUEEN_MITE,sid:p.sid});p.energy-=100;
          }
        }
      }
      break;
    }
    if(np?.t===T.SPORE&&Math.random()<0.5){p.energy+=8;set(nx,ny,null);break;}
    if(np?.t===T.ASH&&Math.random()<0.15){p.energy+=4;set(nx,ny,null);break;}
    if(np?.t===T.DETRITUS&&Math.random()<0.25){p.energy+=12;set(nx,ny,null);break;} // mites scavenge ant corpses
  }
  p.energy=Math.min(255,p.energy);
  if(aggression>0.6&&Math.random()<aggression*0.04){
    for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np?.t===T.SPIDER||np?.t===T.QUEEN_SPIDER||np?.t===T.HUNTSMAN||np?.t===T.QUEEN_HUNTSMAN){for(const[sx,sy] of nbrs){const sp=get(sx,sy);if(sp?.t===T.SALT||sp?.t===T.ACID){np.hp-=sp.t===T.ACID?20:8;if(sp.t===T.SALT)grid[idx(sx,sy)]=null;break;}}break;}}
  }
  const onIce=nearType(x,y,T.ICE);
  const nearFire=nearType(x,y,T.FIRE,T.LAVA);
  const nearAcid=nearType(x,y,T.ACID);
  if(nearFire||nearAcid){
    const fleeDir=nbrs.filter(([nx,ny])=>{const np=get(nx,ny);if(np&&np.t!==T.FUNGI&&np.t!==T.DETRITUS)return false;return!nearType(nx,ny,T.FIRE,T.LAVA,T.ACID);});
    if(fleeDir.length){const[mx,my]=fleeDir[Math.floor(Math.random()*fleeDir.length)];swap(x,y,mx,my);[x,y]=[mx,my];}
    return;
  }
  const iceStepMult=mvt.includes('ice_boost')?3:1;
  const steps=onIce?(3+Math.floor(speed*2))*iceStepMult:1+Math.floor(speed*1.5);
  for(let s=0;s<steps;s++){
    const dirs=getNeighbors(x,y).filter(([nx,ny])=>{const np=get(nx,ny);if(np&&np.t!==T.FUNGI&&np.t!==T.DETRITUS)return false;const db=get(nx+gv.x,ny+gv.y);return!(db?.t===T.WATER||db?.t===T.ACID);});
    lucidConstrainMoves(dirs,x,y);
    if(!dirs.length)break;const[mx,my]=dirs[Math.floor(Math.random()*dirs.length)];const prevX=x,prevY=y;swap(x,y,mx,my);[x,y]=[mx,my];
    // acid_trail: leave acid at previous position occasionally
    if(mvt.includes('acid_trail')&&Math.random()<0.05&&!grid[idx(prevX,prevY)]){grid[idx(prevX,prevY)]={t:T.ACID,age:0,ttl:30};}
  }
  if(p.energy>=220&&POP[T.QUEEN_MITE]<POP_MAX[T.QUEEN_MITE]){
    let qNear=false;for(let dy=-20;dy<=20&&!qNear;dy++)for(let dx=-20;dx<=20&&!qNear;dx++){if(get(x+dx,y+dy)?.t===T.QUEEN_MITE)qNear=true;}
    if(!qNear&&Math.random()<0.008){const nbrs2=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));if(nbrs2.length){const[qx,qy]=nbrs2[Math.floor(Math.random()*nbrs2.length)];const ng=mutateGenome(p.g,mutRate);grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_MITE,ng,p.sid,{energy:160});popIncr({t:T.QUEEN_MITE,sid:p.sid});p.energy-=100;}}
  }
  if(p.energy>200&&Math.random()<p.g[5]/255*0.015*(mvt.includes('fast_repro')?2:1)&&POP[T.MITE]<POP_MAX[T.MITE]){
    const nbrs2=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs2.length){const[nx,ny]=nbrs2[Math.floor(Math.random()*nbrs2.length)];set(nx,ny,spawnWithSpeciation(T.MITE,p.g,p.sid,p.variant,{energy:80}));popIncr({t:T.MITE,sid:p.sid});p.energy-=60;}
  }
}

// ================================================================
//  QUEEN MITE
// ================================================================
// ---- SEED ----
// Plant seed — falls with gravity until it lands on a solid surface,
// then germinates into a new plant. Carries parent genome.
// ---- SEED ----
// Falls with gravity. Drifts slightly sideways like a real seed.
// Germinates when it rests against any solid surface (sand, wall, clay).
// Seeds can stick to wall surfaces — plants grow from the side too.
function stepSeed(x,y,p){
  p.energy-=0.2; // slower drain so seeds don't die before landing
  if(p.energy<=0){grid[idx(x,y)]=null;return;}

  const bx=x+gv.x, by=y+gv.y;
  const below=inB(bx,by)?grid[idx(bx,by)]:null;

  // Fall straight down — no sideways drift so seeds pile into towers
  if(!below||getDens(below)<2){
    swap(x,y,bx,by);
    return;
  }

  // Landed — germinate immediately on any solid surface (no RNG gate)
  const rootable=getNeighbors(x,y).some(([nx,ny])=>{
    const np=get(nx,ny);
    return np&&(np.t===T.SAND||np.t===T.GOLD_SAND||np.t===T.WHITE_SAND||
                np.t===T.WALL||np.t===T.FRIDGE_WALL||np.t===T.CLAY_HARD||
                np.t===T.CLAY||np.t===T.STONE||np.t===T.DETRITUS||np.t===T.ASH||
                np.t===T.PLANT||np.t===T.PLANT_WALL);
  });

  if(rootable){
    // Always germinate when landed on a valid surface — no population cap gate
    // (natural cap is just available empty cells in the world)
    const ng=mutateGenome(p.g,mutRate);
    grid[idx(x,y)]=agentWithStrain(T.PLANT,ng,p.sid,{energy:140,growTimer:5+Math.floor(Math.random()*10)});
    if(POP[T.PLANT]!==undefined) popIncr({t:T.PLANT,sid:p.sid});
  } else {
    // No rootable surface — keep waiting but die quickly if no energy
    if(p.energy<=5) grid[idx(x,y)]=null;
  }
}

// ================================================================
//  FROGSTONE — stationary dome predator, placed as a stamp
//  A 10×5 cell dome. The HUB cell (bottom-center) runs the logic.
//  Tongue SNAPS out instantly to full range, holds 3 ticks, retracts.
//  Sun proximity = longer range + faster reload.
//  Eats any living creature (g flag) that the tongue tip lands on.
// ================================================================
function stepFrogstone(x,y,p){
  // Only the hub cell (bottom-center of dome) runs logic
  if(!p.isHub) return;

  p.phase=(p.phase||0)+1;
  p.hp=Math.min(255,(p.hp||200)+0.04);

  // Sun power: 0 (far) → 1 (close). Full range at ~1/4 world width
  const dx=sunX-x, dy=sunY-y;
  const sunDist=Math.sqrt(dx*dx+dy*dy)||1;
  // Always at least 0.15 power so frogstone fires even away from sun
  const sunPower=Math.max(0.15,Math.min(1,1-(sunDist/(W*0.45))));
  const tongueRange=Math.floor(6+sunPower*12);  // 7–18 cells
  const reloadTime=Math.max(1,Math.floor((28-sunPower*20)/10));  // 2–8 ticks (10x faster)

  // TONGUE STATE
  // null = idle
  // {tx,ty, hold, maxHold} = tongue extended (visible, killing)
  if(p.tongue){
    // Tongue is extended — hold for maxHold ticks then retract
    p.tongue.hold++;
    if(p.tongue.hold>=p.tongue.maxHold){
      p.tongue=null; // retract
    }
    return;
  }

  // Idle — check reload timer
  if(p.phase%reloadTime!==0) return;

  // Scan for nearest prey within tongueRange
  let bestPrey=null, bestDist=999;
  for(let sy2=-tongueRange;sy2<=tongueRange;sy2++){
    for(let sx2=-tongueRange;sx2<=tongueRange;sx2++){
      const px2=x+sx2, py2=y+sy2;
      if(!inB(px2,py2)) continue;
      const tp=get(px2,py2);
      if(!tp?.g) continue; // must be alive
      if(tp.t===T.FROGSTONE) continue; // don't eat siblings
      // Skip creatures immune to frogstone
      if(tp.customType!==undefined){
        const tdef=customCreatures.get(tp.customType);
        if(tdef&&(tdef.specials||[]).some(s=>s.id==='frogstone_immune')) continue;
      }
      const d=Math.sqrt(sx2*sx2+sy2*sy2);
      if(d<=tongueRange&&d<bestDist){bestDist=d;bestPrey={px:px2,py:py2,tp};}
    }
  }

  if(!bestPrey) return;

  // SNAP tongue — instant, kills prey immediately, stays visible for 4 ticks
  const {px:tx,py:ty,tp}=bestPrey;
  if(POP[tp.t]!==undefined) POP[tp.t]=Math.max(0,(POP[tp.t]||0)-1);
  if(tp.customType!==undefined&&POP[tp.customType]!==undefined)
    POP[tp.customType]=Math.max(0,(POP[tp.customType]||0)-1);
  grid[idx(tx,ty)]=null;
  p.hp=Math.min(255,(p.hp||200)+40);

  // Create visible tongue state (the kill already happened)
  p.tongue={tx, ty, hold:0, maxHold:4, originX:x, originY:y};
}
// Sun-powered, sessile. Spawns worker spiders continuously.
// Immune to fungi. Only dies from direct HP damage (fire, events).
function stepQueenSpider(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)];
  p.energy=Math.min(255,p.energy+lv*2+0.4);
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}

  const spawnRate=12+Math.floor((1-p.g[5]/255)*40);
  if(p.age%spawnRate===0&&POP[T.SPIDER]<POP_MAX[T.SPIDER]){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){
      const[nx,ny]=nbrs[Math.floor(Math.random()*nbrs.length)];
      set(nx,ny,spawnWithSpeciation(T.SPIDER,p.g,p.sid,p.variant,{energy:120}));
      popIncr({t:T.SPIDER,sid:p.sid});
    }
  }
  // Lay web around queen to build starter territory for workers
  if(p.age%12===0&&Math.random()<0.7){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){
      // Lay up to 2 web cells at once to seed a growing network
      const count=Math.min(2,nbrs.length);
      for(let i=0;i<count;i++){
        const[wx,wy]=nbrs[Math.floor(Math.random()*nbrs.length)];
        grid[idx(wx,wy)]={t:T.WEB,age:0,ttl:500+Math.floor(Math.random()*200)};
      }
    }
  }
}

// ================================================================
//  HUNTSMAN — old-style free-roaming spider (pre web-constraint)
// ================================================================
function stepHuntsman(x,y,p){
  p.age++;
  processBuff(p);
  if(p.buff?.type==='chromadust'&&Math.random()<0.3){const jx=x+Math.floor((Math.random()-0.5)*6),jy=y+Math.floor((Math.random()-0.5)*6);if(inB(jx,jy)&&!get(jx,jy)){swap(x,y,jx,jy);return;}}
  const svt=p.variant?.traits||[];
  const aggression=p.g[3]/255,resilience=p.g[4]/255;
  p.energy-=0.05+p.g[1]/255*0.06;
  if(envDamage(x,y,p))return;
  const gx2=gv.x,gy2=gv.y,bx=x+gx2,by=y+gy2;
  const belowCell=inB(bx,by)?grid[idx(bx,by)]:null;

  function moveHuntsmanTo(nx,ny){
    const originI=idx(x,y),destI=idx(nx,ny);
    const dest=grid[destI];
    grid[originI]=(p.under?.t===T.WOOD)?p.under:null;
    p.under=null;
    if(dest?.t===T.WOOD){p.under=dest;}
    else if(dest?.t===T.WEB||dest?.t===T.DETRITUS){/* consume */}
    grid[destI]=p; x=nx; y=ny;
  }

  // Gravity fallthrough when floating free
  const onSurface=belowCell&&(isSpiderSurface(belowCell.t)||belowCell.t===T.WATER);
  const canCling=getCardinals(x,y).some(([nx,ny])=>{const np=get(nx,ny);return np&&isSpiderSurface(np.t);});
  if(!onSurface&&!canCling&&!belowCell){if(inB(bx,by)&&!get(bx,by)){moveHuntsmanTo(bx,by);return;}}
  const nbrs=getNeighbors(x,y);

  // Web-building — OLD style: genome-only base, random placement, 3x web_boost, long TTL 200-350
  if(Math.random()<(p.g[5]/255*0.08)*(svt.includes('web_boost')?3:1)){
    const wc=nbrs.filter(([nx,ny])=>!get(nx,ny)&&!nearType(nx,ny,T.ACID,T.LAVA));
    if(wc.length){
      const[wx,wy]=wc[Math.floor(Math.random()*wc.length)];
      grid[idx(wx,wy)]={t:T.WEB,age:0,ttl:200+Math.floor(Math.random()*150)};
    }
  }

  // Hunting
  const smokeBlind=nearType(x,y,T.SMOKE);
  const radius=smokeBlind?2:(svt.includes('ambush')?2:5+Math.floor(aggression*5));
  let tx2=-1,ty2=-1,bd=999;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    const tp=get(x+dx,y+dy);
    if(tp&&(tp.t===T.ANT||tp.t===T.TERMITE||tp.t===T.MITE||tp.t===T.EGG)){const d=Math.abs(dx)+Math.abs(dy);if(d<bd){bd=d;tx2=x+dx;ty2=y+dy;}}
  }
  if(tx2>=0){
    const ddx=Math.sign(tx2-x),ddy=Math.sign(ty2-y),nx=x+ddx,ny=y+ddy,np=get(nx,ny);
    // Fire herding
    if(aggression>0.7&&Math.random()<aggression*0.15){
      const bx2=tx2+ddx,by2=ty2+ddy;const beyond=inB(bx2,by2)?get(bx2,by2):null;
      if(beyond?.t===T.FIRE||beyond?.t===T.LAVA){if(np?.t===T.ANT||np?.t===T.MITE){np.hp-=30;p.energy+=15;}}
    }
    // FREE-ROAM movement — can step on any open cell, web, wood, or detritus
    // (lucid: only if destination is on a wave node while inside the field)
    if((!np||np.t===T.WEB||np.t===T.WOOD||np.t===T.DETRITUS)&&(lucidFieldAt(x,y)<0.08||isLucidNode(nx,ny))){moveHuntsmanTo(nx,ny);}
    else if(np?.t===T.ANT||np?.t===T.TERMITE||np?.t===T.MITE||np?.t===T.EGG){
      const packBonus=svt.includes('pack')&&getNeighbors(x,y).some(([ax,ay])=>{const ap=get(ax,ay);return ap?.t===T.HUNTSMAN;})?2:1;
      const dmg=(15+Math.floor(aggression*35))*packBonus;
      if(svt.includes('venom'))np.hp=0;else np.hp-=dmg;
      p.energy+=25;
      if(np.hp<=0){
        grid[idx(nx,ny)]=null;if(np.t===T.ANT||np.t===T.TERMITE||np.t===T.MITE)popDecr(np);
        p.energy+=10;
        // OLD: queen drop on kill — energy≥190, 5%, search radius 20
        if(p.energy>=190&&Math.random()<0.05&&POP[T.QUEEN_HUNTSMAN]<POP_MAX[T.QUEEN_HUNTSMAN]){
          let qNear2=false;
          for(let dy2=-20;dy2<=20&&!qNear2;dy2++)for(let dx2=-20;dx2<=20&&!qNear2;dx2++){if(get(x+dx2,y+dy2)?.t===T.QUEEN_HUNTSMAN)qNear2=true;}
          if(!qNear2){
            const qSpot=getNeighbors(x,y).filter(([qx,qy])=>!get(qx,qy)||get(qx,qy)?.t===T.WEB);
            if(qSpot.length){
              const[qx,qy]=qSpot[Math.floor(Math.random()*qSpot.length)];
              const ng=mutateGenome(p.g,mutRate);
              grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_HUNTSMAN,ng,p.sid,{energy:180});
              popIncr({t:T.QUEEN_HUNTSMAN,sid:p.sid});p.energy-=100;
            }
          }
        }
      }
    }
    // Acid spit
    if(aggression>0.75&&p.energy>180&&Math.random()<aggression*0.02){
      const midX=x+Math.sign(tx2-x),midY=y+Math.sign(ty2-y);
      if(inB(midX,midY)&&!get(midX,midY)){grid[idx(midX,midY)]={t:T.ACID,age:0,ttl:60};p.energy-=15;}
    }
  } else {
    // Wander freely — OLD: 15% normal, 45% fast; can walk open ground
    const moveChance=svt.includes('fast')?0.45:0.15;
    if(Math.random()<moveChance){
      const candidates=nbrs.map(([nx,ny])=>{
        const np=get(nx,ny);
        if(np?.t===T.WEB)return[nx,ny,3+hazardPenalty(nx,ny,resilience)];
        if(np?.t===T.WOOD)return[nx,ny,3+hazardPenalty(nx,ny,resilience)];
        if(!np||np.t===T.DETRITUS){
          const adjSurf=getNeighbors(nx,ny).some(([ax,ay])=>{const ap=get(ax,ay);return ap&&isSpiderSurface(ap.t);});
          return[nx,ny,(adjSurf?2:1)+hazardPenalty(nx,ny,resilience)];
        }
        return null;
      }).filter(Boolean);
      lucidConstrainMoves(candidates,x,y);
      candidates.sort((a,b)=>b[2]-a[2]);
      const best=candidates[0];
      if(best&&best[2]>0)moveHuntsmanTo(best[0],best[1]);
    }
  }

  for(const[nx,ny] of nbrs){if(get(nx,ny)?.t===T.FUNGI&&Math.random()<0.06){p.hp-=5;break;}}
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(np?.t===T.DETRITUS&&Math.random()<0.3){p.energy+=12;grid[idx(nx,ny)]=null;break;}
  }
  // OLD idle queen drop: energy≥220, 0.6%, search radius 20
  if(p.energy>=220&&POP[T.QUEEN_HUNTSMAN]<POP_MAX[T.QUEEN_HUNTSMAN]){
    let qNear=false;for(let dy=-20;dy<=20&&!qNear;dy++)for(let dx=-20;dx<=20&&!qNear;dx++){if(get(x+dx,y+dy)?.t===T.QUEEN_HUNTSMAN)qNear=true;}
    if(!qNear&&Math.random()<0.006){
      const on=nbrs.filter(([nx,ny])=>!get(nx,ny));
      if(on.length){const[qx,qy]=on[Math.floor(Math.random()*on.length)];const ng=mutateGenome(p.g,mutRate);grid[idx(qx,qy)]=agentWithStrain(T.QUEEN_HUNTSMAN,ng,p.sid,{energy:180});popIncr({t:T.QUEEN_HUNTSMAN,sid:p.sid});p.energy-=100;}
    }
  }
  // OLD worker bud: energy>220, 0.3%
  if(p.energy>220&&Math.random()<p.g[5]/255*0.003&&POP[T.HUNTSMAN]<POP_MAX[T.HUNTSMAN]){
    const on=nbrs.filter(([nx,ny])=>!get(nx,ny));
    if(on.length){const[nx,ny]=on[Math.floor(Math.random()*on.length)];set(nx,ny,spawnWithSpeciation(T.HUNTSMAN,p.g,p.sid,p.variant,{energy:80}));popIncr({t:T.HUNTSMAN,sid:p.sid});p.energy-=80;}
  }
}

// ---- QUEEN HUNTSMAN ---- OLD queen spider behavior (slow spawn, minimal web)
function stepQueenHuntsman(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)];
  p.energy=Math.min(255,p.energy+lv*2+0.4);
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}

  // OLD: spawn rate 25-115 ticks (slower than current queen spider's 12-52)
  const spawnRate=25+Math.floor((1-p.g[5]/255)*90);
  if(p.age%spawnRate===0&&POP[T.HUNTSMAN]<POP_MAX[T.HUNTSMAN]){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){
      const[nx,ny]=nbrs[Math.floor(Math.random()*nbrs.length)];
      set(nx,ny,spawnWithSpeciation(T.HUNTSMAN,p.g,p.sid,p.variant,{energy:120}));
      popIncr({t:T.HUNTSMAN,sid:p.sid});
    }
  }
  // OLD: every 40 ticks, 40% chance, 1 web cell, long TTL 300
  if(p.age%40===0&&Math.random()<0.4){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){
      const[wx,wy]=nbrs[Math.floor(Math.random()*nbrs.length)];
      grid[idx(wx,wy)]={t:T.WEB,age:0,ttl:300};
    }
  }
}

// ---- QUEEN MITE ----
// Sun-powered, sessile. Spawns worker mites continuously.
// Only dies from direct HP damage.
function stepQueenMite(x,y,p){
  p.age++;
  const lv=lightGrid[idx(x,y)];
  p.energy=Math.min(255,p.energy+lv*2+0.4);
  if(p.hp<=0){set(x,y,null);popDecr(p);return;}

  const spawnRate=20+Math.floor((1-p.g[5]/255)*80);
  if(p.age%spawnRate===0&&POP[T.MITE]<POP_MAX[T.MITE]){
    const nbrs=getNeighbors(x,y).filter(([nx,ny])=>!get(nx,ny));
    if(nbrs.length){
      const[nx,ny]=nbrs[Math.floor(Math.random()*nbrs.length)];
      set(nx,ny,spawnWithSpeciation(T.MITE,p.g,p.sid,p.variant,{energy:100}));
      popIncr({t:T.MITE,sid:p.sid});
    }
  }
}

// ---- WEB decay ----
function stepWeb(x,y,p){
  p.ttl--;
  if(p.ttl<=0)set(x,y,null);
}

// ================================================================
//  CLASSIC SAND ELEMENTS
// ================================================================

function stepLava(x,y,p){
  p.ttl=(p.ttl||500)-1;
  if(p.ttl<=0){grid[idx(x,y)]={t:T.STONE,age:0};return;}
  const ux=x-gv.x,uy=y-gv.y;
  if(Math.random()<0.06&&inB(ux,uy)&&!get(ux,uy))
    grid[idx(ux,uy)]={t:T.SMOKE,age:0,ttl:40+Math.floor(Math.random()*60)};
  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.WATER){grid[idx(x,y)]={t:T.STONE,age:0};grid[idx(nx,ny)]={t:T.STEAM,age:0,ttl:80};return;}
    if(np.t===T.ICE){grid[idx(nx,ny)]={t:T.WATER,age:0};continue;}
    const fl={[T.WOOD]:0.9,[T.PLANT]:0.8,[T.FUNGI]:0.7,[T.OIL]:0.95,[T.DETRITUS]:0.5,[T.WEB]:0.9,[T.GUNPOWDER]:1.0}[np.t]??0;
    if(fl>0&&Math.random()<fl*0.25){
      if(np.t===T.GUNPOWDER){
        for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){if(dx*dx+dy*dy<=16){const ex=nx+dx,ey=ny+dy;if(inB(ex,ey)&&!isImmovable(get(ex,ey)?.t))grid[idx(ex,ey)]=Math.random()<0.4?{t:T.FIRE,age:0,ttl:20}:null;}}
      } else if(np.g){np.hp-=30;if(np.hp<=0){popDecr(np);grid[idx(nx,ny)]={t:T.ASH,age:0};}}
      else grid[idx(nx,ny)]={t:np.t===T.WOOD?T.FIRE:{t:T.ASH,age:0}.t,age:0,ttl:np.t===T.WOOD?50:undefined};
    }
  }
  tryFlow(x,y);
}

function stepStone(x,y,p){
  if((p.settled||0)>=3) return; // fully settled — static
  const bx=x+gv.x,by=y+gv.y;
  const below=inB(bx,by)?grid[idx(bx,by)]:null;
  const myD=getDens(p);
  if(!below||getDens(below)<myD-0.5){p.settled=0;swap(x,y,bx,by);}
  else{p.settled=(p.settled||0)+1;}
}

function stepSteam(x,y,p){
  p.ttl=(p.ttl||80)-1;
  if(p.ttl<=0){grid[idx(x,y)]={t:T.WATER,age:0};return;}
  tryRise(x,y);
  if(Math.random()<0.3){const perp=getPerp();const d=perp[Math.floor(Math.random()*perp.length)];const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy))swap(x,y,sx,sy);}
}

function stepIce(x,y,p){
  p.ttl=(p.ttl||800)-1;
  if(p.ttl<=0){grid[idx(x,y)]={t:T.WATER,age:0};return;}
  for(const[nx,ny] of getNeighbors(x,y)){const np=get(nx,ny);if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.STEAM){grid[idx(x,y)]={t:T.WATER,age:0};return;}}
}

function stepSmoke(x,y,p){
  p.ttl=(p.ttl||60)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  tryRise(x,y);
  if(Math.random()<0.4){const perp=getPerp();const d=perp[Math.floor(Math.random()*perp.length)];const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy))swap(x,y,sx,sy);}
}

// ================================================================
//  OXYGEN — rises like smoke, flammable at high concentration
//  Nearby oxygen cells increase local O2 density. When 3+ oxygen
//  neighbors cluster, any adjacent fire/lava/spark ignites them all.
// ================================================================
function stepOxygen(x,y,p){
  p.ttl=(p.ttl||120)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  // Rise against gravity (lighter than air)
  tryRise(x,y);
  // Lateral drift
  if(Math.random()<0.3){
    const perp=getPerp();const d=perp[Math.floor(Math.random()*perp.length)];
    const sx=x+d.x,sy=y+d.y;
    if(inB(sx,sy)&&!get(sx,sy))swap(x,y,sx,sy);
  }
  // Re-read position after potential move
  if(grid[idx(x,y)]!==p)return;
  // Count nearby oxygen — high concentration = volatile
  const nbrs=getNeighbors(x,y);
  let o2Count=0;
  for(const[nx,ny] of nbrs){const np=get(nx,ny);if(np?.t===T.OXYGEN)o2Count++;}
  // Flammability: 3+ nearby oxygen = any fire/lava/spark triggers chain ignition
  if(o2Count>=3){
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);
      if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.BLOOM_FIRE){
        // Chain ignite — this oxygen and all adjacent oxygen become fire
        grid[idx(x,y)]={t:T.FIRE,age:0,ttl:15+Math.floor(Math.random()*20)};
        for(const[ox,oy] of nbrs){
          if(get(ox,oy)?.t===T.OXYGEN) grid[idx(ox,oy)]={t:T.FIRE,age:0,ttl:12+Math.floor(Math.random()*15)};
        }
        return;
      }
    }
  }
  // Even at low concentration, direct fire contact burns single oxygen cell
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(np?.t===T.FIRE||np?.t===T.LAVA){
      grid[idx(x,y)]={t:T.FIRE,age:0,ttl:10+Math.floor(Math.random()*10)};
      return;
    }
  }
}

function stepWood(x,y,p){
  // Fire vulnerability
  for(const[nx,ny] of getNeighbors(x,y)){const np=get(nx,ny);if((np?.t===T.FIRE||np?.t===T.LAVA)&&Math.random()<0.004){grid[idx(x,y)]={t:T.FIRE,age:0,ttl:80+Math.floor(Math.random()*80)};return;}}

  // GROWTH — wood grows like a tree: upward trunk with heavy branching
  // Needs to be rooted (adjacent to sand, detritus, gold_sand, or other wood)
  const nbrs=getNeighbors(x,y);
  const rooted=nbrs.some(([nx,ny])=>{const t=get(nx,ny)?.t;return t===T.SAND||t===T.GOLD_SAND||t===T.DETRITUS||t===T.WOOD||t===T.CLAY_HARD;});
  if(!rooted)return;

  // Light helps but isn't required — wood grows slowly even in dim light
  const lv=lightGrid[idx(x,y)];
  const lightBoost=lv>0.2?2:1; // grows faster in sunlight

  // Growth timer
  if(p.growTimer===undefined)p.growTimer=Math.floor(15+Math.random()*20);
  p.growTimer-=lightBoost;
  if(p.growTimer>0)return;
  p.growTimer=Math.floor(15+Math.random()*25);

  // Count nearby wood to limit density (don't fill entire screen)
  let woodCount=0;
  for(const[nx,ny] of nbrs){if(get(nx,ny)?.t===T.WOOD)woodCount++;}
  if(woodCount>=5)return; // too dense, stop growing

  // Growth direction — trunk grows up, branches grow sideways with high probability
  const gx2=gv.x,gy2=gv.y;
  const candidates=[];
  // Upward (against gravity) — trunk
  const ux=x-gx2,uy=y-gy2;
  if(inB(ux,uy)&&!get(ux,uy))candidates.push([ux,uy,4]); // trunk priority

  // Sideways — branches (heavy branching)
  const perp=getPerp();
  for(const d of perp){
    const sx=x+d.x,sy=y+d.y;
    if(inB(sx,sy)&&!get(sx,sy))candidates.push([sx,sy,3]); // strong branch tendency
    // Diagonal up-sideways — angled branches
    const dx=x+d.x-gx2,dy=y+d.y-gy2;
    if(inB(dx,dy)&&!get(dx,dy))candidates.push([dx,dy,2]);
  }

  // Occasional downward branch (drooping)
  const bx=x+gx2,by=y+gy2;
  if(inB(bx,by)&&!get(bx,by)&&Math.random()<0.15)candidates.push([bx,by,1]);

  if(!candidates.length)return;

  // Weighted random selection
  const total=candidates.reduce((s,c)=>s+c[2],0);
  let r=Math.random()*total;
  let chosen=candidates[candidates.length-1];
  for(const c of candidates){r-=c[2];if(r<=0){chosen=c;break;}}

  grid[idx(chosen[0],chosen[1])]={t:T.WOOD,age:0,growTimer:Math.floor(20+Math.random()*30)};
}

function stepAsh(x,y,p){
  const bx=x+gv.x,by=y+gv.y;const below=inB(bx,by)?grid[idx(bx,by)]:null;
  if(!below&&Math.random()<0.25){swap(x,y,bx,by);return;}
  if(Math.random()<0.08){const perp=getPerp();const d=perp[Math.floor(Math.random()*perp.length)];const sx=x+d.x,sy=y+d.y;if(inB(sx,sy)&&!get(sx,sy))swap(x,y,sx,sy);}
}

function stepAcid(x,y,p){
  p.ttl=(p.ttl||300)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(!np||isImmovable(np.t)||np.t===T.ACID||np.t===T.WATER)continue;
    if(Math.random()<0.04){grid[idx(nx,ny)]=null;if(np.g)popDecr(np);p.ttl-=8;if(p.ttl<=0){grid[idx(x,y)]=null;return;}}
  }
  tryFlow(x,y);
}

function stepGunpowder(x,y,p){
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(np?.t===T.FIRE||np?.t===T.LAVA){
      for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){if(dx*dx+dy*dy<=25){const ex=x+dx,ey=y+dy;if(inB(ex,ey)&&!isImmovable(get(ex,ey)?.t))grid[idx(ex,ey)]=Math.random()<0.5?{t:T.FIRE,age:0,ttl:25}:null;}}
      return;
    }
  }
  tryFall(x,y,p);
}

function stepSalt(x,y,p){
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(np?.t===T.WATER&&Math.random()<0.06){grid[idx(x,y)]=null;grid[idx(nx,ny)]=null;return;}
    if(np?.g&&Math.random()<0.008){np.energy-=4;np.hp-=1;}
  }
  tryFall(x,y,p);
}

// ================================================================
//  PHARMACY — drug particle step functions
//  All drugs: flow like liquid, apply buff on creature contact, decay via TTL
// ================================================================
function stepDrug(x,y,p,buffType,buffTTL){
  p.ttl=(p.ttl||300)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(np?.g){applyBuff(np,buffType,buffTTL);grid[idx(x,y)]=null;return;}
  }
  tryFlow(x,y);
}
// ---- Lucid wave helpers (used by creature step functions) ----
// Returns the wave intensity at cell (x,y) from all active lucid sources (0-1).
// Mirrors the visual overlay math in getColor so the "lines" creatures follow
// are exactly the bright rings players can see.
function lucidFieldAt(x,y){
  if(!lucidSources.length)return 0;
  let best=0;
  for(const src of lucidSources){
    const dx=x-src.x,dy=y-src.y;
    const dist=Math.sqrt(dx*dx+dy*dy);
    const ageFade=Math.max(0,1-src.age/LUCID_LIFETIME);
    const wave=(Math.sin((dist*0.5-src.age*0.18)*Math.PI)*0.5+0.5);
    const intensity=wave*ageFade*(1-dist/(W*1.2));
    if(intensity>best)best=intensity;
  }
  return best;
}
// A cell is "on the path" when it sits on a bright wave band.
function isLucidNode(x,y){return lucidFieldAt(x,y)>0.55;}
// Mutates the candidate array in-place: if the creature is inside the field,
// keep only node cells. Falls back to all candidates if no node is adjacent.
function lucidConstrainMoves(cands,x,y){
  if(!lucidSources.length||!cands.length)return;
  const myField=lucidFieldAt(x,y);
  if(myField<0.08)return; // outside field — unconstrained
  const nodes=cands.filter(c=>isLucidNode(c[0],c[1]));
  if(nodes.length>0){cands.length=0;cands.push(...nodes);}
}

function stepLucid(x,y,p){
  p.ttl=(p.ttl||200)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(np?.g||np?.customType!==undefined){
      if(lucidSources.length<MAX_LUCID_SOURCES)
        lucidSources.push({x:nx,y:ny,age:0,hue:Math.floor(Math.random()*360)});
      grid[idx(x,y)]=null;return;
    }
  }
  tryFlow(x,y);
}
function createChromaCreature(hue){
  const archs=['creature','creature','creature','plant','fungi'];
  const sizes=[{id:'tiny',name:'Tiny',hp:30,energy:80,speed:2.0},{id:'small',name:'Small',hp:60,energy:120,speed:1.5},{id:'medium',name:'Medium',hp:100,energy:150,speed:1.0},{id:'large',name:'Large',hp:180,energy:200,speed:0.6}];
  const movs=[{id:'walker',name:'Walker',icon:'🚶'},{id:'flyer',name:'Flyer',icon:'🦋'},{id:'swimmer',name:'Swimmer',icon:'🐟'},{id:'burrower',name:'Burrower',icon:'🐛'},{id:'climber',name:'Climber',icon:'🦎'},{id:'swarmer',name:'Swarmer',icon:'🐝'}];
  const diets=[{id:'omnivore',name:'Omnivore',targets:[T.PLANT,T.FUNGI,T.DETRITUS,T.ASH],icon:'🍽️'},{id:'herbivore',name:'Herbivore',targets:[T.PLANT,T.SEED],icon:'🌿'},{id:'fungivore',name:'Fungivore',targets:[T.FUNGI,T.SPORE],icon:'🍄'},{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'},{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'},{id:'pyrotroph',name:'Pyrotroph',targets:[T.LAVA,T.FIRE],icon:'🔥'},{id:'cryotroph',name:'Cryotroph',targets:[T.ICE,T.WATER],icon:'❄️'}];
  const repros=[{id:'budding',name:'Budding',rate:0.02},{id:'spore',name:'Spore',rate:0.008},{id:'cloning',name:'Cloning',rate:0.015},{id:'flowering',name:'Flowering',rate:0.005}];
  const icons=['🐜','🐛','🦗','🦟','🐞','🦂','🦀','🐙','🦑','🌸','🌺','🍄','👾','👽','🤖','💀','🔮','💎','⭐','❄️'];
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const elemDefault={fire:'die',lava:'die',water:'ignore',ice:'ignore',acid:'die',salt:'ignore',smoke:'ignore',steam:'ignore',sand:'ignore',clay:'ignore',wood:'ignore',detritus:'ignore',oil:'ignore',gunpowder:'ignore'};
  const arch=pick(archs);
  const aggr=arch==='creature'?Math.random():0;
  const reproRate=0.2+Math.random()*0.6;
  const size=pick(sizes);
  const mov=arch==='creature'?pick(movs):{id:'sessile',name:'Sessile',icon:'🌿'};
  const diet=arch==='plant'?{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'}:arch==='fungi'?{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'}:pick(diets);
  const repro=arch==='plant'?pick([repros[0],repros[3]]):arch==='fungi'?repros[1]:pick(repros);
  const preyTypes=arch==='creature'&&aggr>0.3?[pick([T.ANT,T.SPIDER,T.MITE,T.TERMITE,T.FUNGI,T.PLANT])]:[];
  const specials=Math.random()<0.5?[pick(SPECIAL_OPTIONS||[])]:[];
  const c={
    id:nextCustomId,
    name:`Chroma-${hue}`,
    icon:pick(icons),
    hue, sat:70, lit:40,
    archetype:arch,
    movement:mov,
    diet,
    reproduction:{...repro,rate:0.004+reproRate*0.02},
    size,
    specials:specials.filter(Boolean),
    tolerances:[],
    elemBehaviors:{...elemDefault},
    preyTypes,
    includesCustomPrey:false,
    allyTypes:[],
    huntedByTypes:[],
    aggression:aggr,
    fear:Math.random()*0.5,
    attackId:pick(['bite','venom','acid_spit','fire_breath','crush']),
    lightReq:arch==='fungi'?0.1:0.3,
    spreadSpeed:arch==='plant'||arch==='fungi'?0.3+Math.random()*0.4:0.1,
    flowerEmit:arch==='plant'?pick(['none','spore','seed','smoke']):'none',
    genome:Array(6).fill(0).map((_,i)=>i===3?Math.floor(aggr*255):i===5?Math.floor(reproRate*255):Math.floor(100+Math.random()*100)),
    created:tickCount,
  };
  c.interactions=generateInteractions(c);
  customCreatures.set(c.id,c);
  nextCustomId++;
  POP[c.id]=0; POP[c.id+100]=0;
  POP_MAX[c.id]=800; POP_MAX[c.id+100]=10;
  POP_HISTORY[c.id]=[];
  updateCustomList();
  return {id:c.id, size:c.size};
}
function stepChromadust(x,y,p){
  p.ttl=(p.ttl||200)-1;
  if(p.ttl<=0){
    const spec=chromaStrains.get(p.hue);
    if(spec){
      const cell=spawnCustomCell(spec.id,x,y,false);
      if(cell){grid[idx(x,y)]=cell;POP[spec.id]=(POP[spec.id]||0)+1;}
      else grid[idx(x,y)]=null;
    } else {
      grid[idx(x,y)]=null;
    }
    return;
  }
  tryFlow(x,y);
}
function stepCrank(x,y,p){
  p.ttl=(p.ttl||200)-1;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);
    if(np?.g||np?.customType!==undefined){
      const angle=Math.random()*Math.PI*2;
      const cdx=Math.cos(angle);const cdy=Math.sin(angle);
      const dist=25+Math.floor(Math.random()*30);
      grid[idx(nx,ny)]=null;
      // Sparse fire trail
      for(let i=1;i<dist;i++){
        const tx=Math.round(nx+cdx*i),ty=Math.round(ny+cdy*i);
        if(!inB(tx,ty))break;
        if(Math.random()<0.25) grid[idx(tx,ty)]={t:T.FIRE,age:0,ttl:10+Math.floor(Math.random()*15)};
      }
      // 5% chance to explode at landing, otherwise just land
      if(Math.random()<0.05){
        const lx=Math.round(nx+cdx*dist),ly=Math.round(ny+cdy*dist);
        if(inB(lx,ly)){
          for(let ey=ly-3;ey<=ly+3;ey++) for(let ex=lx-3;ex<=lx+3;ex++){
            if(inB(ex,ey)) grid[idx(ex,ey)]={t:T.FIRE,age:0,ttl:30+Math.floor(Math.random()*40)};
          }
        }
      }
      grid[idx(x,y)]=null;return;
    }
  }
  tryFlow(x,y);
}
function stepVenomBrew(x,y,p){grid[idx(x,y)]=null;}
function stepPheromone(x,y,p){grid[idx(x,y)]=null;}
function stepCalcifier(x,y,p){grid[idx(x,y)]=null;}
function stepSporeBomb(x,y,p){grid[idx(x,y)]=null;}
function stepGigantism(x,y,p){grid[idx(x,y)]=null;}

// ================================================================
//  CLOUD — water spout, queen of water
//  Floats near the surface. Charges from ambient moisture and steam.
//  When charged, fires a water droplet downward every N ticks.
//  Gusts of wind (lateral drift) spread droplets sideways.
//  Absorbs nearby steam/water vapor to recharge faster.
// ================================================================
function stepCloud(x,y,p){
  p.charge=(p.charge||120);
  p.phase=(p.phase||0)+1;

  // Fire, lava, acid destroy the cloud
  for(const[nx2,ny2] of getNeighbors(x,y)){
    const np=get(nx2,ny2);
    if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.ACID){
      grid[idx(x,y)]=null;return; // cloud destroyed by heat/acid
    }
  }

  // Clouds gently drift sideways — oscillate left/right over time
  if(p.phase%12===0&&Math.random()<0.6){
    const perp=getPerp();
    const d=perp[Math.random()<0.5?0:1];
    const nx2=x+d.x, ny2=y+d.y;
    if(inB(nx2,ny2)&&!grid[idx(nx2,ny2)])swap(x,y,nx2,ny2);
  }

  // Float upward against gravity
  if(p.phase%8===0&&Math.random()<0.4){
    const ux=x-gv.x, uy=y-gv.y;
    if(inB(ux,uy)&&!grid[idx(ux,uy)])swap(x,y,ux,uy);
  }

  // Absorb moisture — recharges from steam and water
  for(const[nx2,ny2] of getNeighbors(x,y)){
    const np=get(nx2,ny2);
    if(np?.t===T.STEAM){p.charge=Math.min(255,p.charge+20);grid[idx(nx2,ny2)]=null;break;}
    if(np?.t===T.WATER&&Math.random()<0.05){p.charge=Math.min(255,p.charge+5);break;}
  }

  // Passive recharge — cloud always regenerates (atmospheric moisture)
  p.charge=Math.min(255,p.charge+0.15);
  // NEVER depletes below 30 — cloud is always active
  if(p.charge<30) p.charge=30;

  // RAIN DROP: fire water droplets downward
  const rainRate=Math.floor(80-(p.charge/255)*60);
  if(p.phase%Math.max(1,rainRate)===0){
    const spread=Math.random()<0.5?0:(Math.random()<0.5?-1:1);
    const perp=getPerp();
    const dropX=x+gv.x+(spread>0?perp[0].x:(spread<0?perp[1].x:0));
    const dropY=y+gv.y+(spread>0?perp[0].y:(spread<0?perp[1].y:0));
    if(inB(dropX,dropY)&&!grid[idx(dropX,dropY)]){
      grid[idx(dropX,dropY)]=abiotic(T.WATER);
      p.charge=Math.max(30,p.charge-6); // never drain below 30
    }
  }

  // Heavy downpour burst
  if(p.charge>220&&Math.random()<0.02){
    for(let b=0;b<3;b++){
      const ox=x+gv.x+(b-1), oy=y+gv.y;
      if(inB(ox,oy)&&!grid[idx(ox,oy)])grid[idx(ox,oy)]=abiotic(T.WATER);
    }
    p.charge=Math.max(30,p.charge-30);
  }

  // Lightning strike (rare, only when overcharged)
  if(p.charge>240&&Math.random()<0.003){
    for(let dist=1;dist<15;dist++){
      const lx=x+gv.x*dist, ly=y+gv.y*dist;
      if(!inB(lx,ly)) break;
      const target=get(lx,ly);
      if(target){
        if(target.t===T.WATER||isWall(target.t))break;
        if(target.g){target.hp-=60;if(target.hp<=0){popDecr(target);grid[idx(lx,ly)]={t:T.FIRE,age:0,ttl:20};}}
        else if(target.t===T.WOOD||target.t===T.OIL||target.t===T.PLANT){grid[idx(lx,ly)]={t:T.FIRE,age:0,ttl:40};}
        p.charge=Math.max(30,p.charge-80);break;
      }
    }
  }
}

// ================================================================
//  BLOOM CLOUD — incendiary substance
//  Sits inert as dark crimson powder. Water contact ignites fire blooms
//  that float upward, burning everything they pass.
// ================================================================
function stepBloomCloud(x,y,p){
  p.age++;
  // Cooldown between blooms so it doesn't fire every tick
  if(p.cooldown>0){p.cooldown--;return;}

  const nbrs=getNeighbors(x,y);
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.WATER||np.t===T.STEAM){
      // Spawn a fire bloom above — bloom cloud STAYS, it's the reactive surface
      const bx=x-gv.x,by=y-gv.y;
      const target=(inB(bx,by)&&!get(bx,by))?[bx,by]:null;
      if(target) grid[idx(target[0],target[1])]={t:T.BLOOM_FIRE,age:0,ttl:60+Math.floor(Math.random()*80)};
      // Consume the triggering water
      if(np.t===T.WATER) grid[idx(nx,ny)]=null;
      p.cooldown=8; // brief cooldown before next bloom fires
      return; // one bloom per check
    }
    // Fire/lava/acid can destroy the bloom cloud (it's not indestructible)
    if(np.t===T.FIRE||np.t===T.LAVA||np.t===T.ACID){
      grid[idx(x,y)]=null;return;
    }
  }
  // Settles slowly downward like heavy gas
  if(p.age%8===0){
    const bx=x+gv.x,by=y+gv.y;
    if(inB(bx,by)&&!grid[idx(bx,by)]) swap(x,y,bx,by);
  }
}

// BLOOM_FIRE: floating fireball, rises and burns everything nearby
function stepBloomFire(x,y,p){
  p.ttl--;
  if(p.ttl<=0){grid[idx(x,y)]=null;return;}

  // Rise against gravity
  const ux=x-gv.x,uy=y-gv.y;
  if(inB(ux,uy)){
    const above=grid[idx(ux,uy)];
    if(!above){swap(x,y,ux,uy);[x,y]=[ux,uy];}
    else if(above.t===T.WATER){grid[idx(ux,uy)]=null;grid[idx(x,y)]=null;return;}
  }

  // Drift sideways for organic float
  if(Math.random()<0.35){
    const perp=getPerp();const d=perp[Math.random()<0.5?0:1];
    const sx=x+d.x,sy=y+d.y;
    if(inB(sx,sy)&&!grid[idx(sx,sy)]) swap(x,y,sx,sy);
  }

  // Burn neighbors
  for(const[nx,ny] of getNeighbors(x,y)){
    const np=get(nx,ny);if(!np)continue;
    if(np.t===T.WATER){grid[idx(x,y)]=null;return;}
    const fl={[T.PLANT]:0.6,[T.WOOD]:0.4,[T.OIL]:0.8,[T.DETRITUS]:0.3,[T.FUNGI]:0.5,[T.WEB]:0.7}[np.t]??0;
    if(fl>0&&Math.random()<fl*0.4) grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:25+Math.floor(Math.random()*25)};
    if(np.g&&Math.random()<0.35){np.hp-=12;if(np.hp<=0){popDecr(np);grid[idx(nx,ny)]=null;}}
  }

  // Trailing sparks
  if(Math.random()<0.3){
    const sx=x+gv.x,sy=y+gv.y;
    if(inB(sx,sy)&&!grid[idx(sx,sy)]) grid[idx(sx,sy)]={t:T.FIRE,age:0,ttl:6+Math.floor(Math.random()*8)};
  }
}

// ================================================================
//  PROGRAMMABLE CLOUD — user-configurable element emitter
// ================================================================
function stepProgCloud(x,y,p){
  p.phase=(p.phase||0)+1;
  for(const[nx2,ny2] of getNeighbors(x,y)){
    const np=get(nx2,ny2);
    if(np?.t===T.FIRE||np?.t===T.LAVA||np?.t===T.ACID){grid[idx(x,y)]=null;return;}
  }
  if(p.phase%10===0&&Math.random()<0.5){
    const perp=getPerp();const d=perp[Math.random()<0.5?0:1];
    const nx2=x+d.x,ny2=y+d.y;if(inB(nx2,ny2)&&!grid[idx(nx2,ny2)])swap(x,y,nx2,ny2);
  }
  if(p.phase%7===0&&Math.random()<0.35){
    const ux=x-gv.x,uy=y-gv.y;if(inB(ux,uy)&&!grid[idx(ux,uy)])swap(x,y,ux,uy);
  }
  const rate=Math.max(1,p.emitRate||30);
  if(p.phase%rate===0){
    const spread=Math.random()<0.5?0:(Math.random()<0.5?-1:1);
    const perp=getPerp();
    const dropX=x+gv.x+(spread>0?perp[0].x:spread<0?perp[1].x:0);
    const dropY=y+gv.y+(spread>0?perp[0].y:spread<0?perp[1].y:0);
    if(inB(dropX,dropY)&&!grid[idx(dropX,dropY)]){
      const cell=makeProgCloudParticle(p.emitType||T.WATER);
      if(cell) grid[idx(dropX,dropY)]=cell;
    }
  }
}

function makeProgCloudParticle(t){
  switch(t){
    case T.WATER:return abiotic(T.WATER);case T.SAND:return abiotic(T.SAND);
    case T.GOLD_SAND:return abiotic(T.GOLD_SAND);case T.ACID:return{t:T.ACID,age:0,ttl:300};
    case T.LAVA:return{t:T.LAVA,age:0,ttl:500};case T.OIL:return abiotic(T.OIL);
    case T.SALT:return abiotic(T.SALT);case T.ICE:return{t:T.ICE,age:0,ttl:800};
    case T.FIRE:return{t:T.FIRE,age:0,ttl:30};case T.STEAM:return{t:T.STEAM,age:0,ttl:80};
    case T.ASH:return abiotic(T.ASH);case T.SMOKE:return{t:T.SMOKE,age:0,ttl:60};
    case T.GUNPOWDER:return abiotic(T.GUNPOWDER);case T.DETRITUS:return abiotic(T.DETRITUS);
    default:return null;
  }
}

function stepWeatherStation(x,y,p){ p.phase=(p.phase||0)+1; }

function stepProgVoid(x,y,p){
  // Anchor — if something pushed us out, reclaim this cell
  if(grid[idx(x,y)]!==p) grid[idx(x,y)]=p;
  p.phase=(p.phase||0)+1;
  const destroyType=p.destroyType;
  const radius=p.radius||2;
  let absorbed=false;
  for(let dy=-radius;dy<=radius;dy++){
    for(let dx=-radius;dx<=radius;dx++){
      if(dx===0&&dy===0)continue;
      const nx=x+dx,ny=y+dy;
      if(!inB(nx,ny))continue;
      const np=grid[idx(nx,ny)];
      if(!np)continue;
      // Match logic
      let match=false;
      if(destroyType==='sand_all') match=(np.t===T.SAND||np.t===T.GOLD_SAND||np.t===T.WHITE_SAND);
      else if(destroyType==='agents') match=!!np.g;
      else match=(np.t===destroyType);
      if(match){
        if(np.g) POP[np.t]=Math.max(0,(POP[np.t]||0)-1);
        grid[idx(nx,ny)]=null;
        absorbed=true;
      }
    }
  }
  if(absorbed) p.pulse=8;
  if(p.pulse>0) p.pulse--;
}

// Weather station state
let ws_rain_active=false, ws_rain_rate=3;
let ws_rain_type_key='water'; // key for element
function wsRainType(){ return ({water:T.WATER,acid:T.ACID,sand:T.SAND,lava:T.LAVA,oil:T.OIL,salt:T.SALT,ice:T.ICE,fire:T.FIRE,steam:T.STEAM,ash:T.ASH,smoke:T.SMOKE,gunpowder:T.GUNPOWDER,detritus:T.DETRITUS})[ws_rain_type_key]||T.WATER; }

function weatherTick(){
  if(!ws_rain_active) return;
  for(let d=0;d<ws_rain_rate;d++){
    const rx=Math.floor(Math.random()*W);
    const finalX=gv.y!==0?rx:(gv.x>0?0:W-1);
    const finalY=gv.y>0?0:(gv.y<0?H-1:rx);
    if(inB(finalX,finalY)&&!grid[idx(finalX,finalY)]){
      const cell=makeProgCloudParticle(wsRainType());
      if(cell) grid[idx(finalX,finalY)]=cell;
    }
  }
}

function stepFire(x,y,p){
  p.ttl=(p.ttl||25)-1;
  if(p.ttl<=0){
    // Leave ash below when fire dies
    const bx=x+gv.x,by=y+gv.y;
    if(inB(bx,by)&&!get(bx,by)&&Math.random()<0.2)grid[idx(bx,by)]={t:T.ASH,age:0};
    grid[idx(x,y)]=null;return;
  }

  const nbrs=getNeighbors(x,y);

  // Emit smoke upward
  const ux=x-gv.x,uy=y-gv.y;
  if(Math.random()<0.12&&inB(ux,uy)&&!get(ux,uy))
    grid[idx(ux,uy)]={t:T.SMOKE,age:0,ttl:30+Math.floor(Math.random()*50)};

  // Water extinguishes fire, ice melts
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(np?.t===T.WATER){grid[idx(x,y)]=null;return;}
    if(np?.t===T.ICE){grid[idx(nx,ny)]={t:T.WATER,age:0};grid[idx(x,y)]=null;return;}
  }

  // Fire rises
  if(inB(ux,uy)&&!get(ux,uy)&&Math.random()<0.3)
    grid[idx(ux,uy)]={t:T.FIRE,age:0,ttl:Math.floor(p.ttl*0.8)};

  // Spread to ALL flammable neighbors
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);
    if(!np) continue;
    const fl={
      [T.OIL]:1.0,[T.WEB]:0.95,[T.PLANT]:0.85,[T.PLANT_WALL]:0.7,
      [T.FUNGI]:0.8,[T.SPORE]:0.9,[T.WOOD]:0.5,[T.ASH]:0.1,
      [T.GUNPOWDER]:1.0,[T.DETRITUS]:0.3,
    }[np.t]??0;

    if(np.t===T.WATER){grid[idx(x,y)]=null;return;}
    if(np.t===T.GUNPOWDER){
      // Explosion!
      for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){if(dx*dx+dy*dy<=25){const ex=nx+dx,ey=ny+dy;if(inB(ex,ey)&&!isImmovable(get(ex,ey)?.t))grid[idx(ex,ey)]=Math.random()<0.5?{t:T.FIRE,age:0,ttl:25}:null;}}
      grid[idx(x,y)]=null;return;
    }
    if(np.t===T.LAVA)continue; // fire can't burn lava

    if(fl>0&&Math.random()<fl*0.6){
      if(np.t===T.PLANT||np.t===T.PLANT_WALL){const pop=np.t===T.PLANT;if(pop)popDecr(np);grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:30+Math.floor(Math.random()*20)};}
      else if(np.t===T.FUNGI){popDecr(np);grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:20+Math.floor(Math.random()*15)};}
      else if(np.t===T.WOOD){grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:80+Math.floor(Math.random()*80)};}
      else{grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:Math.floor(p.ttl*0.75)+5};}
    }
    if(np.g&&Math.random()<0.7){
      const armor=np.g[4]||0;const dmg=Math.max(8,40*(1-armor/255*0.6));
      np.hp-=dmg;
      if(np.hp<=0){set(nx,ny,null);popDecr(np);if(Math.random()<0.5)grid[idx(nx,ny)]={t:T.ASH,age:0};}
    }
  }
}

// ---- MUTAGEN (Life Seed) ----
// Self-replicating mutagen particle. Drifts, occasionally mutates adjacent
// agents (1 gene, shared direction), and reproduces near nutrients.
function stepMutagen(x,y,p){
  // If inside a fridge zone — fully frozen, no activity
  if(inFridge(x,y)){p.frozen=true;return;}
  p.frozen=false;

  p.energy=(p.energy||120)-0.25;
  if(p.energy<=0){grid[idx(x,y)]=null;return;}

  // Initialise recipe genome if missing (6-gene mutation signature)
  if(!p.recipe) p.recipe=[128,128,128,128,128,128];

  // RAPID self-mutation of recipe every tick
  if(Math.random()<0.15){
    const gene=Math.floor(Math.random()*6);
    p.recipe[gene]=Math.min(255,Math.max(0,p.recipe[gene]+Math.floor((Math.random()-0.5)*60)));
  }

  // Drift — random walk
  tryFlow(x,y);
  // Re-read position in case we moved
  const cur=grid[idx(x,y)];
  if(!cur||cur!==p)return; // moved

  // Mutate adjacent agents using current recipe as bias
  if(Math.random()<0.08){
    const nbrs=getNeighbors(x,y);
    for(const[nx,ny] of nbrs){
      const ap=get(nx,ny);
      if(!ap?.g)continue;
      const gene=Math.floor(Math.random()*6);
      const delta=Math.floor((p.recipe[gene]/255-0.5)*60);
      ap.g[gene]=Math.min(255,Math.max(0,(ap.g[gene]||128)+delta));
    }
  }

  // Reproduce near nutrients — child inherits mutated recipe
  if(p.energy>80&&Math.random()<0.012){
    const nbrs=getNeighbors(x,y);
    const nearNutrient=nbrs.some(([nx,ny])=>{const np=get(nx,ny);return np&&(np.t===T.GOLD_SAND||np.t===T.DETRITUS);});
    if(nearNutrient){
      const empty=nbrs.filter(([nx,ny])=>!get(nx,ny));
      if(empty.length){
        const[ex,ey]=empty[Math.floor(Math.random()*empty.length)];
        const childRecipe=p.recipe.map(v=>Math.min(255,Math.max(0,v+Math.floor((Math.random()-0.5)*20))));
        grid[idx(ex,ey)]={t:T.MUTAGEN,age:0,energy:80+Math.floor(Math.random()*40),recipe:childRecipe};
      }
    }
  }
}

// ================================================================
//  POPULATION TRACKING
// ================================================================
function popIncr(p){ if(POP[p.t]!==undefined)POP[p.t]++; }
function popDecr(p){
  if(p.customType!==undefined){
    // Custom creatures track POP by their specific ID, not T.CUSTOM_BASE
    if(POP[p.customType]!==undefined) POP[p.customType]=Math.max(0,POP[p.customType]-1);
  } else {
    if(POP[p.t]!==undefined) POP[p.t]=Math.max(0,POP[p.t]-1);
  }
}

function maybeMutateStrain(p,ng){
  const parent=strainRegistry.get(p.sid);
  if(!parent)return;
  let drift=0;for(let i=0;i<6;i++)drift+=Math.abs(ng[i]-parent.genome[i]);
  if(drift>40){registerStrain(p.t,ng,p.sid);} // lower threshold — more visible strain diversity
}

// ================================================================
//  CLAY PHYSICS
//  Clay falls like sand but counts ticks without moving.
//  Once settled (no movement for ~25 ticks) it hardens to CLAY_HARD.
//  CLAY_HARD is immovable like a wall — but ants can dig through it.
// ================================================================
function stepClay(x,y,p){
  // Try to fall — if we moved, reset settle counter
  const bx=x+gv.x, by=y+gv.y;
  const below=inB(bx,by)?grid[idx(bx,by)]:null;
  const myD=getDens(p), belD=getDens(below);

  let moved=false;
  if(!below||belD<myD-0.3){
    swap(x,y,bx,by);
    moved=true;
  } else {
    // Try lateral slide
    const perp=getPerp();
    const order=Math.random()<0.5?perp:[...perp].reverse();
    for(const d of order){
      const dx2=bx+d.x, dy2=by+d.y;
      if(inB(dx2,dy2)&&!get(dx2,dy2)){swap(x,y,dx2,dy2);moved=true;break;}
    }
  }

  if(moved){
    p.settled=0; // reset on any movement
  } else {
    // Stationary — count up settle timer
    p.settled=(p.settled||0)+1;
    if(p.settled>=25){
      // Harden — 30% become reinforced (ant-proof), 70% remain diggable
      grid[idx(x,y)]={t:T.CLAY_HARD,age:0,reinforced:Math.random()<0.3};
    }
  }
}

// ================================================================
//  MAIN STEP DISPATCH
// ================================================================
function stepParticle(x,y){
  const p=grid[idx(x,y)];
  if(!p)return;
  p.age++;
  // Pharmacy crafting — 100% on contact, 1:1:1
  if(tryCraft(x,y,p))return;
  // PROG_VOID and FROGSTONE run before immovable check (they self-anchor)
  if(p.t===T.PROG_VOID){stepProgVoid(x,y,p);return;}
  if(p.t===T.FROGSTONE){
    // Anchor all frogstone cells in place — they never move
    if(grid[idx(x,y)]!==p) grid[idx(x,y)]=p;
    stepFrogstone(x,y,p);
    return;
  }
  if(p.t===T.WOOD){stepWood(x,y,p);return;} // wood grows — must run before immovable check
  if(isImmovable(p.t))return;
  if(p.t===T.CLAY_HARD)return;
  if(p.t===T.STONE&&(p.settled||0)>=3)return; // settled stone = static

  // Custom lab creatures
  if(p.t===T.CUSTOM_BASE){stepCustom(x,y,p);return;}

  // Special mechanical/environmental objects
  if(p.t===T.CLOUD){stepCloud(x,y,p);return;}
  if(p.t===T.BLOOM_CLOUD){stepBloomCloud(x,y,p);return;}
  if(p.t===T.BLOOM_FIRE){stepBloomFire(x,y,p);return;}
  if(p.t===T.PROG_CLOUD){stepProgCloud(x,y,p);return;}
  if(p.t===T.WEATHER_STATION){stepWeatherStation(x,y,p);return;}
  if(p.t===T.PROG_VOID){stepProgVoid(x,y,p);return;}

  // Classic sand elements — special step logic
  if(p.t===T.LAVA){stepLava(x,y,p);return;}
  if(p.t===T.STEAM){stepSteam(x,y,p);return;}
  if(p.t===T.ICE){stepIce(x,y,p);return;}
  if(p.t===T.SMOKE){stepSmoke(x,y,p);return;}
  if(p.t===T.OXYGEN){stepOxygen(x,y,p);return;}
  if(p.t===T.WOOD){stepWood(x,y,p);return;}
  if(p.t===T.ASH){stepAsh(x,y,p);return;}
  if(p.t===T.ACID){stepAcid(x,y,p);return;}
  if(p.t===T.GUNPOWDER){stepGunpowder(x,y,p);return;}
  if(p.t===T.SALT){stepSalt(x,y,p);return;}
  if(p.t===T.STONE){stepStone(x,y,p);return;}
  // Pharmacy drugs
  if(p.t===T.LUCID){stepLucid(x,y,p);return;}
  if(p.t===T.CHROMADUST){stepChromadust(x,y,p);return;}
  if(p.t===T.CRANK){stepCrank(x,y,p);return;}
  if(p.t===T.VENOM_BREW){stepVenomBrew(x,y,p);return;}
  if(p.t===T.PHEROMONE){stepPheromone(x,y,p);return;}
  if(p.t===T.CALCIFIER){stepCalcifier(x,y,p);return;}
  if(p.t===T.SPORE_BOMB){stepSporeBomb(x,y,p);return;}
  if(p.t===T.GIGANTISM){stepGigantism(x,y,p);return;}
  // Machine/Bacteria: static cells stepped by GoL ticks; _DEAD variants decay
  if(p.t===T.MACHINE)return;
  if(p.t===T.MACHINE_DEAD){stepMachineDead(x,y,p);return;}
  if(p.t===T.BACTERIA)return;
  if(p.t===T.BACTERIA_DEAD){stepBacteriaDead(x,y,p);return;}

  // Plant wall — biological, needs its own step (decay, detritus)

  // Passive gravity for abiotic
  if(p.t===T.WORM)return; // worms are processed by stepAllWorms(), not per-cell
  if(!p.g&&p.t!==T.WEB&&p.t!==T.FIRE&&p.t!==T.MUTAGEN&&p.t!==T.SPORE&&p.t!==T.FROGSTONE
      &&p.t!==T.LAVA&&p.t!==T.STEAM&&p.t!==T.ICE&&p.t!==T.SMOKE&&p.t!==T.OXYGEN
      &&p.t!==T.WOOD&&p.t!==T.ASH&&p.t!==T.ACID&&p.t!==T.GUNPOWDER
      &&p.t!==T.SALT&&p.t!==T.STONE&&p.t!==T.CLOUD&&p.t!==T.BLOOM_CLOUD&&p.t!==T.BLOOM_FIRE
      &&p.t!==T.PROG_CLOUD&&p.t!==T.WEATHER_STATION&&p.t!==T.PROG_VOID
      &&p.t!==T.JELLY){
    if(p.t===T.WATER||p.t===T.OIL)tryFlow(x,y);
    else if(p.t===T.CLAY) stepClay(x,y,p);
    else tryFall(x,y,p);
    return;
  }
  if(p.t===T.JELLY){stepJelly(x,y,p);return;}
  if(p.t===T.WEB){stepWeb(x,y,p);return;}
  if(p.t===T.FIRE){stepFire(x,y,p);return;}
  if(p.t===T.MUTAGEN){stepMutagen(x,y,p);return;}
  if(p.t===T.SPORE){stepSpore(x,y,p);return;}
  if(p.t===T.EGG){stepEgg(x,y,p);return;}
  if(p.t===T.SEED){stepSeed(x,y,p);return;}
  if(p.t===T.QUEEN_SPIDER){stepQueenSpider(x,y,p);return;}
  if(p.t===T.QUEEN_MITE){stepQueenMite(x,y,p);return;}
  if(p.t===T.QUEEN_TERMITE){stepQueenTermite(x,y,p);return;}
  if(p.t===T.QUEEN_HUNTSMAN){stepQueenHuntsman(x,y,p);return;}

  // Passive gravity — only mites (fast, skittery) among agents obey simple density physics
  // Ants and spiders handle gravity inside their own step functions
  const mobile=(p.t===T.MITE);
  if(mobile&&p.g){
    const dens=getDens(p);
    const below=get(x+gv.x,y+gv.y);
    const belD=getDens(below);
    if(dens>3.5&&(!below||belD<dens-0.5)&&Math.random()<0.4){
      swap(x,y,x+gv.x,y+gv.y);
    } else if(dens<2&&Math.random()<0.2){
      tryRise(x,y);
    }
  }

  if(!p.g)return;

  // Kingdom-specific behavior
  switch(p.t){
    case T.PLANT:   stepPlant(x,y,p);   break;
    case T.ANT:     stepAnt(x,y,p);     break;
    case T.TERMITE: stepTermite(x,y,p); break;
    case T.QUEEN:   stepQueen(x,y,p);   break;
    case T.SPIDER:   stepSpider(x,y,p);   break;
    case T.HUNTSMAN: stepHuntsman(x,y,p); break;
    case T.FUNGI:    stepFungi(x,y,p);    break;
    case T.MITE:    stepMite(x,y,p);    break;
  }
}

// ================================================================
//  SPONTANEOUS EVENTS
// ================================================================
let nextEvent=800+Math.floor(Math.random()*800);
const EVENTS=[
  {name:'DROUGHT',desc:'Water levels drop sharply across the board. Aquatic zones shrink and moisture-dependent organisms struggle.',fn:()=>{
    for(let i=0;i<W*H;i++){const p=grid[i];if(p?.t===T.WATER&&Math.random()<0.3)grid[i]=null;}
  }},
  {name:'BLOOM',desc:'A mineral upwelling scatters gold sand across the substrate. Nutrients surge — plant growth will accelerate.',fn:()=>{
    for(let n=0;n<80;n++){const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H);if(!get(x,y))set(x,y,abiotic(T.GOLD_SAND));}
  }},
  {name:'WILDFIRE',desc:'Fires ignite in the plant matter. Organic material burns to detritus — a cycle of destruction and renewal.',fn:()=>{
    for(let n=0;n<8;n++){const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H);const p=get(x,y);if(p?.t===T.PLANT||p?.t===T.PLANT_WALL)grid[idx(x,y)]={t:T.FIRE,age:0,ttl:30};}
  }},
  {name:'PLAGUE',desc:'A virulent pathogen sweeps through all kingdoms. 30% of agents take heavy damage — the weak die first.',fn:()=>{
    for(let i=0;i<W*H;i++){const p=grid[i];if(p?.g&&Math.random()<0.3){p.hp-=40;if(p.hp<=0){grid[i]=null;popDecr(p);}}}
  }},
  {name:'SPORE STORM',desc:'A cloud of fungal spores blankets the board. New fungi colonies establish in dark zones across the terrarium.',fn:()=>{
    for(let n=0;n<30;n++){const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H);if(!get(x,y)){const g=[128,180,200,40,120,180];set(x,y,agentWithStrain(T.FUNGI,g,registerStrain(T.FUNGI,g),{energy:80}));POP[T.FUNGI]++;}}
  }},
  {name:'RAINSTORM',desc:'Rain falls across the terrarium. Plants bloom, seeds germinate, and water pools on every surface.',fn:()=>{
    rainActive=true; rainTicks=0; rainDuration=200+Math.floor(Math.random()*200);
  }},
  {name:'ACID RAIN',desc:'Corrosive precipitation falls from above. Organic matter takes damage — only the resilient survive.',fn:()=>{
    acidRainActive=true; acidRainTicks=0; acidRainDuration=80+Math.floor(Math.random()*80);
  }},
];

let activeEvent=null,activeEventAge=0;
// Rain state
let rainActive=false,rainTicks=0,rainDuration=0;
let acidRainActive=false,acidRainTicks=0,acidRainDuration=0;

// ================================================================
//  RENDER
// ================================================================
function render(){
  if(!imageData){imageData=ctx.createImageData(canvas.width,canvas.height);pixels=new Uint32Array(imageData.data.buffer);}
  pixels.fill(0xFF080810);

  // Unrolled S=2 pixel write — avoids the inner dy/dx loops (96k→48k iterations)
  const cw=canvas.width;
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    const p=grid[y*W+x];
    if(!p) continue;
    const col=getColor(p,x,y);
    const p0=(y*2)*cw+(x*2);
    pixels[p0]=col; pixels[p0+1]=col;
    pixels[p0+cw]=col; pixels[p0+cw+1]=col;
  }

  // Sun dot
  if(sunActive){
    const sx=Math.round(sunX*S),sy=Math.round(sunY*S);
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){if(dx*dx+dy*dy<=16){const px=sx+dx,py=sy+dy;if(px>=0&&px<canvas.width&&py>=0&&py<canvas.height)pixels[py*canvas.width+px]=0xFF32F0FF;}}
  }

  ctx.putImageData(imageData,0,0);

  // Queens: draw a slightly larger "crown glow" overlay so they read as bigger than a 1-cell dot.
  ctx.save();
  const qPad=Math.max(1,Math.floor(S*0.45));
  for(let i=0;i<W*H;i++){
    const p=grid[i];
    if(p?.t!==T.QUEEN) continue;
    const x=_CX[i]*S, y=_CY[i]*S;
    // Outer glow
    ctx.fillStyle='rgba(255,140,0,0.22)';
    ctx.fillRect(x-qPad,y-qPad,S+qPad*2,S+qPad*2);
    // Inner bright core
    ctx.fillStyle='rgba(255,210,120,0.18)';
    ctx.fillRect(x-1,y-1,S+2,S+2);
  }
  ctx.restore();

  // Draw Frogstone tongues as canvas overlay — only hub cells with active tongue
  ctx.save();
  for(let i=0;i<W*H;i++){
    const p=grid[i];
    if(p?.t!==T.FROGSTONE||!p.isHub||!p.tongue) continue;
    const bx=_CX[i]*S+Math.floor(S/2);
    const by=_CY[i]*S+Math.floor(S/2);
    const {tx,ty,hold,maxHold}=p.tongue;
    const tipX=tx*S+Math.floor(S/2);
    const tipY=ty*S+Math.floor(S/2);
    // Fade out as hold expires
    const alpha=0.95-0.15*(hold/maxHold);
    // Tongue body — hot pink
    ctx.beginPath();
    ctx.moveTo(bx,by);
    ctx.lineTo(tipX,tipY);
    ctx.strokeStyle=`rgba(255,60,170,${alpha})`;
    ctx.lineWidth=Math.max(2,Math.floor(S*0.5));
    ctx.lineCap='round';
    ctx.stroke();
    // Bright forked tip
    ctx.beginPath();
    ctx.arc(tipX,tipY,Math.max(2,S*0.7),0,Math.PI*2);
    ctx.fillStyle=`rgba(255,160,220,${alpha})`;
    ctx.fill();
    // Glow
    ctx.beginPath();
    ctx.arc(tipX,tipY,Math.max(4,S*1.2),0,Math.PI*2);
    ctx.fillStyle=`rgba(255,80,160,${alpha*0.3})`;
    ctx.fill();
  }
  ctx.restore();
}
function getColor(p,x,y){
  if(!p)return 0;
  // Custom lab creatures
  if(p.t===T.CUSTOM_BASE&&p.customType){
    const def=customCreatures.get(p.customType);
    if(def){
      const lv=lightGrid[idx(x,y)];
      let lit=def.lit+lv*15+((p.hp||100)/100)*10;
      if((def.specials||[]).some(s=>s.id==='bioluminescent')&&lv<0.2)lit+=25;
      if(p.isQueen)lit+=12;
      const[cr,cg,cb]=hslToRgb(def.hue,def.sat,lit);
      return 0xFF000000|(cb<<16)|(cg<<8)|cr;
    }
  }
  const lv=lightGrid[idx(x,y)];
  let r=0,g=0,b=0;

  switch(p.t){
    case T.WALL:       r=60;g=60;b=60;break;
    case T.CLAY:       {const v=Math.floor(Math.random()*10);r=120+v;g=130+v;b=155+v;break;} // blue-grey wet clay
    case T.CLAY_HARD:  {const v=Math.floor(Math.random()*8);
      if(p.reinforced){r=70+v;g=78+v;b=100+v;} // darker blue-grey — reinforced, ant-proof
      else{r=95+v;g=105+v;b=130+v;}              // normal diggable clay
      break;}
    case T.TUNNEL_WALL:{const v=Math.floor(Math.random()*6);r=60+v;g=70+v;b=85+v;break;} // dark blue-grey, distinct from clay
    case T.FRIDGE_WALL:{const fl=Math.random()<0.1;r=fl?80:50;g=fl?160:130;b=fl?220:200;break;}
    case T.PLANT_WALL: r=20;g=80;b=25;break;
    case T.SAND:       r=185+Math.floor(Math.random()*10);g=155;b=80;break;
    case T.GOLD_SAND:  r=220+Math.floor(Math.random()*20);g=180;b=0;break;
    case T.WHITE_SAND: r=210;g=210;b=205;break;
    case T.DETRITUS:   r=80;g=65;b=45;break;
    case T.WATER:      r=50+(lv*30)|0;g=120+(lv*20)|0;b=200;break;
    case T.OIL:        r=25;g=55;b=20;break;
    case T.MUTAGEN:    {const v=(40+Math.random()*80)|0;r=200+v*0.3|0;g=0;b=220;break;}
    case T.WEB:        {const f=Math.min(1,(p.ttl||100)/200);r=g=b=160+f*60;break;}
    case T.EGG:        r=220;g=200;b=120;break;
    case T.SPORE:      r=160;g=80;b=220;break;
    case T.CLOUD: {
      // White-grey puff, brighter when more charged, flickers at edges
      const charge=(p.charge||120)/255;
      const fl=Math.random()<0.3;
      r=fl?255:Math.floor(180+charge*60);
      g=fl?255:Math.floor(200+charge*40);
      b=fl?255:Math.floor(210+charge*40);
      break;
    }
    case T.BLOOM_CLOUD: {const f=Math.random()<0.2;r=f?200:120;g=f?60:20;b=f?80:30;break;}
    case T.BLOOM_FIRE: {const f=Math.random();r=255;g=f<0.3?200:f<0.7?120:60;b=f<0.2?180:0;break;}
    case T.PROG_CLOUD: {
      const et=p.emitType||T.WATER;
      const cols={[T.WATER]:[80,160,240],[T.ACID]:[200,220,0],[T.LAVA]:[255,80,0],[T.ICE]:[160,220,255],[T.FIRE]:[255,160,20],[T.SALT]:[220,220,220],[T.SAND]:[185,155,80],[T.OIL]:[40,80,30],[T.STEAM]:[200,200,220],[T.SMOKE]:[100,100,100],[T.ASH]:[90,88,85],[T.GUNPOWDER]:[70,65,60],[T.DETRITUS]:[90,75,55],[T.GOLD_SAND]:[220,180,0]}[et]||[160,200,240];
      const fl2=Math.random()<0.25;r=fl2?255:cols[0];g=fl2?255:cols[1];b=fl2?255:cols[2];
      break;
    }
    case T.WEATHER_STATION: {
      const ph=(p.phase||0);const pulse=Math.sin(ph*0.1)*0.5+0.5;
      r=Math.floor(40+pulse*30);g=Math.floor(80+pulse*60+(ws_rain_active?80:0));b=Math.floor(100+pulse*80);
      break;
    }
    case T.PROG_VOID: {
      const pulse2=p.pulse||0;
      r=Math.floor(20+pulse2*10);g=0;b=Math.floor(30+pulse2*15);
      if(pulse2>4&&Math.random()<0.5){r=120;g=0;b=180;}
      break;
    }
    case T.LAVA: {const fl=Math.random();r=255;g=fl<0.4?40:fl<0.7?80:140;b=0;break;}
    case T.STONE: {const v=Math.floor(Math.random()*12);r=100+v;g=100+v;b=100+v;break;}
    case T.STEAM: {const a=(p.ttl||80)/80;r=g=b=180+(a*40)|0;break;}
    case T.ICE:   {const s=Math.random()<0.1;r=s?240:180;g=s?250:220;b=s?255:240;break;}
    case T.SMOKE: {const a=Math.min(1,(p.ttl||60)/60);r=g=b=60+(a*50)|0;break;}
    case T.OXYGEN: {const a=Math.min(1,(p.ttl||120)/120);const fl=Math.random()<0.15;r=fl?140:80+(a*40)|0;g=fl?220:160+(a*50)|0;b=fl?255:220+(a*30)|0;break;}
    // Pharmacy drugs
    case T.LUCID:{const ph=(p.age*18)%360;if(Math.random()<0.25){r=255;g=255;b=255;}else{const li=55+Math.random()*20;[r,g,b]=hslToRgb(ph,100,li);}break;}
    case T.CHROMADUST:{
      const ttl=p.ttl||200;
      const cycleH=(p.age*14)%360; // fast rainbow while falling
      let h;
      if(ttl>50){
        h=cycleH; // full rainbow cycle
      } else {
        // blend into colony hue over last 50 ticks
        const t=ttl/50;
        const ch=p.hue||0;
        const diff=((ch-cycleH+540)%360)-180;
        h=(cycleH+diff*(1-t)+360)%360;
      }
      if(Math.random()<0.18){r=255;g=255;b=255;}
      else{const lit=50+Math.random()*20;[r,g,b]=hslToRgb(h,95,lit);}
      break;
    }
    case T.CRANK:{const fl=Math.random()<0.3;r=255;g=fl?200:80;b=fl?60:20;break;}
    case T.VENOM_BREW:{const fl=Math.random();r=fl<0.5?100:60;g=fl<0.3?200:160;b=fl<0.5?80:180;break;}
    case T.PHEROMONE:{const fl=Math.random()<0.3;r=fl?220:180;g=fl?160:120;b=fl?40:20;break;}
    case T.CALCIFIER:{const v=Math.floor(Math.random()*15);r=140+v;g=140+v;b=150+v;break;}
    case T.SPORE_BOMB:{const fl=Math.random();r=fl<0.3?120:60;g=0;b=fl<0.5?180:120;break;}
    case T.GIGANTISM:{const fl=Math.random()<0.2;r=fl?255:180;g=fl?100:60;b=fl?100:200;break;}
    case T.WOOD:  {const v=Math.floor(Math.random()*15);r=100+v;g=65+v;b=30;break;}
    case T.ASH:   {const v=Math.floor(Math.random()*20);r=70+v;g=68+v;b=65+v;break;}
    case T.ACID:  {const fl=Math.random()<0.2;r=fl?255:210;g=fl?220:170;b=fl?0:0;break;} // toxic yellow-orange
    case T.GUNPOWDER:{const v=Math.floor(Math.random()*8);r=60+v;g=55+v;b=50+v;break;}
    case T.SALT:  {const v=Math.floor(Math.random()*20);r=220+v;g=220+v;b=220+v;break;}
    case T.JELLY:{const w=Math.sin((p.age||0)*0.18)*15;r=180+w|0;g=80+(w*0.5)|0;b=160+w|0;break;} // shimmery pink-purple
    case T.WORM:{const seg=(p.age||0)%6;r=200-(seg*8);g=80+(seg*4);b=60;break;} // segmented pink-red
    case T.QUEEN_SPIDER:{const f=Math.random()<0.15;r=f?220:170;g=f?80:50;b=f?255:210;break;} // vivid purple
    case T.TERMITE:{const v=Math.floor(Math.random()*20);r=25+v;g=175+v;b=160+v;break;} // teal
    case T.QUEEN_TERMITE:{const f=Math.random()<0.2;r=f?40:25;g=f?220:200;b=f?210:185;break;} // bright teal-cyan
    case T.HUNTSMAN:{const f=Math.random()<0.2;r=f?230:190;g=f?110:80;b=f?40:25;break;} // warm rust-orange
    case T.QUEEN_HUNTSMAN:{const f=Math.random()<0.15;r=f?255:235;g=f?180:140;b=f?20:10;break;} // golden amber
    case T.FROGSTONE: {
      const hubX=p.hubX||x, hubY=p.hubY||y;
      const sunPow2=Math.max(0,Math.min(1,1-(Math.sqrt(Math.pow(sunX-hubX,2)+Math.pow(sunY-hubY,2))/(W*0.45))));
      const isHub=p.isHub||false;
      if(isHub){
        // Hub = bright eye, pulses with sun power
        const pulse=Math.sin((p.phase||0)*0.2)*0.5+0.5;
        r=Math.floor(80+sunPow2*120+pulse*50);
        g=Math.floor(180+sunPow2*60+pulse*15);
        b=Math.floor(40);
        if(p.tongue){r=255;g=80;b=180;} // pink flash when tongue out
      } else {
        // Dome body — mossy stone green, darker at top
        const distFromHub=Math.abs(y-hubY);
        const shade=1-distFromHub*0.18;
        r=Math.floor((45+sunPow2*20)*shade);
        g=Math.floor((70+sunPow2*30)*shade);
        b=Math.floor((30)*shade);
      }
      break;
    }
    case T.FIRE: {
      const fl=Math.random();
      if(fl<0.3){r=255;g=0;b=0;}else if(fl<0.6){r=255;g=120;b=0;}else if(fl<0.85){r=255;g=200;b=0;}else{r=255;g=240;b=180;}
      break;
    }
    default:
      if(p.g){
        // Variant species color override — dramatic hue shift
        if(p.variant?.color&&!p.buff){
          const vh=p.variant.color.hue,vs=p.variant.color.sat;
          const vl=35+((p.hp||100)/100)*18+(lv*6);
          [r,g,b]=hslToRgb(vh,vs,vl);break;
        }
        // Buff visual overrides
        if(p.buff){
          const bt=p.buff.type;
          if(bt==='chromadust'){const h=(p.age*12)%360;[r,g,b]=hslToRgb(h,95,50);break;}
          if(bt==='stimulant'){const pu=Math.sin(p.age*0.3)*0.3+0.7;r=Math.floor(255*pu);g=Math.floor(160*pu);b=0;break;}
          if(bt==='venom'){r=60;g=Math.floor(180+Math.random()*40);b=80;break;}
          if(bt==='gigantism'){const pu=Math.sin(p.age*0.15)*0.3+0.7;r=Math.floor(200*pu);g=Math.floor(60*pu);b=Math.floor(60*pu);break;}
          if(bt==='calcifier'){r=g=b=Math.floor(160+Math.random()*30);break;}
          if(bt==='pheromone'){r=220;g=180;b=40;break;}
          if(bt==='nectar'){r=240;g=220;b=Math.floor(80+Math.sin(p.age*0.2)*40);break;}
          if(bt==='sporebomb'){const pu=Math.sin(p.age*0.4)*0.5+0.5;r=Math.floor(120*pu);g=0;b=Math.floor(180*pu);break;}
        }
        const baseHue=KINGDOM_HUE[p.t]||180;
        const hue=baseHue+(p.g[3]/255)*30-15;
        let sat=50+p.g[4]/255*30;
        let lit=25+((p.hp||100)/100)*20+(lv*8);
        // Neon green ants — high saturation, high lightness
        if(p.t===T.ANT){
          if(p.alpha){r=255;g=200;b=30;break;} // alpha = bright gold
          sat=95;lit=48+((p.hp||100)/100)*12;
        }
        // Deep forest green plants — lower lightness, more saturated
        if(p.t===T.PLANT){sat=70;lit=18+((p.hp||100)/100)*12+(lv*5);}
        // Bioluminescence for fungi in dark
        const glit=(p.t===T.FUNGI&&lv<0.1)?lit+30:lit;
        [r,g,b]=hslToRgb(hue,sat,glit);
      } else {r=g=b=80;}
  }
  // Machine cells rendered here (no p.g, so fall-through above would give grey)
  if(p.t===T.MACHINE){
    if(p.dormant){r=50;g=70;b=90;}  // dim steel-blue while waiting to activate
    else{
      // Cycle hue through rainbow each generation
      const hv=(machineGeneration*37)%360;
      const [cr,cg,cb]=hslToRgb(hv,100,55);
      const fl=Math.random();
      if(fl<0.12){r=255;g=255;b=255;}
      else{r=cr;g=cg;b=cb;}
    }
    return 0xFF000000|(b<<16)|(g<<8)|r;
  }
  if(p.t===T.MACHINE_DEAD){
    const fade=Math.max(0,1-(p.age/5));
    r=Math.floor(220*fade);g=Math.floor(20*fade);b=Math.floor(20*fade);
    return 0xFF000000|(b<<16)|(g<<8)|r;
  }
  if(p.t===T.BACTERIA){
    if(p.dormant){r=10;g=50;b=25;}
    else{
      // Bioluminescent diagonal wave: phase = spatial position + animated tick
      const phase=((x+y)*2+bacteriaWaveTick*2)*Math.PI/180;
      const wave=Math.sin(phase); // -1 to 1
      const hue=130+wave*45;      // 85-175: yellow-green ↔ cyan
      const lit=48+wave*12;       // 36-60 lightness — pulses brightness
      const[cr,cg,cb]=hslToRgb(hue,95,lit);
      if(Math.random()<0.06){r=180;g=255;b=180;} // green sparkle
      else{r=cr;g=cg;b=cb;}
    }
    return 0xFF000000|(b<<16)|(g<<8)|r;
  }
  if(p.t===T.BACTERIA_DEAD){
    const fade=Math.max(0,1-(p.age/5));
    r=Math.floor(20*fade);g=Math.floor(200*fade);b=Math.floor(80*fade);
    return 0xFF000000|(b<<16)|(g<<8)|r;
  }
  // Lucid wave overlay
  if(lucidSources.length>0){
    let bestI=0,bestH=0;
    for(const src of lucidSources){
      const dx=x-src.x,dy=y-src.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const ageFade=Math.max(0,1-src.age/LUCID_LIFETIME);
      const wave=(Math.sin((dist*0.5-src.age*0.18)*Math.PI)*0.5+0.5);
      const intensity=wave*ageFade*(1-dist/(W*1.2));
      if(intensity>bestI){bestI=intensity;bestH=(src.hue+dist*12+src.age*4)%360;}
    }
    if(bestI>0.25){
      const[lr,lg,lb]=hslToRgb(bestH,100,55);
      const blend=bestI*0.65;
      r=Math.min(255,r+Math.round(lr*blend));
      g=Math.min(255,g+Math.round(lg*blend));
      b=Math.min(255,b+Math.round(lb*blend));
    }
  }
  return 0xFF000000|(b<<16)|(g<<8)|r;
}

// ================================================================
//  MACHINE — GoL logic
// ================================================================
function stepMachineDead(x,y,p){
  // Dead-cell flash: cleared after a few ticks (age already incremented by stepParticle)
  if(p.age>=5)grid[idx(x,y)]=null;
}

function endMachineRun(){
  if(!machineRunning)return;
  machineRunning=false;
  const gen=machineGeneration;
  for(let i=0;i<W*H;i++){if(grid[i]?.t===T.MACHINE_DEAD)grid[i]=null;}
  if(gen>machineBestGen){
    machineBestGen=gen;
    try{localStorage.setItem('ant1_machineBest',String(machineBestGen));}catch(e){}
    showEventToast('🦠 VIRUS RECORD',`${gen} generations — new best!`);
  } else {
    showEventToast('🦠 VIRUS HALTED',`Run ended at gen ${gen} · Best: ${machineBestGen}`);
  }
  lastMachinePlacedTime=0;
  machineUniX0=0;machineUniY0=0;machineUniX1=W-1;machineUniY1=H-1;
}

function stepBacteriaDead(x,y,p){
  if(p.age>=5)grid[idx(x,y)]=null;
}

function endBacteriaRun(){
  if(!bacteriaRunning)return;
  bacteriaRunning=false;
  const gen=bacteriaGeneration;
  for(let i=0;i<W*H;i++){if(grid[i]?.t===T.BACTERIA_DEAD)grid[i]=null;}
  if(gen>bacteriaBestGen){
    bacteriaBestGen=gen;
    try{localStorage.setItem('ant1_bacteriaBest',String(bacteriaBestGen));}catch(e){}
    showEventToast('🧫 BACTERIA RECORD',`${gen} gens — new best!`);
  } else {
    showEventToast('🧫 BACTERIA HALTED',`Run ended at gen ${gen} · Best: ${bacteriaBestGen}`);
  }
  lastBacteriaPlacedTime=0;
  bacteriaUniX0=0;bacteriaUniY0=0;bacteriaUniX1=W-1;bacteriaUniY1=H-1;
}

// ================================================================
//  JELLY — wiggly solid, falls slowly, wobbles when settled
// ================================================================
function stepJelly(x,y,p){
  p.age++;
  const bx=x+gv.x,by=y+gv.y;
  const below=inB(bx,by)?get(bx,by):null;
  const belowDens=getDens(below);
  // Fall slowly — young jelly looser, old jelly stiffer
  if(!below||(belowDens<4&&below.t!==T.WORM)){
    const fallChance=p.age<40?0.35:0.15;
    if(Math.random()<fallChance){tryFall(x,y,p);return;}
  }
  // Surface wobble — jelly cells near empty space sway laterally
  if(p.age>15&&Math.random()<0.018){
    const side=Math.random()<0.5?1:-1;
    const wx=x+(gv.y!==0?side:0),wy=y+(gv.y===0?side:0);
    if(inB(wx,wy)){
      const nb=get(wx,wy);
      if(!nb){grid[idx(wx,wy)]=p;grid[idx(x,y)]=null;}
      else if(nb.t===T.JELLY){
        // Swap with adjacent jelly (internal wiggle)
        grid[idx(x,y)]=nb;grid[idx(wx,wy)]=p;
      }
    }
  }
}

// ================================================================
//  WORM — snake-like creature, burrows jelly, eats creatures
// ================================================================
function stepAllWorms(){
  for(const[wid,worm]of worms){
    if(!worm.cells.length){worms.delete(wid);continue;}
    worm.energy-=0.015*worm.cells.length;
    if(worm.energy<=0){killWorm(wid);continue;}
    // Move every 3rd tick
    worm.tick=(worm.tick||0)+1;
    if(worm.tick%3!==0)continue;

    const[hx,hy]=worm.cells[0];
    let[dx,dy]=worm.dir;

    // Choose best direction from forward/left/right
    const dirs=[[dx,dy],[dy,-dx],[-dy,dx]];
    let bestDir=null,bestScore=-999;
    for(const[tdx,tdy]of dirs){
      const tx=hx+tdx,ty=hy+tdy;
      if(!inB(tx,ty)){continue;}
      const tp=get(tx,ty);
      let score=0;
      if(tp===null||tp?.t===T.WEB||tp?.t===T.DETRITUS)score=2;
      else if(tp?.t===T.JELLY)score=10;
      else if(tp?.t===T.ANT||tp?.t===T.TERMITE||tp?.t===T.SPIDER||tp?.t===T.MITE||tp?.t===T.QUEEN)score=8;
      else if(tp?.t===T.WORM&&tp?.wid===wid)score=-100; // own body
      else score=-10; // blocked
      if(score>bestScore){bestScore=score;bestDir=[tdx,tdy];}
    }
    if(!bestDir||bestScore<=-10){
      // Reverse
      worm.dir=[-dx,-dy];continue;
    }
    [dx,dy]=bestDir;worm.dir=[dx,dy];
    const nx=hx+dx,ny=hy+dy;
    if(!inB(nx,ny)){worm.dir=[-dx,-dy];continue;}
    const target=get(nx,ny);

    // Self-eating = death
    if(target?.t===T.WORM&&target?.wid===wid){killWorm(wid);continue;}

    let willGrow=false;
    if(target?.t===T.JELLY){
      worm.energy=Math.min(255,worm.energy+30);
      if(worm.cells.length<30)willGrow=true;
    } else if(target?.t===T.ANT||target?.t===T.TERMITE||target?.t===T.SPIDER||target?.t===T.MITE||target?.t===T.QUEEN){
      worm.energy=Math.min(255,worm.energy+20);
      if(target.g)popDecr(target);
    } else if(target!==null&&target?.t!==T.WEB&&target?.t!==T.DETRITUS){
      continue; // blocked
    }

    // Move snake: remove tail (unless growing), add new head
    if(!willGrow){
      const tail=worm.cells.pop();
      grid[idx(tail[0],tail[1])]=null;
    }
    worm.cells.unshift([nx,ny]);
    grid[idx(nx,ny)]={t:T.WORM,wid,age:0};
  }
}

function stepMachineGoL(){
  // --- Snapshot live cells ---
  const liveCells=[];
  for(let i=0;i<W*H;i++){if(grid[i]?.t===T.MACHINE)liveCells.push(i);}
  if(liveCells.length===0){endMachineRun();return;}
  machineGeneration++;

  // --- Build candidate set: live cells + all their neighbors ---
  const toEval=new Set(liveCells);
  for(const i of liveCells){
    const x=i%W,y=Math.floor(i/W);
    for(const[nx,ny] of getNeighbors(x,y))toEval.add(idx(nx,ny));
  }

  const deaths=[],births=[];
  for(const i of toEval){
    const x=i%W,y=Math.floor(i/W);
    const cell=grid[i];
    const isAlive=cell?.t===T.MACHINE;
    let liveN=0,hazard=false;
    for(const[nx,ny] of getNeighbors(x,y)){
      const n=grid[idx(nx,ny)];
      if(!n)continue;
      if(n.t===T.MACHINE)                                                  liveN++;
      else if(n.t===T.WATER||n.t===T.STEAM||n.t===T.ICE)                  hazard=true;
      else if(n.t===T.FIRE||n.t===T.LAVA||n.t===T.BLOOM_FIRE)             hazard=true;
      else if(n.t===T.ACID)                                                hazard=true;
    }
    if(isAlive){
      if(hazard||liveN<2||liveN>3)deaths.push(i);
    } else {
      if(liveN===3&&!hazard){
        // Birth into empty space or soft matter — but only within the GoL universe (set at activation)
        // Birth only into empty cells, bounded by the GoL universe
        const inUni=x>=machineUniX0&&x<=machineUniX1&&y>=machineUniY0&&y<=machineUniY1;
        if(inUni&&!cell)
          births.push([i,cell]);
      }
    }
  }

  // Apply deaths first
  for(const i of deaths){
    if(grid[i]?.t===T.MACHINE)grid[i]={t:T.MACHINE_DEAD,age:0};
  }
  // Apply births
  for(const[i] of births){
    if(grid[i])continue; // cell now occupied — skip
    grid[i]={t:T.MACHINE,age:0};
  }
  // --- Virus spread: machines infect organic cells, die on loose terrain ---
  const _isOrganic=t=>(t===T.ANT||t===T.QUEEN||t===T.SPIDER||t===T.QUEEN_SPIDER||
    t===T.TERMITE||t===T.QUEEN_TERMITE||t===T.MITE||t===T.QUEEN_MITE||
    t===T.HUNTSMAN||t===T.QUEEN_HUNTSMAN||
    t===T.PLANT||t===T.PLANT_WALL||t===T.FUNGI||t===T.WEB||
    t===T.DETRITUS||t===T.SPORE||t===T.SEED||t===T.EGG||t===T.WOOD);
  const _isTerrainKill=t=>(t===T.SAND||t===T.GOLD_SAND||t===T.WHITE_SAND||
    t===T.SALT||t===T.GUNPOWDER||t===T.ASH);
  const INFECT=0.06, SPREAD=0.18;
  const infectQueue=[], infected=new Set();
  for(const i of liveCells){
    if(grid[i]?.t!==T.MACHINE)continue;
    const x=i%W,y=Math.floor(i/W);
    let terrainDeath=false;
    for(const[nx,ny] of getNeighbors(x,y)){
      const ni=idx(nx,ny),n=grid[ni];
      if(!n)continue;
      if(_isTerrainKill(n.t)){terrainDeath=true;continue;}
      if(_isOrganic(n.t)&&Math.random()<INFECT)infectQueue.push(ni);
    }
    if(terrainDeath&&grid[i]?.t===T.MACHINE)grid[i]={t:T.MACHINE_DEAD,age:0};
  }
  // BFS chain spread — density drives cascade
  while(infectQueue.length){
    const ni=infectQueue.shift();
    if(infected.has(ni))continue;
    const n=grid[ni];
    if(!n||!_isOrganic(n.t))continue;
    infected.add(ni);
    if(n.g)popDecr(n);
    grid[ni]={t:T.MACHINE,age:0};
    const cx=ni%W,cy=Math.floor(ni/W);
    for(const[nx,ny] of getNeighbors(cx,cy)){
      const nni=idx(nx,ny);
      if(!infected.has(nni)&&_isOrganic(grid[nni]?.t)&&Math.random()<SPREAD)infectQueue.push(nni);
    }
  }
  // Check if any machines remain
  let anyAlive=false;
  for(let i=0;i<W*H;i++){if(grid[i]?.t===T.MACHINE){anyAlive=true;break;}}
  if(!anyAlive)endMachineRun();
}

// ================================================================
//  BACTERIA — HighLife (B36/S23) on 2×2 coarse grid
// ================================================================
function stepBacteriaGoL(){
  const CW=Math.floor(W/2),CH=Math.floor(H/2);

  // Identify live coarse cells (2×2 block is "alive" if any fine cell has T.BACTERIA)
  const liveCoarse=new Set();
  for(let cy=0;cy<CH;cy++){
    for(let cx=0;cx<CW;cx++){
      const gx=cx*2,gy=cy*2;
      if(grid[idx(gx,gy)]?.t===T.BACTERIA||grid[idx(gx+1,gy)]?.t===T.BACTERIA||
         grid[idx(gx,gy+1)]?.t===T.BACTERIA||grid[idx(gx+1,gy+1)]?.t===T.BACTERIA){
        liveCoarse.add(cy*CW+cx);
      }
    }
  }
  if(liveCoarse.size===0){endBacteriaRun();return;}
  bacteriaGeneration++;

  // Candidate set: live cells + their 8 coarse neighbors
  const toEval=new Set(liveCoarse);
  for(const ci of liveCoarse){
    const cx=ci%CW,cy=Math.floor(ci/CW);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(dx===0&&dy===0)continue;
      const ncx=cx+dx,ncy=cy+dy;
      if(ncx>=0&&ncx<CW&&ncy>=0&&ncy<CH)toEval.add(ncy*CW+ncx);
    }
  }

  const deaths=[],births=[];
  for(const ci of toEval){
    const cx=ci%CW,cy=Math.floor(ci/CW);
    const isAlive=liveCoarse.has(ci);
    let liveN=0,hazard=false;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(dx===0&&dy===0)continue;
      const ncx=cx+dx,ncy=cy+dy;
      if(ncx<0||ncx>=CW||ncy<0||ncy>=CH)continue;
      if(liveCoarse.has(ncy*CW+ncx)){
        liveN++;
      } else {
        const gx2=ncx*2,gy2=ncy*2;
        for(let by=0;by<2&&!hazard;by++)for(let bx=0;bx<2&&!hazard;bx++){
          const n=get(gx2+bx,gy2+by);
          if(n&&(n.t===T.WATER||n.t===T.FIRE||n.t===T.LAVA||n.t===T.ACID||n.t===T.STEAM||n.t===T.ICE))hazard=true;
        }
      }
    }
    if(isAlive){
      if(hazard||liveN<2||liveN>3)deaths.push(ci);
    } else {
      // HighLife: born on 3 OR 6 neighbors (vs standard GoL's 3 only)
      if((liveN===3||liveN===6)&&!hazard){
        const inUni=cx*2>=bacteriaUniX0&&cx*2<=bacteriaUniX1&&cy*2>=bacteriaUniY0&&cy*2<=bacteriaUniY1;
        if(inUni)births.push(ci);
      }
    }
  }

  // Deaths: mark all 4 fine cells as BACTERIA_DEAD
  for(const ci of deaths){
    const cx=ci%CW,cy=Math.floor(ci/CW),gx=cx*2,gy=cy*2;
    for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){
      const fi=idx(gx+bx,gy+by);
      if(grid[fi]?.t===T.BACTERIA)grid[fi]={t:T.BACTERIA_DEAD,age:0};
    }
  }
  // Births: fill 2×2 block — allow into empty or BACTERIA_DEAD cells (dead cells don't block births)
  for(const ci of births){
    const cx=ci%CW,cy=Math.floor(ci/CW),gx=cx*2,gy=cy*2;
    let ok=true;
    for(let by=0;by<2&&ok;by++)for(let bx=0;bx<2&&ok;bx++){
      const fc=grid[idx(gx+bx,gy+by)];
      if(fc&&fc.t!==T.BACTERIA_DEAD)ok=false;
    }
    if(ok){
      for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){
        grid[idx(gx+bx,gy+by)]={t:T.BACTERIA,age:0};
      }
    }
  }

  // Bacteria infect organic neighbours (lower rate than virus)
  const _isOrganic=t=>(t===T.ANT||t===T.QUEEN||t===T.SPIDER||t===T.QUEEN_SPIDER||
    t===T.TERMITE||t===T.QUEEN_TERMITE||t===T.MITE||t===T.QUEEN_MITE||
    t===T.HUNTSMAN||t===T.QUEEN_HUNTSMAN||
    t===T.PLANT||t===T.PLANT_WALL||t===T.FUNGI||t===T.WEB||
    t===T.DETRITUS||t===T.SPORE||t===T.SEED||t===T.EGG||t===T.WOOD);
  const _isTerrainKill=t=>(t===T.SAND||t===T.GOLD_SAND||t===T.WHITE_SAND||
    t===T.SALT||t===T.GUNPOWDER||t===T.ASH);
  const INFECT=0.04,SPREAD=0.12;
  const infectQueue=[],infected=new Set();
  for(const ci of liveCoarse){
    const cx=ci%CW,cy=Math.floor(ci/CW),gx=cx*2,gy=cy*2;
    for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){
      const fi=idx(gx+bx,gy+by);
      if(grid[fi]?.t!==T.BACTERIA)continue;
      const fx=gx+bx,fy=gy+by;
      let terrainDeath=false;
      for(const[nx,ny] of getNeighbors(fx,fy)){
        const ni=idx(nx,ny),n=grid[ni];
        if(!n)continue;
        if(_isTerrainKill(n.t)){terrainDeath=true;continue;}
        if(_isOrganic(n.t)&&Math.random()<INFECT)infectQueue.push(ni);
      }
      if(terrainDeath&&grid[fi]?.t===T.BACTERIA)grid[fi]={t:T.BACTERIA_DEAD,age:0};
    }
  }
  while(infectQueue.length){
    const ni=infectQueue.shift();
    if(infected.has(ni))continue;
    const n=grid[ni];
    if(!n||!_isOrganic(n.t))continue;
    infected.add(ni);
    if(n.g)popDecr(n);
    grid[ni]={t:T.BACTERIA,age:0};
    const cx2=ni%W,cy2=Math.floor(ni/W);
    for(const[nx,ny] of getNeighbors(cx2,cy2)){
      const nni=idx(nx,ny);
      if(!infected.has(nni)&&_isOrganic(grid[nni]?.t)&&Math.random()<SPREAD)infectQueue.push(nni);
    }
  }

  let stillAlive=false;
  for(let i=0;i<W*H;i++){if(grid[i]?.t===T.BACTERIA){stillAlive=true;break;}}
  if(!stillAlive)endBacteriaRun();
}

// ================================================================
//  SIMULATION LOOP
// ================================================================
let lastTime=0,stepAccum=0,updateOrder=[],stepsSince=0,uiFrame=0;

// Pre-allocated TypedArray for shuffle — avoids creating a new 24k-element
// array every 80 ticks. In-place Fisher-Yates swap is also faster.
const _ORDER_BUF = new Int32Array(W*H);
for(let i=0;i<W*H;i++) _ORDER_BUF[i]=i;
function buildOrder(){
  for(let i=W*H-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=_ORDER_BUF[i];_ORDER_BUF[i]=_ORDER_BUF[j];_ORDER_BUF[j]=t;}
  updateOrder=_ORDER_BUF;
}

function simStep(){
  // Reshuffle every 80 ticks (was 40) — still provides sufficient randomness
  if(++stepsSince>80){buildOrder();stepsSince=0;}
  // Use indexed loop + pre-computed x/y — avoids i%W / Math.floor(i/W) per cell
  const len=W*H;
  for(let k=0;k<len;k++){const i=updateOrder[k];if(grid[i])stepParticle(_CX[i],_CY[i]);}
  stepAllWorms();
  // Light raycast every 2 ticks — halves the 6,000-op cost, visually imperceptible
  if(tickCount%2===0) updateLight();

  // Spontaneous fire from oil/detritus
  if(tickCount%300===0){
    for(let a=0;a<30;a++){
      const i=Math.floor(Math.random()*W*H);
      const p=grid[i];
      if(!p||!(p.t===T.OIL||p.t===T.DETRITUS))continue;
      const x=i%W,y=Math.floor(i/W);
      const hasWater=getNeighbors(x,y).some(([nx,ny])=>get(nx,ny)?.t===T.WATER);
      if(!hasWater&&Math.random()<0.004)grid[i]={t:T.FIRE,age:0,ttl:25};
    }
  }

  updateNarrator();
  weatherTick();

  // RAIN: drop water particles along top edge each tick while active
  if(rainActive){
    rainTicks++;
    const drops=3+Math.floor(Math.random()*4);
    for(let d=0;d<drops;d++){
      const rx=Math.floor(Math.random()*W);
      // Find the top row (against gravity direction)
      const ty2=gv.y>0?0:(gv.y<0?H-1:gv.x>0?0:W-1);
      const tx2=gv.x===0?rx:(gv.x>0?0:W-1);
      const ry2=gv.y===0?rx:ty2;
      const finalX=gv.y!==0?rx:tx2;
      const finalY=gv.y!==0?ty2:ry2;
      if(inB(finalX,finalY)&&!grid[idx(finalX,finalY)])
        grid[idx(finalX,finalY)]={t:T.WATER,age:0};
    }
    if(rainTicks>=rainDuration)rainActive=false;
  }

  // ACID RAIN: drop acid from top
  if(acidRainActive){
    acidRainTicks++;
    for(let d=0;d<2;d++){
      const rx=Math.floor(Math.random()*W);
      const ty2=gv.y>0?0:H-1;
      if(inB(rx,ty2)&&!grid[idx(rx,ty2)])
        grid[idx(rx,ty2)]={t:T.ACID,age:0,ttl:120};
    }
    if(acidRainTicks>=acidRainDuration)acidRainActive=false;
  }

  // Pheromone decay — every 3 ticks (3× decay rate to compensate), saves 2/3 of loop cost
  if(tickCount%3===0) for(let i=0;i<W*H;i++){if(pheroGrid[i]>0)pheroGrid[i]=Math.max(0,pheroGrid[i]-0.012);}

  // Sample population history every 100 ticks
  if(tickCount-lastPopSample>=100){
    lastPopSample=tickCount;
    for(const t of [T.PLANT,T.ANT,T.TERMITE,T.QUEEN,T.QUEEN_TERMITE,T.SPIDER,T.FUNGI,T.MITE,T.QUEEN_SPIDER,T.QUEEN_MITE,T.HUNTSMAN,T.QUEEN_HUNTSMAN]){
      POP_HISTORY[t].push(POP[t]);
      if(POP_HISTORY[t].length>POP_GRAPH_MAX) POP_HISTORY[t].shift();
    }
  }

  // Recount populations every 60 ticks (was 20) — popIncr/popDecr keep counts accurate
  if(tickCount%60===0){
    for(const k of Object.keys(POP))POP[k]=0;
    for(const p of grid){if(p?.g&&POP[p.t]!==undefined)POP[p.t]++;}
    for(const[id,s]of strainRegistry){s.pop=0;}
    for(const p of grid){if(p?.sid){const s=strainRegistry.get(p.sid);if(s){s.pop++;s.peak=Math.max(s.peak,s.pop);}}}
  }

  // --- VIRUS (GoL) — auto-activate 5s after last placement ---
  bacteriaWaveTick++;
  if(!machineRunning&&lastMachinePlacedTime>0&&Date.now()-lastMachinePlacedTime>=MACHINE_ACTIVATION_DELAY){
    let hm=false;for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.MACHINE){hm=true;break;}}
    if(hm){
      for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.MACHINE)grid[mi].dormant=false;}
      machineUniX0=0;machineUniY0=0;machineUniX1=W-1;machineUniY1=H-1;
      machineRunning=true;machineGeneration=0;
      showEventToast('🦠 VIRUS ACTIVATED','Conway\'s Game of Life — begin!');
    }
    lastMachinePlacedTime=0;
  }
  if(machineRunning&&tickCount%MACHINE_TICK_RATE===0)stepMachineGoL();

  // --- BACTERIA (HighLife) — auto-activate 5s after last placement ---
  if(!bacteriaRunning&&lastBacteriaPlacedTime>0&&Date.now()-lastBacteriaPlacedTime>=BACTERIA_ACTIVATION_DELAY){
    let hb=false;for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.BACTERIA){hb=true;break;}}
    if(hb){
      for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.BACTERIA)grid[mi].dormant=false;}
      bacteriaUniX0=0;bacteriaUniY0=0;bacteriaUniX1=W-1;bacteriaUniY1=H-1;
      bacteriaRunning=true;bacteriaGeneration=0;
      showEventToast('🧫 BACTERIA ACTIVATED','HighLife — replicators awaken!');
    }
    lastBacteriaPlacedTime=0;
  }
  if(bacteriaRunning&&tickCount%BACTERIA_TICK_RATE===0)stepBacteriaGoL();

  // Age lucid wave sources
  for(let i=lucidSources.length-1;i>=0;i--){
    lucidSources[i].age++;
    if(lucidSources[i].age>LUCID_LIFETIME)lucidSources.splice(i,1);
  }
  if(entropyRate>0)stepEntropy();
  tickCount++;
}

// ================================================================
//  ENTROPY — chaos event system
//  Events are grouped into tiers by frequency and impact.
// ================================================================
function stepEntropy(){
  const r=entropyRate; // 0-1
  function rndCell(){return[Math.floor(Math.random()*W),Math.floor(Math.random()*H)];}
  function rndEmpty(){let[x,y]=rndCell();return(!get(x,y))?[x,y]:null;}

  // ── TIER 1: Atmospheric (spark, drip, gust) ──────────────────────
  // fire spark, water drip, smoke puff, steam vent, ash scatter, detritus deposit
  if(Math.random()<r*0.14){
    const pos=rndEmpty();if(pos){
      const[x,y]=pos;
      const pick=Math.random();
      if(pick<0.25)      grid[idx(x,y)]={t:T.FIRE,age:0,ttl:15+Math.floor(Math.random()*25)};
      else if(pick<0.45) grid[idx(x,y)]={t:T.SMOKE,age:0,ttl:40+Math.floor(Math.random()*40)};
      else if(pick<0.60) grid[idx(x,y)]={t:T.STEAM,age:0,ttl:40+Math.floor(Math.random()*50)};
      else if(pick<0.75) grid[idx(x,y)]={t:T.WATER,age:0};
      else if(pick<0.87) grid[idx(x,y)]={t:T.DETRITUS,age:0};
      else               grid[idx(x,y)]={t:T.ASH,age:0};
    }
  }

  // ── TIER 2: Chemical (acid, lava, ice, drugs) ─────────────────────
  if(Math.random()<r*0.06){
    const pos=rndEmpty();if(pos){
      const[x,y]=pos;
      const pick=Math.random();
      if(pick<0.18)      grid[idx(x,y)]={t:T.ACID,age:0,ttl:200+Math.floor(Math.random()*150)};
      else if(pick<0.32) grid[idx(x,y)]={t:T.OIL,age:0};
      else if(pick<0.44) grid[idx(x,y)]={t:T.LAVA,age:0,ttl:300+Math.floor(Math.random()*200)};
      else if(pick<0.55) grid[idx(x,y)]={t:T.ICE,age:0,ttl:600+Math.floor(Math.random()*400)};
      else if(pick<0.65) grid[idx(x,y)]={t:T.SALT,age:0};
      else if(pick<0.73) grid[idx(x,y)]={t:T.MUTAGEN,age:0};
      else if(pick<0.82) grid[idx(x,y)]={t:T.LUCID,age:0,ttl:200};
      else if(pick<0.91) grid[idx(x,y)]={t:T.CRANK,age:0,ttl:200};
      else{
        // Chromadust shower (3-6 particles from top)
        const count=3+Math.floor(Math.random()*4);
        for(let i=0;i<count;i++){
          const cx=Math.floor(Math.random()*W),cy=Math.floor(Math.random()*8);
          if(inB(cx,cy)&&!get(cx,cy)){
            const hue=Math.floor(Math.random()*12)*30;
            if(!chromaStrains.has(hue))chromaStrains.set(hue,createChromaCreature(hue));
            grid[idx(cx,cy)]={t:T.CHROMADUST,age:0,hue,ttl:150+Math.floor(Math.random()*80)};
          }
        }
      }
    }
  }

  // ── TIER 3: Biological (creature/plant/fungi spawn) ───────────────
  if(Math.random()<r*0.035){
    const pos=rndEmpty();if(pos){
      const[x,y]=pos;
      const genome=Array(6).fill(0).map(()=>100+Math.floor(Math.random()*100));
      const pick=Math.random();
      let t2=null;
      if(pick<0.22)      t2=T.ANT;
      else if(pick<0.38) t2=T.SPIDER;
      else if(pick<0.50) t2=T.MITE;
      else if(pick<0.62) t2=T.TERMITE;
      else if(pick<0.72) t2=T.FUNGI;
      else if(pick<0.80) t2=T.PLANT;
      else if(pick<0.86) t2=T.SEED;
      else if(pick<0.91){grid[idx(x,y)]={t:T.SPORE,age:0,ttl:180};t2=null;}
      else if(pick<0.96){grid[idx(x,y)]={t:T.ALGAE,age:0};t2=null;}
      else               {grid[idx(x,y)]={t:T.EGG,age:0,g:genome,hp:20,energy:80};t2=null;}
      if(t2){
        const cell=agentWithStrain(t2,genome,null,{energy:120});
        if(cell){grid[idx(x,y)]=cell;popIncr(cell);}
      }
    }
  }

  // ── TIER 4: Cosmic events (rare, high-impact) ─────────────────────
  if(Math.random()<r*0.010){
    const cosmic=Math.random();

    if(cosmic<0.14){
      // ☄️ Meteorite — lava core + fire blast radius
      const[cx,cy]=rndCell();
      for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
        const fx=cx+dx,fy=cy+dy;if(!inB(fx,fy))continue;
        const dist=Math.sqrt(dx*dx+dy*dy);
        const ec=get(fx,fy);if(ec?.g)popDecr(ec);
        if(dist<=1.5) grid[idx(fx,fy)]={t:T.LAVA,age:0,ttl:400+Math.floor(Math.random()*200)};
        else if(dist<=3) grid[idx(fx,fy)]={t:T.FIRE,age:0,ttl:20+Math.floor(Math.random()*30)};
      }
    }
    else if(cosmic<0.26){
      // ⚡ Lightning — vertical fire column from sky
      const lx=Math.floor(Math.random()*W);
      const depth=8+Math.floor(Math.random()*20);
      for(let ly=0;ly<depth;ly++){
        if(!inB(lx,ly))continue;
        const ec=get(lx,ly);if(ec?.g)popDecr(ec);
        grid[idx(lx,ly)]={t:T.FIRE,age:0,ttl:20+Math.floor(Math.random()*25)};
      }
    }
    else if(cosmic<0.38){
      // 👑 Surprise queen spawns
      const pos=rndEmpty();if(pos){
        const[x,y]=pos;
        const qtypes=[T.QUEEN,T.QUEEN_SPIDER,T.QUEEN_MITE,T.QUEEN_TERMITE,T.QUEEN_HUNTSMAN];
        const qt=qtypes[Math.floor(Math.random()*qtypes.length)];
        const popKey=qt===T.QUEEN?T.QUEEN:qt;
        if((POP[popKey]||0)<(POP_MAX[popKey]||10)){
          const genome=Array(6).fill(0).map(()=>80+Math.floor(Math.random()*120));
          const cell=agentWithStrain(qt,genome,null,{energy:200});
          if(cell){grid[idx(x,y)]=cell;popIncr(cell);}
        }
      }
    }
    else if(cosmic<0.50){
      // 🦠 Rogue VIRUS cells appear
      if(!machineRunning){
        const count=2+Math.floor(Math.random()*4);
        for(let i=0;i<count;i++){
          const pos=rndEmpty();
          if(pos){grid[idx(pos[0],pos[1])]={t:T.MACHINE,age:0};lastMachinePlacedTime=lastMachinePlacedTime||Date.now();}
        }
      }
    }
    else if(cosmic<0.62){
      // 🧫 Rogue BACTERIA cluster appears
      if(!bacteriaRunning){
        const ccx=Math.floor(Math.random()*(W/2))*2;
        const ccy=Math.floor(Math.random()*(H/2))*2;
        for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){
          if(inB(ccx+bx,ccy+by)&&!get(ccx+bx,ccy+by))
            grid[idx(ccx+bx,ccy+by)]={t:T.BACTERIA,age:0};
        }
        if(!lastBacteriaPlacedTime)lastBacteriaPlacedTime=Date.now();
      }
    }
    else if(cosmic<0.72){
      // 🪱 Worm spawns from nowhere
      const[wx,wy]=rndCell();
      const wid=wormNextId++;
      const cells2=[];
      for(let i=0;i<5;i++){const cx=wx+i,cy=wy;if(!inB(cx,cy)||get(cx,cy))continue;cells2.push([cx,cy]);grid[idx(cx,cy)]={t:T.WORM,wid,age:0};}
      if(cells2.length>=2)worms.set(wid,{cells:cells2,dir:[1,0],energy:200,tick:0});
    }
    else if(cosmic<0.82){
      // 💥 Gunpowder chain reaction — scatter a few GP cells near existing fire
      let ignition=null;
      for(let i=0;i<W*H;i++){if(grid[i]?.t===T.FIRE){ignition=i;break;}}
      if(ignition){
        const ix=ignition%W,iy=Math.floor(ignition/W);
        const count=4+Math.floor(Math.random()*6);
        for(let i=0;i<count;i++){
          const gx=ix+Math.floor((Math.random()-0.5)*12),gy=iy+Math.floor((Math.random()-0.5)*12);
          if(inB(gx,gy)&&!get(gx,gy))grid[idx(gx,gy)]={t:T.GUNPOWDER,age:0};
        }
      }
    }
    else if(cosmic<0.91){
      // 🧬 Custom creature spontaneously appears (if lab has creatures)
      if(customCreatures.size>0){
        const ids=[...customCreatures.keys()];
        const id=ids[Math.floor(Math.random()*ids.length)];
        const def=customCreatures.get(id);
        if(def){
          const pos=rndEmpty();if(pos){
            const cell=spawnCustomCell(id,pos[0],pos[1],false);
            if(cell){grid[idx(pos[0],pos[1])]=cell;POP[id]=(POP[id]||0)+1;}
          }
        }
      }
    }
    else {
      // 🌊 Flood surge — water erupts from a random edge
      const side=Math.floor(Math.random()*4);
      const count=5+Math.floor(Math.random()*10);
      for(let i=0;i<count;i++){
        let wx2,wy2;
        if(side===0){wx2=Math.floor(Math.random()*W);wy2=0;}
        else if(side===1){wx2=W-1;wy2=Math.floor(Math.random()*H);}
        else if(side===2){wx2=Math.floor(Math.random()*W);wy2=H-1;}
        else{wx2=0;wy2=Math.floor(Math.random()*H);}
        if(inB(wx2,wy2)&&!get(wx2,wy2))grid[idx(wx2,wy2)]={t:T.WATER,age:0};
      }
    }
  }
}

function _legacyLoop(t){
  /* RAF handled by createEngine */
  const dt=t-lastTime;lastTime=t;
  if(speedMult>0){
    stepAccum+=dt;
    const stepMs=50/speedMult;
    let steps=0;
    while(stepAccum>=stepMs&&steps<Math.min(Math.ceil(speedMult)*2,10)){simStep();stepAccum-=stepMs;steps++;}
  } else { stepAccum=0; }
  render();
  if(uiFrame++%8===0)updateUI();
}

// ================================================================
//  UI
// ================================================================
function updateUI(){
  _dom('tick').textContent=tickCount.toLocaleString();
  _dom('era').textContent='ERA: '+getEra();

  // Stats
  const s=_dom('estats');
  const totalPop=Object.values(POP).reduce((a,b)=>a+b,0);
  const strains=[...strainRegistry.values()].length;
  s.innerHTML=[
    ['TOTAL AGENTS',totalPop],['STRAINS',strains],
    ['PLANTS',POP[T.PLANT]],['ANTS',POP[T.ANT]],['TERMITES',POP[T.TERMITE]],['QUEENS',POP[T.QUEEN]],
    ['SPIDERS',POP[T.SPIDER]],['HUNTSMEN',POP[T.HUNTSMAN]],['FUNGI',POP[T.FUNGI]],['MITES',POP[T.MITE]],
  ].map(([n,v])=>`<div class="statrow"><span class="sname">${n}</span><span class="sval">${v}</span></div>`).join('');

  // Population bars
  const kbarsEl=_dom('kbars');
  const kbarData=[
    [T.PLANT,'PLANT',K_COLORS[T.PLANT]],[T.ANT,'ANT',K_COLORS[T.ANT]],[T.TERMITE,'TERMITE',K_COLORS[T.TERMITE]],
    [T.QUEEN,'QUEEN',K_COLORS[T.QUEEN]],[T.SPIDER,'SPIDER',K_COLORS[T.SPIDER]],
    [T.HUNTSMAN,'HUNTSMAN',K_COLORS[T.HUNTSMAN]],
    [T.FUNGI,'FUNGI',K_COLORS[T.FUNGI]],[T.MITE,'MITE',K_COLORS[T.MITE]],
  ];
  kbarsEl.innerHTML=kbarData.map(([type,name,col])=>{
    const pct=Math.min(100,Math.round(POP[type]/POP_MAX[type]*100));
    return `<div class="kbar-row"><div class="kbar-name" style="color:${col}">${name}</div><div class="kbar-wrap"><div class="kbar-fill" style="width:${pct}%;background:${col}"></div></div><div class="kbar-count">${POP[type]}</div></div>`;
  }).join('');

  // Kingdom ledger
  renderLedger();
  // Population history graph
  drawPopGraph();
  // Custom creature list
  updateCustomList();
}

// ================================================================
//  POPULATION GRAPH
// ================================================================
function drawPopGraph(){
  const tracker=_dom('pop-tracker');
  if(!tracker)return;

  const series=[
    {t:T.PLANT, name:'PLANT',  col:K_COLORS[T.PLANT]},
    {t:T.ANT,   name:'ANT',    col:K_COLORS[T.ANT]},
    {t:T.TERMITE, name:'TERMITE',  col:K_COLORS[T.TERMITE]},
    {t:T.QUEEN,   name:'QUEEN',    col:K_COLORS[T.QUEEN]},
    {t:T.SPIDER,  name:'SPIDER',   col:K_COLORS[T.SPIDER]},
    {t:T.HUNTSMAN,name:'HUNTSMAN', col:K_COLORS[T.HUNTSMAN]},
    {t:T.FUNGI,   name:'FUNGI',    col:K_COLORS[T.FUNGI]},
    {t:T.MITE,    name:'MITE',     col:K_COLORS[T.MITE]},
  ];

  const SW=169, SH=20; // sparkline dimensions

  let html='';
  for(const {t,name,col} of series){
    const hist=POP_HISTORY[t];
    const cur=POP[t];
    const max=POP_MAX[t];
    const pct=Math.min(100,Math.round(cur/max*100));

    // Build SVG polyline points
    let points='';
    if(hist.length>=2){
      const hmax=Math.max(1,...hist);
      for(let i=0;i<hist.length;i++){
        const px=Math.round(i/Math.max(1,hist.length-1)*(SW-2))+1;
        const py=Math.round((1-hist[i]/hmax)*(SH-3))+1;
        points+=`${px},${py} `;
      }
    } else {
      points=`0,${SH-1} ${SW},${SH-1}`;
    }

    html+=`<div style="display:flex;flex-direction:column;gap:2px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:7px;color:${col};letter-spacing:1px;">${name}</span>
        <span style="font-size:7px;color:${col};font-weight:bold;">${cur}</span>
      </div>
      <svg width="${SW}" height="${SH}" style="display:block;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.06);">
        <polyline points="${points}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round" opacity="0.9"/>
        <line x1="0" y1="${SH-1}" x2="${SW}" y2="${SH-1}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
      </svg>
    </div>`;
  }
  tracker.innerHTML=html;
} // end drawPopTracker (formerly drawPopGraph)

function getEra(){
  const total=Object.values(POP).reduce((a,b)=>a+b,0);
  if(tickCount<300)return'PRIMORDIAL';
  if(total===0)return'EXTINCTION';
  if(POP[T.QUEEN]===0&&POP[T.ANT]>0)return'WORKER SWARM';
  if(POP[T.SPIDER]===0)return'ANT DOMINANCE';
  if(POP[T.PLANT]===0&&POP[T.FUNGI]===0)return'BARREN AGE';
  if(Object.values(POP).every(v=>v>5))return'BALANCED ECOSYSTEM';
  if(POP[T.ANT]>150)return'ANT EXPLOSION';
  if(POP[T.SPIDER]>50)return'SPIDER SURGE';
  if(POP[T.FUNGI]>150)return'FUNGAL BLOOM';
  return'DIVERSIFICATION';
}

function renderLedger(){
  const klist=_dom('klist');
  // Show top 8 most populous strains
  const active=[...strainRegistry.values()].filter(s=>s.pop>0).sort((a,b)=>b.pop-a.pop).slice(0,8);
  klist.innerHTML=active.map(s=>{
    const pct=Math.round(s.pop/Math.max(s.peak,1)*100);
    const kname=K_NAMES[s.type]||'?';
    const hue=KINGDOM_HUE[s.type]||180;
    const col=K_COLORS[s.type]||'#888';
    return `<div class="kl-entry" onclick="openMutPopup(${s.id})" title="Click to inspect genome">
      <div class="kl-name" style="color:${col}">${kname} STRAIN·${s.id}</div>
      <div class="kl-stats">POP:${s.pop} AGE:${tickCount-s.born}</div>
      <div class="kl-bar" style="width:${pct}%;background:${col}"></div>
    </div>`;
  }).join('');
}

// ================================================================
//  MUTATION / GENOME POPUP
// ================================================================
function openMutPopup(sid){
  const s=strainRegistry.get(sid);
  if(!s)return;
  const el=_dom('mut-card-content');
  const kname=K_NAMES[s.type]||'?';
  const col=K_COLORS[s.type]||'#888';
  const gnames=['DENSITY','MOBILITY','APPETITE','AGGRESSION','RESILIENCE','REPRO'];
  const gcols=['#ffaa44','#44ffcc','#aaff44','#ff4444','#aaaaaa','#ff44ff'];

  // Gene bars
  const bars=s.genome.map((v,i)=>`
    <div class="gene-row">
      <div class="gene-lbl">${gnames[i]}</div>
      <div class="gene-bar"><div class="gene-fill" style="width:${Math.round(v/255*100)}%;background:${gcols[i]}"></div></div>
      <div class="gene-val">${v}</div>
    </div>`).join('');

  // Trait interpretations
  const g=s.genome;
  const traits=[];
  const interp=(lo,hi,v,labels)=>v<lo?labels[0]:v>hi?labels[2]:labels[1];

  if(s.type===T.PLANT){
    traits.push(`<div class="trait-line">${interp(80,160,g[0],'🌱 <b>Lightweight</b> — floats','🌿 <b>Grounded</b> — normal weight','🪨 <b>Heavy</b> — sinks in water')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[1],'🐌 <b>Slow grower</b>','🌿 <b>Normal growth</b>','⚡ <b>Fast spreader</b> — colonises quickly')}</div>`);
    traits.push(`<div class="trait-line">${interp(40,140,g[2],'☁ <b>Low light need</b> — thrives in shade','☀ <b>Normal light need</b>','🔆 <b>High light need</b> — must be near sun')}</div>`);
    traits.push(`<div class="trait-line">${interp(50,180,g[5],'🪴 <b>Conservative spreader</b>','🌿 <b>Normal spread rate</b>','🌳 <b>Aggressive coloniser</b> — spreads rapidly')}</div>`);
  } else if(s.type===T.ANT||s.type===T.QUEEN){
    traits.push(`<div class="trait-line">${interp(80,150,g[1],'🐢 <b>Slow ant</b> — low energy cost','🐜 <b>Normal speed</b>','⚡ <b>Fast runner</b> — burns energy quickly')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[2],'😐 <b>Low appetite</b> — efficient','🍃 <b>Normal hunger</b>','🍖 <b>Voracious</b> — eats plants aggressively')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[3],'☮ <b>Passive</b> — avoids conflict','⚔ <b>Normal aggression</b>','💢 <b>Aggressive</b> — attacks anything edible')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,180,g[5],'🐘 <b>Rare reproduction</b>','🐜 <b>Normal colony growth</b>','🐇 <b>Rapid breeders</b> — colony expands fast')}</div>`);
  } else if(s.type===T.SPIDER){
    traits.push(`<div class="trait-line">${interp(80,160,g[1],'🕷 <b>Ambush predator</b> — waits patiently','🕸 <b>Normal hunter</b>','🏃 <b>Active stalker</b> — chases prey')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[3],'☮ <b>Passive</b> — hunts only when starving','🕷 <b>Normal aggression</b>','💀 <b>Deadly aggressor</b> — attacks on sight')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[4],'💉 <b>Weak venom</b>','☠ <b>Normal venom</b>','🧪 <b>Powerful venom</b> — kills in fewer bites')}</div>`);
    traits.push(`<div class="trait-line">${interp(40,120,g[5],'🕸 <b>Heavy webber</b> — lays much web','🕸 <b>Normal web rate</b>','🦴 <b>Lean predator</b> — rarely webs')}</div>`);
  } else if(s.type===T.FUNGI){
    traits.push(`<div class="trait-line">${interp(60,150,g[1],'🍄 <b>Slow spreader</b>','🍄 <b>Normal spread</b>','🌫 <b>Rapid coloniser</b> — spreads fast in dark')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[2],'😐 <b>Weak decomposer</b>','🍂 <b>Normal decomposer</b>','💀 <b>Voracious decomposer</b> — eats detritus fast')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[3],'☀ <b>Light tolerant</b> — less sun damage','🌑 <b>Normal light sensitivity</b>','🌑 <b>Shade obligate</b> — dies quickly in light')}</div>`);
    traits.push(`<div class="trait-line">${interp(60,150,g[5],'💨 <b>Rare spores</b>','🌫 <b>Normal spore release</b>','☁ <b>Heavy sporulator</b> — spreads spores constantly')}</div>`);
  } else if(s.type===T.MITE){
    traits.push(`<div class="trait-line">${interp(80,170,g[1],'🐌 <b>Slow mite</b>','🐜 <b>Normal speed</b>','⚡ <b>Lightning fast</b> — very hard to catch')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,160,g[2],'😐 <b>Low fungi appetite</b>','🍄 <b>Normal appetite</b>','🍄 <b>Fungus fanatic</b> — eats fungi extremely fast')}</div>`);
    traits.push(`<div class="trait-line">${interp(80,180,g[5],'🐘 <b>Slow reproducer</b>','🐜 <b>Normal reproduction</b>','🐇 <b>Rapid breeder</b> — swarm quickly')}</div>`);
  }

  el.innerHTML=`
    <div class="mc-title" style="color:${col}">${kname} STRAIN·${sid}</div>
    <div style="font-size:7px;color:var(--dim);margin-bottom:10px;">BORN T:${s.born} · POP:${s.pop} · PEAK:${s.peak}${s.parentId?` · PARENT:${s.parentId}`:' · PROGENITOR'}</div>
    <div class="mc-sec">GENOME</div>
    ${bars}
    <div class="mc-sec">BEHAVIORAL TRAITS</div>
    ${traits.join('')}
  `;
  _dom('mut-popup').classList.add('open');
}
function closeMutPopup(){_dom('mut-popup').classList.remove('open');}
_dom('mut-popup').addEventListener('click',e=>{if(e.target===_dom('mut-popup'))closeMutPopup();});

// ================================================================
//  INSPECT
// ================================================================
function inspectCell(clientX,clientY){
  const [gx,gy]=canvasToGrid(clientX,clientY);
  const p=get(gx,gy);
  const el=_dom('iinfo');
  if(!p){el.textContent=`(${gx},${gy}) — empty`;return;}
  let tname;
  if(p.customType!==undefined){const def=customCreatures.get(p.customType);tname=def?`${def.icon} ${def.name}`:`CUSTOM:${p.customType}`;}
  else tname=Object.entries(T).find(([k,v])=>v===p.t)?.[0]||p.t;
  let html=`<b style="color:#fff">(${gx},${gy}) ${tname}</b><br>AGE:${p.age}`;
  if(p.g){
    if(p.customType!==undefined){
      const def=customCreatures.get(p.customType);
      html+=`<br>HP:${Math.round(p.hp||0)} E:${Math.round(p.energy||0)}`;
      if(def) html+=`<br>${def.archetype.toUpperCase()} · ${def.movement.name} · ${def.diet.name}<br>POP:${POP[p.customType]||0}`;
    } else {
      html+=`<br>HP:${Math.round(p.hp||0)} E:${Math.round(p.energy||0)}<br>STRAIN:${p.sid}<br>G:[${p.g.join(',')}]`;
    }
  }
  if(p.t===T.WATER||p.t===T.OIL)html+=`<br>LIGHT:${lightGrid[idx(gx,gy)].toFixed(2)}`;
  el.innerHTML=html;
}

// ================================================================
//  HOVER TOOLTIP
// ================================================================
const TIP_LABELS={
  [T.WALL]:'WALL',[T.FRIDGE_WALL]:'FRIDGE WALL',[T.CLAY]:'CLAY (wet)',[T.CLAY_HARD]:'CLAY (set)',[T.SAND]:'SAND',[T.GOLD_SAND]:'GOLD SAND',
  [T.WHITE_SAND]:'WHITE SAND',[T.DETRITUS]:'DETRITUS',[T.WATER]:'WATER',
  [T.OIL]:'OIL',[T.FIRE]:'FIRE',[T.MUTAGEN]:'LIFE SEED',
  [T.PLANT]:'PLANT',[T.ANT]:'ANT',[T.TERMITE]:'TERMITE',[T.QUEEN]:'QUEEN',
  [T.SPIDER]:'SPIDER',[T.FUNGI]:'FUNGI',[T.MITE]:'MITE',
  [T.HUNTSMAN]:'HUNTSMAN',[T.QUEEN_HUNTSMAN]:'Q.HUNTSMAN',
  [T.PLANT_WALL]:'PLANT WALL',[T.WEB]:'WEB',[T.SPORE]:'SPORE',[T.EGG]:'EGG',
  [T.TUNNEL_WALL]:'TUNNEL WALL',
  [T.FROGSTONE]:'FROGSTONE',
};
const TIP_COLORS={
  [T.WALL]:'#888',[T.FRIDGE_WALL]:'#44aaee',[T.CLAY]:'#7a8599',[T.CLAY_HARD]:'#5e6a7a',[T.SAND]:'#c4a35a',[T.GOLD_SAND]:'#ffc800',
  [T.WHITE_SAND]:'#dcdcd7',[T.DETRITUS]:'#7a6040',[T.WATER]:'#3c82c8',
  [T.OIL]:'#4a7a28',[T.FIRE]:'#ff6600',[T.MUTAGEN]:'#cc44ff',
  [T.PLANT]:K_COLORS[T.PLANT],[T.ANT]:K_COLORS[T.ANT],[T.QUEEN]:K_COLORS[T.QUEEN],
  [T.SPIDER]:K_COLORS[T.SPIDER],[T.FUNGI]:K_COLORS[T.FUNGI],[T.MITE]:K_COLORS[T.MITE],
  [T.PLANT_WALL]:'#226622',[T.WEB]:'#aaaaaa',[T.SPORE]:'#9955cc',[T.EGG]:'#ddcc88',
  [T.FROGSTONE]:'#88cc44',[T.TERMITE]:'#20b8a8',[T.QUEEN_TERMITE]:'#40d8c0',[T.TUNNEL_WALL]:'#556688',
  [T.HUNTSMAN]:'#c86020',[T.QUEEN_HUNTSMAN]:'#e89000',
};

function updateHoverTip(clientX, clientY){
  const tip=_dom('hover-tip');
  const[gx,gy]=canvasToGrid(clientX,clientY);
  const p=get(gx,gy);

  let html='';
  if(!p){
    tip.style.display='none';
    return;
  }

  let label, col;
  if(p.customType!==undefined){
    const def=customCreatures.get(p.customType);
    label=def?`${def.icon} ${def.name}`:`CUSTOM:${p.customType}`;
    col=def?`hsl(${def.hue},${def.sat}%,65%)`:'#aaaacc';
  } else {
    label=TIP_LABELS[p.t]||`TYPE:${p.t}`;
    col=TIP_COLORS[p.t]||'#888';
  }

  html=`<div class="ht-type" style="color:${col}">${label}</div>`;

  if(p.g){
    // Kingdom agent
    const strain=strainRegistry.get(p.sid);
    const hp=Math.round(p.hp||0);
    const en=Math.round(p.energy||0);
    const hpBar=makeBar(hp,100,col);
    const enBar=makeBar(en,255,'#00ff88');
    html+=`<div class="ht-stat">HP ${hpBar} ${hp}  E ${enBar} ${en}</div>`;
    html+=`<div class="ht-stat">AGE: ${p.age}</div>`;
    if(p.customType!==undefined){
      const def=customCreatures.get(p.customType);
      if(def) html+=`<div class="ht-strain">${def.movement.icon} ${def.movement.name} · ${def.diet.icon} ${def.diet.name} · POP:${POP[p.customType]||0}</div>`;
    } else if(strain) html+=`<div class="ht-strain">STRAIN·${p.sid}  POP:${strain.pop}</div>`;
  } else {
    // Abiotic
    if(p.t===T.FIRE)    html+=`<div class="ht-stat">TTL: ${p.ttl||0}</div>`;
    if(p.t===T.WEB)     html+=`<div class="ht-stat">DECAY: ${p.ttl||0}</div>`;
    if(p.t===T.MUTAGEN) html+=`<div class="ht-stat">ENERGY: ${Math.round(p.energy||0)}</div>`;
    if(p.t===T.WATER||p.t===T.OIL) html+=`<div class="ht-stat">LIGHT: ${(lightGrid[idx(gx,gy)]*100|0)}%</div>`;
    if(p.t===T.FROGSTONE){
      const hpBar=makeBar(p.hp||0,255,'#88cc44');
      html+=`<div class="ht-stat">HP ${hpBar} ${Math.round(p.hp||0)}</div>`;
      if(p.isHub){
        const sd=Math.sqrt(Math.pow(sunX-gx,2)+Math.pow(sunY-gy,2))||1;
        const sp=Math.max(0,Math.min(1,1-(sd/(W*0.45))));
        const range=Math.floor(8+sp*14);
        const reload=Math.floor(35-sp*26);
        html+=`<div class="ht-stat" style="color:#88cc44">🌞 ${(sp*100|0)}% · RANGE:${range} · RELOAD:${reload}t</div>`;
        if(p.tongue) html+=`<div class="ht-stat" style="color:#ff60aa">👅 TONGUE ACTIVE</div>`;
      } else {
        html+=`<div class="ht-stat" style="color:#556644">DOME CELL</div>`;
      }
    }
    html+=`<div class="ht-stat" style="color:#303050">(${gx},${gy})</div>`;
  }

  tip.innerHTML=html;
  tip.style.display='block';

  // Position tooltip: offset from cursor, keep inside viewport
  const tw=tip.offsetWidth+4, th=tip.offsetHeight+4;
  let tx=clientX+14, ty=clientY-6;
  if(tx+tw>window.innerWidth)  tx=clientX-tw-6;
  if(ty+th>window.innerHeight) ty=clientY-th-6;
  if(ty<0) ty=4;
  tip.style.left=tx+'px';
  tip.style.top=ty+'px';
}

function makeBar(val,max,col){
  const pct=Math.min(100,Math.round(val/max*100));
  return `<span style="display:inline-block;width:30px;height:4px;background:#1a1a30;border-radius:2px;vertical-align:middle;position:relative;"><span style="display:block;width:${pct}%;height:100%;background:${col};border-radius:2px;"></span></span>`;
}
function canvasToGrid(cx,cy){
  const rect=canvas.getBoundingClientRect();
  const dx=cx-rect.left-rect.width/2,dy=cy-rect.top-rect.height/2;
  const rad=-boxAngle*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  const rx=dx*cos-dy*sin,ry=dx*sin+dy*cos;
  const lx=rx+rect.width/2,ly=ry+rect.height/2;
  return[Math.floor(lx*(canvas.width/rect.width)/S),Math.floor(ly*(canvas.height/rect.height)/S)];
}

function drawAt(cx,cy){
  const[gx,gy]=canvasToGrid(cx,cy);
  // Observe mode — show tooltip instead of drawing
  if(observeMode){ showObserveTooltip(cx,cy,get(gx,gy),gx,gy); return; }
  if(currentTool==='sun'){sunX=Math.max(0,Math.min(W-1,gx));sunY=Math.max(0,Math.min(H-1,gy));sunActive=true;return;}
  if(currentTool==='stamp'){
    const sel=_dom('stamp-sel').value;
    if(sel!=='box_draw') placeStamp(gx,gy,sel);
    return;
  }
  if(currentTool==='observe'){inspectCell(cx,cy);return;}
  if(currentTool==='grab'){
    if(heldMutagen){
      // Place held mutagen at click position
      if(inB(gx,gy)&&!get(gx,gy)){
        grid[idx(gx,gy)]=heldMutagen;
        heldMutagen=null;
        _dom('held-panel').style.display='none';
      }
    } else {
      // Pick up mutagen at click position
      const p=get(gx,gy);
      if(p&&p.t===T.MUTAGEN){
        heldMutagen=p;
        grid[idx(gx,gy)]=null;
        _dom('held-panel').style.display='block';
        const r=p.recipe||[128,128,128,128,128,128];
        _dom('held-info').textContent=`RECIPE: [${r.map(v=>v.toString(16).padStart(2,'0')).join(' ')}]\nFROZEN: ${p.frozen?'YES':'NO'}`;
      }
    }
    return;
  }

  for(let dy=-brushSize;dy<=brushSize;dy++){
    for(let dx=-brushSize;dx<=brushSize;dx++){
      if(dx*dx+dy*dy>brushSize*brushSize)continue;
      const px=gx+dx,py=gy+dy;
      if(!inB(px,py))continue;
      if(currentTool==='erase'){erase(px,py);continue;}

      const cur=grid[idx(px,py)];
      if(cur&&isWall(cur.t))continue;
      if(cur?.g){popDecr(cur);}

      switch(currentEl){
        case 'sand':       grid[idx(px,py)]=abiotic(T.SAND);break;
        case 'clay':       grid[idx(px,py)]={t:T.CLAY,age:0,settled:0};break;
        case 'goldSand':   grid[idx(px,py)]=abiotic(T.GOLD_SAND);break;
        case 'whiteSand':  grid[idx(px,py)]=abiotic(T.WHITE_SAND);break;
        case 'water':      grid[idx(px,py)]=abiotic(T.WATER);break;
        case 'oil':        grid[idx(px,py)]=abiotic(T.OIL);break;
        case 'detritus':   grid[idx(px,py)]=abiotic(T.DETRITUS);break;
        case 'wall':       grid[idx(px,py)]={t:T.WALL,age:0};break;
        case 'cloud':      grid[idx(px,py)]={t:T.CLOUD,age:0,charge:120,phase:0};break;
        case 'bloomCloud': grid[idx(px,py)]={t:T.BLOOM_CLOUD,age:0};break;
        case 'progCloud':  {const cfg=getProgCloudConfig();grid[idx(px,py)]={t:T.PROG_CLOUD,age:0,phase:0,emitType:cfg.type,emitRate:cfg.rate};break;}
        case 'progVoid':   {const vcfg=getProgVoidConfig();grid[idx(px,py)]={t:T.PROG_VOID,age:0,phase:0,destroyType:vcfg.type,radius:vcfg.radius};break;}
        case 'fire':       grid[idx(px,py)]={t:T.FIRE,age:0,ttl:30};break;
        case 'lava':       grid[idx(px,py)]={t:T.LAVA,age:0,ttl:500};break;
        case 'stone':      grid[idx(px,py)]={t:T.STONE,age:0};break;
        case 'ice':        grid[idx(px,py)]={t:T.ICE,age:0,ttl:800};break;
        case 'steam':      grid[idx(px,py)]={t:T.STEAM,age:0,ttl:80};break;
        case 'smoke':      grid[idx(px,py)]={t:T.SMOKE,age:0,ttl:60};break;
        case 'wood':       grid[idx(px,py)]={t:T.WOOD,age:0};break;
        case 'ash':        grid[idx(px,py)]={t:T.ASH,age:0};break;
        case 'acid':       grid[idx(px,py)]={t:T.ACID,age:0,ttl:300};break;
        case 'gunpowder':  grid[idx(px,py)]={t:T.GUNPOWDER,age:0};break;
        case 'salt':       grid[idx(px,py)]={t:T.SALT,age:0};break;
        // Pharmacy drugs
        case 'lucid':      grid[idx(px,py)]={t:T.LUCID,age:0,ttl:300};break;
        case 'chromadust':{
          // Each hue bucket (30° step, 12 total) is a distinct custom creature colony
          const hue=Math.floor(Math.random()*12)*30;
          if(!chromaStrains.has(hue)){
            chromaStrains.set(hue, createChromaCreature(hue));
          }
          const ec=grid[idx(px,py)];if(ec?.g)popDecr(ec);
          grid[idx(px,py)]={t:T.CHROMADUST,age:0,hue,ttl:150+Math.floor(Math.random()*80)};
          break;
        }
        case 'crank':      grid[idx(px,py)]={t:T.CRANK,age:0,ttl:250};break;
        case 'mutagen': {
          // Life Seed drops a burst of random organisms at cursor + scatter several seeds
          const seedTypes=[T.ANT,T.PLANT,T.SPIDER,T.FUNGI,T.MITE,T.QUEEN,T.QUEEN_SPIDER,T.QUEEN_MITE];
          const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
          // Drop 3-6 random organisms scattered in radius
          const burstCount=3+Math.floor(Math.random()*4);
          for(let b=0;b<burstCount;b++){
            const ox=px+Math.floor((Math.random()-0.5)*10);
            const oy=py+Math.floor((Math.random()-0.5)*10);
            if(!inB(ox,oy)||get(ox,oy))continue;
            const t=pick(seedTypes);
            const g=randomGenome(t);
            const s=registerStrain(t,g);
            grid[idx(ox,oy)]=agentWithStrain(t,g,s,{energy:150});
            popIncr({t,sid:s});
          }
          // Also drop 2-3 life seeds nearby to keep mutating
          const seedCount=2+Math.floor(Math.random()*2);
          for(let b=0;b<seedCount;b++){
            const ox=px+Math.floor((Math.random()-0.5)*8);
            const oy=py+Math.floor((Math.random()-0.5)*8);
            if(inB(ox,oy)&&!get(ox,oy))
              grid[idx(ox,oy)]={t:T.MUTAGEN,age:0,energy:120,recipe:[128,128,128,128,128,128]};
          }
          break;
        }
        case 'seed':{const g=randomGenome(T.PLANT);const s=registerStrain(T.PLANT,g);grid[idx(px,py)]={t:T.SEED,age:0,g,sid:s,energy:120};break;}
        case 'plant':{const g=randomGenome(T.PLANT);const s=registerStrain(T.PLANT,g);grid[idx(px,py)]=agentWithStrain(T.PLANT,g,s,{energy:120});POP[T.PLANT]++;break;}
        case 'ant':{const g=randomGenome(T.ANT);const s=registerStrain(T.ANT,g);grid[idx(px,py)]=agentWithStrain(T.ANT,g,s,{energy:150});POP[T.ANT]++;break;}
        case 'termite':{const g=randomGenome(T.TERMITE);const s=registerStrain(T.TERMITE,g);grid[idx(px,py)]=agentWithStrain(T.TERMITE,g,s,{energy:150});POP[T.TERMITE]++;break;}
        case 'queenTermite':{const g=randomGenome(T.TERMITE);const s=registerStrain(T.QUEEN_TERMITE,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN_TERMITE,g,s,{energy:200});POP[T.QUEEN_TERMITE]++;break;}
        case 'queen':{const g=randomGenome(T.QUEEN);const s=registerStrain(T.QUEEN,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN,g,s,{energy:200});POP[T.QUEEN]++;break;}
        case 'spider':{const g=randomGenome(T.SPIDER);const s=registerStrain(T.SPIDER,g);grid[idx(px,py)]=agentWithStrain(T.SPIDER,g,s,{energy:150});POP[T.SPIDER]++;break;}
        case 'queenSpider':{const g=randomGenome(T.QUEEN_SPIDER);const s=registerStrain(T.QUEEN_SPIDER,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN_SPIDER,g,s,{energy:200});POP[T.QUEEN_SPIDER]++;break;}
        case 'huntsman':{const g=randomGenome(T.HUNTSMAN);const s=registerStrain(T.HUNTSMAN,g);grid[idx(px,py)]=agentWithStrain(T.HUNTSMAN,g,s,{energy:150});POP[T.HUNTSMAN]++;break;}
        case 'queenHuntsman':{const g=randomGenome(T.QUEEN_HUNTSMAN);const s=registerStrain(T.QUEEN_HUNTSMAN,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN_HUNTSMAN,g,s,{energy:200});POP[T.QUEEN_HUNTSMAN]++;break;}
        case 'fungi':{const g=randomGenome(T.FUNGI);const s=registerStrain(T.FUNGI,g);grid[idx(px,py)]=agentWithStrain(T.FUNGI,g,s,{energy:100});POP[T.FUNGI]++;break;}
        case 'mite':{const g=randomGenome(T.MITE);const s=registerStrain(T.MITE,g);grid[idx(px,py)]=agentWithStrain(T.MITE,g,s,{energy:120});POP[T.MITE]++;break;}
        case 'queenMite':{const g=randomGenome(T.QUEEN_MITE);const s=registerStrain(T.QUEEN_MITE,g);grid[idx(px,py)]=agentWithStrain(T.QUEEN_MITE,g,s,{energy:180});POP[T.QUEEN_MITE]++;break;}
        case 'jelly':      grid[idx(px,py)]={t:T.JELLY,age:0};break;
        case 'worm':{
          // Only place at brush center — spawns a 5-cell worm
          if(dx===0&&dy===0){
            const wid=wormNextId++;
            const cells=[];
            for(let i=0;i<5;i++){const cx=px-i,cy=py;if(!inB(cx,cy)||get(cx,cy))continue;cells.push([cx,cy]);grid[idx(cx,cy)]={t:T.WORM,wid,age:0};}
            if(cells.length>=2)worms.set(wid,{cells,dir:[1,0],energy:200,tick:0});
          }
          break;
        }
        case 'machine':{
          if(machineRunning)break;
          lastMachinePlacedTime=Date.now(); // reset timer on every brush pixel
          if(Math.random()<0.40){
            const ec=grid[idx(px,py)];if(ec?.g)popDecr(ec);
            grid[idx(px,py)]={t:T.MACHINE,age:0,dormant:true};
          }
          break;
        }
        case 'bacteria':{
          if(bacteriaRunning)break;
          lastBacteriaPlacedTime=Date.now(); // reset timer on every brush pixel
          // Only process at 2×2 coarse-grid origins — prevents placing partial blocks
          if(px%2!==0||py%2!==0)break;
          if(Math.random()<0.40){
            for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){
              const gx=px+bx,gy=py+by;
              if(!inB(gx,gy))continue;
              const ec=grid[idx(gx,gy)];if(ec?.g)popDecr(ec);
              grid[idx(gx,gy)]={t:T.BACTERIA,age:0,dormant:true};
            }
          }
          break;
        }
        // ── RNA preset stamps — known HighLife (B36/S23) patterns ──
        case 'rna1':case 'rna2':case 'rna3':{
          // Patterns defined as coarse-cell offsets from center (each → 2×2 fine block)
          // rna1: Glider — moves diagonally (B3/S2 shared with GoL)
          const RNA_GLIDER=[[0,-1],[1,0],[-1,1],[0,1],[1,1]];
          // rna2: Replicator seed — 6-cell diagonal ring; center has 6 live neighbors → B6 fires
          const RNA_SEED=[[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1]];
          // rna3: Bomber — replicator seed + blinker offset diagonally (creates a HighLife spaceship)
          const RNA_BOMB=[...RNA_SEED,[3,2],[4,2],[5,2]];
          const pattern=currentEl==='rna1'?RNA_GLIDER:currentEl==='rna2'?RNA_SEED:RNA_BOMB;
          const ccx=Math.floor(px/2),ccy=Math.floor(py/2);
          lastBacteriaPlacedTime=Date.now();
          for(const[dx,dy] of pattern){
            const gx=(ccx+dx)*2,gy=(ccy+dy)*2;
            for(let by=0;by<2;by++)for(let bx=0;bx<2;bx++){
              const fx=gx+bx,fy=gy+by;
              if(!inB(fx,fy))continue;
              const ec=grid[idx(fx,fy)];if(ec?.g)popDecr(ec);
              grid[idx(fx,fy)]={t:T.BACTERIA,age:0};
            }
          }
          break;
        }
        default:{
          // Custom lab creatures
          if(currentEl.startsWith('customqueen_')){
            const id=parseInt(currentEl.split('_')[1]);
            if(customCreatures.has(id)){
              const c=spawnCustomCell(id,px,py,true);
              if(c){grid[idx(px,py)]=c;POP[id+100]=(POP[id+100]||0)+1;}
            }
          } else if(currentEl.startsWith('custom_')){
            const id=parseInt(currentEl.split('_')[1]);
            if(customCreatures.has(id)){
              const c=spawnCustomCell(id,px,py,false);
              if(c){grid[idx(px,py)]=c;POP[id]=(POP[id]||0)+1;}
            }
          }
        }
      }
    }
  }
}

// ================================================================
//  BOX DRAW — drag to size a hollow box
// ================================================================
let boxDrawStart=null; // {gx,gy,px,py} grid + pixel coords of first corner

function getStampMode(){ return _dom('stamp-sel').value; }

function updateBoxPreview(sx,sy,ex,ey){
  // sx,sy,ex,ey are pixel coords relative to canvas element
  const preview=_dom('box-preview');
  const x1=Math.min(sx,ex),y1=Math.min(sy,ey);
  const x2=Math.max(sx,ex),y2=Math.max(sy,ey);
  preview.style.left=x1+'px'; preview.style.top=y1+'px';
  preview.style.width=(x2-x1)+'px'; preview.style.height=(y2-y1)+'px';
  preview.style.display='block';
}

function placeBoxDraw(g1x,g1y,g2x,g2y){
  // Place hollow box walls between two grid corners
  const x1=Math.min(g1x,g2x),y1=Math.min(g1y,g2y);
  const x2=Math.max(g1x,g2x),y2=Math.max(g1y,g2y);
  for(let x=x1;x<=x2;x++){
    if(inB(x,y1)) grid[idx(x,y1)]={t:T.WALL,age:0};
    if(inB(x,y2)) grid[idx(x,y2)]={t:T.WALL,age:0};
  }
  for(let y=y1+1;y<y2;y++){
    if(inB(x1,y)) grid[idx(x1,y)]={t:T.WALL,age:0};
    if(inB(x2,y)) grid[idx(x2,y)]={t:T.WALL,age:0};
  }
}

function clientToCanvasLocal(cx,cy){
  // Returns pixel position relative to canvas element (accounting for rotation)
  const rect=canvas.getBoundingClientRect();
  const dx=cx-rect.left-rect.width/2, dy=cy-rect.top-rect.height/2;
  const rad=-boxAngle*Math.PI/180;
  const rx=dx*Math.cos(rad)-dy*Math.sin(rad), ry=dx*Math.sin(rad)+dy*Math.cos(rad);
  return[rx+rect.width/2, ry+rect.height/2];
}

// Update stamp hint text (listener attached lazily via attachToolbarListeners after React renders)
_dom('stamp-sel')?.addEventListener('change',()=>{
  const isBox=getStampMode()==='box_draw';
  _dom('stamp-hint').style.display=isBox?'block':'none';
  _dom('box-preview').style.display='none';
  boxDrawStart=null;
});

function _setupCanvasListeners() {
// Abort any previously registered canvas listeners (handles React StrictMode double-mount)
if(_canvasAC)_canvasAC.abort();
_canvasAC=new AbortController();
const sig=_canvasAC.signal;

canvas.addEventListener('mousedown',e=>{
  if(e.button===2){inspectCell(e.clientX,e.clientY);return;}
  isDown=true;
  machineDrawnThisStroke=false;
  if(currentTool==='stamp'&&getStampMode()==='box_draw'){
    const[gx,gy]=canvasToGrid(e.clientX,e.clientY);
    const[px,py]=clientToCanvasLocal(e.clientX,e.clientY);
    boxDrawStart={gx,gy,px,py};
    return;
  }
  drawAt(e.clientX,e.clientY);
},{signal:sig});

canvas.addEventListener('mousemove',e=>{
  if(observeMode){
    const[gx,gy]=canvasToGrid(e.clientX,e.clientY);
    showObserveTooltip(e.clientX,e.clientY,get(gx,gy),gx,gy);
  }
  if(isDown&&currentTool==='stamp'&&getStampMode()==='box_draw'&&boxDrawStart){
    const[px,py]=clientToCanvasLocal(e.clientX,e.clientY);
    const rect=canvas.getBoundingClientRect();
    const scaleX=rect.width/canvas.width, scaleY=rect.height/canvas.height;
    updateBoxPreview(
      boxDrawStart.px*scaleX, boxDrawStart.py*scaleY,
      px*scaleX, py*scaleY
    );
    return;
  }
  if(isDown&&currentTool!=='stamp'&&!observeMode) drawAt(e.clientX,e.clientY);
  if(!observeMode) updateHoverTip(e.clientX,e.clientY);
},{signal:sig});

canvas.addEventListener('mouseup',e=>{
  if(currentTool==='stamp'&&getStampMode()==='box_draw'&&boxDrawStart){
    const[gx,gy]=canvasToGrid(e.clientX,e.clientY);
    placeBoxDraw(boxDrawStart.gx,boxDrawStart.gy,gx,gy);
    _dom('box-preview').style.display='none';
    boxDrawStart=null;
  }
  isDown=false;
},{signal:sig});

canvas.addEventListener('mouseleave',()=>{
  isDown=false;
  _dom('hover-tip').style.display='none';
  if(observeMode) _dom('observe-tooltip').classList.remove('visible');
},{signal:sig});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();inspectCell(e.clientX,e.clientY);},{signal:sig});

canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  const t=e.touches[0];
  isDown=true;
  machineDrawnThisStroke=false;
  if(currentTool==='stamp'&&getStampMode()==='box_draw'){
    const[gx,gy]=canvasToGrid(t.clientX,t.clientY);
    const[px,py]=clientToCanvasLocal(t.clientX,t.clientY);
    boxDrawStart={gx,gy,px,py};
    return;
  }
  drawAt(t.clientX,t.clientY);
},{passive:false,signal:sig});

canvas.addEventListener('touchmove',e=>{
  e.preventDefault();
  if(!isDown)return;
  const t=e.touches[0];
  if(currentTool==='stamp'&&getStampMode()==='box_draw'&&boxDrawStart){
    const[px,py]=clientToCanvasLocal(t.clientX,t.clientY);
    const rect=canvas.getBoundingClientRect();
    const scaleX=rect.width/canvas.width,scaleY=rect.height/canvas.height;
    updateBoxPreview(boxDrawStart.px*scaleX,boxDrawStart.py*scaleY,px*scaleX,py*scaleY);
    return;
  }
  if(currentTool!=='stamp'&&!observeMode) drawAt(t.clientX,t.clientY);
},{passive:false,signal:sig});

canvas.addEventListener('touchend',e=>{
  e.preventDefault();
  if(currentTool==='stamp'&&getStampMode()==='box_draw'&&boxDrawStart&&e.changedTouches.length){
    const t=e.changedTouches[0];
    const[gx,gy]=canvasToGrid(t.clientX,t.clientY);
    placeBoxDraw(boxDrawStart.gx,boxDrawStart.gy,gx,gy);
    _dom('box-preview').style.display='none';
    boxDrawStart=null;
  }
  isDown=false;
},{passive:false,signal:sig});
}

// ================================================================
//  TOOL / ELEMENT BUTTONS
// ================================================================
_domAll('.tbtn[data-tool]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const tool=btn.dataset.tool;
    if(tool==='observe'){
      if(observeMode)exitObserveMode();
      else enterObserveMode();
      return;
    }
    exitObserveMode();
    currentTool=tool;
    _domAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    _dom('stamp-picker').style.display=tool==='stamp'?'block':'none';
  });
});
_dom('bs').addEventListener('input',e=>{brushSize=+e.target.value;_dom('bsv').textContent=brushSize;});
_dom('sp').addEventListener('input',e=>{
  const v=+e.target.value;speedMult=v===0?0:v*0.2;
  _dom('spv').textContent=v===0?'PAUSED':speedMult.toFixed(1)+'x';
  _dom('pause-badge').style.display=v===0?'block':'none';
});
_dom('mu').addEventListener('input',e=>{mutRate=+e.target.value/10000;_dom('muv').textContent=(mutRate*100).toFixed(2)+'%';});

// Element buttons
const ELEMENTS=[
  {cat:'KINGDOMS',key:'seed',        label:'PLANT SEED',   col:'#4aaa22',          tag:'🌱'},
  {cat:null,      key:'ant',         label:'ANT',          col:K_COLORS[T.ANT],          tag:'🐜'},
  {cat:null,      key:'termite',     label:'TERMITE',      col:'#cc8844',                  tag:'🪲'},
  {cat:null,      key:'queenTermite',label:'Q.TERMITE',    col:'#ee9944',                  tag:'🪲👑'},
  {cat:null,      key:'queen',       label:'QUEEN ANT',    col:K_COLORS[T.QUEEN],        tag:'👑'},
  {cat:null,      key:'spider',      label:'SPIDER',       col:K_COLORS[T.SPIDER],       tag:'🕷'},
  {cat:null,      key:'queenSpider', label:'QUEEN SPIDER', col:K_COLORS[T.QUEEN_SPIDER], tag:'🕸👑'},
  {cat:null,      key:'fungi',       label:'FUNGI',        col:K_COLORS[T.FUNGI],        tag:'🍄'},
  {cat:null,      key:'mite',        label:'MITE',         col:K_COLORS[T.MITE],         tag:'🪲'},
  {cat:null,      key:'queenMite',   label:'QUEEN MITE',   col:K_COLORS[T.QUEEN_MITE],   tag:'🪲👑'},
  {cat:null,      key:'worm',        label:'WORM',         col:'#c85040',                tag:'🪱'},
  {cat:'SPECIAL', key:'mutagen', label:'LIFE SEED',  col:'#cc00ee',  tag:'⚛'},
  {cat:null,      key:'cloud',       label:'CLOUD',        col:'#aaccee',  tag:'☁'},
  {cat:null,      key:'bloomCloud',  label:'BLOOM CLOUD',  col:'#881020',  tag:'💥'},
  {cat:null,      key:'progCloud',   label:'PROG CLOUD',   col:'#44aaff',  tag:'⚙☁'},
  {cat:null,      key:'progVoid',    label:'PROG VOID',    col:'#220033',  tag:'⚙▼'},
  {cat:null,      key:'fire',    label:'FIRE',       col:'#ff4400',  tag:'🔥'},
  {cat:null,      key:'lava',    label:'LAVA',       col:'#ff5500',  tag:'ρ8'},
  {cat:'PHARMACY',key:'lucid',      label:'LUCID',       col:'#dd88ff',  tag:'🌈'},
  {cat:null,      key:'crank',      label:'CRANK',       col:'#ff6600',  tag:'💥'},
  {cat:null,      key:'chromadust', label:'CHROMADUST',  col:'#ff00ff',  tag:'✨'},
  {cat:'ABIOTIC', key:'jelly',   label:'JELLY',      col:'#c055a0',  tag:'〰'},
  {cat:null,      key:'sand',    label:'SAND',       col:'#c4a35a',  tag:'ρ5'},
  {cat:null,      key:'clay',    label:'CLAY',       col:'#7a8599',  tag:'ρ5'},
  {cat:null,      key:'stone',   label:'STONE',      col:'#787878',  tag:'ρ7'},
  {cat:null,      key:'wood',    label:'WOOD',       col:'#6e4020',  tag:'ρ4'},
  {cat:null,      key:'ice',     label:'ICE',        col:'#b4e0f0',  tag:'ρ3'},
  {cat:null,      key:'goldSand',label:'GOLD SAND',  col:'#ffc800',  tag:'ρ8'},
  {cat:null,      key:'whiteSand',label:'WHT SAND',  col:'#dcdcd7', tag:'ρ3'},
  {cat:null,      key:'salt',    label:'SALT',       col:'#e0e0e0',  tag:'ρ3'},
  {cat:null,      key:'water',   label:'WATER',      col:'#3c82c8',  tag:'ρ2'},
  {cat:null,      key:'acid',    label:'ACID',       col:'#ddaa00',  tag:'ρ2'},
  {cat:null,      key:'oil',     label:'OIL',        col:'#4a7a28',  tag:'ρ1'},
  {cat:null,      key:'ash',     label:'ASH',        col:'#888880',  tag:'ρ1'},
  {cat:null,      key:'smoke',   label:'SMOKE',      col:'#505050',  tag:'↑'},
  {cat:null,      key:'steam',   label:'STEAM',      col:'#c0d8e8',  tag:'↑'},
  {cat:null,      key:'gunpowder',label:'GUNPOWDER', col:'#504840',  tag:'💥'},
  {cat:null,      key:'wall',    label:'WALL',       col:'#3c3c3c',  tag:'ρ∞'},
];
const el=_dom('elist');
ELEMENTS.forEach(e=>{
  if(e.cat){const c=document.createElement('div');c.className='ecat';c.textContent='— '+e.cat+' —';el.appendChild(c);}
  const btn=document.createElement('button');
  btn.className='ebtn'+(e.key==='sand'?' active':'');
  btn.dataset.el=e.key;
  btn.innerHTML=`<span class="sw" style="background:${e.col}"></span><span class="en">${e.label}</span><span class="et">${e.tag}</span>`;
  btn.addEventListener('click',()=>{
    currentEl=e.key;currentTool='draw';
    _domAll('.ebtn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
    _domAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
    _dom('btn-draw').classList.add('active');
    // Show/hide config panels for special elements
    const _pc=_dom('pc-panel'),_pv=_dom('pv-panel');
    if(_pc)_pc.style.display=e.key==='progCloud'?'block':'none';
    if(_pv)_pv.style.display=e.key==='progVoid'?'block':'none';
  });
  el.appendChild(btn);
});

// ================================================================
//  MOBILE UI: ELEMENT TRAY + CATEGORY TABS
// ================================================================
const MOBILE_CATS = {
  terrain: ['sand','clay','stone','wood','ice','goldSand','whiteSand','salt','water','acid','oil','ash','smoke','steam','gunpowder','wall','fire','lava'],
  life:    ['ant','queen','spider','queenSpider','termite','queenTermite','mite','queenMite','plant','seed','algae','detritus','fungi','spore'],
  special: ['mutagen','chromadust','cloud','bloomCloud','progCloud','progVoid'],
  rx:      ['lucid','crank'],
};

// Element tray and category tabs are now owned by React (ElementTray / CategoryTabs components).
// Engine receives element changes via engine.setElement(key) called from the Zustand store.

// ================================================================
//  MOBILE UI: MENU DRAWER
// ================================================================
function openMenuDrawer() {
  _dom('menu-drawer').classList.add('open');
  _dom('menu-overlay').style.display = 'block';
}
function closeMenuDrawer() {
  _dom('menu-drawer').classList.remove('open');
  _dom('menu-overlay').style.display = 'none';
}
_dom('menu-open-btn').addEventListener('click', openMenuDrawer);
_dom('menu-close-btn').addEventListener('click', closeMenuDrawer);
_dom('menu-overlay').addEventListener('click', closeMenuDrawer);

// ================================================================
//  MOBILE UI: THEME TOGGLE
// ================================================================
const themeBtn = _dom('theme-toggle');
themeBtn.addEventListener('click', () => {
  const app = _dom('app');
  const isLight = app.dataset.theme === 'light';
  app.dataset.theme = isLight ? 'dark' : 'light';
  themeBtn.textContent = isLight ? '☀' : '🌙';
  localStorage.setItem('aaTheme', app.dataset.theme);
});
const savedTheme = localStorage.getItem('aaTheme');
if (savedTheme) {
  _dom('app').dataset.theme = savedTheme;
  themeBtn.textContent = savedTheme === 'light' ? '🌙' : '☀';
}

// ================================================================
//  STAMPS
// ================================================================
function buildRect(w,h){
  const c=[];
  for(let x=0;x<w;x++){c.push([x,0]);c.push([x,h-1]);}
  for(let y=1;y<h-1;y++){c.push([0,y]);c.push([w-1,y]);}
  return c.map(([x,y])=>[x-Math.floor(w/2),y-Math.floor(h/2)]);
}
const STAMPS={
  box:buildRect(20,14),
  bowl:(()=>{const c=[];for(let x=0;x<20;x++)c.push([x,9]);for(let y=0;y<9;y++){c.push([0,y]);c.push([19,y]);}return c.map(([x,y])=>[x-10,y-4]);})(),
  tube:buildRect(5,20),
  funnel:(()=>{const c=[];for(let y=0;y<12;y++){const o=Math.floor(y*4/12);c.push([-9+o,y]);c.push([9-o,y]);}for(let x=-9;x<=9;x++)if(x!==0)c.push([x,11]);return c;})(),
  divider:(()=>{const c=[];for(let x=-18;x<=18;x++)c.push([x,0]);return c;})(),
  cross:(()=>{const c=[];for(let x=-18;x<=18;x++)c.push([x,0]);for(let y=-18;y<=18;y++)c.push([0,y]);return c;})(),
};
// ================================================================
//  GRAB / HELD MUTAGEN
// ================================================================
let heldMutagen=null;

function dropHeld(){
  heldMutagen=null;
  _dom('held-panel').style.display='none';
}

// ================================================================
//  NARRATOR ENGINE
// ================================================================
let narratorTick=0;
const NARRATOR_LINES=[];
let lastNarratorState={};

function updateNarrator(){
  narratorTick++;
  if(narratorTick%150!==0) return; // update every ~150 ticks

  const total=Object.values(POP).reduce((a,b)=>a+b,0);
  const lines=[];
  const s=lastNarratorState;

  // Opening line if just starting
  if(tickCount<500&&total>0&&!s.introduced){
    lines.push('Life stirs in the terrarium. The first organisms test their new world.');
    s.introduced=true;
  }

  // Population events
  if(POP[T.ANT]>150&&!(s.antFlood)) {lines.push('The ants have exploded in number — their trails crisscross every surface.');s.antFlood=true;}
  if(POP[T.ANT]<5&&s.antFlood)     {lines.push('The ant population has collapsed. Silence spreads across the sand.');s.antFlood=false;}
  if(POP[T.SPIDER]>40&&!(s.spiderSurge)){lines.push('Spiders multiply, weaving their webs between the colonies.');s.spiderSurge=true;}
  if(POP[T.FUNGI]>120&&!(s.fungalBloom)){lines.push('Fungal networks spread through the dark, decomposing everything they touch.');s.fungalBloom=true;}
  if(POP[T.FUNGI]<5&&s.fungalBloom){lines.push('The fungal bloom recedes. The mites hunger.');s.fungalBloom=false;}
  if(POP[T.QUEEN]===0&&POP[T.ANT]>10&&!(s.queenless)){lines.push('No queen remains. The worker ants wander without purpose.');s.queenless=true;}
  if(POP[T.QUEEN]>0&&s.queenless){lines.push('A new queen has crowned herself. The colony finds direction again.');s.queenless=false;}
  if(POP[T.PLANT]>200&&!(s.plantOvergrowth)){lines.push('Plants have overtaken the ground — a green tide filling every gap.');s.plantOvergrowth=true;}
  if(POP[T.PLANT]<5&&total>20){lines.push('The plants are nearly gone. Without them, the food web frays.');}
  if(total===0){lines.push('The terrarium is silent. All life has perished.');}

  // Predator-prey tension
  if(POP[T.SPIDER]>20&&POP[T.ANT]>50){lines.push('Spiders stalk the ant corridors. The hunt is on.');}
  if(POP[T.MITE]>80&&POP[T.FUNGI]>60){lines.push('Mites swarm through the fungal fields, reducing them to nothing.');}

  // Balance observation
  if(Object.values(POP).filter(v=>v>5).length>=5){lines.push('Five kingdoms flourish together — a rare and fragile balance.');}

  // Random atmospheric lines
  const atm=[
    'Detritus accumulates in the deep zones, feeding tomorrow\'s growth.',
    'The light shifts across the board. Shadow and photosynthesis compete.',
    'A mutation ripples through one colony, changing it forever.',
    'Web strands catch the light between the walls.',
    'The sand settles. The living do not.',
  ];
  if(lines.length===0&&total>0) lines.push(atm[Math.floor(Math.random()*atm.length)]);

  if(lines.length){
    NARRATOR_LINES.unshift({tick:tickCount,text:lines[0]});
    if(NARRATOR_LINES.length>6)NARRATOR_LINES.length=6;
    const el=_dom('narrator');
    if(el) el.innerHTML=NARRATOR_LINES.map((l,i)=>
      `<div style="opacity:${Math.max(0.3,1-i*0.15)};margin-bottom:4px;color:${i===0?'var(--text)':'var(--dim)'}">${i===0?'':'<span style="color:var(--border)">▸ </span>'}${l.text}</div>`
    ).join('');
  }
}

function placeStamp(cx,cy,name){
  if(name==='weatherstation'){
    if(inB(cx,cy)){
      grid[idx(cx,cy)]={t:T.WEATHER_STATION,age:0,phase:0};
      // Show the weather station panel
      _dom('ws-panel').style.display='block';
    }
    return;
  }
  if(name==='frogstone'){
    // Place a 10×10 sphere of FROGSTONE cells. Hub = center cell.
    const R=5;
    const cx2=cx, cy2=cy;
    for(let dy=-R;dy<=R;dy++){
      for(let dx=-R;dx<=R;dx++){
        if(dx*dx+dy*dy<=R*R){
          const px=cx2+dx, py=cy2+dy;
          if(inB(px,py)){
            const isHub=(dx===0&&dy===0);
            grid[idx(px,py)]={
              t:T.FROGSTONE,age:0,phase:0,
              hp:200,tongue:null,
              isHub,
              hubX:cx2, hubY:cy2
            };
          }
        }
      }
    }
    return;
  }
  if(name==='fridge'){
    // Fridge: hollow 14×10 box of FRIDGE_WALL cells; registers zone inside
    const W2=14,H2=10;
    const cells=[];
    for(let x=0;x<W2;x++){cells.push([x,0]);cells.push([x,H2-1]);}
    for(let y=1;y<H2-1;y++){cells.push([0,y]);cells.push([W2-1,y]);}
    const ox=cx-Math.floor(W2/2),oy=cy-Math.floor(H2/2);
    for(const[dx,dy]of cells){
      const px=ox+dx,py=oy+dy;
      if(inB(px,py))grid[idx(px,py)]={t:T.FRIDGE_WALL,age:0};
    }
    // Register interior as fridge zone
    fridgeZones.push({x1:ox,y1:oy,x2:ox+W2-1,y2:oy+H2-1});
    return;
  }
  const cells=STAMPS[name];
  if(!cells)return;
  for(const[dx,dy]of cells){
    const px=cx+dx,py=cy+dy;
    if(inB(px,py))grid[idx(px,py)]={t:T.WALL,age:0};
  }
}

// ================================================================
//  SEED ECOSYSTEM & RESET
// ================================================================
function seedLife(){
  // Place a balanced starter ecosystem
  const W2=W,H2=H;

  // Plants (needs sand to root)
  for(let n=0;n<25;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2*0.7);
    if(!get(x,y)&&get(x+gv.x,y+gv.y)?.t===T.SAND){
      const g=randomGenome(T.PLANT);
      grid[idx(x,y)]=agentWithStrain(T.PLANT,g,registerStrain(T.PLANT,g),{energy:120});
      POP[T.PLANT]++;
    }
  }
  // Wood logs (food source for termites + structural element)
  for(let n=0;n<4;n++){
    const lx=Math.floor(Math.random()*W2*0.8+W2*0.1);
    const ly=Math.floor(Math.random()*H2*0.5+H2*0.2);
    const len=6+Math.floor(Math.random()*10);
    for(let i=0;i<len;i++){const wx=lx+i,wy=ly;if(inB(wx,wy)&&!get(wx,wy))grid[idx(wx,wy)]=abiotic(T.WOOD);}
    // Termite workers near each log
    for(let t=0;t<4;t++){
      for(let att=0;att<10;att++){const tx=lx+Math.floor(Math.random()*len),ty=ly+Math.floor((Math.random()-0.5)*3);
        if(inB(tx,ty)&&!get(tx,ty)){const g=randomGenome(T.TERMITE);const s=registerStrain(T.TERMITE,g);grid[idx(tx,ty)]=agentWithStrain(T.TERMITE,g,s,{energy:140});POP[T.TERMITE]++;break;}}
    }
  }
  // Ants
  for(let n=0;n<20;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y)){const g=randomGenome(T.ANT);grid[idx(x,y)]=agentWithStrain(T.ANT,g,registerStrain(T.ANT,g),{energy:150});POP[T.ANT]++;}
  }
  // 2 Queens
  for(let n=0;n<2;n++){
    for(let att=0;att<20;att++){const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);if(!get(x,y)){const g=randomGenome(T.QUEEN);grid[idx(x,y)]=agentWithStrain(T.QUEEN,g,registerStrain(T.QUEEN,g),{energy:200});POP[T.QUEEN]++;break;}}
  }
  // Spiders
  for(let n=0;n<5;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y)){const g=randomGenome(T.SPIDER);grid[idx(x,y)]=agentWithStrain(T.SPIDER,g,registerStrain(T.SPIDER,g),{energy:150});POP[T.SPIDER]++;}
  }
  // Fungi (in lower, darker zones)
  for(let n=0;n<20;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(H2*0.6+Math.random()*H2*0.4);
    if(!get(x,y)){const g=randomGenome(T.FUNGI);grid[idx(x,y)]=agentWithStrain(T.FUNGI,g,registerStrain(T.FUNGI,g),{energy:100});POP[T.FUNGI]++;}
  }
  // Mites
  for(let n=0;n<15;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y)){const g=randomGenome(T.MITE);grid[idx(x,y)]=agentWithStrain(T.MITE,g,registerStrain(T.MITE,g),{energy:120});POP[T.MITE]++;}
  }
  // Life seed mutagens
  for(let n=0;n<8;n++){
    const x=Math.floor(Math.random()*W2),y=Math.floor(Math.random()*H2);
    if(!get(x,y))grid[idx(x,y)]={t:T.MUTAGEN,age:0,energy:100};
  }
}

function resetSim(){
  grid.fill(null);lightGrid.fill(0);pheroGrid.fill(0);
  rainActive=false;acidRainActive=false;
  chromaStrains.clear();
  lucidSources.length=0;
  strainRegistry.clear();nextStrain=1;
  tickCount=0;
  Object.keys(POP).forEach(k=>POP[k]=0);
  sunActive=true;sunX=Math.floor(W*0.5);sunY=10;
  boxTurns=0;boxAngle=0;gv={x:0,y:1};
  wrap.style.transform='rotate(0deg)';
  _dom('ang').textContent='0°';
  _dom('hint-text').style.transform='rotate(0deg)';
  nextEvent=800+Math.floor(Math.random()*800);
  activeEvent=null;
  _dom('klist').innerHTML='';
  fridgeZones=[];
  worms.clear();wormNextId=0;
  heldMutagen=null;
  for(const t of [T.PLANT,T.ANT,T.TERMITE,T.QUEEN,T.QUEEN_TERMITE,T.SPIDER,T.FUNGI,T.MITE,T.QUEEN_SPIDER,T.QUEEN_MITE,T.HUNTSMAN,T.QUEEN_HUNTSMAN]) POP_HISTORY[t]=[];
  for(const id of customCreatures.keys()){POP[id]=0;POP[id+100]=0;}
  exitObserveMode();
  _dom('held-panel').style.display='none';
  NARRATOR_LINES.length=0;
  Object.keys(lastNarratorState).forEach(k=>delete lastNarratorState[k]);
  const narEl=_dom('narrator');
  if(narEl) narEl.innerHTML='<span style="color:var(--dim)">Awaiting life...</span>';

  // Build blank world: sand floor + water pool + gold sand + detritus
  // No life — player seeds it manually
  for(let x=0;x<W;x++) for(let d=0;d<12;d++) grid[idx(x,H-1-d)]=abiotic(T.SAND);
  for(let n=0;n<100;n++){const x=Math.floor(Math.random()*W);grid[idx(x,H-2-Math.floor(Math.random()*8))]=abiotic(T.GOLD_SAND);}
  for(let x=0;x<Math.floor(W*0.25);x++) for(let y=H-8;y<H-1;y++) if(Math.random()<0.7)grid[idx(x,y)]=abiotic(T.WATER);
}

// ================================================================
//  RANDOM MAP GENERATOR
//  Cave-system terrain: clay + water pockets + sand floor
//  Auto-generates 5 random creatures and seeds base life
// ================================================================
function randomMap(){
  resetSim();
  grid.fill(null);
  Object.keys(POP).forEach(k=>POP[k]=0);
  customCreatures.forEach((_,id)=>{
    delete POP[id]; delete POP[id+100]; delete POP_MAX[id]; delete POP_MAX[id+100];
    if(POP_HISTORY[id]) delete POP_HISTORY[id];
  });
  customCreatures.clear(); nextCustomId=T.CUSTOM_BASE;
  selectedCustom=null;

  const rnd=(lo,hi)=>lo+Math.floor(Math.random()*(hi-lo));
  const shuffle=(a)=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};

  // ── CAVE CARVING ──────────────────────────────────────────────────
  // Goal: dense clay (~80%), large open chambers, branching tunnels, no speckle.
  // Approach: start mostly solid, carve large rooms + drunkard-walk tunnels.
  const solid=new Uint8Array(W*H); // 1=clay, 0=empty

  // Helper: run CA smoothing (cleans up jagged edges)
  const caSmooth=(map,passes,fillThresh,emptyThresh)=>{
    const tmp=new Uint8Array(W*H);
    for(let p=0;p<passes;p++){
      for(let y=0;y<H;y++) for(let x=0;x<W;x++){
        let solidNbrs=0;
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          if(dx===0&&dy===0) continue;
          const nx2=x+dx,ny2=y+dy;
          if(!inB(nx2,ny2)||map[ny2*W+nx2]) solidNbrs++;
        }
        tmp[y*W+x]=solidNbrs>=fillThresh?1:(solidNbrs<=emptyThresh?0:map[y*W+x]);
      }
      map.set(tmp);
    }
  };

  // STEP 1: Start nearly all solid — just light noise so CA has texture to work with
  for(let i=0;i<W*H;i++) solid[i]=Math.random()<0.88?1:0; // 88% solid base
  // Force top 15% open (air zone)
  for(let y=0;y<Math.floor(H*0.15);y++) for(let x=0;x<W;x++) solid[y*W+x]=0;
  // Force bottom 10 rows solid (will become sand)
  for(let y=H-10;y<H;y++) for(let x=0;x<W;x++) solid[y*W+x]=1;

  // One CA pass to clean up any isolated specks from the noise
  caSmooth(solid,3,5,0);

  // STEP 2: Carve 5-9 large organic chambers using ellipse + CA blur
  const chamberCount=rnd(5,10);
  for(let c=0;c<chamberCount;c++){
    const cx2=rnd(8,W-8);
    const cy2=rnd(Math.floor(H*0.18),H-18);
    const rx=rnd(6,18);
    const ry=rnd(5,14);
    // Carve ellipse
    for(let dy=-ry;dy<=ry;dy++) for(let dx=-rx;dx<=rx;dx++){
      if((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)<=1){
        const px=cx2+dx, py=cy2+dy;
        if(inB(px,py)&&py>Math.floor(H*0.13)&&py<H-9) solid[py*W+px]=0;
      }
    }
  }

  // STEP 3: Drunkard-walk tunnels branching off from each chamber
  // This creates the organic winding passages with branches
  const drunkWalk=(sx,sy,steps,width,branchProb)=>{
    let cx2=sx,cy2=sy;
    // Cardinal dirs weighted toward horizontal for cave feel
    const dirs=[[1,0],[1,0],[-1,0],[-1,0],[0,1],[0,-1]];
    let dir=dirs[Math.floor(Math.random()*dirs.length)];
    for(let s=0;s<steps;s++){
      // Occasionally turn
      if(Math.random()<0.18) dir=dirs[Math.floor(Math.random()*dirs.length)];
      // Carve around current pos
      for(let dy=-width;dy<=width;dy++) for(let dx=-width;dx<=width;dx++){
        const px=cx2+dx,py=cy2+dy;
        if(inB(px,py)&&py>Math.floor(H*0.13)&&py<H-9) solid[py*W+px]=0;
      }
      cx2+=dir[0]; cy2+=dir[1];
      if(!inB(cx2,cy2)||cy2<Math.floor(H*0.13)||cy2>=H-9){
        cx2=Math.max(2,Math.min(W-3,cx2));
        cy2=Math.max(Math.floor(H*0.14),Math.min(H-10,cy2));
        dir=dirs[Math.floor(Math.random()*dirs.length)];
      }
      // Spawn branch
      if(Math.random()<branchProb){
        const bDir=dirs[Math.floor(Math.random()*dirs.length)];
        const bLen=rnd(15,50);
        let bx=cx2,by=cy2;
        for(let b=0;b<bLen;b++){
          for(let dy=-Math.max(1,width-1);dy<=Math.max(1,width-1);dy++) for(let dx=-Math.max(1,width-1);dx<=Math.max(1,width-1);dx++){
            const px=bx+dx,py=by+dy;
            if(inB(px,py)&&py>Math.floor(H*0.13)&&py<H-9) solid[py*W+px]=0;
          }
          bx+=bDir[0]; by+=bDir[1];
          if(!inB(bx,by)||by<Math.floor(H*0.14)||by>=H-9) break;
        }
      }
    }
  };

  // Walk tunnels between chambers to ensure connectivity
  const tunnelCount=rnd(8,14);
  for(let t=0;t<tunnelCount;t++){
    const sx=rnd(5,W-5), sy=rnd(Math.floor(H*0.18),H-18);
    drunkWalk(sx,sy,rnd(60,140),rnd(1,2),0.08);
  }

  // STEP 4: Stamp 3-6 large dense clay masses (geological intrusions)
  const massCount=rnd(3,7);
  for(let m=0;m<massCount;m++){
    const cx2=rnd(10,W-10);
    const cy2=rnd(Math.floor(H*0.2),H-15);
    const rx=rnd(10,26);
    const ry=rnd(8,18);
    for(let dy=-ry;dy<=ry;dy++) for(let dx=-rx;dx<=rx;dx++){
      if((dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)<=1){
        const px=cx2+dx, py=cy2+dy;
        if(inB(px,py)&&py<H-9) solid[py*W+px]=1;
      }
    }
  }

  // STEP 5: Final CA smoothing — removes any remaining single-cell speckle
  // Strong fill threshold so isolated open specks fill in, but doesn't close large voids
  caSmooth(solid,2,7,1);

  // Apply to grid as CLAY_HARD (30% reinforced)
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){
    if(solid[y*W+x]) grid[idx(x,y)]={t:T.CLAY_HARD,age:0,reinforced:Math.random()<0.3};
  }

  // ── SAND FLOOR ───────────────────────────────────────────────────
  for(let x=0;x<W;x++) for(let d=0;d<8;d++) grid[idx(x,H-1-d)]=abiotic(T.SAND);
  // Gold sand vein along bottom — clustered, not random
  const veinX=rnd(10,W-30);
  for(let n=0;n<80;n++){
    const x=veinX+rnd(-15,15), y=H-2-rnd(0,12);
    if(inB(x,y)) grid[idx(x,y)]=abiotic(T.GOLD_SAND);
  }
  // White sand patches elsewhere
  for(let n=0;n<30;n++){
    const x=rnd(0,W), y=H-2-rnd(0,6);
    if(inB(x,y)&&grid[idx(x,y)]?.t===T.SAND) grid[idx(x,y)]=abiotic(T.WHITE_SAND);
  }

  // ── ELEMENT POCKETS ──────────────────────────────────────────────
  // Helper: flood-fill empty cells from seed point up to maxSize, bias direction
  const floodFill=(sx,sy,maxSize,downBias=0.6)=>{
    const cells=[];const vis=new Set();const stk=[[sx,sy]];
    while(stk.length&&cells.length<maxSize){
      const[cx2,cy2]=stk.pop();const ci2=cy2*W+cx2;
      if(vis.has(ci2)||!inB(cx2,cy2)||grid[idx(cx2,cy2)]) continue;
      vis.add(ci2);cells.push([cx2,cy2]);
      if(Math.random()<downBias) stk.push([cx2,cy2+1]);
      stk.push([cx2-1,cy2],[cx2+1,cy2]);
      if(Math.random()<0.25) stk.push([cx2,cy2-1]);
    }
    return cells;
  };

  const pickEmpty=(yMin,yMax,attempts=300)=>{
    for(let a=0;a<attempts;a++){
      const x=rnd(0,W), y=rnd(yMin,yMax);
      if(inB(x,y)&&!grid[idx(x,y)]) return[x,y];
    }
    return null;
  };

  // WATER: 4-7 pools, varied sizes (small 20-40, medium 50-100, large 100-200)
  const waterCount=rnd(4,8);
  for(let i=0;i<waterCount;i++){
    const seed=pickEmpty(Math.floor(H*0.3),H-12);
    if(!seed) continue;
    const size=Math.random()<0.3?rnd(20,50):Math.random()<0.5?rnd(50,120):rnd(120,220);
    for(const[fx,fy] of floodFill(...seed,size,0.75)) grid[idx(fx,fy)]=abiotic(T.WATER);
  }

  // OIL: 2-4 small slicks, tends to appear mid-depth
  const oilCount=rnd(2,5);
  for(let i=0;i<oilCount;i++){
    const seed=pickEmpty(Math.floor(H*0.25),Math.floor(H*0.75));
    if(!seed) continue;
    for(const[fx,fy] of floodFill(...seed,rnd(15,50),0.3)) grid[idx(fx,fy)]=abiotic(T.OIL);
  }

  // ICE: 1-3 frozen pockets in upper zone (cold at height)
  const iceCount=rnd(1,4);
  for(let i=0;i<iceCount;i++){
    const seed=pickEmpty(Math.floor(H*0.1),Math.floor(H*0.45));
    if(!seed) continue;
    for(const[fx,fy] of floodFill(...seed,rnd(10,40),0.4))
      grid[idx(fx,fy)]={t:T.ICE,age:0,ttl:800+rnd(0,400)};
  }

  // LAVA: 1-3 vents in deep zone, very small pockets
  const lavaCount=rnd(1,4);
  for(let i=0;i<lavaCount;i++){
    const seed=pickEmpty(Math.floor(H*0.6),H-12);
    if(!seed) continue;
    for(const[fx,fy] of floodFill(...seed,rnd(5,25),0.5))
      grid[idx(fx,fy)]={t:T.LAVA,age:0,ttl:500+rnd(0,300)};
  }

  // ACID: 0-2 rare corrosive pools, mid zone
  if(Math.random()<0.55){
    const aCount=rnd(1,3);
    for(let i=0;i<aCount;i++){
      const seed=pickEmpty(Math.floor(H*0.35),Math.floor(H*0.7));
      if(!seed) continue;
      for(const[fx,fy] of floodFill(...seed,rnd(8,30),0.6))
        grid[idx(fx,fy)]={t:T.ACID,age:0,ttl:300};
    }
  }

  // Collect remaining empty spots for scatter elements
  const allEmpty=[];
  for(let y=Math.floor(H*0.12);y<H-9;y++) for(let x=0;x<W;x++)
    if(!grid[idx(x,y)]) allEmpty.push([x,y]);
  const spots=shuffle([...allEmpty]);
  let si=0;
  const scatter=(t,count,extra={})=>{
    for(let n=0;n<count&&si<spots.length;n++,si++){
      const[x,y]=spots[si];grid[idx(x,y)]={t,age:0,...extra};
    }
  };

  // STONE: clustered formations, scattered across all depths
  scatter(T.STONE, rnd(20,40), {settled:5});
  // WOOD: mid-to-upper zone (buried forest)
  scatter(T.WOOD, rnd(20,35));
  // DETRITUS: organic matter everywhere
  scatter(T.DETRITUS, rnd(40,70));
  // SALT: mid zone deposits
  scatter(T.SALT, rnd(10,20));
  // GUNPOWDER: rare pockets
  if(Math.random()<0.5) scatter(T.GUNPOWDER, rnd(5,12));
  // ASH: near bottom and mid (old burn zones)
  scatter(T.ASH, rnd(15,30));
  // STEAM vents: a few near lava zones (placed as steam particles rising)
  if(Math.random()<0.4) scatter(T.STEAM, rnd(3,8), {ttl:60});
  // WHITE SAND patches mid-cave
  scatter(T.WHITE_SAND, rnd(15,25));
  // MUTAGEN: 1-3 life seeds near gold sand
  scatter(T.MUTAGEN, rnd(1,4), {energy:120, recipe:[128,128,128,128,128,128]});

  // ── 5 RANDOM CREATURES ───────────────────────────────────────────
  const _archetypes=['creature','creature','creature','plant','fungi'];
  const _sizes=[{id:'tiny',name:'Tiny',hp:30,energy:80,speed:2.0},{id:'small',name:'Small',hp:60,energy:120,speed:1.5},{id:'medium',name:'Medium',hp:100,energy:150,speed:1.0},{id:'large',name:'Large',hp:180,energy:200,speed:0.6}];
  const _movs=[{id:'walker',name:'Walker',icon:'🚶'},{id:'flyer',name:'Flyer',icon:'🦋'},{id:'swimmer',name:'Swimmer',icon:'🐟'},{id:'burrower',name:'Burrower',icon:'🐛'},{id:'climber',name:'Climber',icon:'🦎'},{id:'swarmer',name:'Swarmer',icon:'🐝'}];
  const _diets=[{id:'omnivore',name:'Omnivore',targets:[T.PLANT,T.FUNGI,T.DETRITUS,T.ASH],icon:'🍽️'},{id:'herbivore',name:'Herbivore',targets:[T.PLANT,T.SEED],icon:'🌿'},{id:'fungivore',name:'Fungivore',targets:[T.FUNGI,T.SPORE],icon:'🍄'},{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'},{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'},{id:'pyrotroph',name:'Pyrotroph',targets:[T.LAVA,T.FIRE],icon:'🔥'},{id:'cryotroph',name:'Cryotroph',targets:[T.ICE,T.WATER],icon:'❄️'}];
  const _repros=[{id:'budding',name:'Budding',rate:0.02},{id:'spore',name:'Spore',rate:0.008},{id:'cloning',name:'Cloning',rate:0.015},{id:'flowering',name:'Flowering',rate:0.005}];
  const _icons=['🐜','🐛','🦗','🦟','🐞','🦂','🦀','🐙','🦑','🌸','🌺','🍄','👾','👽','🤖','💀','🔮','💎','⭐','❄️'];
  const _rndpick=a=>a[Math.floor(Math.random()*a.length)];
  const _elemDefault={fire:'die',lava:'die',water:'ignore',ice:'ignore',acid:'die',salt:'ignore',smoke:'ignore',steam:'ignore',sand:'ignore',clay:'ignore',wood:'ignore',detritus:'ignore',oil:'ignore',gunpowder:'ignore'};

  for(let n=0;n<5;n++){
    const arch=_archetypes[n];
    const aggr=arch==='creature'?Math.random():0;
    const reproRate=0.2+Math.random()*0.6;
    const hue=Math.floor(Math.random()*360);
    const size=_rndpick(_sizes);
    const mov=arch==='creature'?_rndpick(_movs):{id:'sessile',name:'Sessile',icon:'🌿'};
    const diet=arch==='plant'?{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'}:arch==='fungi'?{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'}:_rndpick(_diets);
    const repro=arch==='plant'?_rndpick([_repros[0],_repros[3]]):arch==='fungi'?_repros[1]:_rndpick(_repros);
    const preyTypes=arch==='creature'&&aggr>0.3?[_rndpick([T.ANT,T.SPIDER,T.MITE,T.FUNGI,T.PLANT])]:[];
    const specials=Math.random()<0.5?[_rndpick(SPECIAL_OPTIONS||[])]:[];
    const c={
      id:nextCustomId,
      name:`Creature ${n+1}`,
      icon:_rndpick(_icons),
      hue, sat:65, lit:35,
      archetype:arch,
      movement:mov,
      diet,
      reproduction:{...repro,rate:0.004+reproRate*0.02},
      size,
      specials:specials.filter(Boolean),
      tolerances:[],
      elemBehaviors:{..._elemDefault},
      preyTypes,
      includesCustomPrey:false,
      allyTypes:[],
      huntedByTypes:[],
      aggression:aggr,
      fear:Math.random()*0.5,
      attackId:_rndpick(['bite','venom','acid_spit','fire_breath','crush']),
      lightReq:arch==='fungi'?0.1:0.3,
      spreadSpeed:arch==='plant'||arch==='fungi'?0.3+Math.random()*0.4:0.1,
      flowerEmit:arch==='plant'?_rndpick(['none','spore','seed','smoke']):'none',
      genome:Array(6).fill(0).map((_,i)=>i===3?Math.floor(aggr*255):i===5?Math.floor(reproRate*255):Math.floor(100+Math.random()*100)),
      created:tickCount,
    };
    c.interactions=generateInteractions(c);
    customCreatures.set(c.id,c);
    nextCustomId++;
    POP[c.id]=0; POP[c.id+100]=0;
    POP_MAX[c.id]=800; POP_MAX[c.id+100]=10;
    POP_HISTORY[c.id]=[];
  }
  updateCustomList(); updateLabHistory();

  showEventToast('RANDOM WORLD GENERATED','5 creatures ready · Paint life to begin · Explore the caves');
}

// ================================================================
//  CREATURE LAB HOVER CARD
// ================================================================
function buildCreatureCardHTML(c){
  const ix=c.interactions||{};
  const col=`hsl(${c.hue},${c.sat}%,65%)`;
  const movLabel=(c.movement?.icon||'')+' '+(c.movement?.name||'').toUpperCase();
  const sizeLabel=(c.size?.name||'').toUpperCase();
  const arch=c.archetype||'creature';
  let html=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border);">`;
  html+=`<span style="font-size:24px;background:hsl(${c.hue},${c.sat}%,${c.lit}%);border-radius:4px;padding:4px;">${c.icon}</span>`;
  html+=`<div><div style="font-family:var(--display);font-size:14px;letter-spacing:2px;color:${col}">${c.name||'Unnamed'}</div>`;
  html+=`<div style="font-size:7px;color:var(--dim);letter-spacing:1px;">${arch==='plant'?'🌿 PLANT':arch==='fungi'?'🍄 FUNGI':movLabel} · ${sizeLabel}</div></div></div>`;
  html+=`<div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px;">`;
  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Diet</span><span>${c.diet?.icon||''} ${c.diet?.name||''}</span></div>`;
  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Repro</span><span>${c.reproduction?.name||''}</span></div>`;
  const preyList=[...(c.preyTypes||[]).map(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);return kt?kt.icon+' '+kt.label:'';}),(c.preyCustomIds||[]).map(id=>{const cc=customCreatures.get(id);return cc?cc.icon+' '+cc.name:'';})].flat().filter(Boolean);
  if(preyList.length) html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Hunts</span><span style="color:#ff8888">${preyList.join(', ')}</span></div>`;
  const harmList=[...(c.harmfulTypes||[]).map(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);return kt?kt.icon+' '+kt.label:'';}),(c.harmfulCustomIds||[]).map(id=>{const cc=customCreatures.get(id);return cc?cc.icon+' '+cc.name:'';})].flat().filter(Boolean);
  if(harmList.length) html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Harms</span><span style="color:#ff8888">${harmList.join(', ')}</span></div>`;
  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">Traits</span><span>${(c.specials||[]).map(s=>s.icon+' '+s.name).join(', ')||'—'}</span></div>`;
  html+=`</div>`;
  if(Object.keys(ix).length){
    html+=`<div style="font-size:7px;letter-spacing:2px;color:var(--accent4);border-bottom:1px solid var(--border);padding-bottom:2px;margin-bottom:5px;">ELEMENT REACTIONS</div>`;
    html+=`<div style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px;">`;
    const elemPairs=[['🔥',ix.fire],['🌋',ix.lava],['💧',ix.water],['🧊',ix.ice],['🟢',ix.acid],['🧂',ix.salt],['💨',ix.smoke],['🌊',ix.steam],['🪵',ix.wood],['🌱',ix.clay],['🏜️',ix.sand],['🛢️',ix.oil]];
    const rc=(r)=>!r?'#555':r==='flee'||r==='die'||r==='die_fast'||r==='dissolve'||r==='drown'?'#ff4455':r==='feed'||r==='absorb'||r==='eat'||r==='mine'||r==='swim'||r==='drink'||r==='gnaw'?'#00ff88':'#aaaacc';
    for(const[ico,reaction] of elemPairs){if(!reaction)continue;const c2=rc(reaction);html+=`<div style="font-size:6px;padding:2px 4px;border:1px solid ${c2}44;color:${c2};background:${c2}11;">${ico} ${reaction}</div>`;}
    html+=`</div>`;
    html+=`<div style="font-size:7px;letter-spacing:2px;color:var(--accent4);border-bottom:1px solid var(--border);padding-bottom:2px;margin-bottom:5px;">MOBILITY</div>`;
    html+=`<div style="display:flex;flex-direction:column;gap:2px;">`;
    if(ix.mob_water_desc) html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">💧 water</span><span>${ix.mob_water_desc}</span></div>`;
    if(ix.mob_clay_desc)  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">🟫 clay</span><span>${ix.mob_clay_desc}</span></div>`;
    if(ix.mob_sand_desc)  html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">🏜️ sand</span><span>${ix.mob_sand_desc}</span></div>`;
    if(ix.mob_oil_desc)   html+=`<div style="display:flex;justify-content:space-between;"><span style="color:var(--dim)">🛢️ oil</span><span>${ix.mob_oil_desc}</span></div>`;
    html+=`</div>`;
  }
  return html;
}

function showCreatureCard(id,mx,my){
  const c=customCreatures.get(id);const card=_dom('lab-creature-card');
  if(!c||!card)return;
  card.innerHTML=buildCreatureCardHTML(c);
  card.style.display='block';
  let tx=mx+16,ty=my-10;
  // Position safely within viewport
  setTimeout(()=>{
    if(tx+card.offsetWidth>window.innerWidth-10) tx=mx-card.offsetWidth-10;
    if(ty+card.offsetHeight>window.innerHeight-10) ty=window.innerHeight-card.offsetHeight-10;
    if(ty<10) ty=10; if(tx<10) tx=10;
    card.style.left=tx+'px'; card.style.top=ty+'px';
  },0);
}

function hideCreatureCard(){
  const card=_dom('lab-creature-card');
  if(card) card.style.display='none';
}

// Hide card on lab popup close
_dom('lab-popup').addEventListener('mouseleave',()=>hideCreatureCard());
// ================================================================
//  WEATHER STATION JS
// ================================================================
function wsSetRain(active){
  ws_rain_active=active;
  if(active){
    ws_rain_type_key=_dom('ws-type').value;
    ws_rain_rate=parseInt(_dom('ws-rate').value);
  }
  _dom('ws-status').textContent=active?`ACTIVE — ${ws_rain_type_key.toUpperCase()} · ${ws_rain_rate}/tick`:'IDLE';
  _dom('ws-start').textContent=active?'◉ RUNNING':'▶ START';
  _dom('ws-start').style.background=active?'rgba(255,100,0,0.15)':'rgba(0,255,136,0.1)';
}

function getProgVoidConfig(){
  const typeMap={water:T.WATER,acid:T.ACID,sand:T.SAND,lava:T.LAVA,ice:T.ICE,salt:T.SALT,smoke:T.SMOKE,steam:T.STEAM,ash:T.ASH,detritus:T.DETRITUS,gunpowder:T.GUNPOWDER,fire:T.FIRE,oil:T.OIL,gold_sand:T.GOLD_SAND,cloud:T.CLOUD,bloom_cloud:T.BLOOM_CLOUD,sand_all:'sand_all',agents:'agents'};
  const key=_dom('pv-type')?.value||'water';
  const radius=parseInt(_dom('pv-radius')?.value||2);
  return{type:typeMap[key]??T.WATER,radius};
}
function getProgCloudConfig(){
  const typeMap={water:T.WATER,acid:T.ACID,sand:T.SAND,lava:T.LAVA,ice:T.ICE,salt:T.SALT,smoke:T.SMOKE,steam:T.STEAM,ash:T.ASH,detritus:T.DETRITUS,gunpowder:T.GUNPOWDER,fire:T.FIRE,oil:T.OIL,gold_sand:T.GOLD_SAND};
  const key=_dom('pc-type')?.value||'water';
  const rate=parseInt(_dom('pc-rate')?.value||30);
  return{type:typeMap[key]||T.WATER,rate};
}

// Wire up stamp-sel change (attaches after React renders the toolbar)
function attachToolbarListeners(){
  const stampSel=_dom('stamp-sel');
  if(stampSel&&!stampSel._wired){
    stampSel._wired=true;
    stampSel.addEventListener('change',()=>{
      const isBox=getStampMode()==='box_draw';
      const hint=_dom('stamp-hint');if(hint)hint.style.display=isBox?'block':'none';
      const bp=_dom('box-preview');if(bp)bp.style.display='none';
    });
  }
  const wsRate=_dom('ws-rate');
  if(wsRate&&!wsRate._wired){
    wsRate._wired=true;
    wsRate.addEventListener('input',function(){
      const v=_dom('ws-rate-val');if(v)v.textContent=this.value;
      if(ws_rain_active)ws_rain_rate=parseInt(this.value);
    });
  }
  const wsStart=_dom('ws-start');
  if(wsStart&&!wsStart._wired){
    wsStart._wired=true;
    wsStart.addEventListener('click',()=>wsSetRain(!ws_rain_active));
  }
  const wsClose=_dom('ws-close-btn');
  if(wsClose&&!wsClose._wired){
    wsClose._wired=true;
    wsClose.addEventListener('click',()=>{wsSetRain(false);const p=_dom('ws-panel');if(p)p.style.display='none';});
  }
  const pcRate=_dom('pc-rate');
  if(pcRate&&!pcRate._wired){
    pcRate._wired=true;
    pcRate.addEventListener('input',function(){const v=_dom('pc-rate-val');if(v)v.textContent=this.value+' ticks';});
  }
  const pvRadius=_dom('pv-radius');
  if(pvRadius&&!pvRadius._wired){
    pvRadius._wired=true;
    pvRadius.addEventListener('input',function(){const v=_dom('pv-radius-val');if(v)v.textContent=this.value;});
  }
}
document.addEventListener('DOMContentLoaded',attachToolbarListeners);
// Also run after a short delay so React-rendered elements are in the DOM
setTimeout(attachToolbarListeners,200);

// ================================================================
function openDocs(){ _dom('docs-overlay').classList.add('open'); }
function closeDocs(){ _dom('docs-overlay').classList.remove('open'); }
_dom('docs-overlay').addEventListener('click',e=>{
  if(e.target===_dom('docs-overlay'))closeDocs();
});
function openGuide(){ _dom('guide-overlay').style.display='flex'; }
function closeGuide(){ _dom('guide-overlay').style.display='none'; }
_dom('guide-overlay').addEventListener('click',e=>{
  if(e.target===_dom('guide-overlay'))closeGuide();
});

// ================================================================
//  EVENT TOAST
// ================================================================
let toastTimer=null;
function showEventToast(name, desc){
  const toast=_dom('event-toast');
  _dom('et-name').textContent=name;
  _dom('et-desc').textContent=desc;
  toast.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'), 4500);
}
// ================================================================
//  CREATURE LAB — Custom organisms with generated traits
// ================================================================
const TRAIT_OPTIONS = {
  movement:[
    {id:'walker',name:'Walker',desc:'Walks on surfaces',icon:'🚶'},
    {id:'flyer',name:'Flyer',desc:'Floats through air',icon:'🦋'},
    {id:'swimmer',name:'Swimmer',desc:'Moves through water',icon:'🐟'},
    {id:'burrower',name:'Burrower',desc:'Tunnels through sand',icon:'🐛'},
    {id:'climber',name:'Climber',desc:'Clings to walls',icon:'🦎'},
    {id:'swarmer',name:'Swarmer',desc:'Moves toward others',icon:'🐝'},
  ],
  diet:[
    {id:'herbivore',name:'Herbivore',targets:[T.PLANT,T.SEED],icon:'🌿'},
    {id:'carnivore',name:'Carnivore',targets:['agents'],icon:'🥩'},
    {id:'fungivore',name:'Fungivore',targets:[T.FUNGI,T.SPORE],icon:'🍄'},
    {id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂',desc:'Eats ash and detritus'},
    {id:'lithivore',name:'Lithivore',targets:[T.STONE,T.SAND,T.GOLD_SAND],icon:'🪨',desc:'Eats minerals'},
    {id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'},
    {id:'parasitic',name:'Parasitic',targets:['agents'],icon:'🦠'},
    {id:'omnivore',name:'Omnivore',targets:[T.PLANT,T.FUNGI,T.DETRITUS,T.ASH],icon:'🍽️'},
    {id:'pyrotroph',name:'Pyrotroph',targets:[T.LAVA,T.FIRE],icon:'🔥',desc:'Feeds on heat — immune to fire'},
    {id:'cryotroph',name:'Cryotroph',targets:[T.ICE,T.WATER],icon:'❄️',desc:'Feeds on cold — thrives near ice'},
  ],
  reproduction:[
    {id:'budding',name:'Budding',rate:0.02},
    {id:'egg_layer',name:'Egg Layer',rate:0.01},
    {id:'spore',name:'Spore Release',rate:0.008},
    {id:'cloning',name:'Cloning',rate:0.015},
  ],
  special:[
    {id:'bioluminescent',name:'Bioluminescent',icon:'💡'},
    {id:'venomous',name:'Venomous',icon:'☠️'},
    {id:'armored',name:'Armored',icon:'🛡️'},
    {id:'regenerating',name:'Regenerating',icon:'💚'},
    {id:'fire_immune',name:'Fire Immune',icon:'🔥'},
    {id:'acid_immune',name:'Acid Resistant',icon:'🧪'},
    {id:'pyro',name:'Pyromaniac',icon:'💥',desc:'Ignites nearby flammables'},
    {id:'crystalline',name:'Crystalline',icon:'💎',desc:'Slowly converts neighbors to stone'},
    {id:'smokescreen',name:'Smokescreen',icon:'💨',desc:'Emits smoke when threatened'},
  ],
  size:[
    {id:'tiny',name:'Tiny',hp:30,energy:80,speed:2.0},
    {id:'small',name:'Small',hp:60,energy:120,speed:1.5},
    {id:'medium',name:'Medium',hp:100,energy:150,speed:1.0},
    {id:'large',name:'Large',hp:180,energy:200,speed:0.6},
  ],
};

const CREATURE_ICONS=['🐜','🐛','🦗','🦟','🐞','🦂','🦀','🐙','🦑','🐚','🐌','🦋','🐝','🪲','🪳','🦠','👾','👽','🤖','💀','👻','🔮','💎','⭐','🌟','✨','🌀','❄️','⚡','🌊','🍄','🌸','🌺','💜','💙','💚','💛','🧡','❤️'];

// Chromadust hue-bucket → creature spec (cleared on reset)
const chromaStrains = new Map(); // hue (0,30,60…330) → {baseType, genome, sid}

const lucidSources=[]; // {x,y,age,hue} — visual fractal wave sources
const LUCID_LIFETIME=400;
const MAX_LUCID_SOURCES=14;

// Custom creature state
const customCreatures = new Map();
let nextCustomId = T.CUSTOM_BASE;
let pendingCreature = null;
let selectedCustom = null;
let selectedIsQueen = false;
let historySelectedId = null;
// Observe mode state
let observeMode = false;
let savedSpeedMult = 1;

// ================================================================
//  PROCEDURAL CREATURE INTERACTION GENERATOR
//  Generates a unique interaction profile for every element and kingdom
//  based on the creature's traits. Used in stepCustom and observe.
// ================================================================
function generateInteractions(c){
  const m=(c.movement?.id)||'walker', d=(c.diet?.id)||'omnivore';
  const specIds=(c.specials||[]).map(s=>s.id);
  const isSmall=c.size.id==='tiny'||c.size.id==='small';
  const isLarge=c.size.id==='large';
  const fireImmune=specIds.includes('fire_immune')||d==='pyrotroph';
  const acidResist=specIds.includes('acid_immune');
  const armorOf=specIds.includes('armored');

  // Helper: pick weighted random from array
  const pw=(opts)=>opts[Math.floor(Math.random()*opts.length)];

  return {
    // ── ELEMENT INTERACTIONS ──
    water:   m==='swimmer'?'swim':m==='flyer'?'float':isSmall?'drown':pw(['avoid','wade','drink']),
    oil:     m==='swimmer'?'swim_slow':m==='flyer'?'avoid':pw(['coat','avoid','drown_slow']),
    sand:    m==='burrower'?'burrow':pw(['walk','slow','avoid']),
    clay:    m==='burrower'?'tunnel':isLarge?'push_through':pw(['avoid','slow','stuck']),
    stone:   m==='burrower'&&isLarge?'drill':pw(['climb','avoid','stuck']),
    lava:    fireImmune?'feed':armorOf?'resist':pw(['flee','die_fast','die_slow']),
    fire:    fireImmune?'absorb':armorOf?'resist':pw(['flee','singe','die']),
    acid:    acidResist?'resist':isSmall?'dissolve':pw(['flee','corrode','die']),
    ice:     d==='cryotroph'?'feed':m==='swimmer'?'slide':pw(['slow','freeze','avoid']),
    steam:   m==='flyer'?'ride':pw(['avoid','scald','ignore']),
    smoke:   m==='flyer'?'navigate':pw(['blind','ignore','choke']),
    salt:    d==='lithivore'?'mine':isSmall?'irritate':pw(['avoid','crystallize','die_slow']),
    wood:    d==='herbivore'||d==='omnivore'?'gnaw':pw(['nest','perch','ignore']),
    ash:     d==='detritivore'||d==='omnivore'?'eat':pw(['dust','ignore','avoid']),
    gunpowder: specIds.includes('pyro')?'ignite':pw(['flee','avoid','collect']),
    detritus:  d==='detritivore'||d==='omnivore'?'eat':pw(['avoid','burrow_in','ignore']),
    // ── KINGDOM INTERACTIONS ──
    vs_ant:    d==='carnivore'?'hunt':d==='parasitic'?'infect':pw(['flee','ignore','compete','ally']),
    vs_spider: d==='carnivore'&&isLarge?'hunt':pw(['flee','avoid','ignore','prey']),
    vs_fungi:  d==='fungivore'?'eat':d==='parasitic'?'infect':pw(['ignore','spread_with','avoid']),
    vs_mite:   d==='carnivore'?'hunt':isSmall?'compete':pw(['ignore','flee','ally']),
    vs_plant:  d==='herbivore'||d==='omnivore'?'eat':m==='climber'?'nest_on':pw(['ignore','shelter_in','avoid']),
    // ── MOBILITY RATINGS (0-3) ──
    mob_water: m==='swimmer'?3:m==='flyer'?2:isSmall?0:1,
    mob_oil:   m==='swimmer'?2:m==='flyer'?1:0,
    mob_clay:  m==='burrower'?3:isLarge?2:1,
    mob_sand:  m==='burrower'?3:2,
    mob_air:   m==='flyer'?3:m==='climber'?2:1,
    mob_water_desc: m==='swimmer'?'expert swimmer':m==='flyer'?'skims surface':isSmall?'drowns quickly':'wades slowly',
    mob_oil_desc:   m==='swimmer'?'swims through oil':m==='flyer'?'avoids contact':'gets coated, moves slowly',
    mob_clay_desc:  m==='burrower'?'tunnels freely':isLarge?'forces through slowly':'cannot enter',
    mob_sand_desc:  m==='burrower'?'burrows rapidly':'walks on surface',
  };
}

// ================================================================
//  CREATURE LAB — Manual Builder
// ================================================================

const KINGDOM_TARGETS=[
  {id:'ant',   label:'ANT',   icon:'🐜', type:T.ANT},
  {id:'termite',label:'TERMITE',icon:'🪲', type:T.TERMITE},
  {id:'qtermite',label:'Q.TERMITE',icon:'🪲👑', type:T.QUEEN_TERMITE},
  {id:'queen', label:'QUEEN ANT', icon:'👑', type:T.QUEEN},
  {id:'spider',label:'SPIDER',icon:'🕷️', type:T.SPIDER},
  {id:'qspider',label:'Q.SPIDER',icon:'🕸️', type:T.QUEEN_SPIDER},
  {id:'fungi', label:'FUNGI', icon:'🍄', type:T.FUNGI},
  {id:'mite',  label:'MITE',  icon:'🪲', type:T.MITE},
  {id:'qmite', label:'Q.MITE', icon:'🪲👑', type:T.QUEEN_MITE},
  {id:'plant', label:'PLANT', icon:'🌿', type:T.PLANT},
  {id:'custom',label:'CUSTOM',icon:'👾', type:'custom'}, // all custom creatures
];

const SPECIAL_OPTIONS=[
  {id:'bioluminescent',name:'Bioluminescent',icon:'💡'},
  {id:'venomous',name:'Venomous',icon:'☠️'},
  {id:'armored',name:'Armored',icon:'🛡️'},
  {id:'regenerating',name:'Regenerating',icon:'💚'},
  {id:'fire_immune',name:'Fire Immune',icon:'🔥'},
  {id:'acid_immune',name:'Acid Resist',icon:'🧪'},
  {id:'pyro',name:'Pyromaniac',icon:'💥'},
  {id:'crystalline',name:'Crystalline',icon:'💎'},
  {id:'smokescreen',name:'Smokescreen',icon:'💨'},
  {id:'frogstone_immune',name:'Frogstone Immune',icon:'🐸🛡️'},
];

const TOLERANCE_OPTIONS=[
  {id:'water',icon:'💧',label:'Water'},
  {id:'lava', icon:'🌋',label:'Lava'},
  {id:'acid', icon:'🟢',label:'Acid'},
  {id:'ice',  icon:'🧊',label:'Ice'},
  {id:'smoke',icon:'💨',label:'Smoke'},
  {id:'salt', icon:'🧂',label:'Salt'},
];

// State of current toggles in builder
let labPreySet=new Set();
let labAllySet=new Set();
let labHuntedBySet=new Set();
let labHarmfulSet=new Set();
let labSpecialSet=new Set();
let labToleranceSet=new Set();
let labIcon=CREATURE_ICONS[0];
let editingCreatureId=null; // null = creating new, number = editing existing

// Per-element behavior state: maps elementId -> reaction string
let labElemBehaviors={};

const ELEM_BEHAVIOR_DEFS=[
  {id:'fire',  icon:'🔥', label:'Fire',    opts:['die','flee','resist','feed on','ignore']},
  {id:'lava',  icon:'🌋', label:'Lava',    opts:['die','flee','resist','feed on','ignore']},
  {id:'water', icon:'💧', label:'Water',   opts:['die','drink','swim in','flee','ignore']},
  {id:'ice',   icon:'🧊', label:'Ice',     opts:['freeze','slow','skate on','feed on','ignore']},
  {id:'acid',  icon:'🟢', label:'Acid',    opts:['die','flee','resist','ignore']},
  {id:'salt',  icon:'🧂', label:'Salt',    opts:['die','mine','repelled','ignore']},
  {id:'smoke', icon:'💨', label:'Smoke',   opts:['choke','blind','ignore']},
  {id:'steam', icon:'🌊', label:'Steam',   opts:['scald','absorb','ignore']},
  {id:'sand',  icon:'🏜️', label:'Sand',   opts:['burrow','walk on','ignore']},
  {id:'clay',  icon:'🟫', label:'Clay',    opts:['dig','tunnels','blocked','ignore']},
  {id:'wood',  icon:'🪵', label:'Wood',    opts:['eat','nest in','blocked','ignore']},
  {id:'detritus',icon:'🍂',label:'Detritus',opts:['eat','nest in','ignore']},
  {id:'oil',   icon:'🛢️', label:'Oil',    opts:['swim in','coated','drink','ignore']},
  {id:'gunpowder',icon:'💥',label:'Gunpowder',opts:['explode on','eat','ignore']},
];

function buildElemBehaviorTable(){
  const el=_dom('lab-elem-behaviors');
  if(!el) return;
  el.innerHTML='';
  for(const def of ELEM_BEHAVIOR_DEFS){
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:6px;';
    const lbl=document.createElement('span');
    lbl.style.cssText='font-size:9px;width:80px;color:var(--text);flex-shrink:0;';
    lbl.textContent=`${def.icon} ${def.label}`;
    const sel=document.createElement('select');
    sel.style.cssText='background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:7px;padding:2px 4px;flex:1;';
    sel.dataset.elemId=def.id;
    for(const opt of def.opts){
      const o=document.createElement('option');
      o.value=opt; o.textContent=opt;
      if(labElemBehaviors[def.id]===opt) o.selected=true;
      sel.appendChild(o);
    }
    sel.addEventListener('change',()=>{labElemBehaviors[def.id]=sel.value;});
    row.appendChild(lbl); row.appendChild(sel);
    el.appendChild(row);
    // Init default
    if(!labElemBehaviors[def.id]) labElemBehaviors[def.id]=def.opts[def.opts.length-1]; // 'ignore' is always last
  }
}

function buildKingdomToggleListWithCustom(containerId, stateSet, activeClass){
  const el=_dom(containerId);
  el.innerHTML='';
  const allTargets=[...KINGDOM_TARGETS];
  // Add current lab creatures
  customCreatures.forEach(c=>{allTargets.push({id:'custom_'+c.id,label:c.name,icon:c.icon,type:'custom',customId:c.id});});
  for(const item of allTargets){
    const btn=document.createElement('div');
    btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    btn.textContent=`${item.icon||''} ${item.label}`;
    btn.onclick=()=>{
      if(stateSet.has(item.id)) stateSet.delete(item.id);
      else stateSet.add(item.id);
      btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    };
    el.appendChild(btn);
  }
}

function onArchetypeChange(){
  const arch=_dom('lab-archetype').value;
  const isPlantFungi=arch==='plant'||arch==='fungi';
  _dom('lab-plant-opts').style.display=isPlantFungi?'block':'none';
  _dom('lab-movement-field').style.display=isPlantFungi?'none':'block';
  _dom('lab-section-prey').style.display=isPlantFungi?'none':'block';
  _dom('lab-prey-list').style.display=isPlantFungi?'none':'block';
  _dom('lab-attack-field').style.display=isPlantFungi?'none':'block';
  // Set default diet for archetype
  if(arch==='plant') _dom('lab-diet').value='photosynthetic';
  if(arch==='fungi') { _dom('lab-diet').value='detritivore'; _dom('lab-light-req').value=10; _dom('lab-light-val').textContent='10%'; }
  if(arch==='creature') _dom('lab-diet').value='omnivore';
}

function buildLabPanel(){
  const panel=_dom('lab-panel');if(!panel)return;
  panel.innerHTML=`
<button id="lab-close">✕ CLOSE</button>
<div id="lab-creature-card" style="display:none;position:absolute;z-index:9999;background:var(--card,#1a1a1a);border:1px solid var(--border,#444);padding:6px;border-radius:4px;font-size:7px;pointer-events:none;max-width:140px;"></div>
<div style="display:flex;gap:6px;flex:1;min-height:0;margin-top:6px;overflow:hidden;">
  <div id="lab-left" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:5px;padding-right:4px;">
    <div style="display:flex;align-items:center;gap:5px;">
      <div id="lab-icon-display" style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:13px;cursor:pointer;background:hsl(180,60%,25%);flex-shrink:0;">?</div>
      <input id="lab-name" type="text" placeholder="Name..." style="flex:1;font-size:8px;padding:2px 4px;background:#1a1a1a;border:1px solid #444;border-radius:3px;color:#eee;"/>
    </div>
    <div id="lab-icon-picker" style="display:none;position:absolute;z-index:200;background:#1a1a1a;border:1px solid #444;border-radius:4px;padding:4px;flex-wrap:wrap;max-width:150px;max-height:80px;overflow-y:auto;"></div>
    <div style="display:flex;align-items:center;gap:5px;">
      <div id="lab-color-preview" style="width:14px;height:14px;border-radius:50%;flex-shrink:0;"></div>
      <input id="lab-hue" type="range" min="0" max="360" value="180" style="flex:1;" oninput="_labFn.updateColor()">
    </div>
    <div class="lab-lbl">ARCHETYPE</div>
    <select id="lab-archetype" style="font-size:8px;padding:2px;" onchange="_labFn.archChange()">
      <option value="creature">Creature</option><option value="plant">Plant</option><option value="fungi">Fungi</option>
    </select>
    <div class="lab-lbl">SIZE</div>
    <select id="lab-size" style="font-size:8px;padding:2px;">
      <option value="tiny">Tiny</option><option value="small">Small</option><option value="medium" selected>Medium</option><option value="large">Large</option>
    </select>
    <div id="lab-movement-field">
      <div class="lab-lbl">MOVEMENT</div>
      <select id="lab-movement" style="font-size:8px;padding:2px;">
        <option value="walker">Walker</option><option value="flyer">Flyer</option><option value="swimmer">Swimmer</option>
        <option value="burrower">Burrower</option><option value="climber">Climber</option><option value="swarmer">Swarmer</option>
      </select>
    </div>
    <div class="lab-lbl">DIET</div>
    <select id="lab-diet" style="font-size:8px;padding:2px;">
      <option value="herbivore">Herbivore</option><option value="fungivore">Fungivore</option><option value="detritivore">Detritivore</option>
      <option value="lithivore">Lithivore</option><option value="omnivore" selected>Omnivore</option><option value="photosynthetic">Photosynthetic</option>
      <option value="parasitic">Parasitic</option><option value="pyrotroph">Pyrotroph</option><option value="cryotroph">Cryotroph</option>
    </select>
    <div id="lab-attack-field">
      <div class="lab-lbl">ATTACK</div>
      <select id="lab-attack" style="font-size:8px;padding:2px;">
        <option value="bite">Bite</option><option value="venom">Venom</option><option value="acid_spit">Acid Spit</option>
        <option value="fire_breath">Fire Breath</option><option value="crush">Crush</option>
      </select>
    </div>
    <div class="lab-lbl">REPRODUCTION</div>
    <select id="lab-repro-type" style="font-size:8px;padding:2px;">
      <option value="budding">Budding</option><option value="egg_layer">Egg Layer</option><option value="spore">Spore</option>
      <option value="cloning">Cloning</option><option value="flowering">Flowering</option>
    </select>
    <div id="lab-plant-opts" style="display:none;">
      <div class="lab-lbl">LIGHT REQ <span id="lab-light-val">40%</span></div>
      <input id="lab-light-req" type="range" min="0" max="100" value="40" style="width:100%;" oninput="document.getElementById('lab-light-val').textContent=this.value+'%'">
      <div class="lab-lbl">SPREAD SPD <span id="lab-spread-val">40%</span></div>
      <input id="lab-spread" type="range" min="0" max="100" value="40" style="width:100%;" oninput="document.getElementById('lab-spread-val').textContent=this.value+'%'">
      <div class="lab-lbl">FLOWER EMIT</div>
      <select id="lab-flower-emit" style="font-size:8px;padding:2px;">
        <option value="none">None</option><option value="fire">Fire</option><option value="acid">Acid</option><option value="spore">Spore</option>
      </select>
    </div>
  </div>
  <div id="lab-right" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:5px;padding-left:4px;">
    <div class="lab-lbl">AGGRESSION <span id="lab-aggression-val">50%</span></div>
    <input id="lab-aggression" type="range" min="0" max="100" value="50" style="width:100%;" oninput="document.getElementById('lab-aggression-val').textContent=this.value+'%'">
    <div class="lab-lbl">REPRODUCTION <span id="lab-repro-val">40%</span></div>
    <input id="lab-repro" type="range" min="0" max="100" value="40" style="width:100%;" oninput="document.getElementById('lab-repro-val').textContent=this.value+'%'">
    <div class="lab-lbl">FEAR <span id="lab-fear-val">30%</span></div>
    <input id="lab-fear" type="range" min="0" max="100" value="30" style="width:100%;" oninput="document.getElementById('lab-fear-val').textContent=this.value+'%'">
    <div id="lab-section-prey" class="lab-lbl">PREY</div>
    <div id="lab-prey-list" class="lab-toggle-list"></div>
    <div class="lab-lbl">ALLIES</div>
    <div id="lab-ally-list" class="lab-toggle-list"></div>
    <div class="lab-lbl">HUNTED BY</div>
    <div id="lab-hunted-list" class="lab-toggle-list"></div>
    <div class="lab-lbl">HARMFUL TO</div>
    <div id="lab-harmful-list" class="lab-toggle-list"></div>
    <div class="lab-lbl">SPECIALS</div>
    <div id="lab-specials-list" class="lab-toggle-list"></div>
    <div class="lab-lbl">TOLERANCES</div>
    <div id="lab-tolerances" class="lab-toggle-list"></div>
    <div class="lab-lbl">ELEM BEHAVIOR</div>
    <div id="lab-elem-behaviors"></div>
  </div>
</div>
<div class="lab-footer" style="flex-shrink:0;padding:6px 4px 2px;border-top:1px solid var(--btn-border,#444);margin-top:4px;">
  <div class="lab-btn-row" style="display:flex;gap:4px;margin-bottom:4px;">
    <button class="primary" style="flex:1;font-size:8px;padding:4px 6px;cursor:pointer;">✓ SAVE CREATURE</button>
    <button style="font-size:8px;padding:4px 6px;cursor:pointer;">🎲</button>
  </div>
  <div class="lab-lbl">YOUR CREATURES</div>
  <div id="lab-history" style="overflow-y:auto;max-height:80px;"></div>
</div>`;
  // Re-attach close button (replaces the one from JSX)
  const closeBtn=_dom('lab-close');
  if(closeBtn) closeBtn.addEventListener('click',()=>closeLab());
  // Attach save/generate buttons
  const btnRow=_domQ('.lab-btn-row');
  if(btnRow){
    btnRow.querySelector('.primary')?.addEventListener('click',()=>saveCreature());
    btnRow.querySelectorAll('button')[1]?.addEventListener('click',()=>generateCreature());
  }
  // Attach icon display click
  _dom('lab-icon-display')?.addEventListener('click',()=>toggleIconPicker());
}

function initLabBuilder(){
  if(!_dom('lab-archetype')) buildLabPanel();
  updateLabColorPreview();
  const picker=_dom('lab-icon-picker');
  picker.innerHTML=CREATURE_ICONS.map(ic=>`<span style="cursor:pointer;padding:2px;" onclick="selectLabIcon('${ic}')">${ic}</span>`).join('');
  picker.style.display='none';

  buildKingdomToggleListWithCustom('lab-prey-list', labPreySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-ally-list', labAllySet, 'active-ally');
  buildKingdomToggleListWithCustom('lab-hunted-list', labHuntedBySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-harmful-list', labHarmfulSet, 'active-prey');
  buildToggleList('lab-specials-list', SPECIAL_OPTIONS.map(s=>({id:s.id,label:s.name,icon:s.icon})), labSpecialSet, 'active-special');
  buildToggleList('lab-tolerances', TOLERANCE_OPTIONS.map(t=>({id:t.id,label:t.label,icon:t.icon})), labToleranceSet, 'active-tol');
  buildElemBehaviorTable();
  onArchetypeChange();
}

function buildToggleList(containerId, items, stateSet, activeClass){
  const el=_dom(containerId);
  if(!el) return;
  el.innerHTML='';
  for(const item of items){
    const btn=document.createElement('div');
    btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    btn.textContent=`${item.icon||''} ${item.label}`;
    btn.onclick=()=>{
      if(stateSet.has(item.id)) stateSet.delete(item.id);
      else stateSet.add(item.id);
      btn.className='lab-toggle'+(stateSet.has(item.id)?` ${activeClass}`:'');
    };
    el.appendChild(btn);
  }
}

function updateLabColorPreview(){
  const hue=_dom('lab-hue')?.value||180;
  const cp=_dom('lab-color-preview');
  const id=_dom('lab-icon-display');
  if(cp) cp.style.background=`hsl(${hue},70%,45%)`;
  if(id) id.style.background=`hsl(${hue},60%,25%)`;
}

function toggleIconPicker(){
  const p=_dom('lab-icon-picker');
  p.style.display=p.style.display==='flex'?'none':'flex';
  if(p.style.display==='flex') p.style.flexWrap='wrap';
}

function selectLabIcon(icon){
  labIcon=icon;
  _dom('lab-icon-display').textContent=icon;
  _dom('lab-icon-picker').style.display='none';
}

function readLabForm(){
  const sizeMap={tiny:{id:'tiny',name:'Tiny',hp:30,energy:80,speed:2.0},small:{id:'small',name:'Small',hp:60,energy:120,speed:1.5},medium:{id:'medium',name:'Medium',hp:100,energy:150,speed:1.0},large:{id:'large',name:'Large',hp:180,energy:200,speed:0.6}};
  const movMap={walker:{id:'walker',name:'Walker',icon:'🚶'},flyer:{id:'flyer',name:'Flyer',icon:'🦋'},swimmer:{id:'swimmer',name:'Swimmer',icon:'🐟'},burrower:{id:'burrower',name:'Burrower',icon:'🐛'},climber:{id:'climber',name:'Climber',icon:'🦎'},swarmer:{id:'swarmer',name:'Swarmer',icon:'🐝'}};
  const reproMap={budding:{id:'budding',name:'Budding',rate:0.02},egg_layer:{id:'egg_layer',name:'Egg Layer',rate:0.01},spore:{id:'spore',name:'Spore',rate:0.008},cloning:{id:'cloning',name:'Cloning',rate:0.015},flowering:{id:'flowering',name:'Flowering',rate:0.005}};
  const dietTargetMap={herbivore:{id:'herbivore',name:'Herbivore',targets:[T.PLANT,T.SEED],icon:'🌿'},fungivore:{id:'fungivore',name:'Fungivore',targets:[T.FUNGI,T.SPORE],icon:'🍄'},detritivore:{id:'detritivore',name:'Detritivore',targets:[T.DETRITUS,T.ASH],icon:'🍂'},lithivore:{id:'lithivore',name:'Lithivore',targets:[T.STONE,T.SAND,T.GOLD_SAND],icon:'🪨'},omnivore:{id:'omnivore',name:'Omnivore',targets:[T.PLANT,T.FUNGI,T.DETRITUS,T.ASH],icon:'🍽️'},photosynthetic:{id:'photosynthetic',name:'Photosynthetic',targets:[],icon:'☀️'},parasitic:{id:'parasitic',name:'Parasitic',targets:['agents'],icon:'🦠'},pyrotroph:{id:'pyrotroph',name:'Pyrotroph',targets:[T.LAVA,T.FIRE],icon:'🔥'},cryotroph:{id:'cryotroph',name:'Cryotroph',targets:[T.ICE,T.WATER],icon:'❄️'}};

  const arch=_dom('lab-archetype').value;
  const hue=parseInt(_dom('lab-hue').value);
  const sizeId=_dom('lab-size').value;
  const movId=_dom('lab-movement').value;
  const reprTypeId=_dom('lab-repro-type').value;
  const dietId=_dom('lab-diet').value;
  const attackId=_dom('lab-attack').value;
  const aggr=parseInt(_dom('lab-aggression').value)/100;
  const reproRate=parseInt(_dom('lab-repro').value)/100;
  const fear=parseInt(_dom('lab-fear').value)/100;
  const lightReq=parseInt(_dom('lab-light-req')?.value||40)/100;
  const spreadSpeed=parseInt(_dom('lab-spread')?.value||40)/100;
  const flowerEmit=_dom('lab-flower-emit')?.value||'none';

  const preyTypes=[];
  const preyCustomIds=[];
  for(const id of labPreySet){
    if(id.startsWith('custom_')){preyCustomIds.push(parseInt(id.split('_')[1]));}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')preyTypes.push(kt.type);}
  }
  const includesCustomPrey=labPreySet.has('custom'); // still keep: "all other custom"

  const allyTypes=[];
  const allyCustomIds=[];
  for(const id of labAllySet){
    if(id.startsWith('custom_')){allyCustomIds.push(parseInt(id.split('_')[1]));}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')allyTypes.push(kt.type);}
  }

  const huntedByTypes=[];
  for(const id of labHuntedBySet){
    if(id.startsWith('custom_')){huntedByTypes.push({customId:parseInt(id.split('_')[1])});}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')huntedByTypes.push({type:kt.type});}
  }

  // Plant/fungi: harmfulTypes = organisms damaged on contact
  const harmfulTypes=[];
  const harmfulCustomIds=[];
  for(const id of labHarmfulSet){
    if(id.startsWith('custom_')){harmfulCustomIds.push(parseInt(id.split('_')[1]));}
    else{const kt=KINGDOM_TARGETS.find(k=>k.id===id);if(kt&&kt.type!=='custom')harmfulTypes.push(kt.type);}
  }

  const specials=SPECIAL_OPTIONS.filter(s=>labSpecialSet.has(s.id));
  const tolerances=[...labToleranceSet];
  const elemBehaviors={...labElemBehaviors};

  return {
    id:nextCustomId, name:'',
    icon:labIcon, hue, sat:70, lit:35,
    archetype:arch,
    movement:movMap[movId]||movMap.walker,
    diet:dietTargetMap[dietId]||dietTargetMap.omnivore,
    reproduction:{...(reproMap[reprTypeId]||reproMap.budding), rate:0.004+reproRate*0.02},
    size:sizeMap[sizeId]||sizeMap.medium,
    specials, tolerances, elemBehaviors,
    preyTypes, preyCustomIds, includesCustomPrey, allyTypes, allyCustomIds, huntedByTypes,
    harmfulTypes, harmfulCustomIds,
    aggression:aggr, fear, attackId,
    lightReq, spreadSpeed, flowerEmit,
    genome:Array(6).fill(0).map((_,i)=>{
      if(i===3)return Math.floor(aggr*255);
      if(i===5)return Math.floor(reproRate*255);
      return Math.floor(100+Math.random()*100);
    }),
    created:tickCount,
  };
}

function openLab(){
  // Reset edit state if opened from scratch (not via editCreature)
  editingCreatureId=null;
  const banner=_dom('lab-editing-banner');
  if(banner) banner.remove();
  const saveBtn=_domQ('.lab-btn-row button.primary');
  if(saveBtn) saveBtn.textContent='✓ SAVE CREATURE';

  _dom('lab-popup').classList.add('open');
  // Defer DOM injection until after React's re-render (triggered by MenuDrawer close())
  setTimeout(()=>{
    buildLabPanel();
    initLabBuilder();
    updateLabHistory();
    const iconEl=_dom('lab-icon-display');
    if(iconEl) iconEl.textContent=labIcon;
    updateLabColorPreview();
  }, 0);
}
function closeLab(){
  _dom('lab-popup').classList.remove('open');
  const banner=_dom('lab-editing-banner');
  if(banner) banner.remove();
  const saveBtn=_domQ('.lab-btn-row button.primary');
  if(saveBtn) saveBtn.textContent='✓ SAVE CREATURE';
}

function generateCreature(){
  const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
  const archetypes=['creature','plant','fungi'];
  const arch=pick(archetypes);
  _dom('lab-archetype').value=arch;
  onArchetypeChange();
  _dom('lab-hue').value=Math.floor(Math.random()*360);
  _dom('lab-size').value=pick(['tiny','small','medium','large']);
  if(arch==='creature') _dom('lab-movement').value=pick(['walker','flyer','swimmer','burrower','climber','swarmer']);
  _dom('lab-diet').value=arch==='plant'?'photosynthetic':arch==='fungi'?pick(['detritivore','fungivore']):pick(['omnivore','herbivore','fungivore','detritivore','photosynthetic','parasitic','pyrotroph','cryotroph']);
  _dom('lab-attack').value=pick(['bite','venom','acid_spit','fire_breath','crush']);
  _dom('lab-repro-type').value=arch==='plant'?pick(['flowering','spore']):arch==='fungi'?'spore':pick(['budding','egg_layer','spore','cloning']);
  _dom('lab-aggression').value=arch==='creature'?Math.floor(Math.random()*100):0;
  _dom('lab-repro').value=20+Math.floor(Math.random()*60);
  _dom('lab-fear').value=Math.floor(Math.random()*70);
  ['aggression','repro','fear','light','spread'].forEach(id=>{const el=_dom('lab-'+id+'-val')||_dom('lab-'+id+'read-val');const src=_dom('lab-'+id);if(el&&src)el.textContent=src.value+'%';});
  _dom('lab-aggression-val').textContent=_dom('lab-aggression').value+'%';
  _dom('lab-repro-val').textContent=_dom('lab-repro').value+'%';
  _dom('lab-fear-val').textContent=_dom('lab-fear').value+'%';
  labIcon=pick(CREATURE_ICONS);
  _dom('lab-icon-display').textContent=labIcon;
  updateLabColorPreview();
  labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
  if(arch==='creature'){
    const kingdoms=KINGDOM_TARGETS.map(k=>k.id);
    for(let i=0;i<1+Math.floor(Math.random()*3);i++) labPreySet.add(pick(kingdoms));
  }
  const specs=SPECIAL_OPTIONS.map(s=>s.id);
  for(let i=0;i<1+Math.floor(Math.random()*2);i++) labSpecialSet.add(pick(specs));
  if(Math.random()<0.5) labToleranceSet.add(pick(TOLERANCE_OPTIONS.map(t=>t.id)));
  // Random element behaviors
  for(const def of ELEM_BEHAVIOR_DEFS) labElemBehaviors[def.id]=def.opts[Math.floor(Math.random()*def.opts.length)];
  buildKingdomToggleListWithCustom('lab-prey-list',labPreySet,'active-prey');
  buildKingdomToggleListWithCustom('lab-ally-list',labAllySet,'active-ally');
  buildKingdomToggleListWithCustom('lab-hunted-list',labHuntedBySet,'active-prey');
  buildKingdomToggleListWithCustom('lab-harmful-list',labHarmfulSet,'active-prey');
  buildToggleList('lab-specials-list',SPECIAL_OPTIONS.map(s=>({id:s.id,label:s.name,icon:s.icon})),labSpecialSet,'active-special');
  buildToggleList('lab-tolerances',TOLERANCE_OPTIONS.map(t=>({id:t.id,label:t.label,icon:t.icon})),labToleranceSet,'active-tol');
  buildElemBehaviorTable();
}

function loadCreatureIntoForm(id){
  const c=customCreatures.get(id);
  if(!c) return;
  editingCreatureId=id;

  // Identity
  labIcon=c.icon;
  _dom('lab-icon-display').textContent=c.icon;
  _dom('lab-icon-display').style.background=`hsl(${c.hue},60%,25%)`;
  _dom('lab-name').value=c.name||'';
  _dom('lab-hue').value=c.hue;
  updateLabColorPreview();

  // Archetype
  const arch=c.archetype||'creature';
  _dom('lab-archetype').value=arch;
  onArchetypeChange();

  // Physical
  _dom('lab-size').value=c.size?.id||'medium';
  _dom('lab-movement').value=c.movement?.id||'walker';

  // Behavior
  const aggrPct=Math.round((c.aggression||0.5)*100);
  const reproPct=Math.round(((c.reproduction?.rate||0.01)-0.004)/0.02*100);
  const fearPct=Math.round((c.fear||0.3)*100);
  _dom('lab-aggression').value=aggrPct;
  _dom('lab-aggression-val').textContent=aggrPct+'%';
  _dom('lab-repro').value=Math.max(0,Math.min(100,reproPct));
  _dom('lab-repro-val').textContent=Math.max(0,Math.min(100,reproPct))+'%';
  _dom('lab-fear').value=fearPct;
  _dom('lab-fear-val').textContent=fearPct+'%';
  _dom('lab-repro-type').value=c.reproduction?.id||'budding';
  _dom('lab-diet').value=c.diet?.id||'omnivore';
  _dom('lab-attack').value=c.attackId||'bite';

  // Plant/fungi opts
  if(arch==='plant'||arch==='fungi'){
    const lightPct=Math.round((c.lightReq||0.3)*100);
    const spreadPct=Math.round((c.spreadSpeed||0.4)*100);
    _dom('lab-light-req').value=lightPct;
    _dom('lab-light-val').textContent=lightPct+'%';
    _dom('lab-spread').value=spreadPct;
    _dom('lab-spread-val').textContent=spreadPct+'%';
    _dom('lab-flower-emit').value=c.flowerEmit||'none';
  }

  // Rebuild toggle sets from creature data
  labPreySet.clear(); labAllySet.clear(); labHuntedBySet.clear();
  labHarmfulSet.clear(); labSpecialSet.clear(); labToleranceSet.clear();
  labElemBehaviors={};

  // Prey — kingdoms
  (c.preyTypes||[]).forEach(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);if(kt)labPreySet.add(kt.id);});
  // Prey — specific custom creatures
  (c.preyCustomIds||[]).forEach(cid=>labPreySet.add('custom_'+cid));
  if(c.includesCustomPrey) labPreySet.add('custom');
  // Allies
  (c.allyTypes||[]).forEach(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);if(kt)labAllySet.add(kt.id);});
  (c.allyCustomIds||[]).forEach(cid=>labAllySet.add('custom_'+cid));
  // Hunted by
  (c.huntedByTypes||[]).forEach(h=>{
    if(h.customId!=null){labHuntedBySet.add('custom_'+h.customId);}
    else{const kt=KINGDOM_TARGETS.find(k=>k.type===h.type);if(kt)labHuntedBySet.add(kt.id);}
  });
  // Harmful to
  (c.harmfulTypes||[]).forEach(t=>{const kt=KINGDOM_TARGETS.find(k=>k.type===t);if(kt)labHarmfulSet.add(kt.id);});
  (c.harmfulCustomIds||[]).forEach(cid=>labHarmfulSet.add('custom_'+cid));
  // Specials
  (c.specials||[]).forEach(s=>labSpecialSet.add(s.id));
  // Tolerances
  (c.tolerances||[]).forEach(t=>labToleranceSet.add(t));
  // Element behaviors
  Object.assign(labElemBehaviors, c.elemBehaviors||{});

  // Rebuild all toggle UIs
  buildKingdomToggleListWithCustom('lab-prey-list', labPreySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-ally-list', labAllySet, 'active-ally');
  buildKingdomToggleListWithCustom('lab-hunted-list', labHuntedBySet, 'active-prey');
  buildKingdomToggleListWithCustom('lab-harmful-list', labHarmfulSet, 'active-prey');
  buildToggleList('lab-specials-list', SPECIAL_OPTIONS.map(s=>({id:s.id,label:s.name,icon:s.icon})), labSpecialSet, 'active-special');
  buildToggleList('lab-tolerances', TOLERANCE_OPTIONS.map(t=>({id:t.id,label:t.label,icon:t.icon})), labToleranceSet, 'active-tol');
  buildElemBehaviorTable();

  // Update save button label and show editing banner
  updateEditingBanner();
}

function updateEditingBanner(){
  const existing=_dom('lab-editing-banner');
  if(existing) existing.remove();
  if(!editingCreatureId) return;
  const c=customCreatures.get(editingCreatureId);
  if(!c) return;
  const banner=document.createElement('div');
  banner.id='lab-editing-banner';
  banner.className='lab-editing-banner';
  banner.innerHTML=`<span>✏️ EDITING: ${c.icon} ${c.name}</span><button onclick="cancelEdit()" style="background:transparent;border:1px solid var(--border);color:var(--dim);font-family:var(--mono);font-size:7px;padding:1px 6px;cursor:pointer;">CANCEL</button>`;
  // Insert before save button
  const btnRow=_domQ('.lab-btn-row');
  if(btnRow) btnRow.parentNode.insertBefore(banner,btnRow);
  _domQ('.lab-btn-row button.primary').textContent='✓ SAVE CHANGES';
}

function cancelEdit(){
  editingCreatureId=null;
  const banner=_dom('lab-editing-banner');
  if(banner) banner.remove();
  const saveBtn=_domQ('.lab-btn-row button.primary');
  if(saveBtn) saveBtn.textContent='✓ SAVE CREATURE';
  // Reset form
  labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
  labElemBehaviors={};labIcon=CREATURE_ICONS[0];
  _dom('lab-name').value='';
  _dom('lab-icon-display').textContent='?';
  updateLabColorPreview();
  initLabBuilder();
}

function editCreature(id){
  hideCreatureCard();
  // Open lab if not already open
  _dom('lab-popup').classList.add('open');
  // Small delay so DOM is ready (and any React re-render has flushed)
  setTimeout(()=>{
    buildLabPanel();
    initLabBuilder();
    loadCreatureIntoForm(id);
    updateLabHistory();
  },10);
}

function saveCreature(){
  if(editingCreatureId){
    const c=readLabForm();
    c.name=_dom('lab-name').value.trim()||customCreatures.get(editingCreatureId)?.name||'Creature';
    c.id=editingCreatureId;
    c.interactions=generateInteractions(c);
    customCreatures.set(editingCreatureId,c);
    for(let i=0;i<W*H;i++){const p=grid[i];if(p?.customType===editingCreatureId)p.hp=Math.min(p.hp,p.isQueen?c.size.hp*2:c.size.hp);}
    updateCustomList();updateLabHistory();closeLab();
    showEventToast('CREATURE UPDATED',`${c.icon} ${c.name} updated`);
    editingCreatureId=null;
    labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
    labElemBehaviors={};
    return;
  }
  if(customCreatures.size>=5){showEventToast('LAB FULL','Delete a creature to make room (max 5)');return;}
  const c=readLabForm();
  c.name=_dom('lab-name').value.trim()||`Creature ${nextCustomId-T.CUSTOM_BASE+1}`;
  c.id=nextCustomId++;
  c.interactions=generateInteractions(c);
  customCreatures.set(c.id,c);
  POP[c.id]=0;POP[c.id+100]=0;POP_MAX[c.id]=800;POP_MAX[c.id+100]=10;POP_HISTORY[c.id]=[];
  selectedCustom=c.id;selectedIsQueen=false;
  currentEl='custom_'+c.id;currentTool='draw';
  updateCustomList();updateLabHistory();closeLab();
  showEventToast('CREATURE CREATED',`${c.icon} ${c.name} ready to place`);
  labIcon=CREATURE_ICONS[0];
  labPreySet.clear();labAllySet.clear();labHuntedBySet.clear();labHarmfulSet.clear();labSpecialSet.clear();labToleranceSet.clear();
  labElemBehaviors={};
}

function updateLabHistory(){
  const el=_dom('lab-history');
  const count=customCreatures.size;
  const full=count>=5;
  // Show slot counter
  const slots=`<div style="font-size:7px;color:${full?'var(--accent2)':'var(--dim)'};margin-bottom:8px;letter-spacing:1px;">SLOTS: ${count}/5${full?' — DELETE ONE TO CREATE MORE':''}</div>`;
  if(count===0){el.innerHTML=slots+'<div class="history-empty">No creatures yet.</div>';return;}
  el.innerHTML=slots+[...customCreatures.values()].map(c=>`
    <div class="history-item ${historySelectedId===c.id?'active':''}"
      onclick="selectLabHistoryCreature(${c.id})"
      onmouseenter="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmousemove="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmouseleave="hideCreatureCard()"
      style="border-left:3px solid hsl(${c.hue},${c.sat}%,${c.lit}%);cursor:pointer;">
      <button class="hi-delete" onclick="event.stopPropagation();deleteCreature(${c.id})" title="Delete">✕</button>
      <button class="hi-edit" onclick="event.stopPropagation();editCreature(${c.id})" title="Edit">✏️</button>
      <div class="hi-header">
        <span class="hi-icon">${c.icon}</span>
        <span class="hi-name" style="color:hsl(${c.hue},${c.sat}%,65%)">${c.name}</span>
        <span class="hi-pop">${(POP[c.id]||0)+(POP[c.id+100]||0)}</span>
      </div>
      <div style="font-size:6px;color:var(--dim);margin-top:2px;">${c.movement?.icon||''} ${c.movement?.name||''} · ${c.diet?.icon||''} ${c.diet?.name||''}</div>
    </div>
  `).join('')+(historySelectedId?`<div class="history-actions"><button onclick="spawnFromHistory(false)">🐜 WORKER</button><button class="queen" onclick="spawnFromHistory(true)">👑 QUEEN</button></div>`:'')+`<button onclick="editingCreatureId=null;openLab()" style="display:block;width:100%;margin-top:8px;background:transparent;border:1px dashed var(--border);color:var(--dim);font-family:var(--mono);font-size:7px;padding:5px;cursor:pointer;letter-spacing:1px;" ${customCreatures.size>=5?'disabled title="Lab full"':''}>+ NEW CREATURE</button>`;
}

function selectLabHistoryCreature(id){ historySelectedId=id; updateLabHistory(); }

function spawnFromHistory(isQueen){
  if(!historySelectedId)return;
  selectedCustom=historySelectedId; selectedIsQueen=isQueen;
  currentEl=(isQueen?'customqueen_':'custom_')+historySelectedId;
  currentTool='draw'; closeLab();
  _domAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
  _dom('btn-draw').classList.add('active');
  updateCustomList();
}

function deleteCreature(id){
  customCreatures.delete(id); delete POP[id]; delete POP[id+100]; delete POP_MAX[id]; delete POP_HISTORY[id];
  if(selectedCustom===id)selectedCustom=null;
  if(historySelectedId===id)historySelectedId=null;
  for(let i=0;i<W*H;i++) if(grid[i]?.customType===id) grid[i]=null;
  updateCustomList(); updateLabHistory();
}

function updateCustomList(){
  const list=_dom('custom-list');
  if(customCreatures.size===0){list.innerHTML='<div style="font-size:7px;color:var(--dim);padding:6px;text-align:center;">No custom creatures. Open lab to create.</div>';return;}
  list.innerHTML=[...customCreatures.values()].map(c=>{
    const isActive=selectedCustom===c.id;
    const col=`hsl(${c.hue},${c.sat}%,65%)`;
    const movLabel=c.movement?.icon&&c.movement?.name?`${c.movement.icon} ${c.movement.name}`:'';
    const dietLabel=c.diet?.icon&&c.diet?.name?`${c.diet.icon} ${c.diet.name}`:'';
    return `<div class="custom-entry ${isActive?'active':''}"
      style="border-left:3px solid hsl(${c.hue},${c.sat}%,${c.lit}%);position:relative;"
      onmouseenter="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmousemove="showCreatureCard(${c.id},event.clientX,event.clientY)"
      onmouseleave="hideCreatureCard()">
      <button onclick="event.stopPropagation();editCreature(${c.id})" title="Edit creature" style="position:absolute;top:3px;right:3px;background:none;border:none;color:var(--dim);font-size:9px;cursor:pointer;opacity:0;padding:0;" onmouseenter="this.style.opacity=1;this.style.color='var(--accent3)'" onmouseleave="this.style.opacity=0">✏️</button>
      <div class="ce-name"><span class="ce-icon">${c.icon}</span> <span style="color:${col}">${c.name}</span></div>
      <div style="font-size:6px;color:var(--dim);margin-top:1px;">${movLabel}${movLabel&&dietLabel?' · ':''}${dietLabel}</div>
      <div style="display:flex;gap:4px;margin-top:3px;">
        <button onclick="selectCustomCreature(${c.id},false)" style="flex:1;background:${!selectedIsQueen&&isActive?'rgba(0,255,136,0.1)':'transparent'};border:1px solid ${!selectedIsQueen&&isActive?'var(--accent)':'var(--border)'};color:var(--dim);font-family:var(--mono);font-size:6px;padding:2px;cursor:pointer;">🐜${POP[c.id]||0}</button>
        <button onclick="selectCustomCreature(${c.id},true)" style="flex:1;background:${selectedIsQueen&&isActive?'rgba(255,170,0,0.1)':'transparent'};border:1px solid ${selectedIsQueen&&isActive?'var(--accent4)':'var(--border)'};color:var(--dim);font-family:var(--mono);font-size:6px;padding:2px;cursor:pointer;">👑${POP[c.id+100]||0}</button>
      </div>
    </div>`;
  }).join('');
}

function selectCustomCreature(id,isQueen){
  selectedCustom=id; selectedIsQueen=isQueen;
  currentEl=(isQueen?'customqueen_':'custom_')+id;
  currentTool='draw';
  _domAll('.tbtn[data-tool]').forEach(b=>b.classList.remove('active'));
  _dom('btn-draw').classList.add('active');
  updateCustomList();
}

// ---- Custom creature placement factory ----
function spawnCustomCell(typeId,x,y,isQueen){
  const def=customCreatures.get(typeId); if(!def)return null;
  const g=mutateGenome(def.genome,mutRate);
  return{t:T.CUSTOM_BASE,customType:typeId,isQueen,g,age:0,
    hp:isQueen?def.size.hp*2:def.size.hp,
    energy:isQueen?255:def.size.energy};
}

// ---- Custom creature step ----
function stepCustom(x,y,p){
  const def=customCreatures.get(p.customType);
  if(!def){grid[idx(x,y)]=null;return;}
  p.age++;
  processBuff(p);
  if(p.buff?.type==='chromadust'&&Math.random()<0.3){const jx=x+Math.floor((Math.random()-0.5)*6),jy=y+Math.floor((Math.random()-0.5)*6);if(inB(jx,jy)&&!get(jx,jy)){swap(x,y,jx,jy);return;}}
  const arch=def.archetype||'creature';
  const eb=def.elemBehaviors||{};

  // ── PLANT / FUNGI archetype ──
  if(arch==='plant'||arch==='fungi'){
    const lv=lightGrid[idx(x,y)];
    const lightReq=def.lightReq??0.3;
    const spreadSpeed=def.spreadSpeed??0.4;
    if(arch==='fungi'){
      if(lv>lightReq+0.3){p.hp-=lv*4;if(p.hp<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}}
      p.energy=Math.min(255,p.energy+0.3);
    } else {
      // Plants gain energy from any light, just less when light is low
      const lightGain=Math.max(0,lv)*2.5;
      if(lightGain>0) p.energy=Math.min(255,p.energy+lightGain);
      else p.energy=Math.max(10,p.energy-0.02); // very slow drain in total dark, but floor at 10 so they don't die
    }
    const nbrs=getNeighbors(x,y);
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);if(!np)continue;
      const wb=eb.water||'ignore';
      if(np.t===T.WATER){if(wb==='drink'){p.energy=Math.min(255,p.energy+3);if(Math.random()<0.1)grid[idx(nx,ny)]=null;}else if(wb==='die'){p.hp-=10;}}
      if((np.t===T.FIRE||np.t===T.LAVA)){const fb=eb.fire||'die';if(fb==='die'||fb==='flee'){p.hp-=20;}else if(fb==='feed on'){p.energy=Math.min(255,p.energy+10);}}
      if(np.t===T.ACID){const ab=eb.acid||'die';if(ab==='die'){p.hp-=25;}else if(ab==='resist'){p.hp-=3;}}
      if(np.t===T.SALT){const sb=eb.salt||'ignore';if(sb==='die'){p.hp-=20;}else if(sb==='mine'){p.energy=Math.min(255,p.energy+5);grid[idx(nx,ny)]=null;}}
      if(np.t===T.DETRITUS&&(eb.detritus==='eat'||arch==='fungi')){p.energy=Math.min(255,p.energy+5);if(Math.random()<0.05)grid[idx(nx,ny)]=null;}
      if(np.t===T.WOOD&&eb.wood==='eat'&&Math.random()<0.008){p.energy=Math.min(255,p.energy+12);grid[idx(nx,ny)]={t:T.DETRITUS,age:0};}

      // CONTACT DAMAGE
      if(np.g&&Math.random()<0.08){
        const harmfulTypes=def.harmfulTypes||[];
        const harmfulCustomIds=def.harmfulCustomIds||[];
        const isHarmTarget=harmfulTypes.includes(np.t)||(harmfulCustomIds.includes(np.customType));
        if(isHarmTarget){
          const contactDmg=Math.floor(4+p.energy/60);
          np.hp-=contactDmg;
          p.energy=Math.min(255,p.energy+2);
          if(np.hp<=0){
            if(POP[np.t]!==undefined)POP[np.t]=Math.max(0,(POP[np.t]||0)-1);
            if(np.customType!==undefined&&POP[np.customType]!==undefined)POP[np.customType]=Math.max(0,(POP[np.customType]||0)-1);
            grid[idx(nx,ny)]=null;
          }
        }
      }
    }
    if(p.hp<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}

    // SPREAD — natural cap is available space, not a counter
    // (POP tracking for custom creatures is unreliable when external kills happen)
    const spreadChance=spreadSpeed*0.015*(p.energy/200);
    if(Math.random()<spreadChance){
      // Valid spread targets: empty cells, or detritus/ash (replaced)
      // Plants should NOT spread back onto their own type (avoid cycling)
      const targets=nbrs.filter(([nx,ny])=>{
        const np=get(nx,ny);
        if(!np){
          // For fungi: only spread to dark cells
          if(arch==='fungi') return lightGrid[idx(nx,ny)]<lightReq+0.2;
          return true; // plant: any empty cell
        }
        // Can overgrow detritus and ash
        return np.t===T.DETRITUS||np.t===T.ASH;
      });
      if(targets.length){
        const[nx,ny]=targets[Math.floor(Math.random()*targets.length)];
        const existing=get(nx,ny);
        if(existing?.t===T.DETRITUS||existing?.t===T.ASH) grid[idx(nx,ny)]=null;
        if(!get(nx,ny)){ // double-check still empty after clear
          grid[idx(nx,ny)]=spawnCustomCell(p.customType,nx,ny,false);
          POP[p.customType]=(POP[p.customType]||0)+1;
        }
      }
    }
    const repType=def.reproduction?.id||'budding';
    if((repType==='flowering'||repType==='spore')&&p.energy>160&&Math.random()<0.005){
      const emit=def.flowerEmit||'none';const ux=x-gv.x,uy=y-gv.y;
      if(inB(ux,uy)&&!get(ux,uy)){
        if(emit==='spore')grid[idx(ux,uy)]={t:T.SPORE,age:0,g:p.g,sid:p.sid||0,energy:50};
        else if(emit==='seed')grid[idx(ux,uy)]={t:T.SEED,age:0,g:p.g,sid:p.sid||0,energy:60};
        else if(emit==='water')grid[idx(ux,uy)]=abiotic(T.WATER);
        else if(emit==='detritus')grid[idx(ux,uy)]=abiotic(T.DETRITUS);
        else if(emit==='fire')grid[idx(ux,uy)]={t:T.BLOOM_FIRE,age:0,ttl:40+Math.floor(Math.random()*40)};
        else if(emit==='acid')grid[idx(ux,uy)]={t:T.ACID,age:0,ttl:60};
        else if(emit==='smoke')grid[idx(ux,uy)]={t:T.SMOKE,age:0,ttl:40};
        p.energy-=15;
      }
    }
    p.energy=Math.min(255,p.energy);
    return;
  }

  // ── CREATURE archetype ──
  p.energy-=p.isQueen?0.02:(0.06+def.size.speed*(p.g[1]/128)*0.05);
  if(def.specials.some(s=>s.id==='regenerating')) p.hp=Math.min(p.isQueen?def.size.hp*2:def.size.hp,p.hp+0.15);
  if(p.hp<=0||p.energy<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}
  const nbrs=getNeighbors(x,y);
  const aggression=def.aggression||0.5;const fear=def.fear||0.3;
  const preyTypes=def.preyTypes||[];const allyTypes=def.allyTypes||[];
  const huntedByTypes=def.huntedByTypes||[];

  // ── GRAVITY: walker and crawler must be on a surface ──
  const movId=def.movement?.id||'walker';
  const needsSurface=movId==='walker'||movId==='crawler';
  if(needsSurface){
    const belowX=x+gv.x, belowY=y+gv.y;
    const below=inB(belowX,belowY)?grid[idx(belowX,belowY)]:null;
    const onSurface=getNeighbors(x,y).some(([nx,ny])=>{
      const np=get(nx,ny);
      return np&&(isSolid(np.t)||np.t===T.CLAY_HARD||np.t===T.CLAY||np.t===T.STONE);
    });
    if(!onSurface){
      // Fall in gravity direction
      if(inB(belowX,belowY)&&!below){
        swap(x,y,belowX,belowY);
      } else if(inB(belowX,belowY)&&below&&getDens(below)<3){
        swap(x,y,belowX,belowY);
      }
      return; // don't do other movement this tick while falling
    }
  }

  if(p.isQueen){
    p.energy=Math.min(255,p.energy+lightGrid[idx(x,y)]*2+0.4);
    const spawnRate=25+Math.floor((1-def.genome[5]/255)*50);
    if(p.age%spawnRate===0&&(POP[p.customType]||0)<(POP_MAX[p.customType]||200)){
      const empty=nbrs.filter(([nx,ny])=>!get(nx,ny));
      if(empty.length){const[nx,ny]=empty[Math.floor(Math.random()*empty.length)];grid[idx(nx,ny)]=spawnCustomCell(p.customType,nx,ny,false);POP[p.customType]=(POP[p.customType]||0)+1;}
    }
    return;
  }

  // Element behaviors
  for(const[nx,ny] of nbrs){
    const np=get(nx,ny);if(!np)continue;
    const applyEB=(key,type,dmg,gain)=>{
      if(np.t!==type)return;
      const b=eb[key]||'ignore';
      if(b==='die'||b==='freeze'){p.hp-=b==='freeze'?2:dmg||15;}
      else if(b==='flee'){}
      else if(b==='resist'){p.hp-=Math.floor((dmg||15)*0.15);}
      else if(b==='feed on'||b==='absorb'||b==='drink'||b==='swim in'){p.energy=Math.min(255,p.energy+(gain||6));}
      else if(b==='mine'||b==='eat'){p.energy=Math.min(255,p.energy+(gain||8));grid[idx(nx,ny)]=null;}
      else if(b==='choke'||b==='scald'||b==='coated'||b==='slow'){p.energy=Math.max(0,p.energy-2);}
      else if(b==='explode on'){p.hp-=40;grid[idx(nx,ny)]={t:T.FIRE,age:0,ttl:30};}
    };
    applyEB('fire',T.FIRE,20);applyEB('lava',T.LAVA,25);applyEB('water',T.WATER,0,5);
    applyEB('ice',T.ICE,2,4);applyEB('acid',T.ACID,22);applyEB('salt',T.SALT,5,6);
    applyEB('smoke',T.SMOKE,0,0);applyEB('steam',T.STEAM,3,0);
    applyEB('detritus',T.DETRITUS,0,8);applyEB('wood',T.WOOD,0,12);
    applyEB('oil',T.OIL,0,0);applyEB('gunpowder',T.GUNPOWDER,0,0);
  }
  if(p.hp<=0){grid[idx(x,y)]=null;POP[p.customType]=Math.max(0,(POP[p.customType]||0)-1);return;}

  // Passive diet
  if(def.diet.id==='photosynthetic') p.energy=Math.min(255,p.energy+lightGrid[idx(x,y)]*3);
  else if(def.diet.id==='pyrotroph'){p.energy=Math.min(255,p.energy+lightGrid[idx(x,y)]*1.5);for(const[nx,ny]of nbrs){const np=get(nx,ny);if((np?.t===T.FIRE||np?.t===T.LAVA)&&Math.random()<0.3){p.energy=Math.min(255,p.energy+15);break;}}}
  else if(def.diet.id==='cryotroph'){for(const[nx,ny]of nbrs){const np=get(nx,ny);if((np?.t===T.ICE||np?.t===T.WATER)&&Math.random()<0.2){p.energy=Math.min(255,p.energy+8);break;}}}
  else{for(const[nx,ny]of nbrs){const np=get(nx,ny);if(!np)continue;if(def.diet.targets&&def.diet.targets.includes(np.t)&&Math.random()<0.2){p.energy=Math.min(255,p.energy+20);if(np.g)POP[np.t]=Math.max(0,(POP[np.t]||0)-1);grid[idx(nx,ny)]=null;break;}}}

  // Hunt prey
  let hunted=false;
  const preyCustomIds=def.preyCustomIds||[];
  const allyCustomIds=def.allyCustomIds||[];

  // Helper: is this particle a prey target?
  const isPrey=(tp)=>{
    if(!tp?.g) return false;
    // Specific custom creature targeted by ID
    if(preyCustomIds.includes(tp.customType)) return true;
    // Blanket "all other custom" flag
    if(def.includesCustomPrey && tp.customType!==undefined && tp.customType!==p.customType) return true;
    // Kingdom types
    if(preyTypes.includes(tp.t)) return true;
    return false;
  };

  // Helper: is this particle an ally?
  const isAlly=(tp)=>{
    if(!tp?.g) return false;
    if(tp.customType===p.customType) return true; // same creature type = always ally
    if(allyCustomIds.includes(tp.customType)) return true;
    if(allyTypes.includes(tp.t)) return true;
    return false;
  };

  if(aggression>0.05){
    const hr=2+Math.floor(aggression*8);
    let bt=null,bd=999;
    for(let dy=-hr;dy<=hr;dy++)for(let dx=-hr;dx<=hr;dx++){
      const tx=x+dx,ty=y+dy;
      const tp=get(tx,ty);
      if(!tp||!tp.g)continue;
      if(!isPrey(tp))continue;
      if(isAlly(tp))continue;
      const d=Math.abs(dx)+Math.abs(dy);
      if(d<bd){bd=d;bt={tx,ty,tp};}
    }
    if(bt){
      const{tx,ty,tp}=bt;
      if(bd<=1){
        // Adjacent — attack directly
        const dmg=attackDamage(def,aggression);
        tp.hp-=dmg;
        p.energy=Math.min(255,p.energy+15);
        applyAttackEffect(def,tx,ty,tp);
        if(tp.hp<=0){
          if(POP[tp.t]!==undefined)POP[tp.t]=Math.max(0,(POP[tp.t]||0)-1);
          if(tp.customType!==undefined&&POP[tp.customType]!==undefined)POP[tp.customType]=Math.max(0,(POP[tp.customType]||0)-1);
          grid[idx(tx,ty)]=null;
          p.energy=Math.min(255,p.energy+30);
        }
        hunted=true;
      } else if(Math.random()<aggression){
        // Chase — move toward prey; can step into empty or push past non-ally non-prey
        const ddx=Math.sign(tx-x),ddy=Math.sign(ty-y);
        // Try direct step first, then diagonal alternatives
        const candidates=[[x+ddx,y+ddy],[x+ddx,y],[x,y+ddy]];
        for(const[nx2,ny2] of candidates){
          if(!inB(nx2,ny2))continue;
          const nc=get(nx2,ny2);
          // Can enter: empty, web, or non-ally non-prey abiotic
          if(!nc||nc.t===T.WEB||(!nc.g&&nc.t!==T.WALL&&nc.t!==T.CLAY_HARD)){
            swap(x,y,nx2,ny2);hunted=true;break;
          }
        }
      }
    }
  }

  // Flee from huntedBy predators (or general threats when low hp)
  if(!hunted&&fear>0&&p.hp<(def.size.hp*0.6)&&Math.random()<fear){
    let td={x:0,y:0};
    for(const[nx,ny] of nbrs){
      const np=get(nx,ny);if(!np?.g)continue;
      const isHunter=huntedByTypes.some(h=>(h.type!==undefined&&h.type===np.t)||(h.customId!==undefined&&np.customType===h.customId));
      const isThreat=isHunter||(isPrey(p)&&np.g&&!isAlly(np)); // also flee from anything that would hunt us
      if(isThreat){td.x-=Math.sign(nx-x);td.y-=Math.sign(ny-y);}
    }
    if(td.x||td.y){
      const fx=x+Math.sign(td.x),fy=y+Math.sign(td.y);
      if(inB(fx,fy)&&!get(fx,fy)){swap(x,y,fx,fy);hunted=true;}
    }
  }

  // Specials
  for(const sp of def.specials){
    if(sp.id==='pyro'&&Math.random()<0.005){const f=nbrs.filter(([nx,ny])=>{const t=get(nx,ny)?.t;return t===T.WOOD||t===T.PLANT||t===T.OIL;});if(f.length){const[fx,fy]=f[0];grid[idx(fx,fy)]={t:T.FIRE,age:0,ttl:40};}}
    if(sp.id==='crystalline'&&Math.random()<0.002){const c2=nbrs.filter(([nx,ny])=>{const t=get(nx,ny)?.t;return t===T.SAND||t===T.DETRITUS;});if(c2.length){const[cx2,cy2]=c2[0];grid[idx(cx2,cy2)]={t:T.STONE,age:0,settled:5};}}
    if(sp.id==='smokescreen'&&p.hp<def.size.hp*0.4&&Math.random()<0.08){const em=nbrs.filter(([nx,ny])=>!get(nx,ny));if(em.length){const[sx2,sy2]=em[0];grid[idx(sx2,sy2)]={t:T.SMOKE,age:0,ttl:50};}}
  }

  // Movement
  if(!hunted){
    const sp=def.size.speed*(p.g[1]/128);
    const onIce=nearType(x,y,T.ICE)&&eb.ice==='skate on';
    const steps=onIce?3:1;
    for(let s=0;s<steps;s++){
      if(Math.random()>0.4*sp)break;
      const allNbrs=getNeighbors(x,y);
      const dirs=allNbrs.map(([nx2,ny2])=>{
        const np2=get(nx2,ny2);
        // Walker/crawler: only move to cells that are adjacent to a solid (surface-hugging)
        if(needsSurface){
          if(!np2){
            const hasSurface=getNeighbors(nx2,ny2).some(([ax,ay])=>{
              if(ax===x&&ay===y)return false;
              const ap=get(ax,ay);
              return ap&&(isSolid(ap.t)||ap.t===T.CLAY_HARD||ap.t===T.STONE);
            });
            if(!hasSurface)return null; // don't step into mid-air
            return[nx2,ny2,1];
          }
          // Can enter water if swimmer behavior set
          if(np2.t===T.WATER&&eb.water==='swim in')return[nx2,ny2,2];
          return null;
        }
        // Non-surface movers: original logic
        if(!np2)return[nx2,ny2,1];
        if(np2.t===T.CLAY_HARD&&(movId==='burrower'||eb.clay==='tunnels'||eb.clay==='dig'))return[nx2,ny2,2];
        if(np2.t===T.WATER&&(movId==='swimmer'||eb.water==='swim in'))return[nx2,ny2,2];
        if(np2.t===T.WEB&&movId==='climber')return[nx2,ny2,1];
        if(np2.t===T.SAND&&eb.sand==='burrow')return[nx2,ny2,2];
        return null;
      }).filter(Boolean);
      if(dirs.length){const[mx,my]=dirs[Math.floor(Math.random()*dirs.length)];swap(x,y,mx,my);[x,y]=[mx,my];}
    }
  }

  if((def.movement?.id==='burrower'||eb.clay==='dig')&&Math.random()<0.05){
    const cn=nbrs.filter(([nx2,ny2])=>get(nx2,ny2)?.t===T.CLAY_HARD&&!get(nx2,ny2)?.reinforced);
    if(cn.length){const[cx2,cy2]=cn[Math.floor(Math.random()*cn.length)];grid[idx(cx2,cy2)]=null;}
  }

  if(p.energy>180&&(POP[p.customType]||0)<(POP_MAX[p.customType]||200)&&Math.random()<def.reproduction.rate*(def.genome[5]/128)){
    const empty=nbrs.filter(([nx,ny])=>!get(nx,ny));
    if(empty.length){const[nx,ny]=empty[Math.floor(Math.random()*empty.length)];grid[idx(nx,ny)]=spawnCustomCell(p.customType,nx,ny,false);POP[p.customType]=(POP[p.customType]||0)+1;p.energy-=80;}
  }
}

// Attack damage by attack type
function attackDamage(def,aggression){
  const base={bite:12,venom:8,acid_spit:18,fire_breath:20,crush:15}[def.attackId||'bite']||12;
  return Math.floor(base*(0.5+aggression));
}

// Apply special attack effects
function applyAttackEffect(def,tx,ty,tp){
  switch(def.attackId){
    case 'venom': tp.energy=Math.max(0,(tp.energy||0)-15); break;
    case 'acid_spit': {const a={t:T.ACID,age:0,ttl:20};const ax2=tx+gv.x,ay2=ty+gv.y;if(inB(ax2,ay2)&&!get(ax2,ay2))grid[idx(ax2,ay2)]=a;break;}
    case 'fire_breath': {if(Math.random()<0.3){const fx2=tx-gv.x,fy2=ty-gv.y;if(inB(fx2,fy2)&&!get(fx2,fy2))grid[idx(fx2,fy2)]={t:T.FIRE,age:0,ttl:15};}break;}
    case 'crush': tp.energy=Math.max(0,(tp.energy||0)-8); tp.hp-=5; break;
  }
}

// ---- Observe mode ----
function enterObserveMode(){
  observeMode=true; savedSpeedMult=speedMult; speedMult=0;
  _dom('sp').value=0;
  _dom('spv').textContent='PAUSED';
  _dom('pause-badge').style.display='none';
  _dom('observe-badge').style.display='block';
  _dom('canvas-wrap').classList.add('observe-mode');
  _dom('btn-observe').classList.add('observe-active');
}

function exitObserveMode(){
  if(!observeMode)return;
  observeMode=false; speedMult=savedSpeedMult;
  const v=Math.round(speedMult/0.2);
  _dom('sp').value=v;
  _dom('spv').textContent=speedMult===0?'PAUSED':speedMult.toFixed(1)+'x';
  _dom('observe-badge').style.display='none';
  _dom('canvas-wrap').classList.remove('observe-mode');
  _dom('btn-observe').classList.remove('observe-active');
  _dom('observe-tooltip').classList.remove('visible');
}

function showObserveTooltip(mx,my,p,gx,gy){
  const tip=_dom('observe-tooltip');
  let html='';

  if(!p){
    html=`<div class="ot-empty">Empty (${gx},${gy})<br>Light: ${(lightGrid[idx(gx,gy)]*100).toFixed(0)}%<br>Phero: ${(pheroGrid[idx(gx,gy)]*100).toFixed(0)}%</div>`;

  } else if(p.customType){
    const def=customCreatures.get(p.customType);
    if(def){
      const ix=def.interactions||{};
      const col=`hsl(${def.hue},${def.sat}%,65%)`;
      html=`<div class="ot-header"><span class="ot-icon" style="background:hsl(${def.hue},${def.sat}%,${def.lit}%);border-radius:4px;padding:3px;">${def.icon}</span><div><div class="ot-title" style="color:${col}">${def.name}</div><div class="ot-subtitle">${p.isQueen?'👑 QUEEN':'WORKER'} · ${def.movement.icon} ${def.movement.name.toUpperCase()}</div></div></div>`;

      // Vitals
      html+=`<div class="ot-section">VITALS</div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">HP</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.hp||0)/(p.isQueen?def.size.hp*2:def.size.hp)*100)}%;background:#ff4455"></div></div><span class="ot-bar-val">${Math.round(p.hp||0)}</span></div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">ENERGY</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.energy||0)/255*100)}%;background:#00ff88"></div></div><span class="ot-bar-val">${Math.round(p.energy||0)}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">SIZE</span><span class="otr-val">${def.size.name}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">DIET</span><span class="otr-val">${def.diet.icon} ${def.diet.name}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">REPRO</span><span class="otr-val">${def.reproduction.name}</span></div>`;
      if(def.specials.length) html+=`<div class="ot-row"><span class="otr-name">TRAITS</span><span class="otr-val">${def.specials.map(s=>s.icon+' '+s.name).join(', ')}</span></div>`;

      // Elemental interactions
      html+=`<div class="ot-section">ELEMENT REACTIONS</div>`;
      const elemPairs=[
        ['🔥','fire',ix.fire],['🌋','lava',ix.lava],['💧','water',ix.water],['🧊','ice',ix.ice],
        ['🟢','acid',ix.acid],['🧂','salt',ix.salt],['💨','smoke',ix.smoke],['🌊','steam',ix.steam],
        ['🪨','stone',ix.stone],['🌱','clay',ix.clay],['🏜️','sand',ix.sand],
        ['🪵','wood',ix.wood],['🩶','ash',ix.ash],['💥','gunpowder',ix.gunpowder],
        ['🛢️','oil',ix.oil],
      ];
      const reactionColor=(r)=>r==='flee'||r==='die'||r==='die_fast'||r==='dissolve'||r==='drown'?'#ff4455':r==='feed'||r==='absorb'||r==='eat'||r==='mine'||r==='swim'||r==='drink'||r==='gnaw'?'#00ff88':'#aaaacc';
      html+=`<div style="display:flex;flex-wrap:wrap;gap:2px;">`;
      for(const[ico,name,reaction] of elemPairs){
        if(!reaction)continue;
        const rc=reactionColor(reaction);
        html+=`<div style="font-size:6px;padding:2px 4px;border:1px solid ${rc}33;color:${rc};background:${rc}11;">${ico} ${reaction}</div>`;
      }
      html+=`</div>`;

      // Kingdom interactions
      html+=`<div class="ot-section">KINGDOM RELATIONS</div>`;
      const kingdomPairs=[
        ['🐜','ants',ix.vs_ant],['🕷️','spiders',ix.vs_spider],
        ['🍄','fungi',ix.vs_fungi],['🪲','mites',ix.vs_mite],['🌿','plants',ix.vs_plant],
      ];
      html+=`<div style="display:flex;flex-direction:column;gap:2px;">`;
      for(const[ico,name,rel] of kingdomPairs){
        if(!rel)continue;
        const rc=rel==='hunt'||rel==='eat'?'#ff4455':rel==='flee'||rel==='avoid'?'#ffaa00':rel==='ally'||rel==='symbiotic'?'#00ff88':'#aaaacc';
        html+=`<div class="ot-row"><span class="otr-name">${ico} ${name}</span><span class="otr-val" style="color:${rc}">${rel}</span></div>`;
      }
      html+=`</div>`;

      // Mobility
      html+=`<div class="ot-section">MOBILITY</div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN WATER</span><span class="otr-val">${ix.mob_water_desc||'—'}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN CLAY</span><span class="otr-val">${ix.mob_clay_desc||'—'}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN SAND</span><span class="otr-val">${ix.mob_sand_desc||'—'}</span></div>`;
      html+=`<div class="ot-row"><span class="otr-name">IN OIL</span><span class="otr-val">${ix.mob_oil_desc||'—'}</span></div>`;
    }

  } else {
    const tname=Object.entries(T).find(([k,v2])=>v2===p.t)?.[0]||`T${p.t}`;
    html=`<div class="ot-header"><span class="ot-icon">🔬</span><div><div class="ot-title">${tname}</div><div class="ot-subtitle">(${gx},${gy})</div></div></div>`;
    if(p.g){
      html+=`<div class="ot-section">VITALS</div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">HP</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.hp||0)/100*100)}%;background:#ff4455"></div></div><span class="ot-bar-val">${Math.round(p.hp||0)}</span></div>`;
      html+=`<div class="ot-bar"><span class="ot-bar-label">ENERGY</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${Math.round((p.energy||0)/255*100)}%;background:#00ff88"></div></div><span class="ot-bar-val">${Math.round(p.energy||0)}</span></div>`;
      if(p.sid)html+=`<div class="ot-row"><span class="otr-name">STRAIN</span><span class="otr-val">${p.sid}</span></div>`;
      if(p.alpha)html+=`<div class="ot-row"><span class="otr-name">ROLE</span><span class="otr-val" style="color:#ffdd44">⭐ ALPHA TUNNELER</span></div>`;
      // Genome bars
      const gnames=['DENSITY','MOBILITY','APPETITE','AGGRSSN','RESILNC','REPRO'];
      html+=`<div class="ot-section">GENOME</div>`;
      for(let i=0;i<6;i++){
        const pct=Math.round((p.g[i]/255)*100);
        html+=`<div class="ot-bar"><span class="ot-bar-label">${gnames[i]}</span><div class="ot-bar-track"><div class="ot-bar-fill" style="width:${pct}%;background:#4488ff"></div></div><span class="ot-bar-val">${p.g[i]}</span></div>`;
      }
    }
    html+=`<div class="ot-row"><span class="otr-name">LIGHT</span><span class="otr-val">${(lightGrid[idx(gx,gy)]*100).toFixed(0)}%</span></div>`;
    html+=`<div class="ot-row"><span class="otr-name">PHERO</span><span class="otr-val">${(pheroGrid[idx(gx,gy)]*100).toFixed(0)}%</span></div>`;
  }

  tip.innerHTML=html;
  tip.classList.add('visible');
  let tx=mx+18,ty=my-8;
  if(tx+tip.offsetWidth>window.innerWidth-10)tx=mx-tip.offsetWidth-10;
  if(ty+tip.offsetHeight>window.innerHeight-10)ty=window.innerHeight-tip.offsetHeight-10;
  if(ty<10)ty=10;
  tip.style.left=tx+'px'; tip.style.top=ty+'px';
}

// Wire up lab popup close on backdrop click
_dom('lab-popup').addEventListener('click',e=>{if(e.target===_dom('lab-popup'))closeLab();});

// Expose lab helper functions for inline event handlers in buildLabPanel HTML
window._labFn={
  updateColor:()=>updateLabColorPreview(),
  archChange:()=>onArchetypeChange(),
};
// Also expose cancelEdit globally for the editing banner button
window.cancelEdit=cancelEdit;

buildOrder();

// ─── createEngine export ─────────────────────────────────────────
export function createEngine(canvasEl, stateCallback) {
  // Tear down any previous engine instance before creating a new one.
  // This makes createEngine idempotent under React StrictMode / HMR remounts.
  if(_rafId){cancelAnimationFrame(_rafId);_rafId=null;}
  _running=false;
  if(_canvasAC){_canvasAC.abort();_canvasAC=null;}
  isDown=false; // reset draw state

  canvas = canvasEl;
  ctx    = canvas.getContext('2d');
  wrap   = canvasEl; // canvas-wrap DOM queries are safe stubs

  _stateCallback = stateCallback || null;
  _setupCanvasListeners();

  // Reset imageData so it gets recreated with the new canvas
  imageData = null;
  pixels    = null;

  // Initialize simulation
  buildOrder();
  resetSim();

  function _loop(t) {
    if (!_running || _paused) return;
    const dt = t - lastTime; lastTime = t;
    if (speedMult > 0) {
      stepAccum += dt;
      const stepMs = 50 / speedMult;
      let steps = 0;
      while (stepAccum >= stepMs && steps < Math.ceil(speedMult) * 3) {
        simStep(); stepAccum -= stepMs; steps++;
      }
    } else {
      stepAccum = 0;
    }
    render();
    if (_stateCallback && uiFrame % 8 === 0) {
      let hasMachineCells=false;
      for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.MACHINE){hasMachineCells=true;break;}}
      let hasBacteriaCells=false;
      for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.BACTERIA){hasBacteriaCells=true;break;}}
      const _now=Date.now();
      _stateCallback({
        tick: tickCount,
        era: getEra(),
        narrator: NARRATOR_LINES.length > 0 ? NARRATOR_LINES[0].text : '',
        populations: { ...POP },
        machineGen: machineGeneration,
        machineBest: machineBestGen,
        machineRunning,
        machineCountdown: (!machineRunning&&lastMachinePlacedTime>0)?Math.max(0,Math.ceil((MACHINE_ACTIVATION_DELAY-(_now-lastMachinePlacedTime))/1000)):null,
        hasMachineCells,
        bacteriaGen: bacteriaGeneration,
        bacteriaBest: bacteriaBestGen,
        bacteriaRunning,
        bacteriaCountdown: (!bacteriaRunning&&lastBacteriaPlacedTime>0)?Math.max(0,Math.ceil((BACTERIA_ACTIVATION_DELAY-(_now-lastBacteriaPlacedTime))/1000)):null,
        hasBacteriaCells,
      });
    }
    uiFrame++;
    _rafId = requestAnimationFrame(_loop);
  }

  return {
    start()  { _running = true; _paused = false; lastTime = performance.now(); _rafId = requestAnimationFrame(_loop); },
    stop()   { _running = false; if (_rafId) cancelAnimationFrame(_rafId); _rafId = null; if(_canvasAC){_canvasAC.abort();_canvasAC=null;} },
    pause()  { _paused = true; },
    resume() { _paused = false; if (_running) { lastTime = performance.now(); _rafId = requestAnimationFrame(_loop); } },
    reset()  { resetSim(); },
    seed()   { seedLife(); },
    randomMap() { randomMap(); },
    openLab() { openLab(); },
    setElement(key) {
      currentEl = key; currentTool = 'draw';
      // Show/hide config panels for special elements
      const pc=_dom('pc-panel'),pv=_dom('pv-panel');
      if(pc) pc.style.display=key==='progCloud'?'block':'none';
      if(pv) pv.style.display=key==='progVoid'?'block':'none';
    },
    setTool(tool) {
      currentTool = tool; speedMult = tool === 'pause' ? 0 : speedMult;
      const sp=_dom('stamp-picker');
      if(sp) sp.style.display=tool==='stamp'?'block':'none';
    },
    setBrush(size)     { brushSize = size; },
    setBrushSize(size) { brushSize = size; },
    setSpeed(mult)     { speedMult = mult; },
    setMutRate(r)      { mutRate = r; },
    getMutRate()       { return mutRate; },
    setEntropyRate(r)  { entropyRate = r; },
    getTickCount()  { return tickCount; },
    getGrid()       { return grid; },
    startGoL() {
      // Manual override (auto-activation is the default path)
      let hm=false;for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.MACHINE){hm=true;break;}}
      if(!hm)return;
      for(let mi=0;mi<W*H;mi++){if(grid[mi]?.t===T.MACHINE)grid[mi].dormant=false;}
      machineUniX0=0;machineUniY0=0;machineUniX1=W-1;machineUniY1=H-1;
      machineRunning=true;machineGeneration=0;lastMachinePlacedTime=0;
    },
    stopGoL() {
      machineRunning=false;machineGeneration=0;lastMachinePlacedTime=0;
      for(let mi=0;mi<W*H;mi++){const _t=grid[mi]?.t;if(_t===T.MACHINE||_t===T.MACHINE_DEAD)grid[mi]=null;}
    },
    stopBacteria() {
      bacteriaRunning=false;bacteriaGeneration=0;lastBacteriaPlacedTime=0;
      for(let mi=0;mi<W*H;mi++){const _t=grid[mi]?.t;if(_t===T.BACTERIA||_t===T.BACTERIA_DEAD)grid[mi]=null;}
    },
  };
}
