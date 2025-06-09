const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Function to generate realistic Indian account numbers (11-16 digits)
function generateAccountNumber() {
    const length = Math.floor(Math.random() * 6) + 11; // Random length between 11-16
    let accountNumber = '';
    for (let i = 0; i < length; i++) {
        accountNumber += Math.floor(Math.random() * 10);
    }
    return accountNumber;
}

// Array of popular Indian bank IFSC codes
const indianIFSCCodes = [
    'SBIN0001234', // State Bank of India
    'HDFC0001234', // HDFC Bank
    'ICIC0001234', // ICICI Bank
    'KKBK0001234', // Kotak Mahindra Bank
    'AXIS0001234', // Axis Bank
    'PUNB0012340', // Punjab National Bank
    'UBIN0012340', // Union Bank of India
    'BARB0KANDIV', // Bank of Baroda
    'CNRB0001234', // Canara Bank
    'IDBI000A123', // IDBI Bank
    'YESB0001234', // Yes Bank
    'IBKL0001234', // IDFC First Bank
    'INDB0001234', // Indian Bank
    'IOBA0001234', // Indian Overseas Bank
    'ORBC0001234', // Oriental Bank of Commerce
    'CORP0001234', // Corporation Bank
    'ALLA0001234', // Allahabad Bank
    'BKID0001234', // Bank of India
    'MAHB0001234', // Bank of Maharashtra
    'CBIN0001234'  // Central Bank of India
];

// Manually defined 25 customer detail records with Indian banking information
function generateCustomerDetailData() {
    const customerDetails = [
        { customer_id: 101, name_on_pan: "JOHN WILLIAM SMITH", name: "John Smith", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[0] },
        { customer_id: 102, name_on_pan: "JANE MARIE DOE", name: "Jane Doe", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[1] },
        { customer_id: 103, name_on_pan: "MICHAEL ROBERT JOHNSON", name: "Mike Johnson", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[2] },
        { customer_id: 104, name_on_pan: "SARAH ELIZABETH WILLIAMS", name: "Sarah Williams", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[3] },
        { customer_id: 105, name_on_pan: "DAVID ALEXANDER BROWN", name: "David Brown", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[4] },
        { customer_id: 106, name_on_pan: "EMMA GRACE DAVIS", name: "Emma Davis", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[5] },
        { customer_id: 107, name_on_pan: "CHRISTOPHER JAMES MILLER", name: "Chris Miller", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[6] },
        { customer_id: 108, name_on_pan: "LISA ANN WILSON", name: "Lisa Wilson", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[7] },
        { customer_id: 109, name_on_pan: "THOMAS EDWARD MOORE", name: "Tom Moore", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[8] },
        { customer_id: 110, name_on_pan: "ANNA MARIE TAYLOR", name: "Anna Taylor", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[9] },
        { customer_id: 111, name_on_pan: "MARK STEVEN ANDERSON", name: "Mark Anderson", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[10] },
        { customer_id: 112, name_on_pan: "LUCY ROSE THOMAS", name: "Lucy Thomas", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[11] },
        { customer_id: 113, name_on_pan: "ALEXANDER PAUL JACKSON", name: "Alex Jackson", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[12] },
        { customer_id: 114, name_on_pan: "MARY CATHERINE WHITE", name: "Mary White", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[13] },
        { customer_id: 115, name_on_pan: "PAUL RICHARD HARRIS", name: "Paul Harris", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[14] },
        { customer_id: 116, name_on_pan: "KATHERINE LYNN MARTIN", name: "Kate Martin", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[15] },
        { customer_id: 117, name_on_pan: "STEVEN MICHAEL THOMPSON", name: "Steve Thompson", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[16] },
        { customer_id: 118, name_on_pan: "AMY NICOLE GARCIA", name: "Amy Garcia", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[17] },
        { customer_id: 119, name_on_pan: "NICHOLAS JAMES MARTINEZ", name: "Nick Martinez", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[18] },
        { customer_id: 120, name_on_pan: "JENNIFER LYNN ROBINSON", name: "Jennifer Robinson", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[19] },
        { customer_id: 121, name_on_pan: "ROBERT CHARLES CLARK", name: "Robert Clark", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[0] },
        { customer_id: 122, name_on_pan: "SUSAN MARIE RODRIGUEZ", name: "Susan Rodriguez", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[1] },
        { customer_id: 123, name_on_pan: "DANIEL JOSEPH LEWIS", name: "Daniel Lewis", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[2] },
        { customer_id: 124, name_on_pan: "KIMBERLY ANN LEE", name: "Kimberly Lee", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[3] },
        { customer_id: 125, name_on_pan: "JOSEPH ANTHONY WALKER", name: "Joseph Walker", account_number: generateAccountNumber(), ifsc_code: indianIFSCCodes[4] }
    ];
    
    return customerDetails;
}

// Main function to insert customer detail data into MongoDB
async function insertCustomerDetailData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_detail');
        
        // Generate customer detail data
        const customerDetailData = generateCustomerDetailData();
        
        // Insert data
        const result = await collection.insertMany(customerDetailData);
        console.log(`Successfully inserted ${result.insertedCount} customer detail records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Detail Data:');
        customerDetailData.forEach((detail, index) => {
            console.log(`${index + 1}. Customer ID: ${detail.customer_id}`);
            console.log(`   Name on PAN: ${detail.name_on_pan}`);
            console.log(`   Name: ${detail.name}`);
            console.log(`   Account Number: ${detail.account_number}`);
            console.log(`   IFSC Code: ${detail.ifsc_code}`);
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
insertCustomerDetailData();