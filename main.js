const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let mapData, tilesetImage, playerImage;
const TILE_SIZE = 16;
let speed = 1;

let playerX = 23 * TILE_SIZE;
let playerY = 4 * TILE_SIZE;
let playerWidth = TILE_SIZE;
let playerHeight = TILE_SIZE;

let keys = {};
let collisionRects = [];
let interactionRects = [];


let dialogueOpen = false;          // is the box open?
let dialogueQueue = [];            // lines to show (split by '|')
let currentLineIndex = 0;          // which line we're on
let visibleLines = [];             // completed lines currently on screen (up to last 3)
let displayedCurrent = "";         // what’s been typed of the current line
let isTyping = false;              // currently typing the current line?
let typeSpeed = 25;                // ms per character
let typeTimerId = null;            // for cancelling typewriter if needed

let tilesets = [];

async function loadTilesets() {
    tilesets = await Promise.all(
        mapData.tilesets.map(async (ts) => {
            return {
                firstgid: ts.firstgid,
                image: await loadImage("assets/tilesets/" + ts.image.replace(/^.*[\\/]/, '')),
                columns: ts.columns,
                tilecount: ts.tilecount,
                tileWidth: ts.tilewidth,
                tileHeight: ts.tileheight
            };
        })
    );
}


let frameIndex = 1;
let frameTimer = 0;
const frameInterval = 10;
let playerDirection = "down";
let showCollisionDebug = false;

// Background music shuffle system
let audioFiles = [
    "song1.mp3",
    "song2.mp3",
    "song3.mp3"
    // Add more file names here
];
let currentTrackIndex = -1;
let bgMusic = new Audio();
bgMusic.volume = 0.3;
let isMuted = false;
let autoplayBlocked = false;


function playRandomTrack() {
    let nextIndex;
    do {
        nextIndex = Math.floor(Math.random() * audioFiles.length);
    } while (audioFiles.length > 1 && nextIndex === currentTrackIndex);

    currentTrackIndex = nextIndex;
    bgMusic.src = `assets/audio/${audioFiles[currentTrackIndex]}`;
    bgMusic.play().catch(() => {
        console.log("Music autoplay blocked. Muting until user unmutes.");
        autoplayBlocked = true;
        isMuted = true;
        bgMusic.muted = true;
        document.getElementById("muteBtn").textContent = "🔇";
    });
}

bgMusic.addEventListener("ended", playRandomTrack);


async function loadJSON(url) {
    const res = await fetch(url);
    return res.json();
}
async function loadImage(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(img);
    });
}

async function init() {
    mapData = await loadJSON("assets/maps/map.json");
    await loadTilesets();
    playerImage = await loadImage("assets/sprites/player.png");
    // bgMusic.play().catch(() => {
    //     console.log("Music autoplay blocked, will start on first user interaction.");
    // });
    playRandomTrack();



    loadCollisionData(mapData);
    loadInteractionData(mapData);

    requestAnimationFrame(gameLoop);
}

function loadCollisionData(mapData) {
    const objLayer = mapData.layers.find(
        l => l.name === "Collision" && l.type === "objectgroup"
    );
    if (!objLayer) return;
    collisionRects = objLayer.objects.map(obj => ({
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height
    }));
}

function loadInteractionData(mapData) {
    const objLayer = mapData.layers.find(
        l => l.name === "Interactions" && l.type === "objectgroup"
    );
    if (!objLayer) return;
    interactionRects = objLayer.objects.map(obj => ({
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        name: obj.name || "",
        text: obj.properties?.find(p => p.name === "text")?.value || "Nothing interesting here."
    }));
}

function checkCollision(newX, newY) {
    const mapPixelWidth = mapData.width * TILE_SIZE;
    const mapPixelHeight = mapData.height * TILE_SIZE;

    // Define bottom-half hitbox
    const hitbox = {
        x: newX + 4, // inset left/right
        y: newY + playerHeight / 2, // halfway down
        width: playerWidth - 8,
        height: playerHeight / 2
    };

    // Map boundary check
    if (
        hitbox.x < 0 || hitbox.y < 0 ||
        hitbox.x + hitbox.width > mapPixelWidth ||
        hitbox.y + hitbox.height > mapPixelHeight
    ) {
        return true;
    }

    // Collision rectangles
    return collisionRects.some(rect =>
        hitbox.x < rect.x + rect.width &&
        hitbox.x + hitbox.width > rect.x &&
        hitbox.y < rect.y + rect.height &&
        hitbox.y + hitbox.height > rect.y
    );
}

function checkInteraction() {
    // Bottom-half hitbox for interaction
    const hitbox = {
        x: playerX + 4,
        y: playerY + playerHeight / 2,
        width: playerWidth - 8,
        height: playerHeight / 2
    };

    return interactionRects.find(rect =>
        hitbox.x < rect.x + rect.width &&
        hitbox.x + hitbox.width > rect.x &&
        hitbox.y < rect.y + rect.height &&
        hitbox.y + hitbox.height > rect.y
    );
}

function update() {
    if (dialogueOpen) return;

    let moveX = 0, moveY = 0;
    if (keys["ArrowUp"] || keys["w"]) { moveY = -speed; playerDirection = "up"; }
    if (keys["ArrowDown"] || keys["s"]) { moveY = speed; playerDirection = "down"; }
    if (keys["ArrowLeft"] || keys["a"]) { moveX = -speed; playerDirection = "left"; }
    if (keys["ArrowRight"] || keys["d"]) { moveX = speed; playerDirection = "right"; }

    if (moveX !== 0 && !checkCollision(playerX + moveX, playerY)) playerX += moveX;
    if (moveY !== 0 && !checkCollision(playerX, playerY + moveY)) playerY += moveY;

    if (moveX !== 0 || moveY !== 0) {
        frameTimer++;
        if (frameTimer >= frameInterval) {
            frameTimer = 0;
            frameIndex = (frameIndex + 1) % 3;
        }
    } else {
        frameIndex = 1;
    }
}

function drawMap() {
    //const tilesetCols = Math.floor(tilesetImage.width / TILE_SIZE);
    const cameraX = playerX - canvas.width / 2 + playerWidth / 2;
    const cameraY = playerY - canvas.height / 2 + playerHeight / 2;
    
    function drawTileLayer(layerName) {
        const layer = mapData.layers.find(l => l.name === layerName && l.type === "tilelayer");
        if (!layer) return;

        for (let y = 0; y < mapData.height; y++) {
            for (let x = 0; x < mapData.width; x++) {
                let gid = layer.data[y * mapData.width + x];
                if (gid === 0) continue; // Empty tile

                // Find the correct tileset for this GID
                let tileset = null;
                for (let i = mapData.tilesets.length - 1; i >= 0; i--) {
                    if (gid >= mapData.tilesets[i].firstgid) {
                        tileset = tilesets[i]; // tilesets[] should be loaded earlier
                        gid = gid - mapData.tilesets[i].firstgid;
                        break;
                    }
                }
                if (!tileset) continue;

                const tilesetCols = Math.floor(tileset.image.width / TILE_SIZE);
                const sx = (gid % tilesetCols) * TILE_SIZE;
                const sy = Math.floor(gid / tilesetCols) * TILE_SIZE;
                const dx = x * TILE_SIZE - cameraX;
                const dy = y * TILE_SIZE - cameraY;

                if (dx + TILE_SIZE >= 0 && dx < canvas.width &&
                    dy + TILE_SIZE >= 0 && dy < canvas.height) {
                    ctx.drawImage(tileset.image, sx, sy, TILE_SIZE, TILE_SIZE, dx, dy, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }


    drawTileLayer("Base");
    drawTileLayer("Decor");

    if (showCollisionDebug) {
        ctx.strokeStyle = "red";
        collisionRects.forEach(rect =>
            ctx.strokeRect(rect.x - cameraX, rect.y - cameraY, rect.width, rect.height)
        );
    }

    drawPlayer();
    drawTileLayer("Above");
}

function drawPlayer() {
    const dirMap = { down: 0, left: 1, right: 2, up: 3 };
    const row = dirMap[playerDirection];
    const px = canvas.width / 2 - playerWidth / 2;
    const py = canvas.height / 2 - playerHeight / 2;

    ctx.drawImage(playerImage, frameIndex * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, px, py, playerWidth, playerHeight);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + " ";
        const testWidth = ctx.measureText(testLine).width;
        if (testWidth > maxWidth && i > 0) {
            ctx.fillText(line, x, y);
            line = words[i] + " ";
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

function drawDialogueBox() {
    if (!dialogueOpen) return;

    const boxHeight = 60;
    const boxX = 0;
    const boxY = canvas.height - boxHeight;
    const boxWidth = canvas.width;

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);

    // Build the lines we’ll draw: last up to 3 lines, with the current one at the end
    let linesToDraw = [...visibleLines];
    linesToDraw.push(displayedCurrent);
    if (linesToDraw.length > 3) {
        linesToDraw = linesToDraw.slice(-3);
    }

    // Text
    ctx.fillStyle = "white";
    ctx.font = "14px Arial";

    const lineHeight = 16;
    const startX = boxX + 10;
    let y = boxY + 20;

    // Clip so long lines don’t draw outside the box
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX + 6, boxY + 6, boxWidth - 12, boxHeight - 12);
    ctx.clip();

    for (const line of linesToDraw) {
        ctx.fillText(line, startX, y);
        y += lineHeight;
    }
    ctx.restore();
}


function startTypewriter(text) {
    activeDialogue = text;
    displayedDialogue = "";
    dialogueCharIndex = 0;
    isTyping = true;
    typeNextChar();
}

function typeNextChar() {
    if (dialogueCharIndex < activeDialogue.length) {
        displayedDialogue += activeDialogue[dialogueCharIndex];
        dialogueCharIndex++;
        setTimeout(typeNextChar, typeSpeed);
    } else {
        isTyping = false;
    }
}

function startDialogue(rawText) {
    // Split by '|' into single lines, trim, drop empties
    dialogueQueue = rawText.split("|").map(s => s.trim()).filter(Boolean);

    if (dialogueQueue.length === 0) return;

    dialogueOpen = true;
    visibleLines = [];
    currentLineIndex = 0;
    displayedCurrent = "";
    isTyping = false;

    startTypingCurrent();
}

function startTypingCurrent() {
    clearTimeout(typeTimerId);
    displayedCurrent = "";
    isTyping = true;

    const full = dialogueQueue[currentLineIndex];
    let i = 0;

    const tick = () => {
        if (!isTyping) return; // in case we were interrupted
        if (i < full.length) {
            displayedCurrent += full[i++];
            typeTimerId = setTimeout(tick, typeSpeed);
        } else {
            isTyping = false; // finished this line
        }
    };
    tick();
}

function finishCurrentLine() {
    // Instantly complete the current line
    clearTimeout(typeTimerId);
    displayedCurrent = dialogueQueue[currentLineIndex];
    isTyping = false;
}

function advanceDialogue() {
    // If typing, first finish the line
    if (isTyping) {
        finishCurrentLine();
        return;
    }

    // Push the finished current line into visible history
    visibleLines.push(displayedCurrent);
    if (visibleLines.length > 3) visibleLines.shift();

    // Move to next line, or close if none left
    currentLineIndex++;
    if (currentLineIndex < dialogueQueue.length) {
        startTypingCurrent();
    } else {
        endDialogue();
    }
}

function endDialogue() {
    clearTimeout(typeTimerId);
    dialogueOpen = false;
    dialogueQueue = [];
    currentLineIndex = 0;
    visibleLines = [];
    displayedCurrent = "";
    isTyping = false;
}


function gameLoop() {
    update();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    drawDialogueBox();
    requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", e => {
    keys[e.key] = true;

    if (e.key === "Enter" || e.key === "f") {
        if (!dialogueOpen) {
            const zone = checkInteraction();
            if (zone) {
                // Start fresh dialogue from zone text
                startDialogue(zone.text);
            }
        } else {
            // Dialogue already open: either finish line or go to next/close
            if (isTyping) {
                finishCurrentLine();
            } else {
                advanceDialogue();
            }
        }
    }
});

window.addEventListener("keyup", e => { keys[e.key] = false; });

function simulateKeyPress(key, isDown) {
    keys[key] = isDown;
}

document.querySelectorAll(".dpad .btn").forEach(btn => {
    const dir = btn.dataset.dir;
    let mappedKey = "";
    if (dir === "up") mappedKey = "ArrowUp";
    if (dir === "down") mappedKey = "ArrowDown";
    if (dir === "left") mappedKey = "ArrowLeft";
    if (dir === "right") mappedKey = "ArrowRight";

    btn.addEventListener("touchstart", e => {
        e.preventDefault();
        simulateKeyPress(mappedKey, true);
    });
    btn.addEventListener("touchend", e => {
        e.preventDefault();
        simulateKeyPress(mappedKey, false);
    });
    btn.addEventListener("mousedown", () => simulateKeyPress(mappedKey, true));
    btn.addEventListener("mouseup", () => simulateKeyPress(mappedKey, false));
});

const interactBtn = document.querySelector(".interact-btn");
interactBtn.addEventListener("touchstart", e => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
});
interactBtn.addEventListener("mousedown", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
});

document.getElementById("muteBtn").addEventListener("click", () => {
    isMuted = !isMuted;
    bgMusic.muted = isMuted;
    document.getElementById("muteBtn").textContent = isMuted ? "🔇" : "🔊";

    // If autoplay was blocked and user unmutes, start playing immediately
    if (!isMuted && autoplayBlocked) {
        autoplayBlocked = false; // reset flag
        bgMusic.play().catch(err => console.warn("Couldn't start music after unmuting:", err));
    }
});

init();
