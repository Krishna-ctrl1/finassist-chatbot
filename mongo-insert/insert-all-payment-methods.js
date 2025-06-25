const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting insertion of all customer payment methods...\n');

async function runScript(scriptName, description) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`📊 ${description}`);
            console.log('=' * 50);
            
            const scriptPath = path.join(__dirname, scriptName);
            const output = execSync(`node "${scriptPath}"`, { 
                encoding: 'utf8',
                stdio: 'inherit'
            });
            
            console.log(`✅ ${description} completed successfully!\n`);
            resolve(output);
        } catch (error) {
            console.error(`❌ Error in ${description}:`, error.message);
            reject(error);
        }
    });
}

async function insertAllPaymentMethods() {
    try {
        // Insert UPI payment methods
        await runScript('insert-customer-upi.js', 'Inserting UPI Payment Methods');
        
        // Wait a moment between insertions
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Insert bank account payment methods
        await runScript('insert-customer-bank-accounts.js', 'Inserting Bank Account Payment Methods');
        
        // Wait a moment between insertions
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Insert card payment methods
        await runScript('insert-customer-cards.js', 'Inserting Card Payment Methods');
        
        console.log('🎉 All payment methods have been successfully inserted into the database!');
        console.log('\n📋 Summary:');
        console.log('   • UPI Payment Methods -> Collection: customer_upi');
        console.log('   • Bank Accounts -> Collection: customer_bank_accounts');
        console.log('   • Credit/Debit Cards -> Collection: customer_cards');
        console.log('\nAll payment methods are linked to existing customers (IDs: 101-125)');
        
    } catch (error) {
        console.error('💥 Failed to insert all payment methods:', error.message);
        process.exit(1);
    }
}

// Run the master insertion
insertAllPaymentMethods();
