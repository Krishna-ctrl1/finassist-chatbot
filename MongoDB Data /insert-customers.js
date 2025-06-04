const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Manual customer data - no random generation

// Manually defined 25 customer records
function generateCustomerData() {
    const customers = [
        { id: 101, rayi_customer_id: "RAYI1001", email: "john.smith@gmail.com" },
        { id: 102, rayi_customer_id: "RAYI1002", email: "jane.doe@yahoo.com" },
        { id: 103, rayi_customer_id: "RAYI1003", email: "mike.johnson@outlook.com" },
        { id: 104, rayi_customer_id: "RAYI1004", email: "sarah.williams@hotmail.com" },
        { id: 105, rayi_customer_id: "RAYI1005", email: "david.brown@gmail.com" },
        { id: 106, rayi_customer_id: "RAYI1006", email: "emma.davis@company.com" },
        { id: 107, rayi_customer_id: "RAYI1007", email: "chris.miller@yahoo.com" },
        { id: 108, rayi_customer_id: "RAYI1008", email: "lisa.wilson@gmail.com" },
        { id: 109, rayi_customer_id: "RAYI1009", email: "tom.moore@outlook.com" },
        { id: 110, rayi_customer_id: "RAYI1010", email: "anna.taylor@hotmail.com" },
        { id: 111, rayi_customer_id: "RAYI1011", email: "mark.anderson@gmail.com" },
        { id: 112, rayi_customer_id: "RAYI1012", email: "lucy.thomas@company.com" },
        { id: 113, rayi_customer_id: "RAYI1013", email: "alex.jackson@yahoo.com" },
        { id: 114, rayi_customer_id: "RAYI1014", email: "mary.white@gmail.com" },
        { id: 115, rayi_customer_id: "RAYI1015", email: "paul.harris@outlook.com" },
        { id: 116, rayi_customer_id: "RAYI1016", email: "kate.martin@hotmail.com" },
        { id: 117, rayi_customer_id: "RAYI1017", email: "steve.thompson@gmail.com" },
        { id: 118, rayi_customer_id: "RAYI1018", email: "amy.garcia@company.com" },
        { id: 119, rayi_customer_id: "RAYI1019", email: "nick.martinez@yahoo.com" },
        { id: 120, rayi_customer_id: "RAYI1020", email: "jennifer.robinson@gmail.com" },
        { id: 121, rayi_customer_id: "RAYI1021", email: "robert.clark@outlook.com" },
        { id: 122, rayi_customer_id: "RAYI1022", email: "susan.rodriguez@hotmail.com" },
        { id: 123, rayi_customer_id: "RAYI1023", email: "daniel.lewis@gmail.com" },
        { id: 124, rayi_customer_id: "RAYI1024", email: "kimberly.lee@company.com" },
        { id: 125, rayi_customer_id: "RAYI1025", email: "joseph.walker@yahoo.com" }
    ];
    
    return customers;
}

// Main function to insert data into MongoDB
async function insertCustomerData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer');
        
        // Generate customer data
        const customerData = generateCustomerData();
        
        // Insert data
        const result = await collection.insertMany(customerData);
        console.log(`Successfully inserted ${result.insertedCount} customer records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Data:');
        customerData.forEach((customer, index) => {
            console.log(`${index + 1}. ID: ${customer.id}, RAYI: ${customer.rayi_customer_id}, Email: ${customer.email}`);
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
insertCustomerData();