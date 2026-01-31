// =============================================================================
// [БЛОК 1] ВНЕШНИЕ SDK И ИНИЦИАЛИЗАЦИЯ (Telegram, Adsgram)
// =============================================================================
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

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

// =============================================================================
// [БЛОК 2] КОНСТАНТЫ И НАСТРОЙКИ (Physics & Balance)
// =============================================================================
const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98 },
    2: { thrust: 0.65, damping: 0.97 },
    3: { thrust: 0.75, damping: 0.96 },
    4: { thrust: 0.85, damping: 0.95 },
    5: { thrust: 1.00, damping: 0.94 }
};

const PRICES = {
    LIVES: [150, 200, 300, 400, 500],
    UFO: [0, 200, 300, 400, 500]
};

// =============================================================================
// [БЛОК 3] МЕНЕДЖЕРЫ РЕСУРСОВ (Звук, Музыка, Хранилище)
// =============================================================================
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
        if (this.enabled) this.play();
        else this.stop();
        return this.enabled;
    },
    play() {
        if (!this.enabled) return;
        this.stop();
        this.currentTrack = new Audio(this.tracks[this.trackIndex].ogg);
        this.currentTrack.loop = true;
        this.currentTrack.volume = 0.4;
        this.currentTrack.play().catch(e => console.log("Music blocked"));
    },
    stop() {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    }
};

const SoundMgr = {
    enabled: true,
    sounds: {},
    init() {
        ['collect', 'hit', 'click', 'level_done'].forEach(s => {
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

const StorageMgr = {
    data: { stars: 0, currentUfo: 1, unlockedUfos: [1], boughtLives: 0, level: 1 },
    load() {
        const saved = localStorage.getItem('zibbo_save');
        if (saved) this.data = JSON.parse(saved);
    },
    save() {
        localStorage.setItem('zibbo_save', JSON.stringify(this.data));
    }
};

// =============================================================================
// [БЛОК 4] ЛОГИКА МАГАЗИНА
// =============================================================================
const ShopMgr = {
    render() {
        const list = document.getElementById('shop-content');
        if (!list) return;
        list.innerHTML = '';
        document.getElementById('total-stars-display-shop').innerText = StorageMgr.data.stars;

        // Предмет: Дополнительная жизнь
        const lifeIdx = Math.min(StorageMgr.data.boughtLives, 4);
        const lPrice = PRICES.LIVES[lifeIdx];
        this.createItem(list, "LIFE SLOT +1", `Extra life for all ships`, lPrice, StorageMgr.data.boughtLives >= 5, () => {
            if (StorageMgr.data.stars >= lPrice) {
                StorageMgr.data.stars -= lPrice;
                StorageMgr.data.boughtLives++;
                StorageMgr.save();
                this.render();
            }
        });

        // Предметы: Корабли UFO
        for (let i = 1; i <= 5; i++) {
            const price = PRICES.UFO[i-1];
            const isUnlocked = StorageMgr.data.unlockedUfos.includes(i);
            const isCurrent = StorageMgr.data.currentUfo === i;
            
            let btnLabel = isCurrent ? "EQUIPPED" : (isUnlocked ? "SELECT" : `BUY ⭐${price}`);
            if (i > 1 && !StorageMgr.data.unlockedUfos.includes(i-1) && !isUnlocked) continue;

            this.createItem(list, `UFO MODEL ${i}`, `Speed & Armor Level ${i}`, price, isCurrent, () => {
                if (isUnlocked) {
                    StorageMgr.data.currentUfo = i;
                } else if (StorageMgr.data.stars >= price) {
                    StorageMgr.data.stars -= price;
                    StorageMgr.data.unlockedUfos.push(i);
                    StorageMgr.data.currentUfo = i;
                }
                StorageMgr.save();
                this.render();
            });
        }
    },
    createItem(parent, title, sub, price, disabled, action) {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.innerHTML = `
            <div class="shop-info">
                <div>
                    <div class="shop-title">${title}</div>
                    <div class="shop-sub">${sub}</div>
                </div>
            </div>
            <button class="shop-buy-btn" ${disabled ? 'disabled' : ''}>${disabled ? 'OWNED' : 'BUY'}</button>
        `;
        div.querySelector('button').onclick = action;
        parent.appendChild(div);
    }
};

// =============================================================================
// [БЛОК 5] ОСНОВНОЙ ДВИЖОК ИГРЫ (Game Core)
// =============================================================================
const Game = {
    canvas: document.getElementById('gameCanvas'),
    ctx: null,
    ufo: { x: 80, y: 300, vy: 0, targetY: 300, angle: 0, exitX: 0 },
    entities: [],
    bgStars: [],
    state: { screen: 'splash', playing: false, timer: 60, score: 0, lives: 1, invul: 0, lastTime: 0 },

    init() {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        StorageMgr.load();
        SoundMgr.init();
        this.createStars();
        this.bindEvents();
        this.showScreen('splash-screen');
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createStars() {
        this.bgStars = Array.from({ length: 70 }, () => ({
            x: Math.random() * innerWidth,
            y: Math.random() * innerHeight,
            s: Math.random() * 2 + 0.5,
            v: Math.random() * 1.5 + 0.2
        }));
    },

    start(lvl = 1) {
        StorageMgr.data.level = lvl;
        this.state.timer = 60;
        this.state.score = 0;
        this.state.screen = 'waiting';
        this.state.playing = true;
        this.ufo.exitX = 0;
        this.entities = [];
        this.state.lives = 1 + StorageMgr.data.boughtLives + (StorageMgr.data.currentUfo - 1);
        
        this.showScreen('hud');
        this.updateHUD();
        MusicMgr.play();
    },

    spawn() {
        if (Math.random() < 0.05) this.addEntity('star');
        if (this.state.timer > 5 && Math.random() < (0.04 + StorageMgr.data.level * 0.005)) {
            this.addEntity('asteroid');
        }
    },

    addEntity(type) {
        const isBig = Math.random() > 0.8;
        this.entities.push({
            type,
            x: this.canvas.width + 50,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: type === 'star' ? 15 : (isBig ? 35 : 20),
            angle: 0,
            rotV: (Math.random() - 0.5) * 0.08
        });
    },

    update(dt) {
        if (!this.state.playing || this.state.screen === 'waiting') return;

        this.state.timer -= dt;
        
        // Конец уровня (Улет)
        if (this.state.timer <= 0) {
            if (this.ufo.exitX === 0) SoundMgr.play('level_done');
            this.ufo.exitX += 10;
            if (this.ufo.x + this.ufo.exitX > this.canvas.width + 100) this.win();
        }

        // Физика UFO
        const stats = SHIP_STATS[StorageMgr.data.currentUfo];
        let dy = this.ufo.targetY - (this.ufo.y + 20);
        this.ufo.vy += dy * stats.thrust * dt;
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.atan2(this.ufo.vy, 25) * 0.5;

        this.spawn();

        const speed = 4 + StorageMgr.data.level * 0.3;
        this.entities.forEach((en, i) => {
            en.x -= speed;
            en.angle += en.rotV;

            let dx = (this.ufo.x + 30 + this.ufo.exitX) - en.x;
            let dy = (this.ufo.y + 20) - en.y;
            let d = Math.sqrt(dx*dx + dy*dy);

            if (d < en.r + 18) {
                if (en.type === 'star') {
                    this.state.score++;
                    StorageMgr.data.stars++;
                    SoundMgr.play('collect');
                    this.entities.splice(i, 1);
                    this.updateHUD();
                } else if (Date.now() > this.state.invul) {
                    this.state.lives--;
                    this.state.invul = Date.now() + 2000;
                    SoundMgr.play('hit');
                    this.updateHUD();
                    if (this.state.lives <= 0) this.gameOver();
                }
            }
            if (en.x < -100) this.entities.splice(i, 1);
        });

        this.bgStars.forEach(s => {
            s.x -= s.v;
            if (s.x < 0) s.x = this.canvas.width;
        });
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Звезды фона
        this.ctx.fillStyle = "white";
        this.bgStars.forEach(s => {
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.s, 0, Math.PI*2);
            this.ctx.fill();
        });

        // Элементы игры
        this.entities.forEach(en => {
            const imgId = en.type === 'star' ? 'star-img' : (en.r > 30 ? 'ast-b-img' : 'ast-s-img');
            const img = document.getElementById(imgId);
            if (img && img.complete) {
                this.ctx.save();
                this.ctx.translate(en.x, en.y);
                this.ctx.rotate(en.angle);
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
                this.ctx.restore();
            }
        });

        // UFO
        if (this.state.screen !== 'splash') {
            const ufoImg = document.getElementById(`ufo-${StorageMgr.data.currentUfo}`);
            if (ufoImg && ufoImg.complete) {
                this.ctx.save();
                this.ctx.translate(this.ufo.x + 30 + this.ufo.exitX, this.ufo.y + 20);
                this.ctx.rotate(this.ufo.angle);
                if (Date.now() < this.state.invul) this.ctx.globalAlpha = 0.5;
                this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
                this.ctx.restore();
            }
        }

        // Tap to start текст
        if (this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "24px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TAP TO START", this.canvas.width/2, this.canvas.height/2);
        }
    },

    loop(t) {
        const dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(isNaN(dt) ? 0 : dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    },

    // =============================================================================
    // [БЛОК 6] UI И СОБЫТИЯ
    // =============================================================================
    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    },

    updateHUD() {
        document.getElementById('game-score').innerText = this.state.score;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timer);
        document.getElementById('current-lvl-display').innerText = StorageMgr.data.level;
        
        const bar = document.getElementById('lives-bar');
        if (bar) {
            bar.innerHTML = '';
            for(let i=0; i<this.state.lives; i++) {
                const dot = document.createElement('div');
                dot.className = 'life-dot on';
                bar.appendChild(dot);
            }
        }
    },

    win() {
        this.state.playing = false;
        StorageMgr.save();
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = "LEVEL DONE";
        document.getElementById('win-next-btn').style.display = 'block';
    },

    gameOver() {
        this.state.playing = false;
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = "CRASHED";
        document.getElementById('win-next-btn').style.display = 'none';
    },

    bindEvents() {
        const move = (e) => {
            if (this.state.screen === 'waiting') this.state.screen = 'playing';
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            this.ufo.targetY = y;
        };
        this.canvas.addEventListener('mousedown', move);
        this.canvas.addEventListener('touchstart', move);
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.state.playing) this.ufo.targetY = e.clientY;
        });

        document.getElementById('btn-newgame').onclick = () => this.start(1);
        document.getElementById('pause-btn').onclick = () => this.showScreen('level-screen');
        document.getElementById('win-next-btn').onclick = () => this.start(StorageMgr.data.level + 1);
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        
        document.getElementById('shop-btn-pause').onclick = () => {
            this.showScreen('shop-screen');
            ShopMgr.render();
        };
    }
};

// Запуск
window.onload = () => Game.init();
