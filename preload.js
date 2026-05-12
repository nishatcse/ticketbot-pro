const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // --- OLD DOM BOT LOGIC (Untouched) ---
    startAllBots: (configs) => ipcRenderer.send('start-all-bots', configs),
    restartSystem: () => ipcRenderer.send('restart-system'), 
    onBotLog: (callback) => ipcRenderer.on('bot-log', (event, message) => callback(message)),
    onBotFinish: (callback) => ipcRenderer.on('bot-finish', (event, message) => callback(message)),

    // --- NEW API SNIPER LOGIC ---
    startApiNode: (config) => ipcRenderer.send('start-api-node', config),
    stopApiNode: (port) => ipcRenderer.send('stop-api-node', port),
    submitOtp: (port, otpCode) => ipcRenderer.send('submit-otp', port, otpCode),
    
    // UI Receivers for API Bot
    onApiLog: (callback) => ipcRenderer.on('api-log', (event, data) => callback(data)),
    onNeedOtp: (callback) => ipcRenderer.on('need-otp', (event, port) => callback(port)),

    // --- SECURITY LOGIC ---
    verifyLicense: (key) => ipcRenderer.send('verify-license', key),
    onVerificationResult: (callback) => ipcRenderer.on('verification-result', (event, data) => callback(data))
});