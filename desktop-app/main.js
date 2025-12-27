const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

let mainWindow;
let tray;
let serverProcess;
let serverPort = 8765;

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

// Start the WebSocket server
function startServer() {
    const serverPath = path.join(__dirname, 'server', 'index.js');

    serverProcess = spawn('node', [serverPath], {
        cwd: path.join(__dirname, 'server'),
        stdio: ['ignore', 'pipe', 'pipe']
    });

    serverProcess.stdout.on('data', (data) => {
        console.log(`[Server] ${data}`);
        if (mainWindow) {
            mainWindow.webContents.send('server-log', data.toString());
        }
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[Server Error] ${data}`);
    });

    serverProcess.on('close', (code) => {
        console.log(`[Server] Process exited with code ${code}`);
    });

    return serverProcess;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'Chrome Touchpad Remote',
        resizable: true,
        minimizable: true,
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('renderer/index.html');

    // Send server info to renderer
    const localIP = getLocalIP();
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('server-info', {
            ip: localIP,
            port: serverPort,
            url: `http://${localIP}:${serverPort}`
        });
    });

    // Hide to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show App',
            click: () => {
                mainWindow.show();
            }
        },
        {
            label: 'Server Status: Running',
            enabled: false
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Chrome Touchpad Remote');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

// App lifecycle
app.whenReady().then(() => {
    createWindow();
    createTray();
    startServer();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    // Don't quit on macOS when windows are closed
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    // Kill server process
    if (serverProcess) {
        serverProcess.kill();
    }
});

// IPC handlers
ipcMain.handle('get-server-info', () => {
    const localIP = getLocalIP();
    return {
        ip: localIP,
        port: serverPort,
        url: `http://${localIP}:${serverPort}`
    };
});

ipcMain.handle('restart-server', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    setTimeout(() => {
        startServer();
    }, 1000);
    return { success: true };
});

ipcMain.handle('open-extension-setup', async () => {
    const extensionPath = path.join(__dirname, 'extension');

    // Open the extension folder
    await shell.openPath(extensionPath);

    // Wait a bit then open chrome://extensions
    setTimeout(() => {
        shell.openExternal('chrome://extensions/');
    }, 1000);

    return { success: true, path: extensionPath };
});
