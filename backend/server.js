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

// Load environment variables from .env located in the project root
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Initialize OpenRouter client
const { Configuration, OpenAIApi } = require('openai');
const configuration = new Configuration({
  apiKey: OPENROUTER_API_KEY,
  basePath: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
    'X-Title': process.env.SITE_NAME || 'FinanceAI App'
  }
});
const openai = new OpenAIApi(configuration);

let mongoClient;

// Top 10 OpenRouter Models (aligned with 2025 top AI models, June 2025)
const OPENROUTER_MODELS = [
  "google/gemini-2.5-pro", // Top performer, multimodal
  "google/gemini-2.5-flash", // Fast and efficient
  "openai/o3", // Advanced reasoning
  "openai/gpt-4o", // Multimodal, widely used
  "anthropic/claude-3.7-sonnet", // Coding and writing
  "deepseek/r1", // Cost-effective, open-source
  "openai/gpt-4.5", // Refined GPT-4
  "tencent/hunyuan-turbos", // Emerging model
  "xai/grok-3", // Real-time search
  "meta/llama-3" // Open-source NLP
];

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

// Function to get all user data with enhanced error handling
async function getUserData(customerId) {
  try {
    const db = mongoClient.db('financeai');
    
    console.log('Fetching data for customerId:', customerId, 'Type:', typeof customerId);
    
    const numericCustomerId = parseInt(customerId);
    console.log('Converted to numeric customerId:', numericCustomerId);
    
    const [
      customer,
      customerDetail,
      folios,
      investments,
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
    console.log('- Customer found:', !!customer, customer ? `(ID: ${customer.id})` : '');
    console.log('- Orders query result:', orders); 
    console.log('- Orders count:', orders?.length || 0);

    let orderDetails = [];
    if (orders && orders.length > 0) {
      orderDetails = await db.collection('order_detail').find({ 
        order_id: { $in: orders.map(o => o.id) } 
      }).toArray().catch(err => {
        console.error('Error fetching order details:', err);
        return [];
      });
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
      ordersCount: orders?.length || 0,
      foliosCount: folios?.length || 0,
      orderDetailsCount: orderDetails?.length || 0
    });

    return {
      customer: customer || { name: 'Unknown', id: 'Unknown', rayi_customer_id: 'Unknown' },
      customerDetail: customerDetail || null,
      folios: folios || [],
      investments: investments || null,
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
  'icici': 'ICICI Bank'
};

// Function to detect casual greetings
function isCasualGreeting(message) {
  const lowerMessage = message.toLowerCase().trim();
  const greetings = [
    'hi', 'hello', 'hey', 'good morning', 'good afternoon', 
    'good evening', 'greetings', 'howdy', 'what\'s up', 'whats up'
  ];
  
  return greetings.some(greeting => 
    lowerMessage === greeting || 
    lowerMessage.startsWith(greeting + ' ') || 
    lowerMessage.startsWith(greeting + '!')
  );
}

// Function to classify the query
function classifyQuery(message) {
  const lowerMessage = message.toLowerCase();
  
  // Check for casual greetings first
  if (isCasualGreeting(message)) {
    return 'CASUAL-GREETING';
  }
  
  // Map partial entity names to full names
  let expandedMessage = lowerMessage;
  Object.keys(entityMapping).forEach(key => {
    if (lowerMessage.includes(key)) {
      expandedMessage = expandedMessage.replace(new RegExp(key, 'gi'), entityMapping[key]);
    }
  });

  // Keywords indicating a user-specific financial query
  const userSpecificKeywords = [
    'my portfolio', 'my sip', 'my investments', 'my orders', 'my balance',
    'my transactions', 'my account', 'my mutual funds', 'my returns',
    'my performance', 'my folios'
  ];

  // Expanded keywords for general financial queries
  const generalFinancialKeywords = [
    'mutual fund', 'sip', 'investment', 'portfolio', 'returns', 'performance',
    'market', 'stocks', 'shares', 'bonds', 'equity', 'debt', 'tax', 'financial planning',
    'risk', 'strategy', 'reliance', 'hdf mutual fund', 'sbi', 'apple', 'stock price',
    'market cap', 'dividend', 'etf', 'fund', 'trade', 'growth', 'value', 'sector',
    'nasdaq', 'dow jones', 's&p 500', 'economy', 'interest rates', 'inflation', 'recession'
  ];

  const isUserSpecific = userSpecificKeywords.some(keyword => expandedMessage.includes(keyword));
  const isFinancial = generalFinancialKeywords.some(keyword => expandedMessage.includes(keyword)) || isUserSpecific;

  if (!isFinancial) {
    return 'NON-FINANCIAL';
  }
  return isUserSpecific ? 'USER-SPECIFIC-FINANCIAL' : 'GENERAL-FINANCIAL';
}

// Function to strip hashtags from AI response
function stripHashtags(response) {
  return response.replace(/#[^\s]+/g, '');
}

// Function to generate casual greeting response
function generateCasualGreeting(userName) {
  const greetings = [
    `Hi ${userName}! How can I help you with your finances today?`,
    `Hello ${userName}! What would you like to know about your investments?`,
    `Hey ${userName}! Ready to discuss your portfolio?`,
    `Hi there ${userName}! What financial questions do you have for me?`,
    `Hello ${userName}! I'm here to help with all your investment needs.`
  ];
  
  return greetings[Math.floor(Math.random() * greetings.length)];
}

app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { chatId, title, message } = req.body;
    const userId = new ObjectId(req.user._id);
    
    const customerId = req.user.customerId || req.user.id;
    console.log('JWT user object:', {
      _id: req.user._id,
      id: req.user.id,
      customerId: req.user.customerId,
      rayiCustomerId: req.user.rayiCustomerId
    });
    console.log('Processing chat for customerId:', customerId, 'Type:', typeof customerId);
    
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
    
    const userMessage = {
      sender: 'user',
      content: message,
      timestamp: new Date()
    };
    
    if (!chat.messages) {
      chat.messages = [];
    }
    chat.messages.push(userMessage);
    
    const queryType = classifyQuery(message);
    console.log('Query classified as:', queryType);

    const recentMessages = chat.messages.slice(-5).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    const isFirstMessage = chat.messages.length === 1;

    let systemPrompt;
    let userData = {};

    // Always fetch user data to allow for mixed queries
    userData = await getUserData(customerId);

    // Handle casual greetings
    if (queryType === 'CASUAL-GREETING') {
      const aiResponse = generateCasualGreeting(userData.customer?.name || 'there');
      
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
        ? "Hello! I'm your specialized financial advisor assistant, here to assist with your investment portfolio, orders, mutual funds, and other financial matters. It seems your question isn't related to finance. Could you please ask about your investments, portfolio performance, or financial planning needs? I'm happy to help with those!"
        : "It seems your question isn't related to finance. Could you please ask about your investments, portfolio performance, or financial planning needs? I'm happy to help with those!";
      
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
    } else if (queryType === 'USER-SPECIFIC-FINANCIAL') {
      systemPrompt = `You are a personable and friendly financial advisor AI assistant. You communicate in a natural, conversational tone while maintaining professionalism.

AUTHORIZATION SCOPE:
You are authorized to discuss ONLY the following topics:
- Portfolio analysis and performance
- Investment holdings and allocations  
- Order history and transaction details
- Mutual fund information and performance
- Financial planning recommendations based on user data
- Investment strategy and risk assessment
- Returns, gains, losses, and performance metrics
- Account balances and folio information
- Tax implications of investments (general guidance)
- Market analysis related to user's holdings
- General stock performance, market trends, and stock funds (e.g., ETFs) when relevant to the user's query

USER DATA ACCESS:
You have access to the following user financial data:
- Customer Name: ${userData.customer?.name || 'Unknown'}
- Customer ID: ${userData.customer?.id || 'Unknown'}
- RAYI Customer ID: ${userData.customer?.rayi_customer_id || 'Unknown'}
- Total Orders: ${userData.orders?.length || 0}
- Total Folios: ${userData.folios?.length || 0}

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
1. **Natural Conversation Flow**:
   - Respond naturally as if you're having a real conversation with a friend or colleague
   - Use the conversation history to maintain context and flow
   - Mirror the user's communication style (formal/casual) while staying professional
   - Feel free to use contractions (I'll, you're, let's) to sound more natural
   - Ask follow-up questions when appropriate to better understand their needs

2. **Personalization**:
   - Always address the user by name when appropriate: "${userData.customer?.name || 'there'}"
   - Reference their specific data and situation
   - Remember what was discussed earlier in the conversation
   - Make connections between different aspects of their portfolio

3. **Comprehensive Analysis**:
   - Provide detailed, actionable insights based on their actual data
   - Compare their performance to market benchmarks when relevant
   - Explain financial concepts in simple terms
   - Offer specific recommendations based on their portfolio

4. **Professional Formatting**:
   - Use markdown for better readability
   - Format monetary amounts appropriately (₹ for Indian, $ for US)
   - Create clear tables and lists when presenting data
   - No hashtags or social media formatting

5. **Engagement**:
   - End responses with engaging questions or offers to help further
   - Show genuine interest in their financial success
   - Celebrate their good investment choices
   - Provide encouragement and guidance for areas of improvement

CRITICAL RULES:
- MUST acknowledge and detail orders if they exist in the data
- Base all responses on actual user data, never make up information
- Stay within financial topics only
- Maintain user data confidentiality`;
    } else {
      systemPrompt = `You are a personable and friendly financial advisor AI assistant. You communicate in a natural, conversational tone while maintaining professionalism.

AUTHORIZATION SCOPE:
You are authorized to discuss ONLY the following topics:
- General mutual fund information and performance
- Financial planning recommendations (general)
- Investment strategy and risk assessment (general)
- Market analysis and trends
- Tax implications of investments (general guidance)
- Stock performance, including specific companies
- Stock funds (e.g., ETFs, mutual funds) and their performance
- User-specific financial data when relevant to the query

USER DATA ACCESS (for reference when needed):
You have access to the following user financial data:
- Customer Name: ${userData.customer?.name || 'Unknown'}
- Customer ID: ${userData.customer?.id || 'Unknown'}
- RAYI Customer ID: ${userData.customer?.rayi_customer_id || 'Unknown'}
- Total Orders: ${userData.orders?.length || 0}
- Total Folios: ${userData.folios?.length || 0}

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
1. **Natural Conversation Flow**:
   - Respond naturally as if you're having a real conversation
   - Use the conversation history to maintain context
   - Feel free to use contractions and conversational language
   - Ask follow-up questions when appropriate

2. **Comprehensive Analysis**:
   - Provide detailed analysis for stock/market queries
   - Include recent performance, financial metrics, and market trends
   - Relate general information to the user's situation when possible
   - Suggest relevant investment options or strategies

3. **Professional Formatting**:
   - Use markdown for better readability
   - Format monetary amounts appropriately
   - Create clear tables and lists when presenting data
   - No hashtags or social media formatting

CRITICAL RULES:
- MUST ONLY respond to finance-related queries
- Provide actionable, accurate financial insights
- Stay professional while being conversational
- Reference user data when relevant to enhance the response`;
    }

    // Select models based on query complexity
    let selectedModels = [OPENROUTER_MODELS[0], OPENROUTER_MODELS[3]]; // Default: Gemini 2.5 Pro, GPT-4o
    if (queryType === 'GENERAL-FINANCIAL' && message.length < 50) {
      selectedModels = [OPENROUTER_MODELS[1], OPENROUTER_MODELS[9]]; // Gemini 2.5 Flash, Llama 3 for simple queries
    }
    console.log(`Using models: ${selectedModels.join(', ')}`);

    try {
      const completion = await openai.createChatCompletion({
        models: selectedModels, // Use models array for automatic fallback
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages,
          { role: "user", content: message }
        ],
        max_tokens: 1200,
        temperature: 0.8 // Slightly higher for natural responses
      });

      let aiResponse = completion.data.choices[0].message.content;
      const usedModel = completion.data.model || selectedModels[0]; // Log the model used
      console.log(`Response generated by model: ${usedModel}`);
      
      // Post-process the response to remove any hashtags
      aiResponse = stripHashtags(aiResponse);
      
      const assistantMessage = {
        sender: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        model: usedModel // Include for debugging and cost tracking
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

    } catch (apiError) {
      console.error('OpenRouter API error:', apiError.message);
      res.status(503).json({
        error: 'Failed to generate response',
        details: `All models (${selectedModels.join(', ')}) are unavailable or rate-limited. Please try again later.`
      });
    }

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

// New endpoint to get available models
app.get('/api/models', (req, res) => {
  res.json({
    models: OPENROUTER_MODELS,
    currentDefault: OPENROUTER_MODELS[0],
    fallback: OPENROUTER_MODELS[3],
    description: "Top 10 OpenRouter models for financial AI applications (2025)"
  });
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

// Serve static files from Frontend directory
app.use(express.static(path.join(__dirname, '../Frontend')));

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend', 'index.html'), (err) => {
        if (err) {
            res.status(500).send('Error serving index.html');
        }
    });
});

// Mount API routes
app.use('/api', apiRoutes);

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err.stack);
    res.status(500).json({ message: 'Something went wrong on the server.' });
});

// Connect to MongoDB via Mongoose
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB via Mongoose'))
    .catch(err => console.error('MongoDB Mongoose connection error:', err));

// Initialize MongoDB client
initMongoDB();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});

// Graceful shutdown
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