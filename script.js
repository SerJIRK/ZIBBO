// =============================================================================
// 1. ПЛАТФОРМЕННЫЕ SDK (Telegram, Adsgram)
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
// 2. ГЛОБАЛЬНЫЕ КОНСТАНТЫ И НАСТРОЙКИ (Physics, Prices)
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
// 3. СИСТЕМНЫЕ МЕНЕДЖЕРЫ (Music, Sound, Storage)
// =============================================================================
const MusicMgr = {
    currentTrack: null,
    tracks: [{ ogg: 'track1.ogg' }, { ogg: 'track2.ogg' }, { ogg: 'track3.ogg' }, { ogg: 'track4.ogg' }],
    trackIndex: 0,
    enabled: false,
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) this.play(); else this.stop();
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
        if (this.currentTrack) { this.currentTrack.pause(); this.currentTrack = null; }
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

// =============================================================================
// 4. ГЛАВНЫЙ ОБЪЕКТ ИГРЫ (Game Engine)
// =============================================================================
const Game = {
    canvas: document.getElementById('gameCanvas'),
    ctx: null,
    
    // Состояние UFO
    ufo: { x: 80, y: 300, vy: 0, targetY: 300, angle: 0 },
    
    // Мир игры
    entities: [],
    bgStars: [],
    
    // Состояние системы
    storage: {
        data: { stars: 0, currentUfo: 1, unlockedUfos: [1], boughtLives: 0, level: 1 },
        load() {
            const saved = localStorage.getItem('zibbo_save');
            if (saved) this.data = JSON.parse(saved);
        },
        save() {
            localStorage.setItem('zibbo_save', JSON.stringify(this.data));
        }
    },
    
    state: {
        screen: 'splash',
        playing: false,
        timer: 60,
        score: 0,
        lives: 1,
        invul: 0,
        lastTime: 0
    },

    init() {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.storage.load();
        SoundMgr.init();
        this.createStars();
        this.bindEvents();
        this.showScreen('splash-screen');
        
        // Запуск цикла
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createStars() {
        this.bgStars = [];
        for (let i = 0; i < 70; i++) {
            this.bgStars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                s: Math.random() * 2 + 0.5,
                v: Math.random() * 1.5 + 0.2
            });
        }
    },

    start(lvl = 1) {
        this.storage.data.level = lvl;
        this.state.timer = 60;
        this.state.score = 0;
        this.state.screen = 'waiting';
        this.state.playing = true;
        this.entities = [];
        
        // Расчет жизней как в оригинале
        this.state.lives = 1 + this.storage.data.boughtLives + (this.storage.data.currentUfo - 1);
        
        this.showScreen('hud');
        this.updateHUD();
        MusicMgr.play();
    },

    spawn() {
        if (Math.random() < 0.05) this.addEntity('star');
        // Шанс появления астероидов растет с уровнем
        let asteroidChance = 0.04 + (this.storage.data.level * 0.005);
        if (this.state.timer > 5 && Math.random() < asteroidChance) {
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
        // Фоновые звезды движутся всегда
        this.bgStars.forEach(s => {
            s.x -= s.v;
            if (s.x < 0) s.x = this.canvas.width;
        });

        if (!this.state.playing || this.state.screen === 'waiting') return;

        this.state.timer -= dt;
        if (this.state.timer <= 0) this.endLevel(true);

        // Физика UFO
        const stats = SHIP_STATS[this.storage.data.currentUfo];
        let dy = this.ufo.targetY - (this.ufo.y + 20);
        this.ufo.vy += dy * stats.thrust * dt;
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.atan2(this.ufo.vy, 25) * 0.5;

        this.spawn();

        const moveSpeed = 4 + (this.storage.data.level * 0.3);
        this.entities.forEach((en, i) => {
            en.x -= moveSpeed;
            en.angle += en.rotV;

            // Коллизии
            let dx = (this.ufo.x + 30) - en.x;
            let dy = (this.ufo.y + 20) - en.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < en.r + 18) {
                if (en.type === 'star') {
                    this.state.score++;
                    this.storage.data.stars++;
                    SoundMgr.play('collect');
                    this.entities.splice(i, 1);
                    this.updateHUD();
                } else if (Date.now() > this.state.invul) {
                    this.state.lives--;
                    this.state.invul = Date.now() + 2000;
                    SoundMgr.play('hit');
                    this.updateHUD();
                    if (this.state.lives <= 0) this.endLevel(false);
                }
            }
            if (en.x < -100) this.entities.splice(i, 1);
        });
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 1. Звезды
        this.ctx.fillStyle = "white";
        this.bgStars.forEach(s => {
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
            this.ctx.fill();
        });

        // 2. Объекты (Астероиды и Звезды)
        this.entities.forEach(en => {
            const imgId = en.type === 'star' ? 'star-img' : (en.r > 30 ? 'ast-b-img' : 'ast-s-img');
            const img = document.getElementById(imgId);
            if (img && img.complete) {
                this.ctx.save();
                this.ctx.translate(en.x, en.y);
                this.ctx.rotate(en.angle);
                this.ctx.drawImage(img, -en.r, -en.r, en.r * 2, en.r * 2);
                this.ctx.restore();
            }
        });

        // 3. UFO
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

        // 4. Текст Waiting
        if (this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "20px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TAP TO START", this.canvas.width / 2, this.canvas.height / 2);
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
    // 5. ИНТЕРФЕЙС И СОБЫТИЯ (UI & Events)
    // =============================================================================
    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
        this.state.screen = id === 'hud' ? 'playing' : id;
    },

    updateHUD() {
        document.getElementById('game-score').innerText = this.state.score;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timer);
        document.getElementById('current-lvl-display').innerText = this.storage.data.level;
        
        const bar = document.getElementById('lives-bar');
        if (bar) {
            bar.innerHTML = '';
            for (let i = 0; i < this.state.lives; i++) {
                const dot = document.createElement('div');
                dot.className = 'life-dot on';
                bar.appendChild(dot);
            }
        }
    },

    endLevel(win) {
        this.state.playing = false;
        this.storage.save();
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = win ? "LEVEL DONE" : "CRASHED";
        document.getElementById('win-next-btn').style.display = win ? 'block' : 'none';
    },

    bindEvents() {
        const handleInput = (e) => {
            if (this.state.screen === 'waiting') this.state.screen = 'playing';
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            this.ufo.targetY = y;
        };

        this.canvas.addEventListener('mousedown', handleInput);
        this.canvas.addEventListener('touchstart', handleInput);
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.state.playing) this.ufo.targetY = e.clientY;
        });

        document.getElementById('btn-newgame').onclick = () => this.start(1);
        document.getElementById('win-next-btn').onclick = () => this.start(this.storage.data.level + 1);
        document.getElementById('pause-btn').onclick = () => this.endLevel(false);
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        
        document.getElementById('shop-btn-pause').onclick = () => {
            this.showScreen('shop-screen');
            this.renderShop();
        };
    },

    renderShop() {
        const list = document.getElementById('shop-content');
        list.innerHTML = '';
        document.getElementById('total-stars-display-shop').innerText = this.storage.data.stars;

        // Покупка жизней
        const lIdx = Math.min(this.storage.data.boughtLives, 4);
        const lPrice = PRICES.LIVES[lIdx];
        this.addShopItem(list, "LIFE SLOT +1", lPrice, this.storage.data.boughtLives >= 5, () => {
            if (this.storage.data.stars >= lPrice) {
                this.storage.data.stars -= lPrice;
                this.storage.data.boughtLives++;
                this.storage.save();
                this.renderShop();
            }
        });
    },

    addShopItem(parent, title, price, max, action) {
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `<div><b>${title}</b><br><small>⭐${price}</small></div>
            <button class="main-btn" ${max ? 'disabled' : ''}>${max ? 'MAX' : 'BUY'}</button>`;
        item.querySelector('button').onclick = action;
        parent.appendChild(item);
    }
};

// СТАРТ
window.onload = () => Game.init();
