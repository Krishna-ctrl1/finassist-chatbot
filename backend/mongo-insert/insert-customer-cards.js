const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

// Card issuers and their BIN ranges (Bank Identification Numbers)
const cardIssuers = [
    { name: 'HDFC Bank', binPrefix: '4332', type: 'both' },
    { name: 'ICICI Bank', binPrefix: '4250', type: 'both' },
    { name: 'SBI Card', binPrefix: '4570', type: 'both' },
    { name: 'Axis Bank', binPrefix: '4565', type: 'both' },
    { name: 'Kotak Mahindra', binPrefix: '4985', type: 'both' },
    { name: 'Citibank', binPrefix: '5241', type: 'both' },
    { name: 'American Express', binPrefix: '3782', type: 'credit' },
    { name: 'Standard Chartered', binPrefix: '4162', type: 'both' },
    { name: 'YES Bank', binPrefix: '4847', type: 'both' },
    { name: 'IndusInd Bank', binPrefix: '4059', type: 'both' }
];

// Card networks
const cardNetworks = ['Visa', 'Mastercard', 'RuPay', 'American Express'];

// Card types
const cardTypes = ['Credit', 'Debit'];

// Function to generate card number
function generateCardNumber(binPrefix) {
    let cardNumber = binPrefix;
    // Add 8 more random digits
    for (let i = 0; i < 8; i++) {
        cardNumber += Math.floor(Math.random() * 10);
    }
    
    // Add Luhn algorithm check digit
    let sum = 0;
    let alternate = false;
    
    for (let i = cardNumber.length - 1; i >= 0; i--) {
        let n = parseInt(cardNumber.charAt(i), 10);
        if (alternate) {
            n *= 2;
            if (n > 9) {
                n = (n % 10) + 1;
            }
        }
        sum += n;
        alternate = !alternate;
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return cardNumber + checkDigit;
}

// Function to generate CVV
function generateCVV() {
    return String(Math.floor(Math.random() * 900) + 100);
}

// Function to generate expiry date (future dates only)
function generateExpiryDate() {
    const currentYear = new Date().getFullYear();
    const year = currentYear + Math.floor(Math.random() * 6) + 1; // 1-6 years from now
    const month = Math.floor(Math.random() * 12) + 1;
    return {
        month: String(month).padStart(2, '0'),
        year: String(year).slice(-2),
        formatted: `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`
    };
}

// Function to determine card network based on BIN
function getCardNetwork(cardNumber) {
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    const firstFour = cardNumber.substring(0, 4);
    
    if (firstDigit === '4') {
        return 'Visa';
    } else if (firstTwo >= '51' && firstTwo <= '55') {
        return 'Mastercard';
    } else if (firstTwo === '37' || firstTwo === '34') {
        return 'American Express';
    } else if (firstFour >= '6000' && firstFour <= '6999') {
        return 'RuPay';
    } else {
        return 'Visa'; // Default fallback
    }
}

// Generate card data for existing customers
function generateCustomerCardData() {
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
        // 80% customers have at least one card
        const hasCard = Math.random() > 0.2;
        
        if (!hasCard) {
            return null;
        }
        
        // 40% customers have multiple cards (2-4 cards)
        const numCards = Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 2 : 1;
        const cards = [];
        const usedIssuers = new Set();
        
        for (let i = 0; i < numCards; i++) {
            let selectedIssuer;
            do {
                selectedIssuer = cardIssuers[Math.floor(Math.random() * cardIssuers.length)];
            } while (usedIssuers.has(selectedIssuer.name) && usedIssuers.size < cardIssuers.length);
            
            usedIssuers.add(selectedIssuer.name);
            
            const cardNumber = generateCardNumber(selectedIssuer.binPrefix);
            const expiryDate = generateExpiryDate();
            const cvv = generateCVV();
            const network = getCardNetwork(cardNumber);
            
            // Determine card type
            let cardType;
            if (selectedIssuer.type === 'credit') {
                cardType = 'Credit';
            } else if (selectedIssuer.type === 'debit') {
                cardType = 'Debit';
            } else {
                cardType = cardTypes[Math.floor(Math.random() * cardTypes.length)];
            }
            
            // Mask card number for storage (show only last 4 digits)
            const maskedCardNumber = '**** **** **** ' + cardNumber.slice(-4);
            
            cards.push({
                card_number_masked: maskedCardNumber,
                card_number_last4: cardNumber.slice(-4),
                card_holder_name: customer.name.toUpperCase(),
                expiry_month: expiryDate.month,
                expiry_year: expiryDate.year,
                expiry_formatted: expiryDate.formatted,
                cvv_encrypted: cvv, // In real scenario, this should be encrypted
                card_type: cardType,
                card_network: network,
                issuing_bank: selectedIssuer.name,
                is_primary: i === 0,
                is_verified: Math.random() > 0.05, // 95% are verified
                is_active: Math.random() > 0.02, // 98% are active
                credit_limit: cardType === 'Credit' ? Math.floor(Math.random() * 500000) + 50000 : null,
                available_balance: cardType === 'Debit' ? Math.floor(Math.random() * 100000) + 5000 : null,
                added_date: new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
                last_used_date: Math.random() > 0.3 ? new Date(2024, Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1) : null
            });
        }
        
        return {
            customer_id: customer.id,
            customer_name: customer.name,
            cards: cards,
            total_cards: cards.length,
            active_cards: cards.filter(card => card.is_active).length,
            credit_cards: cards.filter(card => card.card_type === 'Credit').length,
            debit_cards: cards.filter(card => card.card_type === 'Debit').length,
            primary_card: cards.find(card => card.is_primary),
            created_at: new Date(),
            updated_at: new Date()
        };
    }).filter(record => record !== null);
}

// Main function to insert card data into MongoDB
async function insertCustomerCardData() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB');
        
        // Select database and collection
        const db = client.db('financeai');
        const collection = db.collection('customer_cards');
        
        // Generate card data
        const cardData = generateCustomerCardData();
        
        // Insert data
        const result = await collection.insertMany(cardData);
        console.log(`Successfully inserted ${result.insertedCount} customer card records`);
        
        // Display the inserted data
        console.log('\nInserted Customer Card Data:');
        cardData.forEach((cardRecord, index) => {
            console.log(`${index + 1}. Customer ID: ${cardRecord.customer_id} (${cardRecord.customer_name})`);
            console.log(`   Total Cards: ${cardRecord.total_cards} (${cardRecord.credit_cards} Credit, ${cardRecord.debit_cards} Debit)`);
            cardRecord.cards.forEach((card, idx) => {
                console.log(`   Card ${idx + 1}: ${card.card_number_masked} - ${card.card_type}`);
                console.log(`     Bank: ${card.issuing_bank} | Network: ${card.card_network}`);
                console.log(`     Expiry: ${card.expiry_formatted} | Status: ${card.is_primary ? 'Primary' : 'Secondary'} | ${card.is_verified ? 'Verified' : 'Unverified'} | ${card.is_active ? 'Active' : 'Inactive'}`);
                if (card.credit_limit) {
                    console.log(`     Credit Limit: ₹${card.credit_limit.toLocaleString()}`);
                }
                if (card.available_balance) {
                    console.log(`     Available Balance: ₹${card.available_balance.toLocaleString()}`);
                }
            });
            console.log('');
        });
        
    } catch (error) {
        console.error('Error inserting card data:', error);
    } finally {
        // Close connection
        await client.close();
        console.log('MongoDB connection closed');
    }
}

// Run the script
insertCustomerCardData();
