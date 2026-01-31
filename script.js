// =============================================================================
// //1. МАГАЗИН И ЭКОНОМИКА
// Настройка цен по GDD. Цены на жизни: 150, 200, 300, 400, 500.
// Корабли открываются по очереди. Каждый дает +1 к макс. жизням.
// =============================================================================

const CONFIG = {
    PRICES: {
        LIVES: [150, 200, 300, 400, 500],
        UFO: [0, 200, 300, 400, 500]
    },
    SHIP_STATS: {
        1: { thrust: 0.55, damping: 0.98 },
        2: { thrust: 0.65, damping: 0.97 },
        3: { thrust: 0.75, damping: 0.96 },
        4: { thrust: 0.85, damping: 0.95 },
        5: { thrust: 1.00, damping: 0.94 }
    }
};

// === //2. СИСТЕМА УРОВНЕЙ ===
// Здесь можно тонко настраивать сложность.
const LevelMgr = {
    get(lvl) {
        return {
            speed: 4 + (lvl * 0.4),      // Скорость астероидов
            spawnChance: 0.05 + (lvl * 0.005), // Частота появления
            duration: 60                 // Секунд на уровень
        };
    }
};

// === //3. СОХРАНЕНИЯ ===
const Storage = {
    data: { stars: 0, currentUfo: 1, unlockedUfos: [1], boughtLives: 0, level: 1 },
    load() {
        const saved = localStorage.getItem('zibbo_save');
        if (saved) this.data = JSON.parse(saved);
    },
    save() {
        localStorage.setItem('zibbo_save', JSON.stringify(this.data));
    }
};

// === //4. ЗВУКОВОЙ ДВИЖОК ===
const Sound = {
    enabled: true,
    files: {},
    init() {
        ['collect', 'hit', 'click', 'level_done'].forEach(s => {
            this.files[s] = new Audio(`${s}.ogg`);
            this.files[s].volume = 0.5;
        });
    },
    play(name) {
        if (!this.enabled || !this.files[name]) return;
        const s = this.files[name].cloneNode();
        s.play().catch(() => {});
    }
};

// === //5. ЯДРО ИГРЫ (ENGINE) ===
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
        Storage.load();
        Sound.init();
        this.createStars();
        this.bindEvents();
        
        // Показываем стартовый экран
        this.showUI('splash-screen');
        
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createStars() {
        this.bgStars = Array.from({ length: 80 }, () => ({
            x: Math.random() * innerWidth,
            y: Math.random() * innerHeight,
            s: Math.random() * 2 + 1,
            v: Math.random() * 2 + 0.5
        }));
    },

    start(lvl = 1) {
        const settings = LevelMgr.get(lvl);
        this.state.timer = settings.duration;
        this.state.score = 0;
        this.state.screen = 'waiting'; // Режим "Tap to start"
        this.state.playing = true;
        this.ufo.exitX = 0;
        this.ufo.y = innerHeight / 2;
        this.entities = [];
        
        // Расчет жизней: 1 базовая + за магазин + за модель корабля (индекс корабля - 1)
        this.state.lives = 1 + Storage.data.boughtLives + (Storage.data.currentUfo - 1);

        this.showUI('hud');
        this.updateHUD();
    },

    spawn(dt) {
        const settings = LevelMgr.get(Storage.data.level);
        // Звезды чаще в конце уровня
        const starMod = this.state.timer < 10 ? 2 : 1;
        
        if (Math.random() < settings.spawnChance * starMod) this.addEntity('star');
        // Астероиды пропадают в последние 5 секунд
        if (this.state.timer > 5 && Math.random() < settings.spawnChance * 0.8) {
            this.addEntity('asteroid');
        }
    },

    addEntity(type) {
        const isBig = Math.random() > 0.7;
        this.entities.push({
            type,
            x: this.canvas.width + 100,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: type === 'star' ? 18 : (isBig ? 40 : 22),
            angle: 0,
            rotV: (Math.random() - 0.5) * 0.1,
            pulse: 0
        });
    },

    update(dt) {
        if (!this.state.playing || this.state.screen === 'waiting') return;

        this.state.timer -= dt;

        // Физика НЛО
        const stats = CONFIG.SHIP_STATS[Storage.data.currentUfo];
        let dy = this.ufo.targetY - (this.ufo.y + 20);
        this.ufo.vy += dy * stats.thrust * dt;
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.atan2(this.ufo.vy, 25) * 0.6;

        // Финал уровня
        if (this.state.timer <= 0) {
            if (this.ufo.exitX === 0) Sound.play('level_done');
            this.ufo.exitX += 12; // Улетаем!
            if (this.ufo.x + this.ufo.exitX > this.canvas.width + 100) this.endLevel(true);
        }

        this.spawn(dt);

        // Обновление объектов
        const moveSpeed = LevelMgr.get(Storage.data.level).speed;
        this.entities.forEach((en, i) => {
            en.x -= moveSpeed;
            en.angle += en.rotV;
            en.pulse += 0.1;

            // Коллизии
            let dx = (this.ufo.x + 30 + this.ufo.exitX) - en.x;
            let dy = (this.ufo.y + 20) - en.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < en.r + 15) {
                if (en.type === 'star') {
                    this.state.score++;
                    Storage.data.stars++;
                    Sound.play('collect');
                    this.entities.splice(i, 1);
                    this.updateHUD();
                } else if (Date.now() > this.state.invul) {
                    this.state.lives--;
                    this.state.invul = Date.now() + 2000;
                    Sound.play('hit');
                    this.updateHUD();
                    if (this.state.lives <= 0) this.endLevel(false);
                }
            }
            if (en.x < -100) this.entities.splice(i, 1);
        });

        // Фон звезд
        this.bgStars.forEach(s => {
            s.x -= s.v * (this.state.timer < 0 ? 10 : 1);
            if (s.x < 0) s.x = this.canvas.width;
        });
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Эффект Blur в конце
        if (this.state.timer < 5 && this.state.playing) {
            this.ctx.filter = `blur(${Math.max(0, 5 - this.state.timer)}px)`;
        } else {
            this.ctx.filter = 'none';
        }

        // Звезды фона
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        this.bgStars.forEach(s => {
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.s, 0, Math.PI*2);
            this.ctx.fill();
        });

        // Отрисовка сущностей
        this.entities.forEach(en => {
            const imgId = en.type === 'star' ? 'star-img' : (en.r > 35 ? 'ast-b-img' : 'ast-s-img');
            const img = document.getElementById(imgId);
            if (img) {
                this.ctx.save();
                this.ctx.translate(en.x, en.y);
                this.ctx.rotate(en.angle);
                // Пульсация для звезд
                if (en.type === 'star') {
                    let s = 1 + Math.sin(en.pulse) * 0.1;
                    this.ctx.scale(s, s);
                }
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
                this.ctx.restore();
            }
        });

        // НЛО
        if (this.state.playing || this.state.screen === 'waiting') {
            const ufoImg = document.getElementById(`ufo-${Storage.data.currentUfo}`);
            if (ufoImg) {
                this.ctx.save();
                this.ctx.translate(this.ufo.x + 30 + this.ufo.exitX, this.ufo.y + 20);
                this.ctx.rotate(this.ufo.angle);
                if (Date.now() < this.state.invul) {
                    this.ctx.globalAlpha = Math.sin(Date.now() / 50) * 0.3 + 0.6;
                }
                this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
                this.ctx.restore();
            }
        }
    },

    loop(t) {
        const dt = Math.min((t - this.state.lastTime) / 1000, 0.1);
        this.state.lastTime = t;
        this.update(dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    },

    updateHUD() {
        document.getElementById('game-score').innerText = this.state.score;
        document.getElementById('game-timer').innerText = Math.max(0, Math.ceil(this.state.timer));
        document.getElementById('current-lvl-display').innerText = Storage.data.level;
        
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

    showUI(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) target.classList.add('active');
    },

    endLevel(win) {
        this.state.playing = false;
        Storage.save();
        this.showUI('level-screen');
        document.getElementById('level-title').innerText = win ? "LEVEL DONE" : "CRASHED";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('win-next-btn').style.display = win ? 'block' : 'none';
    },

    bindEvents() {
        const input = (e) => {
            if (this.state.screen === 'waiting') this.state.screen = 'playing';
            const y = e.touches ? e.touches[0].clientY : e.clientY;
            this.ufo.targetY = y;
        };
        this.canvas.addEventListener('mousedown', input);
        this.canvas.addEventListener('touchstart', input);
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.state.playing) this.ufo.targetY = e.clientY;
        });

        document.getElementById('btn-newgame').onclick = () => this.start(1);
        document.getElementById('win-next-btn').onclick = () => {
            Storage.data.level++;
            this.start(Storage.data.level);
        };
        document.getElementById('pause-btn').onclick = () => this.endLevel(false);
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        
        // Магазин
        document.getElementById('shop-btn-pause').onclick = () => {
            this.showUI('shop-screen');
            this.renderShop();
        };
    },

    renderShop() {
        document.getElementById('total-stars-display-shop').innerText = Storage.data.stars;
        const list = document.getElementById('shop-content');
        list.innerHTML = '';
        
        // Слот жизни
        const lifeIdx = Math.min(Storage.data.boughtLives, 4);
        const lPrice = CONFIG.PRICES.LIVES[lifeIdx];
        this.addShopItem(list, "LIFE SLOT +1", lPrice, Storage.data.boughtLives >= 5, () => {
            if (Storage.data.stars >= lPrice) {
                Storage.data.stars -= lPrice;
                Storage.data.boughtLives++;
                Storage.save();
                this.renderShop();
            }
        });
    },

    addShopItem(parent, title, price, max, action) {
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `<div><b>${title}</b><br><small>Cost: ⭐${price}</small></div>
            <button class="main-btn" ${max || Storage.data.stars < price ? 'disabled' : ''}>${max ? 'MAX' : 'BUY'}</button>`;
        item.querySelector('button').onclick = action;
        parent.appendChild(item);
    }
};

window.onload = () => Game.init();
