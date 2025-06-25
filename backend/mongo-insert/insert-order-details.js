const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Function to generate random NAV (Net Asset Value) for unit calculation
function generateRandomNAV() {
    // NAV typically ranges from ₹10 to ₹500 for most mutual funds
    const navRanges = {
        'Liquid Fund': { min: 1000, max: 4000 },           // Higher NAV for liquid funds
        'Ultra Short Duration Fund': { min: 1050, max: 2000 },
        'Low Duration Fund': { min: 1100, max: 2500 },
        'Medium Duration Fund': { min: 1200, max: 3000 },
        'Long Duration Fund': { min: 1300, max: 3500 },
        'Large Cap Fund': { min: 15, max: 150 },
        'Mid Cap Fund': { min: 20, max: 200 },
        'Small Cap Fund': { min: 25, max: 300 },
        'Multi Cap Fund': { min: 18, max: 180 },
        'Flexi Cap Fund': { min: 22, max: 220 },
        'Conservative Hybrid Fund': { min: 12, max: 80 },
        'Aggressive Hybrid Fund': { min: 15, max: 120 },
        'Balanced Advantage Fund': { min: 10, max: 100 },
        'Index Fund': { min: 8, max: 50 },
        'ETF': { min: 100, max: 500 }
    };
    
    return function(fundType) {
        const range = navRanges[fundType] || { min: 10, max: 100 };
        return (Math.random() * (range.max - range.min) + range.min).toFixed(4);
    };
}

// Function to generate unique order IDs
function generateOrderIds(index) {
    const fpOrderId = `FP${String(Date.now()).slice(-8)}${String(index).padStart(3, '0')}`;
    const rayiOrderId = `RAYI${String(Date.now()).slice(-6)}${String(index).padStart(4, '0')}`;
    return { fpOrderId, rayiOrderId };
}

// Function to calculate transaction charges (typically 0.1% to 2.5%)
function calculateTransactionCharges(amount, fundType) {
    const chargeRates = {
        'Liquid Fund': 0.0005,           // 0.05%
        'Ultra Short Duration Fund': 0.001, // 0.1%
        'Low Duration Fund': 0.0015,     // 0.15%
        'Medium Duration Fund': 0.002,   // 0.2%
        'Long Duration Fund': 0.0025,    // 0.25%
        'Large Cap Fund': 0.01,          // 1%
        'Mid Cap Fund': 0.015,           // 1.5%
        'Small Cap Fund': 0.02,          // 2%
        'Multi Cap Fund': 0.012,         // 1.2%
        'Flexi Cap Fund': 0.013,         // 1.3%
        'Conservative Hybrid Fund': 0.008, // 0.8%
        'Aggressive Hybrid Fund': 0.012,  // 1.2%
        'Balanced Advantage Fund': 0.01,  // 1%
        'Index Fund': 0.005,             // 0.5%
        'ETF': 0.001                     // 0.1%
    };
    
    const rate = chargeRates[fundType] || 0.01;
    return Math.round(amount * rate * 100) / 100; // Round to 2 decimal places
}

// Function to generate order detail data
async function generateOrderDetailData(client) {
    const db = client.db('financeai');
    
    // Fetch existing orders and mutual funds
    const orders = await db.collection('order').find({}).toArray();
    const mutualFunds = await db.collection('mutual_fund').find({}).toArray();
    
    if (orders.length === 0 || mutualFunds.length === 0) {
        throw new Error('No orders or mutual funds found. Please insert orders and mutual funds first.');
    }
    
    console.log(`Found ${orders.length} orders and ${mutualFunds.length} mutual funds`);
    
    const fpOrderStatuses = [
        "PENDING",
        "PROCESSING", 
        "CONFIRMED",
        "EXECUTED",
        "SETTLED",
        "FAILED",
        "CANCELLED",
        "REJECTED"
    ];
    
    // Weight the statuses to match payment statuses realistically
    const weightedStatuses = [
        ...Array(40).fill("SETTLED"),     // 40% settled
        ...Array(25).fill("EXECUTED"),    // 25% executed
        ...Array(15).fill("CONFIRMED"),   // 15% confirmed
        ...Array(8).fill("PROCESSING"),   // 8% processing
        ...Array(5).fill("PENDING"),      // 5% pending
        ...Array(4).fill("FAILED"),       // 4% failed
        ...Array(2).fill("CANCELLED"),    // 2% cancelled
        ...Array(1).fill("REJECTED")      // 1% rejected
    ];
    
    const orderDetails = [];
    const navGenerator = generateRandomNAV();
    
    // Generate order details - some orders might have multiple mutual funds
    let detailId = 1;
    
    for (const order of orders) {
        // 70% of orders have 1 fund, 25% have 2 funds, 5% have 3 funds
        const numFunds = Math.random() < 0.7 ? 1 : Math.random() < 0.25 ? 2 : 3;
        const selectedFunds = [];
        
        // Select random mutual funds for this order
        for (let i = 0; i < numFunds; i++) {
            let randomFund;
            do {
                randomFund = mutualFunds[Math.floor(Math.random() * mutualFunds.length)];
            } while (selectedFunds.some(f => f.id === randomFund.id));
            selectedFunds.push(randomFund);
        }
        
        // Distribute order amount among selected funds
        const amounts = [];
        if (numFunds === 1) {
            amounts.push(order.amount);
        } else {
            let remainingAmount = order.amount;
            for (let i = 0; i < numFunds - 1; i++) {
                const portion = Math.floor(remainingAmount * (0.3 + Math.random() * 0.4)); // 30-70% of remaining
                amounts.push(portion);
                remainingAmount -= portion;
            }
            amounts.push(remainingAmount); // Last fund gets the remainder
        }
        
        // Create order detail for each fund
        for (let i = 0; i < selectedFunds.length; i++) {
            const fund = selectedFunds[i];
            const amount = amounts[i];
            const nav = parseFloat(navGenerator(fund.sub_category));
            const units = (amount / nav).toFixed(4);
            const transactionCharges = calculateTransactionCharges(amount, fund.sub_category);
            const transactionAmount = amount + transactionCharges;
            
            const { fpOrderId, rayiOrderId } = generateOrderIds(detailId);
            
            const orderDetail = {
                id: detailId,
                order_id: order.id,
                mutual_fund_id: fund.id,
                amount: amount,
                units: parseFloat(units),
                fp_order_id: fpOrderId,
                rayi_order_id: rayiOrderId,
                fp_order_status: weightedStatuses[Math.floor(Math.random() * weightedStatuses.length)],
                transaction_amount: Math.round(transactionAmount * 100) / 100 // Round to 2 decimal places
            };
            
            orderDetails.push(orderDetail);
            detailId++;
        }
    }
    
    return orderDetails;
}

// Function to get detailed information for display
async function getOrderDetailInfo(client, orderDetails) {
    const db = client.db('financeai');
    
    const detailedInfo = [];
    
    for (const detail of orderDetails.slice(0, 10)) { // Get info for first 10 records
        const order = await db.collection('order').findOne(
            { id: detail.order_id },
            { projection: { customer_id: 1, payment_status: 1 } }
        );
        
        const customer = await db.collection('customer').findOne(
            { id: order?.customer_id },
            { projection: { name: 1, rayi_customer_id: 1 } }
        );
        
        const mutualFund = await db.collection('mutual_fund').findOne(
            { id: detail.mutual_fund_id },
            { projection: { fund_name: 1, amc_name: 1, sub_category: 1 } }
        );
        
        detailedInfo.push({
            ...detail,
            customer_name: customer?.name || 'Unknown',
            customer_rayi_id: customer?.rayi_customer_id || 'Unknown',
            fund_name: mutualFund?.fund_name || 'Unknown',
            amc_name: mutualFund?.amc_name || 'Unknown',
            fund_category: mutualFund?.sub_category || 'Unknown',
            order_payment_status: order?.payment_status || 'Unknown'
        });
    }
    
    return detailedInfo;
}

// Main function to insert order detail data into MongoDB
async function insertOrderDetailData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('order_detail');
        
        // Generate order detail data
        console.log('Generating order detail data...');
        const orderDetailData = await generateOrderDetailData(client);
        
        // Insert data
        const result = await collection.insertMany(orderDetailData);
        console.log(`Successfully inserted ${result.insertedCount} order detail records`);
        
        // Get detailed information for display
        const detailedInfo = await getOrderDetailInfo(client, orderDetailData);
        
        // Display sample of inserted data
        console.log('\nSample of Inserted Order Detail Data:');
        detailedInfo.forEach((detail, index) => {
            console.log(`${index + 1}. Detail ID: ${detail.id}`);
            console.log(`   Order ID: ${detail.order_id} | Customer: ${detail.customer_name} (${detail.customer_rayi_id})`);
            console.log(`   Fund: ${detail.fund_name}`);
            console.log(`   AMC: ${detail.amc_name} | Category: ${detail.fund_category}`);
            console.log(`   Investment Amount: ₹${detail.amount.toLocaleString('en-IN')}`);
            console.log(`   Units Allocated: ${detail.units}`);
            console.log(`   Transaction Amount: ₹${detail.transaction_amount.toLocaleString('en-IN')}`);
            console.log(`   FP Order ID: ${detail.fp_order_id}`);
            console.log(`   RAYI Order ID: ${detail.rayi_order_id}`);
            console.log(`   FP Status: ${detail.fp_order_status} | Order Payment: ${detail.order_payment_status}`);
            console.log('   ---');
        });
        
        console.log(`\n... and ${orderDetailData.length - 10} more order details`);
        
        // Display summary statistics
        console.log('\nOrder Detail Summary:');
        
        const statusSummary = orderDetailData.reduce((acc, detail) => {
            acc[detail.fp_order_status] = (acc[detail.fp_order_status] || 0) + 1;
            return acc;
        }, {});
        
        console.log('FP Order Status Distribution:');
        Object.entries(statusSummary).forEach(([status, count]) => {
            const percentage = ((count / orderDetailData.length) * 100).toFixed(1);
            console.log(`  ${status}: ${count} records (${percentage}%)`);
        });
        
        const totalInvestment = orderDetailData.reduce((sum, detail) => sum + detail.amount, 0);
        const totalTransaction = orderDetailData.reduce((sum, detail) => sum + detail.transaction_amount, 0);
        const totalCharges = totalTransaction - totalInvestment;
        const avgUnits = orderDetailData.reduce((sum, detail) => sum + detail.units, 0) / orderDetailData.length;
        
        console.log(`\nFinancial Summary:`);
        console.log(`  Total Investment Amount: ₹${totalInvestment.toLocaleString('en-IN')}`);
        console.log(`  Total Transaction Amount: ₹${totalTransaction.toLocaleString('en-IN')}`);
        console.log(`  Total Transaction Charges: ₹${totalCharges.toFixed(2).toLocaleString('en-IN')}`);
        console.log(`  Average Units per Transaction: ${avgUnits.toFixed(4)}`);
        console.log(`  Total Order Details Created: ${orderDetailData.length}`);
        
        // Fund distribution
        const fundDistribution = orderDetailData.reduce((acc, detail) => {
            acc[detail.mutual_fund_id] = (acc[detail.mutual_fund_id] || 0) + 1;
            return acc;
        }, {});
        
        console.log(`\nFund Selection:`);
        console.log(`  Unique Funds Selected: ${Object.keys(fundDistribution).length}`);
        console.log(`  Most Popular Fund ID: ${Object.entries(fundDistribution).sort((a, b) => b[1] - a[1])[0][0]} (${Object.entries(fundDistribution).sort((a, b) => b[1] - a[1])[0][1]} selections)`);
        
    } catch (error) {
        console.error('Error inserting data:', error);
    } finally {
        // Close connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertOrderDetailData();