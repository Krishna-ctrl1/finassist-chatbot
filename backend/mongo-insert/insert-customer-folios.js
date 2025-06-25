const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Manually defined customer folio records
function generateCustomerFolioData() {
    const customerFolios = [
        { id: 1, customer_id: 101, mf_id: "MF001", amount: 50000, folio_number: "P5WRDF74UNAZ2", investment_id: 201, units: 4523.45, redeemable_amount: 52500, redeemable_units: 4523.45, invested_amount: 50000 },
        { id: 2, customer_id: 101, mf_id: "MF002", amount: 25000, folio_number: "Q8XKLM39BPQR5", investment_id: 202, units: 2156.78, redeemable_amount: 26750, redeemable_units: 2156.78, invested_amount: 25000 },
        { id: 3, customer_id: 102, mf_id: "MF001", amount: 75000, folio_number: "R3YHGF82CVBN4", investment_id: 203, units: 6785.12, redeemable_amount: 78750, redeemable_units: 6785.12, invested_amount: 75000 },
        { id: 4, customer_id: 103, mf_id: "MF003", amount: 100000, folio_number: "S9PLKJ56DFGH7", investment_id: 204, units: 8912.34, redeemable_amount: 105000, redeemable_units: 8912.34, invested_amount: 100000 },
        { id: 5, customer_id: 103, mf_id: "MF004", amount: 30000, folio_number: "T7MNBV21QWER8", investment_id: 205, units: 2834.67, redeemable_amount: 31500, redeemable_units: 2834.67, invested_amount: 30000 },
        { id: 6, customer_id: 104, mf_id: "MF002", amount: 60000, folio_number: "U4ASDF98ZXCV3", investment_id: 206, units: 5176.89, redeemable_amount: 63000, redeemable_units: 5176.89, invested_amount: 60000 },
        { id: 7, customer_id: 105, mf_id: "MF005", amount: 80000, folio_number: "V1QWER45TYUI6", investment_id: 207, units: 7234.56, redeemable_amount: 84000, redeemable_units: 7234.56, invested_amount: 80000 },
        { id: 8, customer_id: 106, mf_id: "MF001", amount: 45000, folio_number: "W8HJKL23UIOP9", investment_id: 208, units: 4071.23, redeemable_amount: 47250, redeemable_units: 4071.23, invested_amount: 45000 },
        { id: 9, customer_id: 106, mf_id: "MF006", amount: 35000, folio_number: "X5BNMQ67ASDF1", investment_id: 209, units: 3298.45, redeemable_amount: 36750, redeemable_units: 3298.45, invested_amount: 35000 },
        { id: 10, customer_id: 107, mf_id: "MF003", amount: 90000, folio_number: "Y2VCXZ89QWER4", investment_id: 210, units: 8021.78, redeemable_amount: 94500, redeemable_units: 8021.78, invested_amount: 90000 },
        { id: 11, customer_id: 108, mf_id: "MF007", amount: 55000, folio_number: "Z9POIU34MNBV7", investment_id: 211, units: 5123.67, redeemable_amount: 57750, redeemable_units: 5123.67, invested_amount: 55000 },
        { id: 12, customer_id: 109, mf_id: "MF002", amount: 40000, folio_number: "A6LKJH78XCVB2", investment_id: 212, units: 3456.89, redeemable_amount: 42000, redeemable_units: 3456.89, invested_amount: 40000 },
        { id: 13, customer_id: 109, mf_id: "MF008", amount: 65000, folio_number: "B3FDSA12QWER5", investment_id: 213, units: 6087.23, redeemable_amount: 68250, redeemable_units: 6087.23, invested_amount: 65000 },
        { id: 14, customer_id: 110, mf_id: "MF004", amount: 70000, folio_number: "C8RTYH56ZXCV8", investment_id: 214, units: 6612.45, redeemable_amount: 73500, redeemable_units: 6612.45, invested_amount: 70000 },
        { id: 15, customer_id: 111, mf_id: "MF001", amount: 85000, folio_number: "D5YUIP90BNMQ3", investment_id: 215, units: 7689.12, redeemable_amount: 89250, redeemable_units: 7689.12, invested_amount: 85000 },
        { id: 16, customer_id: 112, mf_id: "MF009", amount: 48000, folio_number: "E2GHBN23ASDF6", investment_id: 216, units: 4523.78, redeemable_amount: 50400, redeemable_units: 4523.78, invested_amount: 48000 },
        { id: 17, customer_id: 113, mf_id: "MF005", amount: 95000, folio_number: "F7MJNB67QWER9", investment_id: 217, units: 8598.34, redeemable_units: 8598.34, redeemable_amount: 99750, invested_amount: 95000 },
        { id: 18, customer_id: 114, mf_id: "MF010", amount: 32000, folio_number: "G4VCXZ01TYUI1", investment_id: 218, units: 3012.56, redeemable_amount: 33600, redeemable_units: 3012.56, invested_amount: 32000 },
        { id: 19, customer_id: 114, mf_id: "MF003", amount: 58000, folio_number: "H1PLMN45ZXCV4", investment_id: 219, units: 5167.89, redeemable_amount: 60900, redeemable_units: 5167.89, invested_amount: 58000 },
        { id: 20, customer_id: 115, mf_id: "MF006", amount: 72000, folio_number: "I8QWER78BNMQ7", investment_id: 220, units: 6789.23, redeemable_amount: 75600, redeemable_units: 6789.23, invested_amount: 72000 },
        { id: 21, customer_id: 116, mf_id: "MF002", amount: 41000, folio_number: "J5ASDF12UIOP2", investment_id: 221, units: 3543.67, redeemable_amount: 43050, redeemable_units: 3543.67, invested_amount: 41000 },
        { id: 22, customer_id: 117, mf_id: "MF007", amount: 67000, folio_number: "K2HJKL56MNBV5", investment_id: 222, units: 6234.45, redeemable_amount: 70350, redeemable_units: 6234.45, invested_amount: 67000 },
        { id: 23, customer_id: 118, mf_id: "MF001", amount: 53000, folio_number: "L9TYUI89QWER8", investment_id: 223, units: 4798.12, redeemable_amount: 55650, redeemable_units: 4798.12, invested_amount: 53000 },
        { id: 24, customer_id: 119, mf_id: "MF008", amount: 88000, folio_number: "M6BNMQ23ZXCV0", investment_id: 224, units: 8234.56, redeemable_amount: 92400, redeemable_units: 8234.56, invested_amount: 88000 },
        { id: 25, customer_id: 120, mf_id: "MF004", amount: 46000, folio_number: "N3VCXZ67ASDF3", investment_id: 225, units: 4345.78, redeemable_amount: 48300, redeemable_units: 4345.78, invested_amount: 46000 },
        { id: 26, customer_id: 121, mf_id: "MF009", amount: 79000, folio_number: "O8PLMN01TYUI6", investment_id: 226, units: 7456.89, redeemable_amount: 82950, redeemable_units: 7456.89, invested_amount: 79000 },
        { id: 27, customer_id: 122, mf_id: "MF010", amount: 38000, folio_number: "P5QWER34BNMQ9", investment_id: 227, units: 3587.23, redeemable_amount: 39900, redeemable_units: 3587.23, invested_amount: 38000 },
        { id: 28, customer_id: 123, mf_id: "MF005", amount: 62000, folio_number: "Q2ASDF78UIOP1", investment_id: 228, units: 5612.45, redeemable_amount: 65100, redeemable_units: 5612.45, invested_amount: 62000 },
        { id: 29, customer_id: 124, mf_id: "MF001", amount: 51000, folio_number: "R9HJKL12ZXCV4", investment_id: 229, units: 4612.34, redeemable_amount: 53550, redeemable_units: 4612.34, invested_amount: 51000 },
        { id: 30, customer_id: 125, mf_id: "MF006", amount: 74000, folio_number: "S6TYUI45MNBV7", investment_id: 230, units: 6987.56, redeemable_amount: 77700, redeemable_units: 6987.56, invested_amount: 74000 }
    ];
    
    return customerFolios;
}

// Main function to insert customer folio data into MongoDB
async function insertCustomerFolioData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_folio');
        
        // Generate customer folio data
        const customerFolioData = generateCustomerFolioData();
        
        // Insert data
        const result = await collection.insertMany(customerFolioData);
        console.log(`Successfully inserted ${result.insertedCount} customer folio records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Folio Data:');
        customerFolioData.forEach((folio, index) => {
            console.log(`${index + 1}. ID: ${folio.id}, Customer: ${folio.customer_id}, MF: ${folio.mf_id}`);
            console.log(`   Amount: ₹${folio.amount}, Folio: ${folio.folio_number}`);
            console.log(`   Investment ID: ${folio.investment_id}, Units: ${folio.units}`);
            console.log(`   Redeemable: ₹${folio.redeemable_amount} (${folio.redeemable_units} units)`);
            console.log(`   Invested Amount: ₹${folio.invested_amount}`);
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
insertCustomerFolioData();