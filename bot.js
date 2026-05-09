const puppeteer = require('puppeteer');

module.exports = async function runBot(config, sendLog, abortSignal) {
    sendLog("Attempting to connect to browser...");
    let browser;

    try {
        browser = await puppeteer.connect({
            browserURL: `http://127.0.0.1:${config.port}`,
            defaultViewport: null
        });

        const pages = await browser.pages();
        const activeTab = pages[0]; 

        sendLog(`Navigating to Target URL...`);
        
        await activeTab.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 120000 })
            .catch(() => sendLog("<span style='color:orange;'>Network slow, but continuing...</span>"));

        sendLog(`🎯 SNIPER ACTIVE: Camping for "${config.trainName}"`);

        let clickedSeat = false;

        // THE INFINITE SNIPER LOOP
        while (!clickedSeat) {
            if (abortSignal.aborted) {
                sendLog("<span style='color:orange;'>Task aborted by user restart.</span>");
                browser.disconnect();
                return;
            }

            try {
                await activeTab.waitForSelector('app-single-trip', { timeout: 0 });

                clickedSeat = await activeTab.evaluate((trainName, seatClass, mode) => {
                    const trainBlocks = document.querySelectorAll('app-single-trip');
                    for (let trainBlock of trainBlocks) {
                        const trainHeading = trainBlock.querySelector('h2');
                        if (trainHeading && trainHeading.textContent.trim() === trainName) {
                            const seatBlocks = trainBlock.querySelectorAll('.single-seat-class');
                            for (let seatBlock of seatBlocks) {
                                const seatNameElement = seatBlock.querySelector('.seat-class-name');
                                if (seatNameElement && seatNameElement.textContent.trim() === seatClass) {
                                    const bookNowBtn = seatBlock.querySelector('.book-now-btn');
                                    if (bookNowBtn) {
                                        bookNowBtn.scrollIntoView({ block: 'center' });
                                        if (mode === 'Live') bookNowBtn.click();
                                        return true; 
                                    }
                                }
                            }
                        }
                    }
                    return false; 
                }, config.trainName, config.seatClass, config.mode); 

                if (!clickedSeat) {
                    await new Promise(r => setTimeout(r, 200)); // Scan 5 times per second
                }
            } catch (err) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        if (config.mode === 'Test') {
            sendLog(`<span style='color:cyan;'>✅ [TEST SUCCESS] Port ${config.port} ready.</span>`);
            browser.disconnect();
            return;
        }

        sendLog(`<span style='color:yellow;'>🏆 Target Hit! Opened seat map.</span>`);
        
        await activeTab.waitForSelector('#select-bogie', { timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000)); 
        
        let totalSeatsClicked = 0; 

        let validBogies = await activeTab.evaluate(() => {
            const selectElement = document.querySelector('#select-bogie');
            const options = Array.from(selectElement.options);
            const available = [];
            for (let opt of options) {
                const match = opt.text.match(/(\d+)\s+Seat\(s\)/i);
                if (match && parseInt(match[1]) > 0) {
                    available.push({ value: opt.value, text: opt.text });
                }
            }
            return available;
        });

        // --- SMART BOGIE SORTING ---
        // 1. If user wants a specific bogie, find it and pull it out
        let preferredBogieIndex = -1;
        let preferredBogie = null;
        
        if (config.targetBogie) {
            preferredBogieIndex = validBogies.findIndex(b => b.text.toUpperCase().includes(config.targetBogie));
            if (preferredBogieIndex !== -1) {
                preferredBogie = validBogies.splice(preferredBogieIndex, 1)[0];
            }
        }

        // 2. Shuffle the REMAINING bogies to prevent collisions with other bots
        for (let i = validBogies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validBogies[i], validBogies[j]] = [validBogies[j], validBogies[i]];
        }

        // 3. Put the preferred bogie at the absolute front of the line (if found)
        if (preferredBogie) {
            validBogies.unshift(preferredBogie);
            sendLog(`🎯 Target Bogie found: Pushing ${preferredBogie.text} to priority queue.`);
        }

        sendLog(`Attacking ${validBogies.length} available bogies...`);

        // --- THE HUNTING LOOP ---
        for (let bogie of validBogies) {
            if (totalSeatsClicked >= config.seats) break; // Quota full! Stop hunting.

            sendLog(`Entering Bogie: ${bogie.text}`);
            await activeTab.select('#select-bogie', bogie.value);
            await new Promise(r => setTimeout(r, 1500)); // Wait for seats to load in DOM

            // Grab all currently available seats and their EXACT titles (e.g., SCHA-1)
            let availableSeatsInfo = await activeTab.evaluate(() => {
                const seats = document.querySelectorAll('.seat-available');
                return Array.from(seats).map((seat, index) => ({
                    title: seat.getAttribute('title') || '',
                    index: index
                }));
            });

            if (availableSeatsInfo.length === 0) {
                sendLog(`<span style='color:gray;'>Bogie empty or locked. Moving to next...</span>`);
                continue; 
            }

            // --- PLAN A: TARGETED SEAT SNIPING ---
            if (config.targetSeatNames && config.targetSeatNames.length > 0) {
                for (let targetName of config.targetSeatNames) {
                    if (totalSeatsClicked >= config.seats) break;
                    
                    let seatMatch = availableSeatsInfo.find(s => s.title.toUpperCase() === targetName);
                    
                    if (seatMatch && !seatMatch.clicked) {
                        // Click the specific seat!
                        await activeTab.evaluate((idx) => { 
                            document.querySelectorAll('.seat-available')[idx].click(); 
                        }, seatMatch.index);
                        
                        seatMatch.clicked = true; // Mark as taken locally
                        totalSeatsClicked++; 
                        sendLog(`<span style='color:#00ff00; font-weight:bold;'>🎯 VIP SNIPE: Secured exact seat [${targetName}] (${totalSeatsClicked}/${config.seats})</span>`);
                        await new Promise(r => setTimeout(r, 400)); 
                    }
                }
            }

            // --- PLAN B: RANDOMIZED FALLBACK ---
            // If the user didn't specify seats, OR if the targeted seats were already taken by someone else
            if (totalSeatsClicked < config.seats) {
                let remainingSeats = availableSeatsInfo.filter(s => !s.clicked);
                
                if (remainingSeats.length > 0) {
                    sendLog(`Need ${config.seats - totalSeatsClicked} more seats. Triggering Random Fallback...`);
                    
                    // Shuffle the remaining seats to prevent collision
                    for (let i = remainingSeats.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [remainingSeats[i], remainingSeats[j]] = [remainingSeats[j], remainingSeats[i]];
                    }

                    for (let randomSeat of remainingSeats) {
                        if (totalSeatsClicked >= config.seats) break;
                        
                        await activeTab.evaluate((idx) => { 
                            document.querySelectorAll('.seat-available')[idx].click(); 
                        }, randomSeat.index);
                        
                        totalSeatsClicked++;
                        sendLog(`<span style='color:#bb86fc;'>✅ Random Grab: Secured [${randomSeat.title}] (${totalSeatsClicked}/${config.seats})</span>`);
                        await new Promise(r => setTimeout(r, 400));
                    }
                }
            }
            
            // NOTE: If totalSeatsClicked is still < config.seats, the loop naturally continues to the next Bogie!
        }
        
        if (totalSeatsClicked === 0) {
            sendLog("<span style='color:red; font-weight:bold;'>⚠️ FAILED: All targeted and random seats sold out while processing.</span>");
        } else if (totalSeatsClicked < config.seats) {
            sendLog(`<span style='color:yellow; font-weight:bold;'>⚠️ PARTIAL BOOKING: Only secured ${totalSeatsClicked} out of ${config.seats}. Proceed manually!</span>`);
        } else {
            sendLog("<span style='color:#00ff00; font-weight:bold;'>✅ 100% SUCCESS. Proceed to checkout manually!</span>");
        }

        browser.disconnect();
        sendLog("Task finished. Handing control back to human.");

    } catch (error) {
        if(browser) browser.disconnect();
        throw error; 
    }
}