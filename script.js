/**
 * ZIBBO: Space Journey - Core Engine
 * Architecture: Modular (Storage, Audio, Shop, Game)
 */

// --- 1. CONFIG & INIT ---
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
    maxLevel: 99,
    galaxySpeed: 10, // px за весь уровень (очень медленно)
    invulnerabilityTime: 2000 // ms
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 2. STORAGE MODULE (Сохранение прогресса) ---
const Storage = {
    data: {
        stars: 0,
        unlockedShips: [1], // ID купленных кораблей
        currentShip: 1,
        lifeUpgrades: 0, // Количество купленных доп. жизней
        level: 1
    },
    load() {
        const saved = localStorage.getItem('zibbo_save_v1');
        if (saved) {
            this.data = JSON.parse(saved);
        }
        this.updateUI();
    },
    save() {
        localStorage.setItem('zibbo_save_v1', JSON.stringify(this.data));
        this.updateUI();
    },
    updateUI() {
        document.getElementById('total-stars-display').innerText = this.data.stars;
        document.getElementById('shop-balance').innerText = this.data.stars;
    },
    getMaxLives() {
        // Базовая 1 + Апгрейды жизней + Бонус за каждый купленный корабль (кроме дефолтного)
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
        if (this.sounds[name]) {
            this.sounds[name].currentTime = 0;
            this.sounds[name].play().catch(() => {}); // Игнор ошибок автоплея
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
        container.innerHTML = '';
        
        // Фильтр по табам (пока показываем всё или можно добавить логику табов)
        // Для простоты рендерим всё, но можно разделить
        
        this.items.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'shop-item';
            
            // Определяем состояние
            let isBought = false;
            let isEquipped = false;
            
            if (item.type === 'life') {
                // Логика жизней: они покупаются по очереди
                const lifeLevel = parseInt(item.id.replace('l',''));
                if (Storage.data.lifeUpgrades >= lifeLevel) isBought = true;
            } else {
                if (Storage.data.unlockedShips.includes(item.id)) isBought = true;
                if (Storage.data.currentShip === item.id) isEquipped = true;
            }

            // Картинка
            let imgSrc = item.type === 'ship' ? Assets.ships[item.id].src : 'star_pickup.png'; // Можно иконку сердца
            
            let btnText = isBought ? (item.type === 'ship' ? (isEquipped ? 'EQUIPPED' : 'EQUIP') : 'OWNED') : `${item.cost} ⭐`;
            let btnClass = isEquipped ? 'buy-btn equip' : 'buy-btn';
            let isDisabled = (isBought && item.type === 'life') || isEquipped;
            
            // Если предыдущая жизнь не куплена, блокируем следующую
            if (item.type === 'life' && !isBought) {
                 const prevLifeLevel = parseInt(item.id.replace('l','')) - 1;
                 if (prevLifeLevel > Storage.data.lifeUpgrades) isDisabled = true;
            }

            el.innerHTML = `
                <img src="${imgSrc}">
                <div style="font-size:0.8rem">${item.name}</div>
                <button class="${btnClass}" ${isDisabled ? 'disabled' : ''}>${btnText}</button>
            `;

            el.querySelector('button').onclick = () => this.buy(item);
            container.appendChild(el);
        });
    },

    buy(item) {
        AudioMgr.play('click');
        if (item.type === 'ship') {
            if (Storage.data.unlockedShips.includes(item.id)) {
                Storage.data.currentShip = item.id; // Equip
            } else {
                if (Storage.data.stars >= item.cost) {
                    Storage.data.stars -= item.cost;
                    Storage.data.unlockedShips.push(item.id);
                    Storage.data.currentShip = item.id; // Auto equip
                } else return;
            }
        } else if (item.type === 'life') {
             if (Storage.data.stars >= item.cost) {
                Storage.data.stars -= item.cost;
                Storage.data.lifeUpgrades++;
             } else return;
        }
        Storage.save();
        this.render();
    }
};

// --- 6. GAME ENGINE ---
const Game = {
    state: {
        screen: 'splash', // splash, playing, paused, level_done, gameover
        width: window.innerWidth,
        height: window.innerHeight,
        score: 0, // Звезды за уровень
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
    starsBg: [], // Мелкие звезды (частицы)

    init() {
        this.resize();
        Storage.load();
        
        // Генерация фоновых частиц
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
        
        // Inputs
        const inputStart = () => { if(this.state.screen === 'playing') this.ufo.thrusting = true; };
        const inputEnd = () => { if(this.state.screen === 'playing') this.ufo.thrusting = false; };
        
        window.addEventListener('mousedown', inputStart);
        window.addEventListener('mouseup', inputEnd);
        window.addEventListener('touchstart', (e) => { inputStart(); }, {passive: true});
        window.addEventListener('touchend', inputEnd);
        
        // UI Buttons
        document.getElementById('play-btn').onclick = () => this.startLevel(Storage.data.level);
        document.getElementById('continue-btn').onclick = () => this.startLevel(this.state.level + 1);
        document.getElementById('restart-btn').onclick = () => this.startLevel(this.state.level);
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('home-btn').onclick = () => this.showScreen('splash');
        
        // Shop UI
        document.getElementById('shop-btn-main').onclick = () => { this.showScreen('shop'); Shop.render(); };
        document.getElementById('shop-btn-level').onclick = () => { this.showScreen('shop'); Shop.render(); };
        document.getElementById('close-shop').onclick = () => { 
            // Возвращаемся туда, откуда пришли
            if (this.state.score > 0) this.showScreen('level_screen'); 
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
        this.state.score = 0; // Звезды сбрасываются (новые для уровня)
        this.state.timeLeft = SETTINGS.levelTime;
        this.state.lives = Storage.getMaxLives();
        this.state.gameSpeed = SETTINGS.baseSpeed + (lvl * 0.1); // Ускорение каждый уровень
        this.state.invulnerableUntil = 0;
        this.state.galaxyOffset = 0;
        
        // Reset UFO
        this.ufo.y = this.state.height / 2;
        this.ufo.vy = 0;
        this.ufo.angle = 0;
        this.entities = [];
        
        this.showScreen('playing');
        
        // Обновляем HUD
        document.getElementById('level-display').innerText = lvl;
        document.getElementById('lives-display').innerText = this.state.lives;
        
        // Кнопка паузы
        document.getElementById('pause-btn').classList.add('visible');
    },

    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            document.getElementById('level-screen').classList.add('active'); // Используем экран уровня как паузу
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('level-stars').innerText = this.state.score;
            document.getElementById('continue-btn').innerText = "RESUME";
            document.getElementById('continue-btn').onclick = () => {
                this.state.screen = 'playing';
                document.getElementById('level-screen').classList.remove('active');
                document.getElementById('continue-btn').onclick = () => this.startLevel(this.state.level + 1); // Возвращаем логику
            };
        }
    },

    spawnLogic() {
        // Шанс спавна зависит от уровня (макс на 50 уровне)
        const difficulty = Math.min(this.state.level, 50) / 50; 
        
        // Звезды
        if (Math.random() < 0.03) {
            this.entities.push({ type: 'star', x: this.state.width + 50, y: Math.random() * (this.state.height - 100) + 50, r: 20 });
        }

        // Астероиды
        let astChance = 0.015 + (difficulty * 0.03);
        
        // В последние 5 секунд ускорение и меньше астероидов
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

        // Timer
        this.state.timeLeft -= dt;
        if (this.state.timeLeft <= 0) {
            this.levelComplete();
            return;
        }

        // Physics
        if (this.ufo.thrusting) this.ufo.vy += SETTINGS.thrust;
        this.ufo.vy += SETTINGS.gravity;
        this.ufo.vy *= SETTINGS.friction;
        this.ufo.y += this.ufo.vy;

        // Angle
        let targetAngle = Math.max(-0.4, Math.min(0.4, this.ufo.vy * 0.08));
        this.ufo.angle += (targetAngle - this.ufo.angle) * 0.1;

        // Bounds
        if (this.ufo.y < 0) this.ufo.y = 0;
        if (this.ufo.y + this.ufo.h > this.state.height) this.hitPlayer();

        // Background Scroll (Galaxy)
        // Двигаем очень медленно
        this.state.galaxyOffset += (SETTINGS.galaxySpeed / 60) * dt; 

        // Entities
        this.spawnLogic();
        
        const now = Date.now();
        const isInvulnerable = now < this.state.invulnerableUntil;

        this.entities.forEach((ent, i) => {
            ent.x -= this.state.gameSpeed * 1.5; // Объекты летят быстрее фона
            if (ent.rot !== undefined) ent.rot += ent.rotSpeed;

            // Collision
            if (!isInvulnerable) {
                let dx = (this.ufo.x + this.ufo.w/2) - ent.x;
                let dy = (this.ufo.y + this.ufo.h/2) - ent.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < ent.r + 25) { // 25 - радиус UFO примерно
                    if (ent.type === 'star') {
                        AudioMgr.play('collect');
                        this.state.score++;
                        this.entities.splice(i, 1);
                        if(tg) tg.HapticFeedback.impactOccurred('light');
                    } else {
                        this.hitPlayer();
                    }
                }
            }
        });

        // Cleanup
        this.entities = this.entities.filter(e => e.x > -100);

        // UI Updates
        document.getElementById('score-display').innerText = this.state.score;
        document.getElementById('timer-display').innerText = Math.ceil(this.state.timeLeft);
        
        // Final rush visual
        if (this.state.timeLeft < 5) {
             document.getElementById('timer-display').style.color = 'red';
             this.state.gameSpeed += 0.05; // Plavnoye uskorenie
        } else {
             document.getElementById('timer-display').style.color = 'white';
        }
    },

    hitPlayer() {
        AudioMgr.play('hit');
        if(tg) tg.HapticFeedback.notificationOccurred('error');
        
        if (Date.now() < this.state.invulnerableUntil) return;

        this.state.lives--;
        document.getElementById('lives-display').innerText = this.state.lives;

        if (this.state.lives > 0) {
            // Blink / Invulnerable
            this.state.invulnerableUntil = Date.now() + SETTINGS.invulnerabilityTime;
            // Отброс немного назад/вверх чтобы не застрять
            this.ufo.vy = -5; 
        } else {
            this.gameOver();
        }
    },

    levelComplete() {
        this.state.screen = 'level_done';
        document.getElementById('pause-btn').classList.remove('visible');
        
        // Save stars
        Storage.data.stars += this.state.score;
        Storage.data.level = Math.max(Storage.data.level, this.state.level + 1);
        Storage.save();

        // Show Screen
        this.showScreen('level-screen');
        document.getElementById('level-title').innerText = `STAGE ${this.state.level} DONE`;
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').innerText = "CONTINUE";
        
        // Sound
        // AudioMgr.play('win');
    },

    gameOver() {
        this.state.screen = 'gameover';
        document.getElementById('pause-btn').classList.remove('visible');
        
        this.showScreen('game-over-screen');
        document.getElementById('final-score').innerText = this.state.score;

        // Реклама
        if (AdController) {
            AdController.show().catch(e => console.log("Ad skipped"));
        }

        // Блокировка кнопки Retry
        const btn = document.getElementById('retry-btn');
        btn.disabled = true;
        let sec = 5;
        btn.innerText = `Wait ${sec}s...`;
        
        const timer = setInterval(() => {
            sec--;
            if (sec <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.innerText = "RETRY";
            } else {
                btn.innerText = `Wait ${sec}s...`;
            }
        }, 1000);
    },

    draw() {
        // Clear
        ctx.fillStyle = '#050508';
        ctx.fillRect(0, 0, this.state.width, this.state.height);

        // 1. Draw Galaxy (Parallax)
        // Рисуем картинку дважды для бесшовности
        if (Assets.galaxy.complete) {
            const gw = Assets.galaxy.width;
            const gh = Assets.galaxy.height;
            // Растягиваем по высоте экрана, сохраняя пропорции или кропая
            // Для простоты растянем на весь экран + запас для движения
            
            // Смещение по X (движемся вправо по картинке, то есть картинка едет влево)
            let xPos = -this.state.galaxyOffset % this.state.width;
            
            // Рисуем первую копию
            ctx.drawImage(Assets.galaxy, xPos, 0, this.state.width, this.state.height);
            // Рисуем вторую копию справа
            ctx.drawImage(Assets.galaxy, xPos + this.state.width, 0, this.state.width, this.state.height);
        }

        // 2. Stars Particles
        ctx.fillStyle = 'white';
        this.starsBg.forEach(s => {
            // Двигаем звезды
            if(this.state.screen === 'playing') {
