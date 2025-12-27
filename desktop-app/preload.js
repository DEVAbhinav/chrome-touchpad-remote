const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getServerInfo: () => ipcRenderer.invoke('get-server-info'),
    restartServer: () => ipcRenderer.invoke('restart-server'),
    openExtensionSetup: () => ipcRenderer.invoke('open-extension-setup'),
    onServerLog: (callback) => ipcRenderer.on('server-log', (event, data) => callback(data)),
    onServerInfo: (callback) => ipcRenderer.on('server-info', (event, data) => callback(data))
});
