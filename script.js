/**
 * ZIBBO: Space Journey - Core Engine
 * Fixed: Mobile touch events, Shop button listeners, Audio blocking
 */

// --- 1. CONFIG & INIT ---
const tg = window.Telegram?.WebApp;
if (tg) { 
    tg.expand(); 
    tg.ready(); 
    if (tg.headerColor) tg.setHeaderColor('#050508');
}

const ADS_BLOCK_ID = "9a1dea9f8d134730875d57f334be6f6e";
const AdController = window.Adsgram?.init({ blockId: ADS_BLOCK_ID });

const SETTINGS = {
    gravity: 0.25,
    thrust: -0.6,
    friction: 0.98,
    levelTime: 60,
    baseSpeed: 3.5,
    maxLevel: 99,
    galaxySpeed: 10,
    invulnerabilityTime: 2000
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 2. STORAGE MODULE ---
const Storage = {
    data: {
        stars: 0,
        unlockedShips: [1],
        currentShip: 1,
        lifeUpgrades: 0,
        level: 1
    },
    load() {
        const saved = localStorage.getItem('zibbo_save_v1');
        if (saved) {
            try {
                this.data = JSON.parse(saved);
            } catch(e) { console.error("Save corrupted"); }
        }
        this.updateUI();
    },
    save() {
        localStorage.setItem('zibbo_save_v1', JSON.stringify(this.data));
        this.updateUI();
    },
    updateUI() {
        const totalStars = document.getElementById('total-stars-display');
        const shopBalance = document.getElementById('shop-balance');
        if(totalStars) totalStars.innerText = this.data.stars;
        if(shopBalance) shopBalance.innerText = this.data.stars;
    },
    getMaxLives() {
        const shipBonus = this.data.unlockedShips.length - 1; 
        return 1 + this.data.lifeUpgrades + shipBonus;
    }
};

// --- 3. AUDIO MODULE ---
const AudioMgr = {
    sounds: {
        hit: new Audio('hit.ogg'),
        collect: new Audio('collect.ogg'),
        click: new Audio('button_click.ogg')
    },
    play(name) {
        const snd = this.sounds[name];
        if (snd && snd.readyState >= 2) {
            snd.currentTime = 0;
            snd.play().catch(() => {}); 
        }
    }
};

// --- 4. ASSETS MANAGE ---
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

// --- 5. SHOP MODULE ---
const Shop = {
    items: [
        { type: 'life', cost: 100, id: 'l1', name: '+1 Max Life' },
        { type: 'life', cost: 200, id: 'l2', name: '+1 Max Life' },
        { type: 'life', cost: 300, id: 'l3', name: '+1 Max Life' },
        { type: 'life', cost: 500, id: 'l4', name: '+1 Max Life' },
        { type: 'ship', cost: 300, id: 2, name: 'Speeder UFO' },
        { type: 'ship', cost: 400, id: 3, name: 'Tank UFO' },
        { type: 'ship', cost: 400, id: 4, name: 'Neon UFO' },
        { type: 'ship', cost: 500, id: 5, name: 'Golden UFO' }
    ],
    
    render() {
        const container = document.getElementById('shop-content');
        if (!container) return;
        container.innerHTML = '';
        
        this.items.forEach((item) => {
            const el = document.createElement('div');
            el.className = 'shop-item';
            
            let isBought = false;
            let isEquipped = false;
            
            if (item.type === 'life') {
                const lifeLevel = parseInt(item.id.replace('l',''));
                if (Storage.data.lifeUpgrades >= lifeLevel) isBought = true;
            } else {
                if (Storage.data.unlockedShips.includes(item.id)) isBought = true;
                if (Storage.data.currentShip === item.id) isEquipped = true;
            }

            const asset = item.type === 'ship' ? Assets.ships[item.id] : {src: 'star_pickup.png'};
            let btnText = isBought ? (item.type === 'ship' ? (isEquipped ? 'EQUIPPED' : 'EQUIP') : 'OWNED') : `${item.cost} ⭐`;
            let btnClass = isEquipped ? 'buy-btn equip' : 'buy-btn';
            let isDisabled = (isBought && item.type === 'life') || isEquipped;
            
            if (item.type === 'life' && !isBought) {
                 const prevLifeLevel = parseInt(item.id.replace('l','')) - 1;
                 if (prevLifeLevel > Storage.data.lifeUpgrades) isDisabled = true;
            }

            el.innerHTML = `
                <img src="${asset?.src || ''}">
                <div style="font-size:0.8rem">${item.name}</div>
                <button class="${btnClass}" ${isDisabled ? 'disabled' : ''}>${btnText}</button>
            `;

            // Исправленный листенер
            el.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                this.buy(item);
            });
            container.appendChild(el);
        });
    },

    buy(item) {
        AudioMgr.play('click');
        if (item.type === 'ship') {
            if (Storage.data.unlockedShips.includes(item.id)) {
                Storage.data.currentShip = item.id;
            } else if (Storage.data.stars >= item.cost) {
                Storage.data.stars -= item.cost;
                Storage.data.unlockedShips.push(item.id);
                Storage.data.currentShip = item.id;
            }
        } else if (item.type === 'life') {
             if (Storage.data.stars >= item.cost) {
                Storage.data.stars -= item.cost;
                Storage.data.lifeUpgrades++;
             }
        }
        Storage.save();
        this.render();
    }
};

// --- 6. GAME ENGINE ---
const Game = {
    state: {
        screen: 'splash',
        width: window.innerWidth,
        height: window.innerHeight,
        score: 0,
        lives: 1,
        level: 1,
        timeLeft: 60,
        gameSpeed: 0,
        lastTime: 0,
        invulnerableUntil: 0,
        galaxyOffset: 0
    },
    ufo: { x: 50, y: 0, w: 80, h: 61, vy: 0, angle: 0, thrusting: false },
    entities: [],
    starsBg: [],

    init() {
        this.resize();
        Storage.load();
        
        this.starsBg = [];
        for(let i=0; i<50; i++) {
            this.starsBg.push({
                x: Math.random() * this.state.width,
                y: Math.random() * this.state.height,
                s: Math.random() * 2,
                speed: 0.2 + Math.random() * 0.5
            });
        }

        window.addEventListener('resize', () => this.resize());
        
        // Исправленное управление (Desktop + Mobile)
        const inputStart = (e) => { 
            if(this.state.screen === 'playing') {
                this.ufo.thrusting = true;
                if (e.cancelable) e.preventDefault();
            }
        };
        const inputEnd = () => { this.ufo.thrusting = false; };
        
        canvas.addEventListener('mousedown', inputStart);
        window.addEventListener('mouseup', inputEnd);
        canvas.addEventListener('touchstart', inputStart, {passive: false});
        window.addEventListener('touchend', inputEnd);
        
        // UI Buttons
        document.getElementById('play-btn').onclick = () => { AudioMgr.play('click'); this.startLevel(Storage.data.level); };
        document.getElementById('continue-btn').onclick = () => { AudioMgr.play('click'); this.startLevel(this.state.level + 1); };
        document.getElementById('restart-btn').onclick = () => { AudioMgr.play('click'); this.startLevel(this.state.level); };
        document.getElementById('retry-btn').onclick = () => { AudioMgr.play('click'); this.startLevel(this.state.level); };
        document.getElementById('pause-btn').onclick = () => { AudioMgr.play('click'); this.togglePause(); };
        document.getElementById('home-btn').onclick = () => { AudioMgr.play('click'); this.showScreen('splash'); };
        
        document.getElementById('shop-btn-main').onclick = () => { AudioMgr.play('click'); this.showScreen('shop'); Shop.render(); };
        document.getElementById('shop-btn-level').onclick = () => { AudioMgr.play('click'); this.showScreen('shop'); Shop.render(); };
        document.getElementById('close-shop').onclick = () => { 
            AudioMgr.play('click');
            if (this.state.score > 0 || this.state.screen === 'level_done') this.showScreen('level-screen'); 
            else this.showScreen('splash');
        };

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
        this.state.invulnerableUntil = 0;
        this.state.galaxyOffset = 0;
        this.ufo.y = this.state.height / 2;
        this.ufo.vy = 0;
        this.entities = [];
        this.showScreen('playing');
        document.getElementById('level-display').innerText = lvl;
        document.getElementById('lives-display').innerText = this.state.lives;
        document.getElementById('pause-btn').classList.add('visible');
    },

    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            document.getElementById('level-screen').classList.add('active');
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('continue-btn').innerText = "RESUME";
            document.getElementById('continue-btn').onclick = () => {
                this.state.screen = 'playing';
                document.getElementById('level-screen').classList.remove('active');
                document.getElementById('continue-btn').onclick = () => this.startLevel(this.state.level + 1);
            };
        }
    },

    spawnLogic() {
        const difficulty = Math.min(this.state.level, 50) / 50; 
        if (Math.random() < 0.03) {
            this.entities.push({ type: 'star', x: this.state.width + 50, y: Math.random() * (this.state.height - 100) + 50, r: 20 });
        }
        let astChance = 0.015 + (difficulty * 0.03);
        if (this.state.timeLeft < 5) astChance = 0.005;

        if (Math.random() < astChance) {
            const isBig = Math.random() > 0.6;
            this.entities.push({
                type: isBig ? 'astB' : 'astS',
                x: this.state.width + 100,
                y: Math.random() * this.state.height,
                r: isBig ? 35 : 20,
                rot: Math.random(),
                rotSpeed: (Math.random() - 0.5) * 0.1
            });
        }
    },

    update(dt) {
        if (this.state.screen !== 'playing') return;
        this.state.timeLeft -= dt;
        if (this.state.timeLeft <= 0) { this.levelComplete(); return; }

        if (this.ufo.thrusting) this.ufo.vy += SETTINGS.thrust;
        this.ufo.vy += SETTINGS.gravity;
        this.ufo.vy *= SETTINGS.friction;
        this.ufo.y += this.ufo.vy;

        let targetAngle = Math.max(-0.4, Math.min(0.4, this.ufo.vy * 0.08));
        this.ufo.angle += (targetAngle - this.ufo.angle) * 0.1;

        if (this.ufo.y < 0) this.ufo.y = 0;
        if (this.ufo.y + this.ufo.h > this.state.height) this.hitPlayer();

        this.state.galaxyOffset += (SETTINGS.galaxySpeed / 60) * dt; 

        this.spawnLogic();
        const now = Date.now();
        const isInvulnerable = now < this.state.invulnerableUntil;

        this.entities.forEach((ent, i) => {
            ent.x -= this.state.gameSpeed * 1.5;
            if (ent.rot !== undefined) ent.rot += ent.rotSpeed;

            if (!isInvulnerable) {
                let dx = (this.ufo.x + this.ufo.w/2) - ent.x;
                let dy = (this.ufo.y + this.ufo.h/2) - ent.y;
                let dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < ent.r + 25) {
                    if (ent.type === 'star') {
                        AudioMgr.play('collect');
                        this.state.score++;
                        this.entities.splice(i, 1);
                        if(tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
                    } else { this.hitPlayer(); }
                }
            }
        });

        this.entities = this.entities.filter(e => e.x > -100);
        document.getElementById('score-display').innerText = this.state.score;
        document.getElementById('timer-display').innerText = Math.ceil(this.state.timeLeft);
    },

    hitPlayer() {
        if (Date.now() < this.state.invulnerableUntil) return;
        AudioMgr.play('hit');
        if(tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        
        this.state.lives--;
        document.getElementById('lives-display').innerText = this.state.lives;
        if (this.state.lives > 0) {
            this.state.invulnerableUntil = Date.now() + SETTINGS.invulnerabilityTime;
            this.ufo.vy = -5; 
        } else { this.gameOver(); }
    },

    levelComplete() {
        this.state.screen = 'level_done';
        document.getElementById('pause-btn').classList.remove('visible');
        Storage.data.stars += this.state.score;
        Storage.data.level = Math.max(Storage.data.level, this.state.level + 1);
        Storage.save();
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = `STAGE ${this.state.level} DONE`;
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').innerText = "CONTINUE";
    },

    gameOver() {
        this.state.screen = 'gameover';
        document.getElementById('pause-btn').classList.remove('visible');
        this.showScreen('game-over-screen');
        document.getElementById('final-score').innerText = this.state.score;
        if (AdController) AdController.show().catch(() => {});

        const btn = document.getElementById('retry-btn');
        btn.disabled = true;
        let sec = 5;
        const timer = setInterval(() => {
            sec--;
            btn.innerText = `Wait ${sec}s...`;
            if (sec <= 0) { clearInterval(timer); btn.disabled = false; btn.innerText = "RETRY"; }
        }, 1000);
    },

    draw() {
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, this.state.width, this.state.height);

        if (Assets.galaxy.complete) {
            let xPos = -(this.state.galaxyOffset * 20) % this.state.width;
            ctx.drawImage(Assets.galaxy, xPos, 0, this.state.width, this.state.height);
            ctx.drawImage(Assets.galaxy, xPos + this.state.width, 0, this.state.width, this.state.height);
        }

        ctx.fillStyle = 'white';
        this.starsBg.forEach(s => {
            if(this.state.screen === 'playing') {
                s.x -= s.speed * (this.state.gameSpeed * 0.5);
                if(s.x < 0) s.x = this.state.width;
            }
            ctx.globalAlpha = 0.5;
            ctx.fillRect(s.x, s.y, s.s, s.s);
        });
        ctx.globalAlpha = 1;

        this.entities.forEach(ent => {
            let img = ent.type === 'star' ? Assets.star : (ent.type === 'astS' ? Assets.astS : Assets.astB);
            if(img.complete) {
                ctx.save();
                ctx.translate(ent.x, ent.y);
                if(ent.rot) ctx.rotate(ent.rot);
                ctx.drawImage(img, -ent.r, -ent.r, ent.r*2, ent.r*2);
                ctx.restore();
            }
        });

        const ufoImg = Assets.ships[Storage.data.currentShip];
        if (ufoImg?.complete) {
            ctx.save();
            ctx.translate(this.ufo.x + this.ufo.w/2, this.ufo.y + this.ufo.h/2);
            ctx.rotate(this.ufo.angle);
            if (Date.now() < this.state.invulnerableUntil) ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.02) * 0.4;
            ctx.drawImage(ufoImg, -this.ufo.w/2, -this.ufo.h/2, this.ufo.w, this.ufo.h);
            ctx.restore();
        }
    },

    loop(timestamp) {
        let dt = (timestamp - this.state.lastTime) / 1000;
        if (dt > 0.1) dt = 0.016; 
        this.state.lastTime = timestamp;
        this.update(dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    },

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(id === 'playing' ? 'hud' : (id === 'shop' ? 'shop-screen' : (id === 'splash' ? 'splash-screen' : id)));
        if (target) target.classList.add('active');
        if (id === 'playing') document.getElementById('hud').classList.add('active');
    }
};

Game.init();
