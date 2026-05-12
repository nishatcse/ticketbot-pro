const puppeteer = require('puppeteer');
const readline = require('readline'); // টার্মিনাল থেকে ইনপুট নেওয়ার জন্য

// ==========================================
// ⚙️ ULTRA-FAST ZERO-CLICK SNIPER CONFIG
// ==========================================
const CONFIG = {
    PORT: 9222,
    TRAIN_NAME: "DRUTOJAN EXPRESS (758)",
    TRIP_ID: "8561271",     
    ROUTE_ID: "57734406",   
    ORIGIN: "Dinajpur",
    DESTINATION: "Dhaka",
    SEAT_COUNT: 1
};

// টার্মিনালে প্রশ্ন করার ফাংশন
const askQuestion = (query) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, ans => { rl.close(); resolve(ans); }));
};

async function runZeroClickSniper() {
    console.log(`\n[1/4] 🔌 Connecting to Chrome on Port ${CONFIG.PORT}...`);
    let browser;

    try {
        browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CONFIG.PORT}`, defaultViewport: null });
        const pages = await browser.pages();
        let activeTab = pages.find(page => page.url().includes('railway.gov.bd') || page.url().includes('shohoz.com'));

        if (!activeTab) {
            console.log("\x1b[31m%s\x1b[0m", "❌ ERROR: No Shohoz Tab found!");
            browser.disconnect(); process.exit();
        }

        activeTab.on('console', msg => { if (msg.text().includes('[DEBUG]')) console.log("\x1b[36m%s\x1b[0m", `  🖥️ BROWSER: ${msg.text()}`); });

        await activeTab.bringToFront();
        console.log(`[2/4] 🚀 Locked onto Tab: ${activeTab.url()}`);
        console.log(`⚡ Executing Multi-Seat Sequence for ${CONFIG.SEAT_COUNT} seat(s)...`);

        // ==========================================
        // THE GHOST ENGINE: সিট বুকিং + OTP ট্রিগার
        // ==========================================
        const bookingResult = await activeTab.evaluate(async (cfg) => {
            try {
                const rawToken = window.localStorage.getItem('token');
                const deviceId = window.localStorage.getItem('uudid');
                const deviceKey = window.localStorage.getItem('ssdk');
                let actionToken = window.sessionStorage.getItem('atk') || document.querySelector('input[name="action_token"]')?.value || "";
                let cftToken = window.localStorage.getItem('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || "";

                if (!rawToken || !cftToken) return { success: false, message: "Missing Token or CFT Response." };

                const liveToken = rawToken.startsWith("Bearer") ? rawToken : "Bearer " + rawToken;
                let apiHeaders = {
                    "Authorization": liveToken, "Content-Type": "application/json", "Referer": "https://eticket.railway.gov.bd/",
                    "x-device-id": deviceId, "x-device-key": deviceKey, "x-requested-with": "XMLHttpRequest"
                };
                if (actionToken) apiHeaders["x-action-token"] = actionToken;

                // --- PHASE A: LAYOUT ---
                const layoutUrl = `https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${cfg.TRIP_ID}&trip_route_id=${cfg.ROUTE_ID}&cft_response=${cftToken}`;
                const layoutRes = await fetch(layoutUrl, { headers: apiHeaders });
                
                const newActionToken = layoutRes.headers.get('x-action-token');
                if (newActionToken) { actionToken = newActionToken; apiHeaders["x-action-token"] = newActionToken; window.sessionStorage.setItem('atk', newActionToken); }

                const layoutData = await layoutRes.json();
                if (layoutData.error || !layoutData?.data?.seatLayout) return { success: false, message: "Layout Fetch Failed." };

                // --- PHASE B: FIND SEATS ---
                let targetSeats = [];
                for (let floor of layoutData.data.seatLayout) {
                    for (let row of floor.layout) {
                        for (let seat of row) {
                            if (seat.seat_availability === 1 && seat.ticket_id) {
                                targetSeats.push({ id: seat.ticket_id, name: seat.seat_number });
                                if (targetSeats.length === cfg.SEAT_COUNT) break; 
                            }
                        }
                        if (targetSeats.length === cfg.SEAT_COUNT) break;
                    }
                    if (targetSeats.length === cfg.SEAT_COUNT) break;
                }

                if (targetSeats.length === 0) return { success: false, message: "Train is fully booked." };

                // ==========================================
                // PHASE C: RESERVE SEATS SEQUENTIALLY
                // ==========================================
                let successfullyReserved = [];
                let capturedPNR = null; // 🛠️ PNR ধরার জন্য ভেরিয়েবল

                for (let i = 0; i < targetSeats.length; i++) {
                    let currentSeat = targetSeats[i];
                    
                    const reservePayload = {
                        "ticket_id": currentSeat.id.toString(),
                        "route_id": cfg.ROUTE_ID.toString(),
                        "action_token": actionToken,
                        "cft_response": cftToken,
                        "extras": {
                            "origin_name": cfg.ORIGIN,
                            "destination_name": cfg.DESTINATION,
                            "seat_number": currentSeat.name,
                            "trip_number": cfg.TRAIN_NAME
                        }
                    };

                    const reserveRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                        method: "PATCH", headers: apiHeaders, body: JSON.stringify(reservePayload)
                    });

                    const loopActionToken = reserveRes.headers.get('x-action-token');
                    if (loopActionToken) { actionToken = loopActionToken; apiHeaders["x-action-token"] = loopActionToken; window.sessionStorage.setItem('atk', loopActionToken); }

                    const reserveData = await reserveRes.json();
                    
                    // 🛠️ সার্ভার ঠিক কী দিচ্ছে সেটা টার্মিনালে দেখা
                    console.log(`[DEBUG] Reserve API Response: ${JSON.stringify(reserveData)}`);

                    if (!reserveData.error) {
                        successfullyReserved.push(currentSeat);
                        // যদি এখানে PNR থাকে, তবে সেটা সেভ করে নেওয়া
                        capturedPNR = reserveData?.data?.booking_id || reserveData?.data?.pnr || reserveData?.pnr || capturedPNR;
                    }
                }

                if (successfullyReserved.length === 0) return { success: false, message: "Failed to book seats." };

                // ==========================================
                // PHASE D: TRIGGER OTP
                // ==========================================
                console.log("[DEBUG] Seats locked! Triggering OTP SMS...");
                const otpPayload = {
                    "ticket_ids": successfullyReserved.map(s => parseInt(s.id)),
                    "trip_id": cfg.TRIP_ID.toString(),
                    "trip_route_id": cfg.ROUTE_ID.toString()
                };

                const otpRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/passenger-details", {
                    method: "POST", headers: apiHeaders, body: JSON.stringify(otpPayload)
                });
                
                const otpData = await otpRes.json();
                
                // 🛠️ সার্ভার ঠিক কী দিচ্ছে সেটা টার্মিনালে দেখা
                console.log(`[DEBUG] Passenger Details Response: ${JSON.stringify(otpData)}`);

                // যদি OTP রেসপন্সে PNR থাকে, তবে সেটা সেভ করে নেওয়া
                capturedPNR = otpData?.data?.booking_id || otpData?.data?.pnr || otpData?.pnr || capturedPNR;

                const otpATK = otpRes.headers.get('x-action-token');
                if (otpATK) window.sessionStorage.setItem('atk', otpATK);

                // 🛠️ PNR টা রিটার্ন করে দেওয়া
                return { success: true, seats: successfullyReserved, pnr: capturedPNR, rawOtpData: otpData };

            } catch (error) { return { success: false, message: "Error: " + error.message }; }
        }, CONFIG);

        if (!bookingResult.success) {
            console.log("\x1b[31m%s\x1b[0m", `❌ FAILED: ${bookingResult.message}`);
            browser.disconnect(); process.exit();
        }

        console.log("\x1b[32m%s\x1b[0m", `✅ BOOM! Locked Seats: [${bookingResult.seats.map(s => s.name).join(', ')}]`);
        console.log("\x1b[33m%s\x1b[0m", `🎫 Captured PNR: ${bookingResult.pnr || "Not Found Yet"}`);
        
        // ==========================================
        // 📲 TERMINAL OTP INPUT
        // ==========================================
        console.log(`[3/4] 📲 OTP SMS Sent to your mobile!`);
        const userOtp = await askQuestion("🔑 Enter OTP Code: ");

        console.log(`[4/4] 💸 Verifying OTP and generating Payment Link...`);

        // ==========================================
        // PHASE E: VERIFY OTP & GET PAYMENT URL
        // ==========================================
        const paymentResult = await activeTab.evaluate(async (cfg, otpCode, ticketIds) => {
            try {
                const liveToken = "Bearer " + window.localStorage.getItem('token');
                const actionToken = window.sessionStorage.getItem('atk') || "";
                
                const apiHeaders = {
                    "Authorization": liveToken, 
                    "Content-Type": "application/json", 
                    
                    // 🛠️ THE FIX 1: সার্ভারকে ধোঁকা দেওয়া (আমরা যেন trip-info পেজেই আছি)
                    "Referer": "https://eticket.railway.gov.bd/booking/train/trip-info",
                    
                    "x-device-id": window.localStorage.getItem('uudid'), 
                    "x-device-key": window.localStorage.getItem('ssdk'), 
                    "x-requested-with": "XMLHttpRequest"
                };
                if (actionToken) apiHeaders["x-action-token"] = actionToken;

                // The Final Verify Payload
                const verifyPayload = {
                    "trip_id": parseInt(cfg.TRIP_ID),
                    "trip_route_id": parseInt(cfg.ROUTE_ID),
                    "ticket_ids": ticketIds,
                    "otp": otpCode.toString()
                };

                const verifyRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/verify-otp", {
                    method: "POST", headers: apiHeaders, body: JSON.stringify(verifyPayload)
                });

                const verifyData = await verifyRes.json();

                // 🛠️ THE FIX 2: ব্রাউজারের কনসোলে আসল রেসপন্স প্রিন্ট করা
                console.log("[DEBUG] Verify OTP Server Response:", JSON.stringify(verifyData));

                if (verifyData.error) {
                    return { success: false, message: JSON.stringify(verifyData.error) };
                }
                
                // 🛠️ THE FIX 3: Shohoz মাঝে মাঝে সরাসরি payment_url দেয়, আবার মাঝে মাঝে data এর ভেতর দেয়।
                const finalPaymentUrl = verifyData?.data?.payment_url || verifyData?.payment_url;

                if (!finalPaymentUrl) {
                    // সার্ভার ঠিক কী বলছে, সেটা টার্মিনালে পাঠিয়ে দেওয়া
                    return { success: false, message: `No URL. Server said: ${JSON.stringify(verifyData)}` };
                }

                return { success: true, paymentUrl: finalPaymentUrl };

            } catch (error) { return { success: false, message: error.message }; }
        }, CONFIG, userOtp, bookingResult.seats.map(s => parseInt(s.id)));


        if (paymentResult.success && paymentResult.paymentUrl) {
            console.log("\x1b[32m%s\x1b[0m", `✅ OTP VERIFIED! Redirecting to Payment Gateway...`);
            
            // 🚀 The Final Teleport: সরাসরি পেমেন্ট পেজে ব্রাউজারকে নিয়ে যাওয়া
            await activeTab.goto(paymentResult.paymentUrl);
            console.log(`🎯 Task Complete! Pay in your browser to confirm tickets.`);
        } else {
            console.log("\x1b[31m%s\x1b[0m", `❌ OTP Failed or Incorrect: ${paymentResult.message}`);
        }

    } catch (err) {
        console.error("Connection Error:", err.message);
    } finally {
        if (browser) browser.disconnect();
        process.exit(0);
    }
}

runZeroClickSniper();