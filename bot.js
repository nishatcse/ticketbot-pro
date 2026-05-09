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

        // --- NEW: BOGIE RANDOMIZATION ---
        // Shuffle the bogies so 10 bots don't all attack Bogie "KA" at the same time
        for (let i = validBogies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [validBogies[i], validBogies[j]] = [validBogies[j], validBogies[i]];
        }

        sendLog(`Found ${validBogies.length} valid bogies. Attacking randomly.`);

        for (let bogie of validBogies) {
            if (totalSeatsClicked >= config.seats) break;

            sendLog(`Selecting Bogie: ${bogie.text}`);
            await activeTab.select('#select-bogie', bogie.value);
            await new Promise(r => setTimeout(r, 1500)); 

            // --- SEAT RANDOMIZATION ---
            const shuffledSeatIndices = await activeTab.evaluate(() => {
                const seats = document.querySelectorAll('.seat-available');
                let indices = Array.from({length: seats.length}, (_, i) => i);
                for (let i = indices.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [indices[i], indices[j]] = [indices[j], indices[i]];
                }
                return indices;
            });

            for (let targetIndex of shuffledSeatIndices) {
                if (totalSeatsClicked >= config.seats) break; 

                // ACTUAL FINAL CLICK
                await activeTab.evaluate((seatIndex) => {
                    document.querySelectorAll('.seat-available')[seatIndex].click();
                }, targetIndex);

                totalSeatsClicked++; 
                sendLog(`<span style='color:#bb86fc;'>✅ Selected seat ${totalSeatsClicked}/${config.seats}</span>`);
                await new Promise(r => setTimeout(r, 400)); 
            }
        }
        
        if (totalSeatsClicked === 0) {
            sendLog("<span style='color:orange;'>⚠️ Tickets sold out while processing.</span>");
        } else if (totalSeatsClicked < config.seats) {
            sendLog(`<span style='color:yellow;'>⚠️ PARTIAL BOOKING: Found ${totalSeatsClicked} out of ${config.seats}. Proceed manually!</span>`);
        } else {
            sendLog("<span style='color:#00ff00;'>✅ 100% Success. Proceed to checkout manually!</span>");
        }

        browser.disconnect();
        sendLog("Task finished. Handing control back to human.");

    } catch (error) {
        if(browser) browser.disconnect();
        throw error; 
    }
}