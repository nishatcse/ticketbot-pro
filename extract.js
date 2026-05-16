const fs = require('fs');

// ==========================================
// ⚙️ EXTRACTOR CONFIGURATION (এখানে ডেটা চেঞ্জ করবেন)
// ==========================================
const jsonFileName = 'seat_layout.json'; // আপনার ডাউনলোড করা JSON ফাইলের নাম

const trainName    = 'DRUTOJAN EXPRESS (757)';
const source       = 'Dhaka';
const destination  = 'Dinajpur';
const className    = 'AC_B';
// ==========================================

try {
    console.log(`[DEBUG] 🔍 Scanning layout file: ${jsonFileName}...`);
    
    const rawData = fs.readFileSync(jsonFileName, 'utf8');
    const parsedData = JSON.parse(rawData);

    // সব বগির ডেটা সাজানোর জন্য একটা অবজেক্ট তৈরি করছি
    let coachData = {};
    let totalSeatsFound = 0;

    const layouts = parsedData.data.seatLayout;

    // 🚀 ম্যাপ স্ক্যান করা শুরু
    for (let floor of layouts) {
        let currentCoach = floor.floor_name;
        
        // যদি এই বগিটা আগে না থাকে, তবে নতুন অ্যারে তৈরি করবে
        if (!coachData[currentCoach]) {
            coachData[currentCoach] = [];
        }

        for (let row of floor.layout) {
            for (let seat of row) {
                // সিটের নাম ফাঁকা না হলে (রাস্তা বাদে)
                if (seat.seat_number && seat.seat_number.trim() !== "") {
                    // ID:SeatName ফরম্যাটে সেভ করা হচ্ছে
                    coachData[currentCoach].push(`${seat.ticket_id}:${seat.seat_number}`);
                    totalSeatsFound++;
                }
            }
        }
    }

    // 💾 ফাইল জেনারেশনের প্রস্তুতি
    const safeTrainName = trainName.replace(/[^a-zA-Z0-9]/g, '_');
    const outFileName = `${safeTrainName}_${source}_to_${destination}_${className}_FULL_TRAIN.txt`;

    // ফাইলের ভেতরে মেটাডেটা (ইনফরমেশন) লিখে দিচ্ছি
    let fileContent = `=== 🎯 FULL TRAIN SNIPER DATABASE ===\n`;
    fileContent += `🚄 Train: ${trainName}\n`;
    fileContent += `🗺️ Route: ${source} -> ${destination}\n`;
    fileContent += `💺 Class: ${className}\n`;
    fileContent += `📊 Total Seats Extracted: ${totalSeatsFound}\n`;
    fileContent += `=====================================\n\n`;

    // 🎯 প্রতিটা বগির ডেটা আলাদাভাবে ফাইলের ভেতরে লেখা হচ্ছে
    for (let coach in coachData) {
        if (coachData[coach].length > 0) {
            fileContent += `--- COACH: ${coach} ---\n`;
            fileContent += coachData[coach].join(', ') + `\n\n`;
        }
    }

    // ফাইল সেভ করা
    fs.writeFileSync(outFileName, fileContent, 'utf8');
    
    console.log(`\n=====================================================`);
    console.log(`🎯 [BINGO] DATABASE EXTRACTION COMPLETE!`);
    console.log(`✅ Total ${totalSeatsFound} seats extracted from multiple coaches.`);
    console.log(`💾 File Saved: => '${outFileName}'`);
    console.log(`=====================================================\n`);

} catch (err) {
    console.log(`\n❌ [ERROR] Failed to extract data!`);
    console.log(`💡 [TIPS] Make sure '${jsonFileName}' is in the exact same folder.`);
    console.log(`Error Details: ${err.message}`);
}