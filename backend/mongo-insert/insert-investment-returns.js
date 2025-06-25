const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Function to generate random date within last 6 months
function generateRandomDate() {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
    const randomTime = sixMonthsAgo.getTime() + Math.random() * (now.getTime() - sixMonthsAgo.getTime());
    return new Date(randomTime);
}

// Manually defined customer investment returns records
function generateCustomerInvestmentReturnsData() {
    const investmentReturns = [
        { id: 1, investment_id: 201, customer_id: 101, mf_id: "MF001", units: 4523.45, invested_amount: 50000, current_amount: 52500, created: new Date("2024-08-15") },
        { id: 2, investment_id: 202, customer_id: 101, mf_id: "MF002", units: 2156.78, invested_amount: 25000, current_amount: 26750, created: new Date("2024-09-10") },
        { id: 3, investment_id: 203, customer_id: 102, mf_id: "MF001", units: 6785.12, invested_amount: 75000, current_amount: 78750, created: new Date("2024-07-22") },
        { id: 4, investment_id: 204, customer_id: 103, mf_id: "MF003", units: 8912.34, invested_amount: 100000, current_amount: 105000, created: new Date("2024-06-18") },
        { id: 5, investment_id: 205, customer_id: 103, mf_id: "MF004", units: 2834.67, invested_amount: 30000, current_amount: 31500, created: new Date("2024-10-05") },
        { id: 6, investment_id: 206, customer_id: 104, mf_id: "MF002", units: 5176.89, invested_amount: 60000, current_amount: 63000, created: new Date("2024-08-30") },
        { id: 7, investment_id: 207, customer_id: 105, mf_id: "MF005", units: 7234.56, invested_amount: 80000, current_amount: 84000, created: new Date("2024-07-12") },
        { id: 8, investment_id: 208, customer_id: 106, mf_id: "MF001", units: 4071.23, invested_amount: 45000, current_amount: 47250, created: new Date("2024-09-25") },
        { id: 9, investment_id: 209, customer_id: 106, mf_id: "MF006", units: 3298.45, invested_amount: 35000, current_amount: 36750, created: new Date("2024-10-12") },
        { id: 10, investment_id: 210, customer_id: 107, mf_id: "MF003", units: 8021.78, invested_amount: 90000, current_amount: 94500, created: new Date("2024-06-28") },
        { id: 11, investment_id: 211, customer_id: 108, mf_id: "MF007", units: 5123.67, invested_amount: 55000, current_amount: 57750, created: new Date("2024-08-08") },
        { id: 12, investment_id: 212, customer_id: 109, mf_id: "MF002", units: 3456.89, invested_amount: 40000, current_amount: 42000, created: new Date("2024-09-18") },
        { id: 13, investment_id: 213, customer_id: 109, mf_id: "MF008", units: 6087.23, invested_amount: 65000, current_amount: 68250, created: new Date("2024-07-03") },
        { id: 14, investment_id: 214, customer_id: 110, mf_id: "MF004", units: 6612.45, invested_amount: 70000, current_amount: 73500, created: new Date("2024-10-20") },
        { id: 15, investment_id: 215, customer_id: 111, mf_id: "MF001", units: 7689.12, invested_amount: 85000, current_amount: 89250, created: new Date("2024-06-15") },
        { id: 16, investment_id: 216, customer_id: 112, mf_id: "MF009", units: 4523.78, invested_amount: 48000, current_amount: 50400, created: new Date("2024-08-22") },
        { id: 17, investment_id: 217, customer_id: 113, mf_id: "MF005", units: 8598.34, invested_amount: 95000, current_amount: 99750, created: new Date("2024-07-28") },
        { id: 18, investment_id: 218, customer_id: 114, mf_id: "MF010", units: 3012.56, invested_amount: 32000, current_amount: 33600, created: new Date("2024-09-05") },
        { id: 19, investment_id: 219, customer_id: 114, mf_id: "MF003", units: 5167.89, invested_amount: 58000, current_amount: 60900, created: new Date("2024-10-08") },
        { id: 20, investment_id: 220, customer_id: 115, mf_id: "MF006", units: 6789.23, invested_amount: 72000, current_amount: 75600, created: new Date("2024-06-25") },
        { id: 21, investment_id: 221, customer_id: 116, mf_id: "MF002", units: 3543.67, invested_amount: 41000, current_amount: 43050, created: new Date("2024-08-18") },
        { id: 22, investment_id: 222, customer_id: 117, mf_id: "MF007", units: 6234.45, invested_amount: 67000, current_amount: 70350, created: new Date("2024-09-12") },
        { id: 23, investment_id: 223, customer_id: 118, mf_id: "MF001", units: 4798.12, invested_amount: 53000, current_amount: 55650, created: new Date("2024-07-08") },
        { id: 24, investment_id: 224, customer_id: 119, mf_id: "MF008", units: 8234.56, invested_amount: 88000, current_amount: 92400, created: new Date("2024-10-15") },
        { id: 25, investment_id: 225, customer_id: 120, mf_id: "MF004", units: 4345.78, invested_amount: 46000, current_amount: 48300, created: new Date("2024-06-12") },
        { id: 26, investment_id: 226, customer_id: 121, mf_id: "MF009", units: 7456.89, invested_amount: 79000, current_amount: 82950, created: new Date("2024-08-28") },
        { id: 27, investment_id: 227, customer_id: 122, mf_id: "MF010", units: 3587.23, invested_amount: 38000, current_amount: 39900, created: new Date("2024-09-22") },
        { id: 28, investment_id: 228, customer_id: 123, mf_id: "MF005", units: 5612.45, invested_amount: 62000, current_amount: 65100, created: new Date("2024-07-18") },
        { id: 29, investment_id: 229, customer_id: 124, mf_id: "MF001", units: 4612.34, invested_amount: 51000, current_amount: 53550, created: new Date("2024-10-02") },
        { id: 30, investment_id: 230, customer_id: 125, mf_id: "MF006", units: 6987.56, invested_amount: 74000, current_amount: 77700, created: new Date("2024-06-08") }
    ];
    
    return investmentReturns;
}

// Main function to insert customer investment returns data into MongoDB
async function insertCustomerInvestmentReturnsData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_investment_returns');
        
        // Generate customer investment returns data
        const returnsData = generateCustomerInvestmentReturnsData();
        
        // Insert data
        const result = await collection.insertMany(returnsData);
        console.log(`Successfully inserted ${result.insertedCount} customer investment returns records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Investment Returns Data:');
        returnsData.forEach((returns, index) => {
            const returnsAmount = returns.current_amount - returns.invested_amount;
            const returnsPercent = ((returnsAmount / returns.invested_amount) * 100).toFixed(2);
            
            console.log(`${index + 1}. ID: ${returns.id}, Investment: ${returns.investment_id}, Customer: ${returns.customer_id}`);
            console.log(`   MF: ${returns.mf_id}, Units: ${returns.units}`);
            console.log(`   Invested: ₹${returns.invested_amount}, Current: ₹${returns.current_amount}`);
            console.log(`   Returns: ₹${returnsAmount} (${returnsPercent}%)`);
            console.log(`   Created: ${returns.created.toDateString()}`);
            console.log('');
        });
        
        // Display summary statistics
        const totalInvested = returnsData.reduce((sum, item) => sum + item.invested_amount, 0);
        const totalCurrent = returnsData.reduce((sum, item) => sum + item.current_amount, 0);
        const totalReturns = totalCurrent - totalInvested;
        
        console.log('\n=== INVESTMENT RETURNS SUMMARY ===');
        console.log(`Total Records: ${returnsData.length}`);
        console.log(`Total Invested Amount: ₹${totalInvested}`);
        console.log(`Total Current Value: ₹${totalCurrent}`);
        console.log(`Total Returns: ₹${totalReturns}`);
        console.log(`Overall Returns Percentage: ${((totalReturns / totalInvested) * 100).toFixed(2)}%`);
        
        // Group by MF and show performance
        const mfPerformance = {};
        returnsData.forEach(item => {
            if (!mfPerformance[item.mf_id]) {
                mfPerformance[item.mf_id] = { invested: 0, current: 0, count: 0 };
            }
            mfPerformance[item.mf_id].invested += item.invested_amount;
            mfPerformance[item.mf_id].current += item.current_amount;
            mfPerformance[item.mf_id].count += 1;
        });
        
        console.log('\n=== MUTUAL FUND PERFORMANCE ===');
        Object.keys(mfPerformance).sort().forEach(mfId => {
            const perf = mfPerformance[mfId];
            const returns = perf.current - perf.invested;
            const returnsPercent = ((returns / perf.invested) * 100).toFixed(2);
            console.log(`${mfId}: ${perf.count} investments, ₹${perf.invested} → ₹${perf.current} (${returnsPercent}%)`);
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
insertCustomerInvestmentReturnsData();