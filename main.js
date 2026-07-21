const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
// const runBot = require('./bot'); 
const { fork } = require('child_process'); // NEW: For Multi-Processing
const { machineIdSync } = require('node-machine-id'); // NEW: For Hardware ID
const axios = require('axios'); // NEW: For API requests

// GLOBAL STATE MANAGERS
let globalSnipedTrains = {}; 
let abortControllers = []; 
let mainWindow; // NEW: Track the main window globally

// NEW: This tells Electron to hide the license key in the user's hidden AppData folder
const licenseFilePath = path.join(app.getPath('userData'), 'license.json');
// const API_URL = 'http://localhost:3000/api/verify'; // Change to live URL later
const API_URL = 'https://ticketbot-api.vercel.app/api/verify'; // Change to live URL later

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // --- NEW: AUTO-LOGIN LOGIC ---
    if (fs.existsSync(licenseFilePath)) {
        try {
            // 1. Read the saved key from the hidden file
            const savedData = JSON.parse(fs.readFileSync(licenseFilePath));
            const hwid = machineIdSync();
            
            // 2. Silently ask your API if this key is still valid (in case you banned them)
            const response = await axios.post(API_URL, {
                licenseKey: savedData.key,
                machineId: hwid
            });

            // 3. If valid, skip the login screen entirely!
            if (response.data.success) {
                mainWindow.loadFile('index.html');
                return; // Stop here, don't load login.html
            }
        } catch (error) {
            console.log("Background check failed. Forcing manual login.");
            // If the server is offline or the key is bad, it falls through to load login.html
        }
    }
    
    // SECURITY UPDATE: Load the login screen first, NOT index.html
    mainWindow.loadFile('login.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- NEW SECURITY LOGIC: LICENSE VERIFICATION ---
ipcMain.on('verify-license', async (event, key) => {
    try {
        const hwid = machineIdSync(); 
        
        // NOTE: Change this URL to your live server once you deploy it!
        // const API_URL = 'http://localhost:3000/api/verify'; 

        const response = await axios.post(API_URL, {
            licenseKey: key,
            machineId: hwid
        });

        if (response.data.success) {
            fs.writeFileSync(licenseFilePath, JSON.stringify({ key: key }));

            event.reply('verification-result', { success: true });
            // Wait 1 second so the user sees the "Success" message, then load the bot
            setTimeout(() => {
                mainWindow.loadFile('index.html');
            }, 1000);
        } else {
            event.reply('verification-result', { success: false, error: response.data.message });
        }
    } catch (error) {
        event.reply('verification-result', { success: false, error: "Network error. Cannot reach verification server." });
    }
});

// GLOBAL STATE MANAGER FOR WORKERS
let activeWorkers = []; 

// --- UPGRADED RESTART LOGIC ---
ipcMain.on('restart-system', () => {
    globalSnipedTrains = {}; 
    
    // Kill all background processes instantly
    activeWorkers.forEach(worker => {
        worker.send({ type: 'ABORT' });
        worker.kill(); 
    });
    activeWorkers = [];
});

// --- UPGRADED MULTI-PROCESS BOT FLEET LOGIC ---
ipcMain.on('start-all-bots', (event, configs) => {
    activeWorkers = [];
    let finishedCount = 0;

    if (configs.length === 0) return;

    // FIX: Added 'index' right here 👇
    configs.forEach((config, index) => {
        // FORK: Creates a completely new, invisible Node.js process for EACH Chrome browser
        const worker = fork(path.join(__dirname, 'botWorker.js'));
        activeWorkers.push(worker);

        // Listen for messages coming back from this specific worker
        worker.on('message', (msg) => {
            if (msg.type === 'LOG') {
                event.reply('bot-log', `[Port ${msg.port}] ${msg.message}`);
            } else if (msg.type === 'DONE' || msg.type === 'ERROR') {
                if (msg.type === 'ERROR') {
                    event.reply('bot-log', `[Port ${msg.port}] <span style='color:red;'>Failed: ${msg.message}</span>`);
                }
                
                finishedCount++;
                // If all workers have finished their jobs, notify the UI
                if (finishedCount === configs.length) {
                    event.reply('bot-finish', "Fleet sequence concluded.");
                }
            }
        });

        // Bot 1 starts at 0ms, Bot 2 at 300ms, Bot 3 at 600ms, etc.
        // Now 'index' will correctly be 0, 1, 2, 3...
        setTimeout(() => {
            worker.send({ type: 'START', config: config });
        }, index * 300);
    });
});



// ==========================================
// 🚀 NEW: THE API TERMINATOR FLEET LOGIC
// ==========================================

// Map to store API workers by their Port number (Allows targeted OTP and Stop commands)
const apiWorkers = new Map();

ipcMain.on('start-api-node', (event, config) => {
    const port = parseInt(config.port);

    // If there's already a worker running on this port, kill it first
    if (apiWorkers.has(port)) {
        const oldWorker = apiWorkers.get(port);
        oldWorker.send({ type: 'ABORT' });
        oldWorker.kill();
        apiWorkers.delete(port);
    }

    // Fork the new background worker
    const worker = fork(path.join(__dirname, 'apiWorker.js'));
    apiWorkers.set(port, worker);

    // Listen for messages from THIS specific worker
    worker.on('message', (msg) => {
        if (msg.type === 'LOG') {
            event.reply('api-log', { port: msg.port, message: msg.message });
        } 
        else if (msg.type === 'NEED_OTP') {
            // Signal the UI to show the OTP Box for this specific port
            event.reply('need-otp', { port: msg.port, phone: msg.phone });
        } 
        else if (msg.type === 'DONE' || msg.type === 'ERROR') {
            if (msg.type === 'ERROR') {
                event.reply('api-log', { port: msg.port, message: `<span style='color:#cf6679;'>❌ Failed: ${msg.message}</span>` });
            }
            // Remove from active map when done
            apiWorkers.delete(msg.port);
        }
    });

    // Start the bot
    worker.send({ type: 'START', config: config });
});

// আপনার main.js এর একদম ওপরে (অন্যান্য require এর সাথে) puppeteer ইম্পোর্ট করে নিন:
// const puppeteer = require('puppeteer'); (যদি অলরেডি না থাকে তবে অ্যাড করুন)

// Target and kill a specific bot (UPDATED FOR BROWSER KILL SWITCH)
ipcMain.on('stop-api-node', async (event, port) => {
    const portNum = parseInt(port);
    
    if (apiWorkers.has(portNum)) {
        // 1. Send Abort signal to Node.js Worker
        const worker = apiWorkers.get(portNum);
        worker.send({ type: 'ABORT' });
        
        // 2. 🥷 THE NINJA KILL SHOT: Connect to Chrome and kill the loop!
        try {
            const puppeteer = require('puppeteer'); // Require it here just for the kill shot
            const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${portNum}` });
            const pages = await browser.pages();
            let activeTab = pages.find(page => page.url().includes('shohoz.com') || page.url().includes('railway.gov.bd'));
            
            if (activeTab) {
                await activeTab.evaluate(() => {
                    // Changing this ID instantly breaks the while(true) loops inside apiBot.js
                    window.__SNIPER_RUN_ID = "KILLED_BY_USER_" + Date.now(); 
                });
                console.log(`[Main] Browser loop on Port ${portNum} terminated successfully.`);
            }
            browser.disconnect();
        } catch (err) {
            console.log(`[Main] Could not connect to browser on Port ${portNum} for termination: ${err.message}`);
        }

        // 3. Finally, kill the Node process and clean up
        worker.kill();
        apiWorkers.delete(portNum);
        event.reply('api-log', { port: portNum, message: `<span style='color:#cf6679;'>🛑 Process aborted manually.</span>` });
    }
});

// Route the OTP to the correct background worker
ipcMain.on('submit-otp', (event, port, otpCode) => {
    const portNum = parseInt(port);
    if (apiWorkers.has(portNum)) {
        const worker = apiWorkers.get(portNum);
        worker.send({ type: 'SUBMIT_OTP', otpCode: otpCode });
    }
});