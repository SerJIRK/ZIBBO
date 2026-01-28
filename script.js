{\rtf1\ansi\ansicpg1251\cocoartf2867
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 // --- \uc0\u1048 \u1085 \u1080 \u1094 \u1080 \u1072 \u1083 \u1080 \u1079 \u1072 \u1094 \u1080 \u1103  Telegram ---\
const tg = window.Telegram?.WebApp;\
if (tg) \{\
    tg.expand();\
    tg.ready();\
\}\
\
// --- \uc0\u1056 \u1077 \u1082 \u1083 \u1072 \u1084 \u1072  AdsGram ---\
const ADS_BLOCK_ID = "9a1dea9f8d134730875d57f334be6f6e"; \
const AdController = window.Adsgram?.init(\{ blockId: ADS_BLOCK_ID \});\
\
const canvas = document.getElementById('gameCanvas');\
const ctx = canvas.getContext('2d');\
\
// \uc0\u1040 \u1089 \u1089 \u1077 \u1090 \u1099  (\u1086 \u1073 \u1085 \u1086 \u1074 \u1083 \u1077 \u1085 \u1085 \u1099 \u1077  \u1087 \u1086 \u1076  UFO)\
const assets = \{\
    ufo: document.getElementById('ufo-img'),\
    star: document.getElementById('star-img'),\
    astS: document.getElementById('ast-s-img'),\
    astB: document.getElementById('ast-b-img')\
\};\
\
// \uc0\u1053 \u1072 \u1089 \u1090 \u1088 \u1086 \u1081 \u1082 \u1080  (\u1040 \u1076 \u1072 \u1087 \u1090 \u1080 \u1088 \u1086 \u1074 \u1072 \u1085 \u1099  \u1087 \u1086 \u1076  \u1082 \u1086 \u1089 \u1084 \u1086 \u1089 )\
const SETTINGS = \{\
    gravity: 0.25,      // \uc0\u1043 \u1088 \u1072 \u1074 \u1080 \u1090 \u1072 \u1094 \u1080 \u1103  \u1074  \u1082 \u1086 \u1089 \u1084 \u1086 \u1089 \u1077  (\u1090 \u1103 \u1075 \u1072  \u1074 \u1085 \u1080 \u1079 )\
    thrust: -0.6,       // \uc0\u1057 \u1080 \u1083 \u1072  \u1074 \u1079 \u1083 \u1077 \u1090 \u1072  \u1087 \u1088 \u1080  \u1090 \u1072 \u1087 \u1077 \
    friction: 0.98,     // \uc0\u1058 \u1088 \u1077 \u1085 \u1080 \u1077 /\u1057 \u1086 \u1087 \u1088 \u1086 \u1090 \u1080 \u1074 \u1083 \u1077 \u1085 \u1080 \u1077 \
    levelTime: 60,      // \uc0\u1057 \u1077 \u1082 \u1091 \u1085 \u1076  \u1085 \u1072  \u1091 \u1088 \u1086 \u1074 \u1077 \u1085 \u1100 \
    baseSpeed: 4.0,     // \uc0\u1053 \u1072 \u1095 \u1072 \u1083 \u1100 \u1085 \u1072 \u1103  \u1089 \u1082 \u1086 \u1088 \u1086 \u1089 \u1090 \u1100  \u1087 \u1086 \u1083 \u1077 \u1090 \u1072 \
    maxLevel: 10\
\};\
\
let state = \{\
    screen: 'splash',\
    isReady: false, \
    score: 0,\
    level: 1,\
    timeLeft: SETTINGS.levelTime,\
    gameSpeed: SETTINGS.baseSpeed,\
    width: window.innerWidth,\
    height: window.innerHeight,\
    lastTime: 0,\
    frame: 0\
\};\
\
// UFO (80x61 \uc0\u1082 \u1072 \u1082  \u1090 \u1099  \u1087 \u1088 \u1086 \u1089 \u1080 \u1083 )\
let ufo = \{ x: 50, y: 0, w: 80, h: 61, vy: 0, angle: 0, thrusting: false \};\
\
let entities = [];\
let particles = [];\
let starsFar = [];  // \uc0\u1057 \u1083 \u1086 \u1081  \u1079 \u1074 \u1077 \u1079 \u1076  1 (\u1084 \u1077 \u1076 \u1083 \u1077 \u1085 \u1085 \u1099 \u1081 )\
let starsNear = []; // \uc0\u1057 \u1083 \u1086 \u1081  \u1079 \u1074 \u1077 \u1079 \u1076  2 (\u1073 \u1099 \u1089 \u1090 \u1088 \u1099 \u1081 )\
\
function initGame() \{\
    state.width = window.innerWidth;\
    state.height = window.innerHeight;\
    canvas.width = state.width;\
    canvas.height = state.height;\
\
    // \uc0\u1047 \u1072 \u1075 \u1088 \u1091 \u1079 \u1082 \u1072  \u1091 \u1088 \u1086 \u1074 \u1085 \u1103  \u1080 \u1079  \u1087 \u1072 \u1084 \u1103 \u1090 \u1080 \
    const savedLevel = localStorage.getItem('ufo_level');\
    state.level = savedLevel ? parseInt(savedLevel) : 1;\
    \
    // \uc0\u1050 \u1086 \u1088 \u1088 \u1077 \u1082 \u1090 \u1080 \u1088 \u1086 \u1074 \u1082 \u1072  \u1089 \u1082 \u1086 \u1088 \u1086 \u1089 \u1090 \u1080  \u1087 \u1086 \u1076  \u1090 \u1077 \u1082 \u1091 \u1097 \u1080 \u1081  \u1091 \u1088 \u1086 \u1074 \u1077 \u1085 \u1100 \
    state.gameSpeed = SETTINGS.baseSpeed + (state.level - 1) * 0.5;\
\
    // \uc0\u1043 \u1077 \u1085 \u1077 \u1088 \u1072 \u1094 \u1080 \u1103  \u1079 \u1074 \u1077 \u1079 \u1076 \u1085 \u1086 \u1075 \u1086  \u1092 \u1086 \u1085 \u1072 \
    starsFar = []; starsNear = [];\
    for(let i=0; i<40; i++) \{\
        starsFar.push(\{ x: Math.random() * state.width, y: Math.random() * state.height, s: 0.5 + Math.random() \});\
        starsNear.push(\{ x: Math.random() * state.width, y: Math.random() * state.height, s: 1.2 + Math.random() \});\
    \}\
\}\
\
// \uc0\u1059 \u1087 \u1088 \u1072 \u1074 \u1083 \u1077 \u1085 \u1080 \u1077 \
function handleInput(isDown) \{\
    if (state.screen !== 'playing') return;\
    if (isDown && !state.isReady) state.isReady = true;\
    ufo.thrusting = isDown;\
\}\
\
window.addEventListener('mousedown', () => handleInput(true));\
window.addEventListener('mouseup', () => handleInput(false));\
window.addEventListener('touchstart', (e) => \{ handleInput(true); \}, \{passive: true\});\
window.addEventListener('touchend', () => \{ handleInput(false); \});\
\
function spawnEntities() \{\
    // \uc0\u1047 \u1074 \u1077 \u1079 \u1076 \u1086 \u1095 \u1082 \u1080  (\u1073 \u1086 \u1085 \u1091 \u1089 \u1099 )\
    if (Math.random() < 0.02) \{\
        entities.push(\{ type: 'star', x: state.width + 50, y: 50 + Math.random() * (state.height - 100), r: 16 \});\
    \}\
    \
    // \uc0\u1040 \u1089 \u1090 \u1077 \u1088 \u1086 \u1080 \u1076 \u1099  (\u1095 \u1072 \u1089 \u1090 \u1086 \u1090 \u1072  \u1088 \u1072 \u1089 \u1090 \u1077 \u1090  \u1089  \u1091 \u1088 \u1086 \u1074 \u1085 \u1077 \u1084 )\
    let astChance = 0.01 + (state.level * 0.003);\
    if (Math.random() < astChance) \{\
        let isBig = Math.random() > 0.6;\
        entities.push(\{ \
            type: isBig ? 'astB' : 'astS', \
            x: state.width + 100, \
            y: Math.random() * state.height, \
            r: isBig ? 35 : 20,\
            rot: Math.random() * Math.PI,\
            rotSpeed: (Math.random() - 0.5) * 0.1\
        \});\
    \}\
\}\
\
function update(timestamp) \{\
    if (!state.lastTime) state.lastTime = timestamp;\
    let dt = (timestamp - state.lastTime) / 16;\
    state.lastTime = timestamp;\
    state.frame++;\
\
    if (state.screen !== 'playing') return;\
\
    // \uc0\u1058 \u1072 \u1081 \u1084 \u1077 \u1088  \u1091 \u1088 \u1086 \u1074 \u1085 \u1103 \
    if (state.isReady) \{\
        state.timeLeft -= (dt * 16) / 1000;\
        if (state.timeLeft <= 0 && state.level < SETTINGS.maxLevel) \{\
            state.level++;\
            state.timeLeft = SETTINGS.levelTime;\
            state.gameSpeed += 0.5;\
            localStorage.setItem('ufo_level', state.level); // \uc0\u1057 \u1086 \u1093 \u1088 \u1072 \u1085 \u1103 \u1077 \u1084  \u1087 \u1088 \u1086 \u1075 \u1088 \u1077 \u1089 \u1089 \
            if(tg) tg.HapticFeedback.notificationOccurred('success');\
        \}\
    \}\
\
    // \uc0\u1060 \u1080 \u1079 \u1080 \u1082 \u1072  UFO\
    if (!state.isReady) \{\
        ufo.y = state.height / 2;\
        ufo.vy = 0;\
    \} else \{\
        if (ufo.thrusting) ufo.vy += SETTINGS.thrust;\
        ufo.vy += SETTINGS.gravity;\
        ufo.vy *= SETTINGS.friction;\
        ufo.y += ufo.vy;\
\
        // \uc0\u1059 \u1075 \u1086 \u1083  \u1085 \u1072 \u1082 \u1083 \u1086 \u1085 \u1072 \
        let targetAngle = Math.max(-0.4, Math.min(0.4, ufo.vy * 0.08));\
        ufo.angle += (targetAngle - ufo.angle) * 0.1;\
\
        // \uc0\u1057 \u1084 \u1077 \u1088 \u1090 \u1100  \u1086 \u1073  \u1075 \u1088 \u1072 \u1085 \u1080 \u1094 \u1099  \u1101 \u1082 \u1088 \u1072 \u1085 \u1072 \
        if (ufo.y + ufo.h/2 > state.height || ufo.y - ufo.h/2 < 0) gameOver();\
    \}\
\
    // \uc0\u1055 \u1072 \u1088 \u1072 \u1083 \u1083 \u1072 \u1082 \u1089  \u1079 \u1074 \u1077 \u1079 \u1076 \
    starsFar.forEach(s => \{\
        s.x -= (state.gameSpeed * 0.3) * dt;\
        if(s.x < 0) s.x = state.width;\
    \});\
    starsNear.forEach(s => \{\
        s.x -= (state.gameSpeed * 0.6) * dt;\
        if(s.x < 0) s.x = state.width;\
    \});\
\
    // \uc0\u1054 \u1073 \u1098 \u1077 \u1082 \u1090 \u1099 \
    entities.forEach((ent, index) => \{\
        ent.x -= state.gameSpeed * dt;\
        if(ent.rot !== undefined) ent.rot += ent.rotSpeed;\
\
        // \uc0\u1050 \u1086 \u1083 \u1083 \u1080 \u1079 \u1080 \u1103  (\u1082 \u1088 \u1091 \u1075 -\u1082 \u1088 \u1091 \u1075 )\
        let dx = (ufo.x + ufo.w/2) - ent.x;\
        let dy = (ufo.y + ufo.h/2) - ent.y;\
        let dist = Math.sqrt(dx*dx + dy*dy);\
        \
        if (dist < ent.r + 25) \{\
            if (ent.type === 'star') \{\
                state.score += 10;\
                entities.splice(index, 1);\
                if(tg) tg.HapticFeedback.impactOccurred('light');\
            \} else \{\
                gameOver();\
            \}\
        \}\
    \});\
    entities = entities.filter(ent => ent.x > -150);\
    if(state.isReady) spawnEntities();\
\
    document.getElementById('score-display').innerText = state.score;\
    document.getElementById('timer-display').innerText = Math.ceil(state.timeLeft);\
    document.getElementById('level-display').innerText = state.level;\
\}\
\
function draw() \{\
    ctx.fillStyle = '#050508'; // \uc0\u1043 \u1083 \u1091 \u1073 \u1086 \u1082 \u1080 \u1081  \u1082 \u1086 \u1089 \u1084 \u1086 \u1089 \
    ctx.fillRect(0, 0, state.width, state.height);\
\
    // \uc0\u1047 \u1074 \u1077 \u1079 \u1076 \u1099 \
    ctx.fillStyle = '#ffffff';\
    starsFar.forEach(s => \{\
        ctx.globalAlpha = 0.4;\
        ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, Math.PI*2); ctx.fill();\
    \});\
    starsNear.forEach(s => \{\
        ctx.globalAlpha = 0.8;\
        ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, Math.PI*2); ctx.fill();\
    \});\
    ctx.globalAlpha = 1.0;\
\
    // \uc0\u1054 \u1073 \u1098 \u1077 \u1082 \u1090 \u1099 \
    entities.forEach(ent => \{\
        let img = ent.type === 'star' ? assets.star : (ent.type === 'astS' ? assets.astS : assets.astB);\
        if (img.complete) \{\
            ctx.save();\
            ctx.translate(ent.x, ent.y);\
            if(ent.rot) ctx.rotate(ent.rot);\
            ctx.drawImage(img, -ent.r, -ent.r, ent.r*2, ent.r*2);\
            ctx.restore();\
        \}\
    \});\
\
    // UFO\
    ctx.save();\
    ctx.translate(ufo.x + ufo.w/2, ufo.y + ufo.h/2);\
    ctx.rotate(ufo.angle);\
    if (assets.ufo.complete) \{\
        ctx.drawImage(assets.ufo, -ufo.w/2, -ufo.h/2, ufo.w, ufo.h);\
    \} else \{\
        ctx.fillStyle = 'cyan'; ctx.fillRect(-ufo.w/2, -ufo.h/2, ufo.w, ufo.h);\
    \}\
    ctx.restore();\
\}\
\
function loop(t) \{ update(t); draw(); requestAnimationFrame(loop); \}\
\
function startGame() \{\
    state.screen = 'playing';\
    state.isReady = false; \
    state.score = 0; \
    state.timeLeft = SETTINGS.levelTime;\
    \
    // \uc0\u1048 \u1085 \u1080 \u1094 \u1080 \u1072 \u1083 \u1080 \u1079 \u1072 \u1094 \u1080 \u1103  (\u1087 \u1086 \u1076 \u1093 \u1074 \u1072 \u1090 \u1080 \u1090  \u1089 \u1086 \u1093 \u1088 \u1072 \u1085 \u1077 \u1085 \u1085 \u1099 \u1081  \u1091 \u1088 \u1086 \u1074 \u1077 \u1085 \u1100 )\
    initGame();\
    \
    entities = []; \
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));\
    document.getElementById('hud').classList.add('active');\
\}\
\
function gameOver() \{\
    state.screen = 'gameover';\
    document.getElementById('hud').classList.remove('active');\
    document.getElementById('game-over-screen').classList.add('active');\
    document.getElementById('final-score').innerText = state.score;\
    if(tg) tg.HapticFeedback.notificationOccurred('error');\
\
    // \uc0\u1056 \u1077 \u1082 \u1083 \u1072 \u1084 \u1085 \u1099 \u1081  \u1073 \u1083 \u1086 \u1082 \
    if (AdController) \{\
        AdController.show().then(() => \{\
            console.log("Ad completed");\
        \}).catch(e => \{\
            console.log("Ad failed/skipped", e);\
        \});\
    \}\
\}\
\
document.getElementById('dive-btn').onclick = startGame;\
document.getElementById('restart-btn').onclick = startGame;\
window.addEventListener('resize', initGame);\
\
initGame();\
requestAnimationFrame(loop);}