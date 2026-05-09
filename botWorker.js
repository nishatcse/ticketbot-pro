// botWorker.js
const runBot = require('./bot');

process.on('message', async (message) => {
    if (message.type === 'START') {
        const config = message.config;
        
        // Create an abort controller for this specific worker
        const abortController = new AbortController();

        // Listen for the kill command from main.js (Restart button)
        process.on('message', (msg) => {
            if (msg.type === 'ABORT') {
                abortController.abort();
                process.exit(0);
            }
        });

        // Custom sendLog function that sends messages back to main.js
        const sendLog = (logMsg) => {
            process.send({ type: 'LOG', port: config.port, message: logMsg });
        };

        try {
            // Run the exact same bot.js logic, but in an isolated background process!
            await runBot(config, sendLog, abortController.signal);
            process.send({ type: 'DONE', port: config.port });
        } catch (error) {
            process.send({ type: 'ERROR', port: config.port, message: error.message });
        }
    }
});