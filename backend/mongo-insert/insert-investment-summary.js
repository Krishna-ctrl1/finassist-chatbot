const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Manually defined customer investment performance summary records
// This aggregates data from the individual investment performance records per customer
function generateCustomerInvestmentPerfSummaryData() {
    const perfSummary = [
        { customer_id: 101, invested_amount: 75000, current_amount: 79250, one_day_returns: 75, one_day_returns_percent: 0.09 },
        { customer_id: 102, invested_amount: 75000, current_amount: 78750, one_day_returns: 225, one_day_returns_percent: 0.29 },
        { customer_id: 103, invested_amount: 130000, current_amount: 136500, one_day_returns: -210, one_day_returns_percent: -0.15 },
        { customer_id: 104, invested_amount: 60000, current_amount: 63000, one_day_returns: 180, one_day_returns_percent: 0.29 },
        { customer_id: 105, invested_amount: 80000, current_amount: 84000, one_day_returns: -240, one_day_returns_percent: -0.29 },
        { customer_id: 106, invested_amount: 80000, current_amount: 84000, one_day_returns: 30, one_day_returns_percent: 0.04 },
        { customer_id: 107, invested_amount: 90000, current_amount: 94500, one_day_returns: 270, one_day_returns_percent: 0.29 },
        { customer_id: 108, invested_amount: 55000, current_amount: 57750, one_day_returns: -165, one_day_returns_percent: -0.29 },
        { customer_id: 109, invested_amount: 105000, current_amount: 110250, one_day_returns: -75, one_day_returns_percent: -0.07 },
        { customer_id: 110, invested_amount: 70000, current_amount: 73500, one_day_returns: 210, one_day_returns_percent: 0.29 },
        { customer_id: 111, invested_amount: 85000, current_amount: 89250, one_day_returns: -255, one_day_returns_percent: -0.29 },
        { customer_id: 112, invested_amount: 48000, current_amount: 50400, one_day_returns: 144, one_day_returns_percent: 0.29 },
        { customer_id: 113, invested_amount: 95000, current_amount: 99750, one_day_returns: 285, one_day_returns_percent: 0.29 },
        { customer_id: 114, invested_amount: 90000, current_amount: 94500, one_day_returns: 78, one_day_returns_percent: 0.08 },
        { customer_id: 115, invested_amount: 72000, current_amount: 75600, one_day_returns: -216, one_day_returns_percent: -0.29 },
        { customer_id: 116, invested_amount: 41000, current_amount: 43050, one_day_returns: 123, one_day_returns_percent: 0.29 },
        { customer_id: 117, invested_amount: 67000, current_amount: 70350, one_day_returns: -201, one_day_returns_percent: -0.29 },
        { customer_id: 118, invested_amount: 53000, current_amount: 55650, one_day_returns: 159, one_day_returns_percent: 0.29 },
        { customer_id: 119, invested_amount: 88000, current_amount: 92400, one_day_returns: -264, one_day_returns_percent: -0.29 },
        { customer_id: 120, invested_amount: 46000, current_amount: 48300, one_day_returns: 138, one_day_returns_percent: 0.29 },
        { customer_id: 121, invested_amount: 79000, current_amount: 82950, one_day_returns: -237, one_day_returns_percent: -0.29 },
        { customer_id: 122, invested_amount: 38000, current_amount: 39900, one_day_returns: 114, one_day_returns_percent: 0.29 },
        { customer_id: 123, invested_amount: 62000, current_amount: 65100, one_day_returns: -186, one_day_returns_percent: -0.29 },
        { customer_id: 124, invested_amount: 51000, current_amount: 53550, one_day_returns: 153, one_day_returns_percent: 0.29 },
        { customer_id: 125, invested_amount: 74000, current_amount: 77700, one_day_returns: -222, one_day_returns_percent: -0.29 }
    ];
    
    return perfSummary;
}

// Main function to insert customer investment performance summary data into MongoDB
async function insertCustomerInvestmentPerfSummaryData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_investment_perf_summary');
        
        // Generate customer investment performance summary data
        const summaryData = generateCustomerInvestmentPerfSummaryData();
        
        // Insert data
        const result = await collection.insertMany(summaryData);
        console.log(`Successfully inserted ${result.insertedCount} customer investment performance summary records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Investment Performance Summary Data:');
        summaryData.forEach((summary, index) => {
            console.log(`${index + 1}. Customer ID: ${summary.customer_id}`);
            console.log(`   Total Invested: ₹${summary.invested_amount}`);
            console.log(`   Current Value: ₹${summary.current_amount}`);
            console.log(`   One Day Returns: ₹${summary.one_day_returns} (${summary.one_day_returns_percent}%)`);
            console.log('');
        });
        
        // Display summary statistics
        const totalInvested = summaryData.reduce((sum, item) => sum + item.invested_amount, 0);
        const totalCurrent = summaryData.reduce((sum, item) => sum + item.current_amount, 0);
        const totalOneDayReturns = summaryData.reduce((sum, item) => sum + item.one_day_returns, 0);
        
        console.log('\n=== PORTFOLIO SUMMARY ===');
        console.log(`Total Invested Amount: ₹${totalInvested}`);
        console.log(`Total Current Value: ₹${totalCurrent}`);
        console.log(`Total Overall Returns: ₹${totalCurrent - totalInvested}`);
        console.log(`Total One Day Returns: ₹${totalOneDayReturns}`);
        console.log(`Overall Portfolio Performance: ${((totalCurrent - totalInvested) / totalInvested * 100).toFixed(2)}%`);
        
    } catch (error) {
        console.error('Error inserting data:', error);
    } finally {
        // Close connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertCustomerInvestmentPerfSummaryData();