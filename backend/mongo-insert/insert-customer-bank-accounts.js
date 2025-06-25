const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Indian bank names and their corresponding IFSC code patterns
const indianBanks = [
    { name: 'State Bank of India', ifscPattern: 'SBIN', shortName: 'SBI' },
    { name: 'HDFC Bank', ifscPattern: 'HDFC', shortName: 'HDFC' },
    { name: 'ICICI Bank', ifscPattern: 'ICIC', shortName: 'ICICI' },
    { name: 'Kotak Mahindra Bank', ifscPattern: 'KKBK', shortName: 'Kotak' },
    { name: 'Axis Bank', ifscPattern: 'AXIS', shortName: 'Axis' },
    { name: 'Punjab National Bank', ifscPattern: 'PUNB', shortName: 'PNB' },
    { name: 'Union Bank of India', ifscPattern: 'UBIN', shortName: 'Union Bank' },
    { name: 'Bank of Baroda', ifscPattern: 'BARB', shortName: 'BOB' },
    { name: 'Canara Bank', ifscPattern: 'CNRB', shortName: 'Canara' },
    { name: 'IDBI Bank', ifscPattern: 'IBKL', shortName: 'IDBI' },
    { name: 'Yes Bank', ifscPattern: 'YESB', shortName: 'Yes Bank' },
    { name: 'IDFC First Bank', ifscPattern: 'IDFB', shortName: 'IDFC First' },
    { name: 'Indian Bank', ifscPattern: 'INDB', shortName: 'Indian Bank' },
    { name: 'Bank of India', ifscPattern: 'BKID', shortName: 'BOI' }
];

// Account types
const accountTypes = ['Savings', 'Current', 'Salary'];

// Function to generate realistic Indian account number
function generateAccountNumber() {
    const length = Math.floor(Math.random() * 6) + 11; // 11-16 digits
    let accountNumber = '';
    for (let i = 0; i < length; i++) {
        accountNumber += Math.floor(Math.random() * 10);
    }
    return accountNumber;
}

// Function to generate IFSC code based on bank
function generateIfscCode(bankIfscPattern) {
    const branchCode = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    return `${bankIfscPattern}0${branchCode}`;
}

// Generate bank account data for existing customers
function generateCustomerBankData() {
    const customers = [
        { id: 101, name: "John Smith" },
        { id: 102, name: "Jane Doe" },
        { id: 103, name: "Mike Johnson" },
        { id: 104, name: "Sarah Williams" },
        { id: 105, name: "David Brown" },
        { id: 106, name: "Emma Davis" },
        { id: 107, name: "Chris Miller" },
        { id: 108, name: "Lisa Wilson" },
        { id: 109, name: "Tom Moore" },
        { id: 110, name: "Anna Taylor" },
        { id: 111, name: "Mark Anderson" },
        { id: 112, name: "Lucy Thomas" },
        { id: 113, name: "Alex Jackson" },
        { id: 114, name: "Mary White" },
        { id: 115, name: "Paul Harris" },
        { id: 116, name: "Kate Martin" },
        { id: 117, name: "Steve Thompson" },
        { id: 118, name: "Amy Garcia" },
        { id: 119, name: "Nick Martinez" },
        { id: 120, name: "Jennifer Robinson" },
        { id: 121, name: "Robert Clark" },
        { id: 122, name: "Susan Rodriguez" },
        { id: 123, name: "Daniel Lewis" },
        { id: 124, name: "Kimberly Lee" },
        { id: 125, name: "Joseph Walker" }
    ];
    
    return customers.map(customer => {
        // 85% customers have at least one bank account
        const hasBankAccount = Math.random() > 0.15;
        
        if (!hasBankAccount) {
            return null;
        }
        
        // 30% customers have multiple bank accounts
        const numAccounts = Math.random() > 0.7 ? Math.floor(Math.random() * 2) + 2 : 1;
        const bankAccounts = [];
        const usedBanks = new Set();
        
        for (let i = 0; i < numAccounts; i++) {
            let selectedBank;
            do {
                selectedBank = indianBanks[Math.floor(Math.random() * indianBanks.length)];
            } while (usedBanks.has(selectedBank.name) && usedBanks.size < indianBanks.length);
            
            usedBanks.add(selectedBank.name);
            
            const accountNumber = generateAccountNumber();
            const ifscCode = generateIfscCode(selectedBank.ifscPattern);
            
            bankAccounts.push({
                account_number: accountNumber,
                bank_name: selectedBank.name,
                bank_short_name: selectedBank.shortName,
                ifsc_code: ifscCode,
                account_type: accountTypes[Math.floor(Math.random() * accountTypes.length)],
                account_holder_name: customer.name.toUpperCase(),
                is_primary: i === 0,
                is_verified: Math.random() > 0.08, // 92% are verified
                branch_name: `${selectedBank.shortName} ${['Main', 'Central', 'City', 'Metro', 'Commercial'][Math.floor(Math.random() * 5)]} Branch`,
                added_date: new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
                last_verified_date: Math.random() > 0.2 ? new Date(2024, Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1) : null
            });
        }
        
        return {
            customer_id: customer.id,
            customer_name: customer.name,
            bank_accounts: bankAccounts,
            total_accounts: bankAccounts.length,
            primary_account: bankAccounts.find(acc => acc.is_primary),
            created_at: new Date(),
            updated_at: new Date()
        };
    }).filter(record => record !== null);
}

// Main function to insert bank account data into MongoDB
async function insertCustomerBankData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_bank_accounts');
        
        // Generate bank account data
        const bankData = generateCustomerBankData();
        
        // Insert data
        const result = await collection.insertMany(bankData);
        console.log(`Successfully inserted ${result.insertedCount} customer bank account records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Bank Account Data:');
        bankData.forEach((bank, index) => {
            console.log(`${index + 1}. Customer ID: ${bank.customer_id} (${bank.customer_name})`);
            console.log(`   Total Accounts: ${bank.total_accounts}`);
            bank.bank_accounts.forEach((account, idx) => {
                console.log(`   Account ${idx + 1}: ${account.account_number} - ${account.bank_name}`);
                console.log(`     IFSC: ${account.ifsc_code} | Type: ${account.account_type}`);
                console.log(`     Status: ${account.is_primary ? 'Primary' : 'Secondary'} | ${account.is_verified ? 'Verified' : 'Unverified'}`);
                console.log(`     Branch: ${account.branch_name}`);
            });
            console.log('');
        });
        
    } catch (error) {
        console.error('Error inserting bank account data:', error);
    } finally {
        // Close connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertCustomerBankData();
