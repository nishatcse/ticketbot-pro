const runApiSniper = require('./apiBot');

let abortController = null;
let otpResolver = null; // This holds the Promise resolver for OTP

process.on('message', async (message) => {
    
    // 1. START COMMAND
    if (message.type === 'START') {
        const config = message.config;
        abortController = new AbortController();

        const sendLog = (logMsg) => {
            process.send({ type: 'LOG', port: config.port, message: logMsg });
        };

        // The magical function that requests OTP from UI and waits
        const requestOtp = () => {
            return new Promise(resolve => {
                process.send({ type: 'NEED_OTP', port: config.port });
                otpResolver = resolve; // Save the resolver for later!
            });
        };

        try {
            await runApiSniper(config, sendLog, requestOtp, abortController.signal);
            process.send({ type: 'DONE', port: config.port });
        } catch (error) {
            process.send({ type: 'ERROR', port: config.port, message: error.message });
        }
    }

    // 2. RECEIVE OTP COMMAND
    if (message.type === 'SUBMIT_OTP') {
        if (otpResolver) {
            otpResolver(message.otpCode); // This resumes the paused bot!
            otpResolver = null; // Clear it
        }
    }

    // 3. KILL COMMAND
    if (message.type === 'ABORT') {
        if (abortController) abortController.abort();
        process.exit(0);
    }
});