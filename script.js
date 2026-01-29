// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
}

// Инициализация Adsgram (отложенная)
let AdController = null;
window.addEventListener('load', () => {
    if (window.Adsgram) {
        AdController = window.Adsgram.init({
            blockId: "9a1dea9f8d134730875d57f334be6f6e",
            debug: true
        });
        console.log("Adsgram initialized");
    }
});

// === SHIP PHYSICS ===
const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98 },
    2: { thrust: 0.65, damping: 0.97 },
    3: { thrust: 0.75, damping: 0.96 },
    4: { thrust: 0.85, damping: 0.95 },
    5: { thrust: 1.00, damping: 0.94 }
};

// === MUSIC ENGINE ===
const MusicMgr = {
    currentTrack: null,
    tracks: [
       { ogg: 'track1.ogg' },
        { ogg: 'track2.ogg' },
        { ogg: 'track3.ogg' }
    ],
    trackIndex: 0,
    enabled: false,
    
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.playRandom();
            document.getElementById('music-btn').innerText = "MUSIC ON";
        } else {
            this.stop();
            document.getElementById('music-btn').innerText = "MUSIC OFF";
        }
    },
    
    playRandom() {
        if (!this.enabled) return;
        this.stop();
        
        this.trackIndex = Math.floor(Math.random() * this.tracks.length);
        const track = this.tracks[this.trackIndex];
        const audio = new Audio();
        const canPlayMP3 = audio.canPlayType('audio/mpeg');
        
        if (canPlayMP3 && track.mp3) {
            this.currentTrack = new Audio(track.mp3);
            console.log("Playing MP3:", track.mp3);
        } else if (track.ogg) {
            this.currentTrack = new Audio(track.ogg);
            console.log("Playing OGG:", track.ogg);
        } else {
            console.error("No supported audio format found");
            return;
        }
        
        this.currentTrack.loop = true;
        this.currentTrack.volume = 1.0;
        this.currentTrack.play().catch(err => {
            console.log("Audio waiting for user interaction:", err);
        });
    },
    
    next() {
        if (!this.enabled) return;
        this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
        this.playRandom();
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
        invul: 0
    },
    
    ufo: { x: 50, y: 0, vy: 0, thrust: false, w: 60, h: 40, angle: 0 },
    entities: [],
    stars: [],
    
    init() {
        this.storage.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createStarfield();
        
        // Inputs
        const startAction = (e) => {
            if (this.state.screen === 'playing') this.ufo.thrust = true;
            if (this.state.screen === 'waiting') this.state.screen = 'playing';
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
        document.getElementById('play-btn').onclick = () => this.prepareLevel(this.storage.data.level);
        document.getElementById('new-game-btn').onclick = () => document.getElementById('confirm-screen').classList.add('active');
        document.getElementById('confirm-yes').onclick = () => this.storage.reset();
        document.getElementById('confirm-no').onclick = () => document.getElementById('confirm-screen').classList.remove('active');
        document.getElementById('music-btn').onclick = () => MusicMgr.toggle();
        document.getElementById('next-track-btn').onclick = () => MusicMgr.next();
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('home-btn-menu').onclick = () => location.reload();
        document.getElementById('shop-btn-pause').onclick = () => this.openShop();
        document.getElementById('close-shop').onclick = () => this.showScreen(this.state.screen === 'paused' ? 'level-screen' : 'splash-screen');
        
        // Ads & Resume logic
        document.getElementById('continue-btn').onclick = () => this.runAdSequence();
        document.getElementById('resume-btn').onclick = () => {
            if (this.state.screen === 'win') this.prepareLevel(this.storage.data.level);
            else this.prepareLevel(this.state.level);
        };
        
        window.addEventListener('resize', () => this.resize());
        
        // 🔑 КРИТИЧЕСКИ ВАЖНО: показать сплеш-экран при старте!
        this.showScreen('splash-screen');
        
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
    
    createStarfield() {
        this.stars = [];
        for (let i = 0; i < 80; i++) {
            this.stars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                s: Math.random() * 2,
                v: 0.5 + Math.random() * 2
            });
        }
    },
    
    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        if (id) document.getElementById(id).classList.add('active');
        if (['hud', 'level-screen'].includes(id)) document.getElementById('hud').classList.add('active');
        
        // Volume Control
        if (id === 'playing' || id === 'hud') MusicMgr.setVolume(1.0);
        else MusicMgr.setVolume(0.5);
    },
    
    prepareLevel(lvl) {
        this.state.level = lvl;
        this.state.score = 0;
        this.state.timeLeft = 60;
        this.state.screen = 'waiting';
        this.entities = [];
        
        // Расчет жизней: 1 (база) + купленные слоты + (уровень НЛО - 1)
        this.state.lives = 1 + this.storage.data.livesPlus + (this.storage.data.currentUfo - 1);
        
        this.ufo.y = this.canvas.height / 2;
        this.ufo.vy = 0;
        this.ufo.angle = 0;
        
        this.updateLivesUI();
        this.showScreen('hud');
        document.getElementById('game-score').innerText = "0";
    },
    
    update(dt) {
        // Star Background
        this.stars.forEach(s => {
            s.x -= s.v * (this.state.screen === 'playing' ? 3 : 1);
            if (s.x < 0) s.x = this.canvas.width;
        });
        
        if (this.state.screen !== 'playing') return;
        
        const stats = SHIP_STATS[this.storage.data.currentUfo];
        const speedMult = 1 + (this.state.level * 0.02);
        const densityMult = 0.01 + (this.state.level * 0.001);
        
        if (this.ufo.thrust) this.ufo.vy -= stats.thrust;
        this.ufo.vy += 0.4;
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = this.ufo.vy * 0.04;
        
        if (this.ufo.y < 0 || this.ufo.y > this.canvas.height - this.ufo.h) this.onHit();
        
        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
        if (this.state.timeLeft <= 0) this.win();
        
        // Spawning
        if (Math.random() < 0.02) this.spawn('star');
        if (Math.random() < densityMult) this.spawn('ast');
        
        this.entities.forEach((en, i) => {
            en.x -= (5 * speedMult);
            
            const dx = (this.ufo.x + 30) - en.x;
            const dy = (this.ufo.y + 20) - en.y;
            const dist = Math.hypot(dx, dy);
            
            if (dist < en.r + 15 && Date.now() > this.state.invul) {
                if (en.type === 'star') {
                    this.state.score++;
                    this.storage.data.stars++;
                    document.getElementById('game-score').innerText = this.state.score;
                    this.storage.save();
                    this.entities.splice(i, 1);
                    if (tg) tg.HapticFeedback.impactOccurred('light');
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
        if (tg) tg.HapticFeedback.impactOccurred('heavy');
        this.updateLivesUI();
        
        if (this.state.lives <= 0) {
            this.gameOver();
        } else {
            this.state.invul = Date.now() + 2000;
            this.ufo.y = this.canvas.height / 2;
            this.ufo.vy = 0;
            this.state.screen = 'waiting';
        }
    },
    
    gameOver() {
        this.state.screen = 'crashed';
        document.getElementById('level-title').innerText = "CRASHED!";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').style.display = 'block';
        document.getElementById('resume-btn').style.display = 'none';
        this.showScreen('level-screen');
    },
    
    win() {
        this.state.screen = 'win';
        if (this.state.level === this.storage.data.level) {
            this.storage.data.level++;
            this.storage.save();
        }
        document.getElementById('level-title').innerText = "LEVEL CLEAR!";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('continue-btn').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'block';
        document.getElementById('resume-btn').innerText = "NEXT LEVEL";
        this.showScreen('level-screen');
    },
    
    runAdSequence() {
        MusicMgr.setVolume(0);
        const adBox = document.getElementById('ad-container');
        const timerTxt = document.getElementById('ad-timer');
        document.getElementById('continue-btn').style.display = 'none';
        adBox.style.display = 'flex';
        
        let count = 5;
        timerTxt.innerText = count;
        
        const itv = setInterval(() => {
            count--;
            timerTxt.innerText = count;
            if (count <= 0) {
                clearInterval(itv);
                adBox.style.display = 'none';
                
                if (AdController) {
                    console.log("Showing ad...");
                    AdController.show()
                        .then(() => {
                            console.log("Ad completed");
                            this.finishAd();
                        })
                        .catch(err => {
                            console.error("Ad error:", err);
                            this.finishAd();
                        });
                } else {
                    console.warn("AdController not available, skipping ad");
                    this.finishAd();
                }
            }
        }, 1000);
    },
    
    finishAd() {
        document.getElementById('ad-container').style.display = 'none';
        document.getElementById('resume-btn').style.display = 'block';
        document.getElementById('resume-btn').innerText = "RESUME";
        MusicMgr.setVolume(0.5);
    },
    
    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        const max = 1 + this.storage.data.livesPlus + (this.storage.data.currentUfo - 1);
        for (let i = 1; i <= max; i++) {
            const img = document.createElement('img');
            const ufoNum = this.storage.data.currentUfo > 1 ? this.storage.data.currentUfo : 1;
            img.src = `ufo_ship${ufoNum > 1 ? ufoNum : ''}.png`;
            if (i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },
    
    openShop() {
        const container = document.getElementById('shop-content');
        container.innerHTML = '';
        
        // 1. Life Slots logic
        const lifePrices = [150, 200, 300, 400, 500];
        const curL = this.storage.data.livesPlus;
        if (curL < 5) {
            const p = lifePrices[curL];
            container.innerHTML += `
                <div class="shop-item">
                    <div class="shop-info">
                        <img src="ufo_ship.png" class="shop-icon-life">
                        <div class="shop-desc">
                            <span class="shop-title">+1 LIFE SLOT</span>
                            <span class="shop-sub">Extra slot for any UFO</span>
                        </div>
                    </div>
                    <button class="shop-buy-btn" onclick="Game.buyLife(${p})">${p} ⭐</button>
                </div>`;
        }
        
        // 2. Next UFO logic
        const ufoLevel = this.storage.data.currentUfo;
        if (ufoLevel < 5) {
            const nextLevel = ufoLevel + 1;
            const p = nextLevel * 100;
            container.innerHTML += `
                <div class="shop-item">
                    <div class="shop-info">
                        <img src="ufo_ship${nextLevel}.png" class="shop-icon-ufo">
                        <div class="shop-desc">
                            <span class="shop-title">UFO CLASS ${nextLevel}</span>
                            <span class="shop-sub">+1 LIFE & MORE POWER</span>
                        </div>
                    </div>
                    <button class="shop-buy-btn" onclick="Game.buyShip(${nextLevel}, ${p})">${p} ⭐</button>
                </div>`;
        }
        this.showScreen('shop-screen');
    },
    
    buyLife(p) {
        if (this.storage.data.stars >= p) {
            this.storage.data.stars -= p;
            this.storage.data.livesPlus++;
            this.storage.save();
            this.openShop();
        }
    },
    
    buyShip(id, p) {
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
            document.getElementById('continue-btn').style.display = 'none';
            document.getElementById('resume-btn').style.display = 'block';
            document.getElementById('resume-btn').innerText = "RESUME";
            this.showScreen('level-screen');
        }
    },
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // ✅ ФОН ГАЛАКТИКИ ТОЛЬКО В ИГРЕ (не перекрывает сплеш-экран!)
        if (this.state.screen !== 'splash') {
            const bgImg = document.getElementById('galaxy-bg');
            if (bgImg && bgImg.complete) {
                this.ctx.drawImage(bgImg, 0, 0, this.canvas.width, this.canvas.height);
            } else {
                const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
                gradient.addColorStop(0, '#0a0a2a');
                gradient.addColorStop(1, '#00001a');
                this.ctx.fillStyle = gradient;
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }
        
        // Stars (параллакс)
        this.ctx.fillStyle = "white";
        this.stars.forEach(s => {
            this.ctx.globalAlpha = 0.6;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;
        
        // Entities
        this.entities.forEach(en => {
            const imgId = en.type === 'star' ? 'star-img' : (en.r > 30 ? 'ast-b-img' : 'ast-s-img');
            const img = document.getElementById(imgId);
            if (img && img.complete) {
                this.ctx.drawImage(img, en.x - en.r, en.y - en.r, en.r * 2, en.r * 2);
            }
        });
        
        // Player UFO
        if (this.state.screen !== 'splash') {
            const ufoImg = document.getElementById(`ufo-${this.storage.data.currentUfo}`);
            if (ufoImg && ufoImg.complete) {
                this.ctx.save();
                this.ctx.translate(this.ufo.x + 30, this.ufo.y + 20);
                this.ctx.rotate(this.ufo.angle);
                if (Date.now() < this.state.invul) {
                    this.ctx.globalAlpha = Math.sin(Date.now() / 50) * 0.3 + 0.6;
                }
                this.ctx.drawImage(ufoImg, -30, -20, 60, 40);
                this.ctx.restore();
            }
        }
        
        if (this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "20px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TAP TO START", this.canvas.width / 2, this.canvas.height / 2 + 60);
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

// Запуск игры
Game.init();
