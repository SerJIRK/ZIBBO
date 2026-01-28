/**
 * ZIBBO: Space Journey - Core Engine
 * Final Fix: Syncing with HTML IDs and Assets
 */

const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

const ADS_BLOCK_ID = "9a1dea9f8d134730875d57f334be6f6e";
const AdController = window.Adsgram?.init({ blockId: ADS_BLOCK_ID });

const SETTINGS = {
    gravity: 0.25,
    thrust: -0.6,
    friction: 0.98,
    levelTime: 60,
    baseSpeed: 3.5,
    galaxySpeed: 10,
    invulnerabilityTime: 2000
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const Storage = {
    data: { stars: 0, unlockedShips: [1], currentShip: 1, lifeUpgrades: 0, level: 1 },
    load() {
        const saved = localStorage.getItem('zibbo_save_v1');
        if (saved) { try { this.data = JSON.parse(saved); } catch(e) {} }
        this.updateUI();
    },
    save() {
        localStorage.setItem('zibbo_save_v1', JSON.stringify(this.data));
        this.updateUI();
    },
    updateUI() {
        // Синхронизация с твоими ID в HTML
        const total = document.getElementById('total-stars-display');
        const shop = document.getElementById('shop-balance');
        if(total) total.innerText = this.data.stars;
        if(shop) shop.innerText = this.data.stars;
        
        // Обновляем превью корабля на главном экране
        const preview = document.getElementById('splash-ufo-preview');
        if(preview) preview.src = `ufo_ship${this.data.currentShip > 1 ? this.data.currentShip : ''}.png`;
    },
    getMaxLives() { return 1 + this.data.lifeUpgrades + (this.data.unlockedShips.length - 1); }
};

const AudioMgr = {
    sounds: { hit: new Audio('hit.ogg'), collect: new Audio('collect.ogg'), click: new Audio('button_click.ogg') },
    play(name) {
        const s = this.sounds[name];
        if (s && s.readyState >= 2) { s.currentTime = 0; s.play().catch(() => {}); }
    }
};

const Assets = {
    ships: {
        1: document.getElementById('ufo-1'),
        2: document.getElementById('ufo-2'),
        3: document.getElementById('ufo-3'),
        4: document.getElementById('ufo-4'),
        5: document.getElementById('ufo-5'),
    },
    galaxy: document.getElementById('galaxy-bg'),
    star: document.getElementById('star-img'),
    astS: document.getElementById('ast-s-img'),
    astB: document.getElementById('ast-b-img')
};

const Shop = {
    items: [
        { type: 'life', cost: 100, id: 'l1', name: '+1 Max Life' },
        { type: 'life', cost: 200, id: 'l2', name: '+1 Max Life' },
        { type: 'ship', cost: 300, id: 2, name: 'Speeder UFO' },
        { type: 'ship', cost: 400, id: 3, name: 'Tank UFO' },
        { type: 'ship', cost: 400, id: 4, name: 'Neon UFO' },
        { type: 'ship', cost: 500, id: 5, name: 'Golden UFO' }
    ],
    render() {
        const container = document.getElementById('shop-content');
        if(!container) return;
        container.innerHTML = '';
        this.items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'shop-item';
            let isBought = item.type === 'life' ? 
                (Storage.data.lifeUpgrades >= parseInt(item.id.replace('l',''))) : 
                Storage.data.unlockedShips.includes(item.id);
            let isEquipped = (item.type === 'ship' && Storage.data.currentShip === item.id);
            
            const imgPath = item.type === 'ship' ? `ufo_ship${item.id > 1 ? item.id : ''}.png` : 'star_pickup.png';
            el.innerHTML = `
                <img src="${imgPath}">
                <div>${item.name}</div>
                <button class="buy-btn ${isEquipped ? 'equip' : ''}" ${isEquipped || (isBought && item.type==='life') ? 'disabled' : ''}>
                    ${isEquipped ? 'READY' : (isBought ? (item.type==='ship' ? 'USE' : 'OWNED') : item.cost + ' ⭐')}
                </button>
            `;
            el.querySelector('button').onclick = () => this.buy(item);
            container.appendChild(el);
        });
    },
    buy(item) {
        AudioMgr.play('click');
        if (item.type === 'ship') {
            if (Storage.data.unlockedShips.includes(item.id)) { Storage.data.currentShip = item.id; }
            else if (Storage.data.stars >= item.cost) {
                Storage.data.stars -= item.cost;
                Storage.data.unlockedShips.push(item.id);
                Storage.data.currentShip = item.id;
            }
        } else if (item.type === 'life' && Storage.data.stars >= item.cost) {
            Storage.data.stars -= item.cost;
            Storage.data.lifeUpgrades++;
        }
        Storage.save(); this.render();
    }
};

const Game = {
    state: { screen: 'splash', width: 0, height: 0, score: 0, lives: 1, level: 1, timeLeft: 60, gameSpeed: 0, lastTime: 0, invulnerableUntil: 0, galaxyOffset: 0 },
    ufo: { x: 50, y: 0, w: 80, h: 61, vy: 0, angle: 0, thrusting: false },
    entities: [],
    starsBg: [],

    init() {
        Storage.load();
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Управление
        const start = (e) => { if(this.state.screen === 'playing') this.ufo.thrusting = true; if(e.cancelable) e.preventDefault(); };
        const end = () => this.ufo.thrusting = false;
        canvas.addEventListener('mousedown', start);
        window.addEventListener('mouseup', end);
        canvas.addEventListener('touchstart', start, {passive: false});
        window.addEventListener('touchend', end);

        // Кнопки
        document.getElementById('play-btn').onclick = () => this.startLevel(Storage.data.level);
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('continue-btn').onclick = () => {
            if(this.state.screen === 'paused') this.togglePause();
            else this.startLevel(this.state.level + 1);
        };
        document.getElementById('retry-btn').onclick = () => this.startLevel(this.state.level);
        document.getElementById('home-btn').onclick = () => this.showScreen('splash');
        document.getElementById('shop-btn-main').onclick = () => { this.showScreen('shop'); Shop.render(); };
        document.getElementById('shop-btn-level').onclick = () => { this.showScreen('shop'); Shop.render(); };
        document.getElementById('close-shop').onclick = () => this.showScreen(this.state.score > 0 ? 'level-screen' : 'splash');

        requestAnimationFrame(t => this.loop(t));
    },

    resize() {
        this.state.width = window.innerWidth;
        this.state.height = window.innerHeight;
        canvas.width = this.state.width;
        canvas.height = this.state.height;
    },

    startLevel(lvl) {
        this.state.level = lvl;
        this.state.score = 0;
        this.state.timeLeft = SETTINGS.levelTime;
        this.state.lives = Storage.getMaxLives();
        this.state.gameSpeed = SETTINGS.baseSpeed + (lvl * 0.1);
        this.state.screen = 'playing';
        this.state.galaxyOffset = 0;
        this.ufo.y = this.state.height / 2;
        this.ufo.vy = 0;
        this.entities = [];
        this.showScreen('hud');
        document.getElementById('pause-btn').classList.add('visible');
    },

    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            this.showScreen('level-screen');
            document.getElementById('level-title').innerText = "PAUSED";
        } else if (this.state.screen === 'paused') {
            this.state.screen = 'playing';
            this.showScreen('hud');
        }
    },

    update(dt) {
        if (this.state.screen !== 'playing') return;
        this.state.timeLeft -= dt;
        if (this.state.timeLeft <= 0) return this.levelComplete();

        if (this.ufo.thrusting) this.ufo.vy += SETTINGS.thrust;
        this.ufo.vy += SETTINGS.gravity;
        this.ufo.vy *= SETTINGS.friction;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle += (Math.max(-0.4, Math.min(0.4, this.ufo.vy * 0.08)) - this.ufo.angle) * 0.1;

        if (this.ufo.y < 0) this.ufo.y = 0;
        if (this.ufo.y + this.ufo.h > this.state.height) this.hitPlayer();

        this.state.galaxyOffset += (this.state.gameSpeed * 0.2);

        // Спавн
        if (Math.random() < 0.03) this.entities.push({ type: 'star', x: this.state.width + 50, y: Math.random() * (this.state.height-100)+50, r: 20 });
        if (Math.random() < 0.02) this.entities.push({ type: Math.random() > 0.5 ? 'astB' : 'astS', x: this.state.width + 100, y: Math.random() * this.state.height, r: 30, rot: 0, rotS: Math.random()*0.1 });

        this.entities.forEach((ent, i) => {
            ent.x -= this.state.gameSpeed * 1.5;
            if (ent.rot !== undefined) ent.rot += ent.rotS;
            let dx = (this.ufo.x + 40) - ent.x, dy = (this.ufo.y + 30) - ent.y;
            if (Math.sqrt(dx*dx + dy*dy) < ent.r + 20 && Date.now() > this.state.invulnerableUntil) {
                if (ent.type === 'star') { 
                    this.state.score++; this.entities.splice(i, 1); AudioMgr.play('collect'); 
                } else this.hitPlayer();
            }
        });
        this.entities = this.entities.filter(e => e.x > -100);

        // UI Update (Используем твои ID из HTML)
        document.getElementById('game-score').innerText = this.state.score;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
        document.getElementById('lives-display').innerText = this.state.lives;
    },

    hitPlayer() {
        AudioMgr.play('hit');
        this.state.lives--;
        if (this.state.lives <= 0) this.gameOver();
        else {
            this.state.invulnerableUntil = Date.now() + SETTINGS.invulnerabilityTime;
            this.ufo.vy = -5;
        }
    },

    levelComplete() {
        this.state.screen = 'level_done';
        Storage.data.stars += this.state.score;
        Storage.data.level++;
        Storage.save();
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = "STAGE DONE";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').innerText = "NEXT LEVEL";
    },

    gameOver() {
        this.state.screen = 'gameover';
        this.showScreen('game-over-screen');
        document.getElementById('final-score').innerText = this.state.score;
        if (AdController) AdController.show().catch(() => {});
        const btn = document.getElementById('retry-btn');
        btn.disabled = true;
        let s = 5;
        const t = setInterval(() => {
            s--; btn.innerText = `Wait ${s}s...`;
            if(s<=0){ clearInterval(t); btn.disabled=false; btn.innerText="RETRY"; }
        }, 1000);
    },

    draw() {
        ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, this.state.width, this.state.height);
        
        // Рисуем галактику
        if (Assets.galaxy && Assets.galaxy.complete) {
            let x = -(this.state.galaxyOffset % this.state.width);
            ctx.drawImage(Assets.galaxy, x, 0, this.state.width, this.state.height);
            ctx.drawImage(Assets.galaxy, x + this.state.width, 0, this.state.width, this.state.height);
        }

        this.entities.forEach(ent => {
            const img = Assets[ent.type === 'star' ? 'star' : (ent.type==='astB'?'astB':'astS')];
            if(img.complete) {
                ctx.save(); ctx.translate(ent.x, ent.y); ctx.rotate(ent.rot || 0);
                ctx.drawImage(img, -ent.r, -ent.r, ent.r*2, ent.r*2); ctx.restore();
            }
        });

        const ufoImg = Assets.ships[Storage.data.currentShip];
        if (ufoImg && ufoImg.complete) {
            ctx.save(); ctx.translate(this.ufo.x + 40, this.ufo.y + 30); ctx.rotate(this.ufo.angle);
            if (Date.now() < this.state.invulnerableUntil) ctx.globalAlpha = 0.5;
            ctx.drawImage(ufoImg, -40, -30, 80, 60); ctx.restore();
        }
    },

    loop(t) {
        let dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(dt > 0.1 ? 0.016 : dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    },

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('pause-btn').classList.remove('visible');
        const target = document.getElementById(id);
        if(target) target.classList.add('active');
        if(id === 'hud') document.getElementById('pause-btn').classList.add('visible');
    }
};

Game.init();
