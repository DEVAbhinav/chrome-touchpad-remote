// Background service worker for Chrome Touchpad Remote
// Maintains WebSocket connection and forwards events to content scripts

const SERVER_PORT = 8765;
let ws = null;
let isConnected = false;
let reconnectTimer = null;
let heartbeatInterval = null;

// Connection settings
let serverIP = 'localhost';

// Pairing code helpers (also in popup.js but needed here for background reconnection)
function generatePairingCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// Ensure pairing code exists and send to server
async function ensureAndSendPairingCode() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['pairingCode', 'sessionId'], (result) => {
            let code = result.pairingCode;
            let session = result.sessionId;

            // Generate if missing
            if (!code || !session) {
                code = generatePairingCode();
                session = generateSessionId();
                chrome.storage.local.set({ pairingCode: code, sessionId: session });
                console.log('[Touchpad] Generated new pairing code in background:', code);
            }

            // Send to server with small delay
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    console.log('[Touchpad] Sending pairing code to server:', code);
                    ws.send(JSON.stringify({
                        type: 'setPairingCode',
                        code: code,
                        sessionId: session
                    }));
                }
                resolve();
            }, 100);
        });
    });
}

// Load saved settings
chrome.storage.local.get(['serverIP'], (result) => {
    if (result.serverIP) {
        serverIP = result.serverIP;
    }
    connect();
});

// Setup keepalive alarm - fires every 20 seconds to keep service worker alive
chrome.alarms.create('keepalive', { periodInMinutes: 0.33 }); // ~20 seconds

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepalive') {
        // Check connection and reconnect if needed
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log('[Touchpad] Keepalive: reconnecting...');
            connect();
        } else {
            // Send heartbeat to keep connection alive
            try {
                ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
            } catch (e) {
                console.log('[Touchpad] Heartbeat failed:', e.message);
                connect();
            }
        }
    }
});

function connect() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    // Close existing connection cleanly
    if (ws) {
        try {
            ws.onclose = null; // Prevent reconnect loop
            ws.close();
        } catch (e) {
            console.log('[Touchpad] Error closing old connection:', e.message);
        }
        ws = null;
    }

    try {
        ws = new WebSocket(`ws://${serverIP}:${SERVER_PORT}`);

        ws.onopen = () => {
            console.log('[Touchpad] Connected to relay server');
            isConnected = true;

            // Register as extension client immediately
            ws.send(JSON.stringify({ type: 'register', clientType: 'extension' }));

            // Always ensure pairing code exists and send to server
            ensureAndSendPairingCode();

            // Notify popup of connection status
            chrome.runtime.sendMessage({ type: 'connectionStatus', connected: true })
                .catch((e) => console.log('[Touchpad] Popup not open'));

            // Clear reconnect timer
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }

            // Start heartbeat interval
            if (heartbeatInterval) clearInterval(heartbeatInterval);
            heartbeatInterval = setInterval(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
                }
            }, 15000);
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                // Handle pairing code set confirmation
                if (message.type === 'pairingCodeSet') {
                    console.log('[Touchpad] Pairing code registered with server');
                    return;
                }

                if (message.type === 'touch') {
                    // Forward touch event to content script
                    forwardToContentScript(message);
                }

                // Handle browser control commands
                if (message.type === 'browser') {
                    console.log('[Touchpad] Browser command received:', message.action);
                    handleBrowserCommand(message);
                }
            } catch (e) {
                console.error('[Touchpad] Error parsing message:', e.message);
            }
        };

        ws.onclose = () => {
            console.log('[Touchpad] Disconnected from relay server');
            isConnected = false;
            ws = null;

            // Clear heartbeat
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }

            // Notify popup
            chrome.runtime.sendMessage({ type: 'connectionStatus', connected: false })
                .catch(() => { });

            // Reconnect immediately (not exponential backoff)
            // This fixes reconnection when extension reloads
            if (!reconnectTimer) {
                reconnectTimer = setTimeout(() => {
                    reconnectTimer = null;
                    connect();
                }, 500); // Quick reconnect for better UX
            }
        };

        ws.onerror = (err) => {
            console.error('[Touchpad] WebSocket error:', err);
            isConnected = false;
        };

    } catch (e) {
        console.error('[Touchpad] Failed to connect:', e.message);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, 2000);
    }
}

function forwardToContentScript(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, message)
                .catch((e) => {
                    // Content script might not be loaded yet, inject it
                    console.log('[Touchpad] Injecting content script into tab:', tabs[0].id);
                    chrome.scripting.executeScript({
                        target: { tabId: tabs[0].id },
                        files: ['content.js']
                    }).catch((err) => console.error('[Touchpad] Failed to inject content script:', err.message));
                });
        }
    });
}

// Handle browser control commands
async function handleBrowserCommand(message) {
    const action = message.action;
    console.log('[Touchpad] Browser command:', action);

    try {
        switch (action) {
            case 'navigate':
                if (message.url) {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (activeTab) {
                        await chrome.tabs.update(activeTab.id, { url: message.url });
                    }
                }
                break;

            case 'fullscreen':
                const currentWindow = await chrome.windows.getCurrent();
                const newState = currentWindow.state === 'fullscreen' ? 'normal' : 'fullscreen';
                await chrome.windows.update(currentWindow.id, { state: newState });
                break;

            case 'maximize':
                const win = await chrome.windows.getCurrent();
                const maxState = win.state === 'maximized' ? 'normal' : 'maximized';
                await chrome.windows.update(win.id, { state: maxState });
                break;

            case 'minimize':
                const minWin = await chrome.windows.getCurrent();
                await chrome.windows.update(minWin.id, { state: 'minimized' });
                break;

            case 'newtab':
                await chrome.tabs.create({ active: true });
                break;

            case 'closetab':
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab) {
                    await chrome.tabs.remove(activeTab.id);
                }
                break;

            case 'back':
                const [backTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (backTab) {
                    try {
                        await chrome.tabs.goBack(backTab.id);
                    } catch (e) {
                        console.log('[Touchpad] Cannot go back:', e.message);
                    }
                }
                break;

            case 'forward':
                const [fwdTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (fwdTab) {
                    try {
                        await chrome.tabs.goForward(fwdTab.id);
                    } catch (e) {
                        console.log('[Touchpad] Cannot go forward:', e.message);
                    }
                }
                break;

            case 'refresh':
                const [refTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (refTab) {
                    await chrome.tabs.reload(refTab.id);
                }
                break;

            case 'nexttab':
                const tabs = await chrome.tabs.query({ currentWindow: true });
                const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
                const currentIndex = tabs.findIndex(t => t.id === current.id);
                const nextIndex = (currentIndex + 1) % tabs.length;
                await chrome.tabs.update(tabs[nextIndex].id, { active: true });
                break;

            case 'prevtab':
                const allTabs = await chrome.tabs.query({ currentWindow: true });
                const [currTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                const currIndex = allTabs.findIndex(t => t.id === currTab.id);
                const prevIndex = (currIndex - 1 + allTabs.length) % allTabs.length;
                await chrome.tabs.update(allTabs[prevIndex].id, { active: true });
                break;

            case 'volume':
                const [volTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (volTab) {
                    chrome.tabs.sendMessage(volTab.id, {
                        type: 'setVolume',
                        volume: parseInt(message.url) / 100
                    }).catch((e) => console.log('[Touchpad] Failed to set volume:', e.message));
                }
                break;
        }
    } catch (e) {
        console.error('[Touchpad] Browser command error:', e.message);
    }
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // KeepAlive ping from content script
    if (message.type === 'keepAlive') {
        sendResponse({ status: 'alive' });
        return true;
    }

    if (message.type === 'getStatus') {
        sendResponse({ connected: isConnected, serverIP: serverIP });
    } else if (message.type === 'setServerIP') {
        serverIP = message.ip;
        chrome.storage.local.set({ serverIP: serverIP });

        // Reconnect with new IP
        if (ws) {
            ws.close();
        }
        connect();

        sendResponse({ success: true });
    } else if (message.type === 'sendPairingCode') {
        // Extension popup sends this when it wants to set the pairing code
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'setPairingCode',
                code: message.code,
                sessionId: message.sessionId
            }));
            console.log('[Touchpad] Sent pairing code to server');
        }
        sendResponse({ success: true });
    } else if (message.type === 'reconnect') {
        if (ws) {
            ws.close();
        }
        connect();
        sendResponse({ success: true });
    } else if (message.type === 'inputFocused') {
        // Forward to mobile clients to open keyboard
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'openKeyboard',
                inputType: message.inputType,
                placeholder: message.placeholder,
                currentValue: message.currentValue
            }));
        }
    } else if (message.type === 'inputBlurred') {
        // Forward to mobile clients to close keyboard
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'closeKeyboard' }));
        }
    }

    return true; // Keep channel open for async response
});

// Keep service worker alive
setInterval(() => {
    if (!isConnected) {
        connect();
    }
}, 25000);
