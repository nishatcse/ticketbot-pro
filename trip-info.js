const puppeteer = require('puppeteer');
const readline = require('readline');

// ==========================================
// ⚙️ THE ULTIMATE ZERO-CLICK SNIPER CONFIG
// ==========================================
const CONFIG = {
    PORT: 9222,
    TRAIN_NAME: "DRUTOJAN EXPRESS (758)",
    // TRIP_ID: "8561271",     
    // ROUTE_ID: "57734406",   
    ORIGIN: "Dinajpur",
    DESTINATION: "Dhaka",
    
    // ⚠️ NEW: Confirm API এর জন্য এই দুটি ডাটা লাগবেই
    DOJ: "22-May-2026", 
    CLASS: "S_CHAIR", 
    
    SEAT_COUNT: 2,

    // 🎯 NEW: OPTIONAL TARGETS (ফাঁকা রাখলে যেকোনো সিট ধরবে)
    TARGET_COACHES: ["JHA", "TA"], // শুধু এই বগিগুলো খুঁজবে। ফাঁকা [] রাখলে সব বগি খুঁজবে।
    TARGET_SEATS: ["JHA-41", "JHA-42"] // শুধু এই সিটগুলো খুঁজবে। ফাঁকা [] রাখলে যেকোনো ফাঁকা সিট ধরবে।

    // BOARDING_POINT_ID: 110714925
};

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


        console.log(`⚡ Executing Sequence for ${CONFIG.SEAT_COUNT} seat(s)...`);

        // ==========================================
        // PHASE A to D: SEAT LOCK & OTP TRIGGER
        // ==========================================
        const bookingResult = await activeTab.evaluate(async (cfg) => {
            try {
                // 🥷 THE NINJA KILL SWITCH (নতুন রান আইডি সেট করা)
                const currentRunId = Date.now();
                window.__SNIPER_RUN_ID = currentRunId;

                const rawToken = window.localStorage.getItem('token');
                const deviceId = window.localStorage.getItem('uudid');
                const deviceKey = window.localStorage.getItem('ssdk');
                let actionToken = window.sessionStorage.getItem('atk') || "";
                let cftToken = window.localStorage.getItem('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || "";

                if (!rawToken || !cftToken) return { success: false, message: "Missing Token or CFT Response." };

                const liveToken = rawToken.startsWith("Bearer") ? rawToken : "Bearer " + rawToken;
                let apiHeaders = {
                    "Authorization": liveToken, "Content-Type": "application/json", "Referer": "https://eticket.railway.gov.bd/",
                    "x-device-id": deviceId, "x-device-key": deviceKey, "x-requested-with": "XMLHttpRequest"
                };
                if (actionToken) apiHeaders["x-action-token"] = actionToken;

                // ⏱️ ডিলো ফাংশনটা একদম উপরে ডিক্লেয়ার করে নিলাম
                const delay = ms => new Promise(res => setTimeout(res, ms));

                // ==========================================
                // 🕵️‍♂️ PHASE 0: PRE-8 AM INFINITE SEARCH LOOP
                // ==========================================
                console.log(`[DEBUG] 🕒 Pre-Release Mode: Waiting for ${cfg.DOJ} tickets to drop...`);
                let DYNAMIC_TRIP_ID = null;
                let DYNAMIC_ROUTE_ID = null;
                let DYNAMIC_BOARDING_ID = null;
                let searchAttempt = 0;

                // 🛑 যতক্ষণ না সার্ভারে টিকিট রিলিজ হচ্ছে, এই লুপ চলতেই থাকবে!
                while (true) {
                    // 🥷 যদি নতুন স্ক্রিপ্ট রান হয়, তবে এই পুরোনো লুপটা সাথে সাথে সুইসাইড করবে!
                    if (window.__SNIPER_RUN_ID !== currentRunId) return { success: false, message: "Old loop killed by Ninja Switch!" };

                    searchAttempt++;
                    if (searchAttempt % 10 === 0) {
                        console.log(`[DEBUG] 🔄 Scanning Server for Release... Attempt: ${searchAttempt}`);
                    }

                    try {
                        const searchUrl = `https://railspaapi.shohoz.com/v1.0/web/bookings/search-trips-v2?from_city=${cfg.ORIGIN}&to_city=${cfg.DESTINATION}&date_of_journey=${cfg.DOJ}&seat_class=${cfg.CLASS}`;
                        const searchRes = await fetch(searchUrl, { headers: apiHeaders });
                        
                        const searchATK = searchRes.headers.get('x-action-token');
                        if (searchATK) { actionToken = searchATK; apiHeaders["x-action-token"] = searchATK; window.sessionStorage.setItem('atk', searchATK); }
                        
                        const searchData = await searchRes.json();

                        // 🎯 সার্ভার যদি ট্রেনের ডেটা দিয়ে দেয় (মানে টিকিট রিলিজ হয়েছে)
                        if (!searchData.error && searchData?.data?.trains) {
                            const targetTrain = searchData.data.trains.find(t => t.trip_number === cfg.TRAIN_NAME);
                            
                            if (targetTrain) {
                                const targetSeatType = targetTrain.seat_types.find(st => st.type === cfg.CLASS);
                                
                                if (targetSeatType) {
                                    DYNAMIC_TRIP_ID = targetSeatType.trip_id;
                                    DYNAMIC_ROUTE_ID = targetSeatType.trip_route_id;
                                    DYNAMIC_BOARDING_ID = targetTrain.boarding_points[0].trip_point_id;
                                    
                                    console.log("\x1b[32m%s\x1b[0m", `[DEBUG] 🎉 TICKETS RELEASED! IDs Grabbed! Moving to attack mode!`);
                                    break; // 🛑 রিলিজ হওয়ামাত্রই লুপ ভেঙে পরের ধাপে (Ghost Loop-এ) চলে যাবে!
                                }
                            }
                        }
                    } catch (error) {
                        // 🛡️ Error Ignore: সকাল ৮টার আগে সার্ভার এরর দিলেও সে ক্র্যাশ করবে না, সাইলেন্ট থাকবে।
                    }
                    
                    // ⏱️ ১.৫ সেকেন্ডের ডিলো (যাতে ক্লাউডফ্লেয়ার ব্লক না করে)
                    await delay(3000); 
                }

                // ==========================================
                // 👻 THE BULLETPROOF GHOST LOOP (POLLING + TIMEOUT + ANTI-CRASH)
                // ==========================================
                let successfullyReserved = [];
                let attemptCount = 0;
                let firstSeatLockTime = null; // ⏱️ প্রথম সিট লক হওয়ার টাইম
                const MAX_WAIT_TIME = 60000; // ⏱️ ৬০ সেকেন্ড (1 মিনিট) ম্যাক্সিমাম ওয়েট করবে


                while (successfullyReserved.length < cfg.SEAT_COUNT) {
                    // 🥷 জম্বি কিলার
                    if (window.__SNIPER_RUN_ID !== currentRunId) return { success: false, message: "Old loop killed by Ninja Switch!" };


                    attemptCount++;
                    let seatsNeeded = cfg.SEAT_COUNT - successfullyReserved.length;
                    
                    if (attemptCount % 5 === 0 && successfullyReserved.length === 0) {
                        console.log(`[DEBUG] 🔄 Ghost scanning... Attempt: ${attemptCount} | Need ${seatsNeeded} seat(s).`);
                    }

                    // ⏱️ TIMEOUT CHECK: যদি অলরেডি কিছু সিট লক হয়ে থাকে, তবে টাইম চেক করো
                    if (successfullyReserved.length > 0) {
                        let elapsedTime = Date.now() - firstSeatLockTime;
                        if (elapsedTime >= MAX_WAIT_TIME) {
                            console.log("\x1b[33m%s\x1b[0m", `⚠️ 60s TIMEOUT REACHED! Moving to payment with ${successfullyReserved.length} seat(s) before they expire!`);
                            break; // 🛑 লুপ ভেঙে পরের ধাপে (OTP/Payment) চলে যাবে
                        } else {
                            console.log(`[DEBUG] ⏳ Waiting max ${Math.floor((MAX_WAIT_TIME - elapsedTime) / 1000)}s for remaining seats...`);
                        }
                    }

                    try {
                        // --- PHASE A: FETCH LIVE LAYOUT ---
                        const layoutRes = await fetch(`https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${DYNAMIC_TRIP_ID}&trip_route_id=${DYNAMIC_ROUTE_ID}&cft_response=${cftToken}`, { headers: apiHeaders });
                        const layoutATK = layoutRes.headers.get('x-action-token');
                        if (layoutATK) { actionToken = layoutATK; apiHeaders["x-action-token"] = layoutATK; window.sessionStorage.setItem('atk', layoutATK); }
                        
                        const layoutData = await layoutRes.json();
                        // 🛠️ THE FIX 2: সাইলেন্ট এরর বন্ধ করা! সার্ভার লাথি মারলে যেন টার্মিনালে দেখা যায়।
                        if (layoutData.error || !layoutData?.data?.seatLayout) {
                            console.log("\x1b[31m%s\x1b[0m", `[DEBUG] ⚠️ Layout Fetch Error: ${JSON.stringify(layoutData)}`);
                            
                            // 🔄 যদি টোকেন এক্সপায়ার হয়ে যায়, তবে নতুন করে DOM থেকে নেওয়ার চেষ্টা করা
                            cftToken = window.localStorage.getItem('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || cftToken;
                            
                            await delay(3000); 
                            continue; 
                        }

                        // ==========================================
                        // 🚀 PHASE B: THE SINGLE-PASS NINJA SCANNER (WITH BUFFER POOL)
                        // ==========================================
                        let targetSeats = [];
                        let exactMatches = [];
                        let coachMatches = [];
                        let anyMatches = [];
                        let fastExit = false;

                        let seatsNeeded = cfg.SEAT_COUNT - successfullyReserved.length;
                        let poolSize = seatsNeeded + 6; // 🚀 Buffer Pool: আপনার যতগুলো লাগবে, তার চেয়ে ৬টি বেশি স্ক্যান করবে (Total backup)

                        for (let floor of layoutData.data.seatLayout) {
                            for (let row of floor.layout) {
                                for (let seat of row) {
                                    if (seat.seat_availability === 1 && seat.ticket_id) {
                                        // 🛡️ ডুপ্লিকেট সিট স্কিপ করা (যাতে নিজের লক করা সিট আবার না ধরে)
                                        if (successfullyReserved.some(resSeat => resSeat.id == seat.ticket_id)) continue;

                                        let s = { id: seat.ticket_id, name: seat.seat_number, coach: floor.floor_name };

                                        // 🎯 ক্যাটাগরি অনুযায়ী সিট আলাদা করা
                                        if (cfg.TARGET_SEATS && cfg.TARGET_SEATS.includes(s.name)) {
                                            exactMatches.push(s); // Priority 1
                                        } 
                                        else if (cfg.TARGET_COACHES && cfg.TARGET_COACHES.includes(s.coach)) {
                                            coachMatches.push(s); // Priority 2
                                        } 
                                        else {
                                            anyMatches.push(s);   // Priority 3
                                        }

                                        // 🥷 THE NINJA FAST-EXIT CONDITIONS (Buffer Pool অনুযায়ী)
                                        let noTargets = (!cfg.TARGET_SEATS || cfg.TARGET_SEATS.length === 0);
                                        let noCoaches = (!cfg.TARGET_COACHES || cfg.TARGET_COACHES.length === 0);

                                        // Case 1: Random Mode (কোনো টার্গেট নেই, পুল সাইজ পূরণ হলে বের হবে)
                                        if (noTargets && noCoaches && anyMatches.length >= poolSize) {
                                            fastExit = true; break;
                                        }

                                        // Case 2: Coach Mode (শুধু বগি টার্গেট)
                                        if (noTargets && !noCoaches && coachMatches.length >= poolSize) {
                                            fastExit = true; break;
                                        }

                                        // Case 3: Target Seat Mode
                                        if (!noTargets) {
                                            // টার্গেট সিটগুলো আগে কনফার্ম করা
                                            let gotAllTargets = (exactMatches.length === cfg.TARGET_SEATS.length || exactMatches.length >= seatsNeeded);
                                            if (gotAllTargets) {
                                                // টার্গেট পাওয়ার পর বাফার (poolSize) পূরণ করা
                                                if (!noCoaches && (exactMatches.length + coachMatches.length >= poolSize)) {
                                                    fastExit = true; break;
                                                }
                                                if (noCoaches && (exactMatches.length + anyMatches.length >= poolSize)) {
                                                    fastExit = true; break;
                                                }
                                            }
                                        }
                                    }
                                }
                                if (fastExit) break;
                            }
                            if (fastExit) break;
                        }

                        // 🛡️ FINAL ASSEMBLY (Buffer Pool + Randomizer)
                        // 🎲 সিটগুলোকে উল্টাপাল্টা করে দেওয়ার ফাংশন
                        const shuffle = (array) => array.sort(() => Math.random() - 0.5);

                        targetSeats.push(...exactMatches); // টার্গেট সিটগুলো তো সিরিয়ালই নেবে (যেহেতু আপনি স্পেসিফিক চেয়েছেন)
                        
                        if (targetSeats.length < poolSize) {
                            // বগির সিটগুলোকে রেন্ডম করে নেবে
                            targetSeats.push(...shuffle(coachMatches).slice(0, poolSize - targetSeats.length));
                        }
                        if (targetSeats.length < poolSize) {
                            // পুরো ট্রেনের সিটগুলোকে রেন্ডম করে নেবে (যাতে অন্য কারো সাথে ক্ল্যাশ না হয়)
                            targetSeats.push(...shuffle(anyMatches).slice(0, poolSize - targetSeats.length));
                        }

                        // সিট না পেলে আবার রিফ্রেশ মারবে
                        if (targetSeats.length === 0) {
                            await delay(3000); 
                            continue;
                        }

                        // --- PHASE C: RESERVE (WITH ANTI-CRASH LOGIC) ---
                        for (let i = 0; i < targetSeats.length; i++) {
                            // যদি লুপের ভেতরেই আমাদের সিট পূরণ হয়ে যায়, তবে আর রিকোয়েস্ট করবে না
                            if (successfullyReserved.length >= cfg.SEAT_COUNT) break;

                            const reserveRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                                method: "PATCH", headers: apiHeaders, 
                                body: JSON.stringify({ "ticket_id": targetSeats[i].id.toString(), "route_id": DYNAMIC_ROUTE_ID.toString(), "action_token": actionToken, "cft_response": cftToken, "extras": { "origin_name": cfg.ORIGIN, "destination_name": cfg.DESTINATION, "seat_number": targetSeats[i].name, "trip_number": cfg.TRAIN_NAME } })
                            });
                            
                            const loopATK = reserveRes.headers.get('x-action-token');
                            if (loopATK) { actionToken = loopATK; apiHeaders["x-action-token"] = loopATK; window.sessionStorage.setItem('atk', loopATK); }
                            
                            const reserveData = await reserveRes.json();
                            
                            // 🛡️ RACE CONDITION HANDLING: বট ক্র্যাশ করবে না!
                            if (reserveData.error) {
                                console.log("\x1b[31m%s\x1b[0m", `[DEBUG] ⚔️ Seat ${targetSeats[i].name} hijacked by another bot! Ignoring and moving on...`);
                                continue; // পরের সিট ট্রাই করবে বা লুপ ঘুরে নতুন লেআউট আনবে
                            } else {
                                successfullyReserved.push(targetSeats[i]);
                                
                                // ⏱️ প্রথম সিট লক হওয়ার সাথে সাথে টাইমার চালু হবে
                                if (!firstSeatLockTime) firstSeatLockTime = Date.now();
                                
                                console.log("\x1b[32m%s\x1b[0m", `[DEBUG] 🎯 Locked 1 Seat: ${targetSeats[i].name}. Total locked: ${successfullyReserved.length}/${cfg.SEAT_COUNT}`);
                            }
                        }

                        if (successfullyReserved.length < cfg.SEAT_COUNT) {
                            await delay(3000); 
                        }

                    } catch (error) {
                        console.log(`[DEBUG] Network blip, surviving the crash...`);
                        await delay(3000);
                    }
                }
                
                // 🛑 Loop ends here!

                // --- PHASE D: TRIGGER OTP ---
                console.log("[DEBUG] Seats locked! Triggering OTP SMS...");

                // this is comant part for now

                // const otpRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/passenger-details", {
                //     method: "POST", headers: apiHeaders, body: JSON.stringify({ "ticket_ids": successfullyReserved.map(s => parseInt(s.id)), "trip_id": DYNAMIC_TRIP_ID.toString(), "trip_route_id": DYNAMIC_ROUTE_ID.toString() })
                // });
                // const otpATK = otpRes.headers.get('x-action-token');
                // if (otpATK) window.sessionStorage.setItem('atk', otpATK);

                return { 
                    success: true, 
                    seats: successfullyReserved,
                    dynamicTripId: DYNAMIC_TRIP_ID,
                    dynamicRouteId: DYNAMIC_ROUTE_ID,
                    dynamicBoardingId: DYNAMIC_BOARDING_ID
                };

            } catch (error) { return { success: false, message: error.message }; }
        }, CONFIG);

        if (!bookingResult.success) {
            console.log("\x1b[31m%s\x1b[0m", `❌ FAILED: ${bookingResult.message}`);
            browser.disconnect(); process.exit();
        }

        console.log("\x1b[32m%s\x1b[0m", `✅ BOOM! Locked Seats: [${bookingResult.seats.map(s => s.name).join(', ')}]`);

        /* --- নিচের পুরো অংশটুকু কমেন্ট করা হলো ---
        
        console.log(`[3/4] 📲 OTP SMS Sent to your mobile!`);
        const userOtp = await askQuestion("🔑 Enter OTP Code: ");
        console.log(`[4/4] 💸 Executing Verify & Confirm (Final Gateway Bypass)...`);

        // ==========================================
        // PHASE E & F: VERIFY + CONFIRM + GET LINK
        // ==========================================
        const finalGatewayResult = await activeTab.evaluate(async (cfg, otpCode, ticketIds, tripId, routeId, boardingId) => {
            try {
                const liveToken = "Bearer " + window.localStorage.getItem('token');
                let actionToken = window.sessionStorage.getItem('atk') || "";
                
                let apiHeaders = {
                    "Authorization": liveToken, "Content-Type": "application/json", 
                    "Referer": "https://eticket.railway.gov.bd/booking/train/trip-info",
                    "x-device-id": window.localStorage.getItem('uudid'), 
                    "x-device-key": window.localStorage.getItem('ssdk'), 
                    "x-requested-with": "XMLHttpRequest"
                };
                if (actionToken) apiHeaders["x-action-token"] = actionToken;

                // --- PHASE E: VERIFY OTP ---
                const verifyRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/verify-otp", {
                    method: "POST", headers: apiHeaders, 
                    body: JSON.stringify({ "trip_id": parseInt(tripId), "trip_route_id": parseInt(routeId), "ticket_ids": ticketIds, "otp": otpCode.toString() })
                });

                const verifyATK = verifyRes.headers.get('x-action-token');
                if (verifyATK) { actionToken = verifyATK; apiHeaders["x-action-token"] = verifyATK; }

                const verifyData = await verifyRes.json();
                if (verifyData.error) return { success: false, message: "OTP Error: " + JSON.stringify(verifyData.error) };
                
                // 🛠️ সার্ভার থেকে আপনার নাম, মোবাইল আর ইমেইল চুরি করা (Confirm API এর জন্য লাগবে)
                const userData = verifyData?.data?.user;
                if (!userData) return { success: false, message: "Could not fetch User Data from OTP Verify response." };

                console.log("[DEBUG] OTP Verified! Fetching PNR from Confirm API...");

                // --- PHASE F: THE FINAL CONFIRM API (যেটা আপনি বের করেছেন) ---
                // যেহেতু সিট ২টা বা ৩টা হতে পারে, তাই সবার জন্য একই নাম/জেন্ডার অ্যারে বানানো
                const namesArray = Array(ticketIds.length).fill(userData.name);
                const genderArray = Array(ticketIds.length).fill("male");
                const typeArray = Array(ticketIds.length).fill("Adult");

                const confirmPayload = {
                    "is_bkash_online": true,
                    "boarding_point_id": parseInt(boardingId),
                    "contactperson": 0,
                    "date_of_journey": cfg.DOJ,
                    "from_city": cfg.ORIGIN,
                    "to_city": cfg.DESTINATION,
                    "gender": genderArray,
                    "passengerType": typeArray,
                    "pemail": userData.email,
                    "pmobile": userData.mobile,
                    "pname": namesArray,
                    "seat_class": cfg.CLASS,
                    "selected_mobile_transaction": 1, // 1 = bKash
                    "ticket_ids": ticketIds,
                    "trip_id": parseInt(tripId),
                    "trip_route_id": parseInt(routeId),
                    "otp": otpCode.toString(),
                    "ip_address": "127.0.0.1",
                    "isshohoz": 0
                };

                const confirmRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/confirm", {
                    method: "PATCH", headers: apiHeaders, body: JSON.stringify(confirmPayload)
                });

                const confirmData = await confirmRes.json();
                console.log("[DEBUG] Confirm API Response:", JSON.stringify(confirmData));

                if (confirmData.error) return { success: false, message: "Confirm Error: " + JSON.stringify(confirmData.error) };

                // 🎯 সার্ভার সরাসরি রিডাইরেক্ট লিংক দিয়ে দিয়েছে!
                const finalPaymentUrl = confirmData?.data?.redirectUrl;
                
                if (!finalPaymentUrl) return { success: false, message: "Failed to extract Redirect URL from confirm response." };

                return { success: true, paymentUrl: finalPaymentUrl };

            } catch (error) { return { success: false, message: error.message }; }
        }, CONFIG, userOtp, bookingResult.seats.map(s => parseInt(s.id)), bookingResult.dynamicTripId, bookingResult.dynamicRouteId, bookingResult.dynamicBoardingId);


        if (finalGatewayResult.success && finalGatewayResult.paymentUrl) {
            console.log("\x1b[32m%s\x1b[0m", `✅ BINGO! PNR GENERATED SUCCESSFULLY!`);
            console.log(`🚀 Teleporting you directly to bKash Gateway...`);
            
            // 🚀 The Final Teleport: সরাসরি পেমেন্ট পেজে ব্রাউজারকে নিয়ে যাওয়া
            await activeTab.goto(finalGatewayResult.paymentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            console.log("\x1b[36m%s\x1b[0m", `🎯 TASK COMPLETE! Look at your browser and make the payment!`);
        } else {
            console.log("\x1b[31m%s\x1b[0m", `❌ GATEWAY FAILED: ${finalGatewayResult.message}`);
        }
        ------------------- */

    } catch (err) {
        console.error("Connection Error:", err.message);
    } finally {
        if (browser) browser.disconnect();
        process.exit(0);
    }
}

runZeroClickSniper();