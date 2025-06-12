// Application State
let currentMode = 'demo';
let isAuthenticated = false;
let isRunning = false;
let currentStep = 0;
let demoTimeout;
let waitingForInput = false;
let inputCallback = null;
let availableLabels = [];
let selectedLabel = null;
let dateRange = { start: null, end: null };

// DOM Elements
const terminal = document.getElementById('terminal');
const demoModeBtn = document.getElementById('demoModeBtn');
const liveModeBtn = document.getElementById('liveModeBtn');
const authStatus = document.getElementById('authStatus');
const authBtn = document.getElementById('authBtn');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const skipBtn = document.getElementById('skipBtn');
const currentModeEl = document.getElementById('currentMode');
const statMode = document.getElementById('statMode');
const emailsFound = document.getElementById('emailsFound');
const emailsDeleted = document.getElementById('emailsDeleted');
const timeSaved = document.getElementById('timeSaved');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');

// Event Listeners
demoModeBtn.addEventListener('click', () => setMode('demo'));
liveModeBtn.addEventListener('click', () => setMode('live'));
authBtn.addEventListener('click', authenticate);
startBtn.addEventListener('click', startProcess);
resetBtn.addEventListener('click', resetTerminal);
skipBtn.addEventListener('click', skipDemo);

// UI Functions
function addTerminalLine(type, text, showCursor = false) {
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.style.animationDelay = '0s';
    
    if (type === 'command') {
        line.innerHTML = '<span class="prompt">$</span><span class="command">' + text + '</span>';
    } else {
        line.innerHTML = '<span class="' + type + '">' + text + '</span>';
    }
    
    if (showCursor) {
        line.innerHTML += '<span class="cursor"></span>';
    }
    
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
}

function createInputLine(promptText, inputType = 'text') {
    const inputLine = document.createElement('div');
    inputLine.className = 'terminal-line waiting-input';
    inputLine.innerHTML = '<span class="input-prompt">' + promptText + '</span><input type="' + inputType + '" class="terminal-input" id="currentInput" autocomplete="off">';
    
    terminal.appendChild(inputLine);
    terminal.scrollTop = terminal.scrollHeight;
    
    const input = document.getElementById('currentInput');
    input.focus();
    
    return new Promise((resolve) => {
        inputCallback = resolve;
        waitingForInput = true;
        
        input.addEventListener('keydown', handleInputKeydown);
    });
}

function handleInputKeydown(event) {
    if (event.key === 'Enter') {
        const input = event.target;
        const value = input.value.trim();
        
        // Remove the input line and replace with command line
        const inputLine = input.closest('.terminal-line');
        const promptText = inputLine.querySelector('.input-prompt').textContent;
        inputLine.remove();
        
        // Add the entered command as a normal command line
        addTerminalLine('command', promptText + ' ' + value);
        
        // Reset input state
        waitingForInput = false;
        
        // Call the callback with the entered value
        if (inputCallback) {
            inputCallback(value);
            inputCallback = null;
        }
    }
}

function updateStats(stats) {
    if (stats.found !== undefined) {
        emailsFound.textContent = stats.found.toLocaleString();
    }
    if (stats.deleted !== undefined) {
        emailsDeleted.textContent = stats.deleted.toLocaleString();
    }
    if (stats.progress !== undefined) {
        progressBar.style.width = stats.progress + '%';
        progressText.textContent = Math.round(stats.progress) + '%';
    }
    if (stats.timeSaved !== undefined) {
        timeSaved.textContent = stats.timeSaved + ' min';
    }
}

function updateAuthStatus(status, message) {
    authStatus.className = 'auth-status auth-' + status;
    authStatus.textContent = message;
    authStatus.style.display = 'block';
}

// Mode Management
function setMode(mode) {
    currentMode = mode;
    currentModeEl.textContent = mode === 'demo' ? 'Demo Mode' : 'Live API Mode';
    statMode.textContent = mode === 'demo' ? 'Demo' : 'Live';
    
    // Update button states
    demoModeBtn.classList.toggle('active', mode === 'demo');
    liveModeBtn.classList.toggle('active', mode === 'live');
    
    // Show/hide authentication elements
    const showAuth = mode === 'live';
    authStatus.style.display = showAuth ? 'block' : 'none';
    authBtn.style.display = showAuth && !isAuthenticated ? 'block' : 'none';
    
    if (mode === 'live' && !isAuthenticated) {
        updateAuthStatus('pending', 'Authentication Required');
        checkAuthStatus();
    }
    
    addTerminalLine('info', 'Switched to ' + (mode === 'demo' ? 'Demo' : 'Live API') + ' mode');
}

// Authentication
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        isAuthenticated = data.authenticated;
        if (isAuthenticated) {
            updateAuthStatus('success', 'Authenticated Successfully');
            authBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

async function authenticate() {
    if (currentMode !== 'live') return;
    
    updateAuthStatus('pending', 'Authenticating...');
    addTerminalLine('warning', 'Opening authentication window...');
    
    try {
        const response = await fetch('/api/auth/start');
        const data = await response.json();
        
        // Open OAuth window
        const authWindow = window.open(data.auth_url, 'gmail-auth', 'width=500,height=600');
        
        // Check for auth completion
        const checkInterval = setInterval(() => {
            if (authWindow.closed) {
                clearInterval(checkInterval);
                checkAuthStatus();
            }
        }, 1000);
    } catch (error) {
        updateAuthStatus('error', 'Authentication Failed');
        addTerminalLine('error', 'Failed to start authentication: ' + error.message);
    }
}

// Demo Runner
async function runDemo() {
    try {
        const response = await fetch('/api/demo/run', { method: 'POST' });
        const data = await response.json();
        const steps = data.steps;
        
        for (let i = 0; i < steps.length && isRunning; i++) {
            const step = steps[i];
            
            await new Promise(resolve => {
                demoTimeout = setTimeout(() => {
                    addTerminalLine(step.type, step.text, step.showCursor);
                    
                    if (step.updateStats) {
                        updateStats(step.updateStats);
                    }
                    
                    resolve();
                }, step.delay);
            });
        }
    } catch (error) {
        addTerminalLine('error', 'Demo error: ' + error.message);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
    }
}

// Live API Functions
async function getLiveLabels() {
    addTerminalLine('output', 'Fetching Gmail labels via API...');
    
    try {
        const response = await fetch('/api/labels');
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        availableLabels = data.labels;
        
        addTerminalLine('success', 'Labels retrieved successfully:');
        addTerminalLine('output', '-'.repeat(40));
        
        availableLabels.forEach((label) => {
            addTerminalLine('output', ' ' + label.index + '. ' + label.name + ' (' + label.type + ')');
        });
        
        addTerminalLine('output', '');
        
        return availableLabels;
    } catch (error) {
        addTerminalLine('error', 'Failed to fetch labels: ' + error.message);
        throw error;
    }
}

async function getUserLabelSelection() {
    const selection = await createInputLine('Enter label number (1-' + availableLabels.length + '): ');
    const labelIndex = parseInt(selection) - 1;
    
    if (labelIndex >= 0 && labelIndex < availableLabels.length) {
        selectedLabel = availableLabels[labelIndex];
        addTerminalLine('success', 'Selected: ' + selectedLabel.name);
        return selectedLabel;
    } else {
        addTerminalLine('error', 'Invalid selection. Please try again.');
        return await getUserLabelSelection();
    }
}

async function getUserDateRange() {
    addTerminalLine('output', 'Enter date range for emails to delete:');
    addTerminalLine('info', 'Date formats: YYYY-MM-DD, MM/DD/YYYY, or leave empty for no limit');
    addTerminalLine('output', '');
    
    const startDate = await createInputLine('Start date (or press Enter for no limit): ');
    const endDate = await createInputLine('End date (or press Enter for no limit): ');
    
    dateRange = { start: startDate || null, end: endDate || null };
    
    addTerminalLine('success', 'Date range set: ' + (startDate || 'no start limit') + ' to ' + (endDate || 'no end limit'));
    return dateRange;
}

async function getUserConfirmation(count) {
    addTerminalLine('warning', 'Found ' + count + ' emails matching your criteria.');
    addTerminalLine('output', '');
    
    const confirmation = await createInputLine('Delete ' + count + ' emails? (yes/no): ');
    
    if (confirmation.toLowerCase() === 'yes' || confirmation.toLowerCase() === 'y') {
        return true;
    } else {
        addTerminalLine('info', 'Operation cancelled by user.');
        return false;
    }
}

async function performLiveSearch(label, dateRange) {
    const query = buildQuery(label, dateRange);
    addTerminalLine('warning', 'Searching Gmail with query: ' + query);
    
    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                label_id: label.id,
                start_date: dateRange.start,
                end_date: dateRange.end
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        updateStats({ found: data.count });
        return data;
    } catch (error) {
        addTerminalLine('error', 'Search failed: ' + error.message);
        throw error;
    }
}

async function performLiveDeletion(messageIds) {
    addTerminalLine('success', 'Starting live deletion process...');
    
    try {
        const response = await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message_ids: messageIds })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Simulate batch updates
        const batchSize = 100;
        const totalBatches = Math.ceil(messageIds.length / batchSize);
        
        for (let i = 0; i < totalBatches; i++) {
            const deleted = Math.min((i + 1) * batchSize, messageIds.length);
            const progress = (deleted / messageIds.length) * 100;
            
            addTerminalLine('success', 'Batch ' + (i + 1) + ': Deleted ' + deleted + '/' + messageIds.length + ' emails (' + progress.toFixed(1) + '%)');
            updateStats({ deleted: deleted, progress: progress });
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const timeSavedValue = Math.round(messageIds.length / 50 * 2);
        updateStats({ timeSaved: timeSavedValue });
        
        addTerminalLine('success', '✓ Live deletion completed successfully!');
        addTerminalLine('info', 'Time saved vs manual deletion: ~' + timeSavedValue + ' minutes');
    } catch (error) {
        addTerminalLine('error', 'Deletion failed: ' + error.message);
        throw error;
    }
}

function buildQuery(label, dateRange) {
    let query = '';
    
    if (label.name === 'INBOX') {
        query = 'in:inbox';
    } else if (label.name === 'SENT') {
        query = 'in:sent';
    } else if (label.name === 'DRAFT') {
        query = 'in:drafts';
    } else if (label.name === 'SPAM') {
        query = 'in:spam';
    } else if (label.name === 'TRASH') {
        query = 'in:trash';
    } else {
        query = 'label:"' + label.name + '"';
    }
    
    if (dateRange.start) {
        query += ' after:' + dateRange.start.replace(/-/g, '/');
    }
    if (dateRange.end) {
        query += ' before:' + dateRange.end.replace(/-/g, '/');
    }
    
    return query;
}

// Main Process Controller
async function startProcess() {
    if (isRunning) return;
    
    if (currentMode === 'live' && !isAuthenticated) {
        addTerminalLine('error', 'Please authenticate with Gmail first');
        return;
    }
    
    isRunning = true;
    startBtn.disabled = true;
    
    try {
        if (currentMode === 'demo') {
            addTerminalLine('info', 'Starting demo mode...');
            await runDemo();
        } else {
            addTerminalLine('info', 'Starting interactive Gmail API mode...');
            addTerminalLine('output', '');
            
            // Interactive Live API workflow
            const labels = await getLiveLabels();
            const selectedLabel = await getUserLabelSelection();
            const dateRange = await getUserDateRange();
            
            addTerminalLine('output', '');
            const searchResult = await performLiveSearch(selectedLabel, dateRange);
            
            if (searchResult.count > 0) {
                addTerminalLine('output', '');
                const confirmed = await getUserConfirmation(searchResult.count);
                
                if (confirmed) {
                    addTerminalLine('output', '');
                    await performLiveDeletion(searchResult.message_ids);
                }
            } else {
                addTerminalLine('info', 'No emails found matching the criteria.');
            }
        }
    } catch (error) {
        addTerminalLine('error', 'Error: ' + error.message);
    } finally {
        isRunning = false;
        startBtn.disabled = false;
    }
}

// Control Functions
function resetTerminal() {
    isRunning = false;
    clearTimeout(demoTimeout);
    currentStep = 0;
    
    terminal.innerHTML = '<div class="terminal-line"><span class="success">Gmail Bulk Delete Tool - Integrated Terminal &amp; API</span></div><div class="terminal-line"><span class="output">==========================================================</span></div><div class="terminal-line"><span class="info">Select mode: Demo (simulation) or Live (real Gmail API)</span></div><div class="terminal-line"><span class="info">Live mode requires Google OAuth authentication</span></div><div class="terminal-line"><span class="cursor"></span></div>';
    
    updateStats({ found: 0, deleted: 0, progress: 0, timeSaved: 0 });
    startBtn.disabled = false;
}

function skipDemo() {
    if (currentMode !== 'demo' || !isRunning) return;
    
    isRunning = false;
    clearTimeout(demoTimeout);
    
    // Fast forward through remaining demo steps
    addTerminalLine('info', 'Skipping to end of demo...');
    
    // Show final stats
    updateStats({ found: 2847, deleted: 2847, progress: 100, timeSaved: 95 });
    
    addTerminalLine('success', '✓ OPERATION COMPLETED SUCCESSFULLY!');
    addTerminalLine('info', '• Total emails deleted: 2,847');
    addTerminalLine('info', '• Time saved vs manual: ~95 minutes');
    addTerminalLine('success', '• Efficiency improvement: 49% faster!');
    
    startBtn.disabled = false;
}

// Initialize
window.addEventListener('load', () => {
    setMode('demo');
    
    // Auto-start demo after a brief delay
    setTimeout(() => {
        if (currentMode === 'demo') {
            startProcess();
        }
    }, 2000);
});