// Настройка Adsgram (замени на свой блок ID если нужно)
const AdController = window.Adsgram?.init({ blockId: "9a1dea9f8d134730875d57f334be6f6e" });

const Game = {
    state: { screen: 'splash', score: 0, lives: 1, level: 1, timeLeft: 60, lastTime: 0, invul: 0 },
    ufo: { x: 0, y: 0, w: 70, h: 45, vy: 0, thrust: false },
    entities: [],
    
    init() {
        this.storage.load();
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.onresize = () => this.resize();

        // Управление (исправлено)
        const start = (e) => { 
            if(this.state.screen === 'playing') this.ufo.thrust = true; 
            if(e.type === 'touchstart') e.preventDefault();
        };
        const end = () => this.ufo.thrust = false;
        
        this.canvas.addEventListener('mousedown', start);
        window.addEventListener('mouseup', end);
        this.canvas.addEventListener('touchstart', start, {passive: false});
        window.addEventListener('touchend', end);

        // Кнопки
        document.getElementById('play-btn').onclick = () => this.startLevel(this.storage.data.level);
        document.getElementById('pause-btn').onclick = () => this.togglePause();
        document.getElementById('continue-btn').onclick = () => this.togglePause();
        document.getElementById('shop-btn-main').onclick = () => this.showScreen('shop-screen');
        document.getElementById('close-shop').onclick = () => this.showScreen('splash-screen');
        document.getElementById('home-btn').onclick = () => location.reload();

        this.loop(0);
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
        sync() {
            document.getElementById('total-stars-display').innerText = this.data.stars;
            document.getElementById('current-lvl-display').innerText = this.data.level;
            document.getElementById('splash-ufo-preview').src = `ufo_ship${this.data.current>1?this.data.current:''}.png`;
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
        if(id === 'hud') document.getElementById('hud').classList.add('active');
    },

    startLevel(lvl) {
        this.state.level = lvl;
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
        for(let i=1; i<=10; i++) {
            if(i > max) break;
            const img = document.createElement('img');
            img.src = `ufo_ship${this.storage.data.current>1?this.storage.data.current:''}.png`;
            if(i <= this.state.lives) img.className = 'on';
            bar.appendChild(img);
        }
    },

    update(dt) {
        if(this.state.screen !== 'playing') return;

        // Физика
        if(this.ufo.thrust) this.ufo.vy -= 0.5;
        this.ufo.vy += 0.25; // Gravity
        this.ufo.vy *= 0.98; // Friction
        this.ufo.y += this.ufo.vy;

        if(this.ufo.y < 0) { this.ufo.y = 0; this.ufo.vy = 0; }
        if(this.ufo.y > this.canvas.height - this.ufo.h) this.onHit();

        // Спавн объектов
        if(Math.random() < 0.02) this.spawn('star');
        if(Math.random() < 0.01 + (this.state.level*0.002)) this.spawn('ast');

        this.entities.forEach((en, i) => {
            en.x -= (3 + this.state.level * 0.3);
            // Коллизия
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
            r: type === 'star' ? 15 : 25 + Math.random()*20
        });
    },

    onHit() {
        this.state.lives--;
        this.updateLivesUI();
        if(this.state.lives <= 0) {
            this.state.screen = 'gameover';
            this.storage.data.stars += this.state.score;
            this.storage.save();
            document.getElementById('level-title').innerText = "CRASHED!";
            this.showScreen('level-screen');
            // Показ рекламы
            if(AdController) AdController.show().catch(()=>{});
        } else {
            this.state.invul = Date.now() + 2000;
            this.ufo.vy = -6;
        }
    },

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Galaxy BG
        const bg = document.getElementById('galaxy-bg');
        if(bg.complete) this.ctx.drawImage(bg, 0, 0, this.canvas.width, this.canvas.height);

        // Entities
        this.entities.forEach(en => {
            const img = document.getElementById(en.type === 'star' ? 'star-img' : 'ast-s-img');
            this.ctx.drawImage(img, en.x - en.r, en.y - en.r, en.r*2, en.r*2);
        });

        // UFO
        const ufoImg = document.getElementById(`ufo-${this.storage.data.current}`);
        this.ctx.save();
        if(Date.now() < this.state.invul) this.ctx.alpha = 0.5;
        this.ctx.drawImage(ufoImg, this.ufo.x, this.ufo.y, this.ufo.w, this.ufo.h);
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
