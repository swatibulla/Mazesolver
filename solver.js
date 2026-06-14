/**
 * Maze Solver & Pathfinding Visualizer
 * Core Logic & UI Controller
 */

// Cell representation
class Cell {
    constructor(row, col) {
        this.row = row;
        this.col = col;
        this.walls = { top: true, right: true, bottom: true, left: true };
        this.visited = false; // Used only during maze generation
    }
}

// Color Palette from TDD
const COLORS = {
    UNVISITED: '#F8F7F2',
    EXPLORING: '#FAC775',
    VISITED: '#B5D4F4',
    PATH: '#5DCAA5',
    DEAD: '#B4B2A9',
    START: '#1D9E75',
    END: '#D85A30'
};

// Application State Machine
const STATES = {
    IDLE: 'idle',
    GENERATING: 'generating',
    READY: 'ready',
    SOLVING: 'solving',
    DONE: 'done'
};

class MazeApp {
    constructor() {
        // State variables
        this.currentState = STATES.IDLE;
        this.grid = [];
        this.rows = 15;
        this.cols = 15;
        this.stateMap = {}; // Tracks solver cell states: 'row,col' -> STATE
        this.coordOffset = 32; // Margin for coordinates display
        
        // Animation control
        this.activeGenerator = null;
        this.animationTimeoutId = null;
        this.isCancelled = false;
        this.stepDelay = 100; // in milliseconds
        this.isPaused = false;
        this.currentCell = null;
        
        // Stats
        this.uniqueVisited = new Set();
        this.startTime = null;
        this.timerInterval = null;
        this.elapsedSeconds = 0;
        
        // DOM Bindings
        this.initDOM();
        this.bindEvents();
        
        // Initial Code Display
        this.updateCodeDisplay();
        
        // Initial Maze Generation
        this.triggerGeneration();
    }

    initDOM() {
        this.canvas = document.getElementById('maze');
        this.ctx = this.canvas.getContext('2d');
        
        this.sizeSlider = document.getElementById('sizeSlider');
        this.sizeValue = document.getElementById('sizeValue');
        this.generateBtn = document.getElementById('generateBtn');
        
        this.algoSelect = document.getElementById('algoSelect');
        this.speedSlider = document.getElementById('speedSlider');
        this.speedValue = document.getElementById('speedValue');
        this.goBtn = document.getElementById('goBtn');
        
        this.statVisited = document.getElementById('statVisited');
        this.statPath = document.getElementById('statPath');
        this.statPosition = document.getElementById('statPosition');
        this.statTarget = document.getElementById('statTarget');
        this.statTime = document.getElementById('statTime');
        
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        
        // Debugger Controls
        this.pauseBtn = document.getElementById('pauseBtn');
        this.stepBtn = document.getElementById('stepBtn');
        this.copyBtn = document.getElementById('copyBtn');
    }

    bindEvents() {
        // Size slider
        this.sizeSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            this.sizeValue.textContent = `${val} × ${val}`;
        });
        
        // Speed slider
        this.speedSlider.addEventListener('input', (e) => {
            this.stepDelay = parseInt(e.target.value, 10);
            this.speedValue.textContent = `${this.stepDelay}ms`;
        });
        
        // Generate button
        this.generateBtn.addEventListener('click', () => {
            this.generateBtn.blur();
            if (this.currentState === STATES.SOLVING) {
                this.cancelSolving();
            }
            this.triggerGeneration();
        });
        
        // Go button
        this.goBtn.addEventListener('click', () => {
            this.goBtn.blur();
            if (this.currentState === STATES.READY) {
                this.startSolving();
            } else if (this.currentState === STATES.DONE) {
                this.resetSolver();
                this.startSolving();
            }
        });
        
        // Algorithm selection change
        this.algoSelect.addEventListener('change', () => {
            if (this.grid.length > 0) {
                this.resetSolver();
            }
            this.updateCodeDisplay();
        });
        
        // Pause/Resume button
        this.pauseBtn.addEventListener('click', () => {
            this.pauseBtn.blur();
            this.togglePause();
        });
        
        // Step button
        this.stepBtn.addEventListener('click', () => {
            this.stepBtn.blur();
            if (this.isPaused && this.currentState === STATES.SOLVING) {
                this.executeStep();
            }
        });
        
        // Copy button
        if (this.copyBtn) {
            this.copyBtn.addEventListener('click', () => {
                this.copyBtn.blur();
                this.copyCodeToClipboard();
            });
        }
        
        // Global space key handler to Pause/Resume
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.currentState === STATES.SOLVING) {
                    this.togglePause();
                }
            }
        });
        
        // Canvas resizing on window resize
        window.addEventListener('resize', () => {
            if (this.grid.length > 0) {
                this.resizeAndDraw();
            }
        });
    }

    // Set UI State machine
    setAppState(state) {
        this.currentState = state;
        
        // Update Status indicator
        if (this.statusDot) this.statusDot.className = `status-dot ${state}`;
        if (this.statusText) this.statusText.textContent = state.toUpperCase();
        
        // Handle control access based on state
        switch (state) {
            case STATES.GENERATING:
                this.generateBtn.disabled = true;
                this.goBtn.disabled = true;
                this.sizeSlider.disabled = true;
                this.algoSelect.disabled = true;
                if (this.pauseBtn) this.pauseBtn.disabled = true;
                if (this.stepBtn) this.stepBtn.disabled = true;
                break;
                
            case STATES.READY:
                this.generateBtn.disabled = false;
                this.goBtn.disabled = false;
                this.sizeSlider.disabled = false;
                this.algoSelect.disabled = false;
                if (this.pauseBtn) this.pauseBtn.disabled = true;
                if (this.stepBtn) this.stepBtn.disabled = true;
                break;
                
            case STATES.SOLVING:
                this.generateBtn.disabled = false; // Clicking generate cancels solving
                this.goBtn.disabled = true;
                this.sizeSlider.disabled = true;
                this.algoSelect.disabled = true;
                if (this.pauseBtn) this.pauseBtn.disabled = false;
                if (this.stepBtn) this.stepBtn.disabled = !this.isPaused;
                break;
                
            case STATES.DONE:
                this.generateBtn.disabled = false;
                this.goBtn.disabled = false; // Rerun or change algo on same maze!
                this.sizeSlider.disabled = false;
                this.algoSelect.disabled = false;
                if (this.pauseBtn) this.pauseBtn.disabled = true;
                if (this.stepBtn) this.stepBtn.disabled = true;
                break;
                
            case STATES.IDLE:
            default:
                this.generateBtn.disabled = false;
                this.goBtn.disabled = true;
                this.sizeSlider.disabled = false;
                this.algoSelect.disabled = false;
                if (this.pauseBtn) this.pauseBtn.disabled = true;
                if (this.stepBtn) this.stepBtn.disabled = true;
                break;
        }
    }

    // High DPI Canvas Scaling & Maze drawing
    resizeAndDraw() {
        const dpr = window.devicePixelRatio || 1;
        
        // Determine container bounds
        const container = this.canvas.parentElement;
        const size = Math.min(container.clientWidth - 32, 520); // padding safe
        
        // Compute precise grid-aligned square cell size
        const cellSize = Math.floor((size - this.coordOffset) / this.cols);
        const actualWidth = cellSize * this.cols + this.coordOffset;
        const actualHeight = cellSize * this.rows + this.coordOffset;
        
        // Set display dimensions
        this.canvas.style.width = `${actualWidth}px`;
        this.canvas.style.height = `${actualHeight}px`;
        
        // Set backing store dimensions
        this.canvas.width = actualWidth * dpr;
        this.canvas.height = actualHeight * dpr;
        
        // Context scaling
        this.ctx.scale(dpr, dpr);
        
        this.cellSize = cellSize;
        this.draw();
    }

    // Main Draw loop
    draw() {
        const cols = this.cols;
        const rows = this.rows;
        const cellSize = this.cellSize;
        const ctx = this.ctx;
        const offset = this.coordOffset || 0;
        
        ctx.clearRect(0, 0, cols * cellSize + offset, rows * cellSize + offset);
        
        // 1. Draw Coordinate Labels
        ctx.fillStyle = '#a5b4fc'; // High contrast bright lavender
        ctx.font = `bold ${Math.max(11, Math.floor(cellSize * 0.38))}px var(--font-mono)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Column numbers (top)
        for (let c = 0; c < cols; c++) {
            ctx.fillText(c.toString(), offset + c * cellSize + cellSize / 2, offset / 2);
        }
        
        // Row numbers (left)
        for (let r = 0; r < rows; r++) {
            ctx.fillText(r.toString(), offset / 2, offset + r * cellSize + cellSize / 2);
        }
        
        // 2. Draw Cell Backgrounds
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const key = `${r},${c}`;
                let state = this.stateMap[key] || 'UNVISITED';
                
                let color = COLORS[state];
                
                // Override for Start / End cells
                if (r === 0 && c === 0) {
                    color = COLORS.START;
                } else if (r === rows - 1 && c === cols - 1) {
                    color = COLORS.END;
                }
                
                ctx.fillStyle = color;
                ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
            }
        }
        
        // 3. Draw Walls (Overlay)
        ctx.strokeStyle = '#2e3440'; // Crisp dark-gray wall stroke
        ctx.lineWidth = Math.max(1.5, cellSize * 0.06); // scaled thickness
        ctx.lineCap = 'round';
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = this.grid[r * cols + c];
                const x = offset + c * cellSize;
                const y = offset + r * cellSize;
                
                ctx.beginPath();
                if (cell.walls.top) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + cellSize, y);
                }
                if (cell.walls.right) {
                    ctx.moveTo(x + cellSize, y);
                    ctx.lineTo(x + cellSize, y + cellSize);
                }
                if (cell.walls.bottom) {
                    ctx.moveTo(x, y + cellSize);
                    ctx.lineTo(x + cellSize, y + cellSize);
                }
                if (cell.walls.left) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + cellSize);
                }
                ctx.stroke();
            }
        }
        
        // 4. Draw Start & End Text Badges
        const badgeSize = Math.floor(cellSize * 0.45);
        ctx.font = `bold ${badgeSize}px var(--font-sans)`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // S badge
        ctx.fillStyle = '#ffffff';
        ctx.fillText('S', offset + cellSize / 2, offset + cellSize / 2);
        
        // E badge
        ctx.fillText('E', offset + (cols - 0.5) * cellSize, offset + (rows - 0.5) * cellSize);
        
        // 5. Draw Active Cell Cursor
        if (this.currentCell) {
            const cx = offset + this.currentCell.c * cellSize + cellSize / 2;
            const cy = offset + this.currentCell.r * cellSize + cellSize / 2;
            const radius = cellSize * 0.22;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
            ctx.fillStyle = '#c084fc'; // Glowing medium purple/violet
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1.5, cellSize * 0.05);
            ctx.shadowColor = '#c084fc';
            ctx.shadowBlur = Math.max(4, cellSize * 0.15);
            ctx.fill();
            ctx.stroke();
            ctx.shadowBlur = 0; // reset shadow
        }
    }

    // Trigger Maze Generation (Recursive Backtracker)
    triggerGeneration() {
        this.setAppState(STATES.GENERATING);
        
        // Parse slider size
        const size = parseInt(this.sizeSlider.value, 10);
        this.rows = size;
        this.cols = size;
        
        // Reset statistics
        this.statVisited.textContent = '0';
        this.statPath.textContent = '0';
        this.statTime.textContent = '0.0s';
        if (this.statPosition) this.statPosition.textContent = '-';
        if (this.statTarget) this.statTarget.textContent = `(${size - 1}, ${size - 1})`;
        this.uniqueVisited.clear();
        this.elapsedSeconds = 0;
        
        // Generate maze geometry
        this.grid = this.generateRecursiveBacktracker(this.rows, this.cols);
        
        // Reset Solver state map
        this.stateMap = {};
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.stateMap[`${r},${c}`] = 'UNVISITED';
            }
        }
        
        // Draw to canvas
        this.resizeAndDraw();
        
        // Brief state transition simulation for polish
        setTimeout(() => {
            this.setAppState(STATES.READY);
        }, 150);
    }

    // Generate maze using Recursive Backtracker DFS
    generateRecursiveBacktracker(rows, cols) {
        const grid = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                grid.push(new Cell(r, c));
            }
        }
        
        const getCell = (r, c) => {
            if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
            return grid[r * cols + c];
        };
        
        const stack = [];
        const start = getCell(0, 0);
        start.visited = true;
        stack.push(start);
        
        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = [];
            const r = current.row;
            const c = current.col;
            
            const top = getCell(r - 1, c);
            const right = getCell(r, c + 1);
            const bottom = getCell(r + 1, c);
            const left = getCell(r, c - 1);
            
            if (top && !top.visited) neighbors.push({ cell: top, dir: 'top' });
            if (right && !right.visited) neighbors.push({ cell: right, dir: 'right' });
            if (bottom && !bottom.visited) neighbors.push({ cell: bottom, dir: 'bottom' });
            if (left && !left.visited) neighbors.push({ cell: left, dir: 'left' });
            
            if (neighbors.length > 0) {
                // Select random neighbor
                const randIndex = Math.floor(Math.random() * neighbors.length);
                const nextObj = neighbors[randIndex];
                const next = nextObj.cell;
                
                // Knock down walls
                if (nextObj.dir === 'top') {
                    current.walls.top = false;
                    next.walls.bottom = false;
                } else if (nextObj.dir === 'right') {
                    current.walls.right = false;
                    next.walls.left = false;
                } else if (nextObj.dir === 'bottom') {
                    current.walls.bottom = false;
                    next.walls.top = false;
                } else if (nextObj.dir === 'left') {
                    current.walls.left = false;
                    next.walls.right = false;
                }
                
                next.visited = true;
                stack.push(next);
            } else {
                stack.pop();
            }
        }
        
        return grid;
    }

    // Pathfinding SOLVERS
    
    // 1. BFS Solver Generator
    *bfsSolver() {
        const getCell = (r, c) => this.grid[r * this.cols + c];
        const queue = [{ r: 0, c: 0 }];
        const visited = new Set(['0,0']);
        const parent = {};
        
        // Line 1: queue initialization
        yield { type: 'line', cell: { r: 0, c: 0 }, line: 1, vars: { queue: [...queue], visited: new Set(visited) } };
        // Line 2: visited initialization
        yield { type: 'line', cell: { r: 0, c: 0 }, line: 2, vars: { queue: [...queue], visited: new Set(visited) } };
        
        while (queue.length > 0) {
            // Line 3: while check
            yield { type: 'line', cell: queue[0], line: 3, vars: { queue: [...queue], visited: new Set(visited) } };
            
            const curr = queue.shift();
            // Line 4: pop cell
            yield { type: 'visit', cell: curr, line: 4, vars: { curr, queue: [...queue], visited: new Set(visited) } };
            
            // Line 5: check if target
            yield { type: 'line', cell: curr, line: 5, vars: { curr, queue: [...queue], visited: new Set(visited) } };
            if (curr.r === this.rows - 1 && curr.c === this.cols - 1) {
                // Line 6: target match, reconstruct path
                const path = [];
                let p = curr;
                while (p) {
                    path.push(p);
                    p = parent[`${p.r},${p.c}`];
                }
                path.reverse();
                yield { type: 'done', cell: curr, path, line: 6, vars: { curr, queue: [...queue], visited: new Set(visited), path } };
                return;
            }
            
            const cell = getCell(curr.r, curr.c);
            const r = curr.r;
            const c = curr.c;
            
            const nexts = [];
            if (!cell.walls.top && r > 0) nexts.push({ r: r - 1, c });
            if (!cell.walls.right && c < this.cols - 1) nexts.push({ r, c: c + 1 });
            if (!cell.walls.bottom && r < this.rows - 1) nexts.push({ r: r + 1, c });
            if (!cell.walls.left && c > 0) nexts.push({ r, c: c - 1 });
            
            // Line 8: loop neighbors
            yield { type: 'line', cell: curr, line: 8, vars: { curr, queue: [...queue], visited: new Set(visited) } };
            
            for (const next of nexts) {
                const key = `${next.r},${next.c}`;
                
                // Line 9: visited check
                yield { type: 'line', cell: curr, next, line: 9, vars: { curr, next, queue: [...queue], visited: new Set(visited) } };
                
                if (!visited.has(key)) {
                    // Line 10: add to visited
                    visited.add(key);
                    yield { type: 'line', cell: curr, next, line: 10, vars: { curr, next, queue: [...queue], visited: new Set(visited) } };
                    
                    // Line 11: parent map
                    parent[key] = curr;
                    yield { type: 'line', cell: curr, next, line: 11, vars: { curr, next, queue: [...queue], visited: new Set(visited) } };
                    
                    // Line 12: push to queue
                    queue.push(next);
                    yield { type: 'explore', cell: next, line: 12, vars: { curr, next, queue: [...queue], visited: new Set(visited) } };
                }
            }
        }
        yield { type: 'done', cell: null, path: null, line: 15, vars: { queue: [], visited: new Set(visited) } };
    }
    
    // 2. DFS Solver Generator
    *dfsSolver() {
        const getCell = (r, c) => this.grid[r * this.cols + c];
        const stack = [{ r: 0, c: 0 }];
        const visited = new Set();
        const parent = {};
        
        // Line 1: stack init
        yield { type: 'line', cell: { r: 0, c: 0 }, line: 1, vars: { stack: [...stack], visited: new Set(visited) } };
        // Line 2: visited init
        yield { type: 'line', cell: { r: 0, c: 0 }, line: 2, vars: { stack: [...stack], visited: new Set(visited) } };
        
        while (stack.length > 0) {
            // Line 3: while check
            yield { type: 'line', cell: stack[stack.length - 1], line: 3, vars: { stack: [...stack], visited: new Set(visited) } };
            
            const curr = stack.pop();
            const key = `${curr.r},${curr.c}`;
            // Line 4: pop cell
            yield { type: 'line', cell: curr, line: 4, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            
            // Line 5: visited check
            yield { type: 'line', cell: curr, line: 5, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            if (visited.has(key)) continue;
            
            // Line 6: mark visited
            visited.add(key);
            yield { type: 'visit', cell: curr, line: 6, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            
            // Line 7: target check
            yield { type: 'line', cell: curr, line: 7, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            if (curr.r === this.rows - 1 && curr.c === this.cols - 1) {
                // Line 8: target match, reconstruct
                const path = [];
                let p = curr;
                while (p) {
                    path.push(p);
                    p = parent[`${p.r},${p.c}`];
                }
                path.reverse();
                yield { type: 'done', cell: curr, path, line: 8, vars: { curr, stack: [...stack], visited: new Set(visited), path } };
                return;
            }
            
            const cell = getCell(curr.r, curr.c);
            const r = curr.r;
            const c = curr.c;
            
            const nexts = [];
            if (!cell.walls.top && r > 0) nexts.push({ r: r - 1, c });
            if (!cell.walls.right && c < this.cols - 1) nexts.push({ r, c: c + 1 });
            if (!cell.walls.bottom && r < this.rows - 1) nexts.push({ r: r + 1, c });
            if (!cell.walls.left && c > 0) nexts.push({ r, c: c - 1 });
            
            // Line 10: neighbors loop
            yield { type: 'line', cell: curr, line: 10, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            
            for (const next of nexts) {
                const nKey = `${next.r},${next.c}`;
                
                // Line 11: visited check
                yield { type: 'line', cell: curr, next, line: 11, vars: { curr, next, stack: [...stack], visited: new Set(visited) } };
                
                if (!visited.has(nKey)) {
                    // Line 12: parent mapping
                    parent[nKey] = curr;
                    yield { type: 'line', cell: curr, next, line: 12, vars: { curr, next, stack: [...stack], visited: new Set(visited) } };
                    
                    // Line 13: stack push
                    stack.push(next);
                    yield { type: 'explore', cell: next, line: 13, vars: { curr, next, stack: [...stack], visited: new Set(visited) } };
                }
            }
        }
        yield { type: 'done', cell: null, path: null, line: 16, vars: { stack: [], visited: new Set(visited) } };
    }
    
    // 3. Recursive Backtracking Solver Generator
    *backtrackingSolver() {
        const getCell = (r, c) => this.grid[r * this.cols + c];
        const visited = new Set();
        const path = [];
        const self = this;
        
        // Line 1: visited init
        yield { type: 'line', cell: { r: 0, c: 0 }, line: 1, vars: { visited: new Set(visited), path: [...path] } };
        // Line 2: path init
        yield { type: 'line', cell: { r: 0, c: 0 }, line: 2, vars: { visited: new Set(visited), path: [...path] } };
        
        // Line 18: solve(start) trigger
        yield { type: 'line', cell: { r: 0, c: 0 }, line: 18, vars: { visited: new Set(visited), path: [...path] } };
        
        function* solve(r, c) {
            const cellKey = `${r},${c}`;
            const curr = { r, c };
            
            // Line 3: function entry
            yield { type: 'line', cell: curr, line: 3, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            const isEnd = (r === self.rows - 1 && c === self.cols - 1);
            
            // Line 4: end check
            yield { type: 'line', cell: curr, line: 4, vars: { curr, visited: new Set(visited), path: [...path] } };
            if (isEnd) {
                // Line 5: push to path
                path.push(curr);
                yield { type: 'visit', cell: curr, line: 5, vars: { curr, visited: new Set(visited), path: [...path] } };
                
                // Line 6: return true
                yield { type: 'done', cell: curr, path: [...path], line: 6, vars: { curr, visited: new Set(visited), path: [...path] } };
                return true;
            }
            
            // Line 8: add to visited
            visited.add(cellKey);
            yield { type: 'visit', cell: curr, line: 8, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            // Line 9: push to path
            path.push(curr);
            yield { type: 'line', cell: curr, line: 9, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            const cell = getCell(r, c);
            const nexts = [];
            if (!cell.walls.top && r > 0) nexts.push({ r: r - 1, c });
            if (!cell.walls.right && c < self.cols - 1) nexts.push({ r, c: c + 1 });
            if (!cell.walls.bottom && r < self.rows - 1) nexts.push({ r: r + 1, c });
            if (!cell.walls.left && c > 0) nexts.push({ r, c: c - 1 });
            
            // Line 10: neighbors loop
            yield { type: 'line', cell: curr, line: 10, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            for (const next of nexts) {
                const nextKey = `${next.r},${next.c}`;
                
                // Line 11: visited check
                yield { type: 'line', cell: curr, next, line: 11, vars: { curr, next, visited: new Set(visited), path: [...path] } };
                
                if (!visited.has(nextKey)) {
                    // Line 12: solve(next) recursive call
                    yield { type: 'explore', cell: next, line: 12, vars: { curr, next, visited: new Set(visited), path: [...path] } };
                    const solved = yield* solve(next.r, next.c);
                    if (solved) return true;
                }
            }
            
            // Line 15: pop from path
            path.pop();
            yield { type: 'dead', cell: curr, line: 15, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            // Line 16: return false
            yield { type: 'line', cell: curr, line: 16, vars: { curr, visited: new Set(visited), path: [...path] } };
            return false;
        }
        
        yield* solve(0, 0);
    }

    // Start solving animation
    startSolving() {
        this.setAppState(STATES.SOLVING);
        this.isCancelled = false;
        this.isPaused = false;
        this.updatePauseBtnUI();
        
        // Read algorithm selection
        const algo = this.algoSelect.value;
        if (algo === 'BFS') {
            this.activeGenerator = this.bfsSolver();
        } else if (algo === 'DFS') {
            this.activeGenerator = this.dfsSolver();
        } else if (algo === 'Backtracking') {
            this.activeGenerator = this.backtrackingSolver();
        }
        
        // Start timers
        this.uniqueVisited.clear();
        this.statVisited.textContent = '0';
        this.statPath.textContent = '0';
        
        this.startTime = performance.now();
        this.elapsedSeconds = 0;
        this.statTime.textContent = '0.0s';
        
        this.timerInterval = setInterval(() => {
            if (this.startTime && this.currentState === STATES.SOLVING) {
                this.elapsedSeconds = (performance.now() - this.startTime) / 1000;
                this.statTime.textContent = `${this.elapsedSeconds.toFixed(1)}s`;
            }
        }, 100);
        
        // Read animation speed
        this.stepDelay = parseInt(this.speedSlider.value, 10);
        
        // Show live badge
        const pulse = document.getElementById('varPulse');
        if (pulse) {
            pulse.classList.remove('hidden');
            pulse.textContent = 'Live';
            pulse.style.background = 'rgba(16, 185, 129, 0.12)';
            pulse.style.color = 'var(--success)';
        }
        
        // Kick off step execution loop
        this.runStep();
    }

    // Single step animation execution
    runStep() {
        if (this.isCancelled || this.currentState !== STATES.SOLVING) {
            return;
        }
        
        if (this.isPaused) {
            return;
        }
        
        this.executeStep();
        
        // Schedule next tick
        this.animationTimeoutId = setTimeout(() => {
            this.runStep();
        }, this.stepDelay);
    }
    
    executeStep() {
        const nextStepObj = this.activeGenerator.next();
        
        if (nextStepObj.done) {
            this.completeSolving(null); // Solver finished but didn't yield 'done' state
            return;
        }
        
        const step = nextStepObj.value;
        
        // Update variables display
        this.updateVariablesDisplay(step.vars);
        
        // Update line highlight
        this.highlightLine(step);
        
        if (step.cell) {
            this.currentCell = step.cell;
            const key = `${step.cell.r},${step.cell.c}`;
            if (this.statPosition) {
                this.statPosition.textContent = `(${step.cell.r}, ${step.cell.c})`;
            }
            if (step.type === 'explore') {
                // Mark frontier cell
                if (this.stateMap[key] !== 'VISITED') {
                    this.stateMap[key] = 'EXPLORING';
                }
            } else if (step.type === 'visit') {
                // Mark visited
                this.stateMap[key] = 'VISITED';
                
                // Track statistics
                this.uniqueVisited.add(key);
                this.statVisited.textContent = this.uniqueVisited.size;
            } else if (step.type === 'dead') {
                // Mark dead ends for backtracking
                this.stateMap[key] = 'DEAD';
            }
        }
        
        if (step.type === 'done') {
            this.currentCell = null;
            this.completeSolving(step.path);
            return;
        }
        
        // Rerender frame
        this.draw();
    }

    // Complete Solving Routine
    completeSolving(finalPath) {
        // Clear execution timer
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        
        this.isPaused = false;
        this.updatePauseBtnUI();
        
        // Update pulse indicator to Done
        const pulse = document.getElementById('varPulse');
        if (pulse) {
            pulse.textContent = 'Done';
            pulse.style.background = 'rgba(168, 85, 247, 0.12)';
            pulse.style.color = '#c084fc';
        }
        
        if (finalPath) {
            // Highlight solution path
            for (const cell of finalPath) {
                this.stateMap[`${cell.r},${cell.c}`] = 'PATH';
            }
            this.statPath.textContent = `${finalPath.length} steps`;
        } else {
            this.statPath.textContent = 'No Path';
        }
        
        // Ensure final timers are correct
        if (this.startTime) {
            this.elapsedSeconds = (performance.now() - this.startTime) / 1000;
            this.statTime.textContent = `${this.elapsedSeconds.toFixed(1)}s`;
        }
        
        this.draw();
        this.setAppState(STATES.DONE);
    }

    // Cancel Active Solving Animation
    cancelSolving() {
        this.isCancelled = true;
        this.isPaused = false;
        this.updatePauseBtnUI();
        this.resetVariablesDisplay();
        
        if (this.animationTimeoutId) {
            clearTimeout(this.animationTimeoutId);
            this.animationTimeoutId = null;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.currentCell = null;
    }
    
    // Reset Solver state on current maze (keeping walls)
    resetSolver() {
        if (this.currentState === STATES.SOLVING) {
            this.cancelSolving();
        }
        
        // Reset statistics
        this.statVisited.textContent = '0';
        this.statPath.textContent = '0';
        this.statTime.textContent = '0.0s';
        if (this.statPosition) this.statPosition.textContent = '-';
        this.uniqueVisited.clear();
        this.elapsedSeconds = 0;
        this.currentCell = null;
        
        // Reset Solver state map
        this.stateMap = {};
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                this.stateMap[`${r},${c}`] = 'UNVISITED';
            }
        }
        
        this.setAppState(STATES.READY);
        this.draw();
    }
    
    // Debugger control helpers
    togglePause() {
        if (this.currentState !== STATES.SOLVING) return;
        
        this.isPaused = !this.isPaused;
        this.updatePauseBtnUI();
        
        // Update step button disabled state
        if (this.stepBtn) {
            this.stepBtn.disabled = !this.isPaused;
        }
        
        if (!this.isPaused) {
            // Resume running
            this.runStep();
        }
    }
    
    updatePauseBtnUI() {
        if (!this.pauseBtn) return;
        
        const playIcon = this.pauseBtn.querySelector('.play-icon');
        const pauseIcon = this.pauseBtn.querySelector('.pause-icon');
        
        if (!playIcon || !pauseIcon) return;
        
        if (this.isPaused) {
            playIcon.classList.remove('hidden');
            pauseIcon.classList.add('hidden');
            this.pauseBtn.setAttribute('title', 'Resume');
            
            const pulse = document.getElementById('varPulse');
            if (pulse) {
                pulse.textContent = 'Paused';
                pulse.style.background = 'rgba(245, 158, 11, 0.12)';
                pulse.style.color = 'var(--warning)';
            }
        } else {
            playIcon.classList.add('hidden');
            pauseIcon.classList.remove('hidden');
            this.pauseBtn.setAttribute('title', 'Pause');
            
            const pulse = document.getElementById('varPulse');
            if (pulse) {
                pulse.textContent = 'Live';
                pulse.style.background = 'rgba(16, 185, 129, 0.12)';
                pulse.style.color = 'var(--success)';
            }
        }
    }

    copyCodeToClipboard() {
        if (!this.copyBtn) return;
        const lines = Array.from(document.querySelectorAll('#codeEditor .line-content'))
                           .map(el => el.textContent)
                           .join('\n');
                           
        navigator.clipboard.writeText(lines).then(() => {
            const copyIcon = this.copyBtn.querySelector('.copy-icon');
            const checkIcon = this.copyBtn.querySelector('.check-icon');
            
            if (copyIcon && checkIcon) {
                copyIcon.classList.add('hidden');
                checkIcon.classList.remove('hidden');
                this.copyBtn.classList.add('success');
                this.copyBtn.setAttribute('title', 'Copied!');
                
                setTimeout(() => {
                    copyIcon.classList.remove('hidden');
                    checkIcon.classList.add('hidden');
                    this.copyBtn.classList.remove('success');
                    this.copyBtn.setAttribute('title', 'Copy Code');
                }, 2000);
            }
        }).catch(err => {
            console.error('Failed to copy code: ', err);
        });
    }
    
    updateVariablesDisplay(vars) {
        const grid = document.getElementById('variablesGrid');
        if (!grid) return;
        
        if (!vars || Object.keys(vars).length === 0) {
            grid.innerHTML = '<div class="no-vars">No active variables in current state.</div>';
            return;
        }
        
        // Track old values to highlight changes
        const oldValues = {};
        grid.querySelectorAll('.var-row').forEach(row => {
            const nameEl = row.querySelector('.var-name');
            const valEl = row.querySelector('.var-value');
            if (nameEl && valEl) {
                oldValues[nameEl.textContent] = valEl.textContent;
            }
        });
        
        grid.innerHTML = '';
        
        for (const [key, val] of Object.entries(vars)) {
            const row = document.createElement('div');
            row.className = 'var-row';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'var-name';
            nameSpan.textContent = key;
            
            const valSpan = document.createElement('span');
            valSpan.className = 'var-value';
            
            let formattedVal = '';
            if (val === null || val === undefined) {
                formattedVal = 'null';
            } else if (typeof val === 'object') {
                if (Array.isArray(val)) {
                    if (val.length === 0) {
                        formattedVal = '[]';
                    } else {
                        const items = val.map(item => `(${item.r},${item.c})`).join(', ');
                        formattedVal = `[${items}] (${val.length})`;
                    }
                } else if (val instanceof Set) {
                    if (val.size === 0) {
                        formattedVal = 'Set {}';
                    } else {
                        const items = Array.from(val).slice(0, 3).map(k => `(${k})`).join(', ');
                        formattedVal = `Set { ${items}${val.size > 3 ? '...' : ''} } (${val.size})`;
                    }
                } else if (val.r !== undefined && val.c !== undefined) {
                    formattedVal = `(${val.r}, ${val.c})`;
                } else {
                    formattedVal = JSON.stringify(val);
                }
            } else {
                formattedVal = val.toString();
            }
            
            valSpan.textContent = formattedVal;
            valSpan.title = formattedVal;
            
            if (oldValues[key] !== undefined && oldValues[key] !== formattedVal) {
                row.classList.add('changed');
            }
            
            row.appendChild(nameSpan);
            row.appendChild(valSpan);
            grid.appendChild(row);
        }
    }
    
    resetVariablesDisplay() {
        const grid = document.getElementById('variablesGrid');
        if (grid) {
            grid.innerHTML = '<div class="no-vars">Start pathfinding to watch variables.</div>';
        }
        const pulse = document.getElementById('varPulse');
        if (pulse) {
            pulse.classList.add('hidden');
        }
    }
    
    highlightLine(step) {
        if (!step) return;
        const editor = document.getElementById('codeEditor');
        if (!editor) return;
        
        editor.querySelectorAll('.code-line').forEach(line => {
            line.classList.remove('active');
        });
        
        const lineNum = step.line;
        const algo = this.algoSelect.value;
        let mappedLine = lineNum;
        if (algo === 'BFS') {
            const bfsMap = {
                1: 31,
                2: 32,
                3: 34,
                4: 36,
                5: 38,
                6: 39,
                8: 41,
                9: 46,
                10: 51,
                11: 52,
                12: 52,
                15: 57
            };
            mappedLine = bfsMap[lineNum] || lineNum;
        } else if (algo === 'DFS') {
            const dfsMap = {
                1: 31,
                2: 31,
                3: 33,
                4: 35,
                5: 37,
                6: 40,
                7: 42,
                8: 43,
                10: 45,
                11: 50,
                12: 55,
                13: 55,
                16: 60
            };
            mappedLine = dfsMap[lineNum] || lineNum;
        } else if (algo === 'Backtracking') {
            const btMap = {
                1: 7,
                2: 8,
                18: 41,
                3: 13,
                4: 15,
                5: 16,
                6: 16,
                8: 18,
                9: 18,
                10: 20,
                11: 25,
                12: 29,
                15: 35,
                16: 36
            };
            mappedLine = btMap[lineNum] || lineNum;
        }
        
        const targetLine = editor.querySelector(`.code-line[data-line="${mappedLine}"]`);
        if (targetLine) {
            targetLine.classList.add('active');
            targetLine.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    updateCodeDisplay() {
        const algo = this.algoSelect.value;
        const editor = document.getElementById('codeEditor');
        if (!editor) return;
        
        let lines = [];
        if (algo === 'BFS') {
            lines = [
                { num: 1, text: '<span class="code-keyword">#include</span> <span class="code-string">&lt;stdio.h&gt;</span>' },
                { num: 2, text: '' },
                { num: 3, text: '<span class="code-keyword">#define</span> ROWS 15' },
                { num: 4, text: '<span class="code-keyword">#define</span> COLS 15' },
                { num: 5, text: '<span class="code-keyword">#define</span> SIZE 1000' },
                { num: 6, text: '' },
                { num: 7, text: '<span class="code-keyword">typedef struct</span> {' },
                { num: 8, text: '    <span class="code-keyword">int</span> row, col;' },
                { num: 9, text: '} <span class="code-var">Position</span>;' },
                { num: 10, text: '' },
                { num: 11, text: '<span class="code-keyword">int</span> wall[ROWS][COLS][4];    <span class="code-comment">// 0=top, 1=right, 2=bottom, 3=left</span>' },
                { num: 12, text: '<span class="code-keyword">int</span> visited[ROWS][COLS];' },
                { num: 13, text: 'Position queue[SIZE];' },
                { num: 14, text: '<span class="code-keyword">int</span> front = 0, rear = 0;' },
                { num: 15, text: '' },
                { num: 16, text: '<span class="code-keyword">const int</span> dr[4] = {-1, 0, 1, 0};' },
                { num: 17, text: '<span class="code-keyword">const int</span> dc[4] = {0, 1, 0, -1};' },
                { num: 18, text: '' },
                { num: 19, text: '<span class="code-keyword">void</span> <span class="code-fn">enqueue</span>(<span class="code-keyword">int</span> r, <span class="code-keyword">int</span> c)' },
                { num: 20, text: '{' },
                { num: 21, text: '    queue[rear++] = (Position){r, c};' },
                { num: 22, text: '}' },
                { num: 23, text: '' },
                { num: 24, text: 'Position <span class="code-fn">dequeue</span>(<span class="code-keyword">void</span>)' },
                { num: 25, text: '{' },
                { num: 26, text: '    <span class="code-keyword">return</span> queue[front++];' },
                { num: 27, text: '}' },
                { num: 28, text: '' },
                { num: 29, text: '<span class="code-keyword">int</span> <span class="code-fn">findPathBFS</span>(<span class="code-keyword">void</span>)' },
                { num: 30, text: '{' },
                { num: 31, text: '    <span class="code-fn">enqueue</span>(0, 0);' },
                { num: 32, text: '    visited[0][0] = 1;' },
                { num: 33, text: '' },
                { num: 34, text: '    <span class="code-keyword">while</span> (front &lt; rear)' },
                { num: 35, text: '    {' },
                { num: 36, text: '        Position p = <span class="code-fn">dequeue</span>();' },
                { num: 37, text: '' },
                { num: 38, text: '        <span class="code-keyword">if</span> (p.row == ROWS - 1 &amp;&amp; p.col == COLS - 1)' },
                { num: 39, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 40, text: '' },
                { num: 41, text: '        <span class="code-keyword">for</span> (<span class="code-keyword">int</span> d = 0; d &lt; 4; d++)' },
                { num: 42, text: '        {' },
                { num: 43, text: '            <span class="code-keyword">int</span> nr = p.row + dr[d];' },
                { num: 44, text: '            <span class="code-keyword">int</span> nc = p.col + dc[d];' },
                { num: 45, text: '' },
                { num: 46, text: '            <span class="code-keyword">if</span> (nr &gt;= 0 &amp;&amp; nr &lt; ROWS &amp;&amp;' },
                { num: 47, text: '                nc &gt;= 0 &amp;&amp; nc &lt; COLS &amp;&amp;' },
                { num: 48, text: '                !wall[p.row][p.col][d] &amp;&amp;' },
                { num: 49, text: '                !visited[nr][nc])' },
                { num: 50, text: '            {' },
                { num: 51, text: '                visited[nr][nc] = 1;' },
                { num: 52, text: '                <span class="code-fn">enqueue</span>(nr, nc);' },
                { num: 53, text: '            }' },
                { num: 54, text: '        }' },
                { num: 55, text: '    }' },
                { num: 56, text: '' },
                { num: 57, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 58, text: '}' },
                { num: 59, text: '' },
                { num: 60, text: '<span class="code-keyword">int</span> <span class="code-fn">main</span>(<span class="code-keyword">void</span>)' },
                { num: 61, text: '{' },
                { num: 62, text: '    <span class="code-keyword">if</span> (<span class="code-fn">findPathBFS</span>())' },
                { num: 63, text: '        <span class="code-fn">printf</span>(<span class="code-string">"Path Found using BFS\\n"</span>);' },
                { num: 64, text: '    <span class="code-keyword">else</span>' },
                { num: 65, text: '        <span class="code-fn">printf</span>(<span class="code-string">"No Path Found\\n"</span>);' },
                { num: 66, text: '' },
                { num: 67, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 68, text: '}' }
            ];
        } else if (algo === 'DFS') {
            lines = [
                { num: 1, text: '<span class="code-keyword">#include</span> <span class="code-string">&lt;stdio.h&gt;</span>' },
                { num: 2, text: '' },
                { num: 3, text: '<span class="code-keyword">#define</span> ROWS 15' },
                { num: 4, text: '<span class="code-keyword">#define</span> COLS 15' },
                { num: 5, text: '<span class="code-keyword">#define</span> SIZE 1000' },
                { num: 6, text: '' },
                { num: 7, text: '<span class="code-keyword">typedef struct</span> {' },
                { num: 8, text: '    <span class="code-keyword">int</span> row, col;' },
                { num: 9, text: '} <span class="code-var">Position</span>;' },
                { num: 10, text: '' },
                { num: 11, text: '<span class="code-keyword">int</span> wall[ROWS][COLS][4];    <span class="code-comment">// 0=top, 1=right, 2=bottom, 3=left</span>' },
                { num: 12, text: '<span class="code-keyword">int</span> visited[ROWS][COLS];' },
                { num: 13, text: 'Position stack[SIZE];' },
                { num: 14, text: '<span class="code-keyword">int</span> top = -1;' },
                { num: 15, text: '' },
                { num: 16, text: '<span class="code-keyword">const int</span> dr[4] = {-1, 0, 1, 0};' },
                { num: 17, text: '<span class="code-keyword">const int</span> dc[4] = {0, 1, 0, -1};' },
                { num: 18, text: '' },
                { num: 19, text: '<span class="code-keyword">void</span> <span class="code-fn">push</span>(Position p)' },
                { num: 20, text: '{' },
                { num: 21, text: '    stack[++top] = p;' },
                { num: 22, text: '}' },
                { num: 23, text: '' },
                { num: 24, text: 'Position <span class="code-fn">pop</span>(<span class="code-keyword">void</span>)' },
                { num: 25, text: '{' },
                { num: 26, text: '    <span class="code-keyword">return</span> stack[top--];' },
                { num: 27, text: '}' },
                { num: 28, text: '' },
                { num: 29, text: '<span class="code-keyword">int</span> <span class="code-fn">findPathDFS</span>(<span class="code-keyword">void</span>)' },
                { num: 30, text: '{' },
                { num: 31, text: '    <span class="code-fn">push</span>((Position){0, 0});' },
                { num: 32, text: '' },
                { num: 33, text: '    <span class="code-keyword">while</span> (top &gt;= 0)' },
                { num: 34, text: '    {' },
                { num: 35, text: '        Position p = <span class="code-fn">pop</span>();' },
                { num: 36, text: '' },
                { num: 37, text: '        <span class="code-keyword">if</span> (visited[p.row][p.col])' },
                { num: 38, text: '            <span class="code-keyword">continue</span>;' },
                { num: 39, text: '' },
                { num: 40, text: '        visited[p.row][p.col] = 1;' },
                { num: 41, text: '' },
                { num: 42, text: '        <span class="code-keyword">if</span> (p.row == ROWS - 1 &amp;&amp; p.col == COLS - 1)' },
                { num: 43, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 44, text: '' },
                { num: 45, text: '        <span class="code-keyword">for</span> (<span class="code-keyword">int</span> d = 0; d &lt; 4; d++)' },
                { num: 46, text: '        {' },
                { num: 47, text: '            <span class="code-keyword">int</span> nr = p.row + dr[d];' },
                { num: 48, text: '            <span class="code-keyword">int</span> nc = p.col + dc[d];' },
                { num: 49, text: '' },
                { num: 50, text: '            <span class="code-keyword">if</span> (nr &gt;= 0 &amp;&amp; nr &lt; ROWS &amp;&amp;' },
                { num: 51, text: '                nc &gt;= 0 &amp;&amp; nc &lt; COLS &amp;&amp;' },
                { num: 52, text: '                !wall[p.row][p.col][d] &amp;&amp;' },
                { num: 53, text: '                !visited[nr][nc])' },
                { num: 54, text: '            {' },
                { num: 55, text: '                <span class="code-fn">push</span>((Position){nr, nc});' },
                { num: 56, text: '            }' },
                { num: 57, text: '        }' },
                { num: 58, text: '    }' },
                { num: 59, text: '' },
                { num: 60, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 61, text: '}' },
                { num: 62, text: '' },
                { num: 63, text: '<span class="code-keyword">int</span> <span class="code-fn">main</span>(<span class="code-keyword">void</span>)' },
                { num: 64, text: '{' },
                { num: 65, text: '    <span class="code-comment">/* Example: all walls are open (0) by default,' },
                { num: 66, text: '       so a path exists from (0,0) to (14,14). */</span>' },
                { num: 67, text: '' },
                { num: 68, text: '    <span class="code-keyword">if</span> (<span class="code-fn">findPathDFS</span>())' },
                { num: 69, text: '        <span class="code-fn">printf</span>(<span class="code-string">"Path Found using DFS\\n"</span>);' },
                { num: 70, text: '    <span class="code-keyword">else</span>' },
                { num: 71, text: '        <span class="code-fn">printf</span>(<span class="code-string">"No Path Found\\n"</span>);' },
                { num: 72, text: '' },
                { num: 73, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 74, text: '}' }
            ];
        } else if (algo === 'Backtracking') {
            lines = [
                { num: 1, text: '<span class="code-keyword">#include</span> <span class="code-string">&lt;stdio.h&gt;</span>' },
                { num: 2, text: '' },
                { num: 3, text: '<span class="code-keyword">#define</span> ROWS 15' },
                { num: 4, text: '<span class="code-keyword">#define</span> COLS 15' },
                { num: 5, text: '' },
                { num: 6, text: '<span class="code-keyword">int</span> wall[ROWS][COLS][4];      <span class="code-comment">// 0=top,1=right,2=bottom,3=left</span>' },
                { num: 7, text: '<span class="code-keyword">int</span> visited[ROWS][COLS];' },
                { num: 8, text: '<span class="code-keyword">int</span> solution[ROWS][COLS];' },
                { num: 9, text: '' },
                { num: 10, text: '<span class="code-keyword">const int</span> dr[4] = {-1, 0, 1, 0};' },
                { num: 11, text: '<span class="code-keyword">const int</span> dc[4] = {0, 1, 0, -1};' },
                { num: 12, text: '' },
                { num: 13, text: '<span class="code-keyword">int</span> <span class="code-fn">solveMaze</span>(<span class="code-keyword">int</span> r, <span class="code-keyword">int</span> c)' },
                { num: 14, text: '{' },
                { num: 15, text: '    <span class="code-keyword">if</span> (r == ROWS - 1 &amp;&amp; c == COLS - 1)' },
                { num: 16, text: '        <span class="code-keyword">return</span> solution[r][c] = 1;' },
                { num: 17, text: '' },
                { num: 18, text: '    visited[r][c] = solution[r][c] = 1;' },
                { num: 19, text: '' },
                { num: 20, text: '    <span class="code-keyword">for</span> (<span class="code-keyword">int</span> d = 0; d &lt; 4; d++)' },
                { num: 21, text: '    {' },
                { num: 22, text: '        <span class="code-keyword">int</span> nr = r + dr[d];' },
                { num: 23, text: '        <span class="code-keyword">int</span> nc = c + dc[d];' },
                { num: 24, text: '' },
                { num: 25, text: '        <span class="code-keyword">if</span> (nr &gt;= 0 &amp;&amp; nr &lt; ROWS &amp;&amp;' },
                { num: 26, text: '            nc &gt;= 0 &amp;&amp; nc &lt; COLS &amp;&amp;' },
                { num: 27, text: '            !wall[r][c][d] &amp;&amp;' },
                { num: 28, text: '            !visited[nr][nc] &amp;&amp;' },
                { num: 29, text: '            <span class="code-fn">solveMaze</span>(nr, nc))' },
                { num: 30, text: '        {' },
                { num: 31, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 32, text: '        }' },
                { num: 33, text: '    }' },
                { num: 34, text: '' },
                { num: 35, text: '    solution[r][c] = 0;' },
                { num: 36, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 37, text: '}' },
                { num: 38, text: '' },
                { num: 39, text: '<span class="code-keyword">int</span> <span class="code-fn">main</span>(<span class="code-keyword">void</span>)' },
                { num: 40, text: '{' },
                { num: 41, text: '    <span class="code-keyword">if</span> (<span class="code-fn">solveMaze</span>(0, 0))' },
                { num: 42, text: '    {' },
                { num: 43, text: '        <span class="code-keyword">for</span> (<span class="code-keyword">int</span> r = 0; r &lt; ROWS; r++)' },
                { num: 44, text: '        {' },
                { num: 45, text: '            <span class="code-keyword">for</span> (<span class="code-keyword">int</span> c = 0; c &lt; COLS; c++)' },
                { num: 46, text: '                <span class="code-fn">printf</span>(<span class="code-string">"%d "</span>, solution[r][c]);' },
                { num: 47, text: '' },
                { num: 48, text: '            <span class="code-fn">printf</span>(<span class="code-string">"\\n"</span>);' },
                { num: 49, text: '        }' },
                { num: 50, text: '    }' },
                { num: 51, text: '    <span class="code-keyword">else</span>' },
                { num: 52, text: '    {' },
                { num: 53, text: '        <span class="code-fn">printf</span>(<span class="code-string">"No Solution Exists\\n"</span>);' },
                { num: 54, text: '    }' },
                { num: 55, text: '' },
                { num: 56, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 57, text: '}' }
            ];
        }
        
        editor.innerHTML = '';
        lines.forEach(line => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'code-line';
            lineDiv.setAttribute('data-line', line.num);
            
            const numSpan = document.createElement('span');
            numSpan.className = 'line-num';
            numSpan.textContent = line.num;
            
            const contentSpan = document.createElement('span');
            contentSpan.className = 'line-content';
            contentSpan.innerHTML = line.text;
            
            lineDiv.appendChild(numSpan);
            lineDiv.appendChild(contentSpan);
            editor.appendChild(lineDiv);
        });
        
        this.resetVariablesDisplay();
    }
}

// Instantiate application on DOM load
window.addEventListener('DOMContentLoaded', () => {
    window.app = new MazeApp();
});
