/* mario.js - Versión completa con vuelo optimizado, corazón y final de juego */

/* =========================
   Setup Canvas y constantes
   ========================= */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
const TARGET_FPS = 60;
const DT = 1 / TARGET_FPS;

/* ------------- Recursos (imágenes) ------------- */
const resources = {
  bg: loadImage('fondo.jpg'),
  p1: loadImage('eduardo.jpg'),
  p2: loadImage('todor.jpg'),
  p1Fly: loadImage('eduardowings.jpg'),
  p2Fly: loadImage('todorwings.jpg'),
  e1: loadImage('motherinlaw.jpg'),
  e2: loadImage('bills.jpg'),
  p1Crouch: loadImage('eduardoagachado.jpg'),
  p2Crouch: loadImage('todoragachado.jpg'),
  heart: loadImage('heart.jpg') // AGREGADO: sprite del corazón
};

function loadImage(src){
  const img = new Image();
  img.src = src;
  img.onerror = ()=>{};
  return img;
}

/* =========================
   Utilidades
   ========================= */
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function rectsOverlap(a,b){
  return !(a.x + a.w < b.x || a.x > b.x + b.w || a.y + a.h < b.y || a.y > b.y + b.h);
}

/* =========================
   Input
   ========================= */
const keys = {};
const lastKeyPress = {};
window.addEventListener('keydown', e => { 
  keys[e.key.toLowerCase()] = true; 
  const now = performance.now();
  if(lastKeyPress[e.key.toLowerCase()] && now - lastKeyPress[e.key.toLowerCase()] < 300){
    if(e.key.toLowerCase() === 'w') doubleTap('p1'); // AGREGADO: doubletap P1
    if(e.key.toLowerCase() === '8') doubleTap('p2'); // AGREGADO: doubletap P2
  }
  lastKeyPress[e.key.toLowerCase()] = now;
  if (e.key === 'Enter') startGame(); 
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

/* =========================
   Estado global
   ========================= */
let lastTime = performance.now();
let accumulator = 0;
let running = false;
let difficulty = 'medium';
let heartTimer = 0;
let heartActive = false;
let heart = {x:0, y:0, w:32, h:32, duration:0}; // AGREGADO: estado del corazón

const gameState = {
  players: [],
  bullets: [],
  enemies: [],
  platforms: [],
  score1: 0,
  score2: 0,
  countdown: 3,
  countdownActive: true
};

/* =========================
   Niveles / Plataformas
   ========================= */
function createLevel(){
  gameState.platforms = [];
  const groundH = Math.min(160, Math.round(H * 0.12));
  gameState.platforms.push({x:0, y:H-groundH, w:W, h:groundH});
  const platW = Math.min(420, W*0.35);
  gameState.platforms.push({x:Math.round(W*0.12), y:H-300, w:platW, h:24});
  gameState.platforms.push({x:Math.round(W*0.6), y:H-420, w:platW, h:24});
  gameState.platforms.push({x:Math.round(W*0.42), y:H-190, w:platW*0.7, h:24});
}

/* =========================
   Entidades
   ========================= */
class Entity {
  constructor(x,y,w,h){ this.x=x; this.y=y; this.w=w; this.h=h; this.vx=0; this.vy=0; }
  getBounds(){ return {x:this.x, y:this.y, w:this.w, h:this.h}; }
}

class Player extends Entity {
  constructor(x,y,options){
    super(x,y,48,64);
    this.color = options.color || '#ffb86b';
    this.sprite = options.sprite || null;
    this.controls = options.controls || {};
    this.onGround = false;
    this.facing = 1;
    this.shootCooldown = 0;
    this.lives = 10;
    this.spawnX = x;
    this.spawnY = y;
    this.crouching = false;
    this.hitFlash = 0;
    this.flying = false; // AGREGADO: estado de vuelo
    this.flyTimer = 0; // AGREGADO: duración del vuelo
  }
  respawn(){
    this.x = this.spawnX; this.y = this.spawnY;
    this.vx = 0; this.vy = 0; this.onGround = false;
    this.crouching = false; this.hitFlash = 0; this.flying=false; this.flyTimer=0;
  }
  update(dt){
    if(this.hitFlash>0)this.hitFlash=Math.max(0,this.hitFlash-dt);

    // gravedad normal
    if(!this.flying) this.vy += 1800*dt;

    const speed=320;
    if(this.controls.left&&this.controls.left()){this.vx=-speed;this.facing=-1;}
    else if(this.controls.right&&this.controls.right()){this.vx=speed;this.facing=1;}
    else this.vx=0;

    if(this.controls.jump&&this.controls.jump()&&this.onGround){this.vy=-680; this.onGround=false;}

    // vuelo AGREGADO
    if(this.flying){
      this.flyTimer -= dt;
      if(this.flyTimer <= 0) { this.flying=false; } 
      else {
        if(this.controls.jump&&this.controls.jump()) this.vy = -300; // impulso de vuelo
      }
    }

    this.crouching=false;
    if(this.controls.down&&this.controls.down()){this.vy+=180*dt;this.crouching=true;}

    this.x+=this.vx*dt; this.y+=this.vy*dt;
    this.x=clamp(this.x,0,W-this.w);

    this.onGround=false;
    for(const p of gameState.platforms){
      if(this.vy>=0&&this.x+this.w>p.x&&this.x<p.x+p.w){
        const footY=this.y+this.h;
        if(footY>p.y&&(footY-this.vy*dt)<=p.y+2){
          this.y=p.y-this.h; this.vy=0; this.onGround=true;
          this.flying=false; // AGREGADO: dejar de volar al tocar el suelo
        }
      }
    }

    if(this.controls.shoot&&this.controls.shoot())this.shoot();
    if(this.shootCooldown>0)this.shootCooldown=Math.max(0,this.shootCooldown-dt);
  }
  shoot(){
    if(this.shootCooldown<=0){
      const bulletSpeed=820;
      const bx=this.x+(this.facing>0?this.w:-12);
      const by=this.y+this.h*0.45;
      gameState.bullets.push(new Bullet(bx,by,this.facing*bulletSpeed,0,this));
      this.shootCooldown=0.35;
    }
  }
  draw(ctx){
    if(this.hitFlash>0){ctx.fillStyle='#fff'; ctx.fillRect(this.x-2,this.y-2,this.w+4,this.h+4);}
    ctx.save();
    const shadowY=this.y+this.h+8;
    ctx.fillStyle='rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.x+this.w/2,shadowY,this.w*0.6,10,0,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    let spriteToDraw = this.sprite;
    if(this.crouching) spriteToDraw = (this===gameState.players[0]?resources.p1Crouch:resources.p2Crouch);
    else if(this.flying) spriteToDraw = (this===gameState.players[0]?resources.p1Fly:resources.p2Fly); // AGREGADO: sprite de vuelo

    if(spriteToDraw && spriteToDraw.complete && spriteToDraw.naturalWidth) ctx.drawImage(spriteToDraw,this.x,this.y,this.w,this.h);
    else{ctx.fillStyle=this.color;ctx.fillRect(this.x,this.y,this.w,this.h);ctx.fillStyle='#000';ctx.font='12px sans-serif';ctx.fillText('P',this.x+6,this.y+18);}
    ctx.strokeStyle='rgba(255,255,255,0.06)';
    ctx.strokeRect(this.x,this.y,this.w,this.h);

    ctx.save(); ctx.font='16px sans-serif'; ctx.fillStyle='#ff5555';
    ctx.fillText(`♥ ${this.lives}`,this.x,this.y-8);
    ctx.restore();
  }
}

// AGREGADO: doble pulsación
function doubleTap(playerKey){
  let p = (playerKey==='p1')?gameState.players[0]:gameState.players[1];
  if(!p.flying && p.onGround){ p.flying=true; p.flyTimer=1.0; } // vuelo máximo 1 segundo
}

class Bullet extends Entity{
  constructor(x,y,vx,vy,owner){super(x,y,12,8);this.vx=vx;this.vy=vy;this.owner=owner;this.life=3.5;}
  update(dt){
    this.x+=this.vx*dt; this.y+=this.vy*dt; this.life-=dt;
    for(const p of gameState.platforms) if(rectsOverlap(this.getBounds(),p)){this.life=0;break;}
  }
  draw(ctx){ctx.save(); ctx.fillStyle='#fff'; ctx.fillRect(this.x,this.y,this.w,this.h); ctx.restore();}
}

class Enemy extends Entity{
  constructor(x,y,sprite,type='patrol'){super(x,y,56,64);this.sprite=sprite; this.type=type; this.vx=(Math.random()<0.5?-1:1)*80; this.vy=0; this.health=2; this.shootCooldown=1+Math.random()*1.5; this.patrolTimer=0; this.hitFlash=0;}
  update(dt){
    const diffMult=difficulty==='easy'?0.7:difficulty==='hard'?1.4:1.0;
    this.patrolTimer+=dt;
    if(this.type==='patrol'){if(this.patrolTimer>2.2){this.vx*=-1;this.patrolTimer=0;} this.x+=this.vx*dt;}
    else if(this.type==='shooter'){const target=nearestPlayer(this); if(target){const dx=(target.x+target.w/2)-(this.x+this.w/2); this.vx=clamp(dx*0.4,-160*diffMult,160*diffMult); this.x+=this.vx*dt;}}
    this.vy+=1400*dt; this.y+=this.vy*dt;
    for(const p of gameState.platforms){if(this.vy>=0&&this.x+this.w>p.x&&this.x<p.x+p.w){const footY=this.y+this.h;if(footY>p.y&&(footY-this.vy*dt)<=p.y+2){this.y=p.y-this.h;this.vy=0;}}}
    if(this.x<0||this.x+this.w>W){this.vx*=-1; this.x=clamp(this.x,0,W-this.w);}
    this.shootCooldown-=dt*diffMult;
    if(this.shootCooldown<=0){const target=nearestPlayer(this); if(target){const dir=Math.sign((target.x+target.w/2)-(this.x+this.w/2))||1; const speed=460*diffMult; const bx=this.x+(dir>0?this.w:-12); const by=this.y+this.h*0.5; gameState.bullets.push(new Bullet(bx,by,dir*speed,0,this));} this.shootCooldown=1.2+Math.random()*1.6;}
  }
  draw(ctx){
    if(this.hitFlash>0){ctx.fillStyle='#fff'; ctx.fillRect(this.x-2,this.y-2,this.w+4,this.h+4); this.hitFlash=Math.max(0,this.hitFlash-0.016);}
    ctx.save(); ctx.fillStyle='rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(this.x+this.w/2,this.y+this.h+8,this.w*0.6,10,0,0,Math.PI*2); ctx.fill(); ctx.restore();
    if(this.sprite&&this.sprite.complete&&this.sprite.naturalWidth) ctx.drawImage(this.sprite,this.x,this.y,this.w,this.h);
    else {ctx.fillStyle='#fae'; ctx.fillRect(this.x,this.y,this.w,this.h); ctx.fillStyle='#000'; ctx.font='12px sans-serif'; ctx.fillText('E',this.x+6,this.y+20);}
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.strokeRect(this.x,this.y,this.w,this.h);
  }
}

/* =========================
   Helpers
   ========================= */
function nearestPlayer(enemy){
  if(!gameState.players||gameState.players.length===0)return null;
  let best=gameState.players[0]; let bestD=Math.abs(best.x-enemy.x);
  for(const p of gameState.players){const d=Math.abs(p.x-enemy.x); if(d<bestD){best=p;bestD=d;}}
  return best;
}

/* =========================
   Inicialización
   ========================= */
function initPlayers(){
  gameState.players=[];
  const p1Controls={left:()=>keys['a'],right:()=>keys['d'],jump:()=>keys['w'],down:()=>keys['z'],shoot:()=>keys['s']};
  const p2Controls={left:()=>keys['4'],right:()=>keys['6'],jump:()=>keys['8'],down:()=>keys['2'],shoot:()=>keys['5']};
  const p1=new Player(120,H-300,{color:'#ffb86b',sprite:resources.p1,controls:p1Controls}); p1.respawn();
  const p2=new Player(W-180,H-300,{color:'#7dd3fc',sprite:resources.p2,controls:p2Controls}); p2.respawn();
  gameState.players.push(p1,p2);
}
function initEnemies(){
  gameState.enemies=[];
  const eA=new Enemy(W*0.5,H-500,resources.e1,'patrol');
  const eB=new Enemy(W*0.7,H-500,resources.e2,'shooter');
  gameState.enemies.push(eA,eB);
}

/* =========================
   Reset / Start
   ========================= */
function resetGame(){
  W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight;
  createLevel();
  gameState.bullets=[]; gameState.score1=0; gameState.score2=0;
  initPlayers(); initEnemies();
  updateLivesUI();
  gameState.countdown=3; gameState.countdownActive=true;
  heartTimer=0; heartActive=false; heart.duration=0; // AGREGADO: reiniciar corazón
}

function startGame(){
  const diffEl=document.getElementById('difficulty'); if(diffEl) difficulty=diffEl.value;
  resetGame();
  const overlay=document.getElementById('overlay'); if(overlay) overlay.classList.add('hidden');
  running=true;
}

/* =========================
   Game Loop
   ========================= */
function gameLoop(now){
  const frameTime=Math.min(0.25,(now-lastTime)/1000);
  lastTime=now; accumulator+=frameTime;
  while(accumulator>=DT){update(DT);accumulator-=DT;}
  render(); requestAnimationFrame(gameLoop);
}

/* =========================
   Update
   ========================= */
function update(dt){
  if(!running)return;

  if(gameState.countdownActive){
    gameState.countdown-=dt;
    if(gameState.countdown<=0){ gameState.countdownActive=false; gameState.countdown=0;}
    return;
  }

  // Actualizar jugadores
  for(const p of gameState.players) p.update(dt);
  // Actualizar enemigos
  for(const e of gameState.enemies) e.update(dt);

  // Actualizar balas
  for(let i=gameState.bullets.length-1;i>=0;i--){
    const b=gameState.bullets[i]; b.update(dt);
    if(b.life<=0||b.x<-100||b.x>W+100){gameState.bullets.splice(i,1);continue;}
    
    // Balas de jugadores
    if(b.owner instanceof Player){
      // Daño a otros jugadores
      for(let j=gameState.players.length-1;j>=0;j--){
        const p=gameState.players[j];
        if(rectsOverlap(b.getBounds(),p.getBounds())&&b.owner!==p&&!p.crouching){
          p.lives-=1; b.life=0; p.hitFlash=0.2; updateLivesUI();
          if(p.lives<=0){endGame();}
          break;
        }
      }
      // Daño a enemigos
      for(let j=gameState.enemies.length-1;j>=0;j--){
        const e=gameState.enemies[j]; 
        if(rectsOverlap(b.getBounds(),e.getBounds())){
          e.health-=1; b.life=0; e.hitFlash=0.2;
          if(e.health<=0){
            if(b.owner===gameState.players[0])gameState.score1+=150; 
            if(b.owner===gameState.players[1])gameState.score2+=150; 
            gameState.enemies.splice(j,1); updateScoreUI();
          } 
          break;
        }
      }
    }

    // Balas de enemigos dañan jugadores
    if(b.owner instanceof Enemy){
      for(let j=gameState.players.length-1;j>=0;j--){
        const p=gameState.players[j];
        if(rectsOverlap(b.getBounds(),p.getBounds())&&!p.crouching){
          p.lives-=1; b.life=0; p.hitFlash=0.2; updateLivesUI();
          if(p.lives<=0){endGame();}
          break;
        }
      }
    }
  }

  // Generar enemigos si quedan pocos
  if(gameState.enemies.length<1){
    const spawnCount=difficulty==='hard'?2:1;
    for(let i=0;i<spawnCount;i++){const sX=Math.random()*(W-200)+100; const t=Math.random()<0.5?'patrol':'shooter'; gameState.enemies.push(new Enemy(sX,H-500,Math.random()<0.5?resources.e1:resources.e2,t));}
  }

  // Corazón cada 30s AGREGADO
  heartTimer+=dt;
  if(!heartActive && heartTimer>=30){
    heartActive=true; heart.duration=10; heartTimer=0;
    heart.x=W/2-16; heart.y=H/2-16;
  }
  if(heartActive){
    heart.duration-=dt;
    if(heart.duration<=0) heartActive=false;
    // Verificar colisión con jugadores
    for(const p of gameState.players){
      if(rectsOverlap(p.getBounds(), heart)){
        p.lives+=1; updateLivesUI(); heartActive=false; break;
      }
    }
  }
}

/* =========================
   Render
   ========================= */
function render(){
  ctx.save();
  if(resources.bg&&resources.bg.complete&&resources.bg.naturalWidth){
    const scale=Math.max(W/resources.bg.naturalWidth,H/resources.bg.naturalHeight);
    const bw=resources.bg.naturalWidth*scale;
    const bh=resources.bg.naturalHeight*scale;
    const bx=-(bw-W)*0.2; ctx.drawImage(resources.bg,bx,0,bw,bh);
    ctx.fillStyle='rgba(0,10,30,0.16)'; ctx.fillRect(0,0,W,H);
  } else{ const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#102a43'); g.addColorStop(1,'#021028'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);}
  ctx.restore();

  for(const p of gameState.platforms){
    ctx.save(); ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(p.x,p.y+8,p.w,p.h); ctx.restore();
    ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(p.x,p.y,p.w,p.h); ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.strokeRect(p.x,p.y,p.w,p.h);
  }

  for(const p of gameState.players) p.draw(ctx);
  for(const e of gameState.enemies) e.draw(ctx);
  for(const b of gameState.bullets) b.draw(ctx);

  // Dibujar corazón AGREGADO
  if(heartActive && resources.heart.complete && resources.heart.naturalWidth){
    ctx.drawImage(resources.heart, heart.x, heart.y, heart.w, heart.h);
  }

  ctx.save(); ctx.font='18px Inter, sans-serif'; ctx.fillStyle='#fff';
  ctx.fillText(`Score Eduardo: ${gameState.score1}`,24,H-24); 
  ctx.fillText(`Score Todor: ${gameState.score2}`,W-180,H-24);
  ctx.restore();

  if(gameState.countdownActive){
    ctx.save(); ctx.font='96px sans-serif'; ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(Math.ceil(gameState.countdown),W/2,H/2); ctx.restore();
  }
}

/* =========================
   UI bindings
   ========================= */
const startBtn=document.getElementById('startBtn'); if(startBtn)startBtn.addEventListener('click',startGame);
const restartBtn=document.getElementById('restartBtn'); if(restartBtn)restartBtn.addEventListener('click',()=>{resetGame(); const ov=document.getElementById('overlay'); if(ov)ov.classList.add('hidden'); running=true;});
const fullscreenBtn=document.getElementById('fullscreenBtn'); if(fullscreenBtn)fullscreenBtn.addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen(); else document.exitFullscreen();});

window.addEventListener('resize',()=>{
  W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight;
  createLevel(); for(const p of gameState.players) p.spawnY=Math.min(p.spawnY,H-120);
});

function updateScoreUI(){const s1=document.getElementById('score1');if(s1)s1.textContent=gameState.score1; const s2=document.getElementById('score2');if(s2)s2.textContent=gameState.score2;}
function updateLivesUI(){if(gameState.players&&gameState.players.length>=2){const l1=document.getElementById('lives1');if(l1)l1.textContent=`Vidas: ${gameState.players[0].lives}`; const l2=document.getElementById('lives2');if(l2)l2.textContent=`Vidas: ${gameState.players[1].lives}`;}}

/* =========================
   Fin del juego AGREGADO
   ========================= */
function endGame(){
  running=false;
  const overlay=document.getElementById('overlay'); if(overlay) overlay.classList.remove('hidden');
  const p=document.querySelector('#overlayContent p');
  if(p){
    let winner='';
    if(gameState.players[0].lives<=0 && gameState.players[1].lives<=0) winner='Empate';
    else if(gameState.players[0].lives<=0) winner='Todor gana!';
    else winner='Eduardo gana!';
    p.textContent=`Juego terminado. ${winner}`;
  }
}

/* =========================
   Bootstrap inicial
   ========================= */
(function bootstrap(){
  createLevel();
  const overlay=document.getElementById('overlay'); if(overlay)overlay.classList.remove('hidden');
  const p=document.querySelector('#overlayContent p');
  if(p)p.textContent='Controles - P1: A/D mover, W saltar, Z agachar, S disparar. P2 (Numpad): 4/6 mover, 8 saltar, 2 agachar, 5 disparar. Presiona Iniciar.';
  const diffEl=document.getElementById('difficulty'); if(diffEl)diffEl.addEventListener('change',(e)=>difficulty=e.target.value);
  lastTime=performance.now(); requestAnimationFrame(gameLoop);
})();
