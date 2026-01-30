// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// Инициализация Adsgram (отложенная)
let AdController = null;
window.addEventListener('load', () => {
    if (window.Adsgram) {
        AdController = window.Adsgram.init({
            blockId: "9a1dea9f8d134730875d57f334be6f6e",
            debug: true
        });
        console.log("Adsgram initialized");
    }
});

// === SHIP PHYSICS ===
const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98 },
    2: { thrust: 0.65, damping: 0.97 },
    3: { thrust: 0.75, damping: 0.96 },
    4: { thrust: 0.85, damping: 0.95 },
    5: { thrust: 1.00, damping: 0.94 }
};

// === MUSIC ENGINE ===
const MusicMgr = {
    currentTrack: null,
    tracks: [
       { ogg: 'track1.ogg' },
        { ogg: 'track2.ogg' },
        { ogg: 'track3.ogg' },
        { ogg: 'track4.ogg' }
    ],
    trackIndex: 0,
    enabled: false,
    
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.playNext();
        } else {
            this.stopAll();
        }
        document.getElementById('music-btn').innerText = this.enabled ? "MUSIC ON" : "MUSIC OFF";
    },

    playNext() {
        if (!this.enabled) return;
        this.stopAll();
        
        const track = this.tracks[this.trackIndex];
        this.currentTrack = new Audio(track.ogg);
        this.currentTrack.loop = true;
        this.currentTrack.volume = 1.0;
        this.currentTrack.play().catch(e => console.log("Audio play blocked", e));
    },

    next() {
        if (!this.enabled) return;
        this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
        this.playNext();
    },

    stopAll() {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    },

    dimMusic(isDim) {
        if (this.currentTrack && this.enabled) {
            this.currentTrack.volume = isDim ? 0.3 : 1.0;
        }
    }
};

// === GAME ENGINE ===
const Game = {
    state: {
        screen: 'splash',
        level: 1,
        score: 0,
        timeLeft: 60,
        lives: 1,
        lastTime: 0,
        invul: 0
    },
    ufo: {
        x: 50,
        y: 0,
        vy: 0,
        thrust: false,
        w: 60,
        h: 40,
        angle: 0
    },
    entities: [],
    stars: [], // Background decorative stars

    init() {
        this.storage.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.resize();
        this.createStarfield();

        // Listeners
        const startAction = (e) => {
            if (this.state.screen === 'playing') this.ufo.thrust = true;
            if (this.state.screen === 'waiting') this.state.screen = 'playing';
            if (e.type === 'touchstart') e.preventDefault();
        };
        const stopAction = () => {
            this.ufo.thrust = false;
        };

        this.canvas.addEventListener('mousedown', startAction);
        this.canvas.addEventListener('touchstart', startAction, { passive: false });
        window.addEventListener('mouseup', stopAction);
        window.addEventListener('touchend', stopAction);

        // Buttons
        document.getElementById('play-btn').onclick = () => this.prepareLevel(this.storage.data.level);
        document.getElementById('new-game-btn').onclick = () => {
            document.getElementById('confirm-screen').classList.add('active');
        };
        document.getElementById('confirm-yes').onclick = () => this.storage.reset();
        document.getElementById('confirm-no').onclick = () => {
            document.getElementById('confirm-screen').classList.remove('active');
        };

        document.getElementById('music-btn').onclick = () => MusicMgr.toggle();
        document.getElementById('next-track-btn').onclick = () => MusicMgr.next();
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('shop-btn-pause').onclick = () => this.openShop();
        document.getElementById('close-shop').onclick = () => {
            const backTo = (this.state.screen === 'paused') ? 'level-screen' : 'splash-screen';
            this.showScreen(backTo);
        };

        document.getElementById('continue-btn').onclick = () => this.runAdSequence();
        document.getElementById('resume-btn').onclick = () => {
            if (this.state.screen === 'win') {
                this.prepareLevel(this.storage.data.level);
            } else {
                this.prepareLevel(this.state.level);
            }
        };

        window.addEventListener('resize', () => this.resize());
        requestAnimationFrame((t) => this.loop(t));
    },

    storage: {
        data: {
            stars: 0,
            unlockedUfo: [1],
            currentUfo: 1,
            livesPlus: 0,
            level: 1
        },
        load() {
            const saved = localStorage.getItem('zibbo_space_v1');
            if (saved) {
                this.data = JSON.parse(saved);
            }
            this.syncUI();
        },
        save() {
            localStorage.setItem('zibbo_space_v1', JSON.stringify(this.data));
            this.syncUI();
        },
        syncUI() {
            document.getElementById('total-stars-display-main').innerText = this.data.stars;
            document.getElementById('total-stars-display-shop').innerText = this.data.stars;
            document.getElementById('current-lvl-display').innerText = this.data.level;
        },
        reset() {
            localStorage.removeItem('zibbo_space_v1');
            location.reload();
        }
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ufo.x = this.canvas.width * 0.15;
    },

    createStarfield() {
        this.stars = [];
        for (let i = 0; i < 80; i++) {
            this.stars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 2,
                speed: 0.5 + Math.random() * 2
            });
        }
    },

    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        if (id) document.getElementById(id).classList.add('active');
        if (id === 'hud' || id === 'level-screen') {
            document.getElementById('hud').classList.add('active');
        }
        
        // Music dimming
        if (id === 'playing' || id === 'hud') {
            MusicMgr.dimMusic(false);
        } else {
            MusicMgr.dimMusic(true);
        }
    },

    prepareLevel(lvl) {
        this.state.level = lvl;
        this.state.score = 0;
        this.state.timeLeft = 60;
        this.state.screen = 'waiting';
        this.entities = [];
        
        // Calc max lives: 1 base + livesPlus + (UFO level - 1)
        const maxLives = 1 + this.storage.data.livesPlus + (this.storage.data.currentUfo - 1);
        this.state.lives = maxLives;
        
        this.ufo.y = this.canvas.height / 2;
        this.ufo.vy = 0;
        this.ufo.angle = 0;

        this.updateLivesUI();
        this.showScreen('hud');
        document.getElementById('game-score').innerText = "0";
    },

    // --- МОДИФИЦИРОВАННЫЙ МЕТОД: ДОБАВЛЕНЫ ПАРАМЕТРЫ ДЛЯ ТЮНИНГА ---
    spawn(type) {
        const isStar = type === 'star';
        this.entities.push({
            type: type,
            x: this.canvas.width + 100,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: isStar ? 15 : 15 + Math.random() * 35, // Разные размеры астероидов
            // Новое:
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.05,
            hue: Math.floor(Math.random() * 360) // Случайный пастельный оттенок
        });
    },

    update(dt) {
        // Star background
        this.stars.forEach(s => {
            let speedFactor = (this.state.screen === 'playing') ? 3 : 1;
            s.x -= s.speed * speedFactor;
            if (s.x < 0) s.x = this.canvas.width;
        });

        if (this.state.screen !== 'playing') return;

        const stats = SHIP_STATS[this.storage.data.currentUfo];
        
        // Difficulty scaling
        const speedMult = 1 + (this.state.level * 0.02);
        const spawnChance = 0.01 + (this.state.level * 0.001);

        // UFO Physics
        if (this.ufo.thrust) {
            this.ufo.vy -= stats.thrust;
        }
        this.ufo.vy += 0.4; // Gravity
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = this.ufo.vy * 0.04;

        // Bounds
        if (this.ufo.y < 0 || this.ufo.y > this.canvas.height - this.ufo.h) {
            this.onHit();
        }

        // Timer
        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
        if (this.state.timeLeft <= 0) {
            this.win();
        }

        // Spawning
        if (Math.random() < 0.02) this.spawn('star');
        if (Math.random() < spawnChance) this.spawn('ast');

        // Entities loop
        this.entities.forEach((en, i) => {
            en.x -= (5 * speedMult);
            
            // --- МОДИФИКАЦИЯ: ОБНОВЛЕНИЕ ВРАЩЕНИЯ ---
            if (en.type === 'ast') en.rotation += en.rotSpeed;

            // Collision
            const dx = (this.ufo.x + 30) - en.x;
            const dy = (this.ufo.y + 20) - en.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < en.r + 15 && Date.now() > this.state.invul) {
                if (en.type === 'star') {
                    this.state.score++;
                    this.storage.data.stars++;
                    document.getElementById('game-score').innerText = this.state.score;
                    this.storage.save();
                    this.entities.splice(i, 1);
                    if (tg) tg.HapticFeedback.impactOccurred('light');
                } else {
                    this.onHit();
                }
            }
        });

        this.entities = this.entities.filter(en => en.x > -100);
    },

    onHit() {
        this.state.lives--;
        if (tg) tg.HapticFeedback.impactOccurred('heavy');
        this.updateLivesUI();

        if (this.state.lives <= 0) {
            this.gameOver();
        } else {
            this.state.invul = Date.now() + 2000;
            this.ufo.y = this.canvas.height / 2;
            this.ufo.vy = 0;
            this.state.screen = 'waiting';
        }
    },

    gameOver() {
        this.state.screen = 'crashed';
        document.getElementById('level-title').innerText = "CRASHED!";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').style.display = 'block';
        document.getElementById('resume-btn').style.display = 'none';
        this.showScreen('level-screen');
    },

    win() {
        this.state.screen = 'win';
        if (this.state.level === this.storage.data.level) {
            this.storage.data.level++;
            this.storage.save();
        }
        document.getElementById('level-title').innerText = "LEVEL CLEAR!";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'block';
        document.getElementById('resume-btn').innerText = "NEXT LEVEL";
        this.showScreen('level-screen');
    },

    runAdSequence() {
        const adBox = document.getElementById('ad-container');
        const timerTxt = document.getElementById('ad-timer');
        document.getElementById('continue-btn').style.display = 'none';
        adBox.style.display = 'flex';
        
        let count = 5;
        timerTxt.innerText = count;
        
        const itv = setInterval(() => {
            count--;
            timerTxt.innerText = count;
            if (count <= 0) {
                clearInterval(itv);
                if (AdController) {
                    AdController.show().finally(() => {
                        this.finishAd();
                    });
                } else {
                    this.finishAd();
                }
            }
        }, 1000);
    },

    finishAd() {
        document.getElementById('ad-container').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'block';
        document.getElementById('resume-btn').innerText = "RESUME";
    },

    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        const maxLives = 1 + this.storage.data.livesPlus + (this.storage.data.currentUfo - 1);
        for (let i = 1; i <= maxLives; i++) {
            const img = document.createElement('img');
            img.src = (this.storage.data.currentUfo > 1) 
                      ? `ufo_ship${this.storage.data.currentUfo}.gif` 
                      : `ufo_ship.gif`;
            if (i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    openShop() {
        const container = document.getElementById('shop-content');
        container.innerHTML = '';

        // Life Slots
        const lifePrices = [150, 200, 300, 400, 500];
        const curL = this.storage.data.livesPlus;
        if (curL < 5) {
            const p = lifePrices[curL];
            container.innerHTML += `
                <div class="shop-item">
                    <div class="shop-info">
                        <img src="ufo_ship.gif" class="shop-icon-life">
                        <div class="shop-desc">
                            <span class="shop-title">+1 LIFE SLOT</span>
                            <span class="shop-sub">Extra slot for any UFO</span>
                        </div>
                    </div>
                    <button class="shop-buy-btn" onclick="Game.buyLife(${p})">${p} ⭐</button>
                </div>`;
        }

        // UFOs
        const ufoLevel = this.storage.data.currentUfo;
        if (ufoLevel < 5) {
            const nextLevel = ufoLevel + 1;
            const p = nextLevel * 100;
            container.innerHTML += `
                <div class="shop-item">
                    <div class="shop-info">
                        <img src="ufo_ship${nextLevel}.gif" class="shop-icon-ufo">
                        <div class="shop-desc">
                            <span class="shop-title">UFO CLASS ${nextLevel}</span>
                            <span class="shop-sub">+1 MAX LIFE & SPEED</span>
                        </div>
                    </div>
                    <button class="shop-buy-btn" onclick="Game.buyShip(${nextLevel}, ${p})">${p} ⭐</button>
                </div>`;
        }
        this.showScreen('shop-screen');
    },

    buyLife(p) {
        if (this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            this.storage.data.livesPlus++;
            this.storage.save();
            this.openShop();
        }
    },

    buyShip(id, p) {
        if (this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            if (!this.storage.data.unlockedUfo.includes(id)) {
                this.storage.data.unlockedUfo.push(id);
            }
            this.storage.data.currentUfo = id;
            this.storage.save();
            this.openShop();
        }
    },

    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('continue-btn').style.display = 'none';
            document.getElementById('resume-btn').style.display = 'block';
            document.getElementById('resume-btn').innerText = "RESUME";
            this.showScreen('level-screen');
        }
    },

    // --- МОДИФИЦИРОВАННЫЙ МЕТОД: ДОБАВЛЕНЫ ЭФФЕКТЫ ОТРИСОВКИ ---
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Stars background
        this.ctx.fillStyle = "white";
        this.stars.forEach(s => {
            this.ctx.globalAlpha = 0.6;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;

        // Entities (Stars & Asteroids)
        this.entities.forEach(en => {
            this.ctx.save();
            this.ctx.translate(en.x, en.y);

            if (en.type === 'star') {
                // Эффект "дыхания"
                const pulse = 1 + Math.sin(Date.now() / 250) * 0.15;
                this.ctx.scale(pulse, pulse);
                const img = document.getElementById('star-img');
                if (img && img.complete) {
                    this.ctx.drawImage(img, -en.r, -en.r, en.r * 2, en.r * 2);
                }
            } else {
                // Эффект вращения и пастельный цвет
                this.ctx.rotate(en.rotation);
                this.ctx.filter = `hue-rotate(${en.hue}deg) brightness(1.1) saturate(0.8)`;
                const imgId = en.r > 30 ? 'ast-b-img' : 'ast-s-img';
                const img = document.getElementById(imgId);
                if (img && img.complete) {
                    this.ctx.drawImage(img, -en.r, -en.r, en.r * 2, en.r * 2);
                }
                this.ctx.filter = 'none';
            }
            this.ctx.restore();
        });
        
        // Player UFO
        if (this.state.screen !== 'splash') {
            const ufoImg = document.getElementById(`ufo-${this.storage.data.currentUfo}`);
            if (ufoImg && ufoImg.complete) {
                this.ctx.save();
                this.ctx.translate(this.ufo.x + 30, this.ufo.y + 20);
                this.ctx.rotate(this.ufo.angle);
                if (Date.now() < this.state.invul) {
                    this.ctx.globalAlpha = Math.sin(Date.now() / 50) * 0.3 + 0.6;
                }
                this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
                this.ctx.restore();
            }
        }
        
        if (this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "20px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TAP TO FLY", this.canvas.width / 2, this.canvas.height / 2 + 80);
        }
    },

    loop(t) {
        const dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(dt > 0.1 ? 0.016 : dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }
};

// Start
Game.init();
