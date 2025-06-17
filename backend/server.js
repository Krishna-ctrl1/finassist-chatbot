const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const apiRoutes = require('./routes/api');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const OpenAI = require('openai');
const stringSimilarity = require('string-similarity');
const axios = require('axios');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

let mongoClient;

// Initialize MongoDB connection
async function initMongoDB() {
    try {
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        console.log('MongoDB client connected for customer authentication');
        
        const db = mongoClient.db('financeai');
        try {
            await db.collection('chats').createIndex({ userId: 1, updatedAt: -1 });
            console.log('Chat collection indexes created');
        } catch (indexError) {
            console.log('Index may already exist:', indexError.message);
        }
    } catch (error) {
        console.error('MongoDB client connection error:', error);
    }
}

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windows
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/auth', authLimiter);

// Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// JWT middleware for authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Customer Authentication Routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const db = mongoClient.db('financeai');
        const customersCollection = db.collection('customer');

        const customer = await customersCollection.findOne({ email: email.toLowerCase() });
        
        if (!customer) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, customer.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign(
            { 
                _id: customer._id,
                userId: customer._id,
                id: customer._id,
                customerId: customer.id,
                rayiCustomerId: customer.rayi_customer_id,
                email: customer.email,
                name: customer.name
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                _id: customer._id,
                userId: customer._id,
                id: customer._id,
                customerId: customer.id,
                rayiCustomerId: customer.rayi_customer_id,
                name: customer.name,
                email: customer.email
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error during login' });
    }
});

async function getUserData(customerId) {
  try {
    const db = mongoClient.db('financeai');
    
    console.log('Fetching data for customerId:', customerId, 'Type:', typeof customerId);
    
    const numericCustomerId = parseInt(customerId);
    console.log('Converted to numeric customerId:', numericCustomerId);
    
    if (isNaN(numericCustomerId)) {
      console.error('Invalid customerId - cannot convert to number:', customerId);
      throw new Error('Invalid customer ID');
    }
    
    const customerExists = await db.collection('customer').findOne({ id: numericCustomerId });
    console.log('Customer verification:', customerExists ? `Found customer: ${customerExists.name}` : 'Customer not found');
    
    const allOrders = await db.collection('order').find({}).toArray();
    console.log('All orders in database:', allOrders.map(o => ({ id: o.id, customer_id: o.customer_id, amount: o.amount })));
    
    const testOrderQuery = await db.collection('order').find({ customer_id: numericCustomerId }).toArray();
    console.log('Direct order query result for customer_id', numericCustomerId, ':', testOrderQuery);
    
    const [
      customer,
      customerDetail,
      folios,
      performanceSummary,
      investmentPerformance,
      investmentReturns,
      orders
    ] = await Promise.all([
      db.collection('customer').findOne({ id: numericCustomerId }).catch(err => {
        console.error('Error fetching customer:', err);
        return null;
      }),
      db.collection('customer_detail').findOne({ customer_id: numericCustomerId }).catch(err => {
        console.error('Error fetching customer detail:', err);
        return null;
      }),
      db.collection('customer_folio').find({ customer_id: numericCustomerId }).toArray().catch(err => {
        console.error('Error fetching folios:', err);
        return [];
      }),
      db.collection('customer_investment_perf_summary').findOne({ customer_id: numericCustomerId }).catch(err => {
        console.error('Error fetching investment summary:', err);
        return null;
      }),
      db.collection('customer_investment_performance').find({ customer_id: numericCustomerId }).toArray().catch(err => {
        console.error('Error fetching investment performance:', err);
        return [];
      }),
      db.collection('customer_investment_returns').find({ customer_id: numericCustomerId }).toArray().catch(err => {
        console.error('Error fetching investment returns:', err);
        return [];
      }),
      db.collection('order').find({ customer_id: numericCustomerId }).toArray().catch(err => {
        console.error('Error fetching orders:', err);
        return [];
      })
    ]);

    console.log('Raw query results:');
    console.log('- Customer found:', !!customer, customer ? `(ID: ${customer.id}, Name: ${customer.name})` : '');
    console.log('- Orders query result:', orders); 
    console.log('- Orders count:', orders?.length || 0);
    console.log('- Orders details:', orders?.map(o => ({ id: o.id, customer_id: o.customer_id, amount: o.amount, payment_status: o.payment_status })));

    let orderDetails = [];
    if (orders && orders.length > 0) {
      console.log('Fetching order details for order IDs:', orders.map(o => o.id));
      orderDetails = await db.collection('order_detail').find({ 
        order_id: { $in: orders.map(o => o.id) } 
      }).toArray().catch(err => {
        console.error('Error fetching order details:', err);
        return [];
      });
      console.log('Order details fetched:', orderDetails.length);
    }

    const mfIds = [...new Set([
      ...(folios || []).map(f => f?.mf_id),
      ...(investmentReturns || []).map(r => r?.mf_id)
    ])].filter(id => id);
    
    let mutualFunds = [];
    if (mfIds.length > 0) {
      mutualFunds = await db.collection('mutual_fund').find({
        $or: [
          { id: { $in: mfIds } },
          { scheme_code: { $in: mfIds } }
        ]
      }).toArray().catch(err => {
        console.error('Error fetching mutual funds:', err);
        return [];
      });
    }

    console.log('Final data summary:', {
      customerFound: !!customer,
      customerName: customer?.name,
      ordersCount: orders?.length || 0,
      foliosCount: folios?.length || 0,
      orderDetailsCount: orderDetails?.length || 0,
      ordersData: orders
    });

    return {
      customer: customer || { name: 'Unknown', id: 'Unknown', rayi_customer_id: 'Unknown' },
      customerDetail: customerDetail || null,
      folios: folios || [],
      investments: null,
      performanceSummary: performanceSummary || null,
      investmentPerformance: investmentPerformance || [],
      investmentReturns: investmentReturns || [],
      orders: orders || [],
      orderDetails: orderDetails || [],
      mutualFunds: mutualFunds || []
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return {
      customer: { name: 'Unknown', id: 'Unknown', rayi_customer_id: 'Unknown' },
      customerDetail: null,
      folios: [],
      investments: null,
      performanceSummary: null,
      investmentPerformance: [],
      investmentReturns: [],
      orders: [],
      orderDetails: [],
      mutualFunds: []
    };
  }
}

// Function to map partial entity names to full names
const entityMapping = {
  'sbi': 'State Bank of India',
  'apple': 'Apple Inc.',
  'reliance': 'Reliance Industries',
  'hdfc': 'HDFC Bank',
  'icici': 'ICICI Bank',
  'mf': 'Mutual Fund',
  'sip': 'Systematic Investment Plan',
  'etf': 'Exchange Traded Fund'
};

// Function to correct typos and interpret incomplete sentences
function preprocessQuery(message) {
  let processedMessage = message.toLowerCase().trim();
  
  // Replace abbreviations and common typos
  Object.keys(entityMapping).forEach(key => {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    processedMessage = processedMessage.replace(regex, entityMapping[key]);
  });

  // Handle common typos using string similarity
  const financeTerms = [
    'portfolio', 'investment', 'mutual fund', 'sip', 'stock', 'stocks',
    'returns', 'performance', 'folio', 'order', 'orders', 'balance',
    'market', 'etf', 'bonds', 'equity', 'debt', 'tax', 'financial planning',
    'risk', 'strategy', 'dividend', 'growth', 'sector', 'economy'
  ];

  processedMessage = processedMessage.split(' ').map(word => {
    if (word.length < 3) return word;
    const matches = stringSimilarity.findBestMatch(word, financeTerms);
    if (matches.bestMatch.rating > 0.7) {
      return matches.bestMatch.target;
    }
    return word;
  }).join(' ');

  // Complete partial sentences
  if (!processedMessage.match(/[.!?]$/)) {
    if (processedMessage.includes('portfolio') || processedMessage.includes('investment')) {
      processedMessage += ' details';
    } else if (processedMessage.includes('stock') || processedMessage.includes('market')) {
      processedMessage += ' performance';
    }
  }

  return processedMessage;
}

// Function to strip hashtags from AI response
function stripHashtags(response) {
  return response.replace(/#[^\s]+/g, '');
}

// Function to classify the query
async function classifyQueryWithAI(message) {
  try {
    const classificationPrompt = `You are a query classifier for a financial advisor AI assistant. 

Your task is to classify the following user query into exactly ONE of these categories:

1. "GREETING" - Simple greetings like "hi", "hello", "hey", "thanks", "thank you"
2. "USER-SPECIFIC-FINANCIAL" - Questions about the user's personal financial data like "my portfolio", "my investments", "my orders", "my SIP", "my returns", "my balance"
3. "GENERAL-FINANCIAL" - Any finance-related questions including:
   - Investment scenarios ("what if I invested...")
   - Mutual fund questions
   - Stock market queries
   - Financial planning
   - Investment advice
   - Market analysis
   - Fund performance
   - Financial education
   - Tax implications
   - Any question about specific companies, funds, or financial instruments
4. "NON-FINANCIAL" - Questions completely unrelated to finance, investments, or money

IMPORTANT RULES:
- If a query has even 1% relation to finance, stocks, investments, or money, classify it as financial
- Investment scenarios like "what if I had invested X in Y fund Z years ago" are GENERAL-FINANCIAL
- Questions about specific mutual funds, stocks, or companies are GENERAL-FINANCIAL
- Only classify as NON-FINANCIAL if the query has absolutely no connection to finance

User query: "${message}"

Respond with ONLY the category name (GREETING, USER-SPECIFIC-FINANCIAL, GENERAL-FINANCIAL, or NON-FINANCIAL). Do not include any explanation.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "user", content: classificationPrompt }
      ],
      max_tokens: 50,
      temperature: 0.1,
    });

    const classification = completion.choices[0].message.content.trim().toUpperCase();
    
    const validCategories = ['GREETING', 'USER-SPECIFIC-FINANCIAL', 'GENERAL-FINANCIAL', 'NON-FINANCIAL'];
    if (!validCategories.includes(classification)) {
      console.warn(`Invalid classification received: ${classification}. Defaulting to GENERAL-FINANCIAL`);
      return 'GENERAL-FINANCIAL';
    }
    
    console.log(`AI Classification: "${message}" -> ${classification}`);
    return classification;
    
  } catch (error) {
    console.error('Error in AI classification:', error);
    return fallbackClassifyQuery(message);
  }
}

// Fallback classification function
function fallbackClassifyQuery(message) {
  const lowerMessage = message.toLowerCase().trim();
  
  const greetings = ['hi', 'hello', 'hey', 'thank', 'thanks', 'thx'];
  const isGreeting = greetings.some(g => lowerMessage.startsWith(g) || lowerMessage === g);
  
  if (isGreeting) {
    return 'GREETING';
  }

  const financialKeywords = [
    'invest', 'investment', 'portfolio', 'fund', 'stock', 'share', 'money', 'rupee',
    'lakh', 'crore', 'market', 'financial', 'finance', 'mutual', 'sip', 'return',
    'my portfolio', 'my investment', 'my order'
  ];

  const hasFinancialKeyword = financialKeywords.some(keyword => lowerMessage.includes(keyword));
  const hasUserSpecific = lowerMessage.includes('my ');
  
  if (!hasFinancialKeyword) {
    return 'NON-FINANCIAL';
  }
  
  return hasUserSpecific ? 'USER-SPECIFIC-FINANCIAL' : 'GENERAL-FINANCIAL';
}

// =============================================================================
// INVESTMENT PRODUCT ROUTES
// =============================================================================

app.get('/api/investment/products', authenticateToken, async (req, res) => {
  try {
    const { category = 'all', search = '' } = req.query;
    
    const sampleMutualFunds = [
      {
        id: 'MF001',
        name: 'SBI Bluechip Fund',
        category: 'Large Cap',
        nav: 85.67,
        expense_ratio: 0.65,
        returns_1y: 15.2,
        returns_3y: 12.8,
        returns_5y: 14.5,
        min_investment: 500,
        risk_level: 'Moderate',
        fund_manager: 'SBI Mutual Fund',
        aum: '₹45,000 Cr'
      },
      {
        id: 'MF002',
        name: 'HDFC Top 100 Fund',
        category: 'Large Cap',
        nav: 920.45,
        expense_ratio: 0.70,
        returns_1y: 16.8,
        returns_3y: 13.2,
        returns_5y: 15.1,
        min_investment: 500,
        risk_level: 'Moderate',
        fund_manager: 'HDFC Asset Management',
        aum: '₹28,500 Cr'
      },
      {
        id: 'MF003',
        name: 'Axis Midcap Fund',
        category: 'Mid Cap',
        nav: 67.89,
        expense_ratio: 0.85,
        returns_1y: 22.5,
        returns_3y: 18.7,
        returns_5y: 19.2,
        min_investment: 1000,
        risk_level: 'High',
        fund_manager: 'Axis Asset Management',
        aum: '₹12,800 Cr'
      },
      {
        id: 'MF004',
        name: 'ICICI Prudential Balanced Advantage Fund',
        category: 'Hybrid',
        nav: 45.23,
        expense_ratio: 0.75,
        returns_1y: 11.8,
        returns_3y: 10.5,
        returns_5y: 12.3,
        min_investment: 500,
        risk_level: 'Moderate',
        fund_manager: 'ICICI Prudential',
        aum: '₹35,200 Cr'
      },
      {
        id: 'MF005',
        name: 'Kotak Small Cap Fund',
        category: 'Small Cap',
        nav: 158.76,
        expense_ratio: 0.95,
        returns_1y: 28.3,
        returns_3y: 24.1,
        returns_5y: 22.8,
        min_investment: 1000,
        risk_level: 'Very High',
        fund_manager: 'Kotak Mahindra Asset Management',
        aum: '₹8,900 Cr'
      }
    ];

    let filteredFunds = sampleMutualFunds;

    if (category !== 'all') {
      filteredFunds = filteredFunds.filter(fund => 
        fund.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    if (search) {
      filteredFunds = filteredFunds.filter(fund =>
        fund.name.toLowerCase().includes(search.toLowerCase()) ||
        fund.category.toLowerCase().includes(search.toLowerCase())
      );
    }

    res.json({
      success: true,
      products: filteredFunds,
      total: filteredFunds.length
    });

  } catch (error) {
    console.error('Error fetching investment products:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch investment products' 
    });
  }
});

app.get('/api/investment/products/:productId', authenticateToken, async (req, res) => {
  try {
    const { productId } = req.params;
    
    const productDetails = {
      id: productId,
      name: 'SBI Bluechip Fund',
      category: 'Large Cap',
      nav: 85.67,
      nav_history: [
        { date: '2024-01-01', nav: 78.45 },
        { date: '2024-06-01', nav: 82.12 },
        { date: '2024-12-01', nav: 85.67 }
      ],
      expense_ratio: 0.65,
      returns: {
        '1y': 15.2,
        '3y': 12.8,
        '5y': 14.5
      },
      portfolio_composition: [
        { sector: 'Banking & Financial Services', percentage: 25.6 },
        { sector: 'Information Technology', percentage: 18.3 },
        { sector: 'Energy', percentage: 12.8 },
        { sector: 'Consumer Goods', percentage: 11.2 },
        { sector: 'Healthcare', percentage: 8.7 }
      ],
      top_holdings: [
        { company: 'Reliance Industries', percentage: 8.2 },
        { company: 'TCS', percentage: 6.8 },
        { company: 'HDFC Bank', percentage: 5.9 },
        { company: 'Infosys', percentage: 4.7 },
        { company: 'ICICI Bank', percentage: 4.3 }
      ],
      min_investment: 500,
      risk_level: 'Moderate',
      fund_manager: 'SBI Mutual Fund',
      aum: '₹45,000 Cr',
      inception_date: '2010-05-15',
      benchmark: 'S&P BSE 100'
    };

    res.json({
      success: true,
      product: productDetails
    });

  } catch (error) {
    console.error('Error fetching product details:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch product details' 
    });
  }
});

// =============================================================================
// INVESTMENT ORDER ROUTES
// =============================================================================

app.post('/api/investment/order', authenticateToken, async (req, res) => {
  try {
    const { 
      productId, 
      investmentType, // 'SIP' or 'LUMPSUM'
      amount, 
      frequency, // For SIP: 'MONTHLY', 'QUARTERLY', 'YEARLY'
      sipDate, // For SIP: date of month (1-28)
      duration // For SIP: duration in months
    } = req.body;

    const customerId = req.user.customerId || req.user.id;
    
    if (!productId || !investmentType || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, investment type, and amount are required'
      });
    }

    if (investmentType === 'SIP' && (!frequency || !sipDate)) {
      return res.status(400).json({
        success: false,
        message: 'SIP frequency and date are required for SIP investments'
      });
    }

    if (amount < 500) {
      return res.status(400).json({
        success: false,
        message: 'Minimum investment amount is ₹500'
      });
    }

    const db = mongoClient.db('financeai');
    
    const lastOrder = await db.collection('investment_orders').findOne({}, { sort: { order_id: -1 } });
    const newOrderId = lastOrder ? lastOrder.order_id + 1 : 100001;

    const order = {
      order_id: newOrderId,
      customer_id: parseInt(customerId),
      product_id: productId,
      investment_type: investmentType,
      amount: parseFloat(amount),
      frequency: frequency || null,
      sip_date: sipDate || null,
      duration: duration || null,
      status: 'PENDING',
      payment_status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
      payment_gateway_id: null,
      transaction_id: null
    };

    const result = await db.collection('investment_orders').insertOne(order);
    
    const paymentSession = {
      order_id: newOrderId,
      amount: amount,
      currency: 'INR',
      payment_id: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    };

    res.json({
      success: true,
      order: {
        ...order,
        _id: result.insertedId
      },
      payment_session: paymentSession,
      message: 'Order created successfully. Proceed to payment.'
    });

  } catch (error) {
    console.error('Error creating investment order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create investment order'
    });
  }
});

// =============================================================================
// PAYMENT GATEWAY SIMULATION
// =============================================================================

app.post('/api/payment/generate-otp', authenticateToken, async (req, res) => {
  try {
    const { payment_id, mobile_number } = req.body;
    
    const otp = Math.floor(100000 + Math.random() * 900000);
    
    const db = mongoClient.db('financeai');
    await db.collection('payment_otps').insertOne({
      payment_id,
      mobile_number,
      otp: otp.toString(),
      created_at: new Date(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      verified: false
    });

    console.log(`OTP for payment ${payment_id}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      demo_otp: otp
    });

  } catch (error) {
    console.error('Error generating OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate OTP'
    });
  }
});

app.post('/api/payment/verify-otp', authenticateToken, async (req, res) => {
  try {
    const { payment_id, otp, order_id } = req.body;
    
    const db = mongoClient.db('financeai');
    
    const otpRecord = await db.collection('payment_otps').findOne({
      payment_id,
      otp,
      verified: false,
      expires_at: { $gt: new Date() }
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    await db.collection('payment_otps').updateOne(
      { _id: otpRecord._id },
      { $set: { verified: true, verified_at: new Date() } }
    );

    const paymentSuccess = Math.random() > 0.1; // 90% success rate

    if (paymentSuccess) {
      await db.collection('investment_orders').updateOne(
        { order_id: parseInt(order_id) },
        { 
          $set: { 
            status: 'CONFIRMED',
            payment_status: 'COMPLETED',
            transaction_id: `TXN_${Date.now()}`,
            updated_at: new Date()
          }
        }
      );

      const order = await db.collection('investment_orders').findOne({ order_id: parseInt(order_id) });
      
      if (order && order.investment_type === 'SIP') {
        await db.collection('sip_investments').insertOne({
          customer_id: order.customer_id,
          product_id: order.product_id,
          order_id: order.order_id,
          amount: order.amount,
          frequency: order.frequency,
          sip_date: order.sip_date,
          duration: order.duration,
          status: 'ACTIVE',
          next_deduction: calculateNextSIPDate(order.sip_date, order.frequency),
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      res.json({
        success: true,
        message: 'Payment successful! Your investment has been confirmed.',
        transaction_id: `TXN_${Date.now()}`,
        order_status: 'CONFIRMED'
      });

    } else {
      await db.collection('investment_orders').updateOne(
        { order_id: parseInt(order_id) },
        { 
          $set: { 
            status: 'FAILED',
            payment_status: 'FAILED',
            updated_at: new Date()
          }
        }
      );

      res.status(400).json({
        success: false,
        message: 'Payment failed. Please try again.',
        order_status: 'FAILED'
      });
    }

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

// =============================================================================
// SIP MANAGEMENT ROUTES
// =============================================================================

app.get('/api/sip/investments', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db('financeai');

    const sipInvestments = await db.collection('sip_investments').find({
      customer_id: parseInt(customerId)
    }).toArray();

    const enrichedSIPs = await Promise.all(
      sipInvestments.map(async (sip) => {
        const productDetails = {
          name: 'Sample Fund Name',
          category: 'Large Cap',
          nav: 85.67
        };
        
        return {
          ...sip,
          product: productDetails,
          total_invested: sip.amount * calculateCompletedInstallments(sip),
          next_deduction_formatted: sip.next_deduction.toDateString()
        };
      })
    );

    res.json({
      success: true,
      sip_investments: enrichedSIPs
    });

  } catch (error) {
    console.error('Error fetching SIP investments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SIP investments'
    });
  }
});

app.post('/api/sip/pause', authenticateToken, async (req, res) => {
  try {
    const { sip_id } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db('financeai');

    const result = await db.collection('sip_investments').updateOne(
      { 
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: 'ACTIVE'
      },
      { 
        $set: { 
          status: 'PAUSED',
          paused_at: new Date(),
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'SIP not found or already paused'
      });
    }

    res.json({
      success: true,
      message: 'SIP paused successfully'
    });

  } catch (error) {
    console.error('Error pausing SIP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to pause SIP'
    });
  }
});

app.post('/api/sip/resume', authenticateToken, async (req, res) => {
  try {
    const { sip_id } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db('financeai');

    const result = await db.collection('sip_investments').updateOne(
      { 
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: 'PAUSED'
      },
      { 
        $set: { 
          status: 'ACTIVE',
          resumed_at: new Date(),
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'SIP not found or not paused'
      });
    }

    res.json({
      success: true,
      message: 'SIP resumed successfully'
    });

  } catch (error) {
    console.error('Error resuming SIP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resume SIP'
    });
  }
});

app.post('/api/sip/cancel', authenticateToken, async (req, res) => {
  try {
    const { sip_id } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db('financeai');

    const result = await db.collection('sip_investments').updateOne(
      { 
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: { $in: ['ACTIVE', 'PAUSED'] }
      },
      { 
        $set: { 
          status: 'CANCELLED',
          cancelled_at: new Date(),
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'SIP not found or already cancelled'
      });
    }

    res.json({
      success: true,
      message: 'SIP cancelled successfully'
    });

  } catch (error) {
    console.error('Error cancelling SIP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel SIP'
    });
  }
});

app.post('/api/sip/modify', authenticateToken, async (req, res) => {
  try {
    const { sip_id, new_amount, new_date } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db('financeai');

    const updateFields = {
      updated_at: new Date()
    };

    if (new_amount) {
      if (new_amount < 500) {
        return res.status(400).json({
          success: false,
          message: 'Minimum SIP amount is ₹500'
        });
      }
      updateFields.amount = parseFloat(new_amount);
    }

    if (new_date) {
      if (new_date < 1 || new_date > 28) {
        return res.status(400).json({
          success: false,
          message: 'SIP date must be between 1 and 28'
        });
      }
      updateFields.sip_date = parseInt(new_date);
    }

    const result = await db.collection('sip_investments').updateOne(
      { 
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: 'ACTIVE'
      },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'SIP not found or not active'
      });
    }

    res.json({
      success: true,
      message: 'SIP modified successfully'
    });

  } catch (error) {
    console.error('Error modifying SIP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to modify SIP'
    });
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function calculateNextSIPDate(sipDate, frequency) {
  const now = new Date();
  const nextDate = new Date();
  
  switch (frequency) {
    case 'MONTHLY':
      nextDate.setDate(sipDate);
      if (nextDate <= now) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      break;
    case 'QUARTERLY':
      nextDate.setDate(sipDate);
      if (nextDate <= now) {
        nextDate.setMonth(nextDate.getMonth() + 3);
      }
      break;
    case 'YEARLY':
      nextDate.setDate(sipDate);
      if (nextDate <= now) {
        nextDate.setFullYear(nextDate.getFullYear() + 1);
      }
      break;
  }
  
  return nextDate;
}

function calculateCompletedInstallments(sip) {
  const startDate = sip.created_at;
  const currentDate = new Date();
  
  let installments = 0;
  const tempDate = new Date(startDate);
  
  while (tempDate <= currentDate) {
    installments++;
    switch (sip.frequency) {
      case 'MONTHLY':
        tempDate.setMonth(tempDate.getMonth() + 1);
        break;
      case 'QUARTERLY':
        tempDate.setMonth(tempDate.getMonth() + 3);
        break;
      case 'YEARLY':
        tempDate.setFullYear(tempDate.getFullYear() + 1);
        break;
    }
  }
  
  return Math.max(0, installments - 1);
}

// Global request tracking for duplicate prevention
const recentRequests = new Map();
const REQUEST_TIMEOUT = 2000; // 2 seconds

// Clean up old requests periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentRequests.entries()) {
    if (now - timestamp > REQUEST_TIMEOUT) {
      recentRequests.delete(key);
    }
  }
}, 30000); // Clean every 30 seconds

app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { chatId, title, message } = req.body;
    const userId = new ObjectId(req.user._id);
    
    // Create request fingerprint for duplicate detection
    const requestFingerprint = `${userId.toString()}_${message}_${chatId || 'new'}`;
    const requestTime = Date.now();
    
    // Check for duplicate request
    if (recentRequests.has(requestFingerprint)) {
      const lastRequestTime = recentRequests.get(requestFingerprint);
      if (requestTime - lastRequestTime < REQUEST_TIMEOUT) {
        console.log('Duplicate request detected:', requestFingerprint);
        return res.status(429).json({ 
          error: 'Duplicate request detected. Please wait before sending again.',
          isDuplicate: true
        });
      }
    }
    
    // Record this request
    recentRequests.set(requestFingerprint, requestTime);
    
    console.log('=== CUSTOMER ID DEBUGGING ===');
    console.log('Full JWT user object:', JSON.stringify(req.user, null, 2));
    
    let customerId = req.user.customerId || req.user.id;
    
    if (!customerId || typeof customerId === 'object') {
      try {
        const db = mongoClient.db('financeai');
        const customerRecord = await db.collection('customer').findOne({ _id: new ObjectId(req.user._id) });
        if (customerRecord) {
          customerId = customerRecord.id;
          console.log('Retrieved customerId from database:', customerId);
        }
      } catch (dbError) {
        console.error('Error fetching customer from database:', dbError);
      }
    }
    
    console.log('Final customerId being used:', customerId, 'Type:', typeof customerId);
    console.log('=== END CUSTOMER ID DEBUGGING ===');
    
    if (!customerId) {
      console.error('No valid customer ID found');
      return res.status(400).json({ error: 'Invalid customer identification' });
    }
    
    const db = mongoClient.db('financeai');
    const chatsCollection = db.collection('chats');
    
    let chat;
    
    if (chatId && ObjectId.isValid(chatId)) {
      chat = await chatsCollection.findOne({ 
        _id: new ObjectId(chatId),
        userId: userId
      });
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
    } else {
      chat = {
        userId: userId,
        title: title || 'New Chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };
    }
    
    const processedMessage = preprocessQuery(message);
    const userMessage = {
      sender: 'user',
      content: message,
      processedContent: processedMessage,
      timestamp: new Date()
    };
    
    if (!chat.messages) {
      chat.messages = [];
    }
    chat.messages.push(userMessage);
    
    const queryType = await classifyQueryWithAI(processedMessage);
    console.log('AI classified query as:', queryType);

    const recentMessages = chat.messages.slice(-3).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.processedContent || msg.content
    }));

    const isFirstMessage = chat.messages.length === 1;

    let maxTokens;
    switch (queryType) {
      case 'GREETING':
      case 'NON-FINANCIAL':
        maxTokens = 150;
        break;
      case 'USER-SPECIFIC-FINANCIAL':
        maxTokens = processedMessage.includes('details') ? 500 : 300;
        break;
      case 'GENERAL-FINANCIAL':
        maxTokens = processedMessage.includes('analysis') || processedMessage.includes('recommend') ? 600 : 400;
        break;
      default:
        maxTokens = 300;
    }

    let systemPrompt;
    let userData = {};

    console.log('=== FETCHING USER DATA ===');
    userData = await getUserData(customerId);
    console.log('User data fetched. Orders found:', userData.orders?.length || 0);
    console.log('=== END USER DATA FETCH ===');

    if (queryType === 'GREETING') {
      const aiResponse = isFirstMessage
        ? `Hello ${userData.customer?.name || 'there'}! I'm your financial advisor, here to help with investments or portfolio queries. How can I assist you today?`
        : `Hi again! What's on your mind about your investments? Need help with orders or funds?`;
      
      const assistantMessage = {
        sender: 'bot',
        content: aiResponse,
        timestamp: new Date()
      };
      
      chat.messages.push(assistantMessage);
      chat.updatedAt = new Date();
      
      if (chat._id) {
        await chatsCollection.updateOne(
          { _id: chat._id },
          { 
            $set: { 
              messages: chat.messages, 
              updatedAt: chat.updatedAt 
            },
            $inc: { __v: 1 }
          }
        );
      } else {
        const result = await chatsCollection.insertOne(chat);
        chat._id = result.insertedId;
      }
      
      return res.json(chat);
      
    } else if (queryType === 'NON-FINANCIAL') {
      const aiResponse = isFirstMessage
        ? `Hello ${userData.customer?.name || 'there'}! I'm here to assist with your investments or financial planning. Your question seems unrelated—can I help with your portfolio instead?`
        : `That question isn't about finance. Want to check your orders or explore mutual funds?`;
      
      const assistantMessage = {
        sender: 'bot',
        content: aiResponse,
        timestamp: new Date()
      };
      
      chat.messages.push(assistantMessage);
      chat.updatedAt = new Date();
      
      if (chat._id) {
        await chatsCollection.updateOne(
          { _id: chat._id },
          { 
            $set: { 
              messages: chat.messages, 
              updatedAt: chat.updatedAt 
            },
            $inc: { __v: 1 }
          }
        );
      } else {
        const result = await chatsCollection.insertOne(chat);
        chat._id = result.insertedId;
      }
      
      return res.json(chat);
      
    } else {
      let userDataString = `
Customer Info: ${JSON.stringify(userData.customer, null, 2)}
Orders: ${JSON.stringify(userData.orders, null, 2)}
Order Details: ${JSON.stringify(userData.orderDetails, null, 2)}
`;
      if (queryType === 'USER-SPECIFIC-FINANCIAL' && processedMessage.includes('folio')) {
        userDataString += `Portfolio Folios: ${JSON.stringify(userData.folios, null, 2)}`;
      }
      if (queryType === 'GENERAL-FINANCIAL' && processedMessage.includes('fund')) {
        userDataString += `Mutual Funds: ${JSON.stringify(userData.mutualFunds, null, 2)}`;
      }

      systemPrompt = `You are a specialized financial advisor AI assistant designed to provide accurate, concise, and context-aware responses for finance-related queries, even if only 1% related to finance (e.g., stocks, ETFs, mutual funds, markets). You handle typos, abbreviations, and incomplete sentences.

AUTHORIZATION SCOPE:
You are authorized to discuss ONLY:
- Portfolio analysis and performance
- Investment holdings and allocations  
- Order history and transaction details
- Mutual fund information and performance
- Financial planning recommendations
- Financial education (e.g., "what is a mutual fund?")
- Investment strategy and risk assessment
- Returns, gains, losses, and performance
- Account balances and folio information
- Tax implications (general guidance)
- Market analysis related to holdings
- Greetings with redirects to finance topics

USER DATA ACCESS:
- Customer Name: ${userData.customer?.name || 'Unknown'}
- Customer ID: ${userData.customer?.id || 'Unknown'}
- RAYI Customer ID: ${userData.customer?.rayi_customer_id || 'Unknown'}
- Total Orders: ${userData.orders?.length || 0}
- Total Folios: ${userData.folios?.length || 0}

CRITICAL ORDER INFORMATION:
${userData.orders && userData.orders.length > 0 ? 
  `THE USER HAS ${userData.orders.length} ORDER(S). YOU MUST ACKNOWLEDGE AND DESCRIBE THESE ORDERS:
${userData.orders.map(order => `- Order ID: ${order.id}
- Amount: ₹${order.amount}
- Payment Status: ${order.payment_status}
- Investment ID: ${order.investment_id}
`).join('')}
NEVER say "no orders found" - the user clearly has orders as shown above.` 
: 'The user currently has no orders in the system.'}

Detailed Financial Data:
${userDataString}

RESPONSE GUIDELINES:
1. **Orders Handling**:
   - If orders exist, list them with Order ID, Amount, Payment Status, and Investment ID.
   - Never claim "no orders found" when orders are present.
2. **Politeness**:
   - For first message, use "Hello ${userData.customer?.name || 'there'}!".
   - For follow-ups, dive into response unless greeting is needed.
   - End with a friendly closer (e.g., "Let me know how I can help further!").
3. **Content**:
   - Acknowledge missing data gracefully (e.g., "I couldn't find your portfolio data, but...").
   - Interpret typos/abbreviations (e.g., "portfolo" → "portfolio").
   - Provide actionable insights based on data.
4. **Formatting**:
   - Use Indian Rupees (₹) for Indian stocks, USD ($) for international.
   - Summarize data in bullet points for user-specific queries.
   - No hashtags, emojis, or social media formatting.

RESPONSE FORMATTING FOR MOBILE:
- Keep responses concise, under 200 words unless details requested.
- Use short paragraphs (2-3 sentences, max 100 characters each).
- Summarize data in bullet points (e.g., orders, folios).
- Use bold for headings (e.g., **Your Orders**).
- Avoid complex tables or lengthy lists.

ENGAGEMENT RULES:
- End with 1-2 leading questions based on query type:
  - GREETING: "How can I assist with your investments today?"
  - USER-SPECIFIC-FINANCIAL: "Want to see your latest order details?"
  - GENERAL-FINANCIAL: "Interested in similar funds?"
  - NON-FINANCIAL: "Can I help with your portfolio instead?"
- Use action-oriented prompts (e.g., "Ready to start an SIP?").

CONVERSATIONAL STYLE:
- Use a warm, professional, conversational tone.
- Address user by name in first message or greetings.
- Explain terms simply (e.g., "SIP means investing small amounts regularly").
- Avoid jargon unless explained clearly.

ENHANCED CAPABILITIES:
1. Investment Product Recommendations
2. Investment Order Processing
3. SIP Management
4. Payment Processing
5. Portfolio Analysis

INVESTMENT WORKFLOW:
- Product Discovery: "What's your investment goal? (Growth/Income)"
- Investment Process: "SIP or Lumpsum? Minimum ₹500."
- SIP Management: "Your SIPs: [List]. Want to pause or modify?"
- Payment: "I'll generate an OTP for payment."

CRITICAL GUIDELINES:
- Include risk warning: "Mutual fund investments are subject to market risks."
- Explain fees transparently.
- Suggest diversification.
- Recommend consulting an advisor for large investments.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        ...recentMessages,
        { role: "user", content: processedMessage }
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
    });

    let aiResponse = completion.choices[0].message.content;
    aiResponse = stripHashtags(aiResponse);
    
    const assistantMessage = {
      sender: 'bot',
      content: aiResponse,
      timestamp: new Date()
    };
    
    chat.messages.push(assistantMessage);
    chat.updatedAt = new Date();
    
    if (chat._id) {
      await chatsCollection.updateOne(
        { _id: chat._id },
        { 
          $set: { 
            messages: chat.messages, 
            updatedAt: chat.updatedAt 
          },
          $inc: { __v: 1 }
        }
      );
    } else {
      const result = await chatsCollection.insertOne(chat);
      chat._id = result.insertedId;
    }
    
    res.json(chat);

  } catch (error) {
    console.error('Chat processing error:', error);
    res.status(500).json({ 
      error: 'Failed to process message',
      details: error.message 
    });
  }
});

app.get('/api/debug/userdata', authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;
    console.log('Debug: Getting user data for customerId:', customerId);
    
    const userData = await getUserData(customerId);
    
    res.json({
      customerId: customerId,
      userData: userData,
      summary: {
        customerFound: !!userData.customer,
        ordersCount: userData.orders?.length || 0,
        foliosCount: userData.folios?.length || 0,
        orderDetailsCount: userData.orderDetails?.length || 0
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch debug data', details: error.message });
  }
});

app.get('/api/chat/:chatId', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = new ObjectId(req.user._id);
    
    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: 'Invalid chat ID format' });
    }
    
    const db = mongoClient.db('financeai');
    const chatsCollection = db.collection('chats');
    
    const chat = await chatsCollection.findOne({ 
      _id: new ObjectId(chatId),
      userId: userId
    });
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    res.json(chat);
  } catch (error) {
    console.error('Chat load error:', error);
    res.status(500).json({ error: 'Failed to load chat' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email, and password are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters long' });
        }

        const db = mongoClient.db('financeai');
        const customersCollection = db.collection('customer');

        const existingCustomer = await customersCollection.findOne({ email: email.toLowerCase() });
        
        if (existingCustomer) {
            return res.status(409).json({ message: 'Customer with this email already exists' });
        }

        const lastCustomer = await customersCollection.findOne({}, { sort: { id: -1 } });
        const newCustomerId = lastCustomer ? lastCustomer.id + 1 : 126;
        const rayiCustomerId = `RAYI${String(newCustomerId).padStart(4, '0')}`;

        const hashedPassword = await bcrypt.hash(password, 10);

        const newCustomer = {
            id: newCustomerId,
            rayi_customer_id: rayiCustomerId,
            name: name,
            email: email.toLowerCase(),
            password: hashedPassword
        };

        const result = await customersCollection.insertOne(newCustomer);

        const token = jwt.sign(
            { 
                _id: result.insertedId,
                userId: result.insertedId,
                id: newCustomerId,
                customerId: newCustomerId,
                rayiCustomerId: rayiCustomerId,
                email: email.toLowerCase(),
                name: name
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Account created successfully',
            token,
            user: {
                _id: result.insertedId,
                userId: result.insertedId,
                id: newCustomerId,
                customerId: newCustomerId,
                rayiCustomerId: rayiCustomerId,
                name: name,
                email: email.toLowerCase()
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Internal server error during signup' });
    }
});

app.get('/api/auth/verify', authenticateToken, async (req, res) => {
    try {
        const db = mongoClient.db('financeai');
        const customersCollection = db.collection('customer');

        const customer = await customersCollection.findOne({ id: req.user.customerId });
        
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        res.json({
            message: 'Token valid',
            user: {
                _id: customer._id,
                userId: customer._id,
                id: customer._id,
                customerId: customer.id,
                rayiCustomerId: customer.rayi_customer_id,
                name: customer.name,
                email: customer.email
            }
        });

    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ message: 'Internal server error during token verification' });
    }
});

app.use(express.static(path.join(__dirname, '../Frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend', 'index.html'), (err) => {
        if (err) {
            res.status(500).send('Error serving index.html');
        }
    });
});

app.use('/api', apiRoutes);

app.use((err, req, res, next) => {
    console.error('Global error:', err.stack);
    res.status(500).json({ message: 'Something went wrong on the server.' });
});

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB via Mongoose'))
    .catch(err => console.error('MongoDB Mongoose connection error:', err));

initMongoDB();

// Get local IP address
const os = require('os');
const networkInterfaces = os.networkInterfaces();
const localIP = Object.values(networkInterfaces)
  .flat()
  .find((iface) => iface.family === 'IPv4' && !iface.internal).address;

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on:`);
    console.log(`http://localhost:${PORT}`);
    console.log(`→ Network: http://${localIP}:${PORT}`);
});

process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (mongoClient) {
        await mongoClient.close();
        console.log('MongoDB client connection closed');
    }
    await mongoose.connection.close();
    console.log('Mongoose connection closed');
    process.exit(0);
});