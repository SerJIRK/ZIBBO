// =============================================================================
// ОГЛАВЛЕНИЕ ZIBBO:
// //1. КОНФИГУРАЦИЯ (Баланс, цены, уровни)
// //2. СОХРАНЕНИЯ (LocalStorage)
// //3. ЗВУК И МУЗЫКА
// //4. МАГАЗИН (Экономика и апгрейды)
// //5. УРОВНИ (Настройка сложности)
// //6. ДВИЖОК (Физика и отрисовка)
// =============================================================================

// === //1. КОНФИГУРАЦИЯ ===
// Тут настраиваем "цифры" игры.
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

// === //2. СОХРАНЕНИЯ ===
const Storage = {
    data: { stars: 0, current: 1, unlocked: [1], boughtLives: 0, level: 1 },
    load() {
        const saved = localStorage.getItem('zibbo_save');
        if (saved) this.data = JSON.parse(saved);
    },
    save() {
        localStorage.setItem('zibbo_save', JSON.stringify(this.data));
    }
};

// === //3. ЗВУК И МУЗЫКА ===
const Sound = {
    enabled: true,
    files: {},
    init() {
        ['collect', 'hit', 'click', 'level_done'].forEach(s => {
            this.files[s] = new Audio(`${s}.ogg`);
        });
    },
    play(name) {
        if (!this.enabled) return;
        const s = this.files[name].cloneNode();
        s.volume = 0.5;
        s.play().catch(() => {});
    }
};

// === //4. МАГАЗИН ===
const Shop = {
    buyLife() {
        const price = CONFIG.PRICES.LIVES[Storage.data.boughtLives];
        if (Storage.data.stars >= price && Storage.data.boughtLives < 5) {
            Storage.data.stars -= price;
            Storage.data.boughtLives++;
            Storage.save();
            this.updateUI();
        }
    },
    updateUI() {
        // Обновление цен и кнопок в HTML магазине
        const starEl = document.getElementById('total-stars-display-shop');
        if (starEl) starEl.innerText = Storage.data.stars;
    }
};

// === //5. УРОВНИ ===
// Компактная настройка уровней. Здесь можно добавлять новые астероиды и фоны.
const LevelMgr = {
    getSettings(lvl) {
        return {
            speed: 4 + lvl * 0.5,
            spawnRate: 0.05 + lvl * 0.01,
            bg: 'galaxy_bg.png' // Сюда можно добавить логику смены фона
        };
    }
};

// === //6. ДВИЖОК ИГРЫ ===
const Game = {
    canvas: document.getElementById('gameCanvas'),
    ctx: null,
    ufo: { x: 80, y: 300, vy: 0, targetY: 300, angle: 0, exitX: 0 },
    entities: [],
    state: { screen: 'splash', playing: false, timer: 60, score: 0, lives: 1, lastTime: 0, invul: 0 },

    init() {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        Storage.load();
        Sound.init();
        this.bindEvents();
        
        // Скрываем все экраны и показываем только Splash
        this.showScreen('splash-screen');
        
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    start(lvl = 1) {
        Storage.data.level = lvl;
        this.state.timer = 60;
        this.state.score = 0;
        this.state.playing = true;
        this.state.screen = 'waiting';
        this.ufo.exitX = 0;
        this.entities = [];
        
        // Считаем жизни: Базовая 1 + Купленные + Бонус (если есть)
        this.state.lives = 1 + Storage.data.boughtLives;

        this.showScreen('hud'); 
        document.getElementById('hud').classList.add('active');
        this.updateHUD();
    },

    spawn() {
        if (Math.random() < 0.05) this.addEntity('star');
        if (this.state.timer > 10 && Math.random() < 0.04) this.addEntity('asteroid');
    },

    addEntity(type) {
        this.entities.push({
            type,
            x: this.canvas.width + 50,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: type === 'star' ? 15 : (Math.random() * 15 + 20),
            angle: 0,
            rotV: (Math.random() - 0.5) * 0.1
        });
    },

    update(dt) {
        if (!this.state.playing || this.state.screen === 'waiting') return;

        this.state.timer -= dt;
        
        // Конец уровня
        if (this.state.timer <= 0) {
            if (this.ufo.exitX === 0) Sound.play('level_done');
            this.ufo.exitX += 10;
            if (this.ufo.x + this.ufo.exitX > this.canvas.width + 100) this.win();
        }

        // Физика НЛО
        const stats = CONFIG.SHIP_STATS[Storage.data.current];
        let dy = this.ufo.targetY - (this.ufo.y + 20);
        this.ufo.vy += dy * stats.thrust * dt;
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.atan2(this.ufo.vy, 20) * 0.5;

        this.spawn();

        this.entities.forEach((en, i) => {
            en.x -= LevelMgr.getSettings(Storage.data.level).speed;
            en.angle += en.rotV;

            // Коллизия
            let dx = (this.ufo.x + 30 + this.ufo.exitX) - en.x;
            let dy = (this.ufo.y + 20) - en.y;
            let d = Math.sqrt(dx*dx + dy*dy);

            if (d < en.r + 20) {
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
                    if (this.state.lives <= 0) this.gameOver();
                }
            }
            if (en.x < -100) this.entities.splice(i, 1);
        });
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // В конце уровня делаем блюр
        if (this.state.timer < 5 && this.state.playing) {
            let b = 5 - this.state.timer;
            this.ctx.filter = `blur(${b}px)`;
        } else {
            this.ctx.filter = 'none';
        }

        // Отрисовка сущностей
        this.entities.forEach(en => {
            const imgId = en.type === 'star' ? 'star-img' : (en.r > 30 ? 'ast-b-img' : 'ast-s-img');
            const img = document.getElementById(imgId);
            if (img) {
                this.ctx.save();
                this.ctx.translate(en.x, en.y);
                this.ctx.rotate(en.angle);
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
                this.ctx.restore();
            }
        });

        // Отрисовка НЛО
        if (this.state.playing || this.state.screen === 'waiting') {
            const ufoImg = document.getElementById(`ufo-${Storage.data.current}`);
            if (ufoImg) {
                this.ctx.save();
                this.ctx.translate(this.ufo.x + 30 + this.ufo.exitX, this.ufo.y + 20);
                this.ctx.rotate(this.ufo.angle);
                if (Date.now() < this.state.invul) this.ctx.globalAlpha = 0.5;
                this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
                this.ctx.restore();
            }
        }
    },

    loop(t) {
        const dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(isNaN(dt) ? 0 : dt);
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    },

    updateHUD() {
        document.getElementById('game-score').innerText = this.state.score;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timer);
        document.getElementById('current-lvl-display').innerText = Storage.data.level;
        
        // Отрисовка точек жизней
        const container = document.getElementById('lives-bar');
        if (container) {
            container.innerHTML = '';
            for(let i=0; i<this.state.lives; i++) {
                const d = document.createElement('div');
                d.className = 'life-dot on';
                container.appendChild(d);
            }
        }
    },

    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) target.classList.add('active');
    },

    win() {
        this.state.playing = false;
        Storage.save();
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = "LEVEL DONE";
        document.getElementById('win-next-btn').style.display = 'block';
    },

    gameOver() {
        this.state.playing = false;
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = "GAME OVER";
        document.getElementById('win-next-btn').style.display = 'none';
    },

    bindEvents() {
        // Управление
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

        // Кнопки
        document.getElementById('btn-newgame').onclick = () => this.start(1);
        document.getElementById('pause-btn').onclick = () => this.showScreen('level-screen');
        document.getElementById('shop-btn-pause').onclick = () => {
            this.showScreen('shop-screen');
            Shop.updateUI();
        };
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('win-next-btn').onclick = () => this.start(Storage.data.level + 1);
    }
};

window.onload = () => Game.init();
