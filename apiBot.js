const puppeteer = require('puppeteer');

// মডিউল হিসেবে এক্সপোর্ট করছি যাতে worker.js একে কল করতে পারে
module.exports = async function runApiBot(config, sendLog, abortSignal, requestOtp) {
    sendLog(`🔌 Connecting to Chrome on Port ${config.port}...`);
    let browser;

    try {
        browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${config.port}`, defaultViewport: null, protocolTimeout: 0 });
        const pages = await browser.pages();
        let activeTab = pages.find(page => page.url().includes('railway.gov.bd') || page.url().includes('shohoz.com'));

        if (!activeTab) {
            sendLog("<span style='color:red;'>❌ ERROR: No Shohoz Tab found! Please open the site first.</span>");
            browser.disconnect();
            return;
        }

        activeTab.on('console', msg => { 
            if (msg.text().includes('[DEBUG]')) sendLog(`<span style='color:#aaa;'>🖥️ ${msg.text()}</span>`); 
        });

        await activeTab.bringToFront();
        sendLog(`🚀 Locked onto Tab! Executing Sequence for ${config.seats} seat(s)...`);

        // ==========================================
        // PHASE A to D: SEAT LOCK & OTP TRIGGER
        // ==========================================
        const bookingResult = await activeTab.evaluate(async (cfg) => {
            try {
                // 🥷 THE NINJA KILL SWITCH
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

                const delay = ms => new Promise(res => setTimeout(res, ms));

                // ==========================================
                // 🕵️‍♂️ PHASE 0: PRE-8 AM INFINITE SEARCH LOOP
                // ==========================================
                console.log(`[DEBUG] 🕒 Pre-Release Mode: Waiting for ${cfg.doj} tickets to drop...`);
                let DYNAMIC_TRIP_ID = null;
                let DYNAMIC_ROUTE_ID = null;
                let DYNAMIC_BOARDING_ID = null;
                let searchAttempt = 0;

                while (true) {
                    if (window.__SNIPER_RUN_ID !== currentRunId) return { success: false, message: "Old loop killed by Ninja Switch!" };

                    searchAttempt++;
                    if (searchAttempt % 10 === 0) console.log(`[DEBUG] 🔄 Scanning Server for Release... Attempt: ${searchAttempt}`);

                    try {
                        const searchUrl = `https://railspaapi.shohoz.com/v1.0/web/bookings/search-trips-v2?from_city=${cfg.origin}&to_city=${cfg.dest}&date_of_journey=${cfg.doj}&seat_class=${cfg.seatClass}`;
                        const searchRes = await fetch(searchUrl, { headers: apiHeaders, cache: "no-store" });
                        
                        const searchATK = searchRes.headers.get('x-action-token');
                        if (searchATK) { actionToken = searchATK; apiHeaders["x-action-token"] = searchATK; window.sessionStorage.setItem('atk', searchATK); }
                        
                        const searchData = await searchRes.json();

                        if (!searchData.error && searchData?.data?.trains) {
                            const targetTrain = searchData.data.trains.find(t => t.trip_number === cfg.trainName);
                            if (targetTrain) {
                                const targetSeatType = targetTrain.seat_types.find(st => st.type === cfg.seatClass);
                                if (targetSeatType) {
                                    DYNAMIC_TRIP_ID = targetSeatType.trip_id;
                                    DYNAMIC_ROUTE_ID = targetSeatType.trip_route_id;
                                    DYNAMIC_BOARDING_ID = targetTrain.boarding_points[0].trip_point_id;
                                    
                                    console.log(`[DEBUG] 🎉 TICKETS RELEASED! IDs Grabbed! Moving to attack mode!`);
                                    cftToken = window.localStorage.getItem('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || cftToken;
                                    break;
                                }
                            }
                        }
                    } catch (error) { /* Silent Ignore */ }
                    await delay(7500); 
                }


                // ==========================================
                // ⏳ PHASE 0.5: THE HYBRID STRIKE CONTROLLER
                // ==========================================
                
                if (cfg.useSchedule) {
                    // 🕒 SCHEDULED STRIKE MODE
                    let targetH = cfg.targetHour !== undefined ? cfg.targetHour : 8; 
                    let targetM = cfg.targetMinute !== undefined ? cfg.targetMinute : 0;
                    let targetS = cfg.targetSecond !== undefined ? cfg.targetSecond : 0; 

                    let targetDate = new Date();
                    targetDate.setHours(targetH, targetM, targetS, 0);
                    let targetTimeMs = targetDate.getTime();
                    let nowMsCheck = Date.now();

                    // Late Start Logic
                    if (targetTimeMs < nowMsCheck) {
                        let lateByMs = nowMsCheck - targetTimeMs;
                        if (Math.floor(lateByMs / 60000) < 30) {
                            console.log(`[DEBUG] ⚠️ LATE START DETECTED! Bypassing Timer...`);
                        } else {
                            targetDate.setDate(targetDate.getDate() + 1);
                            targetTimeMs = targetDate.getTime();
                        }
                    }

                    let timeStr = `${targetH.toString().padStart(2, '0')}:${targetM.toString().padStart(2, '0')}:${targetS.toString().padStart(2, '0')}`;
                    console.log(`[DEBUG] ⏳ SCHEDULED MODE: Entering Holding Pattern for exactly ${timeStr} ...`);
                    
                    let lastLogSecond = -1;

                    while (true) {
                        if (window.__SNIPER_RUN_ID !== currentRunId) return { success: false, message: "Killed by Ninja Switch!" };
                        
                        let nowMs = Date.now(); 
                        let timeDiff = targetTimeMs - nowMs;

                        // 🚀 BINGO!
                        if (timeDiff <= 0) {
                            cftToken = document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || cftToken;
                            console.log(`[DEBUG] 🚀 BINGO! CLOCK HIT ${timeStr} - TIME IS UP! UNLEASHING PHASE B! GO GO GO!`);
                            break; 
                        }

                        // ⚡ High Precision Wait
                        if (timeDiff <= 60000) {
                            let secondsLeft = Math.ceil(timeDiff / 1000); 
                            if (secondsLeft !== lastLogSecond) {
                                console.log(`[DEBUG] ⚡ T-Minus ${secondsLeft} seconds to Attack!`);
                                if (secondsLeft === 8) {
                                    console.log(`[DEBUG] 🔄 PRE-WARMING: Forcing Cloudflare to generate a fresh token...`);
                                    if (window.turnstile) { window.turnstile.reset(); }
                                }
                                lastLogSecond = secondsLeft;
                            }
                            await delay(50); 
                            continue; 
                        }
                        
                        // 💤 Normal Wait
                        let s = new Date(nowMs).getSeconds();
                        if (s % 10 === 0 && s !== lastLogSecond) {
                            console.log(`[DEBUG] 💤 Holding Pattern Active... Target: ${timeStr}`);
                            lastLogSecond = s;
                        }
                        await delay(1000); 
                    }
                } else {
                    // ⚡ INSTANT STRIKE MODE (No Timer)
                    console.log(`[DEBUG] ⚡ INSTANT STRIKE MODE ACTIVATED! Bypassing Timer, attacking immediately!`);
                    // নিশ্চিত হওয়ার জন্য টোকেনটা রিড করে নিলাম
                    cftToken = document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || cftToken;
                }


                let successfullyReserved = [];
                let firstSeatLockTime = null; 


                // ==========================================
                // 👻 PHASE B: SINGLE-PASS NINJA SCANNER (No fastExit)
                // ==========================================
                let attemptCount = 0;
                const MAX_WAIT_TIME = 90000;
                let partialRetryDone = false;

                while (successfullyReserved.length < cfg.seats) {
                    if (window.__SNIPER_RUN_ID !== currentRunId) return { success: false, message: "Old loop killed by Ninja Switch!" };

                    attemptCount++;
                    let seatsNeeded = cfg.seats - successfullyReserved.length;
                    
                    if (attemptCount % 5 === 0 && successfullyReserved.length === 0) {
                        console.log(`[DEBUG] 🔄 Ghost scanning... Attempt: ${attemptCount} | Need ${seatsNeeded} seat(s).`);
                    }

                    if (successfullyReserved.length > 0) {
                        let elapsedTime = Date.now() - firstSeatLockTime;
                        if (elapsedTime >= MAX_WAIT_TIME) {
                            console.log(`[DEBUG] ⚠️ 90s TIMEOUT REACHED! Moving to payment with ${successfullyReserved.length} seat(s)!`);
                            break; 
                        }
                    }

                    try {
                        // 🚀 THE FIX: KILL-SWITCH FOR SEAT LAYOUT FETCH
                        const controller = new AbortController();
                        // ⏱️ ৩.৫ সেকেন্ডের বেশি ম্যাপ আনতে সময় লাগলে রিকোয়েস্ট কেটে দেবে!
                        const timeoutId = setTimeout(() => controller.abort(), 3500); 

                        const layoutRes = await fetch(`https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${DYNAMIC_TRIP_ID}&trip_route_id=${DYNAMIC_ROUTE_ID}&cft_response=${cftToken}`, { 
                            headers: apiHeaders, 
                            cache: "no-store",
                            signal: controller.signal // 👈 সিগন্যাল যুক্ত করা হলো
                        });
                        
                        clearTimeout(timeoutId); // 🎯 ঠিকঠাক রেসপন্স পেলে টাইমার অফ করে দেবে

                        // 🛑 THE 401 GUARD: লগইন এক্সপায়ার চেক
                        if (layoutRes.status === 401) {
                            console.log(`[DEBUG] 💀 FATAL: Your Main Login Token (Bearer) Expired!`);
                            return { success: false, message: "⚠️ 401 Unauthorized! Please reload the Shohoz tab, login again, and restart the bot!" };
                        }

                        const layoutATK = layoutRes.headers.get('x-action-token');
                        if (layoutATK) { actionToken = layoutATK; apiHeaders["x-action-token"] = layoutATK; window.sessionStorage.setItem('atk', layoutATK); }
                        
                        const layoutData = await layoutRes.json();

                        if (layoutData.error || !layoutData?.data?.seatLayout) {
                            console.log(`[DEBUG] ⚠️ Layout Fetch Failed. Server Response: ${JSON.stringify(layoutData)}`);

                            // 🥷 THE SILENT RESURRECTION (NO PAGE RELOAD)
                            if (layoutData.error && layoutData.error.messages && layoutData.error.messages.errorKey === "TURNSTILE_VERIFICATION_FAILED") {
    
                                // 🧠 SMART RUN: যদি অলরেডি সিট পকেটে থাকে, টোকেন রিসেট না মেরে সোজা পেমেন্টে দৌড়!
                                if (successfullyReserved.length > 0) {
                                    console.log(`[DEBUG] 🚨 Token died, but we have ${successfullyReserved.length} seat(s) safely locked! Rushing to payment...`);
                                    break; 
                                }
                            
                                console.log(`[DEBUG] 🔄 Token died! Forcing Cloudflare to generate a NEW token...`);
                                
                                // 🚀 THE BULLETPROOF FIX: 
                                let expiredToken = cftToken; // মরা টোকেনটা মনে রাখলাম চেনার জন্য
                                if (window.turnstile) { window.turnstile.reset(); }
                                
                                let isNewTokenGrabbed = false;
                                // ১০ সেকেন্ড পর্যন্ত চেক করবে নতুন টোকেন এলো কি না
                                for(let w = 0; w < 10; w++) {
                                    await delay(1000); // ১ সেকেন্ড করে ওয়েট করবে
                                    let checkToken = document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "";
                                    
                                    // যদি টোকেন ফাঁকা না হয় এবং মরা টোকেনের চেয়ে আলাদা হয়!
                                    if (checkToken && checkToken !== expiredToken) {
                                        cftToken = checkToken;
                                        window.localStorage.setItem('cf-turnstile-response', cftToken);
                                        console.log(`[DEBUG] 🔋 Fresh Token Grabbed in ${w + 1} seconds!`);
                                        isNewTokenGrabbed = true;
                                        break; // নতুন পেয়ে গেলে লুপ থেকে বেরিয়ে আসবে
                                    }
                                }

                                if (!isNewTokenGrabbed) {
                                    console.log(`[DEBUG] ❌ Cloudflare is stuck! Retrying in next loop...`);
                                    await delay(3000);
                                }
                            } else {
                                // অন্য কোনো এরর হলে নরমাল ওয়েট
                                await delay(7500); 
                            }
                            continue; 
                        }

                        // ==========================================
                        // 👻 PHASE B: WHOLE MAP NINJA SCANNER (No fastExit)
                        // ==========================================
                        let exactMatches = [];
                        let coachMatches = [];
                        let anyMatches = [];

                        // 🚀 পুরো ট্রেনের ম্যাপ স্ক্যান করে সব ফাঁকা সিট লিস্টে আনবে
                        for (let floor of layoutData.data.seatLayout) {
                            for (let row of floor.layout) {
                                for (let seat of row) {
                                    if (seat.seat_availability == 1 && seat.ticket_id && seat.seat_number) {
                                        // যদি অলরেডি ჩვენদের পকেটে থাকে, স্কিপ
                                        if (successfullyReserved.some(resSeat => resSeat.id == seat.ticket_id)) continue;

                                        let s = { id: seat.ticket_id, name: seat.seat_number, coach: floor.floor_name };

                                        // ক্যাটাগরি অনুযায়ী সিট ভাগ করা
                                        if (cfg.targets && cfg.targets.includes(s.name)) { exactMatches.push(s); } 
                                        else if (cfg.coaches && cfg.coaches.includes(s.coach)) { coachMatches.push(s); } 
                                        else { anyMatches.push(s); }
                                    }
                                }
                            }
                        }

                        // ==========================================
                        // 🧠 ADVANCED SWARM INTELLIGENCE: Priority Filtering
                        // ==========================================
                        
                        // 🧠 THE STRATEGY ENGINE (লিস্ট সাজানোর ফাংশন)
                        function applyStrategy(list, strategyId) {
                            if (list.length === 0) return []; 
                            let mid = Math.floor(list.length / 2);

                            // 🚀 আপনার লজিক: সিট ১৪টা বা তার বেশি হলেই কেবল ৫টা স্কিপ করবে, নইলে ০ স্কিপ!
                            let skipCount = list.length >= 14 ? 5 : 0;
                            
                            if (strategyId === 0) return list.slice(mid); // Middle -> End
                            if (strategyId === 1) return list.slice(0, mid).reverse(); // Middle -> Start
                            if (strategyId === 2) return list.slice().reverse().slice(skipCount); // End -> Start (Skip skipCount)
                            if (strategyId === 3) return list.slice(skipCount); // Start -> End (Skip skipCount)
                            return list;
                        }

                        // God Mode: UI Strategy or Port fallback
                        let attackVector = cfg.strategy !== undefined ? parseInt(cfg.strategy) : cfg.port % 4; 

                        // 🎯 বগি এবং রেন্ডম সিট আলাদা আলাদা সাজানো হচ্ছে (যাতে মিক্স হয়ে বাদ না পড়ে!)
                        let sortedCoach = applyStrategy(coachMatches, attackVector);
                        let sortedAny = applyStrategy(anyMatches, attackVector);

                        // 🚀 THE FINAL TARGET POOL (Guaranteeing Exactly 9 Seats)
                        let targetSeats = [];
                        let poolSize = 9; 

                        // Priority 1: Exact Targets (KA-1, KA-2)
                        targetSeats.push(...exactMatches); 

                        // Priority 2: Selected Coach Seats
                        if (targetSeats.length < poolSize) { 
                            targetSeats.push(...sortedCoach.slice(0, poolSize - targetSeats.length)); 
                        }

                        // Priority 3: Backup Random Seats (টু মেক শিওর সে ৯টাই পায়)
                        if (targetSeats.length < poolSize) { 
                            targetSeats.push(...sortedAny.slice(0, poolSize - targetSeats.length)); 
                        }

                        if (targetSeats.length === 0) {
                            console.log(`[DEBUG] ⚠️ No valid seats found in the whole train. Waiting...`);
                            await delay(7500); 
                            continue;
                        }

                        // 🚀 RADAR TRACKER: আপনি নিজের চোখে দেখবেন সে কোন ৯টায় ফায়ার করছে!
                        console.log(`[DEBUG] 🔫 Arsenal loaded with ${targetSeats.length} bullet(s): [ ${targetSeats.map(s => s.name).join(', ')} ]`);

                        // --- PHASE C: RESERVE (SAFE SEQUENTIAL WITH 2.5s KILL-SWITCH) ---

                        const basePayload = {
                            route_id: DYNAMIC_ROUTE_ID.toString(),
                            cft_response: cftToken,
                            extras: { origin_name: cfg.origin, destination_name: cfg.dest, trip_number: cfg.trainName }
                        };
                        let requestsFired = 0;
                        
                        // 🚀 টোকেন চেইন এবং ৪ সিটের এরর থেকে বাঁচতে আমরা এখন একটার পর একটা (Sequential) ফায়ার করব
                        for (let i = 0; i < targetSeats.length; i++) {
                            // 🛑 THE HARD CAP: আমাদের কাঙ্ক্ষিত সিট (cfg.seats) পূর্ণ হয়ে গেলে লুপ সাথে সাথে ব্রেক!
                            if (successfullyReserved.length >= cfg.seats) break;
                            if (requestsFired >= 9) break;
                        
                            basePayload.ticket_id = targetSeats[i].id.toString();
                            basePayload.action_token = actionToken;
                            basePayload.extras.seat_number = targetSeats[i].name;
                        
                            requestsFired++; 
                            
                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 2500); // ⏱️ ২.৫s কিল-সুইচ
                            
                                // ⚡ প্রতিটি রিকোয়েস্টের রেসপন্সের জন্য আমরা লুপের ভেতরেই await করব
                                const reserveRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                                    method: "PATCH", headers: apiHeaders, 
                                    cache: "no-store",  
                                    signal: controller.signal, 
                                    body: JSON.stringify(basePayload) 
                                });
                                
                                clearTimeout(timeoutId); // 🎯 ঠিকঠাক রেসপন্স পেলে টাইমার অফ
                                
                                // ⚡ নতুন অ্যাকশন টোকেন হেডার থেকে নিয়ে পকেটে ভরে নিলাম (টোকেন চেইন অক্ষত রইল)
                                const loopATK = reserveRes.headers.get('x-action-token');
                                if (loopATK) { actionToken = loopATK; apiHeaders["x-action-token"] = loopATK; window.sessionStorage.setItem('atk', loopATK); }
                                
                                // ⚡ বডি সাথে সাথে পার্স করে শিওর হচ্ছি সিটটা পেলাম কি না
                                const reserveData = await reserveRes.json();
                                
                                if (reserveData.error) {
                                    // 🛑 THE ERROR GUARD: যদি সার্ভার বলে ফেলে যে ৪টার বেশি সিট কাটা যাবে না!
                                    if (JSON.stringify(reserveData.error).includes("Maximum 4 seats")) {
                                        console.log(`[DEBUG] 🛑 Backend says Max 4 seats reached! Halting fire and moving to payment...`);
                                        break; // আর কোনো রিকোয়েস্ট পাঠাবে না, লুপ ভেঙে সোজা পেমেন্টে চলে যাবে!
                                    }
                                    
                                    console.log(`[DEBUG] ⚔️ Seat ${targetSeats[i].name} hijacked or failed! Moving on...`);
                                    continue; 
                                } else {
                                    successfullyReserved.push(targetSeats[i]);
                                    if (!firstSeatLockTime) firstSeatLockTime = Date.now();
                                    console.log(`[DEBUG] 🎯 Locked: ${targetSeats[i].name}. Total: ${successfullyReserved.length}/${cfg.seats}`);
                                }
                            } catch (e) {
                                if (e.name === 'AbortError') {
                                    console.log(`[DEBUG] ⚠️ Booking hung for > 2.5s on ${targetSeats[i].name}! Aborting and rushing to next seat...`);
                                } else {
                                    console.log(`[DEBUG] ⚠️ Network error on ${targetSeats[i].name}! Moving on...`);
                                }
                                continue; 
                            }
                        }

                        // 🚀 ফায়ারিং শেষ! এবার ব্যাকগ্রাউন্ডে পার্স হওয়া JSON গুলোর রেজাল্ট একসাথে চেক করব
                        let bookingResults = await Promise.all(jsonParsingTasks);
                        for (let res of bookingResults) {
                            if (!res.data.error) {
                                successfullyReserved.push(res.seat);
                                if (!firstSeatLockTime) firstSeatLockTime = Date.now();
                                console.log(`[DEBUG] 🎯 Locked: ${res.seat.name}. Total: ${successfullyReserved.length}/${cfg.seats}`);
                            } else {
                                console.log(`[DEBUG] ⚔️ Seat ${res.seat.name} hijacked!`);
                            }
                        }

                        // লুপ শেষ হওয়ার পর যদি কাঙ্ক্ষিত সিট না পাই:
                        if (successfullyReserved.length < cfg.seats) { 
                            
                            // 🟡 সিনারিও ১: যদি হাতে কিছু সিট থাকে (যেমন ২টা পেয়েছে কিন্তু ৪টা দরকার)
                            if (successfullyReserved.length > 0) {
                                if (!partialRetryDone) {
                                    console.log(`[DEBUG] 🚨 Got ${successfullyReserved.length}/${cfg.seats} seat(s)! Tactical Sleep for 60s for ONE FINAL TRY...`);
                                    partialRetryDone = true; // মার্ক করে রাখলাম যে একবার সুযোগ দেওয়া হয়েছে
                                    
                                    await delay(60000); // ৬০ সেকেন্ড ঘুম

                                    // 🚀 THE FIX: ঘুম থেকে উঠে স্মার্ট পোলিং দিয়ে টোকেন ফ্রেশ করে নিচ্ছি
                                    let sleepExpiredToken1 = cftToken;
                                    if (window.turnstile) { window.turnstile.reset(); }
                                    
                                    for(let w = 0; w < 10; w++) {
                                        await delay(1000); 
                                        let checkToken = document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "";
                                        if (checkToken && checkToken !== sleepExpiredToken1) {
                                            cftToken = checkToken;
                                            window.localStorage.setItem('cf-turnstile-response', cftToken);
                                            break;
                                        }
                                    }

                                    console.log(`[DEBUG] 🔋 Woke up! Final Burst Mode Activated!`);
                                    continue; // আবার নতুন করে ম্যাপ এনে বাকি সিটগুলো খুঁজবে
                                } else {
                                    // যদি অলরেডি একবার ঘুমিয়ে ট্রাই করে থাকে, তবে আর রিস্ক নেবে না!
                                    console.log(`[DEBUG] 🚨 Final try failed. Rushing to payment with ${successfullyReserved.length} seat(s)!`);
                                    break; // লুপ ভেঙে সোজা OTP/Payment এ চলে যাবে!
                                }
                            }
                            
                            // 🔴 সিনারিও ২: যদি শূন্য (০) সিট থাকে (পুরো ট্রেনের কেউ কিছু পায়নি)
                            console.log(`[DEBUG] 🛑 Burst exhausted (0 seats)! Tactical Sleep for 60 seconds to reset Server Rate Limit...`);

                            await delay(60000); // ⏳ ৬০ সেকেন্ডের ডিপ স্লিপ!

                            // 🚀 THE FIX: ঘুম থেকে উঠে স্মার্ট পোলিং দিয়ে টোকেন ফ্রেশ করে নিচ্ছি
                            let sleepExpiredToken2 = cftToken;
                            if (window.turnstile) { window.turnstile.reset(); }
                            
                            for(let w = 0; w < 10; w++) {
                                await delay(1000);
                                let checkToken = document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "";
                                if (checkToken && checkToken !== sleepExpiredToken2) {
                                    cftToken = checkToken;
                                    window.localStorage.setItem('cf-turnstile-response', cftToken);
                                    break;
                                }
                            }
                            
                            console.log(`[DEBUG] 🔋 Woke up! Fresh Token Grabbed. Ready for next Burst!`);
                            continue; // আবার নতুন করে লেআউট আনতে যাবে
                        }

                    } catch (error) {
                        // 🚀 THE MAGIC RETRY: যদি ৩.৫ সেকেন্ড পার হওয়ার কারণে রিকোয়েস্ট কিল হয়
                        if (error.name === 'AbortError') {
                            console.log(`[DEBUG] ⚠️ Server hung for > 3.5s while fetching Map! Aborting and Re-firing instantly...`);
                            continue; // ⚡ কোনো ওয়েট না করে ডাইরেক্ট আবার ফায়ার!
                        }

                        console.log(`[DEBUG] Network blip, surviving...`);
                        await delay(3000);
                    }
                }
                
                // --- PHASE D: TRIGGER OTP SMS ---
                console.log("[DEBUG] Triggering OTP SMS...");

                // ⚠️ Uncommented this to actually trigger the SMS to user's phone
                const otpRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/passenger-details", {
                    method: "POST", headers: apiHeaders, cache: "no-store",
                    body: JSON.stringify({ "ticket_ids": successfullyReserved.map(s => parseInt(s.id)), "trip_id": DYNAMIC_TRIP_ID.toString(), "trip_route_id": DYNAMIC_ROUTE_ID.toString() })
                });
                const otpATK = otpRes.headers.get('x-action-token');
                if (otpATK) window.sessionStorage.setItem('atk', otpATK);

                return { 
                    success: true, 
                    seats: successfullyReserved,
                    dynamicTripId: DYNAMIC_TRIP_ID,
                    dynamicRouteId: DYNAMIC_ROUTE_ID,
                    dynamicBoardingId: DYNAMIC_BOARDING_ID
                };

            } catch (error) { return { success: false, message: error.message }; }
        }, config);

        if (!bookingResult.success) {
            sendLog(`<span style='color:red;'>❌ FAILED: ${bookingResult.message}</span>`);
            browser.disconnect(); return;
        }

        sendLog(`<span style='color:#00e676;'>✅ BOOM! Locked Seats: [${bookingResult.seats.map(s => s.name).join(', ')}]</span>`);
        
        // ==========================================
        // 🛑 THE OTP BRIDGE: Waiting for UI Input
        // ==========================================
        sendLog(`<span style='color:#ff9800; font-weight:bold;'>📲 SMS Sent! Waiting for OTP... Please enter OTP in the UI.</span>`);
        
        // This stops the execution and waits for the UI to send the OTP back via IPC
        const userOtp = await requestOtp();
        
        sendLog(`🔑 OTP [${userOtp}] received! Processing Final Gateway...`);

        if (abortSignal.aborted) { browser.disconnect(); return; }

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
                    method: "POST", headers: apiHeaders, cache: "no-store",
                    body: JSON.stringify({ "trip_id": parseInt(tripId), "trip_route_id": parseInt(routeId), "ticket_ids": ticketIds, "otp": otpCode.toString() })
                });

                const verifyATK = verifyRes.headers.get('x-action-token');
                if (verifyATK) { actionToken = verifyATK; apiHeaders["x-action-token"] = verifyATK; }

                const verifyData = await verifyRes.json();
                if (verifyData.error) return { success: false, message: "OTP Error: " + JSON.stringify(verifyData.error) };
                
                const userData = verifyData?.data?.user;
                if (!userData) return { success: false, message: "Could not fetch User Data." };

                // --- PHASE F: THE FINAL CONFIRM API ---
                const namesArray = Array(ticketIds.length).fill(userData.name);
                const genderArray = Array(ticketIds.length).fill("male");
                const typeArray = Array(ticketIds.length).fill("Adult");

                const confirmPayload = {
                    "is_bkash_online": true,
                    "boarding_point_id": parseInt(boardingId),
                    "contactperson": 0,
                    "date_of_journey": cfg.doj,
                    "from_city": cfg.origin,
                    "to_city": cfg.dest,
                    "gender": genderArray,
                    "passengerType": typeArray,
                    "pemail": userData.email,
                    "pmobile": userData.mobile,
                    "pname": namesArray,
                    "seat_class": cfg.seatClass,
                    "selected_mobile_transaction": 1, // 1 = bKash
                    "ticket_ids": ticketIds,
                    "trip_id": parseInt(tripId),
                    "trip_route_id": parseInt(routeId),
                    "otp": otpCode.toString(),
                    "ip_address": "127.0.0.1",
                    "isshohoz": 0
                };

                const confirmRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/confirm", {
                    method: "PATCH", headers: apiHeaders, cache: "no-store",
                    body: JSON.stringify(confirmPayload)
                });

                const confirmData = await confirmRes.json();
                if (confirmData.error) return { success: false, message: "Confirm Error: " + JSON.stringify(confirmData.error) };

                const finalPaymentUrl = confirmData?.data?.redirectUrl;
                if (!finalPaymentUrl) return { success: false, message: "Failed to get Redirect URL." };

                return { success: true, paymentUrl: finalPaymentUrl };

            } catch (error) { return { success: false, message: error.message }; }
        }, config, userOtp, bookingResult.seats.map(s => parseInt(s.id)), bookingResult.dynamicTripId, bookingResult.dynamicRouteId, bookingResult.dynamicBoardingId);

        if (finalGatewayResult.success && finalGatewayResult.paymentUrl) {
            sendLog(`<span style='color:#00e676; font-weight:bold;'>✅ BINGO! PNR GENERATED SUCCESSFULLY!</span>`);
            sendLog(`🚀 Teleporting you directly to bKash Gateway...`);
            
            await activeTab.goto(finalGatewayResult.paymentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            sendLog(`<span style='color:#03dac6;'>🎯 TASK COMPLETE! Check Chrome to make payment.</span>`);
        } else {
            sendLog(`<span style='color:red;'>❌ GATEWAY FAILED: ${finalGatewayResult.message}</span>`);
        }

    } catch (err) {
        sendLog(`<span style='color:red;'>❌ Connection Error: ${err.message}</span>`);
    } finally {
        if (browser) browser.disconnect();
    }
}