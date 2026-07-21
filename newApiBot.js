const puppeteer = require('puppeteer');

// ==========================================
// 🚀 Node.js Native Variables (No Browser Needed Here)
// ==========================================
let actionToken = "";
let cftToken = "";
let apiHeaders = {};

const delay = ms => new Promise(res => setTimeout(res, ms));

module.exports = async function runApiBot(config, sendLog, abortSignal, requestOtp) {
    sendLog(`🔌 Connecting to Chrome on Port ${config.port}...`);
    let browser;

    try {
        // ১. ব্রাউজারের সাথে কানেক্ট করা
        browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${config.port}`, defaultViewport: null, protocolTimeout: 0 });
        const pages = await browser.pages();
        let activeTab = pages.find(page => page.url().includes('railway.gov.bd') || page.url().includes('shohoz.com'));

        if (!activeTab) {
            sendLog("<span style='color:red;'>❌ ERROR: No Shohoz Tab found! Please open the site first.</span>");
            browser.disconnect();
            return;
        }

        await activeTab.bringToFront();
        sendLog(`🚀 Locked onto Tab! Preparing Node.js Engine for ${config.seats} seat(s)...`);

        // ==========================================
        // 🕵️‍♂️ STEP 1: THE EXTRACTION (Stealing Tokens from Browser)
        // ==========================================
        const extractedData = await activeTab.evaluate(() => {
            return {
                rawToken: window.localStorage.getItem('token'),
                deviceId: window.localStorage.getItem('uudid'),
                deviceKey: window.localStorage.getItem('ssdk'),
                initAtk: window.sessionStorage.getItem('atk') || "",
                initCft: document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || ""
            };
        });

        if (!extractedData.rawToken || !extractedData.initCft) {
            sendLog("<span style='color:red;'>❌ ERROR: Missing Token or Cloudflare Response. Are you logged in?</span>");
            browser.disconnect();
            return;
        }

        // ==========================================
        // ⚙️ STEP 2: IGNITING THE NODE.JS ENGINE
        // ==========================================
        const liveToken = extractedData.rawToken.startsWith("Bearer") ? extractedData.rawToken : "Bearer " + extractedData.rawToken;
        actionToken = extractedData.initAtk;
        cftToken = extractedData.initCft;

        apiHeaders = {
            "Authorization": liveToken, 
            "Content-Type": "application/json", 
            "Referer": "https://eticket.railway.gov.bd/",
            "x-device-id": extractedData.deviceId, 
            "x-device-key": extractedData.deviceKey, 
            "x-requested-with": "XMLHttpRequest"
        };
        if (actionToken) apiHeaders["x-action-token"] = actionToken;

        // The Ninja Kill Switch for loop control
        const currentRunId = Date.now();
        let isRunActive = true; 
        
        // Listen for abort signal from UI
        abortSignal.addEventListener('abort', () => { isRunActive = false; });

        // ==========================================
        // 🕵️‍♂️ PHASE 0: PRE-8 AM INFINITE SEARCH LOOP (Direct Node.js Fetch)
        // ==========================================
        sendLog(`[DEBUG] 🕒 Pre-Release Mode: Waiting for ${config.doj} tickets to drop...`);
        let DYNAMIC_TRIP_ID = null;
        let DYNAMIC_ROUTE_ID = null;
        let DYNAMIC_BOARDING_ID = null;
        let searchAttempt = 0;

        while (isRunActive) {
            searchAttempt++;
            if (searchAttempt % 10 === 0) sendLog(`[DEBUG] 🔄 Scanning Server... Attempt: ${searchAttempt}`);

            try {
                const searchUrl = `https://railspaapi.shohoz.com/v1.0/web/bookings/search-trips-v2?from_city=${config.origin}&to_city=${config.dest}&date_of_journey=${config.doj}&seat_class=${config.seatClass}`;
                
                // ⚡ RAW NODE.JS FETCH (Super Fast)
                const searchRes = await fetch(searchUrl, { headers: apiHeaders, cache: "no-store" });
                
                // ⚡ Token Update
                const searchATK = searchRes.headers.get('x-action-token');
                if (searchATK) { actionToken = searchATK; apiHeaders["x-action-token"] = searchATK; }
                
                const searchData = await searchRes.json();

                if (!searchData.error && searchData?.data?.trains) {
                    const targetTrain = searchData.data.trains.find(t => t.trip_number === config.trainName);
                    if (targetTrain) {
                        const targetSeatType = targetTrain.seat_types.find(st => st.type === config.seatClass);
                        if (targetSeatType) {
                            DYNAMIC_TRIP_ID = targetSeatType.trip_id;
                            DYNAMIC_ROUTE_ID = targetSeatType.trip_route_id;
                            DYNAMIC_BOARDING_ID = targetTrain.boarding_points[0].trip_point_id;
                            
                            sendLog(`[DEBUG] 🎉 TICKETS RELEASED! Moving to attack mode!`);
                            // Update CFT from browser just in case
                            cftToken = await activeTab.evaluate(() => document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "");
                            break;
                        }
                    }
                }
            } catch (error) { /* Silent Ignore */ }
            await delay(7500); 
        }

        if (!isRunActive) return;

        // ==========================================
        // ⏳ PHASE 0.5: THE HYBRID STRIKE CONTROLLER
        // ==========================================
        if (config.useSchedule) {
            let targetDate = new Date();
            targetDate.setHours(config.targetHour || 8, config.targetMinute || 0, config.targetSecond || 0, 0);
            let targetTimeMs = targetDate.getTime();
            let nowMsCheck = Date.now();

            if (targetTimeMs < nowMsCheck) {
                if (Math.floor((nowMsCheck - targetTimeMs) / 60000) < 30) {
                    sendLog(`[DEBUG] ⚠️ LATE START DETECTED! Bypassing Timer...`);
                } else {
                    targetDate.setDate(targetDate.getDate() + 1);
                    targetTimeMs = targetDate.getTime();
                }
            }

            sendLog(`[DEBUG] ⏳ SCHEDULED MODE: Waiting for Target Time...`);
            let lastLogSecond = -1;

            while (isRunActive) {
                let nowMs = Date.now(); 
                let timeDiff = targetTimeMs - nowMs;

                if (timeDiff <= 0) {
                    // Update CFT right before strike
                    cftToken = await activeTab.evaluate(() => document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "");
                    sendLog(`[DEBUG] 🚀 BINGO! TIME IS UP! UNLEASHING NODE.JS ENGINE!`);
                    break; 
                }

                if (timeDiff <= 60000) {
                    let secondsLeft = Math.ceil(timeDiff / 1000); 
                    if (secondsLeft !== lastLogSecond) {
                        sendLog(`[DEBUG] ⚡ T-Minus ${secondsLeft} seconds to Attack!`);
                        if (secondsLeft === 8) {
                            sendLog(`[DEBUG] 🔄 PRE-WARMING CFT Token via Browser...`);
                            await activeTab.evaluate(() => { if (window.turnstile) window.turnstile.reset(); });
                        }
                        lastLogSecond = secondsLeft;
                    }
                    await delay(50); 
                    continue; 
                }
                await delay(1000); 
            }
        } else {
            sendLog(`[DEBUG] ⚡ INSTANT STRIKE MODE ACTIVATED!`);
            cftToken = await activeTab.evaluate(() => document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "");
        }

        if (!isRunActive) return;

        // ==========================================
        // 👻 PHASE B & C: THE RAW NODE.JS BOOKING LOOP
        // ==========================================
        let successfullyReserved = [];
        let firstSeatLockTime = null;
        let attemptCount = 0;
        const MAX_WAIT_TIME = 90000;
        let partialRetryDone = false;

        while (successfullyReserved.length < config.seats && isRunActive) {
            attemptCount++;
            if (attemptCount % 5 === 0 && successfullyReserved.length === 0) sendLog(`[DEBUG] 🔄 Ghost scanning... Attempt: ${attemptCount}`);

            if (successfullyReserved.length > 0 && (Date.now() - firstSeatLockTime) >= MAX_WAIT_TIME) {
                sendLog(`[DEBUG] ⚠️ 90s TIMEOUT REACHED! Moving to payment!`);
                break; 
            }

            try {
                // 🚀 KILL SWITCH FOR MAP FETCH
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500); 

                // ⚡ RAW FETCH: No DOM Overhead!
                const layoutRes = await fetch(`https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${DYNAMIC_TRIP_ID}&trip_route_id=${DYNAMIC_ROUTE_ID}&cft_response=${cftToken}`, { 
                    headers: apiHeaders, cache: "no-store", signal: controller.signal 
                });
                
                clearTimeout(timeoutId); 

                if (layoutRes.status === 401) {
                    sendLog(`[DEBUG] 💀 FATAL: Your Main Login Token Expired!`);
                    browser.disconnect();
                    return;
                }

                const layoutATK = layoutRes.headers.get('x-action-token');
                if (layoutATK) { actionToken = layoutATK; apiHeaders["x-action-token"] = layoutATK; }
                
                const layoutData = await layoutRes.json();

                if (layoutData.error || !layoutData?.data?.seatLayout) {
                    if (layoutData.error && layoutData.error.messages && layoutData.error.messages.errorKey === "TURNSTILE_VERIFICATION_FAILED") {
                        if (successfullyReserved.length > 0) break; // Go to payment
                        
                        sendLog(`[DEBUG] 🔄 CFT Token died! Requesting browser for new token...`);
                        
                        // Ask browser to refresh token
                        await activeTab.evaluate(() => { if (window.turnstile) window.turnstile.reset(); });
                        
                        let isNewTokenGrabbed = false;
                        for(let w = 0; w < 10; w++) {
                            await delay(1000); 
                            // Read fresh token from browser
                            let checkToken = await activeTab.evaluate(() => document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "");
                            if (checkToken && checkToken !== cftToken) {
                                cftToken = checkToken;
                                isNewTokenGrabbed = true;
                                sendLog(`[DEBUG] 🔋 Fresh Token Grabbed!`);
                                break;
                            }
                        }
                        if (!isNewTokenGrabbed) await delay(3000);
                    } else {
                        await delay(7500); 
                    }
                    continue; 
                }

                // --- Parsing Map Data ---
                let exactMatches = []; let coachMatches = []; let anyMatches = [];
                for (let floor of layoutData.data.seatLayout) {
                    for (let row of floor.layout) {
                        for (let seat of row) {
                            if (seat.seat_availability == 1 && seat.ticket_id && seat.seat_number) {
                                if (successfullyReserved.some(resSeat => resSeat.id == seat.ticket_id)) continue;
                                let s = { id: seat.ticket_id, name: seat.seat_number, coach: floor.floor_name };
                                if (config.targets && config.targets.includes(s.name)) exactMatches.push(s); 
                                else if (config.coaches && config.coaches.includes(s.coach)) coachMatches.push(s); 
                                else anyMatches.push(s);
                            }
                        }
                    }
                }

                function applyStrategy(list, strategyId) {
                    if (list.length === 0) return []; 
                    let mid = Math.floor(list.length / 2);
                    let skipCount = list.length >= 14 ? 5 : 0;
                    if (strategyId === 0) return list.slice(mid); 
                    if (strategyId === 1) return list.slice(0, mid).reverse(); 
                    if (strategyId === 2) return list.slice().reverse().slice(skipCount); 
                    if (strategyId === 3) return list.slice(skipCount); 
                    return list;
                }

                let attackVector = config.strategy !== undefined ? parseInt(config.strategy) : config.port % 4; 
                let sortedCoach = applyStrategy(coachMatches, attackVector);
                let sortedAny = applyStrategy(anyMatches, attackVector);

                let targetSeats = [];
                targetSeats.push(...exactMatches); 
                if (targetSeats.length < 9) targetSeats.push(...sortedCoach.slice(0, 9 - targetSeats.length)); 
                if (targetSeats.length < 9) targetSeats.push(...sortedAny.slice(0, 9 - targetSeats.length)); 

                if (targetSeats.length === 0) {
                    await delay(7500); 
                    continue;
                }

                sendLog(`[DEBUG] 🔫 Arsenal loaded: [ ${targetSeats.map(s => s.name).join(', ')} ]`);

                // --- PHASE C: THE FASTEST SEQUENTIAL BOOKING IN NODE.JS ---
                const basePayload = {
                    route_id: DYNAMIC_ROUTE_ID.toString(),
                    cft_response: cftToken,
                    extras: { origin_name: config.origin, destination_name: config.dest, trip_number: config.trainName }
                };
                let requestsFired = 0;

                for (let i = 0; i < targetSeats.length; i++) {
                    if (successfullyReserved.length >= config.seats) break;
                    if (requestsFired >= 9) break;

                    basePayload.ticket_id = targetSeats[i].id.toString();
                    basePayload.action_token = actionToken;
                    basePayload.extras.seat_number = targetSeats[i].name;

                    requestsFired++; 
                    
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 2500); 

                        // ⚡ SUPER FAST NODE.JS FETCH
                        const reserveRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                            method: "PATCH", headers: apiHeaders, cache: "no-store", signal: controller.signal, 
                            body: JSON.stringify(basePayload) 
                        });
                        
                        clearTimeout(timeoutId);
                        
                        const loopATK = reserveRes.headers.get('x-action-token');
                        if (loopATK) { actionToken = loopATK; apiHeaders["x-action-token"] = loopATK; }
                        
                        const reserveData = await reserveRes.json();
                        
                        if (reserveData.error) {
                            if (JSON.stringify(reserveData.error).includes("Maximum 4 seats")) {
                                sendLog(`[DEBUG] 🛑 Backend says Max 4 seats reached! Moving to payment...`);
                                break; 
                            }
                            sendLog(`[DEBUG] ⚔️ Seat ${targetSeats[i].name} hijacked!`);
                            continue; 
                        } else {
                            successfullyReserved.push(targetSeats[i]);
                            if (!firstSeatLockTime) firstSeatLockTime = Date.now();
                            sendLog(`[DEBUG] 🎯 Locked: ${targetSeats[i].name}. Total: ${successfullyReserved.length}/${config.seats}`);
                        }
                    } catch (e) {
                        if (e.name === 'AbortError') sendLog(`[DEBUG] ⚠️ Booking hung for > 2.5s on ${targetSeats[i].name}! Aborting...`);
                        continue; 
                    }
                }

                // If seats are missing, handle sleep/retry logic
                if (successfullyReserved.length < config.seats) { 
                    if (successfullyReserved.length > 0) {
                        if (!partialRetryDone) {
                            sendLog(`[DEBUG] 🚨 Got ${successfullyReserved.length}/${config.seats}! Tactical Sleep 60s...`);
                            partialRetryDone = true; 
                            await delay(60000); 
                            
                            // Refresh Token via Browser
                            await activeTab.evaluate(() => { if (window.turnstile) window.turnstile.reset(); });
                            for(let w = 0; w < 10; w++) {
                                await delay(1000); 
                                let checkToken = await activeTab.evaluate(() => document.querySelector('[name="cf-turnstile-response"]')?.value || "");
                                if (checkToken && checkToken !== cftToken) { cftToken = checkToken; break; }
                            }
                            continue; 
                        } else {
                            break; // Force proceed to payment
                        }
                    }
                    
                    sendLog(`[DEBUG] 🛑 Burst exhausted (0 seats)! Tactical Sleep 60s...`);
                    await delay(60000); 
                    
                    // Refresh Token via Browser
                    await activeTab.evaluate(() => { if (window.turnstile) window.turnstile.reset(); });
                    for(let w = 0; w < 10; w++) {
                        await delay(1000);
                        let checkToken = await activeTab.evaluate(() => document.querySelector('[name="cf-turnstile-response"]')?.value || "");
                        if (checkToken && checkToken !== cftToken) { cftToken = checkToken; break; }
                    }
                    continue; 
                }

            } catch (error) {
                if (error.name === 'AbortError') {
                    sendLog(`[DEBUG] ⚠️ Server hung > 3.5s fetching Map! Re-firing...`);
                    continue; 
                }
                await delay(3000);
            }
        }

        if (!isRunActive || successfullyReserved.length === 0) {
            sendLog("<span style='color:red;'>❌ Operation Stopped or No seats grabbed!</span>");
            browser.disconnect(); return;
        }

        sendLog(`<span style='color:#00e676;'>✅ BOOM! Locked Seats: [${successfullyReserved.map(s => s.name).join(', ')}]</span>`);
        
        // ==========================================
        // 🛑 THE OTP BRIDGE: TRIGGER OTP SMS (Node.js Fetch)
        // ==========================================
        sendLog("[DEBUG] Triggering OTP SMS...");
        const otpRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/passenger-details", {
            method: "POST", headers: apiHeaders, cache: "no-store",
            body: JSON.stringify({ "ticket_ids": successfullyReserved.map(s => parseInt(s.id)), "trip_id": DYNAMIC_TRIP_ID, "trip_route_id": DYNAMIC_ROUTE_ID })
        });
        const otpATK = otpRes.headers.get('x-action-token');
        if (otpATK) { actionToken = otpATK; apiHeaders["x-action-token"] = actionToken; }
        
        // Save back to browser sessionStorage so it doesn't log you out later
        await activeTab.evaluate((atk) => window.sessionStorage.setItem('atk', atk), actionToken);

        sendLog(`<span style='color:#ff9800; font-weight:bold;'>📲 SMS Sent! Please enter OTP in the UI.</span>`);
        const userOtp = await requestOtp();
        
        if (!isRunActive) { browser.disconnect(); return; }
        sendLog(`🔑 OTP [${userOtp}] received! Processing Final Gateway...`);

        // ==========================================
        // PHASE E & F: VERIFY + CONFIRM + GET LINK (Node.js Fetch)
        // ==========================================
        try {
            // VERIFY
            const verifyRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/verify-otp", {
                method: "POST", headers: apiHeaders, cache: "no-store",
                body: JSON.stringify({ "trip_id": DYNAMIC_TRIP_ID, "trip_route_id": DYNAMIC_ROUTE_ID, "ticket_ids": successfullyReserved.map(s => parseInt(s.id)), "otp": userOtp.toString() })
            });

            const verifyATK = verifyRes.headers.get('x-action-token');
            if (verifyATK) { actionToken = verifyATK; apiHeaders["x-action-token"] = actionToken; }

            const verifyData = await verifyRes.json();
            if (verifyData.error) throw new Error("OTP Error: " + JSON.stringify(verifyData.error));
            const userData = verifyData?.data?.user;
            if (!userData) throw new Error("Could not fetch User Data.");

            // CONFIRM
            const ticketIds = successfullyReserved.map(s => parseInt(s.id));
            const confirmPayload = {
                "is_bkash_online": true, "boarding_point_id": DYNAMIC_BOARDING_ID, "contactperson": 0,
                "date_of_journey": config.doj, "from_city": config.origin, "to_city": config.dest,
                "gender": Array(ticketIds.length).fill("male"), "passengerType": Array(ticketIds.length).fill("Adult"),
                "pemail": userData.email, "pmobile": userData.mobile, "pname": Array(ticketIds.length).fill(userData.name),
                "seat_class": config.seatClass, "selected_mobile_transaction": 1, 
                "ticket_ids": ticketIds, "trip_id": DYNAMIC_TRIP_ID, "trip_route_id": DYNAMIC_ROUTE_ID,
                "otp": userOtp.toString(), "ip_address": "127.0.0.1", "isshohoz": 0
            };

            const confirmRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/confirm", {
                method: "PATCH", headers: apiHeaders, cache: "no-store", body: JSON.stringify(confirmPayload)
            });

            const confirmData = await confirmRes.json();
            if (confirmData.error) throw new Error("Confirm Error: " + JSON.stringify(confirmData.error));

            const finalPaymentUrl = confirmData?.data?.redirectUrl;
            if (!finalPaymentUrl) throw new Error("Failed to get Redirect URL.");

            // ==========================================
            // 🎬 FINALE: TELEPORTING BROWSER TO BONGOBONDHU
            // ==========================================
            sendLog(`<span style='color:#00e676; font-weight:bold;'>✅ BINGO! PNR GENERATED SUCCESSFULLY!</span>`);
            sendLog(`🚀 Teleporting your Chrome Browser directly to Gateway...`);
            
            await activeTab.goto(finalPaymentUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            sendLog(`<span style='color:#03dac6;'>🎯 TASK COMPLETE! Check Chrome to make payment.</span>`);

        } catch (error) {
            sendLog(`<span style='color:red;'>❌ GATEWAY FAILED: ${error.message}</span>`);
        }

    } catch (err) {
        sendLog(`<span style='color:red;'>❌ Connection Error: ${err.message}</span>`);
    } finally {
        if (browser) browser.disconnect();
    }
}