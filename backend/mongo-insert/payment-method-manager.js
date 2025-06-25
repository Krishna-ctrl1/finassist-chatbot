const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGO_URI = "mongodb+srv://Krishna:MERImarzi12345@cluster0.6zasjob.mongodb.net/financeai?retryWrites=true&w=majority&appName=Cluster0";

class PaymentMethodManager {
    constructor() {
        this.client = new MongoClient(MONGO_URI);
    }

    async connect() {
        await this.client.connect();
        this.db = this.client.db('financeai');
    }

    async disconnect() {
        await this.client.close();
    }

    // Fetch all payment methods for a customer
    async getAllPaymentMethods(customerId) {
        try {
            await this.connect();

            const upiCollection = this.db.collection('customer_upi');
            const bankCollection = this.db.collection('customer_bank_accounts');
            const cardCollection = this.db.collection('customer_cards');

            const [upiData, bankData, cardData] = await Promise.all([
                upiCollection.findOne({ customer_id: customerId }),
                bankCollection.findOne({ customer_id: customerId }),
                cardCollection.findOne({ customer_id: customerId })
            ]);

            const paymentMethods = {
                customer_id: customerId,
                has_payment_methods: false,
                upi: {
                    available: !!upiData,
                    count: upiData ? upiData.upi_details.length : 0,
                    methods: upiData ? upiData.upi_details : []
                },
                bank_accounts: {
                    available: !!bankData,
                    count: bankData ? bankData.bank_accounts.length : 0,
                    methods: bankData ? bankData.bank_accounts : []
                },
                cards: {
                    available: !!cardData,
                    count: cardData ? cardData.cards.length : 0,
                    methods: cardData ? cardData.cards : []
                }
            };

            paymentMethods.has_payment_methods = 
                paymentMethods.upi.available || 
                paymentMethods.bank_accounts.available || 
                paymentMethods.cards.available;

            return paymentMethods;

        } finally {
            await this.disconnect();
        }
    }

    // Get specific payment method type for a customer
    async getPaymentMethodsByType(customerId, type) {
        try {
            await this.connect();

            let collection, field;
            
            switch (type.toLowerCase()) {
                case 'upi':
                    collection = this.db.collection('customer_upi');
                    field = 'upi_details';
                    break;
                case 'bank':
                case 'bank_account':
                    collection = this.db.collection('customer_bank_accounts');
                    field = 'bank_accounts';
                    break;
                case 'card':
                case 'cards':
                    collection = this.db.collection('customer_cards');
                    field = 'cards';
                    break;
                default:
                    throw new Error(`Invalid payment method type: ${type}`);
            }

            const data = await collection.findOne({ customer_id: customerId });
            
            if (!data) {
                return {
                    customer_id: customerId,
                    type: type,
                    available: false,
                    count: 0,
                    methods: []
                };
            }

            return {
                customer_id: customerId,
                type: type,
                available: true,
                count: data[field].length,
                methods: data[field]
            };

        } finally {
            await this.disconnect();
        }
    }

    // Add new UPI payment method
    async addUpiMethod(customerId, upiId, provider = 'auto-detect') {
        try {
            await this.connect();
            const collection = this.db.collection('customer_upi');

            // Auto-detect provider from UPI ID
            if (provider === 'auto-detect') {
                const upiDomain = upiId.split('@')[1];
                provider = upiDomain || 'unknown';
            }

            const newUpiMethod = {
                upi_id: upiId,
                provider: provider,
                is_primary: false,
                is_verified: false,
                added_date: new Date()
            };

            // Check if customer already has UPI methods
            const existingData = await collection.findOne({ customer_id: customerId });

            if (existingData) {
                // Add to existing UPI methods
                const result = await collection.updateOne(
                    { customer_id: customerId },
                    {
                        $push: { upi_details: newUpiMethod },
                        $inc: { total_upi_ids: 1 },
                        $set: { updated_at: new Date() }
                    }
                );
                return { success: true, message: 'UPI method added successfully', upi_id: upiId };
            } else {
                // Create new UPI record for customer
                const customerData = await this.db.collection('customer').findOne({ id: customerId });
                const newRecord = {
                    customer_id: customerId,
                    customer_name: customerData ? customerData.name : 'Unknown',
                    upi_details: [{ ...newUpiMethod, is_primary: true }],
                    total_upi_ids: 1,
                    created_at: new Date(),
                    updated_at: new Date()
                };

                const result = await collection.insertOne(newRecord);
                return { success: true, message: 'UPI method created successfully', upi_id: upiId };
            }

        } catch (error) {
            return { success: false, message: `Error adding UPI method: ${error.message}` };
        } finally {
            await this.disconnect();
        }
    }

    // Add new bank account
    async addBankAccount(customerId, accountDetails) {
        try {
            await this.connect();
            const collection = this.db.collection('customer_bank_accounts');

            const newBankAccount = {
                account_number: accountDetails.account_number,
                bank_name: accountDetails.bank_name,
                bank_short_name: accountDetails.bank_short_name || accountDetails.bank_name.substring(0, 10),
                ifsc_code: accountDetails.ifsc_code,
                account_type: accountDetails.account_type || 'Savings',
                account_holder_name: accountDetails.account_holder_name,
                is_primary: false,
                is_verified: false,
                branch_name: accountDetails.branch_name || `${accountDetails.bank_name} Branch`,
                added_date: new Date(),
                last_verified_date: null
            };

            const existingData = await collection.findOne({ customer_id: customerId });

            if (existingData) {
                const result = await collection.updateOne(
                    { customer_id: customerId },
                    {
                        $push: { bank_accounts: newBankAccount },
                        $inc: { total_accounts: 1 },
                        $set: { updated_at: new Date() }
                    }
                );
                return { success: true, message: 'Bank account added successfully', account_number: accountDetails.account_number };
            } else {
                const customerData = await this.db.collection('customer').findOne({ id: customerId });
                const newRecord = {
                    customer_id: customerId,
                    customer_name: customerData ? customerData.name : 'Unknown',
                    bank_accounts: [{ ...newBankAccount, is_primary: true }],
                    total_accounts: 1,
                    primary_account: { ...newBankAccount, is_primary: true },
                    created_at: new Date(),
                    updated_at: new Date()
                };

                const result = await collection.insertOne(newRecord);
                return { success: true, message: 'Bank account created successfully', account_number: accountDetails.account_number };
            }

        } catch (error) {
            return { success: false, message: `Error adding bank account: ${error.message}` };
        } finally {
            await this.disconnect();
        }
    }

    // Add new card
    async addCard(customerId, cardDetails) {
        try {
            await this.connect();
            const collection = this.db.collection('customer_cards');

            // Mask card number
            const maskedCardNumber = '**** **** **** ' + cardDetails.card_number.slice(-4);

            const newCard = {
                card_number_masked: maskedCardNumber,
                card_number_last4: cardDetails.card_number.slice(-4),
                card_holder_name: cardDetails.card_holder_name,
                expiry_month: cardDetails.expiry_month,
                expiry_year: cardDetails.expiry_year,
                expiry_formatted: `${cardDetails.expiry_month}/${cardDetails.expiry_year}`,
                cvv_encrypted: cardDetails.cvv, // Should be encrypted in production
                card_type: cardDetails.card_type || 'Debit',
                card_network: cardDetails.card_network || 'Visa',
                issuing_bank: cardDetails.issuing_bank || 'Unknown Bank',
                is_primary: false,
                is_verified: false,
                is_active: true,
                credit_limit: cardDetails.card_type === 'Credit' ? cardDetails.credit_limit : null,
                available_balance: cardDetails.card_type === 'Debit' ? cardDetails.available_balance : null,
                added_date: new Date(),
                last_used_date: null
            };

            const existingData = await collection.findOne({ customer_id: customerId });

            if (existingData) {
                const result = await collection.updateOne(
                    { customer_id: customerId },
                    {
                        $push: { cards: newCard },
                        $inc: { 
                            total_cards: 1,
                            [`${cardDetails.card_type.toLowerCase()}_cards`]: 1
                        },
                        $set: { updated_at: new Date() }
                    }
                );
                return { success: true, message: 'Card added successfully', card_last4: cardDetails.card_number.slice(-4) };
            } else {
                const customerData = await this.db.collection('customer').findOne({ id: customerId });
                const newRecord = {
                    customer_id: customerId,
                    customer_name: customerData ? customerData.name : 'Unknown',
                    cards: [{ ...newCard, is_primary: true }],
                    total_cards: 1,
                    active_cards: 1,
                    credit_cards: cardDetails.card_type === 'Credit' ? 1 : 0,
                    debit_cards: cardDetails.card_type === 'Debit' ? 1 : 0,
                    primary_card: { ...newCard, is_primary: true },
                    created_at: new Date(),
                    updated_at: new Date()
                };

                const result = await collection.insertOne(newRecord);
                return { success: true, message: 'Card created successfully', card_last4: cardDetails.card_number.slice(-4) };
            }

        } catch (error) {
            return { success: false, message: `Error adding card: ${error.message}` };
        } finally {
            await this.disconnect();
        }
    }

    // Format payment methods for display
    formatPaymentMethodsForDisplay(paymentMethods) {
        const display = {
            summary: `Found ${paymentMethods.upi.count} UPI, ${paymentMethods.bank_accounts.count} Bank Accounts, ${paymentMethods.cards.count} Cards`,
            methods: []
        };

        // Format UPI methods
        if (paymentMethods.upi.available) {
            paymentMethods.upi.methods.forEach((upi, index) => {
                display.methods.push({
                    type: 'UPI',
                    id: `upi_${index}`,
                    display: `${upi.upi_id} (${upi.provider})`,
                    primary: upi.is_primary,
                    verified: upi.is_verified,
                    details: upi
                });
            });
        }

        // Format Bank methods
        if (paymentMethods.bank_accounts.available) {
            paymentMethods.bank_accounts.methods.forEach((bank, index) => {
                display.methods.push({
                    type: 'Bank Account',
                    id: `bank_${index}`,
                    display: `${bank.bank_short_name} - ****${bank.account_number.slice(-4)} (${bank.account_type})`,
                    primary: bank.is_primary,
                    verified: bank.is_verified,
                    details: bank
                });
            });
        }

        // Format Card methods
        if (paymentMethods.cards.available) {
            paymentMethods.cards.methods.forEach((card, index) => {
                display.methods.push({
                    type: 'Card',
                    id: `card_${index}`,
                    display: `${card.issuing_bank} ${card.card_type} ${card.card_number_masked} (${card.card_network})`,
                    primary: card.is_primary,
                    verified: card.is_verified,
                    details: card
                });
            });
        }

        return display;
    }
}

module.exports = PaymentMethodManager;

// Example usage function
async function demonstratePaymentFlow(customerId) {
    const manager = new PaymentMethodManager();
    
    try {
        console.log(`\n🔍 Checking payment methods for Customer ID: ${customerId}`);
        
        // Get all payment methods
        const allMethods = await manager.getAllPaymentMethods(customerId);
        
        if (allMethods.has_payment_methods) {
            console.log('✅ Customer has existing payment methods:');
            const display = manager.formatPaymentMethodsForDisplay(allMethods);
            console.log(`📊 ${display.summary}`);
            
            console.log('\n💳 Available Payment Methods:');
            display.methods.forEach((method, index) => {
                const status = method.verified ? '✅' : '⏳';
                const primary = method.primary ? '⭐ Primary' : '';
                console.log(`${index + 1}. ${status} ${method.display} ${primary}`);
            });
            
        } else {
            console.log('❌ No existing payment methods found');
            console.log('💡 Customer needs to add new payment method');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Test with existing customer
if (require.main === module) {
    demonstratePaymentFlow(101); // Test with customer ID 101
}
