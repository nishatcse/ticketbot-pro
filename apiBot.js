const puppeteer = require('puppeteer');

// মডিউল হিসেবে এক্সপোর্ট করছি যাতে worker.js একে কল করতে পারে
module.exports = async function runApiBot(config, sendLog, abortSignal, requestOtp) {
    sendLog(`🔌 Connecting to Chrome on Port ${config.port}...`);
    let browser;

    try {
        browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${config.port}`, defaultViewport: null });
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
                        const searchRes = await fetch(searchUrl, { headers: apiHeaders });
                        
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
                                    break;
                                }
                            }
                        }
                    } catch (error) { /* Silent Ignore */ }
                    await delay(3000); 
                }

                // ==========================================
                // 👻 PHASE B: SINGLE-PASS NINJA SCANNER
                // ==========================================
                let successfullyReserved = [];
                let attemptCount = 0;
                let firstSeatLockTime = null; 
                const MAX_WAIT_TIME = 60000; 

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
                            console.log(`[DEBUG] ⚠️ 60s TIMEOUT REACHED! Moving to payment with ${successfullyReserved.length} seat(s)!`);
                            break; 
                        }
                    }

                    try {
                        const layoutRes = await fetch(`https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${DYNAMIC_TRIP_ID}&trip_route_id=${DYNAMIC_ROUTE_ID}&cft_response=${cftToken}`, { headers: apiHeaders });
                        const layoutATK = layoutRes.headers.get('x-action-token');
                        if (layoutATK) { actionToken = layoutATK; apiHeaders["x-action-token"] = layoutATK; window.sessionStorage.setItem('atk', layoutATK); }
                        
                        const layoutData = await layoutRes.json();
                        if (layoutData.error || !layoutData?.data?.seatLayout) {
                            cftToken = window.localStorage.getItem('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || cftToken;
                            await delay(3000); 
                            continue; 
                        }

                        let targetSeats = [];
                        let exactMatches = [];
                        let coachMatches = [];
                        let anyMatches = [];
                        let fastExit = false;
                        let poolSize = seatsNeeded + 6; 

                        for (let floor of layoutData.data.seatLayout) {
                            for (let row of floor.layout) {
                                for (let seat of row) {
                                    if (seat.seat_availability === 1 && seat.ticket_id) {
                                        if (successfullyReserved.some(resSeat => resSeat.id == seat.ticket_id)) continue;

                                        let s = { id: seat.ticket_id, name: seat.seat_number, coach: floor.floor_name };

                                        if (cfg.targets && cfg.targets.includes(s.name)) { exactMatches.push(s); } 
                                        else if (cfg.coaches && cfg.coaches.includes(s.coach)) { coachMatches.push(s); } 
                                        else { anyMatches.push(s); }

                                        let noTargets = (!cfg.targets || cfg.targets.length === 0);
                                        let noCoaches = (!cfg.coaches || cfg.coaches.length === 0);

                                        if (noTargets && noCoaches && anyMatches.length >= poolSize) { fastExit = true; break; }
                                        if (noTargets && !noCoaches && coachMatches.length >= poolSize) { fastExit = true; break; }
                                        if (!noTargets) {
                                            let gotAllTargets = (exactMatches.length === cfg.targets.length || exactMatches.length >= seatsNeeded);
                                            if (gotAllTargets) {
                                                if (!noCoaches && (exactMatches.length + coachMatches.length >= poolSize)) { fastExit = true; break; }
                                                if (noCoaches && (exactMatches.length + anyMatches.length >= poolSize)) { fastExit = true; break; }
                                            }
                                        }
                                    }
                                }
                                if (fastExit) break;
                            }
                            if (fastExit) break;
                        }

                        const shuffle = (array) => array.sort(() => Math.random() - 0.5);

                        targetSeats.push(...exactMatches); 
                        if (targetSeats.length < poolSize) { targetSeats.push(...shuffle(coachMatches).slice(0, poolSize - targetSeats.length)); }
                        if (targetSeats.length < poolSize) { targetSeats.push(...shuffle(anyMatches).slice(0, poolSize - targetSeats.length)); }

                        if (targetSeats.length === 0) {
                            await delay(3000); 
                            continue;
                        }

                        // --- PHASE C: RESERVE ---
                        for (let i = 0; i < targetSeats.length; i++) {
                            if (successfullyReserved.length >= cfg.seats) break;

                            const reserveRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                                method: "PATCH", headers: apiHeaders, 
                                body: JSON.stringify({ "ticket_id": targetSeats[i].id.toString(), "route_id": DYNAMIC_ROUTE_ID.toString(), "action_token": actionToken, "cft_response": cftToken, "extras": { "origin_name": cfg.origin, "destination_name": cfg.dest, "seat_number": targetSeats[i].name, "trip_number": cfg.trainName } })
                            });
                            
                            const loopATK = reserveRes.headers.get('x-action-token');
                            if (loopATK) { actionToken = loopATK; apiHeaders["x-action-token"] = loopATK; window.sessionStorage.setItem('atk', loopATK); }
                            
                            const reserveData = await reserveRes.json();
                            
                            if (reserveData.error) {
                                console.log(`[DEBUG] ⚔️ Seat ${targetSeats[i].name} hijacked! Moving on...`);
                                continue; 
                            } else {
                                successfullyReserved.push(targetSeats[i]);
                                if (!firstSeatLockTime) firstSeatLockTime = Date.now();
                                console.log(`[DEBUG] 🎯 Locked: ${targetSeats[i].name}. Total: ${successfullyReserved.length}/${cfg.seats}`);
                            }
                        }

                        if (successfullyReserved.length < cfg.seats) { await delay(3000); }

                    } catch (error) {
                        console.log(`[DEBUG] Network blip, surviving...`);
                        await delay(3000);
                    }
                }
                
                // --- PHASE D: TRIGGER OTP SMS ---
                console.log("[DEBUG] Triggering OTP SMS...");

                // ⚠️ Uncommented this to actually trigger the SMS to user's phone
                const otpRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/passenger-details", {
                    method: "POST", headers: apiHeaders, body: JSON.stringify({ "ticket_ids": successfullyReserved.map(s => parseInt(s.id)), "trip_id": DYNAMIC_TRIP_ID.toString(), "trip_route_id": DYNAMIC_ROUTE_ID.toString() })
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
                    method: "POST", headers: apiHeaders, 
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
                    method: "PATCH", headers: apiHeaders, body: JSON.stringify(confirmPayload)
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