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
        sendLog(`🚀 Locked onto Tab! Executing Continuous Sequence for ${config.seats} seat(s)...`);

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

                // 🚀 NEW: JWT Token ডিকোড করে সাইলেন্টলি ইউজারের ফোন নাম্বার বের করা
let phoneNumber = "Unknown Number";
try {
    const payload = JSON.parse(atob(rawToken.split('.')[1]));
    phoneNumber = payload.mobile || payload.phone || payload.username || "Unknown Number";
} catch(e) {}

                const delay = ms => new Promise(res => setTimeout(res, ms));

                // ==========================================
                // 🕵️‍♂️ PHASE 0: PRE-RELEASE INFINITE SEARCH LOOP
                // ==========================================
                console.log(`[DEBUG] 🕒 Scanning Mode: Waiting for ${cfg.doj} tickets to be found...`);
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
                                    
                                    console.log(`[DEBUG] 🎉 TRAIN FOUND! IDs Grabbed! Moving directly to attack mode!`);
                                    cftToken = window.localStorage.getItem('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || cftToken;
                                    break;
                                }
                            }
                        }
                    } catch (error) { /* Silent Ignore */ }
                    await delay(3000); 
                }

                // ==========================================
                // ⚡ CONTINUOUS STRIKE MODE
                // ==========================================
                console.log(`[DEBUG] ⚡ CONTINUOUS STRIKE MODE ACTIVATED! Attacking immediately!`);

                let successfullyReserved = [];
                let firstSeatLockTime = null; 

                // ==========================================
                // 👻 PHASE B: MASSIVE POOL NINJA SCANNER
                // ==========================================
                let attemptCount = 0;
                const MAX_WAIT_TIME = 30000; // 30s limit for partial tickets

                while (successfullyReserved.length < cfg.seats) {
                    if (window.__SNIPER_RUN_ID !== currentRunId) return { success: false, message: "Old loop killed by Ninja Switch!" };

                    attemptCount++;
                    let seatsNeeded = cfg.seats - successfullyReserved.length;
                    
                    if (attemptCount % 5 === 0 && successfullyReserved.length === 0) {
                        console.log(`[DEBUG] 🔄 Continuous Scanning... Attempt: ${attemptCount} | Need ${seatsNeeded} seat(s).`);
                    }

                    // 🛑 Top-level 30s Guardian
                    if (successfullyReserved.length > 0) {
                        let elapsedTime = Date.now() - firstSeatLockTime;
                        if (elapsedTime >= MAX_WAIT_TIME) {
                            console.log(`[DEBUG] ⚠️ 30s TIMEOUT REACHED! Moving to payment with ${successfullyReserved.length} seat(s)!`);
                            break; 
                        }
                    }

                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 3500); 

                        const layoutRes = await fetch(`https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${DYNAMIC_TRIP_ID}&trip_route_id=${DYNAMIC_ROUTE_ID}&cft_response=${cftToken}`, { 
                            headers: apiHeaders, 
                            cache: "no-store",
                            signal: controller.signal 
                        });
                        
                        clearTimeout(timeoutId); 

                        // 🛑 THE 401 GUARD
                        if (layoutRes.status === 401) {
                            console.log(`[DEBUG] 💀 FATAL: Your Main Login Token (Bearer) Expired!`);
                            return { success: false, message: "⚠️ 401 Unauthorized! Please reload the Shohoz tab, login again, and restart the bot!" };
                        }

                        const layoutATK = layoutRes.headers.get('x-action-token');
                        if (layoutATK) { actionToken = layoutATK; apiHeaders["x-action-token"] = layoutATK; window.sessionStorage.setItem('atk', layoutATK); }
                        
                        const layoutData = await layoutRes.json();

                        if (layoutData.error || !layoutData?.data?.seatLayout) {
                            console.log(`[DEBUG] ⚠️ Layout Fetch Failed. Server Response: ${JSON.stringify(layoutData)}`);

                            if (layoutData.error && layoutData.error.messages && layoutData.error.messages.errorKey === "TURNSTILE_VERIFICATION_FAILED") {
    
                                if (successfullyReserved.length > 0) {
                                    console.log(`[DEBUG] 🚨 Token died, but we have ${successfullyReserved.length} seat(s) safely locked! Rushing to payment...`);
                                    break; 
                                }
                            
                                console.log(`[DEBUG] 🔄 Token died naturally! Forcing Cloudflare to generate a NEW token...`);
                                
                                let expiredToken = cftToken; 
                                if (window.turnstile) { window.turnstile.reset(); }
                                
                                let isNewTokenGrabbed = false;
                                for(let w = 0; w < 10; w++) {
                                    await delay(1000); 
                                    let checkToken = document.querySelector('[name="cf-turnstile-response"]')?.value || window.localStorage.getItem('cf-turnstile-response') || "";
                                    
                                    if (checkToken && checkToken !== expiredToken) {
                                        cftToken = checkToken;
                                        window.localStorage.setItem('cf-turnstile-response', cftToken);
                                        console.log(`[DEBUG] 🔋 Fresh Token Grabbed in ${w + 1} seconds! Resuming attack!`);
                                        isNewTokenGrabbed = true;
                                        break; 
                                    }
                                }

                                if (!isNewTokenGrabbed) {
                                    console.log(`[DEBUG] ❌ Cloudflare is stuck! Retrying in next loop...`);
                                    await delay(2000);
                                }
                            } else {
                                await delay(3000); 
                            }
                            continue; 
                        }

                        // ==========================================
                        // 👻 PHASE B: MASSIVE POOL SEAT EXTRACTION
                        // ==========================================
                        let exactMatches = [];
                        let coachMatches = [];
                        let anyMatches = [];

                        for (let floor of layoutData.data.seatLayout) {
                            for (let row of floor.layout) {
                                for (let seat of row) {
                                    if (seat.seat_availability == 1 && seat.ticket_id && seat.seat_number) {
                                        if (successfullyReserved.some(resSeat => resSeat.id == seat.ticket_id)) continue;

                                        let s = { id: seat.ticket_id, name: seat.seat_number, coach: floor.floor_name };

                                        if (cfg.targets && cfg.targets.includes(s.name)) { exactMatches.push(s); } 
                                        else if (cfg.coaches && cfg.coaches.includes(s.coach)) { coachMatches.push(s); } 
                                        else { anyMatches.push(s); }
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

                        let attackVector = cfg.strategy !== undefined ? parseInt(cfg.strategy) : cfg.port % 4; 
                        let sortedCoach = applyStrategy(coachMatches, attackVector);
                        let sortedAny = applyStrategy(anyMatches, attackVector);

                        // 🚀 THE FIX: MASSIVE TARGET POOL (No 9-seat limit)
                        let targetSeats = [];
                        targetSeats.push(...exactMatches); // Priority 1: Exact Matches
                        targetSeats.push(...sortedCoach);  // Priority 2: ALL available coach seats
                        targetSeats.push(...sortedAny);    // Priority 3: ALL other train seats

                        if (targetSeats.length === 0) {
                            console.log(`[DEBUG] ⚠️ No valid seats found. Scanning continuously...`);
                            await delay(1000); 
                            continue;
                        }

                        // টার্মিনাল যেন হ্যাং না করে তাই লগ দেখানোর জন্য প্রথম ১৫টা সিট প্রিন্ট করছি
                        let displayLog = targetSeats.slice(0, 15).map(s => s.name).join(', ') + (targetSeats.length > 15 ? ` ...(+${targetSeats.length - 15} more)` : '');
                        console.log(`[DEBUG] 🔫 Massive Arsenal loaded with ${targetSeats.length} bullet(s) (Firing up to 50)! Pool: [ ${displayLog} ]`);

                        // --- PHASE C: RESERVE (SAFE SEQUENTIAL WITH 2.5s KILL-SWITCH) ---
                        const basePayload = {
                            route_id: DYNAMIC_ROUTE_ID.toString(),
                            cft_response: cftToken,
                            extras: { origin_name: cfg.origin, destination_name: cfg.dest, trip_number: cfg.trainName }
                        };
                        let requestsFired = 0;
                        const MAX_REQUESTS_PER_MAP = 50; // 🚀 ফায়ারিং লিমিট ৯ থেকে বাড়িয়ে ৫০ করা হলো!
                        
                        for (let i = 0; i < targetSeats.length; i++) {
                            // ব্রেক লজিক: ৪টা সিট পেয়ে গেলে অথবা ৫০ বার ফায়ার করা হয়ে গেলে লুপ ব্রেক করবে
                            if (successfullyReserved.length >= cfg.seats) break;
                            if (requestsFired >= MAX_REQUESTS_PER_MAP) {
                                console.log(`[DEBUG] 🔄 Fired 50 bullets! Reloading map to get fresh data...`);
                                break;
                            }
                        
                            basePayload.ticket_id = targetSeats[i].id.toString();
                            basePayload.action_token = actionToken;
                            basePayload.extras.seat_number = targetSeats[i].name;
                        
                            requestsFired++; 
                            
                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 2500); 
                            
                                const reserveRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                                    method: "PATCH", headers: apiHeaders, 
                                    cache: "no-store",  
                                    signal: controller.signal, 
                                    body: JSON.stringify(basePayload) 
                                });
                                
                                clearTimeout(timeoutId); 
                                
                                const loopATK = reserveRes.headers.get('x-action-token');
                                if (loopATK) { actionToken = loopATK; apiHeaders["x-action-token"] = loopATK; window.sessionStorage.setItem('atk', loopATK); }
                                
                                const reserveData = await reserveRes.json();
                                
                                if (reserveData.error) {
                                    if (JSON.stringify(reserveData.error).includes("Maximum 4 seats")) {
                                        console.log(`[DEBUG] 🛑 Backend says Max 4 seats reached! Halting fire and moving to payment...`);
                                        break; 
                                    }
                                    console.log(`[DEBUG] ⚔️ Seat ${targetSeats[i].name} hijacked or failed! Loading next bullet instantly...`);
                                    continue; 
                                } else {
                                    successfullyReserved.push(targetSeats[i]);
                                    if (!firstSeatLockTime) firstSeatLockTime = Date.now();
                                    console.log(`[DEBUG] 🎯 Locked: ${targetSeats[i].name}. Total: ${successfullyReserved.length}/${cfg.seats}`);
                                }
                            } catch (e) {
                                if (e.name === 'AbortError') {
                                    console.log(`[DEBUG] ⚠️ Booking hung for > 2.5s on ${targetSeats[i].name}! Aborting and loading next bullet...`);
                                } else {
                                    console.log(`[DEBUG] ⚠️ Network error on ${targetSeats[i].name}! Moving on...`);
                                }
                                continue; 
                            }
                        }

                        // 🚀 30-Second Retries for Partial Tickets!
                        if (successfullyReserved.length < cfg.seats) { 
                            if (successfullyReserved.length > 0) {
                                let timeLeft = MAX_WAIT_TIME - (Date.now() - firstSeatLockTime);
                                
                                if (timeLeft > 0) {
                                    console.log(`[DEBUG] 🚨 Got ${successfullyReserved.length}/${cfg.seats} seat(s)! Retrying instantly for remaining... (${Math.ceil(timeLeft/1000)}s left in safe window)`);
                                    await delay(1000); 
                                    continue; 
                                } else {
                                    console.log(`[DEBUG] 🚨 30s safe window exhausted! Rushing to payment with ${successfullyReserved.length} seat(s) to avoid cart expiration!`);
                                    break; 
                                }
                            }
                            
                            console.log(`[DEBUG] 🛑 Burst exhausted (0 seats)! Rescanning instantly...`);
                            await delay(1000);
                            continue; 
                        }

                    } catch (error) {
                        if (error.name === 'AbortError') {
                            console.log(`[DEBUG] ⚠️ Server hung for > 3.5s while fetching Map! Aborting and Re-firing instantly...`);
                            continue; 
                        }
                        console.log(`[DEBUG] Network blip, surviving...`);
                        await delay(3000);
                    }
                }
                
                // --- PHASE D: TRIGGER OTP SMS ---
                console.log("[DEBUG] Triggering OTP SMS...");

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
                    dynamicBoardingId: DYNAMIC_BOARDING_ID,
                    userPhone: phoneNumber // 👈 NEW: ফোন নাম্বার যোগ করা হলো
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
        
        const userOtp = await requestOtp(bookingResult.userPhone);
        
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
                    "selected_mobile_transaction": 1, 
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
            sendLog(`🚀 Teleporting you directly to Gateway...`);
            
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