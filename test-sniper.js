const puppeteer = require('puppeteer');

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
    
    // 🎯 কয়টি সিট বুক করতে চান? এখানে সেট করুন (যেমন: 1, 2, 3 বা 4)
    SEAT_COUNT: 2 
};

async function runZeroClickSniper() {
    console.log(`\n[1/3] 🔌 Connecting to Chrome on Port ${CONFIG.PORT}...`);
    let browser;

    try {
        browser = await puppeteer.connect({ 
            browserURL: `http://127.0.0.1:${CONFIG.PORT}`, 
            defaultViewport: null 
        });
        
        const pages = await browser.pages();
        let activeTab = null;

        for (let page of pages) {
            if (page.url().includes('railway.gov.bd') || page.url().includes('shohoz.com')) {
                activeTab = page;
                break;
            }
        }

        if (!activeTab) {
            console.log("\x1b[31m%s\x1b[0m", "❌ ERROR: No Shohoz Tab found!");
            browser.disconnect(); process.exit();
        }

        // 🛠️ BROWSER CONSOLE BRIDGE 
        activeTab.on('console', msg => {
            const text = msg.text();
            if (text.includes('[DEBUG]')) {
                console.log("\x1b[36m%s\x1b[0m", `  🖥️ BROWSER: ${text}`); 
            }
        });

        await activeTab.bringToFront();
        console.log(`[2/3] 🚀 Locked onto Tab: ${activeTab.url()}`);
        console.log(`⚡ Executing Multi-Seat Sequence for ${CONFIG.SEAT_COUNT} seat(s)...`);

        const apiResult = await activeTab.evaluate(async (cfg) => {
            try {
                console.log("[DEBUG] Collecting Initial Tokens...");
                
                const rawToken = window.localStorage.getItem('token');
                const deviceId = window.localStorage.getItem('uudid');
                const deviceKey = window.localStorage.getItem('ssdk');
                
                // Storage বা DOM থেকে বর্তমান ATK নেওয়া
                let actionToken = window.sessionStorage.getItem('atk') || document.querySelector('input[name="action_token"]')?.value || "";
                let cftToken = window.localStorage.getItem('cf-turnstile-response') || document.querySelector('[name="cf-turnstile-response"]')?.value || "";

                if (!rawToken || !cftToken) {
                    return { success: false, message: "Missing Token or CFT Response. Please refresh the page." };
                }

                const liveToken = rawToken.startsWith("Bearer") ? rawToken : "Bearer " + rawToken;

                let apiHeaders = {
                    "Authorization": liveToken,
                    "Content-Type": "application/json",
                    "Referer": "https://eticket.railway.gov.bd/",
                    "x-device-id": deviceId,
                    "x-device-key": deviceKey,
                    "x-requested-with": "XMLHttpRequest"
                };
                if (actionToken) apiHeaders["x-action-token"] = actionToken;

                console.log(`[DEBUG] Firing Phase A (Layout) with ATK: ${actionToken.substring(0, 10)}...`);

                // ==========================================
                // PHASE A: FETCH LAYOUT 
                // ==========================================
                const layoutUrl = `https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${cfg.TRIP_ID}&trip_route_id=${cfg.ROUTE_ID}&cft_response=${cftToken}`;
                const layoutRes = await fetch(layoutUrl, { headers: apiHeaders });
                
                // 🔄 [ROLLING ATK - STEP 1] Layout থেকে পাওয়া নতুন ATK আপডেট করা
                const newActionToken = layoutRes.headers.get('x-action-token');
                if (newActionToken) {
                    actionToken = newActionToken; 
                    apiHeaders["x-action-token"] = newActionToken; 
                    window.sessionStorage.setItem('atk', newActionToken);
                    console.log(`[DEBUG] 🔄 Updated ATK from Layout Response.`);
                }

                const layoutData = await layoutRes.json();
                if (layoutData.error || !layoutData?.data?.seatLayout) {
                    return { success: false, message: `Layout Fetch Failed. Details: ${JSON.stringify(layoutData.error || layoutData)}` };
                }

                // ==========================================
                // PHASE B: COLLECT MULTIPLE SEATS
                // ==========================================
                let targetSeats = []; // সিটের অ্যারে

                for (let floor of layoutData.data.seatLayout) {
                    for (let row of floor.layout) {
                        for (let seat of row) {
                            if (seat.seat_availability === 1 && seat.ticket_id) {
                                targetSeats.push({ id: seat.ticket_id, name: seat.seat_number });
                                // আমাদের টার্গেট সিট সংখ্যা পূরণ হলে লুপ ব্রেক করবে
                                if (targetSeats.length === cfg.SEAT_COUNT) break; 
                            }
                        }
                        if (targetSeats.length === cfg.SEAT_COUNT) break;
                    }
                    if (targetSeats.length === cfg.SEAT_COUNT) break;
                }

                if (targetSeats.length === 0) {
                    return { success: false, message: "Train is fully booked. No empty seats found." };
                }

                console.log(`[DEBUG] Found ${targetSeats.length} Seat(s): ${targetSeats.map(s => s.name).join(', ')}. Initiating Lock Sequence...`);

                // ==========================================
                // PHASE C: RESERVE SEATS SEQUENTIALLY (The Loop)
                // ==========================================
                let successfullyReserved = [];
                let lastBookingId = null;

                for (let i = 0; i < targetSeats.length; i++) {
                    let currentSeat = targetSeats[i];
                    console.log(`[DEBUG] 🎯 Firing API for Seat: ${currentSeat.name} with ATK: ${actionToken.substring(0, 10)}...`);

                    const reservePayload = {
                        "ticket_id": currentSeat.id.toString(),
                        "route_id": cfg.ROUTE_ID.toString(),
                        "action_token": actionToken, // লুপের বর্তমান ফ্রেশ টোকেন
                        "cft_response": cftToken,
                        "extras": {
                            "origin_name": cfg.ORIGIN,
                            "destination_name": cfg.DESTINATION,
                            "seat_number": currentSeat.name,
                            "trip_number": cfg.TRAIN_NAME
                        }
                    };

                    const reserveRes = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                        method: "PATCH",
                        headers: apiHeaders,
                        body: JSON.stringify(reservePayload)
                    });

                    // 🔄 [ROLLING ATK - STEP 2] প্রতিবার সিট বুক করার পর নতুন ATK ধরে ফেলা
                    const loopActionToken = reserveRes.headers.get('x-action-token');
                    if (loopActionToken) {
                        actionToken = loopActionToken; // পরের সিটের জন্য আপডেট
                        apiHeaders["x-action-token"] = loopActionToken; 
                        window.sessionStorage.setItem('atk', loopActionToken);
                        console.log(`[DEBUG] 🔄 Successfully caught new ATK for the next seat!`);
                    }

                    const reserveData = await reserveRes.json();
                    
                    if (reserveData.error) {
                        console.log(`[DEBUG] ❌ Failed to lock ${currentSeat.name}: ${JSON.stringify(reserveData.error)}`);
                        // যদি ফেইল করে, লুপ না ভেঙে পরের সিট ট্রাই করবে
                    } else {
                        successfullyReserved.push(currentSeat.name);
                        lastBookingId = reserveData?.data?.booking_id || lastBookingId;
                        console.log(`[DEBUG] ✅ Locked ${currentSeat.name} successfully!`);
                    }
                }

                if (successfullyReserved.length === 0) {
                     return { success: false, message: "Failed to book any of the targeted seats." };
                }

                return { 
                    success: true, 
                    seatNames: successfullyReserved,
                    bookingId: lastBookingId 
                };

            } catch (error) {
                return { success: false, message: "Execution error: " + error.message };
            }
        }, CONFIG);

        console.log(`\n[3/3] 📡 Server Response Received:\n`);

        if (apiResult.success) {
            console.log("\x1b[32m%s\x1b[0m", `✅ BOOM! ZERO-CLICK SNIPE SUCCESS!`);
            console.log(`🎯 Locked Seats: [${apiResult.seatNames.join(', ')}]`);
            console.log("Booking ID:", apiResult.bookingId);
        } else {
            console.log("\x1b[31m%s\x1b[0m", "❌ TEST FAILED:");
            console.log("Reason:", apiResult.message);
        }

    } catch (err) {
        console.error("Connection Error:", err.message);
    } finally {
        if (browser) browser.disconnect();
        process.exit(0);
    }
}

runZeroClickSniper();