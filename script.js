const AdController = window.Adsgram?.init({ blockId: "YOUR_ID" });

const AudioMgr = {
    sounds: {},
    init() {
        ['button_click', 'collect', 'hit'].forEach(s => {
            this.sounds[s] = new Audio(`${s}.ogg`);
        });
    },
    play(name) {
        if (this.sounds[name]) {
            this.sounds[name].currentTime = 0;
            this.sounds[name].play().catch(() => {});
        }
    }
};

const Game = {
    state: { screen: 'splash', score: 0, lives: 1, level: 1, timeLeft: 60, lastTime: 0, invul: 0 },
    ufo: { x: 0, y: 0, w: 75, h: 50, vy: 0, angle: 0, thrust: false },
    entities: [],
    starsBG: [], // Для параллакса

    init() {
        AudioMgr.init();
        this.storage.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        this.initStars();
        window.onresize = () => this.resize();

        const start = (e) => { 
            if(this.state.screen === 'playing') this.ufo.thrust = true; 
            if(e.type === 'touchstart') e.preventDefault();
        };
        const end = () => this.ufo.thrust = false;
        
        this.canvas.addEventListener('mousedown', start);
        window.addEventListener('mouseup', end);
        this.canvas.addEventListener('touchstart', start, {passive: false});
        window.addEventListener('touchend', end);

        document.getElementById('play-btn').onclick = () => { AudioMgr.play('button_click'); this.startLevel(this.storage.data.level); };
        document.getElementById('pause-btn').onclick = () => { AudioMgr.play('button_click'); this.togglePause(); };
        document.getElementById('continue-btn').onclick = () => { AudioMgr.play('button_click'); this.togglePause(); };
        document.getElementById('shop-btn-end').onclick = () => { AudioMgr.play('button_click'); this.showScreen('shop-screen'); };
        document.getElementById('close-shop').onclick = () => { AudioMgr.play('button_click'); this.showScreen('level-screen'); };
        document.getElementById('home-btn').onclick = () => location.reload();

        this.loop(0);
    },

    initStars() {
        this.starsBG = [];
        for(let i=0; i<80; i++) {
            this.starsBG.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2,
                speed: 0.2 + Math.random() * 0.8,
                layer: Math.floor(Math.random() * 3)
            });
        }
    },

    storage: {
        data: { stars: 0, unlocked: [1], current: 1, livesPlus: 0, level: 1 },
        load() {
            const s = localStorage.getItem('zibbo_v4');
            if(s) this.data = JSON.parse(s);
            this.sync();
        },
        save() {
            localStorage.setItem('zibbo_v4', JSON.stringify(this.data));
            this.sync();
        },
        sync() {
            document.getElementById('total-stars-display').innerText = this.data.stars;
            document.getElementById('current-lvl-display').innerText = this.data.level;
            const p = document.getElementById('splash-ufo-preview');
            p.src = `ufo_ship${this.data.current>1?this.data.current:''}.png`;
        }
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.ufo.x = this.canvas.width * 0.15;
    },

    showScreen(id) {
        document.querySelectorAll('.screen, .hud-layer').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        if(id === 'hud' || id === 'playing') document.getElementById('hud').classList.add('active');
    },

    startLevel(lvl) {
        this.state.lives = 1 + this.storage.data.livesPlus;
        this.state.score = 0;
        this.state.timeLeft = 60;
        this.state.screen = 'playing';
        this.ufo.y = this.canvas.height / 2;
        this.ufo.vy = 0;
        this.entities = [];
        this.showScreen('hud');
        this.updateLivesUI();
    },

    togglePause() {
        if(this.state.screen === 'playing') {
            this.state.screen = 'paused';
            document.getElementById('level-title').innerText = "PAUSED";
            document.getElementById('ad-timer-box').style.display = 'none';
            document.getElementById('end-menu-btns').style.display = 'flex';
            this.showScreen('level-screen');
        } else {
            this.state.screen = 'playing';
            this.showScreen('hud');
        }
    },

    updateLivesUI() {
        const bar = document.getElementById('lives-bar');
        bar.innerHTML = '';
        let max = 1 + this.storage.data.livesPlus;
        for(let i=1; i<=max; i++) {
            const img = document.createElement('img');
            img.src = `ufo_ship${this.storage.data.current>1?this.storage.data.current:''}.png`;
            if(i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    update(dt) {
        // Параллакс звезд всегда активен для красоты
        this.starsBG.forEach(s => {
            s.x -= s.speed * (this.state.screen === 'playing' ? 2 : 0.5);
            if(s.x < 0) s.x = this.canvas.width;
        });

        if(this.state.screen !== 'playing') return;

        // Физика и Наклон (вайб)
        if(this.ufo.thrust) this.ufo.vy -= 0.6;
        this.ufo.vy += 0.3;
        this.ufo.vy *= 0.98;
        this.ufo.y += this.ufo.vy;
        this.ufo.angle = Math.max(-0.3, Math.min(0.3, this.ufo.vy * 0.05));

        if(this.ufo.y < 0) { this.ufo.y = 0; this.ufo.vy = 0; }
        if(this.ufo.y > this.canvas.height - this.ufo.h) this.onHit();

        this.state.timeLeft -= dt;
        document.getElementById('game-timer').innerText = Math.ceil(this.state.timeLeft);
        if(this.state.timeLeft <= 0) this.winLevel();

        if(Math.random() < 0.02) this.spawn('star');
        if(Math.random() < 0.015) this.spawn('ast');

        this.entities.forEach((en, i) => {
            en.x -= (4 + this.state.level * 0.5);
            if(en.type === 'ast') en.rotation += en.rotSpeed;
            
            let dx = (this.ufo.x + this.ufo.w/2) - en.x;
            let dy = (this.ufo.y + this.ufo.h/2) - en.y;
            let dist = Math.sqrt(dx*dx + dy*dy);
            
            if(dist < en.r + 20 && Date.now() > this.state.invul) {
                if(en.type === 'star') {
                    AudioMgr.play('collect');
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
            r: type === 'star' ? 15 : 20 + Math.random()*30,
            rotation: 0,
            rotSpeed: (Math.random() - 0.5) * 0.1,
            pulse: 0
        });
    },

    onHit() {
        AudioMgr.play('hit');
        this.state.lives--;
        this.updateLivesUI();
        if(this.state.lives <= 0) {
            this.gameOver();
        } else {
            this.state.invul = Date.now() + 2000;
            this.ufo.vy = -7;
        }
    },

    gameOver() {
        this.state.screen = 'gameover';
        this.storage.data.stars += this.state.score;
        this.storage.save();
        
        document.getElementById('level-title').innerText = "CRASHED!";
        document.getElementById('level-stars').innerText = this.state.score;
        document.getElementById('ad-timer-box').style.display = 'block';
        document.getElementById('end-menu-btns').style.display = 'none';
        this.showScreen('level-screen');

        // Таймер рекламы
        let sec = 5;
        const itv = setInterval(() => {
            sec--;
            document.getElementById('ad-seconds').innerText = sec;
            if(sec <= 0) {
                clearInterval(itv);
                document.getElementById('ad-timer-box').style.display = 'none';
                document.getElementById('end-menu-btns').style.display = 'flex';
                document.getElementById('continue-btn').innerText = "RETRY";
                document.getElementById('continue-btn').onclick = () => this.startLevel(this.state.level);
            }
        }, 1000);
    },

    winLevel() {
        this.state.screen = 'win';
        this.storage.data.level++;
        this.storage.data.stars += this.state.score;
        this.storage.save();
        document.getElementById('level-title').innerText = "LEVEL CLEAR!";
        this.showScreen('level-screen');
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 1. BG Galaxy
        const bg = document.getElementById('galaxy-bg');
        if(bg.complete) this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);

        // 2. Parallax Stars
        this.ctx.fillStyle = "white";
        this.starsBG.forEach(s => {
            this.ctx.globalAlpha = 0.3 + (s.layer * 0.3);
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
            this.ctx.fill();
        });
        this.ctx.globalAlpha = 1.0;

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
                const img = document.getElementById(en.r > 35 ? 'ast-b-img' : 'ast-s-img');
                this.ctx.drawImage(img, -en.r, -en.r, en.r*2, en.r*2);
            }
            this.ctx.restore();
        });

        // 4. UFO
        const ufoImg = document.getElementById(`ufo-${this.storage.data.current}`);
        this.ctx.save();
        this.ctx.translate(this.ufo.x + this.ufo.w/2, this.ufo.y + this.ufo.h/2);
        this.ctx.rotate(this.ufo.angle);
        if(Date.now() < this.state.invul) this.ctx.globalAlpha = Math.sin(Date.now()/50)*0.5 + 0.5;
        this.ctx.drawImage(ufoImg, -this.ufo.w/2, -this.ufo.h/2, this.ufo.w, this.ufo.h);
        this.ctx.restore();
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
