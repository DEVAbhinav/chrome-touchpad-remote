const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = 8765;

// Store pairing codes per session (extension sets it, mobile validates against it)
const sessionCodes = new Map(); // clientId -> pairingCode

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Create HTTP server with static file serving
const server = http.createServer((req, res) => {
  // Handle status endpoint
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      clients: clients.size,
      ip: localIP,
      port: PORT
    }));
    return;
  }

  // Serve static files from public directory
  let filePath = req.url === '/' ? '/index.html' : req.url;

  // Security: prevent directory traversal
  filePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(__dirname, 'public', filePath);

  // Check if file exists
  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(fullPath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading file');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
});

// Create WebSocket server with optimizations
const wss = new WebSocketServer({
  server,
  clientTracking: true,
  perMessageDeflate: false // Disable compression for lower latency
});

// Track connected clients by type
// Map of ws -> { type: 'mobile' | 'extension', alive: true, authenticated: boolean, sessionId: string }
const clients = new Map();

// Heartbeat to keep connections alive
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const info = clients.get(ws);
    if (info && info.alive === false) {
      console.log(`[Server] Terminating unresponsive client: ${info.type}`);
      // Clean up session code if extension disconnects
      if (info.sessionId) {
        sessionCodes.delete(info.sessionId);
      }
      clients.delete(ws);
      return ws.terminate();
    }

    if (info) {
      info.alive = false;
      clients.set(ws, info);
    }

    if (ws.readyState === 1) {
      ws.ping();
    }
  });
}, 15000);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

wss.on('connection', (ws, req) => {
  console.log('[Server] New connection from:', req.socket.remoteAddress);

  // Disable Nagle's algorithm for lower latency (turbo mode optimization)
  if (req.socket.setNoDelay) {
    req.socket.setNoDelay(true);
  }

  // Initial client info - NOT authenticated
  clients.set(ws, { type: 'unknown', alive: true, authenticated: false, sessionId: null });

  // Handle pong response (keep-alive)
  ws.on('pong', () => {
    const info = clients.get(ws);
    if (info) {
      info.alive = true;
      clients.set(ws, info);
    }
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const info = clients.get(ws);

      // Mark as alive on any message
      if (info) {
        info.alive = true;
      }

      // Handle extension setting pairing code (no auth required)
      if (message.type === 'setPairingCode') {
        const sessionId = message.sessionId;
        const pairingCode = message.code;

        sessionCodes.set(sessionId, pairingCode);
        info.sessionId = sessionId;
        info.authenticated = true;
        clients.set(ws, info);

        console.log(`[Server] Extension set pairing code for session: ${sessionId}`);
        ws.send(JSON.stringify({ type: 'pairingCodeSet', success: true }));
        return;
      }

      // Handle client registration (no auth required for extensions)
      if (message.type === 'register') {
        info.type = message.clientType;
        clients.set(ws, info);
        console.log(`[Server] Client registered as: ${message.clientType}`);
        ws.send(JSON.stringify({ type: 'registered', success: true }));
        return;
      }

      // Handle mobile authentication
      if (message.type === 'auth') {
        // Check if code matches any active session
        let validSession = null;
        for (const [sessionId, code] of sessionCodes.entries()) {
          if (code === message.code) {
            validSession = sessionId;
            break;
          }
        }

        if (validSession) {
          info.authenticated = true;
          info.sessionId = validSession;
          clients.set(ws, info);
          ws.send(JSON.stringify({ type: 'authResult', success: true }));
          console.log(`[Server] Mobile authenticated with session: ${validSession}`);
        } else {
          ws.send(JSON.stringify({ type: 'authResult', success: false, error: 'Invalid pairing code' }));
          console.log('[Server] Mobile authentication failed - invalid code');
        }
        return;
      }

      // Reject unauthenticated clients for other message types (except ping)
      if (!info.authenticated && message.type !== 'ping') {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated. Please enter pairing code.' }));
        return;
      }

      // Handle touch events from mobile - broadcast to extensions in same session
      if (message.type === 'touch') {
        const touchData = JSON.stringify(message);
        clients.forEach((clientInfo, client) => {
          if (clientInfo.type === 'extension' &&
            clientInfo.authenticated &&
            clientInfo.sessionId === info.sessionId &&
            client.readyState === 1) {
            client.send(touchData);
          }
        });
      }

      // Handle browser commands from mobile - broadcast to extensions in same session
      if (message.type === 'browser') {
        const browserData = JSON.stringify(message);
        clients.forEach((clientInfo, client) => {
          if (clientInfo.type === 'extension' &&
            clientInfo.authenticated &&
            clientInfo.sessionId === info.sessionId &&
            client.readyState === 1) {
            client.send(browserData);
          }
        });
      }

      // Handle openKeyboard/closeKeyboard from extension - broadcast to mobile in same session
      if (message.type === 'openKeyboard' || message.type === 'closeKeyboard') {
        const keyboardData = JSON.stringify(message);
        clients.forEach((clientInfo, client) => {
          if (clientInfo.type === 'mobile' &&
            clientInfo.authenticated &&
            clientInfo.sessionId === info.sessionId &&
            client.readyState === 1) {
            client.send(keyboardData);
          }
        });
      }

      // Handle ping for latency testing
      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: message.timestamp }));
      }

    } catch (e) {
      console.error('[Server] Error parsing message:', e.message);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    console.log(`[Server] Client disconnected: ${info?.type || 'unknown'}`);

    // Clean up session code if extension disconnects
    if (info?.sessionId && info.type === 'extension') {
      sessionCodes.delete(info.sessionId);
      console.log(`[Server] Removed session: ${info.sessionId}`);
    }

    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[Server] WebSocket error:', err.message);
    clients.delete(ws);
  });
});

const localIP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Chrome Touchpad Relay Server Running             ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}                          ║`);
  console.log(`║  Network:  http://${localIP}:${PORT}                       ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  📱 Open the extension popup to see your pairing code      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
});
