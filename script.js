const tg = window.Telegram?.WebApp;
if (tg) { tg.expand(); tg.ready(); }

const SETTINGS = {
    gravity: 0.25,
    thrust: -0.6,
    friction: 0.98,
    levelTime: 60,
    baseSpeed: 3.5,
    invulnerabilityTime: 2000
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const Storage = {
    data: { stars: 0, unlockedShips: [1], currentShip: 1, lifeUpgrades: 0, level: 1 },
    load() {
        const saved = localStorage.getItem('zibbo_save_v2');
        if (saved) { try { this.data = JSON.parse(saved); } catch(e) {} }
        this.updateUI();
    },
    save() {
        localStorage.setItem('zibbo_save_v2', JSON.stringify(this.data));
        this.updateUI();
    },
    updateUI() {
        document.getElementById('total-stars-display').innerText = this.data.stars;
        document.getElementById('shop-balance').innerText = this.data.stars;
        document.getElementById('current-lvl-display').innerText = this.data.level;
        const preview = document.getElementById('splash-ufo-preview');
        if(preview) preview.src = `ufo_ship${this.data.currentShip > 1 ? this.data.currentShip : ''}.png`;
        this.renderLives();
    },
    getMaxLives() { return 1 + this.data.lifeUpgrades; },
    renderLives() {
        const bar = document.getElementById('lives-bar');
        if(!bar) return;
        bar.innerHTML = '';
        const currentLives = Game.state.lives || this.getMaxLives();
        for(let i=1; i<=10; i++) {
            const img = document.createElement('img');
            img.src = `ufo_ship${this.data.currentShip > 1 ? this.data.currentShip : ''}.png`;
            // Яркие — сколько жизней сейчас. Бледные — сколько потеряно или еще не куплено.
            if (i > this.getMaxLives()) img.style.display = 'none'; // Показываем только доступный максимум
            else if (i > currentLives) img.style.opacity = "0.2";
            bar.appendChild(img);
        }
    }
};

const AudioMgr = {
    sounds: { hit: new Audio('hit.ogg'), collect: new Audio('collect.ogg'), click: new Audio('button_click.ogg') },
    play(name) {
        const s = this.sounds[name];
        if (s && s.readyState >= 2) { s.currentTime = 0; s.play().catch(() => {}); }
    }
};

const Assets = {
    ships: { 1: document.getElementById('ufo-1'), 2: document.getElementById('ufo-2'), 3: document.getElementById('ufo-3'), 4: document.getElementById('ufo-4'), 5: document.getElementById('ufo-5') },
    galaxy: document.getElementById('galaxy-bg'),
    star: document.getElementById('star-img'),
    astS: document.getElementById('ast-s-img'),
    astB: document.getElementById('ast-b-img')
};

const Shop = {
    currentTab: 'lives',
    items: [
        { type: 'lives', cost: 50, id: 'l1', name: 'Extra Life', tab: 'lives' },
        { type: 'lives', cost: 150, id: 'l2', name: 'Health Pack', tab: 'lives' },
        { type: 'ships', cost: 300, id: 2, name: 'Speeder', tab: 'ships' },
        { type: 'ships', cost: 500, id: 3, name: 'Tanker', tab: 'ships' },
        { type: 'ships', cost: 800, id: 4, name: 'Neon', tab: 'ships' },
        { type: 'ships', cost: 1500, id: 5, name: 'Golden', tab: 'ships' }
    ],
    init() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.render();
            };
        });
    },
    render() {
        const container = document.getElementById('shop-content');
        container.innerHTML = '';
        this.items.filter(i => i.tab === this.currentTab).forEach(item => {
            const el = document.createElement('div');
            el.className = 'shop-item';
            let isBought = item.type === 'ships' ? Storage.data.unlockedShips.includes(item.id) : (Storage.data.lifeUpgrades >= (this.items.indexOf(item)+1));
            let isEquipped = (item.type === 'ships' && Storage.data.currentShip === item.id);
            
            el.innerHTML = `
                <img src="${item.type==='ships' ? `ufo_ship${item.id>1?item.id:''}.png` : 'star_pickup.png'}">
                <div class="shop-item-name">${item.name}</div>
                <button class="buy-btn ${isEquipped?'equip':''}">
                    ${isEquipped ? 'READY' : (isBought ? 'USE' : item.cost + ' ⭐')}
                </button>
            `;
            el.querySelector('button').onclick = () => this.buy(item);
            container.appendChild(el);
        });
    },
    buy(item) {
        if (item.type === 'ships') {
            if (Storage.data.unlockedShips.includes(item.id)) { Storage.data.currentShip = item.id; }
            else if (Storage.data.stars >= item.cost) {
                Storage.data.stars -= item.cost; Storage.data.unlockedShips.push(item.id); Storage.data.currentShip = item.id;
            }
        } else {
            if (Storage.data.stars >= item.cost && Storage.data.lifeUpgrades < 9) {
                Storage.data.stars -= item.cost; Storage.data.lifeUpgrades++;
            }
        }
        Storage.save(); this.render();
    }
};

const Game = {
    state: { screen: 'splash', width: 0, height: 0, score: 0, lives: 1, level: 1, timeLeft: 60, lastTime: 0, invulnerableUntil: 0 },
    ufo: { x: 50, y: 0, vy: 0, angle: 0, thrusting: false },
    entities: [],

    init() {
        Storage.load();
        Shop.init();
        this.resize();
        window.onresize = () => this.resize();

        canvas.ontouchstart = (e) => { if(this.state.screen === 'playing') this.ufo.thrusting = true; e.preventDefault(); };
        window.ontouchend = () => this.ufo.thrusting = false;

        document.getElementById('play-btn').onclick = () => this.startLevel(Storage.data.level);
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('continue-btn').onclick = () => this.state.screen === 'paused' ? this.togglePause() : this.startLevel(this.state.level + 1);
        document.getElementById('retry-btn').onclick = () => this.startLevel(this.state.level);
        document.getElementById('exit-to-menu').onclick = () => this.showScreen('splash');
        document.getElementById('home-btn').onclick = () => this.showScreen('splash');
        document.getElementById('shop-btn-main').onclick = () => { this.showScreen('shop-screen'); Shop.render(); };
        document.getElementById('shop-btn-level').onclick = () => { this.showScreen('shop-screen'); Shop.render(); };
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
        this.state.screen = 'playing';
        this.ufo.y = this.state.height / 2;
        this.ufo.vy = 0;
        this.entities = [];
        Storage.renderLives();
        this.showScreen('hud');
    },

    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            this.showScreen('level-screen');
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('continue-btn').innerText = "RESUME";
        } else {
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

        if (this.ufo.y < 0) { this.ufo.y = 0; this.ufo.vy = 0; }
        if (this.ufo.y + 50 > this.state.height) this.hitPlayer();

        if (Math.random() < 0.03) this.entities.push({ type: 'star', x: this.state.width + 50, y: Math.random() * (this.state.height-100)+50, r: 20 });
        if (Math.random() < 0.02) this.entities.push({ type: Math.random() > 0.5 ? 'astB' : 'astS', x: this.state.width + 100, y: Math.random() * this.state.height, r: 35, rot: 0, rotS: Math.random()*0.05 });

        this.entities.forEach((ent, i) => {
            ent.x -= (SETTINGS.baseSpeed + this.state.level * 0.2);
            if (ent.rot !== undefined) ent.rot += ent.rotS;
            let dx = (this.ufo.x + 40) - ent.x, dy = (this.ufo.y + 25) - ent.y;
            if (Math.sqrt(dx*dx + dy*dy) < ent.r + 20 && Date.now() > this.state.invulnerableUntil) {
                if (ent.type === 'star') { this.state.score++; this.entities.splice(i, 1); AudioMgr.play('collect'); } 
                else this.hitPlayer();
            }
        });
        this.entities = this.entities.filter(e => e.x > -100);

        document.getElementById('game-score').innerText = this.state.score;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
    },

    hitPlayer() {
        AudioMgr.play('hit');
        this.state.lives--;
        Storage.renderLives();
        if (this.state.lives <= 0) this.gameOver();
        else { this.state.invulnerableUntil = Date.now() + SETTINGS.invulnerabilityTime; this.ufo.vy = -7; }
    },

    levelComplete() {
        this.state.screen = 'level_done';
        Storage.data.stars += this.state.score;
        Storage.data.level++;
        Storage.save();
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = "STAGE DONE";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').innerText = "NEXT STAGE";
    },

    gameOver() {
        this.state.screen = 'gameover';
        this.showScreen('game-over-screen');
        document.getElementById('final-score').innerText = this.state.score;
        let s = 3;
        const btn = document.getElementById('retry-btn');
        btn.disabled = true;
        const t = setInterval(() => {
            btn.innerText = `Wait ${s}s`; s--;
            if(s < 0) { clearInterval(t); btn.disabled = false; btn.innerText = "RETRY"; }
        }, 1000);
    },

    draw() {
        ctx.clearRect(0, 0, this.state.width, this.state.height);
        
        // Статичный фон "Cover"
        if (Assets.galaxy.complete) {
            let imgRatio = Assets.galaxy.width / Assets.galaxy.height;
            let canvasRatio = this.state.width / this.state.height;
            let drawW, drawH, drawX, drawY;
            if (imgRatio > canvasRatio) {
                drawH = this.state.height; drawW = drawH * imgRatio;
                drawX = (this.state.width - drawW) / 2; drawY = 0;
            } else {
                drawW = this.state.width; drawH = drawW / imgRatio;
                drawX = 0; drawY = (this.state.height - drawH) / 2;
            }
            ctx.drawImage(Assets.galaxy, drawX, drawY, drawW, drawH);
        }

        this.entities.forEach(ent => {
            const img = Assets[ent.type==='star'?'star':(ent.type==='astB'?'astB':'astS')];
            ctx.save(); ctx.translate(ent.x, ent.y); ctx.rotate(ent.rot || 0);
            ctx.drawImage(img, -ent.r, -ent.r, ent.r*2, ent.r*2); ctx.restore();
        });

        const ufoImg = Assets.ships[Storage.data.currentShip];
        ctx.save(); ctx.translate(this.ufo.x + 40, this.ufo.y + 25); ctx.rotate(this.ufo.angle);
        if (Date.now() < this.state.invulnerableUntil) ctx.globalAlpha = 0.5;
        ctx.drawImage(ufoImg, -40, -25, 80, 50); ctx.restore();
    },

    loop(t) {
        let dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(dt > 0.1 ? 0.016 : dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    },

    showScreen(id) {
        document.querySelectorAll('.screen, #hud').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(id);
        if(target) target.classList.add('active');
    }
};
Game.init();
