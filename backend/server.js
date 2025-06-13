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
const stringSimilarity = require('string-similarity'); // Added for typo/abbreviation handling

// Load environment variables from .env located in the project root
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
        
        // Create indexes for better performance
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
    max: 100, // Limit each IP to 100 requests per windowMs
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
    
    // FIXED: Corrected the Promise.all array to match the destructuring
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

    // Get mutual fund IDs from folios and investment returns
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
      investments: null, // This was causing confusion - removed from Promise.all
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

// AI-powered function to classify the query using OpenAI
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
      model: "gpt-4.1", // Using faster, cheaper model for classification
      messages: [
        { role: "user", content: classificationPrompt }
      ],
      max_tokens: 50,
      temperature: 0.1, // Low temperature for consistent classification
    });

    const classification = completion.choices[0].message.content.trim().toUpperCase();
    
    // Validate the response
    const validCategories = ['GREETING', 'USER-SPECIFIC-FINANCIAL', 'GENERAL-FINANCIAL', 'NON-FINANCIAL'];
    if (!validCategories.includes(classification)) {
      console.warn(`Invalid classification received: ${classification}. Defaulting to GENERAL-FINANCIAL`);
      return 'GENERAL-FINANCIAL'; // Safe default for edge cases
    }
    
    console.log(`AI Classification: "${message}" -> ${classification}`);
    return classification;
    
  } catch (error) {
    console.error('Error in AI classification:', error);
    // Fallback to simple keyword-based classification if AI fails
    return fallbackClassifyQuery(message);
  }
}

// Fallback classification function (simplified version of your original)
function fallbackClassifyQuery(message) {
  const lowerMessage = message.toLowerCase().trim();
  
  // Detect greetings
  const greetings = ['hi', 'hello', 'hey', 'thank', 'thanks', 'thx'];
  const isGreeting = greetings.some(g => lowerMessage.startsWith(g) || lowerMessage === g);
  
  if (isGreeting) {
    return 'GREETING';
  }

  // Basic financial keywords for fallback
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

// Updated main chat endpoint function - replace the relevant part in your /api/chat route
app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { chatId, title, message } = req.body;
    const userId = new ObjectId(req.user._id);
    
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
    
    // USE AI CLASSIFICATION INSTEAD OF HARDCODED KEYWORDS
    const queryType = await classifyQueryWithAI(processedMessage);
    console.log('AI classified query as:', queryType);

    const recentMessages = chat.messages.slice(-5).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.processedContent || msg.content
    }));

    const isFirstMessage = chat.messages.length === 1;

    let systemPrompt;
    let userData = {};

    // Always fetch user data
    console.log('=== FETCHING USER DATA ===');
    userData = await getUserData(customerId);
    console.log('User data fetched. Orders found:', userData.orders?.length || 0);
    console.log('=== END USER DATA FETCH ===');

    if (queryType === 'GREETING') {
      const aiResponse = isFirstMessage
        ? `Hello ${userData.customer?.name || 'there'}! I'm your specialized financial advisor assistant, ready to help with your investment portfolio, mutual funds, or financial planning. How can I assist you today?`
        : `Hi again! Thanks for reaching out. What's on your mind regarding your investments or financial questions?`;
      
      const assistantMessage = {
        sender: 'assistant',
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
        ? `Hello ${userData.customer?.name || 'there'}! I'm your specialized financial advisor assistant, here to assist with your investment portfolio, orders, mutual funds, and other financial matters. It seems your question isn't related to finance. Could you please ask about your investments, portfolio performance, or financial planning needs? I'm happy to help with those!`
        : `It seems your question isn't related to finance. Could you please ask about your investments, portfolio performance, or financial planning needs? I'm happy to help with those!`;
      
      const assistantMessage = {
        sender: 'assistant',
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
      // Financial query - proceed with your existing system prompt logic
      systemPrompt = `You are a specialized financial advisor AI assistant designed to provide accurate, concise, and context-aware responses for any finance-related query, even if only 1% related to finance (e.g., stocks, ETFs, mutual funds, financial education, market trends). You handle typos, abbreviations, incomplete sentences, and simple queries like "what is this" or "what is that" if they pertain to finance.

AUTHORIZATION SCOPE:
You are authorized to discuss ONLY the following topics:
- Portfolio analysis and performance
- Investment holdings and allocations  
- Order history and transaction details
- Mutual fund information and performance
- Financial planning recommendations based on user data
- Financial planning, tax implications, and risk assessment
- Financial education (e.g., "what is a mutual fund?", "how does an ETF work?")
- Investment strategy and risk assessment
- Returns, gains, losses, and performance metrics
- Account balances and folio information
- Tax implications of investments (general guidance)
- Market analysis related to user's holdings
- General stock performance, market trends, and stock funds (e.g., ETFs)
- Greetings (e.g., "hi", "hello", "thanks") with polite redirects to finance topics

USER DATA ACCESS:
You have access to the following user financial data:
- Customer Name: ${userData.customer?.name || 'Unknown'}
- Customer ID: ${userData.customer?.id || 'Unknown'}
- RAYI Customer ID: ${userData.customer?.rayi_customer_id || 'Unknown'}
- Total Orders: ${userData.orders?.length || 0}
- Total Folios: ${userData.folios?.length || 0}

CRITICAL ORDER INFORMATION:
${userData.orders && userData.orders.length > 0 ? 
  `THE USER HAS ${userData.orders.length} ORDER(S). YOU MUST ACKNOWLEDGE AND DESCRIBE THESE ORDERS:
${userData.orders.map(order => `
- Order ID: ${order.id}
- Amount: ₹${order.amount}
- Payment Status: ${order.payment_status}
- Investment ID: ${order.investment_id}
`).join('')}

NEVER say "no orders found" - the user clearly has orders as shown above.` 
: 'The user currently has no orders in the system.'}

Detailed Financial Data:
Customer Info: ${JSON.stringify(userData.customer, null, 2)}
Orders: ${JSON.stringify(userData.orders, null, 2)}
Order Details: ${JSON.stringify(userData.orderDetails, null, 2)}
Portfolio Folios: ${JSON.stringify(userData.folios, null, 2)}
Investment Summary: ${JSON.stringify(userData.investments, null, 2)}
Performance Summary: ${JSON.stringify(userData.performanceSummary, null, 2)}
Investment Performance: ${JSON.stringify(userData.investmentPerformance, null, 2)}
Investment Returns: ${JSON.stringify(userData.investmentReturns, null, 2)}
Mutual Funds: ${JSON.stringify(userData.mutualFunds, null, 2)}

RESPONSE GUIDELINES:
1. **Orders Handling - CRITICAL**:
   - If the user asks about orders and orders exist in the data, YOU MUST list them with full details
   - Never say "no orders found" when orders are present in the data
   - Always check the userData.orders array length before claiming no orders exist
   - Provide specific order details including Order ID, Amount, Payment Status, and Investment ID

2. **Politeness and Tone**:
   - For the first message in a chat session, start with a polite greeting like "Hello ${userData.customer?.name || 'there'}!" or "Hi ${userData.customer?.name || 'there'}!".
   - For follow-up messages, do NOT use a greeting unless the conversation context suggests it's needed (e.g., after a long pause or a non-financial query rejection). Instead, dive straight into the response while maintaining a polite and professional tone.
   - Always end your response with a friendly closer, such as "Let me know how I can assist you further!" or "Feel free to ask me anything else!"
   - Maintain a warm, professional, and conversational tone throughout, as if speaking to a valued client.

3. **Content**:
   - CRITICAL: If orders exist in the data, you MUST acknowledge and detail them. Never say "no orders found" when orders are present.
   - If user data is missing or incomplete, acknowledge this gracefully (e.g., "I couldn't find your portfolio data, but I can still provide general insights about Apple stock").
   - Interpret typos, abbreviations, and incomplete sentences to understand the user's intent (e.g., "portfolo" → "portfolio", "SBI" → "State Bank of India").
   - Offer clear, actionable financial insights based on the available data.
   - For queries involving partial names (e.g., "SBI"), interpret them as referring to the full entity (e.g., "State Bank of India") and respond accordingly.

4. **Formatting**:
   - Format all monetary amounts in Indian Rupees (₹) for Indian stocks or USD ($) for international stocks as appropriate.
   - Provide specific details from the actual data when discussing orders, folios, or investments.
   - **Do NOT include hashtags (e.g., #FinanceTips), emojis, or any social media-style formatting.** Keep the tone professional and clean.

STRICT OPERATIONAL RULES:
- You MUST ONLY respond to queries related to finance, investments, portfolio management, and financial markets.
- Do NOT engage in conversations about topics unrelated to finance.

SECURITY REMINDER:
- Only use the provided financial data for responses.
- Do not make up or hallucinate financial information.
- Always base recommendations on actual user data.
- Maintain confidentiality of user information.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        ...recentMessages,
        { role: "user", content: processedMessage }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    let aiResponse = completion.choices[0].message.content;
    aiResponse = stripHashtags(aiResponse);
    
    const assistantMessage = {
      sender: 'assistant',
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

// DEBUGGING ENDPOINT
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

// Health check endpoint
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
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