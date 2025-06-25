const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Salt rounds for bcrypt (10 is a good balance between security and performance)
const SALT_ROUNDS = 10;

// Manually defined 25 customer records
function generateCustomerData() {
    const customers = [
        { id: 101, rayi_customer_id: "RAYI1001", name: "John Smith", email: "john.smith@gmail.com", password: "abcd1234" },
        { id: 102, rayi_customer_id: "RAYI1002", name: "Jane Doe", email: "jane.doe@yahoo.com", password: "abcd1234" },
        { id: 103, rayi_customer_id: "RAYI1003", name: "Mike Johnson", email: "mike.johnson@outlook.com", password: "abcd1234" },
        { id: 104, rayi_customer_id: "RAYI1004", name: "Sarah Williams", email: "sarah.williams@hotmail.com", password: "abcd1234" },
        { id: 105, rayi_customer_id: "RAYI1005", name: "David Brown", email: "david.brown@gmail.com", password: "abcd1234" },
        { id: 106, rayi_customer_id: "RAYI1006", name: "Emma Davis", email: "emma.davis@company.com", password: "abcd1234" },
        { id: 107, rayi_customer_id: "RAYI1007", name: "Chris Miller", email: "chris.miller@yahoo.com", password: "abcd1234" },
        { id: 108, rayi_customer_id: "RAYI1008", name: "Lisa Wilson", email: "lisa.wilson@gmail.com", password: "abcd1234" },
        { id: 109, rayi_customer_id: "RAYI1009", name: "Tom Moore", email: "tom.moore@outlook.com", password: "abcd1234" },
        { id: 110, rayi_customer_id: "RAYI1010", name: "Anna Taylor", email: "anna.taylor@hotmail.com", password: "abcd1234" },
        { id: 111, rayi_customer_id: "RAYI1011", name: "Mark Anderson", email: "mark.anderson@gmail.com", password: "abcd1234" },
        { id: 112, rayi_customer_id: "RAYI1012", name: "Lucy Thomas", email: "lucy.thomas@company.com", password: "abcd1234" },
        { id: 113, rayi_customer_id: "RAYI1013", name: "Alex Jackson", email: "alex.jackson@yahoo.com", password: "abcd1234" },
        { id: 114, rayi_customer_id: "RAYI1014", name: "Mary White", email: "mary.white@gmail.com", password: "abcd1234" },
        { id: 115, rayi_customer_id: "RAYI1015", name: "Paul Harris", email: "paul.harris@outlook.com", password: "abcd1234" },
        { id: 116, rayi_customer_id: "RAYI1016", name: "Kate Martin", email: "kate.martin@hotmail.com", password: "abcd1234" },
        { id: 117, rayi_customer_id: "RAYI1017", name: "Steve Thompson", email: "steve.thompson@gmail.com", password: "abcd1234" },
        { id: 118, rayi_customer_id: "RAYI1018", name: "Amy Garcia", email: "amy.garcia@company.com", password: "abcd1234" },
        { id: 119, rayi_customer_id: "RAYI1019", name: "Nick Martinez", email: "nick.martinez@yahoo.com", password: "abcd1234" },
        { id: 120, rayi_customer_id: "RAYI1020", name: "Jennifer Robinson", email: "jennifer.robinson@gmail.com", password: "abcd1234" },
        { id: 121, rayi_customer_id: "RAYI1021", name: "Robert Clark", email: "robert.clark@outlook.com", password: "abcd1234" },
        { id: 122, rayi_customer_id: "RAYI1022", name: "Susan Rodriguez", email: "susan.rodriguez@hotmail.com", password: "abcd1234" },
        { id: 123, rayi_customer_id: "RAYI1023", name: "Daniel Lewis", email: "daniel.lewis@gmail.com", password: "abcd1234" },
        { id: 124, rayi_customer_id: "RAYI1024", name: "Kimberly Lee", email: "kimberly.lee@company.com", password: "abcd1234" },
        { id: 125, rayi_customer_id: "RAYI1025", name: "Joseph Walker", email: "joseph.walker@yahoo.com", password: "abcd1234" }
    ];
    
    return customers;
}

// Function to hash passwords for all customers
async function hashCustomerPasswords(customers) {
    console.log('Hashing passwords...');
    
    const hashedCustomers = await Promise.all(
        customers.map(async (customer) => {
            const hashedPassword = await bcrypt.hash(customer.password, SALT_ROUNDS);
            return {
                ...customer,
                password: hashedPassword
            };
        })
    );
    
    console.log('All passwords hashed successfully');
    return hashedCustomers;
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
        
        // Hash passwords before insertion
        const hashedCustomerData = await hashCustomerPasswords(customerData);
        
        // Insert data
        const result = await collection.insertMany(hashedCustomerData);
        console.log(`Successfully inserted ${result.insertedCount} customer records`);
        
        // Display the inserted data (without showing hashed passwords for security)
        console.log('\nInserted Customer Data:');
        hashedCustomerData.forEach((customer, index) => {
            console.log(`${index + 1}. ID: ${customer.id}, RAYI: ${customer.rayi_customer_id}, Email: ${customer.email}, Password: [HASHED]`);
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