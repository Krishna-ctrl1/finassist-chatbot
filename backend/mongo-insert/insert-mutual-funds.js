const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Function to generate dummy mutual fund data
function generateMutualFundData() {
    const amcNames = [
        "HDFC Asset Management Company Limited",
        "ICICI Prudential Asset Management Company Limited",
        "SBI Funds Management Private Limited",
        "Aditya Birla Sun Life Asset Management Company Limited",
        "Axis Asset Management Company Ltd",
        "Kotak Mahindra Asset Management Company Limited",
        "UTI Asset Management Company Limited",
        "DSP Investment Managers Private Limited",
        "Nippon Life India Asset Management Limited",
        "Franklin Templeton Asset Management (India) Private Ltd",
        "Mirae Asset Investment Managers (India) Private Limited",
        "Invesco Asset Management (India) Private Limited",
        "Tata Asset Management Private Limited",
        "Mahindra Manulife Mutual Fund",
        "PGIM India Asset Management Private Limited"
    ];

    const assetClasses = [
        { name: "Equity", id: 1 },
        { name: "Debt", id: 2 },
        { name: "Hybrid", id: 3 },
        { name: "Solution Oriented", id: 4 },
        { name: "Other", id: 5 }
    ];

    const subCategories = [
        { name: "Large Cap Fund", id: 101, asset_class_id: 1 },
        { name: "Mid Cap Fund", id: 102, asset_class_id: 1 },
        { name: "Small Cap Fund", id: 103, asset_class_id: 1 },
        { name: "Multi Cap Fund", id: 104, asset_class_id: 1 },
        { name: "Flexi Cap Fund", id: 105, asset_class_id: 1 },
        { name: "Liquid Fund", id: 201, asset_class_id: 2 },
        { name: "Ultra Short Duration Fund", id: 202, asset_class_id: 2 },
        { name: "Low Duration Fund", id: 203, asset_class_id: 2 },
        { name: "Medium Duration Fund", id: 204, asset_class_id: 2 },
        { name: "Long Duration Fund", id: 205, asset_class_id: 2 },
        { name: "Conservative Hybrid Fund", id: 301, asset_class_id: 3 },
        { name: "Aggressive Hybrid Fund", id: 302, asset_class_id: 3 },
        { name: "Balanced Advantage Fund", id: 303, asset_class_id: 3 },
        { name: "Retirement Fund", id: 401, asset_class_id: 4 },
        { name: "Children's Fund", id: 402, asset_class_id: 4 },
        { name: "Index Fund", id: 501, asset_class_id: 5 },
        { name: "ETF", id: 502, asset_class_id: 5 }
    ];

    const riskLevels = ["Low", "Low to Moderate", "Moderate", "Moderately High", "High", "Very High"];

    const mutualFunds = [];

    for (let i = 1; i <= 50; i++) {
        const amc = amcNames[Math.floor(Math.random() * amcNames.length)];
        const subCategory = subCategories[Math.floor(Math.random() * subCategories.length)];
        const assetClass = assetClasses.find(ac => ac.id === subCategory.asset_class_id);
        
        // Generate ISIN (Indian format: INF + 9 digits)
        const isin = `INF${String(Math.floor(100000000 + Math.random() * 900000000))}`;
        
        // Generate scheme code (6 digits)
        const schemeCode = String(100000 + i);
        
        // Generate AMFI code (6 digits)
        const amfiCode = String(100000 + i * 2);
        
        // Generate fund name based on AMC and sub-category
        const amcShortName = amc.split(' ')[0]; // Take first word of AMC name
        const fundName = `${amcShortName} ${subCategory.name}`;
        
        // Assign risk based on sub-category
        let risk;
        if (subCategory.asset_class_id === 1) { // Equity
            if (subCategory.name.includes("Large Cap")) risk = "Moderate";
            else if (subCategory.name.includes("Mid Cap")) risk = "Moderately High";
            else if (subCategory.name.includes("Small Cap")) risk = "High";
            else risk = "Moderately High";
        } else if (subCategory.asset_class_id === 2) { // Debt
            if (subCategory.name.includes("Liquid")) risk = "Low";
            else if (subCategory.name.includes("Ultra Short")) risk = "Low to Moderate";
            else risk = "Moderate";
        } else if (subCategory.asset_class_id === 3) { // Hybrid
            if (subCategory.name.includes("Conservative")) risk = "Moderate";
            else risk = "Moderately High";
        } else {
            risk = riskLevels[Math.floor(Math.random() * riskLevels.length)];
        }

        const mutualFund = {
            id: i,
            amc_name: amc,
            fund_name: fundName,
            isin: isin,
            scheme_code: schemeCode,
            risk: risk,
            asset_class: assetClass.name,
            asset_class_id: assetClass.id,
            sub_category: subCategory.name,
            sub_category_id: subCategory.id,
            amfi_code: amfiCode
        };

        mutualFunds.push(mutualFund);
    }

    return mutualFunds;
}

// Main function to insert mutual fund data into MongoDB
async function insertMutualFundData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('mutual_fund');
        
        // Generate mutual fund data
        const mutualFundData = generateMutualFundData();
        
        // Insert data
        const result = await collection.insertMany(mutualFundData);
        console.log(`Successfully inserted ${result.insertedCount} mutual fund records`);
        
        // Display sample of inserted data
        console.log('\nSample of Inserted Mutual Fund Data:');
        mutualFundData.slice(0, 5).forEach((fund, index) => {
            console.log(`${index + 1}. ID: ${fund.id}`);
            console.log(`   Fund Name: ${fund.fund_name}`);
            console.log(`   AMC: ${fund.amc_name}`);
            console.log(`   ISIN: ${fund.isin}`);
            console.log(`   Scheme Code: ${fund.scheme_code}`);
            console.log(`   Risk: ${fund.risk}`);
            console.log(`   Asset Class: ${fund.asset_class} (ID: ${fund.asset_class_id})`);
            console.log(`   Sub-Category: ${fund.sub_category} (ID: ${fund.sub_category_id})`);
            console.log(`   AMFI Code: ${fund.amfi_code}`);
            console.log('   ---');
        });
        
        console.log(`\n... and ${mutualFundData.length - 5} more records`);
        
        // Display summary by asset class
        console.log('\nSummary by Asset Class:');
        const summary = mutualFundData.reduce((acc, fund) => {
            acc[fund.asset_class] = (acc[fund.asset_class] || 0) + 1;
            return acc;
        }, {});
        
        Object.entries(summary).forEach(([assetClass, count]) => {
            console.log(`${assetClass}: ${count} funds`);
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
insertMutualFundData();