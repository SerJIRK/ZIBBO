// Инициализация Telegram
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98 },
    2: { thrust: 0.65, damping: 0.97 },
    3: { thrust: 0.75, damping: 0.96 },
    4: { thrust: 0.85, damping: 0.95 },
    5: { thrust: 1.00, damping: 0.94 }
};

const SoundMgr = {
    enabled: false,
    sounds: {},
    init() {
        ['collect','hit','click','level_done'].forEach(s => {
            this.sounds[s] = new Audio(`${s}.ogg`);
            this.sounds[s].volume = 0.6;
        });
    },
    play(name) {
        if (!this.enabled || !this.sounds[name]) return;
        let s = this.sounds[name].cloneNode();
        s.play().catch(() => {});
    }
};

const MusicMgr = {
    enabled: false,
    current: null,
    tracks: ['track1.ogg', 'track2.ogg', 'track3.ogg', 'track4.ogg'],
    index: 0,
    updateButtons() {
        const txt = this.enabled ? "NEXT TRACK" : "MUSIC OFF";
        document.getElementById('btn-music-toggle').innerText = this.enabled ? "MUSIC OFF" : "MUSIC ON";
        const modalBtn = document.getElementById('next-track-modal');
        if (modalBtn) modalBtn.innerText = txt;
    },
    toggle() {
        this.enabled = !this.enabled;
        SoundMgr.enabled = this.enabled;
        if (this.enabled) this.playNext();
        else this.stop();
        this.updateButtons();
    },
    playNext() {
        if (!this.enabled) { this.toggle(); return; }
        this.stop();
        this.index = (this.index + 1) % this.tracks.length;
        this.current = new Audio(this.tracks[this.index]);
        this.current.loop = true;
        this.current.play().catch(() => {});
        this.updateButtons();
    },
    stop() {
        if (this.current) { this.current.pause(); this.current = null; }
    },
    setVol(v) { if (this.current) this.current.volume = v; }
};

const Game = {
    state: {
        screen: 'splash',
        level: 1, stars: 0, timeLeft: 60,
        lives: 1, invul: 0, lastTime: 0, finishAnim: false
    },
    ufo: { x: 80, y: 0, vy: 0, thrust: false, angle: 0, exitX: 0 },
    entities: [],
    bgStars: [],

    init() {
        this.storage.load();
        SoundMgr.init();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createStarfield();

        window.addEventListener('resize', () => this.resize());
        
        const inputStart = (e) => {
            if (this.state.screen === 'playing') this.ufo.thrust = true;
            if (this.state.screen === 'waiting') { this.state.screen = 'playing'; MusicMgr.setVol(1); }
            if (e.type === 'touchstart') e.preventDefault();
        };
        const inputEnd = () => { this.ufo.thrust = false; };
        
        this.canvas.addEventListener('mousedown', inputStart);
        this.canvas.addEventListener('touchstart', inputStart, {passive: false});
        window.addEventListener('mouseup', inputEnd);
        window.addEventListener('touchend', inputEnd);

        // Bind Buttons
        document.getElementById('btn-continue').onclick = () => { SoundMgr.play('click'); this.prepareLevel(this.storage.data.level); };
        document.getElementById('btn-newgame').onclick = () => { 
            SoundMgr.play('click'); 
            if(this.storage.data.level > 1 || this.storage.data.stars > 0) {
               if(confirm("Start new journey? Progress will be reset.")) this.storage.reset();
            } else this.prepareLevel(1);
        };
        document.getElementById('btn-music-toggle').onclick = () => MusicMgr.toggle();
        document.getElementById('next-track-modal').onclick = () => MusicMgr.playNext();
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('resume-btn').onclick = () => {
            if (this.state.screen === 'crashed') this.runAd();
            else this.resume();
        };
        document.getElementById('shop-btn-pause').onclick = () => this.openShop();
        document.getElementById('close-shop').onclick = () => this.showScreen(this.state.screen === 'paused' ? 'level-screen' : 'splash-screen');
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('win-next-btn').onclick = () => this.prepareLevel(this.storage.data.level);

        this.checkContinueBtn();
        this.loop(0);
    },

    storage: {
        data: { stars: 0, unlockedUfo: 1, boughtLives: 0, level: 1 },
        load() {
            const s = localStorage.getItem('zibbo_save_v3');
            if (s) this.data = JSON.parse(s);
            document.getElementById('total-stars-display-shop').innerText = this.data.stars;
        },
        save() { 
            localStorage.setItem('zibbo_save_v3', JSON.stringify(this.data));
            document.getElementById('total-stars-display-shop').innerText = this.data.stars;
        },
        reset() { localStorage.removeItem('zibbo_save_v3'); location.reload(); }
    },

    checkContinueBtn() {
        if (this.storage.data.level > 1 || this.storage.data.stars > 0) {
            document.getElementById('btn-continue').style.display = 'block';
        }
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createStarfield() {
        this.bgStars = [];
        for (let i = 0; i < 80; i++) {
            this.bgStars.push({ x: Math.random()*innerWidth, y: Math.random()*innerHeight, s: Math.random()*2+1, v: Math.random()*2+1 });
        }
    },

    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        if (id === 'hud') document.getElementById('hud').classList.add('active');
        else document.getElementById(id).classList.add('active');
    },

    prepareLevel(lvl) {
        this.state.level = lvl;
        this.state.timeLeft = 60;
        this.state.stars = 0;
        this.state.screen = 'waiting';
        this.state.finishAnim = false;
        this.ufo.y = innerHeight / 2;
        this.ufo.vy = 0;
        this.ufo.exitX = 0;
        this.entities = [];
        this.state.lives = 1 + this.storage.data.boughtLives + (this.storage.data.unlockedUfo - 1);
        this.updateLivesUI();
        document.getElementById('current-lvl-display').innerText = lvl;
        document.getElementById('game-score').innerText = "0";
        this.showScreen('hud');
        MusicMgr.updateButtons();
    },

    spawnProceduralStars() {
        const type = Math.random();
        const startX = innerWidth + 50;
        if (type < 0.3) { // Синусоида
            const baseTagY = Math.random() * (innerHeight - 200) + 100;
            for(let i=0; i<10; i++) {
                this.entities.push({ type:'star', x: startX + i*40, y: baseTagY + Math.sin(i*0.8)*50, r:15 });
            }
        } else if (type < 0.6) { // Бабочка/Ромб
            const cy = innerHeight/2;
            for(let i=0; i<20; i++) {
                this.entities.push({ type:'star', x: startX + Math.random()*150, y: cy + (Math.random()-0.5)*200, r:15 });
            }
        } else { // Кучка
            const cy = Math.random()*innerHeight;
            for(let i=0; i<8; i++) {
                this.entities.push({ type:'star', x: startX + Math.random()*60, y: cy + Math.random()*60, r:15 });
            }
        }
    },

    update(dt) {
        if (this.state.screen !== 'playing') {
            this.bgStars.forEach(s => { s.x -= s.v * 0.5; if (s.x < 0) s.x = this.canvas.width; });
            return;
        }

        const isEnding = this.state.timeLeft <= 10;
        this.bgStars.forEach(s => {
            s.x -= s.v * (isEnding ? 12 : 4);
            if (s.x < 0) s.x = this.canvas.width;
        });

        if (!this.state.finishAnim) {
            const stats = SHIP_STATS[this.storage.data.unlockedUfo];
            if (this.ufo.thrust) this.ufo.vy -= stats.thrust;
            this.ufo.vy += 0.35;
            this.ufo.vy *= stats.damping;
            this.ufo.y += this.ufo.vy;
            this.ufo.angle = this.ufo.vy * 0.05;
            if (this.ufo.y < 0 || this.ufo.y > innerHeight - 40) this.onHit();
        } else {
            this.ufo.exitX += 25;
            if (this.ufo.exitX > innerWidth) this.win();
        }

        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.max(0, Math.ceil(this.state.timeLeft));

        if (this.state.timeLeft <= 0 && !this.state.finishAnim) {
            this.state.finishAnim = true;
            SoundMgr.play('level_done');
        }

        // Spawn logic
        const spawnChance = isEnding ? 0.01 : (0.02 + this.state.level*0.005);
        if (Math.random() < spawnChance && this.state.timeLeft > 5) {
            this.entities.push({
                type: 'ast', x: innerWidth + 50, y: Math.random() * innerHeight,
                r: 20 + Math.random()*30, 
                color: `hsl(${Math.random()*360}, 50%, 70%)`,
                rot: 0, rotV: (Math.random()-0.5)*0.1
            });
        }

        const starChance = isEnding ? 0.06 : 0.03;
        if (Math.random() < starChance) {
            if (isEnding) this.spawnProceduralStars();
            else this.entities.push({ type:'star', x: innerWidth+50, y: Math.random()*innerHeight, r:15 });
        }

        this.entities.forEach((en, i) => {
            en.x -= (isEnding ? 12 : 6);
            if (en.type === 'ast') en.rot += en.rotV;
            
            const dist = Math.hypot(en.x - (this.ufo.x + 30 + this.ufo.exitX), en.y - (this.ufo.y + 20));
            if (dist < en.r + 15 && Date.now() > this.state.invul) {
                if (en.type === 'star') {
                    this.state.stars++; this.storage.data.stars++;
                    document.getElementById('game-score').innerText = this.state.stars;
                    this.storage.save();
                    this.entities.splice(i, 1);
                    SoundMgr.play('collect');
                } else this.onHit();
            }
        });
        this.entities = this.entities.filter(en => en.x > -200);
    },

    onHit() {
        this.state.lives--;
        SoundMgr.play('hit');
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
        this.updateLivesUI();
        if (this.state.lives <= 0) {
            this.state.screen = 'crashed';
            this.showEndScreen("CRASHED!");
        } else {
            this.state.invul = Date.now() + 2000;
            this.ufo.y = innerHeight / 2;
            this.ufo.vy = 0;
        }
    },

    showEndScreen(title) {
        document.getElementById('level-title').innerText = title;
        document.getElementById('level-stars').innerText = this.state.stars;
        const isWin = this.state.screen === 'win';
        document.getElementById('win-next-btn').style.display = isWin ? 'block' : 'none';
        document.getElementById('resume-btn').innerText = isWin ? "MAIN MENU" : "RESUME";
        if (isWin) document.getElementById('resume-btn').onclick = () => location.reload();
        this.showScreen('level-screen');
        MusicMgr.setVol(0.3);
    },

    win() {
        this.state.screen = 'win';
        if (this.state.level === this.storage.data.level) {
            this.storage.data.level++;
            this.storage.save();
        }
        this.showEndScreen("LEVEL DONE!");
    },

    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            this.showEndScreen("PAUSED");
        }
    },

    resume() {
        this.state.screen = 'playing';
        this.showScreen('hud');
        MusicMgr.setVol(1.0);
    },

    async runAd() {
        if (typeof AdMgr !== 'undefined') {
            try {
                await AdMgr.showRewardAd();
                this.state.lives = 1;
                this.updateLivesUI();
                this.resume();
            } catch(e) { alert("Ad not available"); }
        } else { this.state.lives = 1; this.resume(); }
    },

    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        const total = 1 + this.storage.data.boughtLives + (this.storage.data.unlockedUfo - 1);
        for(let i=1; i<=total; i++) {
            const img = document.createElement('img');
            img.src = `ufo_ship${this.storage.data.unlockedUfo > 1 ? this.storage.data.unlockedUfo : ''}.png`;
            if (i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    openShop() {
        const cont = document.getElementById('shop-content');
        cont.innerHTML = '';
        const data = this.storage.data;
        
        // Жизни
        if (data.boughtLives < 5) {
            const prices = [150, 200, 300, 400, 500];
            const p = prices[data.boughtLives];
            cont.innerHTML += `<div class="shop-item">
                <span>+1 LIFE SLOT</span>
                <button class="shop-buy-btn" onclick="Game.buy('life', ${p})">${p} ⭐</button>
            </div>`;
        }
        // Корабли
        if (data.unlockedUfo < 5) {
            const p = (data.unlockedUfo + 1) * 100; // 200, 300, 400, 500
            cont.innerHTML += `<div class="shop-item">
                <span>UFO CLASS ${data.unlockedUfo + 1}</span>
                <button class="shop-buy-btn" onclick="Game.buy('ufo', ${p})">${p} ⭐</button>
            </div>`;
        }
        this.showScreen('shop-screen');
    },

    buy(type, p) {
        if (this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            if (type === 'life') this.storage.data.boughtLives++;
            else this.storage.data.unlockedUfo++;
            this.storage.save();
            SoundMgr.play('collect');
            this.openShop();
        }
    },

    draw() {
        this.ctx.clearRect(0,0,innerWidth,innerHeight);
        const isEnding = this.state.timeLeft <= 10 && this.state.screen === 'playing';
        const blurVal = isEnding ? Math.min(8, (10 - this.state.timeLeft)) : 0;
        
        this.ctx.save();
        if (blurVal > 0) this.ctx.filter = `blur(${blurVal}px)`;
        this.ctx.fillStyle = "white";
        this.bgStars.forEach(s => {
            this.ctx.beginPath();
            if (isEnding) this.ctx.rect(s.x, s.y, s.s * (1 + blurVal), s.s);
            else this.ctx.arc(s.x, s.y, s.s, 0, Math.PI*2);
            this.ctx.fill();
        });
        this.ctx.restore();

        this.entities.forEach(en => {
            if (en.type === 'star') {
                const pulse = 1 + Math.sin(Date.now()*0.01)*0.2; // ZOOM EFFECT
                this.ctx.drawImage(document.getElementById('star-img'), en.x - en.r*pulse, en.y - en.r*pulse, en.r*2*pulse, en.r*2*pulse);
            } else {
                this.ctx.save();
                this.ctx.translate(en.x, en.y);
                this.ctx.rotate(en.rot);
                const img = document.getElementById(en.r > 35 ? 'ast-b-img' : 'ast-s-img');
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
                this.ctx.restore();
            }
        });

        if (this.state.screen !== 'splash') {
            const ufoImg = document.getElementById(`ufo-${this.storage.data.unlockedUfo}`);
            this.ctx.save();
            this.ctx.translate(this.ufo.x + 30 + this.ufo.exitX, this.ufo.y + 20);
            this.ctx.rotate(this.ufo.angle);
            if (Date.now() < this.state.invul) this.ctx.globalAlpha = Math.sin(Date.now()/50)*0.4+0.5;
            this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
            this.ctx.restore();
        }
    },

    loop(t) {
        const dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(dt > 0.1 ? 0.016 : dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    }
};

window.onload = () => Game.init();
