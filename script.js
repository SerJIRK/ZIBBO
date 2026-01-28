const AdController = window.Adsgram?.init({ blockId: "9a1dea9f8d134730875d57f334be6f6e" });

const MusicMgr = {
    currentTrack: null,
    tracks: ['track1.mp3', 'track2.mp3', 'track3.mp3'], // Добавь сюда свои названия
    trackIndex: 0,
    enabled: false,
    
    toggle() {
        this.enabled = !this.enabled;
        if (this.enabled) {
            this.playTrack();
        } else {
            this.stopAll();
        }
        document.getElementById('music-btn').innerText = this.enabled ? "MUSIC ON" : "MUSIC OFF";
    },

    playTrack() {
        if (!this.enabled) return;
        this.stopAll();

        this.currentTrack = new Audio(this.tracks[this.trackIndex]);
        this.currentTrack.volume = 1.0;
        
        this.currentTrack.onended = () => {
            this.trackIndex = (this.trackIndex + 1) % this.tracks.length;
            this.playTrack();
        };

        this.currentTrack.play().catch(e => console.log("Audio play blocked", e));
    },

    stopAll() {
        if (this.currentTrack) {
            this.currentTrack.pause();
            this.currentTrack = null;
        }
    },

    dimMusic(isDim) {
        if (this.currentTrack && this.enabled) {
            this.currentTrack.volume = isDim ? 0.1 : 1.0;
        }
    }
};

const SHIP_STATS = {
    1: { thrust: 0.6, damping: 0.98 },
    2: { thrust: 0.75, damping: 0.96 },
    3: { thrust: 0.85, damping: 0.94 },
    4: { thrust: 0.95, damping: 0.92 },
    5: { thrust: 1.1, damping: 0.90 }
};

const AudioMgr = {
    sounds: {},
    init() {
        ['button_click', 'collect', 'hit'].forEach(s => {
            this.sounds[s] = new Audio(`${s}.ogg`);
        });
    },
    play(name) {
        if (this.sounds[name] && this.enabled) {
            this.sounds[name].currentTime = 0;
            this.sounds[name].play().catch(() => {});
        }
    }
};

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

        // Кнопки меню
        document.getElementById('play-btn').onclick = () => { 
            AudioMgr.play('button_click'); 
            this.prepareLevel(this.storage.data.level); 
        };

        document.getElementById('new-game-btn').onclick = () => {
            document.getElementById('confirm-screen').classList.add('active');
        };

        document.getElementById('confirm-yes').onclick = () => {
            this.storage.reset();
            document.getElementById('confirm-screen').classList.remove('active');
            this.prepareLevel(1);
        };

        document.getElementById('confirm-no').onclick = () => {
            document.getElementById('confirm-screen').classList.remove('active');
        };
        
        document.getElementById('music-btn').onclick = () => {
            MusicMgr.toggle();
            AudioMgr.play('button_click');
        };

        document.getElementById('pause-btn').onclick = () => { this.togglePause(); };
        document.getElementById('continue-btn').onclick = () => { this.togglePause(); };
        document.getElementById('resume-btn').onclick = () => { this.prepareLevel(this.state.level); };
        document.getElementById('shop-btn-pause').onclick = () => { this.openShop(); };
        document.getElementById('close-shop').onclick = () => { this.showScreen('level-screen'); };
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
            const s = localStorage.getItem('zibbo_final');
            if(s) this.data = JSON.parse(s);
            this.sync();
        },
        save() {
            localStorage.setItem('zibbo_final', JSON.stringify(this.data));
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
        MusicMgr.dimMusic(false);
        this.state.level = lvl;
        // Базовая жизнь 1 + купленные + уровень корабля-1
        this.state.lives = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        this.state.score = 0;
        this.state.timeLeft = 60;
        this.entities = [];
        this.ufo.y = this.canvas.height / 2 - this.ufo.h / 2;
        this.ufo.vy = 0;
        this.state.screen = 'waiting'; 
        this.showScreen('hud');
        this.updateLivesUI();
        if(MusicMgr.enabled && !MusicMgr.currentTrack) MusicMgr.playTrack();
    },

    togglePause() {
        if(this.state.screen === 'playing' || this.state.screen === 'waiting') {
            MusicMgr.dimMusic(true);
            this.state.screen = 'paused';
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('ad-container').style.display = 'none';
            document.getElementById('resume-btn').style.display = 'block';
            document.getElementById('continue-btn').style.display = 'none';
            document.getElementById('level-btns').style.display = 'flex';
            this.showScreen('level-screen');
        } else {
            MusicMgr.dimMusic(false);
            this.state.screen = 'waiting';
            this.showScreen('hud');
        }
    },

    openShop() {
        const grid = document.getElementById('shop-content');
        grid.innerHTML = '';
        
        const lifePrice = (this.storage.data.livesPlus + 1) * 100;
        const lifeItem = document.createElement('div');
        lifeItem.className = 'shop-item';
        lifeItem.innerHTML = `
            <div class="shop-item-left">
                <img src="ufo_ship.png" class="shop-icon">
                <div class="shop-label">+ 1 PERMANENT LIFE</div>
                <button class="shop-buy-btn" onclick="Game.buyLife(${lifePrice}, this)">${lifePrice} ⭐</button>
            </div>
        `;
        grid.appendChild(lifeItem);

        const nextShipIdx = this.storage.data.unlocked.length + 1;
        if(nextShipIdx <= 5) {
            const shipPrice = nextShipIdx * 100;
            const shipItem = document.createElement('div');
            shipItem.className = 'shop-item';
            shipItem.innerHTML = `
                <div class="shop-item-right">
                    <img src="ufo_ship${nextShipIdx}.png" class="shop-ufo-asset">
                    <div class="shop-label">UFO CLASS ${nextShipIdx} (Fast + Extra Life)</div>
                    <button class="shop-buy-btn" onclick="Game.buyShip(${nextShipIdx}, ${shipPrice}, this)">${shipPrice} ⭐</button>
                </div>
            `;
            grid.appendChild(shipItem);
        }
        this.showScreen('shop-screen');
    },

    buyLife(price, btn) {
        if(this.storage.data.stars >= price) {
            this.storage.data.stars -= price;
            this.storage.data.livesPlus++;
            this.storage.save();
            this.openShop();
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
            this.openShop();
        } else {
            this.failBuy(btn);
        }
    },

    failBuy(btn) {
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 500);
    },

    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        let currentMax = 1 + this.storage.data.livesPlus + (this.storage.data.current - 1);
        for(let i=1; i<=currentMax; i++) {
            const img = document.createElement('img');
            img.src = `ufo_ship${this.storage.data.current > 1 ? this.storage.data.current : ''}.png`;
            if(i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    update(dt) {
        this.parallaxStars.forEach(s => {
            s.x -= s.speed * (this.state.screen === 'playing' ? 2 : 0.5);
            if(s.x < 0) s.x = this.canvas.width;
        });

        if(this.state.screen !== 'playing') return;

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
            let dx = (this.ufo.x + this.ufo.w/2) - en.x;
            let dy = (this.ufo.y + this.ufo.h/2) - en.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if(dist < en.r + 20 && Date.now() > this.state.invul) {
                if(en.type === 'star') {
                    this.state.score++;
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
        MusicMgr.dimMusic(true);
        this.state.screen = 'gameover';
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
        MusicMgr.dimMusic(true);
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
        const bg = document.getElementById('galaxy-bg');
        if(bg.complete) this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);

        this.parallaxStars.forEach(s => {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${s.opacity})`;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
            this.ctx.fill();
        });

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

        const ufoImg = document.getElementById(`ufo-${this.storage.data.current}`);
        this.ctx.save();
        this.ctx.translate(this.ufo.x + this.ufo.w/2, this.ufo.y + this.ufo.h/2);
        this.ctx.rotate(this.ufo.angle);
        if(Date.now() < this.state.invul) this.ctx.globalAlpha = Math.sin(Date.now()/100)*0.3+0.7;
        this.ctx.drawImage(ufoImg, -this.ufo.w/2, -this.ufo.h/2, this.ufo.w, this.ufo.h);
        this.ctx.restore();

        if(this.state.screen === 'waiting') {
            this.ctx.fillStyle = "white";
            this.ctx.font = "30px 'Fredoka One'";
            this.ctx.textAlign = "center";
            this.ctx.fillText("TAP TO START", this.canvas.width/2, this.canvas.height/2 + 100);
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
