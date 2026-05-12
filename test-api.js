const puppeteer = require('puppeteer');

// ==========================================
// ⚙️ TEST CONFIGURATION 
// ==========================================
const CHROME_PORT = 9222; // আপনার লগইন করা ক্রোমের পোর্ট
const TEST_DATA = {
    train_name: "DRUTOJAN EXPRESS (758)" // শুধু ট্রেনের নামটা ঠিক রাখবেন
    // কোনো হার্ডকোডেড সিট বা আইডি দরকার নেই!
};

async function testDynamicApiSniper() {
    console.log(`\n[1/3] 🔌 Connecting to Chrome on Port ${CHROME_PORT}...`);
    let browser;

    try {
        browser = await puppeteer.connect({ 
            browserURL: `http://127.0.0.1:${CHROME_PORT}`, 
            defaultViewport: null 
        });
        
        const pages = await browser.pages();
        const activeTab = pages[0];

        console.log(`[2/3] 🔍 Scanning Server Dynamically for ANY available seat...`);

        // ব্রাউজারের ভেতর ডাইনামিক API লজিক পুশ করা
        const result = await activeTab.evaluate(async (data) => {
            try {
                // ১. URL থেকে ডাইনামিক আইডি কালেকশন
                const urlParams = new URLSearchParams(window.location.search);
                const tripId = urlParams.get('trip_id');
                const routeId = urlParams.get('trip_route_id');

                if (!tripId || !routeId) {
                    return { success: false, message: "URL Error: trip_id or route_id missing. Are you on the ticket selection page?" };
                }

                // ২. স্টোরেজ থেকে লাইভ টোকেন চুরি
                const liveToken = "Bearer " + window.localStorage.getItem('access_token');
                const deviceId = window.localStorage.getItem('device_id');
                const deviceKey = window.localStorage.getItem('device_key');
                let actionToken = document.querySelector('input[name="action_token"]')?.value || "";

                if (!window.localStorage.getItem('access_token')) {
                    return { success: false, message: "No Access Token found. Are you logged in?" };
                }

                const apiHeaders = {
                    "Authorization": liveToken,
                    "Content-Type": "application/json",
                    "Referer": window.location.href,
                    "x-device-id": deviceId,
                    "x-device-key": deviceKey,
                    "x-requested-with": "XMLHttpRequest"
                };
                if (actionToken) apiHeaders["x-action-token"] = actionToken;

                // ==========================================
                // STEP 1: FETCH LAYOUT & FIND SEAT
                // ==========================================
                const layoutUrl = `https://railspaapi.shohoz.com/v1.0/web/bookings/seat-layout?trip_id=${tripId}&trip_route_id=${routeId}`;
                const layoutRes = await fetch(layoutUrl, { headers: apiHeaders });
                const layoutData = await layoutRes.json();

                if (!layoutData?.data?.seatLayout) {
                    return { success: false, message: "Failed to fetch seat layout API from server." };
                }

                let targetTicketId = null;
                let targetSeatName = null;
                let origin = layoutData.data.points[0]?.origin_city_name || "Dhaka";
                let destination = layoutData.data.points[0]?.destination_city_name || "Rajshahi";

                // লুপ চালিয়ে সর্বপ্রথম ফাঁকা সিটটি খুঁজে বের করা
                for (let floor of layoutData.data.seatLayout) {
                    for (let row of floor.layout) {
                        for (let seat of row) {
                            if (seat.seat_availability === 1 && seat.ticket_id) {
                                targetTicketId = seat.ticket_id;
                                targetSeatName = seat.seat_number;
                                break; // সিট পেয়ে গেছি, লুপ ব্রেক!
                            }
                        }
                        if (targetTicketId) break;
                    }
                    if (targetTicketId) break;
                }

                if (!targetTicketId) {
                    return { success: false, message: "Train is fully booked. No seats available in API." };
                }

                // ==========================================
                // STEP 2: RESERVE THAT SPECIFIC SEAT
                // ==========================================
                const reservePayload = {
                    "ticket_id": targetTicketId.toString(),
                    "route_id": routeId.toString(),
                    "extras": {
                        "origin_name": origin,
                        "destination_name": destination,
                        "seat_number": targetSeatName,
                        "trip_number": data.train_name
                    }
                };
                if (actionToken) reservePayload.action_token = actionToken;

                const response = await fetch("https://railspaapi.shohoz.com/v1.0/web/bookings/reserve-seat", {
                    method: "PATCH",
                    headers: apiHeaders,
                    body: JSON.stringify(reservePayload)
                });

                const jsonResponse = await response.json();

                if (jsonResponse.error) {
                    return { success: false, message: jsonResponse.message || "Server rejected the reservation." };
                }

                return { 
                    success: true, 
                    seat_name: targetSeatName,
                    ticket_id: targetTicketId,
                    data: jsonResponse 
                };

            } catch (error) {
                return { success: false, message: error.toString() };
            }
        }, TEST_DATA);

        console.log(`[3/3] 📡 Server Response Received:\n`);

        // রেজাল্ট প্রিন্ট করা
        if (result.success) {
            console.log("\x1b[32m%s\x1b[0m", `✅ BOOM! Dynamically found and locked Seat: [${result.seat_name}]`); 
            console.log("Ticket ID:", result.ticket_id);
            console.log("Booking ID:", result.data?.data?.booking_id);
        } else {
            console.log("\x1b[31m%s\x1b[0m", "❌ TEST FAILED:"); 
            console.log("Reason:", result.message);
        }

    } catch (err) {
        console.log("\x1b[31m%s\x1b[0m", "❌ CONNECTION ERROR:");
        console.log("Make sure your Chrome is running on port " + CHROME_PORT);
        console.error(err.message);
    } finally {
        if (browser) {
            browser.disconnect();
            console.log("\nDisconnected from Browser.");
        }
        process.exit(0);
    }
}

// স্ক্রিপ্ট রান করা
testDynamicApiSniper();