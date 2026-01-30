// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// Инициализация Adsgram
let AdController = null;
window.addEventListener('load', () => {
    if (window.Adsgram) {
        AdController = window.Adsgram.init({
            blockId: "9a1dea9f8d134730875d57f334be6f6e", // Твой Block ID
            debug: false
        });
        console.log("Adsgram initialized");
    }
});

// === SETTINGS ===
const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98 },
    2: { thrust: 0.65, damping: 0.97 },
    3: { thrust: 0.75, damping: 0.96 },
    4: { thrust: 0.85, damping: 0.95 },
    5: { thrust: 1.00, damping: 0.94 }
};

// === SOUND MANAGER (SFX) ===
const SoundMgr = {
    sounds: {},
    enabled: false,

    init() {
        this.sounds['collect'] = new Audio('collect.ogg');
        this.sounds['hit'] = new Audio('hit.ogg');
        this.sounds['click'] = new Audio('button_click.ogg');
        this.sounds['level_done'] = new Audio('level_done.ogg');
        
        // Громкость SFX 70% по умолчанию
        Object.values(this.sounds).forEach(s => s.volume = 0.7);
    },

    play(name) {
        if (!this.enabled || !this.sounds[name]) return;
        // Клонируем ноду, чтобы звуки могли накладываться
        const clone = this.sounds[name].cloneNode();
        clone.volume = 0.7;
        clone.play().catch(() => {});
    }
};

// === MUSIC ENGINE ===
const MusicMgr = {
    currentTrack: null,
    tracks: [
        { ogg: 'track1.ogg' },
        { ogg: 'track2.ogg' },
        { ogg: 'track3.ogg' },
        { ogg: 'track4.ogg' }
    ],
    trackIndex: 0,
    enabled: false,
    
    toggle() {
        this.enabled = !this.enabled;
        // Синхронизируем SFX с музыкой
        SoundMgr.enabled = this.enabled; 

        if (this.enabled) {
            this.playTrack(this.trackIndex);
            document.getElementById('music-btn').innerText = "MUSIC ON";
        } else {
            this.stop();
            document.getElementById('music-btn').innerText = "MUSIC OFF";
        }
        SoundMgr.play('click');
    },
    
    playTrack(index) {
        if (!this.enabled) return;
        this.stop();
        
        this.trackIndex = index % this.tracks.length;
        const track = this.tracks[this.trackIndex];
        
        this.currentTrack = new Audio(track.ogg);
        this.currentTrack.volume = 1.0;
        
        // Авто-переключение трека после окончания
        this.currentTrack.addEventListener('ended', () => {
            this.next();
        });

        this.currentTrack.play().catch(err => {
            console.log("Audio waiting for user interaction:", err);
        });
    },
    
    next() {
        if (!this.enabled) return;
        this.trackIndex++;
        this.playTrack(this.trackIndex);
        SoundMgr.play('click');
    },
    
    stop() {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    },
    
    setVolume(vol) {
        if (this.currentTrack) this.currentTrack.volume = vol;
    }
};

// === GAME ENGINE ===
const Game = {
    state: {
        screen: 'splash',
        level: 1,
        score: 0,
        timeLeft: 60,
        lives: 1,
        lastTime: 0,
        invul: 0,
        speedBoost: false, // Флаг ускорения в конце уровня
        lastStarWave: 0    // Таймер для волн звезд
    },
    
    ufo: { x: 50, y: 0, vy: 0, thrust: false, w: 60, h: 40, angle: 0 },
    entities: [],
    bgStars: [], // Фоновые звезды
    
    init() {
        this.storage.load();
        SoundMgr.init();
        
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createStarfield();
        
        // Inputs
        const startAction = (e) => {
            if (this.state.screen === 'playing') this.ufo.thrust = true;
            if (this.state.screen === 'waiting') {
                this.state.screen = 'playing';
                this.state.lastStarWave = this.state.timeLeft; // Сброс таймера волн
            }
            if (e.type === 'touchstart') e.preventDefault();
        };
        
        const stopAction = () => { 
            this.ufo.thrust = false; 
        };
        
        this.canvas.addEventListener('mousedown', startAction);
        this.canvas.addEventListener('touchstart', startAction, { passive: false });
        window.addEventListener('mouseup', stopAction);
        window.addEventListener('touchend', stopAction);
        
        // Menu Bindings
        document.getElementById('play-btn').onclick = () => {
            SoundMgr.play('click');
            this.prepareLevel(this.storage.data.level);
        };
        document.getElementById('new-game-btn').onclick = () => {
            SoundMgr.play('click');
            document.getElementById('confirm-screen').classList.add('active');
        };
        document.getElementById('confirm-yes').onclick = () => {
            SoundMgr.play('click');
            this.storage.reset();
        };
        document.getElementById('confirm-no').onclick = () => {
            SoundMgr.play('click');
            document.getElementById('confirm-screen').classList.remove('active');
        };
        
        document.getElementById('music-btn').onclick = () => MusicMgr.toggle();
        document.getElementById('next-track-btn').onclick = () => MusicMgr.next();
        document.getElementById('pause-btn').onclick = () => {
            SoundMgr.play('click');
            this.togglePause();
        };
        
        // Кнопки меню паузы / магазина / выигрыша
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('shop-btn-pause').onclick = () => {
            SoundMgr.play('click');
            this.openShop();
        };
        document.getElementById('close-shop').onclick = () => {
            SoundMgr.play('click');
            // Если пришли из паузы или победы - возвращаемся в level-screen, иначе в меню
            const returnTo = (this.state.screen === 'paused' || this.state.screen === 'win') ? 'level-screen' : 'menu-screen';
            this.showScreen(returnTo);
        };
        
        // Ads & Resume logic
        document.getElementById('continue-btn').onclick = () => {
            SoundMgr.play('click');
            this.runAdSequence();
        };
        document.getElementById('resume-btn').onclick = () => {
            SoundMgr.play('click');
            this.state.screen = 'playing'; // Просто снимаем с паузы
            this.showScreen('hud');
        };
        
        // Win Screen Buttons
        document.getElementById('win-next-btn').onclick = () => {
            SoundMgr.play('click');
            this.prepareLevel(this.storage.data.level);
        };
        document.getElementById('win-track-btn').onclick = () => {
            MusicMgr.next();
        };
        
        window.addEventListener('resize', () => this.resize());
        
        // Инициализация окон
        setTimeout(() => {
             this.showScreen('splash-screen');
             // Имитация загрузки
             setTimeout(() => {
                 this.showScreen('menu-screen');
             }, 2000);
        }, 100);
        
        this.loop(0);
    },
    
    storage: {
        data: { stars: 0, unlockedUfo: [1], currentUfo: 1, livesPlus: 0, level: 1 },
        
        load() {
            const saved = localStorage.getItem('zibbo_blockbuster_v2');
            if (saved) this.data = JSON.parse(saved);
            this.sync();
        },
        
        save() {
            localStorage.setItem('zibbo_blockbuster_v2', JSON.stringify(this.data));
            this.sync();
        },
        
        sync() {
            document.getElementById('total-stars-display-main').innerText = `⭐ ${this.data.stars}`;
            document.getElementById('total-stars-display-shop').innerText = `⭐ ${this.data.stars}`;
            document.getElementById('current-lvl-display').innerText = this.data.level;
        },
        
        reset() {
            localStorage.removeItem('zibbo_blockbuster_v2');
            location.reload();
        }
    },
    
    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ufo.x = this.canvas.width * 0.15;
    },
    
    // Фоновые звезды (параллакс)
    createStarfield() {
        this.bgStars = [];
        for (let i = 0; i < 100; i++) {
            this.bgStars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                s: Math.random() * 2, // Размер
                v: 0.5 + Math.random() * 2 // Скорость
            });
        }
    },
    
    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        if (id === 'hud') {
             document.getElementById('hud').classList.add('active');
        } else if (id) {
             document.getElementById(id).classList.add('active');
        }
        
        // Управление громкостью музыки в меню/паузе
        if (id === 'hud') MusicMgr.setVolume(1.0);
        else MusicMgr.setVolume(0.5);
    },
    
    prepareLevel(lvl) {
        this.state.level = lvl;
        this.state.score = 0;
        this.state.timeLeft = 60;
        this.state.screen = 'waiting';
        this.state.speedBoost = false;
        this.state.lastStarWave = 60;
        this.entities = [];
        
        // Расчет жизней: 1 (база) + купленные слоты + (класс НЛО - 1)
        this.state.lives = 1 + this.storage.data.livesPlus + (this.storage.data.currentUfo - 1);
        
        this.ufo.y = this.canvas.height / 2;
        this.ufo.vy = 0;
        this.ufo.angle = 0;
        
        this.updateLivesUI();
        this.showScreen('hud');
        document.getElementById('game-score').innerText = "0";
    },
    
    triggerHaptic() {
        // iOS
        if (tg && tg.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }
        // Android fallback
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    },
    
    update(dt) {
        // Движение фона
        const bgSpeed = (this.state.screen === 'playing' && this.state.speedBoost) ? 8 : (this.state.screen === 'playing' ? 3 : 0.5);
        this.bgStars.forEach(s => {
            s.x -= s.v * bgSpeed * dt * 60; // Нормализация к 60 FPS
            if (s.x < 0) s.x = this.canvas.width;
        });
        
        if (this.state.screen !== 'playing') return;
        
        // Физика корабля
        const stats = SHIP_STATS[this.storage.data.currentUfo];
        
        if (this.ufo.thrust) this.ufo.vy -= stats.thrust;
        this.ufo.vy += 0.4; // Гравитация
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = this.ufo.vy * 0.04;
        
        if (this.ufo.y < 0 || this.ufo.y > this.canvas.height - this.ufo.h) this.onHit();
        
        // Таймер
        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
        
        // Логика конца уровня
        if (this.state.timeLeft <= 10 && !this.state.speedBoost) {
            this.state.speedBoost = true; // Включаем ускорение/блюр
        }
        
        if (this.state.timeLeft <= 0) this.win();
        
        // === SPAWNER ===
        const speedMult = 1 + (this.state.level * 0.02);
        const isEndgame = this.state.timeLeft < 5; // Последние 5 сек без астероидов
        
        // 1. Обычные астероиды (если не конец уровня)
        if (!isEndgame && Math.random() < (0.015 + this.state.level * 0.001)) {
            this.spawn('ast');
        }
        
        // 2. Обычные одиночные звезды
        if (Math.random() < 0.02) this.spawn('star');
        
        // 3. ВОЛНЫ ЗВЕЗД (каждые 10 сек игрового времени)
        // Таймер идет вниз, поэтому проверяем разницу
        if (this.state.lastStarWave - this.state.timeLeft >= 10) {
            this.spawnStarWave();
            this.state.lastStarWave = this.state.timeLeft;
        }

        // Обновление сущностей
        this.entities.forEach((en, i) => {
            // Если ускорение, объекты летят быстрее
            let moveSpeed = (5 * speedMult);
            if (this.state.speedBoost) moveSpeed *= 2; 
            
            en.x -= moveSpeed;
            
            // Вращение астероидов
            if (en.type === 'ast') en.rot += 0.05;

            // Коллизии
            const dx = (this.ufo.x + 30) - en.x;
            const dy = (this.ufo.y + 20) - en.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist < en.r + 15 && Date.now() > this.state.invul) {
                if (en.type === 'star') {
                    // Сбор звезды
                    this.state.score++;
                    this.storage.data.stars++;
                    document.getElementById('game-score').innerText = this.state.score;
                    this.storage.save();
                    this.entities.splice(i, 1);
                    SoundMgr.play('collect');
                    // Легкая вибрация при сборе
                    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
                } else {
                    // Столкновение
                    this.onHit();
                }
            }
        });
        
        this.entities = this.entities.filter(en => en.x > -100);
    },
    
    spawn(type) {
        const size = type === 'star' ? 15 : (25 + Math.random() * 20); // Астероиды разных размеров (25-45 радиус -> 50-90 диаметр)
        this.entities.push({
            type,
            x: this.canvas.width + 100,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: size,
            rot: Math.random() * Math.PI // Начальный угол
        });
    },

    spawnStarWave() {
        // Генерируем "змейку" из 5 звезд
        const startY = Math.random() * (this.canvas.height - 200) + 100;
        for(let i=0; i<5; i++) {
            this.entities.push({
                type: 'star',
                x: this.canvas.width + 100 + (i * 60),
                y: startY + Math.sin(i) * 50, // Синусоида
                r: 15,
                rot: 0
            });
        }
    },
    
    onHit() {
        this.state.lives--;
        SoundMgr.play('hit');
        this.triggerHaptic();
        this.updateLivesUI();
        
        if (this.state.lives <= 0) {
            this.gameOver();
        } else {
            this.state.invul = Date.now() + 2000;
            // Отброс корабля чуть назад и в центр
            this.ufo.y = this.canvas.height / 2;
            this.ufo.vy = 0;
            // Небольшая пауза
            this.state.screen = 'waiting';
        }
    },
    
    gameOver() {
        this.state.screen = 'crashed';
        document.getElementById('level-title').innerText = "CRASHED!";
        document.getElementById('level-stars').innerText = this.state.score;
        
        // Кнопки для проигрыша
        document.getElementById('continue-btn').style.display = 'block'; // Реклама
        document.getElementById('resume-btn').style.display = 'none';
        document.getElementById('win-next-btn').style.display = 'none';
        document.getElementById('win-track-btn').style.display = 'none';
        
        this.showScreen('level-screen');
    },
    
    win() {
        this.state.screen = 'win';
        if (this.state.level === this.storage.data.level) {
            this.storage.data.level++;
            this.storage.save();
        }
        
        // Звук победы + приглушение музыки
        MusicMgr.setVolume(0.1);
        SoundMgr.play('level_done');
        setTimeout(() => { if(this.state.screen==='win') MusicMgr.setVolume(0.5); }, 3000);

        document.getElementById('level-title').innerText = `LEVEL ${this.state.level-1} DONE!`;
        document.getElementById('level-stars').innerText = this.state.score;
        
        // Настройка кнопок WIN SCREEN
        document.getElementById('continue-btn').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'none';
        
        // Показываем 4 кнопки как ты просил
        const nextBtn = document.getElementById('win-next-btn');
        const trackBtn = document.getElementById('win-track-btn');
        nextBtn.style.display = 'block';
        nextBtn.innerText = "CONTINUE";
        trackBtn.style.display = 'block';

        this.showScreen('level-screen');
    },
    
    runAdSequence() {
        MusicMgr.setVolume(0);
        const adBox = document.getElementById('ad-container');
        const timerTxt = document.getElementById('ad-timer');
        
        // Скрываем кнопки
        document.getElementById('level-btns').style.display = 'none';
        adBox.style.display = 'flex';
        
        let count = 3;
        timerTxt.innerText = count;
        
        const itv = setInterval(() => {
            count--;
            timerTxt.innerText = count;
            if (count <= 0) {
                clearInterval(itv);
                
                // Запуск Adsgram
                if (AdController) {
                    AdController.show()
                        .then((result) => {
                            // Реклама просмотрена
                            this.finishAd(true);
                        })
                        .catch((result) => {
                            // Ошибка или пропуск (все равно даем жизнь, чтобы не бесить)
                            console.log(result);
                            this.finishAd(true);
                        });
                } else {
                    // Если реклама не загрузилась (adblock и т.д.)
                    this.finishAd(true);
                }
            }
        }, 1000);
    },
    
    finishAd(success) {
        document.getElementById('ad-container').style.display = 'none';
        document.getElementById('level-btns').style.display = 'flex';
        
        if (success) {
            // Воскрешение
            this.state.lives = 1;
            this.updateLivesUI();
            this.state.screen = 'waiting';
            this.state.invul = Date.now() + 3000;
            this.ufo.y = this.canvas.height / 2;
            this.ufo.vy = 0;
            this.showScreen('hud');
            MusicMgr.setVolume(1.0);
        } else {
            MusicMgr.setVolume(0.5);
            // Возврат в меню луз скрина
            document.getElementById('continue-btn').style.display = 'block';
        }
    },
    
    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        const max = 1 + this.storage.data.livesPlus + (this.storage.data.currentUfo - 1);
        for (let i = 1; i <= max; i++) {
            const img = document.createElement('img');
            const ufoNum = this.storage.data.currentUfo > 1 ? this.storage.data.currentUfo : 1;
            // Используем PNG иконку для жизней, а не гифку
            img.src = `ufo_ship${ufoNum > 1 ? ufoNum : ''}.png`;
            if (i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },
    
    openShop() {
        const container = document.getElementById('shop-content');
        container.innerHTML = '';
        
        // 1. Life Slots
        const lifePrices = [150, 300, 500, 800, 1000];
        const curL = this.storage.data.livesPlus;
        if (curL < 5) {
            const p = lifePrices[curL];
            container.innerHTML += `
                <div class="shop-item">
                    <div class="shop-info">
                        <img src="ufo_ship.png" class="shop-icon-life">
                        <div>
                            <div class="shop-title">+1 LIFE SLOT</div>
                            <div class="shop-sub">Permanent Upgrade</div>
                        </div>
                    </div>
                    <button class="shop-buy-btn" onclick="Game.buyLife(${p})">${p} ⭐</button>
                </div>`;
        }
        
        // 2. Next UFO
        const ufoLevel = this.storage.data.currentUfo;
        if (ufoLevel < 5) {
            const nextLevel = ufoLevel + 1;
            const p = nextLevel * 250;
            container.innerHTML += `
                <div class="shop-item">
                    <div class="shop-info">
                        <img src="ufo_ship${nextLevel}.png" class="shop-icon-ufo">
                        <div>
                            <div class="shop-title">UFO CLASS ${nextLevel}</div>
                            <div class="shop-sub">+ Speed & Handling</div>
                        </div>
                    </div>
                    <button class="shop-buy-btn" onclick="Game.buyShip(${nextLevel}, ${p})">${p} ⭐</button>
                </div>`;
        }
        this.showScreen('shop-screen');
    },
    
    buyLife(p) {
        SoundMgr.play('click');
        if (this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            this.storage.data.livesPlus++;
            this.storage.save();
            this.openShop();
        }
    },
    
    buyShip(id, p) {
        SoundMgr.play('click');
        if (this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            this.storage.data.unlockedUfo.push(id);
            this.storage.data.currentUfo = id;
            this.storage.save();
            this.openShop();
        }
    },
    
    togglePause() {
        if (this.state.screen === 'playing') {
            this.state.screen = 'paused';
            document.getElementById('level-title').innerText = "PAUSED";
            
            // Настройка кнопок ПАУЗЫ
            document.getElementById('continue-btn').style.display = 'none'; // Реклама не нужна
            document.getElementById('resume-btn').style.display = 'block';
            document.getElementById('win-next-btn').style.display = 'none';
            document.getElementById('win-track-btn').style.display = 'none';
            
            this.showScreen('level-screen');
        }
    },
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. ФОН: Эффект ускорения (размытие звезд)
        if (this.state.speedBoost) {
            // Оставляем шлейф для эффекта скорости
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; 
            this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        } 
        
        // 2. Рисуем звезды фона
        this.ctx.fillStyle = "white";
        this.bgStars.forEach(s => {
            this.ctx.globalAlpha = (Math.sin(Date.now() / 200 + s.x) + 1) / 2 * 0.5 + 0.3; // Мерцание
            this.ctx.beginPath();
            // Если ускорение - рисуем линии вместо точек
            if (this.state.speedBoost) {
                 this.ctx.rect(s.x, s.y, s.s * 10, s.s); // Длинные полосы
            } else {
                 this.ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
            }
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;
        
        // 3. Игровые объекты
        this.entities.forEach(en => {
            const imgId = en.type === 'star' ? 'star-img' : (en.r > 30 ? 'ast-b-img' : 'ast-s-img');
            const img = document.getElementById(imgId);
            
            this.ctx.save();
            this.ctx.translate(en.x, en.y);
            
            if (en.type !== 'star') {
                this.ctx.rotate(en.rot); // Вращение астероидов
            } else {
                // Пульсация звезд
                const scale = 1 + Math.sin(Date.now() / 200) * 0.1;
                this.ctx.scale(scale, scale);
            }
            
            if (img && img.complete) {
                this.ctx.drawImage(img, -en.r, -en.r, en.r * 2, en.r * 2);
            }
            this.ctx.restore();
        });
        
        // 4. Игрок
        if (this.state.screen !== 'splash') {
            const ufoNum = this.storage.data.currentUfo;
            const ufoImg = document.getElementById(`ufo-${ufoNum}`);
            
            if (ufoImg && ufoImg.complete) {
                this.ctx.save();
                this.ctx.translate(this.ufo.x + 30, this.ufo.y + 20);
                this.ctx.rotate(this.ufo.angle);
                
                // Мигание при неуязвимости
                if (Date.now() < this.state.invul) {
                    this.ctx.globalAlpha = Math.sin(Date.now() / 50) * 0.3 + 0.6;
                }
                
                this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
                this.ctx.restore();
            }
        }
        
        // Текст "TAP TO START"
        if (this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "30px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "black";
            this.ctx.fillText("TAP TO START", this.canvas.width / 2, this.canvas.height / 2 + 80);
            this.ctx.shadowBlur = 0;
        }
    },
    
    loop(t) {
        const dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        // Ограничение dt для плавности
        this.update(dt > 0.1 ? 0.016 : dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    }
};

// Запуск после загрузки шрифтов
window.onload = () => {
    document.fonts.ready.then(() => {
        Game.init();
    });
};
