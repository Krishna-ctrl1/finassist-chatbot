const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Manually defined 25 customer detail records
function generateCustomerDetailData() {
    const customerDetails = [
        { customer_id: 101, name_on_pan: "JOHN WILLIAM SMITH", name: "John Smith" },
        { customer_id: 102, name_on_pan: "JANE MARIE DOE", name: "Jane Doe" },
        { customer_id: 103, name_on_pan: "MICHAEL ROBERT JOHNSON", name: "Mike Johnson" },
        { customer_id: 104, name_on_pan: "SARAH ELIZABETH WILLIAMS", name: "Sarah Williams" },
        { customer_id: 105, name_on_pan: "DAVID ALEXANDER BROWN", name: "David Brown" },
        { customer_id: 106, name_on_pan: "EMMA GRACE DAVIS", name: "Emma Davis" },
        { customer_id: 107, name_on_pan: "CHRISTOPHER JAMES MILLER", name: "Chris Miller" },
        { customer_id: 108, name_on_pan: "LISA ANN WILSON", name: "Lisa Wilson" },
        { customer_id: 109, name_on_pan: "THOMAS EDWARD MOORE", name: "Tom Moore" },
        { customer_id: 110, name_on_pan: "ANNA MARIE TAYLOR", name: "Anna Taylor" },
        { customer_id: 111, name_on_pan: "MARK STEVEN ANDERSON", name: "Mark Anderson" },
        { customer_id: 112, name_on_pan: "LUCY ROSE THOMAS", name: "Lucy Thomas" },
        { customer_id: 113, name_on_pan: "ALEXANDER PAUL JACKSON", name: "Alex Jackson" },
        { customer_id: 114, name_on_pan: "MARY CATHERINE WHITE", name: "Mary White" },
        { customer_id: 115, name_on_pan: "PAUL RICHARD HARRIS", name: "Paul Harris" },
        { customer_id: 116, name_on_pan: "KATHERINE LYNN MARTIN", name: "Kate Martin" },
        { customer_id: 117, name_on_pan: "STEVEN MICHAEL THOMPSON", name: "Steve Thompson" },
        { customer_id: 118, name_on_pan: "AMY NICOLE GARCIA", name: "Amy Garcia" },
        { customer_id: 119, name_on_pan: "NICHOLAS JAMES MARTINEZ", name: "Nick Martinez" },
        { customer_id: 120, name_on_pan: "JENNIFER LYNN ROBINSON", name: "Jennifer Robinson" },
        { customer_id: 121, name_on_pan: "ROBERT CHARLES CLARK", name: "Robert Clark" },
        { customer_id: 122, name_on_pan: "SUSAN MARIE RODRIGUEZ", name: "Susan Rodriguez" },
        { customer_id: 123, name_on_pan: "DANIEL JOSEPH LEWIS", name: "Daniel Lewis" },
        { customer_id: 124, name_on_pan: "KIMBERLY ANN LEE", name: "Kimberly Lee" },
        { customer_id: 125, name_on_pan: "JOSEPH ANTHONY WALKER", name: "Joseph Walker" }
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