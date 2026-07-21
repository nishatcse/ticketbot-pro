const runApiBot = require('./apiBot');
// const runApiBot = require('./newApiBot'); // 🚀 UPDATED: Importing the new API bot implementation

let otpResolver = null;

process.on('message', async (message) => {
    if (message.type === 'START') {
        const config = message.config;
        const abortController = new AbortController();

        // UI থেকে OTP বা STOP কমান্ড রিসিভ করা
        process.on('message', (msg) => {
            if (msg.type === 'ABORT') {
                abortController.abort();
                process.exit(0);
            }
            if (msg.type === 'SUBMIT_OTP') {
                // UI থেকে OTP আসলে প্রমিজটা সলভ করে বটের কাছে পাঠিয়ে দেবে
                if (otpResolver) otpResolver(msg.otpCode);
            }
        });

        const sendLog = (logMsg) => {
            process.send({ type: 'LOG', port: config.port, message: logMsg });
        };

        // এই ফাংশনটা bot.js কল করবে যখন তার OTP লাগবে
        const requestOtp = (phone) => {
            // UI কে সিগন্যাল দাও যে OTP বক্স দেখাও
            process.send({ type: 'NEED_OTP', port: config.port, phone: phone || "Unknown" });
            
            // একটি প্রমিজ রিটার্ন করো, যেটা UI থেকে OTP না আসা পর্যন্ত আটকে থাকবে
            return new Promise((resolve) => {
                otpResolver = resolve; 
            });
        };

        try {
            await runApiBot(config, sendLog, abortController.signal, requestOtp);
            process.send({ type: 'DONE', port: config.port });
        } catch (error) {
            process.send({ type: 'ERROR', port: config.port, message: error.message });
        }
    }
});