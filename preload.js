const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startAllBots: (configs) => ipcRenderer.send('start-all-bots', configs),
    restartSystem: () => ipcRenderer.send('restart-system'), // NEW LINE
    onBotLog: (callback) => ipcRenderer.on('bot-log', (event, message) => callback(message)),
    onBotFinish: (callback) => ipcRenderer.on('bot-finish', (event, message) => callback(message)),

    // NEW Security Logic
    verifyLicense: (key) => ipcRenderer.send('verify-license', key),
    onVerificationResult: (callback) => ipcRenderer.on('verification-result', (event, data) => callback(data))
});