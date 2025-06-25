const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Array of popular UPI providers
const upiProviders = [
    'paytm', 'phonepe', 'googlepay', 'bhim', 'amazonpay', 'whatsapp', 
    'mobikwik', 'freecharge', 'ybl', 'ibl', 'okmaxis', 'okhdfc', 'okicici'
];

// Function to generate UPI ID based on customer email and random provider
function generateUpiId(email, customerName) {
    const provider = upiProviders[Math.floor(Math.random() * upiProviders.length)];
    const emailUsername = email.split('@')[0];
    
    // Different UPI ID patterns
    const patterns = [
        `${emailUsername}@${provider}`,
        `${customerName.toLowerCase().replace(/\s+/g, '')}@${provider}`,
        `${emailUsername}${Math.floor(Math.random() * 999)}@${provider}`,
        `${customerName.toLowerCase().replace(/\s+/g, '').substring(0, 8)}@${provider}`
    ];
    
    return patterns[Math.floor(Math.random() * patterns.length)];
}

// Generate UPI data for existing customers (IDs 101-125)
function generateCustomerUpiData() {
    const customers = [
        { id: 101, name: "John Smith", email: "john.smith@gmail.com" },
        { id: 102, name: "Jane Doe", email: "jane.doe@yahoo.com" },
        { id: 103, name: "Mike Johnson", email: "mike.johnson@outlook.com" },
        { id: 104, name: "Sarah Williams", email: "sarah.williams@hotmail.com" },
        { id: 105, name: "David Brown", email: "david.brown@gmail.com" },
        { id: 106, name: "Emma Davis", email: "emma.davis@company.com" },
        { id: 107, name: "Chris Miller", email: "chris.miller@yahoo.com" },
        { id: 108, name: "Lisa Wilson", email: "lisa.wilson@gmail.com" },
        { id: 109, name: "Tom Moore", email: "tom.moore@outlook.com" },
        { id: 110, name: "Anna Taylor", email: "anna.taylor@hotmail.com" },
        { id: 111, name: "Mark Anderson", email: "mark.anderson@gmail.com" },
        { id: 112, name: "Lucy Thomas", email: "lucy.thomas@company.com" },
        { id: 113, name: "Alex Jackson", email: "alex.jackson@yahoo.com" },
        { id: 114, name: "Mary White", email: "mary.white@gmail.com" },
        { id: 115, name: "Paul Harris", email: "paul.harris@outlook.com" },
        { id: 116, name: "Kate Martin", email: "kate.martin@hotmail.com" },
        { id: 117, name: "Steve Thompson", email: "steve.thompson@gmail.com" },
        { id: 118, name: "Amy Garcia", email: "amy.garcia@company.com" },
        { id: 119, name: "Nick Martinez", email: "nick.martinez@yahoo.com" },
        { id: 120, name: "Jennifer Robinson", email: "jennifer.robinson@gmail.com" },
        { id: 121, name: "Robert Clark", email: "robert.clark@outlook.com" },
        { id: 122, name: "Susan Rodriguez", email: "susan.rodriguez@hotmail.com" },
        { id: 123, name: "Daniel Lewis", email: "daniel.lewis@gmail.com" },
        { id: 124, name: "Kimberly Lee", email: "kimberly.lee@company.com" },
        { id: 125, name: "Joseph Walker", email: "joseph.walker@yahoo.com" }
    ];
    
    return customers.map(customer => {
        // Some customers might have multiple UPI IDs, others might have none
        const hasUpi = Math.random() > 0.1; // 90% customers have UPI
        
        if (!hasUpi) {
            return null;
        }
        
        const numUpiIds = Math.random() > 0.6 ? 2 : 1; // 40% have 2 UPI IDs
        const upiIds = [];
        
        for (let i = 0; i < numUpiIds; i++) {
            upiIds.push({
                upi_id: generateUpiId(customer.email, customer.name),
                provider: upiProviders[Math.floor(Math.random() * upiProviders.length)],
                is_primary: i === 0,
                is_verified: Math.random() > 0.05, // 95% are verified
                added_date: new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
            });
        }
        
        return {
            customer_id: customer.id,
            customer_name: customer.name,
            upi_details: upiIds,
            total_upi_ids: upiIds.length,
            created_at: new Date(),
            updated_at: new Date()
        };
    }).filter(record => record !== null);
}

// Main function to insert UPI data into MongoDB
async function insertCustomerUpiData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_upi');
        
        // Generate UPI data
        const upiData = generateCustomerUpiData();
        
        // Insert data
        const result = await collection.insertMany(upiData);
        console.log(`Successfully inserted ${result.insertedCount} customer UPI records`);
        
        // Display the inserted data
        console.log('\nInserted Customer UPI Data:');
        upiData.forEach((upi, index) => {
            console.log(`${index + 1}. Customer ID: ${upi.customer_id} (${upi.customer_name})`);
            upi.upi_details.forEach((detail, idx) => {
                console.log(`   UPI ${idx + 1}: ${detail.upi_id} (${detail.provider}) - ${detail.is_primary ? 'Primary' : 'Secondary'} - ${detail.is_verified ? 'Verified' : 'Unverified'}`);
            });
            console.log('');
        });
        
    } catch (error) {
        console.error('Error inserting UPI data:', error);
    } finally {
        // Close connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertCustomerUpiData();
