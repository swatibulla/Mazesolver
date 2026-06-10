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
            }
        });
        
        // Algorithm selection change
        this.algoSelect.addEventListener('change', () => {
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
                this.goBtn.disabled = true; // Need to regenerate to solve again
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
        yield { type: 'line', line: 1, vars: { queue: [...queue], visited: new Set(visited) } };
        // Line 2: visited initialization
        yield { type: 'line', line: 2, vars: { queue: [...queue], visited: new Set(visited) } };
        
        while (queue.length > 0) {
            // Line 3: while check
            yield { type: 'line', line: 3, vars: { queue: [...queue], visited: new Set(visited) } };
            
            const curr = queue.shift();
            // Line 4: pop cell
            yield { type: 'visit', cell: curr, line: 4, vars: { curr, queue: [...queue], visited: new Set(visited) } };
            
            // Line 5: check if target
            yield { type: 'line', line: 5, vars: { curr, queue: [...queue], visited: new Set(visited) } };
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
            yield { type: 'line', line: 8, vars: { curr, queue: [...queue], visited: new Set(visited) } };
            
            for (const next of nexts) {
                const key = `${next.r},${next.c}`;
                
                // Line 9: visited check
                yield { type: 'line', line: 9, vars: { curr, next, queue: [...queue], visited: new Set(visited) } };
                
                if (!visited.has(key)) {
                    // Line 10: add to visited
                    visited.add(key);
                    yield { type: 'line', line: 10, vars: { curr, next, queue: [...queue], visited: new Set(visited) } };
                    
                    // Line 11: parent map
                    parent[key] = curr;
                    yield { type: 'line', line: 11, vars: { curr, next, queue: [...queue], visited: new Set(visited) } };
                    
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
        yield { type: 'line', line: 1, vars: { stack: [...stack], visited: new Set(visited) } };
        // Line 2: visited init
        yield { type: 'line', line: 2, vars: { stack: [...stack], visited: new Set(visited) } };
        
        while (stack.length > 0) {
            // Line 3: while check
            yield { type: 'line', line: 3, vars: { stack: [...stack], visited: new Set(visited) } };
            
            const curr = stack.pop();
            const key = `${curr.r},${curr.c}`;
            // Line 4: pop cell
            yield { type: 'line', line: 4, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            
            // Line 5: visited check
            yield { type: 'line', line: 5, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            if (visited.has(key)) continue;
            
            // Line 6: mark visited
            visited.add(key);
            yield { type: 'visit', cell: curr, line: 6, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            
            // Line 7: target check
            yield { type: 'line', line: 7, vars: { curr, stack: [...stack], visited: new Set(visited) } };
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
            
            // Shuffle search directions to make it look organic
            for (let i = nexts.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [nexts[i], nexts[j]] = [nexts[j], nexts[i]];
            }
            
            // Line 10: neighbors loop
            yield { type: 'line', line: 10, vars: { curr, stack: [...stack], visited: new Set(visited) } };
            
            for (const next of nexts) {
                const nKey = `${next.r},${next.c}`;
                
                // Line 11: visited check
                yield { type: 'line', line: 11, vars: { curr, next, stack: [...stack], visited: new Set(visited) } };
                
                if (!visited.has(nKey)) {
                    // Line 12: parent mapping
                    parent[nKey] = curr;
                    yield { type: 'line', line: 12, vars: { curr, next, stack: [...stack], visited: new Set(visited) } };
                    
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
        yield { type: 'line', line: 1, vars: { visited: new Set(visited), path: [...path] } };
        // Line 2: path init
        yield { type: 'line', line: 2, vars: { visited: new Set(visited), path: [...path] } };
        
        // Line 18: solve(start) trigger
        yield { type: 'line', line: 18, vars: { visited: new Set(visited), path: [...path] } };
        
        function* solve(r, c) {
            const cellKey = `${r},${c}`;
            const curr = { r, c };
            
            // Line 3: function entry
            yield { type: 'line', line: 3, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            const isEnd = (r === self.rows - 1 && c === self.cols - 1);
            
            // Line 4: end check
            yield { type: 'line', line: 4, vars: { curr, visited: new Set(visited), path: [...path] } };
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
            yield { type: 'line', line: 9, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            const cell = getCell(r, c);
            const nexts = [];
            if (!cell.walls.top && r > 0) nexts.push({ r: r - 1, c });
            if (!cell.walls.right && c < self.cols - 1) nexts.push({ r, c: c + 1 });
            if (!cell.walls.bottom && r < self.rows - 1) nexts.push({ r: r + 1, c });
            if (!cell.walls.left && c > 0) nexts.push({ r, c: c - 1 });
            
            // Line 10: neighbors loop
            yield { type: 'line', line: 10, vars: { curr, visited: new Set(visited), path: [...path] } };
            
            for (const next of nexts) {
                const nextKey = `${next.r},${next.c}`;
                
                // Line 11: visited check
                yield { type: 'line', line: 11, vars: { curr, next, visited: new Set(visited), path: [...path] } };
                
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
            yield { type: 'line', line: 16, vars: { curr, visited: new Set(visited), path: [...path] } };
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
                1: 45,
                2: 46,
                3: 52,
                4: 54,
                5: 57,
                6: 60,
                8: 64,
                9: 69,
                10: 74,
                11: 75,
                12: 75,
                15: 80
            };
            mappedLine = bfsMap[lineNum] || lineNum;
        } else if (algo === 'DFS') {
            const dfsMap = {
                1: 16,
                2: 14,
                3: 16,
                4: 16,
                5: 21,
                6: 27,
                7: 24,
                8: 25,
                10: 29,
                11: 21,
                12: 29,
                13: 29,
                16: 19
            };
            mappedLine = dfsMap[lineNum] || lineNum;
        } else if (algo === 'Backtracking') {
            if (lineNum === 12 && step.cell && step.vars && step.vars.curr) {
                const curr = step.vars.curr;
                const next = step.cell;
                if (next.r > curr.r) mappedLine = 36;
                else if (next.c > curr.c) mappedLine = 40;
                else if (next.r < curr.r) mappedLine = 44;
                else if (next.c < curr.c) mappedLine = 48;
            } else {
                const btMap = {
                    1: 15,
                    2: 15,
                    18: 73,
                    3: 22,
                    4: 25,
                    5: 27,
                    6: 28,
                    8: 33,
                    9: 33,
                    10: 31,
                    11: 31,
                    15: 52,
                    16: 55
                };
                mappedLine = btMap[lineNum] || lineNum;
            }
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
                { num: 3, text: '<span class="code-keyword">#define</span> ROWS 5' },
                { num: 4, text: '<span class="code-keyword">#define</span> COLS 5' },
                { num: 5, text: '<span class="code-keyword">#define</span> SIZE 100' },
                { num: 6, text: '' },
                { num: 7, text: '<span class="code-comment">// Structure to store a cell position</span>' },
                { num: 8, text: '<span class="code-keyword">typedef struct</span> {' },
                { num: 9, text: '    <span class="code-keyword">int</span> row;' },
                { num: 10, text: '    <span class="code-keyword">int</span> col;' },
                { num: 11, text: '} <span class="code-var">Cell</span>;' },
                { num: 12, text: '' },
                { num: 13, text: 'Cell queue[SIZE];' },
                { num: 14, text: '<span class="code-keyword">int</span> front = 0;' },
                { num: 15, text: '<span class="code-keyword">int</span> rear = 0;' },
                { num: 16, text: '' },
                { num: 17, text: '<span class="code-comment">// Maze: 1 = path, 0 = blocked</span>' },
                { num: 18, text: '<span class="code-keyword">int</span> maze[ROWS][COLS] = {' },
                { num: 19, text: '    {1,1,0,0,0},' },
                { num: 20, text: '    {0,1,1,0,0},' },
                { num: 21, text: '    {0,0,1,1,0},' },
                { num: 22, text: '    {1,0,0,1,1},' },
                { num: 23, text: '    {0,0,0,0,1}' },
                { num: 24, text: '};' },
                { num: 25, text: '' },
                { num: 26, text: '<span class="code-keyword">int</span> visited[ROWS][COLS] = {0};' },
                { num: 27, text: '' },
                { num: 28, text: '<span class="code-comment">// Add a cell to the queue</span>' },
                { num: 29, text: '<span class="code-keyword">void</span> <span class="code-fn">enqueue</span>(<span class="code-keyword">int</span> row, <span class="code-keyword">int</span> col)' },
                { num: 30, text: '{' },
                { num: 31, text: '    queue[rear].row = row;' },
                { num: 32, text: '    queue[rear].col = col;' },
                { num: 33, text: '    rear++;' },
                { num: 34, text: '}' },
                { num: 35, text: '' },
                { num: 36, text: '<span class="code-comment">// Remove a cell from the queue</span>' },
                { num: 37, text: 'Cell <span class="code-fn">dequeue</span>()' },
                { num: 38, text: '{' },
                { num: 39, text: '    <span class="code-keyword">return</span> queue[front++];' },
                { num: 40, text: '}' },
                { num: 41, text: '' },
                { num: 42, text: '<span class="code-comment">// BFS function to check if a path exists</span>' },
                { num: 43, text: '<span class="code-keyword">int</span> <span class="code-fn">findPathBFS</span>()' },
                { num: 44, text: '{' },
                { num: 45, text: '    <span class="code-fn">enqueue</span>(0, 0);' },
                { num: 46, text: '    visited[0][0] = 1;' },
                { num: 47, text: '' },
                { num: 48, text: '    <span class="code-comment">// Possible movements: Down, Up, Right, Left</span>' },
                { num: 49, text: '    <span class="code-keyword">int</span> rowMove[] = {1, -1, 0, 0};' },
                { num: 50, text: '    <span class="code-keyword">int</span> colMove[] = {0, 0, 1, -1};' },
                { num: 51, text: '' },
                { num: 52, text: '    <span class="code-keyword">while</span> (front &lt; rear)' },
                { num: 53, text: '    {' },
                { num: 54, text: '        Cell current = <span class="code-fn">dequeue</span>();' },
                { num: 55, text: '' },
                { num: 56, text: '        <span class="code-comment">// Destination reached</span>' },
                { num: 57, text: '        <span class="code-keyword">if</span> (current.row == ROWS - 1 &amp;&amp;' },
                { num: 58, text: '            current.col == COLS - 1)' },
                { num: 59, text: '        {' },
                { num: 60, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 61, text: '        }' },
                { num: 62, text: '' },
                { num: 63, text: '        <span class="code-comment">// Check all 4 directions</span>' },
                { num: 64, text: '        <span class="code-keyword">for</span> (<span class="code-keyword">int</span> i = 0; i &lt; 4; i++)' },
                { num: 65, text: '        {' },
                { num: 66, text: '            <span class="code-keyword">int</span> newRow = current.row + rowMove[i];' },
                { num: 67, text: '            <span class="code-keyword">int</span> newCol = current.col + colMove[i];' },
                { num: 68, text: '' },
                { num: 69, text: '            <span class="code-keyword">if</span> (newRow &gt;= 0 &amp;&amp; newRow &lt; ROWS &amp;&amp;' },
                { num: 70, text: '                newCol &gt;= 0 &amp;&amp; newCol &lt; COLS &amp;&amp;' },
                { num: 71, text: '                maze[newRow][newCol] == 1 &amp;&amp;' },
                { num: 72, text: '                visited[newRow][newCol] == 0)' },
                { num: 73, text: '            {' },
                { num: 74, text: '                visited[newRow][newCol] = 1;' },
                { num: 75, text: '                <span class="code-fn">enqueue</span>(newRow, newCol);' },
                { num: 76, text: '            }' },
                { num: 77, text: '        }' },
                { num: 78, text: '    }' },
                { num: 79, text: '' },
                { num: 80, text: '    <span class="code-keyword">return</span> 0; <span class="code-comment">// No path found</span>' },
                { num: 81, text: '}' },
                { num: 82, text: '' },
                { num: 83, text: '<span class="code-keyword">int</span> <span class="code-fn">main</span>()' },
                { num: 84, text: '{' },
                { num: 85, text: '    <span class="code-keyword">if</span> (<span class="code-fn">findPathBFS</span>())' },
                { num: 86, text: '        <span class="code-fn">printf</span>(<span class="code-string">"Path Found using BFS\\n"</span>);' },
                { num: 87, text: '    <span class="code-keyword">else</span>' },
                { num: 88, text: '        <span class="code-fn">printf</span>(<span class="code-string">"No Path Found\\n"</span>);' },
                { num: 89, text: '' },
                { num: 90, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 91, text: '}' }
            ];
        } else if (algo === 'DFS') {
            lines = [
                { num: 1, text: '<span class="code-keyword">#include</span> <span class="code-string">&lt;stdio.h&gt;</span>' },
                { num: 2, text: '' },
                { num: 3, text: '<span class="code-keyword">#define</span> ROW 5' },
                { num: 4, text: '<span class="code-keyword">#define</span> COL 5' },
                { num: 5, text: '' },
                { num: 6, text: '<span class="code-keyword">int</span> maze[ROW][COL] = {' },
                { num: 7, text: '    {1,1,0,0,0},' },
                { num: 8, text: '    {0,1,1,0,0},' },
                { num: 9, text: '    {0,0,1,1,0},' },
                { num: 10, text: '    {1,0,0,1,1},' },
                { num: 11, text: '    {0,0,0,0,1}' },
                { num: 12, text: '};' },
                { num: 13, text: '' },
                { num: 14, text: '<span class="code-keyword">int</span> visited[ROW][COL];' },
                { num: 15, text: '' },
                { num: 16, text: '<span class="code-keyword">int</span> <span class="code-fn">dfs</span>(<span class="code-keyword">int</span> x, <span class="code-keyword">int</span> y)' },
                { num: 17, text: '{' },
                { num: 18, text: '    <span class="code-keyword">if</span>(x&lt;0 || y&lt;0 || x&gt;=ROW || y&gt;=COL)' },
                { num: 19, text: '        <span class="code-keyword">return</span> 0;' },
                { num: 20, text: '' },
                { num: 21, text: '    <span class="code-keyword">if</span>(maze[x][y]==0 || visited[x][y])' },
                { num: 22, text: '        <span class="code-keyword">return</span> 0;' },
                { num: 23, text: '' },
                { num: 24, text: '    <span class="code-keyword">if</span>(x==ROW-1 &amp;&amp; y==COL-1)' },
                { num: 25, text: '        <span class="code-keyword">return</span> 1;' },
                { num: 26, text: '' },
                { num: 27, text: '    visited[x][y]=1;' },
                { num: 28, text: '' },
                { num: 29, text: '    <span class="code-keyword">return</span> <span class="code-fn">dfs</span>(x+1,y) ||' },
                { num: 30, text: '           <span class="code-fn">dfs</span>(x-1,y) ||' },
                { num: 31, text: '           <span class="code-fn">dfs</span>(x,y+1) ||' },
                { num: 32, text: '           <span class="code-fn">dfs</span>(x,y-1);' },
                { num: 33, text: '}' },
                { num: 34, text: '' },
                { num: 35, text: '<span class="code-keyword">int</span> <span class="code-fn">main</span>()' },
                { num: 36, text: '{' },
                { num: 37, text: '    <span class="code-keyword">if</span>(<span class="code-fn">dfs</span>(0,0))' },
                { num: 38, text: '        <span class="code-fn">printf</span>(<span class="code-string">"Path Found using DFS\\n"</span>);' },
                { num: 39, text: '    <span class="code-keyword">else</span>' },
                { num: 40, text: '        <span class="code-fn">printf</span>(<span class="code-string">"No Path Found\\n"</span>);' },
                { num: 41, text: '' },
                { num: 42, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 43, text: '}' }
            ];
        } else if (algo === 'Backtracking') {
            lines = [
                { num: 1, text: '<span class="code-keyword">#include</span> <span class="code-string">&lt;stdio.h&gt;</span>' },
                { num: 2, text: '' },
                { num: 3, text: '<span class="code-keyword">#define</span> SIZE 5' },
                { num: 4, text: '' },
                { num: 5, text: '<span class="code-comment">// Maze: 1 = path, 0 = blocked</span>' },
                { num: 6, text: '<span class="code-keyword">int</span> maze[SIZE][SIZE] = {' },
                { num: 7, text: '    {1,1,0,0,0},' },
                { num: 8, text: '    {0,1,1,0,0},' },
                { num: 9, text: '    {0,0,1,1,0},' },
                { num: 10, text: '    {1,0,0,1,1},' },
                { num: 11, text: '    {0,0,0,0,1}' },
                { num: 12, text: '};' },
                { num: 13, text: '' },
                { num: 14, text: '<span class="code-comment">// Stores the solution path</span>' },
                { num: 15, text: '<span class="code-keyword">int</span> solution[SIZE][SIZE];' },
                { num: 16, text: '' },
                { num: 17, text: '<span class="code-keyword">int</span> <span class="code-fn">isSafe</span>(<span class="code-keyword">int</span> row, <span class="code-keyword">int</span> col)' },
                { num: 18, text: '{' },
                { num: 19, text: '    <span class="code-keyword">return</span> (row &gt;= 0 &amp;&amp; col &gt;= 0 &amp;&amp; row &lt; SIZE &amp;&amp; col &lt; SIZE &amp;&amp; maze[row][col] == 1);' },
                { num: 20, text: '}' },
                { num: 21, text: '' },
                { num: 22, text: '<span class="code-keyword">int</span> <span class="code-fn">solveMaze</span>(<span class="code-keyword">int</span> row, <span class="code-keyword">int</span> col)' },
                { num: 23, text: '{' },
                { num: 24, text: '    <span class="code-comment">// Destination reached</span>' },
                { num: 25, text: '    <span class="code-keyword">if</span> (row == SIZE - 1 &amp;&amp; col == SIZE - 1)' },
                { num: 26, text: '    {' },
                { num: 27, text: '        solution[row][col] = 1;' },
                { num: 28, text: '        <span class="code-keyword">return</span> 1;' },
                { num: 29, text: '    }' },
                { num: 30, text: '' },
                { num: 31, text: '    <span class="code-keyword">if</span> (<span class="code-fn">isSafe</span>(row, col))' },
                { num: 32, text: '    {' },
                { num: 33, text: '        solution[row][col] = 1;' },
                { num: 34, text: '' },
                { num: 35, text: '        <span class="code-comment">// Move Down</span>' },
                { num: 36, text: '        <span class="code-keyword">if</span> (<span class="code-fn">solveMaze</span>(row + 1, col))' },
                { num: 37, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 38, text: '' },
                { num: 39, text: '        <span class="code-comment">// Move Right</span>' },
                { num: 40, text: '        <span class="code-keyword">if</span> (<span class="code-fn">solveMaze</span>(row, col + 1))' },
                { num: 41, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 42, text: '' },
                { num: 43, text: '        <span class="code-comment">// Move Up</span>' },
                { num: 44, text: '        <span class="code-keyword">if</span> (<span class="code-fn">solveMaze</span>(row - 1, col))' },
                { num: 45, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 46, text: '' },
                { num: 47, text: '        <span class="code-comment">// Move Left</span>' },
                { num: 48, text: '        <span class="code-keyword">if</span> (<span class="code-fn">solveMaze</span>(row, col - 1))' },
                { num: 49, text: '            <span class="code-keyword">return</span> 1;' },
                { num: 50, text: '' },
                { num: 51, text: '        <span class="code-comment">// Backtrack</span>' },
                { num: 52, text: '        solution[row][col] = 0;' },
                { num: 53, text: '    }' },
                { num: 54, text: '' },
                { num: 55, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 56, text: '}' },
                { num: 57, text: '' },
                { num: 58, text: '<span class="code-keyword">void</span> <span class="code-fn">printSolution</span>()' },
                { num: 59, text: '{' },
                { num: 60, text: '    <span class="code-fn">printf</span>(<span class="code-string">"Solution Path:\\n"</span>);' },
                { num: 61, text: '    <span class="code-keyword">for</span> (<span class="code-keyword">int</span> row = 0; row &lt; SIZE; row++)' },
                { num: 62, text: '    {' },
                { num: 63, text: '        <span class="code-keyword">for</span> (<span class="code-keyword">int</span> col = 0; col &lt; SIZE; col++)' },
                { num: 64, text: '        {' },
                { num: 65, text: '            <span class="code-fn">printf</span>(<span class="code-string">"%d "</span>, solution[row][col]);' },
                { num: 66, text: '        }' },
                { num: 67, text: '        <span class="code-fn">printf</span>(<span class="code-string">"\\n"</span>);' },
                { num: 68, text: '    }' },
                { num: 69, text: '}' },
                { num: 70, text: '' },
                { num: 71, text: '<span class="code-keyword">int</span> <span class="code-fn">main</span>()' },
                { num: 72, text: '{' },
                { num: 73, text: '    <span class="code-keyword">if</span> (<span class="code-fn">solveMaze</span>(0, 0))' },
                { num: 74, text: '        <span class="code-fn">printSolution</span>();' },
                { num: 75, text: '    <span class="code-keyword">else</span>' },
                { num: 76, text: '        <span class="code-fn">printf</span>(<span class="code-string">"No Solution Exists\\n"</span>);' },
                { num: 77, text: '    <span class="code-keyword">return</span> 0;' },
                { num: 78, text: '}' }
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
