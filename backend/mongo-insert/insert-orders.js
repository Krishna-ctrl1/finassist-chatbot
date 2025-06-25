const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Function to generate random investment amounts
function generateRandomAmount() {
    const amounts = [
        1000, 1500, 2000, 2500, 3000, 5000, 7500, 10000, 
        15000, 20000, 25000, 30000, 50000, 75000, 100000,
        150000, 200000, 250000, 300000, 500000
    ];
    return amounts[Math.floor(Math.random() * amounts.length)];
}

// Function to generate order data
async function generateOrderData(client) {
    const db = client.db('financeai');
    
    // Fetch existing customers and mutual funds to create proper relationships
    const customers = await db.collection('customer').find({}, { projection: { id: 1 } }).toArray();
    const mutualFunds = await db.collection('mutual_fund').find({}, { projection: { id: 1 } }).toArray();
    
    if (customers.length === 0 || mutualFunds.length === 0) {
        throw new Error('No customers or mutual funds found. Please insert customers and mutual funds first.');
    }
    
    console.log(`Found ${customers.length} customers and ${mutualFunds.length} mutual funds`);
    
    const paymentStatuses = [
        "Pending",
        "Processing", 
        "Completed",
        "Failed",
        "Cancelled",
        "Refunded"
    ];
    
    // Weight the payment statuses to make them more realistic
    const weightedStatuses = [
        ...Array(50).fill("Completed"),     // 50% completed
        ...Array(20).fill("Processing"),    // 20% processing
        ...Array(15).fill("Pending"),       // 15% pending
        ...Array(8).fill("Failed"),         // 8% failed
        ...Array(5).fill("Cancelled"),      // 5% cancelled
        ...Array(2).fill("Refunded")        // 2% refunded
    ];
    
    const orders = [];
    
    // Generate 100 orders
    for (let i = 1; i <= 100; i++) {
        // Randomly select customer and mutual fund
        const randomCustomer = customers[Math.floor(Math.random() * customers.length)];
        const randomMutualFund = mutualFunds[Math.floor(Math.random() * mutualFunds.length)];
        
        const order = {
            id: i,
            customer_id: randomCustomer.id,
            investment_id: randomMutualFund.id, // This refers to mutual fund ID
            amount: generateRandomAmount(),
            payment_status: weightedStatuses[Math.floor(Math.random() * weightedStatuses.length)]
        };
        
        orders.push(order);
    }
    
    return orders;
}

// Function to get customer and fund details for display
async function getOrderDetails(client, orders) {
    const db = client.db('financeai');
    
    const orderDetails = [];
    
    for (const order of orders.slice(0, 10)) { // Get details for first 10 orders
        const customer = await db.collection('customer').findOne(
            { id: order.customer_id }, 
            { projection: { name: 1, email: 1, rayi_customer_id: 1 } }
        );
        
        const mutualFund = await db.collection('mutual_fund').findOne(
            { id: order.investment_id }, 
            { projection: { fund_name: 1, amc_name: 1, risk: 1 } }
        );
        
        orderDetails.push({
            ...order,
            customer_name: customer?.name || 'Unknown',
            customer_email: customer?.email || 'Unknown',
            rayi_customer_id: customer?.rayi_customer_id || 'Unknown',
            fund_name: mutualFund?.fund_name || 'Unknown',
            amc_name: mutualFund?.amc_name || 'Unknown',
            fund_risk: mutualFund?.risk || 'Unknown'
        });
    }
    
    return orderDetails;
}

// Main function to insert order data into MongoDB
async function insertOrderData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('order');
        
        // Generate order data
        console.log('Generating order data...');
        const orderData = await generateOrderData(client);
        
        // Insert data
        const result = await collection.insertMany(orderData);
        console.log(`Successfully inserted ${result.insertedCount} order records`);
        
        // Get detailed information for display
        const orderDetails = await getOrderDetails(client, orderData);
        
        // Display sample of inserted data with customer and fund details
        console.log('\nSample of Inserted Order Data:');
        orderDetails.forEach((order, index) => {
            console.log(`${index + 1}. Order ID: ${order.id}`);
            console.log(`   Customer: ${order.customer_name} (${order.rayi_customer_id})`);
            console.log(`   Email: ${order.customer_email}`);
            console.log(`   Fund: ${order.fund_name}`);
            console.log(`   AMC: ${order.amc_name}`);
            console.log(`   Risk Level: ${order.fund_risk}`);
            console.log(`   Amount: ₹${order.amount.toLocaleString('en-IN')}`);
            console.log(`   Payment Status: ${order.payment_status}`);
            console.log('   ---');
        });
        
        console.log(`\n... and ${orderData.length - 10} more orders`);
        
        // Display summary statistics
        console.log('\nOrder Summary:');
        const statusSummary = orderData.reduce((acc, order) => {
            acc[order.payment_status] = (acc[order.payment_status] || 0) + 1;
            return acc;
        }, {});
        
        console.log('Payment Status Distribution:');
        Object.entries(statusSummary).forEach(([status, count]) => {
            const percentage = ((count / orderData.length) * 100).toFixed(1);
            console.log(`  ${status}: ${count} orders (${percentage}%)`);
        });
        
        const totalAmount = orderData.reduce((sum, order) => sum + order.amount, 0);
        const avgAmount = totalAmount / orderData.length;
        
        console.log(`\nFinancial Summary:`);
        console.log(`  Total Investment Amount: ₹${totalAmount.toLocaleString('en-IN')}`);
        console.log(`  Average Order Amount: ₹${Math.round(avgAmount).toLocaleString('en-IN')}`);
        console.log(`  Largest Order: ₹${Math.max(...orderData.map(o => o.amount)).toLocaleString('en-IN')}`);
        console.log(`  Smallest Order: ₹${Math.min(...orderData.map(o => o.amount)).toLocaleString('en-IN')}`);
        
    } catch (error) {
        console.error('Error inserting data:', error);
    } finally {
        // Close connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertOrderData();