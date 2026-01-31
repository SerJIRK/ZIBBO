// =============================================================================
// ОГЛАВЛЕНИЕ:
// 1. КОНФИГУРАЦИЯ И БАЛАНС (Настройка цен, скоростей и уровней)
// 2. СИСТЕМА СОХРАНЕНИЯ (LocalStorage)
// 3. ЗВУК И МУЗЫКА (Менеджеры аудио и вибрации)
// 4. ЯДРО ИГРЫ (Физика, Отрисовка, Анимации)
// 5. МАГАЗИН (Логика покупок и апгрейдов)
// 6. ИНТЕРФЕЙС И СОБЫТИЯ (Обработка кликов и меню)
// =============================================================================

// === [БЛОК 1: КОНФИГУРАЦИЯ И БАЛАНС] ===
// Здесь можно менять сложность игры и цены без правки основного кода.
const CONFIG = {
    LIVES_PRICES: [150, 200, 300, 400, 500], // Цены за дополнительные слоты жизней
    UFO_PRICES: [0, 200, 300, 400, 500],   // Цены за новые корабли
    LEVEL_TIME: 60,                        // Длительность уровня в секундах
    SHIP_STATS: {
        1: { thrust: 0.55, damping: 0.98, bonusLives: 0 },
        2: { thrust: 0.65, damping: 0.97, bonusLives: 1 },
        3: { thrust: 0.75, damping: 0.96, bonusLives: 2 },
        4: { thrust: 0.85, damping: 0.95, bonusLives: 3 },
        5: { thrust: 1.00, damping: 0.94, bonusLives: 4 }
    }
};

// === [БЛОК 2: СИСТЕМА СОХРАНЕНИЯ] ===
// Отвечает за то, чтобы звезды и прогресс не пропадали после закрытия вкладки.
const StorageMgr = {
    key: 'zibbo_v1_save',
    data: { stars: 0, currentUfo: 1, unlockedUfos: [1], boughtLives: 0, level: 1 },
    load() {
        const saved = localStorage.getItem(this.key);
        if (saved) this.data = { ...this.data, ...JSON.parse(saved) };
    },
    save() { localStorage.setItem(this.key, JSON.stringify(this.data)); },
    addStars(n) { this.data.stars += n; this.save(); }
};

// === [БЛОК 3: ЗВУК И МУЗЫКА] ===
// Управляет всеми аудио-эффектами и вибрацией смартфона.
const SoundMgr = {
    enabled: false,
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
        if (navigator.vibrate) { // Вибрация для погружения
            if (name === 'hit') navigator.vibrate(100);
            if (name === 'collect') navigator.vibrate(30);
        }
    }
};

const MusicMgr = {
    enabled: false,
    tracks: ['track1.ogg', 'track2.ogg', 'track3.ogg'],
    index: 0,
    current: null,
    init() {
        this.current = new Audio(this.tracks[this.index]);
        this.current.loop = true;
    },
    toggle() {
        this.enabled = !this.enabled;
        this.enabled ? this.current.play() : this.current.pause();
        this.updateUI();
    },
    next() {
        this.current.pause();
        this.index = (this.index + 1) % this.tracks.length;
        this.current = new Audio(this.tracks[this.index]);
        this.current.loop = true;
        if (this.enabled) this.current.play();
        this.updateUI();
    },
    updateUI() {
        const txt = this.enabled ? "NEXT TRACK" : "MUSIC OFF";
        const btn = document.getElementById('next-track-btn');
        if (btn) btn.innerText = txt;
    }
};

// === [БЛОК 4: ЯДРО ИГРЫ] ===
// Математика полета, отрисовка на Canvas и анимации.
const Game = {
    canvas: document.getElementById('gameCanvas'),
    ctx: null,
    ufo: { x: 80, y: 300, vx: 0, vy: 0, angle: 0, targetY: 300, exitX: 0 },
    entities: [],
    starsBG: [],
    state: { screen: 'splash', playing: false, timer: 60, stars: 0, lives: 1, invul: 0, lastTime: 0 },

    init() {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        StorageMgr.load();
        SoundMgr.init();
        MusicMgr.init();
        this.createStarsBG();
        this.bindEvents();
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createStarsBG() {
        this.starsBG = Array.from({ length: 100 }, () => ({
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            size: Math.random() * 2,
            speed: Math.random() * 2 + 0.5
        }));
    },

    startLevel(lvl) {
        StorageMgr.data.level = lvl;
        this.state.timer = CONFIG.LEVEL_TIME;
        this.state.stars = 0;
        this.state.screen = 'waiting';
        this.state.playing = true;
        this.ufo.x = 80;
        this.ufo.exitX = 0;
        this.entities = [];
        // Расчет жизней: 1 (базовая) + купленные слоты + бонус корабля
        const shipBonus = CONFIG.SHIP_STATS[StorageMgr.data.currentUfo].bonusLives;
        this.state.lives = 1 + StorageMgr.data.boughtLives + shipBonus;
        
        this.hideScreens();
        document.getElementById('hud').classList.add('active');
        this.updateHUD();
    },

    spawn() {
        const isEnding = this.state.timer < 10;
        // Шансы появления объектов
        if (Math.random() < (isEnding ? 0.15 : 0.07)) this.addEntity('star');
        if (!isEnding && Math.random() < 0.05) this.addEntity('asteroid');
    },

    addEntity(type) {
        this.entities.push({
            type,
            x: this.canvas.width + 50,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: type === 'star' ? 15 : (Math.random() * 20 + 20),
            angle: 0,
            rotV: (Math.random() - 0.5) * 0.1,
            pulse: Math.random() * Math.PI
        });
    },

    update(dt) {
        if (this.state.screen !== 'playing') return;

        this.state.timer -= dt;
        if (this.state.timer <= 0 && this.ufo.exitX === 0) SoundMgr.play('level_done');

        // Физика НЛО
        const stats = CONFIG.SHIP_STATS[StorageMgr.data.currentUfo];
        let dy = this.ufo.targetY - (this.ufo.y + 20);
        this.ufo.vy += dy * stats.thrust * dt;
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.atan2(this.ufo.vy, 15) * 0.6;

        // Финал уровня (улет вправо)
        if (this.state.timer <= 0) {
            this.ufo.exitX += 10;
            if (this.ufo.x + this.ufo.exitX > this.canvas.width + 100) this.openMenu('WIN');
        }

        this.spawn();
        this.entities.forEach((en, i) => {
            en.x -= (4 + StorageMgr.data.level * 0.4);
            en.angle += en.rotV;
            en.pulse += 0.05;

            // Коллизии
            let dx = (this.ufo.x + 30 + this.ufo.exitX) - en.x;
            let dy = (this.ufo.y + 20) - en.y;
            let dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < en.r + 20) {
                if (en.type === 'star') {
                    this.state.stars++;
                    StorageMgr.addStars(1);
                    SoundMgr.play('collect');
                    this.entities.splice(i, 1);
                    this.updateHUD();
                } else if (Date.now() > this.state.invul) {
                    this.state.lives--;
                    this.state.invul = Date.now() + 2000;
                    SoundMgr.play('hit');
                    this.updateHUD();
                    if (this.state.lives <= 0) this.openMenu('CRASHED');
                }
            }
            if (en.x < -100) this.entities.splice(i, 1);
        });

        this.starsBG.forEach(s => {
            s.x -= s.speed * (this.state.timer < 5 ? 8 : 1);
            if (s.x < 0) s.x = this.canvas.width;
        });
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Размытие в конце уровня
        if (this.state.timer < 5 && this.state.playing) {
            this.ctx.filter = `blur(${5 - this.state.timer}px)`;
        } else {
            this.ctx.filter = 'none';
        }

        // Фон звезд
        this.ctx.fillStyle = "white";
        this.starsBG.forEach(s => {
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
            this.ctx.fill();
        });

        // Объекты
        this.entities.forEach(en => {
            this.ctx.save();
            this.ctx.translate(en.x, en.y);
            this.ctx.rotate(en.angle);
            let s = 1 + Math.sin(en.pulse) * 0.1; // Пульсация
            this.ctx.scale(s, s);
            
            const img = document.getElementById(en.type === 'star' ? 'star-img' : (en.r > 35 ? 'ast-b-img' : 'ast-s-img'));
            if (img) this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
            this.ctx.restore();
        });

        // НЛО (GIF Фикс)
        if (this.state.screen !== 'splash') {
            const ufoImg = document.getElementById(`ufo-${StorageMgr.data.currentUfo}`);
            this.ctx.save();
            this.ctx.translate(this.ufo.x + 30 + this.ufo.exitX, this.ufo.y + 20);
            this.ctx.rotate(this.ufo.angle);
            if (Date.now() < this.state.invul) this.ctx.globalAlpha = 0.5;
            this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
            this.ctx.restore();
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
        document.getElementById('game-score').innerText = this.state.stars;
        document.getElementById('game-timer').innerText = Math.max(0, Math.ceil(this.state.timer));
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        for(let i=0; i<10; i++) {
            const dot = document.createElement('div');
            dot.className = i < this.state.lives ? 'life-dot on' : 'life-dot';
            bar.appendChild(dot);
        }
    },

    openMenu(type) {
        this.state.playing = false;
        const menu = document.getElementById('level-screen'); // Используем твой ID из index-2.html
        document.getElementById('level-title').innerText = type;
        document.getElementById('level-stars').innerText = this.state.stars;
        menu.classList.add('active');
        
        // Показываем кнопку NEXT LEVEL только при победе
        document.getElementById('win-next-btn').style.display = (type === 'WIN') ? 'block' : 'none';
    },

    hideScreens() {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
    },

    bindEvents() {
        const input = (e) => {
            if (this.state.screen === 'waiting') this.state.screen = 'playing';
            this.ufo.targetY = e.touches ? e.touches[0].clientY : e.clientY;
        };
        this.canvas.addEventListener('touchstart', input);
        this.canvas.addEventListener('mousedown', input);
        this.canvas.addEventListener('mousemove', (e) => { if(this.state.playing) this.ufo.targetY = e.clientY; });

        // Кнопки из твоего index-2.html
        document.getElementById('btn-newgame').onclick = () => this.startLevel(1);
        document.getElementById('pause-btn').onclick = () => this.openMenu('PAUSE');
        document.getElementById('next-track-btn').onclick = () => MusicMgr.enabled ? MusicMgr.next() : MusicMgr.toggle();
        document.getElementById('shop-btn-pause').onclick = () => Shop.open();
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('win-next-btn').onclick = () => this.startLevel(StorageMgr.data.level + 1);
        
        // Реклама (Revive)
        document.getElementById('resume-btn').onclick = async () => {
            try {
                await AdMgr.showRewardAd(); // Используем твой файл ads.js
                this.state.lives = 1;
                this.state.screen = 'waiting';
                this.hideScreens();
            } catch(e) { alert("Смотри рекламу для продолжения!"); }
        };
    }
};

// === [БЛОК 5: МАГАЗИН] ===
const Shop = {
    open() {
        Game.hideScreens();
        document.getElementById('shop-screen').classList.add('active');
        this.render();
    },
    render() {
        document.getElementById('total-stars-display-shop').innerText = StorageMgr.data.stars;
        const list = document.getElementById('shop-content');
        list.innerHTML = '';

        // Лот: Слоты жизней
        const lifeIdx = Math.min(StorageMgr.data.boughtLives, 4);
        const lPrice = CONFIG.LIVES_PRICES[lifeIdx];
        this.addItem(list, `LIFE SLOT +1`, `Cost: ⭐${lPrice}`, () => {
            if(StorageMgr.data.stars >= lPrice && StorageMgr.data.boughtLives < 5) {
                StorageMgr.data.stars -= lPrice;
                StorageMgr.data.boughtLives++;
                StorageMgr.save(); this.render();
            }
        }, lPrice, StorageMgr.data.boughtLives >= 5);

        // Лот: Корабли
        const nextUfo = StorageMgr.data.unlockedUfos.length + 1;
        if(nextUfo <= 5) {
            const uPrice = CONFIG.UFO_PRICES[nextUfo-1];
            this.addItem(list, `UFO TYPE ${nextUfo}`, `Power up! Cost: ⭐${uPrice}`, () => {
                if(StorageMgr.data.stars >= uPrice) {
                    StorageMgr.data.stars -= uPrice;
                    StorageMgr.data.unlockedUfos.push(nextUfo);
                    StorageMgr.data.currentUfo = nextUfo;
                    StorageMgr.save(); this.render();
                }
            }, uPrice);
        }
    },
    addItem(parent, title, desc, action, price, max = false) {
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `<div><b>${title}</b><br><small>${desc}</small></div>
            <button class="main-btn" ${StorageMgr.data.stars < price || max ? 'disabled' : ''} style="width:80px">
                ${max ? 'MAX' : 'BUY'}
            </button>`;
        item.querySelector('button').onclick = action;
        parent.appendChild(item);
    }
};

window.onload = () => Game.init();
