// === ИНИЦИАЛИЗАЦИЯ ===
const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

// Настройки цен и параметров по GDD
const LIVES_PRICES = [150, 200, 300, 400, 500];
const UFO_PRICES = [0, 200, 300, 400, 500]; // 1-й бесплатно, 2-й за 200 и т.д.

const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98, lives: 1 },
    2: { thrust: 0.65, damping: 0.97, lives: 2 },
    3: { thrust: 0.75, damping: 0.96, lives: 3 },
    4: { thrust: 0.85, damping: 0.95, lives: 4 },
    5: { thrust: 1.00, damping: 0.94, lives: 5 }
};

// === STORAGE MANAGER (Ничего не теряем) ===
const StorageMgr = {
    key: 'zibbo_save_data',
    data: {
        stars: 0,
        currentUfo: 1,
        unlockedUfos: [1],
        boughtLives: 0, // сколько раз купили лот +1 Live
        level: 1
    },
    load() {
        const saved = localStorage.getItem(this.key);
        if (saved) {
            this.data = { ...this.data, ...JSON.parse(saved) };
        }
    },
    save() {
        localStorage.setItem(this.key, JSON.stringify(this.data));
    },
    addStars(count) {
        this.data.stars += count;
        this.save();
    }
};

// === SOUND & VIBRATION ===
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
        // Вибрация: 50мс на сбор, 150мс на удар
        if (navigator.vibrate) {
            if (name === 'hit') navigator.vibrate(150);
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
        this.updateButtons();
    },
    next() {
        this.current.pause();
        this.index = (this.index + 1) % this.tracks.length;
        this.current = new Audio(this.tracks[this.index]);
        this.current.loop = true;
        if (this.enabled) this.current.play();
        this.updateButtons();
    },
    updateButtons() {
        const text = this.enabled ? "NEXT TRACK" : "MUSIC OFF";
        ['btn-music-toggle', 'btn-modal-music'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.innerText = text;
        });
    }
};

// === GAME CORE ===
const Game = {
    canvas: document.getElementById('gameCanvas'),
    ctx: null,
    ufo: { x: 100, y: 300, vx: 0, vy: 0, angle: 0, targetY: 300, exitX: 0 },
    entities: [],
    bgStars: [],
    state: { 
        screen: 'splash', 
        playing: false, 
        timer: 60, 
        stars: 0, 
        lives: 1, 
        invul: 0,
        lastTime: 0 
    },

    init() {
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        StorageMgr.load();
        SoundMgr.init();
        MusicMgr.init();
        this.createStars();
        this.bindEvents();
        requestAnimationFrame((t) => this.loop(t));
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    createStars() {
        this.bgStars = Array.from({ length: 80 }, () => ({
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            s: Math.random() * 2 + 1,
            v: Math.random() * 2 + 0.5
        }));
    },

    bindEvents() {
        const touchHandler = (e) => {
            if (this.state.screen === 'waiting') {
                this.state.screen = 'playing';
                return;
            }
            if (this.state.screen === 'playing') {
                const y = e.touches ? e.touches[0].clientY : e.clientY;
                this.ufo.targetY = y;
            }
        };
        window.addEventListener('touchstart', touchHandler);
        window.addEventListener('mousedown', touchHandler);

        document.getElementById('btn-newgame').onclick = () => this.startLevel(1);
        document.getElementById('resume-btn').onclick = async () => {
            try {
                await AdMgr.showRewardAd();
                this.state.lives = 1;
                this.state.screen = 'waiting';
                this.closeMenus();
            } catch(e) { alert("Watch ad to resume!"); }
        };
        document.getElementById('btn-music-toggle').onclick = () => MusicMgr.toggle();
        document.getElementById('btn-modal-music').onclick = () => MusicMgr.enabled ? MusicMgr.next() : MusicMgr.toggle();
        document.getElementById('pause-btn').onclick = () => this.openMenu('PAUSED');
        document.getElementById('shop-btn-pause').onclick = () => this.openShop();
        document.getElementById('close-shop').onclick = () => this.openMenu('PAUSED');
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('win-next-btn').onclick = () => this.startLevel(StorageMgr.data.level + 1);
    },

    startLevel(lvl) {
        StorageMgr.data.level = lvl;
        StorageMgr.save();
        this.state.timer = 60;
        this.state.stars = 0;
        this.state.screen = 'waiting';
        this.state.playing = true;
        this.ufo.x = 80;
        this.ufo.exitX = 0;
        this.entities = [];
        
        // Расчет жизней: База + купленные слоты + бонус от корабля
        const shipBonus = SHIP_STATS[StorageMgr.data.currentUfo].lives - 1;
        this.state.lives = 1 + StorageMgr.data.boughtLives + shipBonus;
        
        this.closeMenus();
        document.getElementById('hud').classList.add('active');
        document.getElementById('current-lvl-display').innerText = lvl;
        this.updateHUD();
    },

    spawnEntity() {
        const isLast10 = this.state.timer <= 10;
        const isLast5 = this.state.timer <= 5;
        
        // Шансы спавна по GDD
        let starChance = isLast10 ? 0.15 : 0.08;
        let astChance = isLast5 ? 0 : (isLast10 ? 0.03 : 0.06);

        if (Math.random() < starChance) {
            // Процедурные паттерны для последних 10 сек
            if (isLast10 && Math.random() < 0.3) {
                this.spawnPattern();
            } else {
                this.entities.push(this.createEntity('star'));
            }
        }
        if (Math.random() < astChance) {
            this.entities.push(this.createEntity('asteroid'));
        }
    },

    spawnPattern() {
        const type = Math.random() > 0.5 ? 'sine' : 'butterfly';
        const startY = Math.random() * (this.canvas.height - 200) + 100;
        if (type === 'sine') {
            for(let i=0; i<8; i++) {
                this.entities.push({
                    type: 'star', x: this.canvas.width + i*40, 
                    y: startY + Math.sin(i*0.5)*50, r: 15
                });
            }
        } else {
            // "Бабочка" (кластер)
            for(let i=0; i<12; i++) {
                this.entities.push({
                    type: 'star', 
                    x: this.canvas.width + Math.random()*100, 
                    y: startY + (Math.random()-0.5)*150, r: 15
                });
            }
        }
    },

    createEntity(type) {
        return {
            type,
            x: this.canvas.width + 50,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: type === 'star' ? 15 : (Math.random() * 20 + 20),
            angle: 0,
            rotV: (Math.random() - 0.5) * 0.1,
            color: `hsl(${Math.random() * 360}, 30%, 80%)` // Пастельные тона
        };
    },

    update(dt) {
        if (this.state.screen !== 'playing') return;

        this.state.timer -= dt;
        if (this.state.timer <= 0) this.levelComplete();

        // UFO Physics
        const stats = SHIP_STATS[StorageMgr.data.currentUfo];
        let dy = this.ufo.targetY - (this.ufo.y + 20);
        this.ufo.vy += dy * stats.thrust * dt;
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.atan2(this.ufo.vy, 10) * 0.5;

        // Финальный рывок
        if (this.state.timer <= 0) {
            this.ufo.exitX += 15;
            if (this.ufo.x + this.ufo.exitX > this.canvas.width + 100) this.openMenu('WIN');
        }

        // Entities
        this.spawnEntity();
        this.entities.forEach((en, i) => {
            en.x -= (4 + StorageMgr.data.level * 0.5);
            if (en.type === 'asteroid') en.angle += en.rotV;
            
            // Collision
            let dx = (this.ufo.x + 30) - en.x;
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

        // Stars BG
        this.bgStars.forEach(s => {
            s.x -= s.v * (this.state.timer < 5 ? 10 : 1);
            if (s.x < 0) s.x = this.canvas.width;
        });
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Stars
        this.ctx.fillStyle = "white";
        const isBlur = this.state.timer < 10 && this.state.playing;
        this.bgStars.forEach(s => {
            this.ctx.beginPath();
            if (isBlur) {
                this.ctx.rect(s.x, s.y, s.s * 15, s.s);
            } else {
                this.ctx.arc(s.x, s.y, s.s, 0, Math.PI*2);
            }
            this.ctx.fill();
        });

        // Entities
        this.entities.forEach(en => {
            this.ctx.save();
            this.ctx.translate(en.x, en.y);
            if (en.type === 'star') {
                const s = 1 + Math.sin(Date.now()/200)*0.1; // Зум анимация звезды
                this.ctx.scale(s, s);
                const img = document.getElementById('star-img');
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
            } else {
                this.ctx.rotate(en.angle);
                const img = document.getElementById(en.r > 35 ? 'ast-b-img' : 'ast-s-img');
                // Накладываем пастельный оттенок
                this.ctx.globalCompositeOperation = 'source-atop';
                this.ctx.fillStyle = en.color;
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
            }
            this.ctx.restore();
        });

        // UFO (GIF ANIMATION FIX)
        if (this.state.screen !== 'splash') {
            const ufoImg = document.getElementById(`ufo-${StorageMgr.data.currentUfo}`);
            this.ctx.save();
            this.ctx.translate(this.ufo.x + 30 + this.ufo.exitX, this.ufo.y + 20);
            this.ctx.rotate(this.ufo.angle);
            if (Date.now() < this.state.invul) this.ctx.globalAlpha = 0.5;
            // Рисуем GIF. Браузер сам обновит кадр, так как мы вызываем отрисовку 60 раз в секунду
            this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
            this.ctx.restore();
        }

        if (this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "30px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TAP TO PLAY", this.canvas.width/2, this.canvas.height/2);
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
            const img = document.createElement('img');
            img.src = 'ufo_ship.png';
            if (i < this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    openMenu(type) {
        this.state.playing = false;
        const screen = document.getElementById('level-screen');
        const title = document.getElementById('level-title');
        const nextBtn = document.getElementById('win-next-btn');
        const resumeBtn = document.getElementById('resume-btn');
        
        title.innerText = type;
        nextBtn.style.display = (type === 'WIN') ? 'block' : 'none';
        resumeBtn.style.display = (type === 'CRASHED') ? 'block' : (type === 'WIN' ? 'none' : 'block');
        
        document.getElementById('level-stars').innerText = this.state.stars;
        screen.classList.add('active');
        MusicMgr.updateButtons();
    },

    levelComplete() {
        SoundMgr.play('level_done');
    },

    openShop() {
        this.closeMenus();
        const shop = document.getElementById('shop-screen');
        shop.classList.add('active');
        this.renderShop();
    },

    renderShop() {
        document.getElementById('total-stars-display-shop').innerText = StorageMgr.data.stars;
        const cont = document.getElementById('shop-content');
        cont.innerHTML = '';

        // Лот Жизни
        const lifeIdx = Math.min(StorageMgr.data.boughtLives, 4);
        const lifePrice = LIVES_PRICES[lifeIdx];
        this.addShopItem(cont, `LIFE SLOT +1`, `Price: ⭐${lifePrice}`, () => {
            if (StorageMgr.data.stars >= lifePrice && StorageMgr.data.boughtLives < 5) {
                StorageMgr.data.stars -= lifePrice;
                StorageMgr.data.boughtLives++;
                StorageMgr.save();
                this.renderShop();
            }
        }, lifePrice, StorageMgr.data.boughtLives >= 5);

        // Лот НЛО
        const nextUfo = StorageMgr.data.unlockedUfos.length + 1;
        if (nextUfo <= 5) {
            const ufoPrice = UFO_PRICES[nextUfo-1];
            this.addShopItem(cont, `UFO TYPE ${nextUfo}`, `Speed++ & +1 Live. Price: ⭐${ufoPrice}`, () => {
                if (StorageMgr.data.stars >= ufoPrice) {
                    StorageMgr.data.stars -= ufoPrice;
                    StorageMgr.data.unlockedUfos.push(nextUfo);
                    StorageMgr.data.currentUfo = nextUfo;
                    StorageMgr.save();
                    this.renderShop();
                }
            }, ufoPrice);
        }
    },

    addShopItem(container, title, desc, action, price, maxed = false) {
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.innerHTML = `
            <div>
                <div>${title}</div>
                <small style="color:#aaa">${desc}</small>
            </div>
            <button class="main-btn" style="min-width:80px; padding:5px 10px; font-size:0.8rem" 
                ${(StorageMgr.data.stars < price || maxed) ? 'disabled' : ''}>
                ${maxed ? 'MAX' : 'BUY'}
            </button>
        `;
        item.querySelector('button').onclick = action;
        container.appendChild(item);
    },

    closeMenus() {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    }
};

window.onload = () => Game.init();
