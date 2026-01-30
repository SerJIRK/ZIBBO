// Инициализация Telegram
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

// Инициализация Adsgram
let AdController = null;
window.addEventListener('load', () => {
    if (window.Adsgram) {
        AdController = window.Adsgram.init({
            blockId: "9a1dea9f8d134730875d57f334be6f6e", 
            debug: false
        });
    }
});

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
    toggle() {
        this.enabled = !this.enabled;
        SoundMgr.enabled = this.enabled;
        const btn = document.getElementById('btn-music-toggle');
        if (this.enabled) {
            this.playRandom();
            btn.innerText = "MUSIC OFF";
        } else {
            this.stop();
            btn.innerText = "MUSIC ON";
        }
        SoundMgr.play('click');
    },
    playRandom() {
        if (!this.enabled) return;
        this.stop();
        this.index = Math.floor(Math.random() * this.tracks.length);
        this.current = new Audio(this.tracks[this.index]);
        this.current.loop = true;
        this.current.play().catch(() => {});
    },
    stop() {
        if (this.current) { this.current.pause(); this.current = null; }
    },
    setVol(v) { if (this.current) this.current.volume = v; }
};

const Game = {
    state: {
        screen: 'splash',
        level: 1,
        stars: 0,
        timeLeft: 60,
        lives: 1,
        invul: 0,
        lastTime: 0,
        finishAnim: false
    },
    ufo: { x: 80, y: 0, vy: 0, thrust: false, angle: 0, exitX: 0 },
    entities: [],
    bgStars: [],
    globalTime: 0,

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
            if (this.state.screen === 'waiting') this.state.screen = 'playing';
            if (e.type === 'touchstart') e.preventDefault();
        };
        const inputEnd = () => { this.ufo.thrust = false; };
        
        this.canvas.addEventListener('mousedown', inputStart);
        this.canvas.addEventListener('touchstart', inputStart, {passive: false});
        window.addEventListener('mouseup', inputEnd);
        window.addEventListener('touchend', inputEnd);

        document.getElementById('btn-continue').onclick = () => { SoundMgr.play('click'); this.prepareLevel(this.storage.data.level); };
        document.getElementById('btn-newgame').onclick = () => { 
            SoundMgr.play('click'); 
            if(this.storage.data.level > 1 || this.storage.data.stars > 0) {
                document.getElementById('confirm-screen').classList.add('active');
            } else {
                this.prepareLevel(1);
            }
        };
        document.getElementById('confirm-yes').onclick = () => this.storage.reset();
        document.getElementById('confirm-no').onclick = () => document.getElementById('confirm-screen').classList.remove('active');
        document.getElementById('btn-music-toggle').onclick = () => MusicMgr.toggle();
        
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('resume-btn').onclick = () => {
            SoundMgr.play('click');
            if (this.state.screen === 'crashed') this.runAd();
            else this.resume();
        };
        
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('shop-btn-pause').onclick = () => this.openShop();
        document.getElementById('close-shop').onclick = () => this.showScreen(this.state.screen === 'paused' ? 'level-screen' : 'splash-screen');
        
        document.getElementById('win-next-btn').onclick = () => this.prepareLevel(this.storage.data.level);
        document.getElementById('win-track-btn').onclick = () => MusicMgr.playRandom();

        this.checkContinueBtn();
        this.loop(0);
    },

    storage: {
        data: { stars: 0, unlocked: [1], current: 1, livesPlus: 0, level: 1 },
        load() {
            const s = localStorage.getItem('zibbo_save');
            if (s) {
                const loaded = JSON.parse(s);
                this.data = { ...this.data, ...loaded };
            } else {
                this.save();
            }
        },
        save() { 
            localStorage.setItem('zibbo_save', JSON.stringify(this.data));
            const shopDisplay = document.getElementById('total-stars-display-shop');
            if (shopDisplay) shopDisplay.innerText = this.data.stars;
        },
        reset() { localStorage.removeItem('zibbo_save'); location.reload(); }
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
            this.bgStars.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, s: Math.random() * 2 + 1, v: Math.random() * 2 + 1 });
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
        this.state.lives = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        this.updateLivesUI();
        document.getElementById('current-lvl-display').innerText = lvl;
        document.getElementById('game-score').innerText = "0";
        this.showScreen('hud');
        MusicMgr.setVol(1.0);
    },

    update(dt) {
        this.globalTime += dt;
        const isPlaying = this.state.screen === 'playing';
        const isEnding = this.state.timeLeft <= 10;
        
        let speedMult = isPlaying ? (isEnding ? 10 : 3) : 0.5;
        this.bgStars.forEach(s => {
            s.x -= s.v * speedMult;
            if (s.x < 0) s.x = this.canvas.width;
        });

        if (!isPlaying) return;

        const stats = SHIP_STATS[this.storage.data.current];
        if (!this.state.finishAnim) {
            if (this.ufo.thrust) this.ufo.vy -= stats.thrust;
            this.ufo.vy += 0.25;
            this.ufo.vy *= stats.damping;
            this.ufo.y += this.ufo.vy;
            this.ufo.angle = this.ufo.vy * 0.05;

            if (this.ufo.y < 0 || this.ufo.y > innerHeight - 40) this.onHit();
        } else {
            this.ufo.exitX += 20;
            if (this.ufo.exitX > innerWidth) this.win();
        }

        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.max(0, Math.ceil(this.state.timeLeft));

        if (this.state.timeLeft <= 0 && !this.state.finishAnim) {
            this.state.finishAnim = true;
            SoundMgr.play('level_done');
        }

        if (!isEnding) {
            if (Math.random() < 0.01 + (this.state.level * 0.005)) this.spawn('ast');
            if (Math.random() < 0.05) this.spawn('star');
        } else {
            if (Math.random() < 0.07) this.spawnStarPattern();
        }

        this.entities.forEach((en, i) => {
            en.x -= (isEnding ? 10 : 5);
            if (en.type === 'ast') {
                en.rotation = (en.rotation || 0) + en.rotSpeed;
            }
            if (en.type === 'star') {
                en.pulsePhase = (en.pulsePhase || 0) + dt * 3;
            }
            const dist = Math.hypot(en.x - (this.ufo.x + 30 + this.ufo.exitX), en.y - (this.ufo.y + 20));
            if (dist < en.r + 15 && Date.now() > this.state.invul) {
                if (en.type === 'star') {
                    this.state.stars++;
                    document.getElementById('game-score').innerText = this.state.stars;
                    this.entities.splice(i, 1);
                    SoundMgr.play('collect');
                } else {
                    this.onHit();
                }
            }
        });
        this.entities = this.entities.filter(en => en.x > -100);
    },

    spawn(type) {
        this.entities.push({
            type, x: innerWidth + 50, y: Math.random() * (innerHeight - 100) + 50,
            r: type === 'star' ? 15 : 25 + Math.random() * 20,
            rotSpeed: type === 'ast' ? (Math.random() - 0.5) * 0.15 : 0,
            rotation: 0,
            pulsePhase: type === 'star' ? Math.random() * Math.PI * 2 : 0
        });
    },

    spawnStarPattern() {
        const patternType = Math.floor(Math.random() * 3);
        const baseY = Math.random() * (innerHeight - 200) + 100;
        const startX = innerWidth + 50;
        
        if (patternType === 0) {
            for (let i = 0; i < 5; i++) {
                this.entities.push({
                    type: 'star', x: startX + i * 30, y: baseY + Math.sin(i * 0.8) * 60,
                    r: 15, pulsePhase: i * 0.5
                });
            }
        } else if (patternType === 1) {
            for (let i = 0; i < 4; i++) {
                this.entities.push({
                    type: 'star', x: startX + i * 25, y: baseY + (i % 2 === 0 ? -30 : 30),
                    r: 15, pulsePhase: i * 0.7
                });
            }
        } else {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2;
                this.entities.push({
                    type: 'star', x: startX + Math.cos(angle) * 40, y: baseY + Math.sin(angle) * 40,
                    r: 15, pulsePhase: i * 0.4
                });
            }
        }
    },

    onHit() {
        this.state.lives--;
        SoundMgr.play('hit');
        this.updateLivesUI();
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        
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
        document.getElementById('win-track-btn').style.display = isWin ? 'block' : 'none';
        
        const resBtn = document.getElementById('resume-btn');
        resBtn.innerText = isWin ? "MAIN MENU" : "RESUME"; 
        if(isWin) resBtn.onclick = () => location.reload();
        else resBtn.onclick = () => this.runAd();

        this.showScreen('level-screen');
        MusicMgr.setVol(0.3);
    },

    win() {
        this.state.screen = 'win';
        this.storage.data.stars += this.state.stars;
        if (this.state.level === this.storage.data.level) {
            this.storage.data.level++;
        }
        this.storage.save();
        this.showEndScreen("LEVEL DONE!");
    },

    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            document.getElementById('resume-btn').innerText = "RESUME";
            document.getElementById('resume-btn').onclick = () => this.resume();
            this.showEndScreen("PAUSED");
        }
    },

    resume() {
        this.state.screen = 'playing';
        this.showScreen('hud');
        MusicMgr.setVol(1.0);
    },

    runAd() {
        this.showAdScreen();
        if (AdController) {
            AdController.show().then(() => this.adSuccess()).catch(() => this.adSuccess());
        } else {
            setTimeout(() => this.adSuccess(), 3000);
        }
    },

    showAdScreen() {
        document.getElementById('level-screen').classList.remove('active');
        document.getElementById('ad-screen').classList.add('active');
        
        let countdown = 5;
        const timerEl = document.getElementById('ad-timer');
        const btn = document.getElementById('ad-continue-btn');
        
        timerEl.innerText = countdown;
        btn.disabled = true;
        btn.style.opacity = '0.5';
        
        const interval = setInterval(() => {
            countdown--;
            timerEl.innerText = countdown;
            if (countdown <= 0) {
                clearInterval(interval);
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.innerText = 'CONTINUE';
            }
        }, 1000);
        
        btn.onclick = () => {
            clearInterval(interval);
            document.getElementById('ad-screen').classList.remove('active');
        };
    },

    adSuccess() {
        this.state.lives = 1;
        this.updateLivesUI();
        this.resume();
        this.state.invul = Date.now() + 3000;
    },

    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        const max = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        for(let i=1; i<=max; i++) {
            const img = document.createElement('img');
            img.src = `ufo_ship${this.storage.data.current > 1 ? this.storage.data.current : ''}.png`;
            if (i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    openShop() {
        const cont = document.getElementById('shop-content');
        cont.innerHTML = '';
        
        if (this.storage.data.livesPlus < 5) {
            const price = (this.storage.data.livesPlus + 1) * 100;
            cont.innerHTML += `<div class="shop-item">
                <div class="shop-info"><img src="ufo_ship.png" class="shop-icon-life"><div><div class="shop-title">+1 LIFE SLOT</div></div></div>
                <button class="shop-buy-btn" onclick="Game.buy('life', ${price})">${price} ⭐</button>
            </div>`;
        }
        if (this.storage.data.current < 5) {
            const next = this.storage.data.current + 1;
            const price = next * 200;
            cont.innerHTML += `<div class="shop-item">
                <div class="shop-info"><img src="ufo_ship${next}.png" class="shop-icon-ufo"><div><div class="shop-title">CLASS ${next}</div></div></div>
                <button class="shop-buy-btn" onclick="Game.buy('ufo', ${price})">${price} ⭐</button>
            </div>`;
        }
        this.showScreen('shop-screen');
    },

    buy(type, p) {
        if (this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            if (type === 'life') this.storage.data.livesPlus++;
            else this.storage.data.current++;
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
            if (isEnding) {
                this.ctx.rect(s.x, s.y, s.s * (1 + blurVal), s.s);
            } else {
                this.ctx.arc(s.x, s.y, s.s, 0, Math.PI*2);
            }
            this.ctx.fill();
        });
        this.ctx.restore();

        this.entities.forEach(en => {
            if (en.type === 'star') {
                const pulse = 1 + Math.sin(en.pulsePhase || 0) * 0.15;
                const img = document.getElementById('star-img');
                if (img) {
                    this.ctx.save();
                    this.ctx.translate(en.x, en.y);
                    this.ctx.scale(pulse, pulse);
                    this.ctx.drawImage(img, -en.r, -en.r, en.r * 2, en.r * 2);
                    this.ctx.restore();
                }
            } else {
                const img = document.getElementById(en.r > 35 ? 'ast-b-img' : 'ast-s-img');
                if (img) {
                    this.ctx.save();
                    this.ctx.translate(en.x, en.y);
                    this.ctx.rotate(en.rotation || 0);
                    this.ctx.drawImage(img, -en.r, -en.r, en.r * 2, en.r * 2);
                    this.ctx.restore();
                }
            }
        });

        if (this.state.screen !== 'splash') {
            const ufoImg = document.getElementById(`ufo-${this.storage.data.current}`);
            this.ctx.save();
            this.ctx.translate(this.ufo.x + 30 + this.ufo.exitX, this.ufo.y + 20);
            this.ctx.rotate(this.ufo.angle);
            if (Date.now() < this.state.invul) this.ctx.globalAlpha = 0.5;
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
