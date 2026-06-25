// Game State
let board = Array(9).fill(null);
let currentPlayer = 'X'; // X starts
let isGameActive = true;
let gameMode = 'pvp'; // 'pvp' or 'ai'
let pvpSubMode = 'local'; // 'local' or 'online'
let aiDifficulty = 'unbeatable'; // 'easy', 'medium', 'unbeatable'
let scores = {
    x: 0,
    o: 0,
    ties: 0
};

// Multiplayer state variables
let peer = null;
let conn = null;
let myRole = null; // 'X' (Host) or 'O' (Joiner)
let isConnected = false;

// DOM Elements
const cells = document.querySelectorAll('.cell');
const turnMessage = document.getElementById('turn-message');
const scoreP1 = document.getElementById('score-p1');
const scoreP2 = document.getElementById('score-p2');
const scoreTies = document.getElementById('score-ties');
const p1Label = document.getElementById('p1-label');
const p2Label = document.getElementById('p2-label');
const difficultyWrapper = document.getElementById('difficulty-wrapper');
const aiDifficultySelect = document.getElementById('ai-difficulty');
const btnPvP = document.getElementById('btn-pvp');
const btnAI = document.getElementById('btn-ai');
const btnReset = document.getElementById('btn-reset');
const btnFullReset = document.getElementById('btn-full-reset');
const gameModal = document.getElementById('game-modal');
const modalTitle = document.getElementById('modal-title');
const modalDesc = document.getElementById('modal-desc');
const btnModalClose = document.getElementById('btn-modal-close');

// Sub-mode Elements
const pvpSubmodeWrapper = document.getElementById('pvp-submode-wrapper');
const btnPvPLocal = document.getElementById('btn-pvp-local');
const btnPvPOnline = document.getElementById('btn-pvp-online');
const onlinePanel = document.getElementById('online-panel');
const connectionDot = document.getElementById('connection-dot');
const connectionStatusText = document.getElementById('connection-status-text');
const btnHostGame = document.getElementById('btn-host-game');
const btnJoinGame = document.getElementById('btn-join-game');
const roomCodeDisplay = document.getElementById('room-code-display');
const displayCode = document.getElementById('display-code');
const btnCopyCode = document.getElementById('btn-copy-code');
const inputRoomCode = document.getElementById('input-room-code');

// Winning Combinations
const WINNING_COMBINATIONS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

// Initialize Game
function init() {
    cells.forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });

    // Top-Level Modes
    btnPvP.addEventListener('click', () => setGameMode('pvp'));
    btnAI.addEventListener('click', () => setGameMode('ai'));

    // PvP Sub-Modes
    btnPvPLocal.addEventListener('click', () => setPvPSubMode('local'));
    btnPvPOnline.addEventListener('click', () => setPvPSubMode('online'));

    // Online handlers
    btnHostGame.addEventListener('click', hostOnlineGame);
    btnJoinGame.addEventListener('click', joinOnlineGame);
    btnCopyCode.addEventListener('click', copyRoomCode);

    aiDifficultySelect.addEventListener('change', (e) => {
        aiDifficulty = e.target.value;
        resetBoard();
    });

    btnReset.addEventListener('click', () => {
        if (pvpSubMode === 'online' && isConnected) {
            sendData({ type: 'RESET' });
        }
        resetBoard();
    });
    
    btnFullReset.addEventListener('click', () => {
        if (pvpSubMode === 'online' && isConnected) {
            sendData({ type: 'FULL_RESET' });
        }
        fullReset();
    });

    btnModalClose.addEventListener('click', () => {
        if (pvpSubMode === 'online' && isConnected) {
            sendData({ type: 'RESET' });
        }
        resetBoard();
    });
    
    updateScoreboardUI();
    updateTurnUI();
}

// Game Mode Switcher (PvP vs vs AI)
function setGameMode(mode) {
    if (gameMode === mode) return;
    gameMode = mode;
    cleanupPeer();

    if (mode === 'pvp') {
        btnPvP.classList.add('active');
        btnAI.classList.remove('active');
        pvpSubmodeWrapper.classList.remove('hidden');
        difficultyWrapper.classList.add('hidden');
        setPvPSubMode(pvpSubMode); // refresh styling
    } else {
        btnPvP.classList.remove('active');
        btnAI.classList.add('active');
        pvpSubmodeWrapper.classList.add('hidden');
        onlinePanel.classList.add('hidden');
        difficultyWrapper.classList.remove('hidden');
        p1Label.textContent = 'You (X)';
        p2Label.textContent = 'AI (O)';
        aiDifficulty = aiDifficultySelect.value;
        fullReset();
    }
}

// PvP Sub-Mode Switcher (Local vs Online)
function setPvPSubMode(submode) {
    pvpSubMode = submode;
    cleanupPeer();

    if (submode === 'local') {
        btnPvPLocal.classList.add('active');
        btnPvPOnline.classList.remove('active');
        onlinePanel.classList.add('hidden');
        p1Label.textContent = 'Player 1 (X)';
        p2Label.textContent = 'Player 2 (O)';
        myRole = null;
    } else {
        btnPvPLocal.classList.remove('active');
        btnPvPOnline.classList.add('active');
        onlinePanel.classList.remove('hidden');
        p1Label.textContent = 'Host (X)';
        p2Label.textContent = 'Guest (O)';
        updateOnlineStatus('offline', 'Ready to Host/Join');
    }
    fullReset();
}

// Handle Board Cell Clicks
function handleCellClick(e) {
    const cell = e.target;
    const index = parseInt(cell.getAttribute('data-index'));

    if (board[index] !== null || !isGameActive) return;

    // In online mode, you can only move when it is your turn
    if (gameMode === 'pvp' && pvpSubMode === 'online') {
        if (!isConnected || currentPlayer !== myRole) return;
        
        // Notify peer about the move
        sendData({ type: 'MOVE', index: index });
    }

    makeMove(index, currentPlayer);

    if (checkWinner(board, currentPlayer)) {
        endGame(currentPlayer);
    } else if (board.every(cell => cell !== null)) {
        endGame('tie');
    } else {
        // Toggle turn
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
        updateTurnUI();

        // AI trigger
        if (gameMode === 'ai' && currentPlayer === 'O' && isGameActive) {
            disableBoardInteraction();
            setTimeout(makeAIMove, 500);
        }
    }
}

// Disable cell clicks temporarily
function disableBoardInteraction() {
    cells.forEach(cell => cell.style.pointerEvents = 'none');
}

function enableBoardInteraction() {
    cells.forEach(cell => {
        const index = parseInt(cell.getAttribute('data-index'));
        if (board[index] === null) {
            cell.style.pointerEvents = 'auto';
        }
    });
}

// Make a move on the board and UI
function makeMove(index, player) {
    board[index] = player;
    const cell = document.getElementById(`cell-${index}`);
    cell.classList.add(player.toLowerCase());
    cell.setAttribute('aria-label', `Square ${index + 1} marked with ${player}`);
}

// Check if a player has won
function checkWinner(tempBoard, player) {
    return WINNING_COMBINATIONS.some(combination => {
        return combination.every(index => tempBoard[index] === player);
    });
}

// Get winning combination indices
function getWinningCombination(tempBoard, player) {
    return WINNING_COMBINATIONS.find(combination => {
        return combination.every(index => tempBoard[index] === player);
    });
}

// Update turn banner UI
function updateTurnUI() {
    if (gameMode === 'pvp' && pvpSubMode === 'online') {
        if (!isConnected) {
            turnMessage.innerHTML = `<span class="turn-highlight">Waiting for online connection...</span>`;
            return;
        }
        
        const highlightClass = currentPlayer === 'X' ? 'active-x' : 'active-o';
        const isMyTurn = currentPlayer === myRole;
        const playerLabel = isMyTurn ? 'Your Turn' : "Opponent's Turn";
        
        turnMessage.innerHTML = `${playerLabel} <span class="turn-highlight ${highlightClass}">(${currentPlayer})</span>`;
    } else if (gameMode === 'ai' && currentPlayer === 'O') {
        turnMessage.innerHTML = `AI Turn <span class="turn-highlight active-o">O</span> is thinking...`;
    } else {
        const highlightClass = currentPlayer === 'X' ? 'active-x' : 'active-o';
        const label = gameMode === 'ai' && currentPlayer === 'X' ? 'Your' : `Player ${currentPlayer}'s`;
        turnMessage.innerHTML = `${label} Turn <span class="turn-highlight ${highlightClass}">${currentPlayer}</span>`;
    }
}

// End Game Handling
function endGame(outcome) {
    isGameActive = false;
    
    if (outcome === 'tie') {
        scores.ties++;
        modalTitle.textContent = "It's a Tie!";
        modalTitle.className = "modal-heading active-x";
        modalDesc.textContent = "Splendid defense from both sides.";
    } else {
        if (outcome === 'X') {
            scores.x++;
            modalTitle.textContent = (gameMode === 'ai') ? "Victory!" : (pvpSubMode === 'online' && myRole === 'X') ? "Victory!" : (pvpSubMode === 'online') ? "Defeat!" : "Player X Wins!";
            modalTitle.className = "modal-heading active-x";
            modalDesc.textContent = (pvpSubMode === 'online') ? (myRole === 'X' ? "You outsmarted the challenger." : "The Host has won this round.") : "Masterful tactical control.";
        } else {
            scores.o++;
            modalTitle.textContent = (gameMode === 'ai') ? "Defeat!" : (pvpSubMode === 'online' && myRole === 'O') ? "Victory!" : (pvpSubMode === 'online') ? "Defeat!" : "Player O Wins!";
            modalTitle.className = "modal-heading active-o";
            modalDesc.textContent = (pvpSubMode === 'online') ? (myRole === 'O' ? "You outsmarted the host." : "The Guest player has won.") : "Victory belongs to Player O.";
        }

        // Highlight winning combo
        const winningCombo = getWinningCombination(board, outcome);
        if (winningCombo) {
            winningCombo.forEach(index => {
                document.getElementById(`cell-${index}`).classList.add('winning-cell');
            });
        }
    }
    
    updateScoreboardUI();
    setTimeout(showModal, 600);
}

function updateScoreboardUI() {
    scoreP1.textContent = scores.x;
    scoreP2.textContent = scores.o;
    scoreTies.textContent = scores.ties;
}

function resetBoard() {
    board = Array(9).fill(null);
    currentPlayer = 'X';
    isGameActive = true;
    
    cells.forEach(cell => {
        cell.className = 'cell';
        cell.setAttribute('aria-label', `Square ${parseInt(cell.getAttribute('data-index')) + 1}`);
        cell.style.pointerEvents = 'auto';
    });

    closeModal();
    updateTurnUI();
}

function fullReset() {
    scores = { x: 0, o: 0, ties: 0 };
    updateScoreboardUI();
    resetBoard();
}

function showModal() {
    gameModal.classList.remove('hidden');
}

function closeModal() {
    gameModal.classList.add('hidden');
}

/* ONLINE MULTIPLAYER ENGINE (PeerJS WebRTC) */

function updateOnlineStatus(state, message) {
    connectionDot.className = 'status-dot ' + state;
    connectionStatusText.textContent = message;
}

// Generate random uppercase 5 letter/number code
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function hostOnlineGame() {
    cleanupPeer();
    
    const code = generateRoomCode();
    myRole = 'X'; // Host is X
    
    updateOnlineStatus('connecting', 'Hosting room code: ' + code);
    
    // Create peer with the custom code
    // Prefix to avoid collisions globally on PeerJS cloud
    peer = new Peer('CHROMATOE-' + code);
    
    peer.on('open', (id) => {
        displayCode.textContent = code;
        roomCodeDisplay.classList.remove('hidden');
        updateOnlineStatus('connecting', 'Waiting for Player 2...');
    });
    
    peer.on('connection', (connection) => {
        if (isConnected) {
            connection.close(); // Only allow 1 connection
            return;
        }
        conn = connection;
        setupConnectionListeners();
    });

    peer.on('error', (err) => {
        console.error(err);
        updateOnlineStatus('offline', 'Connection Error (Try Again)');
        roomCodeDisplay.classList.add('hidden');
    });
}

function joinOnlineGame() {
    const code = inputRoomCode.value.trim().toUpperCase();
    if (!code || code.length !== 5) {
        alert('Please enter a valid 5-character Room Code!');
        return;
    }
    
    cleanupPeer();
    myRole = 'O'; // Guest is O
    
    updateOnlineStatus('connecting', 'Connecting to code: ' + code);
    
    peer = new Peer(); // Let PeerJS assign a random ID to Guest
    
    peer.on('open', () => {
        conn = peer.connect('CHROMATOE-' + code);
        setupConnectionListeners();
    });

    peer.on('error', (err) => {
        console.error(err);
        updateOnlineStatus('offline', 'Failed to connect. Is the code correct?');
    });
}

function setupConnectionListeners() {
    conn.on('open', () => {
        isConnected = true;
        updateOnlineStatus('online', `Connected as ${myRole === 'X' ? 'Host (X)' : 'Guest (O)'}`);
        resetBoard();
        
        // Host coordinates and transmits authoritative scores
        if (myRole === 'X') {
            sendData({ type: 'SCORE_SYNC', scores: scores });
        }
    });
    
    conn.on('data', (data) => {
        handlePeerData(data);
    });
    
    conn.on('close', () => {
        handleDisconnect();
    });

    conn.on('error', () => {
        handleDisconnect();
    });
}

function handlePeerData(data) {
    if (!data || !data.type) return;
    
    switch (data.type) {
        case 'MOVE':
            if (currentPlayer !== myRole && isGameActive) {
                makeMove(data.index, currentPlayer);
                if (checkWinner(board, currentPlayer)) {
                    endGame(currentPlayer);
                } else if (board.every(cell => cell !== null)) {
                    endGame('tie');
                } else {
                    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
                    updateTurnUI();
                }
            }
            break;
            
        case 'RESET':
            resetBoard();
            break;
            
        case 'FULL_RESET':
            fullReset();
            break;
            
        case 'SCORE_SYNC':
            scores = data.scores;
            updateScoreboardUI();
            break;
    }
}

function sendData(data) {
    if (conn && isConnected) {
        conn.send(data);
    }
}

function handleDisconnect() {
    isConnected = false;
    updateOnlineStatus('offline', 'Disconnected');
    roomCodeDisplay.classList.add('hidden');
    alert('The peer disconnected or connection failed!');
    resetBoard();
}

function cleanupPeer() {
    isConnected = false;
    if (conn) {
        conn.close();
        conn = null;
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
    roomCodeDisplay.classList.add('hidden');
    updateOnlineStatus('offline', 'Disconnected');
}

function copyRoomCode() {
    const code = displayCode.textContent;
    if (code && code !== '-----') {
        navigator.clipboard.writeText(code).then(() => {
            btnCopyCode.textContent = 'Copied!';
            setTimeout(() => {
                btnCopyCode.textContent = 'Copy';
            }, 2000);
        });
    }
}

/* AI GAME ENGINE SECTION */

function makeAIMove() {
    let index;
    if (aiDifficulty === 'easy') {
        index = getRandomMove();
    } else if (aiDifficulty === 'medium') {
        index = getMediumMove();
    } else {
        index = getBestMove();
    }

    if (index !== undefined && index !== null) {
        makeMove(index, 'O');

        if (checkWinner(board, 'O')) {
            endGame('O');
        } else if (board.every(cell => cell !== null)) {
            endGame('tie');
        } else {
            currentPlayer = 'X';
            updateTurnUI();
            enableBoardInteraction();
        }
    }
}

function getRandomMove() {
    const emptyIndices = board.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
    if (emptyIndices.length === 0) return null;
    return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
}

function getMediumMove() {
    for (let combo of WINNING_COMBINATIONS) {
        const [a, b, c] = combo;
        if (board[a] === 'O' && board[b] === 'O' && board[c] === null) return c;
        if (board[a] === 'O' && board[c] === 'O' && board[b] === null) return b;
        if (board[b] === 'O' && board[c] === 'O' && board[a] === null) return a;
    }

    for (let combo of WINNING_COMBINATIONS) {
        const [a, b, c] = combo;
        if (board[a] === 'X' && board[b] === 'X' && board[c] === null) return c;
        if (board[a] === 'X' && board[c] === 'X' && board[b] === null) return b;
        if (board[b] === 'X' && board[c] === 'X' && board[a] === null) return a;
    }

    return getRandomMove();
}

function getBestMove() {
    let bestScore = -Infinity;
    let move = null;

    for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
            board[i] = 'O';
            let score = minimax(board, 0, false);
            board[i] = null;

            if (score > bestScore) {
                bestScore = score;
                move = i;
            }
        }
    }
    return move;
}

function minimax(tempBoard, depth, isMaximizing) {
    if (checkWinner(tempBoard, 'O')) return 10 - depth;
    if (checkWinner(tempBoard, 'X')) return depth - 10;
    if (tempBoard.every(cell => cell !== null)) return 0;

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (let i = 0; i < 9; i++) {
            if (tempBoard[i] === null) {
                tempBoard[i] = 'O';
                let score = minimax(tempBoard, depth + 1, false);
                tempBoard[i] = null;
                bestScore = Math.max(score, bestScore);
            }
        }
        return bestScore;
    } else {
        let bestScore = Infinity;
        for (let i = 0; i < 9; i++) {
            if (tempBoard[i] === null) {
                tempBoard[i] = 'X';
                let score = minimax(tempBoard, depth + 1, true);
                tempBoard[i] = null;
                bestScore = Math.min(score, bestScore);
            }
        }
        return bestScore;
    }
}

// Start Game
init();
