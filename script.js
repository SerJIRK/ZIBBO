const AdController = window.Adsgram?.init({ blockId: "e914e8d463c140da947118bcb514bd9a" });

// === SHIP PHYSICS & STATS ===
const SHIP_STATS = {
    1: { thrust: 0.55, damping: 0.98, name: "Starter UFO" },
    2: { thrust: 0.65, damping: 0.97, name: "Speeder Class" }, // Точнее
    3: { thrust: 0.75, damping: 0.96, name: "Tanker Class" }, // Еще точнее
    4: { thrust: 0.85, damping: 0.95, name: "Neon Class" },
    5: { thrust: 1.00, damping: 0.94, name: "Golden Class" }  // Самый резкий
};

// === MUSIC ENGINE ===
const MusicMgr = {
    currentTrack: null,
    tracks: ['track5.ogg'], 
    trackIndex: 0,
    enabled: false,
    
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.playNext();
        } else {
            this.stopAll();
        }
        document.getElementById('music-btn').innerText = this.enabled ? "MUSIC ON" : "MUSIC OFF";
    },

    playNext() {
        if (!this.enabled) return;
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }

        const file = this.tracks[this.trackIndex];
        this.currentTrack = new Audio(file);
        this.currentTrack.volume = 1.0;
        
        // Автопереключение
        this.currentTrack.addEventListener('ended', () => {
            this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
            this.playNext();
        });

        this.currentTrack.play().catch(e => console.log("Music play error:", e));
    },

    stopAll() {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    },

    setVolume(vol) {
        if (this.currentTrack && this.enabled) {
            this.currentTrack.volume = vol;
        }
    }
};

// === SOUND EFFECTS ===
const AudioMgr = {
    sounds: {},
    init() {
        ['button_click', 'collect', 'hit'].forEach(s => {
            this.sounds[s] = new Audio(`${s}.ogg`);
            this.sounds[s].volume = 0.8;
        });
    },
    play(name) {
        if (this.sounds[name] && MusicMgr.enabled) {
            this.sounds[name].currentTime = 0;
            this.sounds[name].play().catch(() => {});
        }
    }
};

// === GAME CORE ===
const Game = {
    state: { screen: 'splash', score: 0, lives: 1, level: 1, timeLeft: 60, lastTime: 0, invul: 0 },
    ufo: { x: 0, y: 0, w: 75, h: 50, vy: 0, thrust: false, angle: 0 },
    entities: [],
    parallaxStars: [],
    
    init() {
        AudioMgr.init();
        this.storage.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.createStars();
        window.onresize = () => this.resize();

        // Input Handlers
        const startAction = (e) => { 
            if(this.state.screen === 'playing') this.ufo.thrust = true; 
            if(this.state.screen === 'waiting') this.state.screen = 'playing';
            if(e.type === 'touchstart') e.preventDefault();
        };
        const endAction = () => this.ufo.thrust = false;
        
        this.canvas.addEventListener('mousedown', startAction);
        window.addEventListener('mouseup', endAction);
        this.canvas.addEventListener('touchstart', startAction, {passive: false});
        window.addEventListener('touchend', endAction);

        // Buttons
        document.getElementById('play-btn').onclick = () => { 
            AudioMgr.play('button_click'); 
            this.prepareLevel(this.storage.data.level); 
        };
        document.getElementById('new-game-btn').onclick = () => {
            AudioMgr.play('button_click');
            document.getElementById('confirm-screen').classList.add('active');
        };
        document.getElementById('confirm-yes').onclick = () => {
            AudioMgr.play('button_click');
            this.storage.reset();
            document.getElementById('confirm-screen').classList.remove('active');
            this.prepareLevel(1);
        };
        document.getElementById('confirm-no').onclick = () => {
            AudioMgr.play('button_click');
            document.getElementById('confirm-screen').classList.remove('active');
        };
        document.getElementById('music-btn').onclick = () => {
            AudioMgr.play('button_click');
            MusicMgr.toggle();
        };
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('continue-btn').onclick = () => this.togglePause();
        document.getElementById('resume-btn').onclick = () => this.prepareLevel(this.state.level);
        document.getElementById('shop-btn-pause').onclick = () => this.openShop();
        document.getElementById('close-shop').onclick = () => this.showScreen('level-screen'); // Return to pause/end screen
        document.getElementById('home-btn-menu').onclick = () => location.reload();

        this.loop(0);
    },

    createStars() {
        this.parallaxStars = [];
        for(let i=0; i<100; i++) {
            this.parallaxStars.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                size: Math.random() * 2,
                speed: 0.5 + Math.random() * 2,
                opacity: 0.2 + Math.random() * 0.8
            });
        }
    },

    storage: {
        data: { stars: 0, unlocked: [1], current: 1, livesPlus: 0, level: 1 },
        load() {
            const s = localStorage.getItem('zibbo_final_v2');
            if(s) this.data = JSON.parse(s);
            this.sync();
        },
        save() {
            localStorage.setItem('zibbo_final_v2', JSON.stringify(this.data));
            this.sync();
        },
        reset() {
            this.data = { stars: 0, unlocked: [1], current: 1, livesPlus: 0, level: 1 };
            this.save();
        },
        sync() {
            document.getElementById('total-stars-display-main').innerText = this.data.stars;
            document.getElementById('total-stars-display-shop').innerText = this.data.stars;
            document.getElementById('current-lvl-display').innerText = this.data.level;
        }
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ufo.x = this.canvas.width * 0.15;
    },

    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        const screen = document.getElementById(id);
        if(screen) screen.classList.add('active');
        if(id === 'hud' || id === 'playing' || id === 'waiting') document.getElementById('hud').classList.add('active');
    },

    prepareLevel(lvl) {
        MusicMgr.setVolume(1.0);
        this.state.level = lvl;
        // Logic: 1 Base + Purchased + (ShipLevel - 1)
        this.state.lives = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        this.state.score = 0;
        this.state.timeLeft = 60;
        this.entities = [];
        this.ufo.y = this.canvas.height / 2 - this.ufo.h / 2;
        this.ufo.vy = 0;
        this.state.screen = 'waiting'; 
        this.showScreen('hud');
        this.updateLivesUI();
        if(MusicMgr.enabled && !MusicMgr.currentTrack) MusicMgr.playNext();
    },

    togglePause() {
        AudioMgr.play('button_click');
        if(this.state.screen === 'playing' || this.state.screen === 'waiting') {
            MusicMgr.setVolume(0.1);
            this.state.screen = 'paused';
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('ad-container').style.display = 'none';
            document.getElementById('resume-btn').style.display = 'block';
            document.getElementById('continue-btn').style.display = 'none';
            document.getElementById('level-btns').style.display = 'flex';
            this.showScreen('level-screen');
        } else {
            MusicMgr.setVolume(1.0);
            this.state.screen = 'waiting';
            this.showScreen('hud');
        }
    },

    openShop() {
        AudioMgr.play('button_click');
        MusicMgr.setVolume(0.1);
        const grid = document.getElementById('shop-content');
        grid.innerHTML = '';
        
        // --- 1. Life Upgrade ---
        const lifePrice = (this.storage.data.livesPlus + 1) * 100;
        const lifeDiv = document.createElement('div');
        lifeDiv.className = 'shop-item';
        lifeDiv.innerHTML = `
            <div class="shop-info">
                <img src="ufo_ship.png" class="shop-icon">
                <div class="shop-desc">
                    <span class="shop-title">+1 LIFE</span>
                    <span class="shop-sub">Permanent Upgrade</span>
                </div>
            </div>
            <button class="shop-buy-btn" onclick="Game.buyLife(${lifePrice}, this)">${lifePrice} ⭐</button>
        `;
        grid.appendChild(lifeDiv);

        // --- 2. Next Ship ---
        const nextShipIdx = this.storage.data.unlocked.length + 1;
        if(nextShipIdx <= 5) {
            const shipPrice = nextShipIdx * 100 + 100; // 200, 300, 400...
            const shipDiv = document.createElement('div');
            shipDiv.className = 'shop-item';
            shipDiv.innerHTML = `
                <div class="shop-info">
                    <img src="ufo_ship${nextShipIdx}.png" class="shop-icon">
                    <div class="shop-desc">
                        <span class="shop-title">UFO CLASS ${nextShipIdx}</span>
                        <span class="shop-sub">Better Physics</span>
                    </div>
                </div>
                <button class="shop-buy-btn" onclick="Game.buyShip(${nextShipIdx}, ${shipPrice}, this)">${shipPrice} ⭐</button>
            `;
            grid.appendChild(shipDiv);
        } else {
            const maxDiv = document.createElement('div');
            maxDiv.className = 'shop-item';
            maxDiv.innerHTML = `<div style="text-align:center; width:100%; color:#aaa;">MAX SHIPS REACHED</div>`;
            grid.appendChild(maxDiv);
        }

        this.showScreen('shop-screen');
    },

    buyLife(price, btn) {
        if(this.storage.data.stars >= price) {
            this.storage.data.stars -= price;
            this.storage.data.livesPlus++;
            this.storage.save();
            AudioMgr.play('collect');
            this.openShop(); // Refresh
        } else {
            this.failBuy(btn);
        }
    },

    buyShip(idx, price, btn) {
        if(this.storage.data.stars >= price) {
            this.storage.data.stars -= price;
            this.storage.data.unlocked.push(idx);
            this.storage.data.current = idx;
            this.storage.save();
            AudioMgr.play('collect');
            this.openShop();
        } else {
            this.failBuy(btn);
        }
    },

    failBuy(btn) {
        AudioMgr.play('hit');
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 300);
    },

    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        let totalLives = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        for(let i=1; i<=totalLives; i++) {
            const img = document.createElement('img');
            img.src = `ufo_ship${this.storage.data.current > 1 ? this.storage.data.current : ''}.png`;
            if(i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    update(dt) {
        // Always scroll bg stars
        this.parallaxStars.forEach(s => {
            s.x -= s.speed * (this.state.screen === 'playing' ? 2.5 : 0.5);
            if(s.x < 0) s.x = this.canvas.width;
        });

        if(this.state.screen !== 'playing') return;

        // Apply physics based on current ship
        const stats = SHIP_STATS[this.storage.data.current] || SHIP_STATS[1];

        if(this.ufo.thrust) this.ufo.vy -= stats.thrust;
        this.ufo.vy += 0.35; 
        this.ufo.vy *= stats.damping;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.max(-0.3, Math.min(0.3, this.ufo.vy * 0.05));

        if(this.ufo.y < 0) { this.ufo.y = 0; this.ufo.vy = 0; }
        if(this.ufo.y > this.canvas.height - this.ufo.h) this.onHit();

        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
        if(this.state.timeLeft <= 0) this.levelComplete();

        if(Math.random() < 0.02) this.spawn('star');
        if(Math.random() < 0.01 + (this.state.level*0.002)) this.spawn('ast');

        this.entities.forEach((en, i) => {
            en.x -= (4 + this.state.level * 0.3);
            if(en.type === 'ast') en.rotation += en.rotSpeed;

            let dx = (this.ufo.x + this.ufo.w/2) - en.x;
            let dy = (this.ufo.y + this.ufo.h/2) - en.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if(dist < en.r + 20 && Date.now() > this.state.invul) {
                if(en.type === 'star') {
                    this.state.score++;
                    AudioMgr.play('collect');
                    this.entities.splice(i, 1);
                } else {
                    this.onHit();
                }
            }
        });
        this.entities = this.entities.filter(en => en.x > -100);
        document.getElementById('game-score').innerText = this.state.score;
    },

    spawn(type) {
        this.entities.push({
            type,
            x: this.canvas.width + 100,
            y: Math.random() * (this.canvas.height - 100) + 50,
            r: type === 'star' ? 15 : 20 + Math.random()*25,
            rotation: Math.random() * Math.PI,
            rotSpeed: (Math.random() - 0.5) * 0.1
        });
    },

    onHit() {
        this.state.lives--;
        AudioMgr.play('hit');
        this.updateLivesUI();
        if(this.state.lives <= 0) {
            this.gameOver();
        } else {
            this.state.invul = Date.now() + 2000;
            this.ufo.y = this.canvas.height / 2 - this.ufo.h / 2;
            this.ufo.vy = 0;
            this.state.screen = 'waiting'; 
        }
    },

    gameOver() {
        MusicMgr.setVolume(0.1);
        this.state.screen = 'gameover';
        // Save score
        this.storage.data.stars += this.state.score;
        this.storage.save();
        
        document.getElementById('level-title').innerText = "CRASHED!";
        document.getElementById('level-stars').innerText = this.state.score;
        
        const adBox = document.getElementById('ad-container');
        const btnBox = document.getElementById('level-btns');
        const timerTxt = document.getElementById('ad-timer');
        const resumeBtn = document.getElementById('resume-btn');
        const continueBtn = document.getElementById('continue-btn');

        adBox.style.display = 'block';
        btnBox.style.display = 'none';
        resumeBtn.style.display = 'none';
        continueBtn.style.display = 'none';
        
        this.showScreen('level-screen');

        let count = 5;
        timerTxt.innerText = count;
        const itv = setInterval(() => {
            count--;
            timerTxt.innerText = count;
            if(count <= 0) {
                clearInterval(itv);
                if(AdController) {
                    AdController.show().then(() => {
                        this.finalizeGameOver(adBox, btnBox, resumeBtn, continueBtn);
                    }).catch(() => {
                        this.finalizeGameOver(adBox, btnBox, resumeBtn, continueBtn);
                    });
                } else {
                    this.finalizeGameOver(adBox, btnBox, resumeBtn, continueBtn);
                }
            }
        }, 1000);
    },

    finalizeGameOver(adBox, btnBox, resumeBtn, continueBtn) {
        adBox.style.display = 'none';
        btnBox.style.display = 'flex';
        resumeBtn.style.display = 'block';
        continueBtn.style.display = 'none';
    },

    levelComplete() {
        MusicMgr.setVolume(0.1);
        this.state.screen = 'win';
        this.storage.data.level++;
        this.storage.data.stars += this.state.score;
        this.storage.save();
        document.getElementById('level-title').innerText = "LEVEL CLEAR!";
        document.getElementById('resume-btn').style.display = 'none';
        document.getElementById('continue-btn').style.display = 'block';
        this.showScreen('level-screen');
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. Draw Galaxy BG (Always)
        const bg = document.getElementById('galaxy-bg');
        if(bg.complete) this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);

        // 2. Stars
        this.parallaxStars.forEach(s => {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
            this.ctx.fill();
        });

        // 3. Entities
        this.entities.forEach(en => {
            this.ctx.save();
            this.ctx.translate(en.x, en.y);
            if(en.type === 'star') {
                let pulse = Math.sin(Date.now() / 200) * 0.1 + 1;
                this.ctx.scale(pulse, pulse);
                this.ctx.drawImage(document.getElementById('star-img'), -en.r, -en.r, en.r*2, en.r*2);
            } else {
                this.ctx.rotate(en.rotation);
                const img = document.getElementById(en.r > 30 ? 'ast-b-img' : 'ast-s-img');
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
            }
            this.ctx.restore();
        });

        // 4. Player
        // Рисуем НЛО если игра идет, ждет или на паузе (чтобы было видно фон в меню паузы)
        if(this.state.screen === 'playing' || this.state.screen === 'waiting' || this.state.screen === 'paused') {
            const ufoImg = document.getElementById(`ufo-${this.storage.data.current}`);
            this.ctx.save();
            this.ctx.translate(this.ufo.x + this.ufo.w/2, this.ufo.y + this.ufo.h/2);
            this.ctx.rotate(this.ufo.angle);
            if(Date.now() < this.state.invul) this.ctx.globalAlpha = 0.6;
            this.ctx.drawImage(ufoImg, -this.ufo.w/2, -this.ufo.h/2, this.ufo.w, this.ufo.h);
            this.ctx.restore();
        }

        // Waiting Text
        if(this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "30px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = "black";
            this.ctx.fillText("TAP TO START", this.canvas.width/2, this.canvas.height/2 + 80);
            this.ctx.shadowBlur = 0;
        }
    },

    loop(t) {
        let dt = (t - this.state.lastTime) / 1000;
        this.state.lastTime = t;
        this.update(dt > 0.1 ? 0.016 : dt);
        this.draw();
        requestAnimationFrame(t => this.loop(t));
    }
};

Game.init();
