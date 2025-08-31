/*
  LUDO – Simplified but faithful implementation
  Rules implemented:
  - 2–4 players, clockwise turns.
  - Roll 6 to leave base to your start square; 6 grants an extra roll.
  - Move one piece by the exact die number. If no legal move, pass.
  - Landing on an opponent (not on safe squares) captures and sends them to base.
  - Safe squares: all four start squares + starred cells.
  - Exact roll required to enter the final Home.
*/

// --- Board geometry ---
const grid = document.getElementById('grid');
// Create 15x15 grid
for(let r=0;r<15;r++){
  for(let c=0;c<15;c++){
    const d=document.createElement('div');
    d.className='cell';
    d.dataset.rc = r+','+c;
    grid.appendChild(d);
  }
}

// Utility to get cell elt
const cell = (r,c)=>grid.children[r*15+c];

// Color homes (quadrants) and define bases
const HOME = {
  red:   {cells:[] , base:[ [1,1],[1,3],[3,1],[3,3] ], start:[6,1], homeEntry:[7,6], homeCol:[]},
  yellow:{cells:[] , base:[ [1,11],[1,13],[3,11],[3,13] ], start:[1,8], homeEntry:[6,7], homeCol:[]},
  green: {cells:[] , base:[ [11,1],[11,3],[13,1],[13,3] ], start:[8,13], homeEntry:[7,8], homeCol:[]},
  blue:  {cells:[] , base:[ [11,11],[11,13],[13,11],[13,13] ], start:[13,8], homeEntry:[8,7], homeCol:[]}
};

// Fill large home squares (6x6 corners minus path)
for(let r=0;r<6;r++)for(let c=0;c<6;c++) cell(r,c).classList.add('home','yellow');
for(let r=0;r<6;r++)for(let c=9;c<15;c++) cell(r,c).classList.add('home','red');
for(let r=9;r<15;r++)for(let c=0;c<6;c++) cell(r,c).classList.add('home','green');
for(let r=9;r<15;r++)for(let c=9;c<15;c++) cell(r,c).classList.add('home','blue');

// Create track mapping (52 cells) following classic 15x15 board layout
// Path coordinates in order (starting at red start and moving clockwise)
const TRACK = [
  // Top middle column down to center-left
  [6,1],[6,2],[6,3],[6,4],[6,5], [6,6],
  [5,6],[4,6],[3,6],[2,6],[1,6], [0,6],
  [0,7],
  [0,8],[1,8],[2,8],[3,8],[4,8], [5,8],
  [6,8],[6,9],[6,10],[6,11],[6,12], [6,13],
  [7,13],
  [8,13],[8,12],[8,11],[8,10],[8,9], [8,8],
  [9,8],[10,8],[11,8],[12,8],[13,8], [14,8],
  [14,7],
  [14,6],[13,6],[12,6],[11,6],[10,6], [9,6],
  [8,6],[8,5],[8,4],[8,3],[8,2], [8,1],
  [7,1],
  [6,1] // loop back (duplicate of start index for convenience)
];
// Deduplicate last
TRACK.pop();

// Mark start squares
const START_INDEX = { red:0, yellow:13, green:26, blue:39 };

// Mark safe squares (all starts + 4 star positions commonly used)
const SAFE_INDEXES = new Set([0,13,26,39, 8, 21, 34, 47]);

// Paint start + safe markers
Object.entries(START_INDEX).forEach(([color,idx])=>{
  const [r,c]=TRACK[idx];
  cell(r,c).classList.add('start');
});
[...SAFE_INDEXES].forEach(i=>{ const [r,c]=TRACK[i]; cell(r,c).classList.add('safe-star'); });

// Home columns (5 cells each leading to center [7,7])
const HOME_COL = {
  red:   [[1,7],[2,7],[3,7],[4,7],[5,7]],
  yellow:[[7,13],[7,12],[7,11],[7,10],[7,9]],
  green: [[13,7],[12,7],[11,7],[10,7],[9,7]],
  blue:  [[7,1],[7,2],[7,3],[7,4],[7,5]]
};
const CENTER=[7,7];

// Draw a subtle center diamond
cell(...CENTER).style.background='radial-gradient(circle at 50% 50%, rgba(255,255,255,.18), rgba(255,255,255,0) 70%)';

// --- Game state ---
const COLORS=['red','yellow','green','blue'];
let state = null;

function newGame(playerCount=4){
  // Clear any pieces
  document.querySelectorAll('.piece').forEach(p=>p.remove());
  // Build players
  const players = COLORS.slice(0,playerCount).map((color,pi)=>({
    color,
    startIndex: START_INDEX[color],
    pieces: new Array(4).fill(0).map((_,i)=>({
      id:`${color}-${i}`,
      where:'base', // 'base' | 'track' | 'homecol' | 'home'
      trackIndex:null, // absolute track index (0..51)
      homePos:null // 0..4 for home column position; 5 means finished (home)
    })),
    finished:0
  }));
  state = {
    players,
    turn:0,
    die:null,
    extra:false,
    log:[]
  };
  // Render bases
  Object.entries(HOME).forEach(([color,data])=>{
    data.base.forEach((rc,idx)=>placePieceDom(`${color}-${idx}`, color, rc[0], rc[1]));
  });
  updateHUD();
}

// Place or move a piece element to a grid cell (r,c)
function placePieceDom(id,color,r,c){
  let el = document.getElementById(id);
  if(!el){
    el = document.createElement('div');
    el.className='piece';
    el.id=id; el.dataset.color=color; el.textContent='';
    el.addEventListener('click', ()=>onPieceClick(id));
    grid.appendChild(el);
  }
  const target = cell(r,c);
  target.appendChild(el);
  // handle stacking style
  if(target.querySelectorAll('.piece').length>1){
    target.querySelectorAll('.piece').forEach(p=>p.classList.add('stacked'))
  }else{
    el.classList.remove('stacked');
  }
}

function updateHUD(){
  document.getElementById('turnName').textContent = state ? state.players[state.turn].color.toUpperCase() : '—';
  document.getElementById('die').textContent = state?.die ?? '–';
  const logEl=document.getElementById('log');
  logEl.innerHTML = state.log.slice(-10).map(x=>`• ${x}`).join('<br>');
  // Highlight movable pieces
  document.querySelectorAll('.piece').forEach(p=>p.style.outline='none');
  const moves = legalMovesForCurrent();
  moves.forEach(m=>{
    const el=document.getElementById(m.piece.id);
    el.style.outline='3px solid #fff';
  });
}

function rollDie(){
  if(!state) return;
  if(state.die!==null){ log(`You already rolled. Move a piece.`); return; }
  const v = 1 + Math.floor(Math.random()*6);
  state.die=v;
  log(`${curr().color} rolled ${v}`);
  if(legalMovesForCurrent().length===0){
    log(`No legal moves. Turn passes.`);
    endTurn(false);
  }
  updateHUD();
}

function curr(){ return state.players[state.turn]; }

function legalMovesForCurrent(){
  if(state.die===null) return [];
  const P = curr();
  const d = state.die;
  let moves=[];
  for(const piece of P.pieces){
    if(piece.where==='base'){
      if(d===6){
        // can enter to start if start not blocked by own two-piece stack
        const absIdx = P.startIndex;
        if(!isBlockedByOwnStack(absIdx,P.color)){
          moves.push({type:'enter', piece});
        }
      }
    } else if(piece.where==='track'){
      const targetAbs = (piece.trackIndex + d) % 52;
      // If crossing into own home entry, handle diversion into home column
      const entryIdx = entryIndexFor(P.color);
      if(willEnterHome(piece.trackIndex, d, entryIdx)){
        const stepsIntoHome = d - distanceOnTrack(piece.trackIndex, entryIdx);
        if(stepsIntoHome<=5 && pathHomeClear(P.color, stepsIntoHome)){
          moves.push({type:'to-homecol', piece, stepsIntoHome});
        }
      } else {
        // normal track move
        if(!isBlockedByOwnStack(targetAbs,P.color)){
          moves.push({type:'move', piece, targetAbs});
        }
      }
    } else if(piece.where==='homecol'){
      const target = piece.homePos + d;
      if(target===5){
        moves.push({type:'finish', piece});
      } else if(target<5 && homePathClearForward(P.color, piece.homePos, d)){
        moves.push({type:'home-step', piece, to:target});
      }
    }
  }
  return moves;
}

function isBlockedByOwnStack(absIdx,color){
  const [r,c]=TRACK[absIdx];
  const occupants=[...cell(r,c).querySelectorAll('.piece')].filter(p=>p.dataset.color===color);
  return occupants.length>=2; // block formation
}

function entryIndexFor(color){ return START_INDEX[color]===0? 50 : START_INDEX[color]-2; }
function willEnterHome(fromIdx, d, entryIdx){
  const dist = distanceOnTrack(fromIdx, entryIdx);
  return d>dist; // overshoot your entry -> go into home column
}
function distanceOnTrack(from,to){
  return ( (to - from + 52) % 52 );
}

function pathHomeClear(color, stepsIntoHome){
  // cannot jump over in home column; we only need to ensure available slots
  // We also ensure no own piece occupies the destination slot unless stacking allowed (we allow stacking of own pieces)
  return true;
}
function homePathClearForward(color, pos, d){
  // pos in [0..4], check not exceeding 5 handled by caller
  return true;
}

function onPieceClick(id){
  if(!state) return;
  const P=curr();
  const piece = P.pieces.find(p=>p.id===id);
  const moves=legalMovesForCurrent();
  const m=moves.find(x=>x.piece.id===id);
  if(!m){ log(`That piece can't move.`); return; }
  applyMove(P, m);
}

function applyMove(P, m){
  const d=state.die;
  if(m.type==='enter'){
    const abs=P.startIndex;
    placeOnTrack(P.color, m.piece, abs);
    captureIfNeeded(abs, P.color);
    afterMove(d===6);
  } else if(m.type==='move'){
    const dest=m.targetAbs;
    moveAlongTrack(P.color, m.piece, dest);
    captureIfNeeded(dest, P.color);
    afterMove(d===6);
  } else if(m.type==='to-homecol'){
    // move to home column position stepsIntoHome-1 (0-based)
    m.piece.where='homecol';
    m.piece.trackIndex=null;
    m.piece.homePos=m.stepsIntoHome-1;
    const rc = HOME_COL[P.color][m.piece.homePos];
    placePieceDom(m.piece.id, P.color, rc[0], rc[1]);
    afterMove(d===6);
  } else if(m.type==='home-step'){
    m.piece.homePos=m.to;
    const rc = HOME_COL[P.color][m.piece.homePos];
    placePieceDom(m.piece.id, P.color, rc[0], rc[1]);
    afterMove(d===6);
  } else if(m.type==='finish'){
    m.piece.where='home';
    m.piece.homePos=5;
    const [r,c]=CENTER;
    placePieceDom(m.piece.id, P.color, r, c);
    P.finished++;
    log(`${P.color} finished a piece! (${P.finished}/4)`);
    if(P.finished===4){ log(`🏆 ${P.color.toUpperCase()} wins!`); disableRoll(); }
    afterMove(d===6);
  }
}

function placeOnTrack(color, piece, absIdx){
  piece.where='track';
  piece.trackIndex=absIdx;
  const [r,c]=TRACK[absIdx];
  placePieceDom(piece.id, color, r, c);
}
function moveAlongTrack(color, piece, destAbs){
  piece.trackIndex=destAbs;
  const [r,c]=TRACK[destAbs];
  placePieceDom(piece.id, color, r, c);
}

function captureIfNeeded(absIdx, moverColor){
  const [r,c]=TRACK[absIdx];
  const safe = SAFE_INDEXES.has(absIdx);
  if(safe) return; // cannot capture on safe
  const here=[...cell(r,c).querySelectorAll('.piece')];
  const opponents=here.filter(p=>p.dataset.color!==moverColor);
  if(opponents.length){
    // send all opponent pieces in this cell back to base
    opponents.forEach(el=>{
      const color=el.dataset.color;
      const pl = state.players.find(pp=>pp.color===color);
      const piece = pl.pieces.find(px=>px.id===el.id);
      sendToBase(pl, piece);
    });
    log(`${moverColor} captured ${opponents.length} piece(s)!`);
  }
}
function sendToBase(P, piece){
  piece.where='base'; piece.trackIndex=null; piece.homePos=null;
  // find a free base slot visual (first of 4)
  const idx=Number(piece.id.split('-')[1]);
  const rc=HOME[P.color].base[idx];
  placePieceDom(piece.id, P.color, rc[0], rc[1]);
}

function afterMove(extraTurn){
  state.die=null;
  updateHUD();
  if(!extraTurn){ endTurn(true); }
  else { log(`Extra roll for a 6!`); updateHUD(); }
}

function endTurn(fromMove){
  // Advance turn unless someone already won
  if(state.players.some(p=>p.finished===4)) return;
  state.turn=(state.turn+1)%state.players.length;
  state.die=null;
  updateHUD();
}

// Hook up controls
const rollBtn=document.getElementById('rollBtn');
const newGameBtn=document.getElementById('newGameBtn');
const playersSel=document.getElementById('playersSel');
rollBtn.addEventListener('click', rollDie);
newGameBtn.addEventListener('click', ()=>{
  enableRoll();
  newGame(parseInt(playersSel.value,10));
  log('— New game started —');
});
playersSel.addEventListener('change', ()=>{
  enableRoll();
  newGame(parseInt(playersSel.value,10));
  log('— New game started —');
});

function disableRoll(){ rollBtn.disabled=true; }
function enableRoll(){ rollBtn.disabled=false; }

function log(msg){ state.log.push(msg); updateHUD(); }

// Initialize
newGame(4);
log('Welcome! Select a piece after rolling.');