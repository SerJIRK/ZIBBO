// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// Инициализация Adsgram
const AdController = window.Adsgram?.init({ blockId: "9a1dea9f8d134730875d57f334be6f6e" });

// === НАСТРОЙКИ КОРАБЛЕЙ ===
const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98, w: 60, h: 40 },
    2: { thrust: 0.65, damping: 0.97, w: 70, h: 48 },
    3: { thrust: 0.75, damping: 0.96, w: 80, h: 55 },
    4: { thrust: 0.85, damping: 0.95, w: 90, h: 62 },
    5: { thrust: 1.00, damping: 0.94, w: 100, h: 70 }
};

// === МУЗЫКАЛЬНЫЙ ДВИЖОК ===
const MusicMgr = {
    currentTrack: null,
    // Добавляй сюда свои 10 треков
    tracks: ['track1.ogg', 'track2.ogg', 'track3.ogg', 'track4.ogg', 'track5.ogg'], 
    enabled: false,
    
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) this.playRandom();
        else this.stop();
        document.getElementById('music-btn').innerText = this.enabled ? "MUSIC ON" : "MUSIC OFF";
    },

    playRandom() {
        if (!this.enabled || this.tracks.length === 0) return;
        this.stop();
        const rand = Math.floor(Math.random() * this.tracks.length);
        this.currentTrack = new Audio(this.tracks[rand]);
        this.currentTrack.loop = true;
        this.currentTrack.volume = 0.6;
        this.currentTrack.play().catch(() => console.log("Audio blocked"));
    },

    next() {
        if (this.enabled) this.playRandom();
    },

    stop() {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    },

    dim(isDim) {
        if (this.currentTrack) this.currentTrack.volume = isDim ? 0.15 : 0.6;
    }
};

// === ОСНОВНОЕ ЯДРО ИГРЫ ===
const Game = {
    state: { 
        screen: 'splash', 
        level: 1, 
        score: 0, 
        timeLeft: 60, 
        lives: 1,
        lastTime: 0, 
        invul: 0 
    },
    ufo: { x: 50, y: 0, vy: 0, thrust: false, w: 60, h: 40 },
    entities: [],
    stars: [], // Фон

    init() {
        this.storage.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createStarfield();

        // Управление
        const startAction = (e) => {
            if(this.state.screen === 'playing') this.ufo.thrust = true;
            if(this.state.screen === 'waiting') this.state.screen = 'playing';
            if(e.type === 'touchstart') e.preventDefault();
        };
        const stopAction = () => { this.ufo.thrust = false; };

        this.canvas.addEventListener('mousedown', startAction);
        this.canvas.addEventListener('touchstart', startAction, {passive: false});
        window.addEventListener('mouseup', stopAction);
        window.addEventListener('touchend', stopAction);

        // Кнопки меню
        document.getElementById('play-btn').onclick = () => this.prepareLevel(this.storage.data.level);
        document.getElementById('new-game-btn').onclick = () => document.getElementById('confirm-screen').classList.add('active');
        document.getElementById('confirm-yes').onclick = () => { this.storage.reset(); };
        document.getElementById('confirm-no').onclick = () => document.getElementById('confirm-screen').classList.remove('active');
        document.getElementById('music-btn').onclick = () => MusicMgr.toggle();
        document.getElementById('next-track-btn').onclick = () => MusicMgr.next();
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('shop-btn-pause').onclick = () => this.openShop();
        document.getElementById('close-shop').onclick = () => this.showScreen('level-screen');
        
        // Рекламная цепочка
        document.getElementById('continue-btn').onclick = () => this.runAdSequence();
        document.getElementById('resume-btn').onclick = () => this.prepareLevel(this.state.level);

        window.addEventListener('resize', () => this.resize());
        this.loop(0);
    },

    storage: {
        data: { stars: 0, unlocked: [1], current: 1, livesPlus: 0, level: 1 },
        load() {
            const saved = localStorage.getItem('zibbo_blockbuster_v1');
            if(saved) this.data = JSON.parse(saved);
            this.sync();
        },
        save() {
            localStorage.setItem('zibbo_blockbuster_v1', JSON.stringify(this.data));
            this.sync();
        },
        sync() {
            const s = this.data.stars;
            document.getElementById('total-stars-display-main').innerText = s;
            document.getElementById('total-stars-display-shop').innerText = s;
            document.getElementById('current-lvl-display').innerText = this.data.level;
        },
        reset() {
            localStorage.removeItem('zibbo_blockbuster_v1');
            location.reload();
        }
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ufo.x = this.canvas.width * 0.12;
    },

    createStarfield() {
        this.stars = [];
        for(let i=0; i<100; i++) {
            this.stars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                s: Math.random() * 2,
                v: 0.5 + Math.random() * 1.5
            });
        }
    },

    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        if(id) document.getElementById(id).classList.add('active');
        if(['hud', 'level-screen'].includes(id)) document.getElementById('hud').classList.add('active');
    },

    prepareLevel(lvl) {
        this.state.level = lvl;
        this.state.score = 0;
        this.state.timeLeft = 60;
        this.state.screen = 'waiting';
        this.entities = [];
        
        const stats = SHIP_STATS[this.storage.data.current];
        this.ufo.y = this.canvas.height / 2;
        this.ufo.vy = 0;
        this.ufo.w = stats.w;
        this.ufo.h = stats.h;
        
        // Жизни = База(1) + Купленные слоты + Бонус за класс корабля
        this.state.lives = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        
        this.updateLivesUI();
        this.showScreen('hud');
        MusicMgr.dim(false);
    },

    update(dt) {
        // Фон движется всегда
        this.stars.forEach(s => {
            s.x -= s.v * (this.state.screen === 'playing' ? 4 : 1);
            if(s.x < 0) s.x = this.canvas.width;
        });

        if(this.state.screen !== 'playing') return;

        const stats = SHIP_STATS[this.storage.data.current];
        const difficultySpeed = 1 + (this.state.level * 0.02);
        const density = 0.01 + (this.state.level * 0.001);

        // Физика
        if(this.ufo.thrust) this.ufo.vy -= stats.thrust;
        this.ufo.vy += 0.38; // Гравитация
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;

        // Границы
        if(this.ufo.y < 0 || this.ufo.y > this.canvas.height - this.ufo.h) this.onHit();

        // Таймер
        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
        if(this.state.timeLeft <= 0) this.win();

        // Спавн
        if(Math.random() < 0.02) this.spawn('star');
        if(Math.random() < density) this.spawn('ast');

        // Объекты
        this.entities.forEach((en, i) => {
            en.x -= (4.5 * difficultySpeed);
            
            // Коллизия
            const dx = (this.ufo.x + this.ufo.w/2) - en.x;
            const dy = (this.ufo.y + this.ufo.h/2) - en.y;
            const dist = Math.hypot(dx, dy);

            if(dist < en.r + 15 && Date.now() > this.state.invul) {
                if(en.type === 'star') {
                    this.state.score++;
                    this.storage.data.stars++;
                    this.storage.save();
                    this.entities.splice(i, 1);
                    if(tg) tg.HapticFeedback.impactOccurred('light');
                } else {
                    this.onHit();
                }
            }
        });
        this.entities = this.entities.filter(en => en.x > -100);
    },

    spawn(type) {
        this.entities.push({
            type,
            x: this.canvas.width + 100,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: type === 'star' ? 15 : 20 + Math.random() * 25
        });
    },

    onHit() {
        this.state.lives--;
        if(tg) tg.HapticFeedback.impactOccurred('heavy');
        this.updateLivesUI();
        
        if(this.state.lives <= 0) {
            this.gameOver();
        } else {
            this.state.invul = Date.now() + 2000;
            this.ufo.y = this.canvas.height/2;
            this.ufo.vy = 0;
            this.state.screen = 'waiting';
        }
    },

    gameOver() {
        this.state.screen = 'crashed';
        MusicMgr.dim(true);
        document.getElementById('level-title').innerText = "CRASHED!";
        document.getElementById('level-stars').innerText = this.state.score;
        
        document.getElementById('continue-btn').style.display = 'block';
        document.getElementById('resume-btn').style.display = 'none';
        document.getElementById('ad-container').style.display = 'none';
        this.showScreen('level-screen');
    },

    win() {
        this.state.screen = 'win';
        this.storage.data.level++;
        this.storage.save();
        
        document.getElementById('level-title').innerText = "LEVEL CLEAR!";
        document.getElementById('level-stars').innerText = this.state.score;
        
        document.getElementById('continue-btn').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'block';
        document.getElementById('resume-btn').innerText = "NEXT LEVEL";
        this.showScreen('level-screen');
    },

    runAdSequence() {
        const adBox = document.getElementById('ad-container');
        const timerTxt = document.getElementById('ad-timer');
        const contBtn = document.getElementById('continue-btn');
        
        contBtn.style.display = 'none';
        adBox.style.display = 'block';
        
        let count = 5;
        timerTxt.innerText = count;
        
        const itv = setInterval(() => {
            count--;
            timerTxt.innerText = count;
            if(count <= 0) {
                clearInterval(itv);
                // Попытка показать реальную рекламу
                if(AdController) {
                    AdController.show()
                        .then(() => this.finishAd())
                        .catch(() => this.finishAd());
                } else {
                    this.finishAd();
                }
            }
        }, 1000);
    },

    finishAd() {
        document.getElementById('ad-container').style.display = 'none';
        const resBtn = document.getElementById('resume-btn');
        resBtn.style.display = 'block';
        resBtn.innerText = "RESUME LEVEL";
    },

    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        const max = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        for(let i=1; i<=max; i++) {
            const img = document.createElement('img');
            img.src = `ufo_ship${this.storage.data.current > 1 ? this.storage.data.current : ''}.png`;
            if(i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    openShop() {
        const container = document.getElementById('shop-content');
        container.innerHTML = '';

        // Пакет жизней
        const lifePrice = (this.storage.data.livesPlus + 1) * 150;
        container.innerHTML += `
            <div class="shop-item">
                <div class="shop-info">
                    <img src="ufo_ship.png" class="shop-icon-life">
                    <div class="shop-desc">
                        <span class="shop-title">+1 LIFE SLOT</span>
                        <span class="shop-sub">Extra chance per run</span>
                    </div>
                </div>
                <button class="shop-buy-btn" onclick="Game.buyLife(${lifePrice})">${lifePrice} ⭐</button>
            </div>`;

        // Корабли
        for(let i=2; i<=5; i++) {
            const price = i * 300;
            const isUnlocked = this.storage.data.unlocked.includes(i);
            const isCurrent = this.storage.data.current === i;
            
            container.innerHTML += `
                <div class="shop-item" style="${isCurrent ? 'border-color:var(--gold)' : ''}">
                    <div class="shop-info">
                        <img src="ufo_ship${i}.png" class="shop-icon-ufo">
                        <div class="shop-desc">
                            <span class="shop-title">UFO CLASS ${i}</span>
                            <span class="shop-sub">${SHIP_STATS[i].thrust * 100}% Power</span>
                        </div>
                    </div>
                    <button class="shop-buy-btn" onclick="Game.buyShip(${i}, ${price})" ${isCurrent ? 'disabled' : ''}>
                        ${isCurrent ? 'ACTIVE' : (isUnlocked ? 'SELECT' : price + ' ⭐')}
                    </button>
                </div>`;
        }
        this.showScreen('shop-screen');
    },

    buyLife(p) {
        if(this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            this.storage.data.livesPlus++;
            this.storage.save();
            this.openShop();
        }
    },

    buyShip(id, p) {
        if(this.storage.data.unlocked.includes(id)) {
            this.storage.data.current = id;
            this.storage.save();
            this.openShop();
            return;
        }
        if(this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            this.storage.data.unlocked.push(id);
            this.storage.data.current = id;
            this.storage.save();
            this.openShop();
        }
    },

    togglePause() {
        if(this.state.screen === 'playing') {
            this.state.screen = 'paused';
            MusicMgr.dim(true);
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('continue-btn').style.display = 'none';
            document.getElementById('resume-btn').style.display = 'block';
            document.getElementById('resume-btn').innerText = "RESUME";
            this.showScreen('level-screen');
        }
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Звезды фона
        this.ctx.fillStyle = "white";
        this.stars.forEach(s => {
            this.ctx.globalAlpha = 0.5;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.s, 0, Math.PI*2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;

        // Сущности
        this.entities.forEach(en => {
            const img = document.getElementById(en.type === 'star' ? 'star-img' : (en.r > 30 ? 'ast-b-img' : 'ast-s-img'));
            this.ctx.drawImage(img, en.x - en.r, en.y - en.r, en.r*2, en.r*2);
        });

        // Игрок
        const ufoImg = document.getElementById(`ufo-${this.storage.data.current}`);
        this.ctx.save();
        this.ctx.translate(this.ufo.x + this.ufo.w/2, this.ufo.y + this.ufo.h/2);
        
        // Эффект неуязвимости
        if(Date.now() < this.state.invul) this.ctx.globalAlpha = 0.5 + Math.sin(Date.now()/50)*0.2;
        
        // Наклон при движении
        const tilt = this.ufo.vy * 0.05;
        this.ctx.rotate(tilt);
        
        this.ctx.drawImage(ufoImg, -this.ufo.w/2, -this.ufo.h/2, this.ufo.w, this.ufo.h);
        this.ctx.restore();

        // Текст "Get Ready"
        if(this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "24px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TAP TO FLY", this.canvas.width/2, this.canvas.height/2 + 80);
        }
    },

    loop(t) {
        const dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(dt > 0.1 ? 0.016 : dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    }
};

Game.init();
