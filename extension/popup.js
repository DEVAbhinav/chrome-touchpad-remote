// Popup script for Chrome Touchpad Remote

const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const currentIP = document.getElementById('current-ip');
const serverIPInput = document.getElementById('server-ip');
const connectBtn = document.getElementById('connect-btn');
const mobileUrl = document.getElementById('mobile-url');
const qrCodeContainer = document.getElementById('qr-code');
const pairingCodeInput = document.getElementById('pairing-code-input');
const saveCodeBtn = document.getElementById('save-code-btn');
const randomCodeBtn = document.getElementById('random-code-btn');

let qrCode = null;
let networkIP = null;
let pairingCode = null;
let sessionId = null;

// Generate pairing code
function generatePairingCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate session ID
function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substring(7);
}

// Save pairing code
function savePairingCode(code) {
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
        alert('Please enter a valid 6-digit code');
        return false;
    }

    pairingCode = code;
    if (!sessionId) {
        sessionId = generateSessionId();
    }

    // Store in chrome.storage
    chrome.storage.local.set({
        pairingCode: pairingCode,
        sessionId: sessionId
    });

    // Send to server immediately
    sendPairingCodeToServer();

    // Visual feedback
    saveCodeBtn.textContent = '✓ Saved!';
    saveCodeBtn.style.background = '#10b981';
    setTimeout(() => {
        saveCodeBtn.textContent = 'Save Code';
        saveCodeBtn.style.background = '';
    }, 2000);

    console.log('[Popup] Saved pairing code:', pairingCode);
    return true;
}

// Handle Save button click
saveCodeBtn.addEventListener('click', () => {
    savePairingCode(pairingCodeInput.value.trim());
});

// Handle Random button click
randomCodeBtn.addEventListener('click', () => {
    const newCode = generatePairingCode();
    pairingCodeInput.value = newCode;
    savePairingCode(newCode);
});

// Handle Enter key in input
pairingCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        savePairingCode(pairingCodeInput.value.trim());
    }
});

// Only allow digits
pairingCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});

// Try to fetch actual network IP from server status
async function fetchNetworkIP() {
    try {
        const response = await fetch('http://localhost:8765/status');
        const data = await response.json();
        if (data.ip && data.ip !== 'localhost') {
            networkIP = data.ip;
            return networkIP;
        }
    } catch (e) {
        console.log('[Popup] Could not fetch server status:', e.message);
    }
    return null;
}

// Initialize popup
async function initPopup() {
    // Try to restore existing pairing code from storage, or generate new one
    chrome.storage.local.get(['pairingCode', 'sessionId'], (result) => {
        if (result.pairingCode && result.sessionId) {
            // Reuse existing code
            pairingCode = result.pairingCode;
            sessionId = result.sessionId;
            console.log('[Popup] Reusing existing pairing code:', pairingCode);
        } else {
            // Generate new code only if none exists
            pairingCode = generatePairingCode();
            sessionId = generateSessionId();
            // Store for future use
            chrome.storage.local.set({
                pairingCode: pairingCode,
                sessionId: sessionId
            });
            console.log('[Popup] Generated new pairing code:', pairingCode);
        }

        pairingCodeInput.value = pairingCode;
    });

    // Try to get network IP first
    await fetchNetworkIP();

    // Get status from background script
    chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
        if (response) {
            updateStatus(response.connected);
            serverIPInput.value = response.serverIP || 'localhost';
            currentIP.textContent = response.serverIP || 'localhost';

            // Use network IP for QR code if available, otherwise use saved IP
            const qrIP = networkIP || response.serverIP || 'localhost';
            updateMobileUrl(qrIP);

            // If already connected, send pairing code to server
            if (response.connected) {
                sendPairingCodeToServer();
            }
        }
    });
}

function sendPairingCodeToServer() {
    chrome.runtime.sendMessage({
        type: 'sendPairingCode',
        code: pairingCode,
        sessionId: sessionId
    }, (response) => {
        console.log('[Popup] Pairing code sent to server');
    });
}

initPopup();

// Listen for status updates
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'connectionStatus') {
        updateStatus(message.connected);

        // Send pairing code when connection is established
        if (message.connected) {
            sendPairingCodeToServer();
        }
    }
});

function updateStatus(connected) {
    if (connected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
    } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
    }
}

function updateMobileUrl(ip) {
    const url = `http://${ip}:8765`;
    mobileUrl.textContent = url;
    generateQRCode(url);
}

function generateQRCode(url) {
    qrCodeContainer.innerHTML = '';

    if (typeof qrcode !== 'undefined') {
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();

        const size = 150;
        const cellSize = size / qr.getModuleCount();

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = '#1a1a2e';
        for (let row = 0; row < qr.getModuleCount(); row++) {
            for (let col = 0; col < qr.getModuleCount(); col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(
                        col * cellSize,
                        row * cellSize,
                        cellSize + 0.5,
                        cellSize + 0.5
                    );
                }
            }
        }

        qrCodeContainer.appendChild(canvas);
    }
}

// Handle IP input change
serverIPInput.addEventListener('input', () => {
    updateMobileUrl(serverIPInput.value || 'localhost');
});

// Handle connect button
connectBtn.addEventListener('click', () => {
    const ip = serverIPInput.value.trim() || 'localhost';

    // Set server IP and reconnect
    chrome.runtime.sendMessage({
        type: 'setServerIP',
        ip: ip
    }, (response) => {
        currentIP.textContent = ip;
        updateMobileUrl(ip);
    });
});

// Handle Enter key on input
serverIPInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        connectBtn.click();
    }
});
