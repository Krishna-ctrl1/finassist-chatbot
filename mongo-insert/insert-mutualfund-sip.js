const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Array of 30 sample mutual fund names (Indian context)
function generateMutualFundData() {
    const mutualFunds = [
        { id: 1, mutual_fund_name: "SBI Bluechip Fund" },
        { id: 2, mutual_fund_name: "HDFC Mid-Cap Opportunities Fund" },
        { id: 3, mutual_fund_name: "ICICI Prudential Equity & Debt Fund" },
        { id: 4, mutual_fund_name: "Kotak Flexicap Fund" },
        { id: 5, mutual_fund_name: "Axis Long Term Equity Fund" },
        { id: 6, mutual_fund_name: "Aditya Birla Sun Life Frontline Equity Fund" },
        { id: 7, mutual_fund_name: "Mirae Asset Large Cap Fund" },
        { id: 8, mutual_fund_name: "Parag Parikh Flexi Cap Fund" },
        { id: 9, mutual_fund_name: "Nippon India Small Cap Fund" },
        { id: 10, mutual_fund_name: "DSP Equity Opportunities Fund" },
        { id: 11, mutual_fund_name: "UTI Nifty Index Fund" },
        { id: 12, mutual_fund_name: "Franklin India Flexi Cap Fund" },
        { id: 13, mutual_fund_name: "SBI Equity Hybrid Fund" },
        { id: 14, mutual_fund_name: "HDFC Small Cap Fund" },
        { id: 15, mutual_fund_name: "ICICI Prudential Bluechip Fund" },
        { id: 16, mutual_fund_name: "Kotak Emerging Equity Fund" },
        { id: 17, mutual_fund_name: "Axis Midcap Fund" },
        { id: 18, mutual_fund_name: "Aditya Birla Sun Life Equity Advantage Fund" },
        { id: 19, mutual_fund_name: "Mirae Asset Emerging Bluechip Fund" },
        { id: 20, mutual_fund_name: "Nippon India Growth Fund" },
        { id: 21, mutual_fund_name: "DSP Midcap Fund" },
        { id: 22, mutual_fund_name: "UTI Flexi Cap Fund" },
        { id: 23, mutual_fund_name: "Franklin India Prima Fund" },
        { id: 24, mutual_fund_name: "SBI Focused Equity Fund" },
        { id: 25, mutual_fund_name: "HDFC Balanced Advantage Fund" },
        { id: 26, mutual_fund_name: "ICICI Prudential Value Discovery Fund" },
        { id: 27, mutual_fund_name: "Kotak Bluechip Fund" },
        { id: 28, mutual_fund_name: "Axis Focused 25 Fund" },
        { id: 29, mutual_fund_name: "Aditya Birla Sun Life Tax Relief 96" },
        { id: 30, mutual_fund_name: "Mirae Asset Hybrid Equity Fund" }
    ];
    return mutualFunds;
}

// Generate SIP data, ensuring each customer (101-125) has 3-5 SIPs
function generateSIPData() {
    const sipData = [];
    const sipDates = [1, 5, 10, 15, 20];
    const planTypes = ["Growth", "Dividend"];
    let sipId = 1;

    for (let customerId = 101; customerId <= 125; customerId++) {
        // Randomly assign 3-5 SIPs per customer
        const numSIPs = Math.floor(Math.random() * 3) + 3; // 3 to 5 SIPs
        for (let i = 0; i < numSIPs; i++) {
            const mutualFundId = (sipId % 30) + 1; // Cycle through mutual fund IDs 1-30
            const amount = Math.floor(Math.random() * 6000) + 3000; // 3000-9000 INR
            const sipDate = sipDates[Math.floor(Math.random() * sipDates.length)];
            const planType = planTypes[Math.floor(Math.random() * planTypes.length)];
            const startDate = `2025-${String(Math.floor(Math.random() * 6) + 1).padStart(2, '0')}-01`;
            const years = Math.floor(Math.random() * 4) + 5; // 5-8 years
            const endDate = `${2025 + years}-${startDate.split('-')[1]}-01`;
            const stepUp = [5, 10, 15, 20][Math.floor(Math.random() * 4)];
            const numInstallments = years * 12;

            sipData.push({
                id: mutualFundId, // Links to mutual_fund.id
                customer_id: customerId,
                plan_type: planType,
                amount: amount,
                next_due: `2025-08-${String(sipDate).padStart(2, '0')}`,
                is_active: true,
                sip_date: sipDate,
                status: "Active",
                start_date: startDate,
                end_date: endDate,
                step_up: stepUp,
                number_of_installments: numInstallments
            });
            sipId++;
        }
    }
    return sipData;
}

// Main function to insert mutual fund and SIP data into MongoDB
async function insertMutualFundAndSIPData() {
    const client = new MongoClient(MONGO_URI);

    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');

        // Select database
        const db = client.db('financeai');

        // Insert Mutual Fund data
        const mutualFundCollection = db.collection('mutual_fund');
        const mutualFundData = generateMutualFundData();
        const mutualFundResult = await mutualFundCollection.insertMany(mutualFundData);
        console.log(`Successfully inserted ${mutualFundResult.insertedCount} mutual fund records`);

        // Display inserted Mutual Fund data
        console.log('\nInserted Mutual Fund Data:');
        mutualFundData.forEach((fund, index) => {
            console.log(`${index + 1}. ID: ${fund.id}, Name: ${fund.mutual_fund_name}`);
        });

        // Insert SIP data
        const sipCollection = db.collection('sip');
        const sipData = generateSIPData();
        const sipResult = await sipCollection.insertMany(sipData);
        console.log(`Successfully inserted ${sipResult.insertedCount} SIP records`);

        // Display inserted SIP data
        console.log('\nInserted SIP Data:');
        sipData.forEach((sip, index) => {
            console.log(`${index + 1}. ID: ${sip.id}, Customer ID: ${sip.customer_id}, Plan Type: ${sip.plan_type}, Amount: ${sip.amount}, Next Due: ${sip.next_due}, Active: ${sip.is_active}, SIP Date: ${sip.sip_date}, Status: ${sip.status}, Start Date: ${sip.start_date}, End Date: ${sip.end_date}, Step Up: ${sip.step_up}%, Installments: ${sip.number_of_installments}`);
        });

    } catch (error) {
        console.error('Error inserting data:', error);
    } finally {
        // Close connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertMutualFundAndSIPData();