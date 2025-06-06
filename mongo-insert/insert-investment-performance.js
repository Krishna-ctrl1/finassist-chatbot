const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Manually defined customer investment performance records
function generateCustomerInvestmentPerformanceData() {
    const investmentPerformance = [
        { id: 1, customer_id: 101, investment_id: 201, invested_amount: 50000, current_value: 52500, returns: 2500, performance: 5.0, one_day_returns: 150 },
        { id: 2, customer_id: 101, investment_id: 202, invested_amount: 25000, current_value: 26750, returns: 1750, performance: 7.0, one_day_returns: -75 },
        { id: 3, customer_id: 102, investment_id: 203, invested_amount: 75000, current_value: 78750, returns: 3750, performance: 5.0, one_day_returns: 225 },
        { id: 4, customer_id: 103, investment_id: 204, invested_amount: 100000, current_value: 105000, returns: 5000, performance: 5.0, one_day_returns: -300 },
        { id: 5, customer_id: 103, investment_id: 205, invested_amount: 30000, current_value: 31500, returns: 1500, performance: 5.0, one_day_returns: 90 },
        { id: 6, customer_id: 104, investment_id: 206, invested_amount: 60000, current_value: 63000, returns: 3000, performance: 5.0, one_day_returns: 180 },
        { id: 7, customer_id: 105, investment_id: 207, invested_amount: 80000, current_value: 84000, returns: 4000, performance: 5.0, one_day_returns: -240 },
        { id: 8, customer_id: 106, investment_id: 208, invested_amount: 45000, current_value: 47250, returns: 2250, performance: 5.0, one_day_returns: 135 },
        { id: 9, customer_id: 106, investment_id: 209, invested_amount: 35000, current_value: 36750, returns: 1750, performance: 5.0, one_day_returns: -105 },
        { id: 10, customer_id: 107, investment_id: 210, invested_amount: 90000, current_value: 94500, returns: 4500, performance: 5.0, one_day_returns: 270 },
        { id: 11, customer_id: 108, investment_id: 211, invested_amount: 55000, current_value: 57750, returns: 2750, performance: 5.0, one_day_returns: -165 },
        { id: 12, customer_id: 109, investment_id: 212, invested_amount: 40000, current_value: 42000, returns: 2000, performance: 5.0, one_day_returns: 120 },
        { id: 13, customer_id: 109, investment_id: 213, invested_amount: 65000, current_value: 68250, returns: 3250, performance: 5.0, one_day_returns: -195 },
        { id: 14, customer_id: 110, investment_id: 214, invested_amount: 70000, current_value: 73500, returns: 3500, performance: 5.0, one_day_returns: 210 },
        { id: 15, customer_id: 111, investment_id: 215, invested_amount: 85000, current_value: 89250, returns: 4250, performance: 5.0, one_day_returns: -255 },
        { id: 16, customer_id: 112, investment_id: 216, invested_amount: 48000, current_value: 50400, returns: 2400, performance: 5.0, one_day_returns: 144 },
        { id: 17, customer_id: 113, investment_id: 217, invested_amount: 95000, current_value: 99750, returns: 4750, performance: 5.0, one_day_returns: 285 },
        { id: 18, customer_id: 114, investment_id: 218, invested_amount: 32000, current_value: 33600, returns: 1600, performance: 5.0, one_day_returns: -96 },
        { id: 19, customer_id: 114, investment_id: 219, invested_amount: 58000, current_value: 60900, returns: 2900, performance: 5.0, one_day_returns: 174 },
        { id: 20, customer_id: 115, investment_id: 220, invested_amount: 72000, current_value: 75600, returns: 3600, performance: 5.0, one_day_returns: -216 },
        { id: 21, customer_id: 116, investment_id: 221, invested_amount: 41000, current_value: 43050, returns: 2050, performance: 5.0, one_day_returns: 123 },
        { id: 22, customer_id: 117, investment_id: 222, invested_amount: 67000, current_value: 70350, returns: 3350, performance: 5.0, one_day_returns: -201 },
        { id: 23, customer_id: 118, investment_id: 223, invested_amount: 53000, current_value: 55650, returns: 2650, performance: 5.0, one_day_returns: 159 },
        { id: 24, customer_id: 119, investment_id: 224, invested_amount: 88000, current_value: 92400, returns: 4400, performance: 5.0, one_day_returns: -264 },
        { id: 25, customer_id: 120, investment_id: 225, invested_amount: 46000, current_value: 48300, returns: 2300, performance: 5.0, one_day_returns: 138 },
        { id: 26, customer_id: 121, investment_id: 226, invested_amount: 79000, current_value: 82950, returns: 3950, performance: 5.0, one_day_returns: -237 },
        { id: 27, customer_id: 122, investment_id: 227, invested_amount: 38000, current_value: 39900, returns: 1900, performance: 5.0, one_day_returns: 114 },
        { id: 28, customer_id: 123, investment_id: 228, invested_amount: 62000, current_value: 65100, returns: 3100, performance: 5.0, one_day_returns: -186 },
        { id: 29, customer_id: 124, investment_id: 229, invested_amount: 51000, current_value: 53550, returns: 2550, performance: 5.0, one_day_returns: 153 },
        { id: 30, customer_id: 125, investment_id: 230, invested_amount: 74000, current_value: 77700, returns: 3700, performance: 5.0, one_day_returns: -222 }
    ];
    
    return investmentPerformance;
}

// Main function to insert customer investment performance data into MongoDB
async function insertCustomerInvestmentPerformanceData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_investment_performance');
        
        // Generate customer investment performance data
        const performanceData = generateCustomerInvestmentPerformanceData();
        
        // Insert data
        const result = await collection.insertMany(performanceData);
        console.log(`Successfully inserted ${result.insertedCount} customer investment performance records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Investment Performance Data:');
        performanceData.forEach((performance, index) => {
            console.log(`${index + 1}. ID: ${performance.id}, Customer: ${performance.customer_id}, Investment: ${performance.investment_id}`);
            console.log(`   Invested: ₹${performance.invested_amount}, Current: ₹${performance.current_value}`);
            console.log(`   Returns: ₹${performance.returns}, Performance: ${performance.performance}%`);
            console.log(`   One Day Returns: ₹${performance.one_day_returns}`);
            console.log('');
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
insertCustomerInvestmentPerformanceData();