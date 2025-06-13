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

// Function to classify the query
function classifyQuery(message) {
  const lowerMessage = message.toLowerCase().trim();
  
  // Detect greetings
  const greetings = ['hi', 'hello', 'hey', 'thank', 'thanks', 'thx', 'hii', 'helo'];
  const isGreeting = greetings.some(g => lowerMessage.startsWith(g) || lowerMessage === g);
  
  if (isGreeting) {
    return 'GREETING';
  }

  // Map partial entity names to full names
  let expandedMessage = lowerMessage;
  Object.keys(entityMapping).forEach(key => {
    if (lowerMessage.includes(key)) {
      expandedMessage = expandedMessage.replace(new RegExp(`\\b${key}\\b`, 'gi'), entityMapping[key]);
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
    'risk', 'strategy', 'reliance', 'hdf mutual fund', 'state bank of india', 'apple inc.',
    'stock price', 'market cap', 'dividend', 'etf', 'fund', 'trade', 'growth', 'value', 
    'sector', 'nasdaq', 'dow jones', 's&p 500', 'economy', 'interest rates', 'inflation', 'recession'
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
    
    const processedMessage = preprocessQuery(message);
    const userMessage = {
      sender: 'user',
      content: message, // Store original message
      processedContent: processedMessage, // Store processed message for AI
      timestamp: new Date()
    };
    
    if (!chat.messages) {
      chat.messages = [];
    }
    chat.messages.push(userMessage);
    
    const queryType = classifyQuery(processedMessage);
    console.log('Query classified as:', queryType);

    const recentMessages = chat.messages.slice(-5).map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant',
      content: msg.processedContent || msg.content
    }));

    const isFirstMessage = chat.messages.length === 1;

    let systemPrompt;
    let userData = {};

    // Always fetch user data to allow for mixed queries
    userData = await getUserData(customerId);

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
1. **Politeness and Tone**:
   - For the first message in a chat session, start with a polite greeting like "Hello ${userData.customer?.name || 'there'}!" or "Hi ${userData.customer?.name || 'there'}!".
   - For follow-up messages, do NOT use a greeting unless the conversation context suggests it's needed (e.g., after a long pause or a non-financial query rejection). Instead, dive straight into the response while maintaining a polite and professional tone.
   - Always end your response with a friendly closer, such as "Let me know how I can assist you further!" or "Feel free to ask me anything else!"
   - Maintain a warm, professional, and conversational tone throughout, as if speaking to a valued client.

2. **Conversation Context**:
   - Use the provided conversation history (recentMessages) to maintain context and make the conversation flow naturally.
   - Reference prior messages when relevant to show continuity (e.g., "Following up on your question about your SIPs, here's more detail...").
   - Summarize the conversation context if multiple messages are relevant (e.g., "Based on your earlier questions about your portfolio and Apple stock...").
   - Avoid abrupt or disconnected responses; ensure each response feels like a natural continuation of the conversation.

3. **Comprehensive Financial Analysis**:
   - For user-specific queries (e.g., "my portfolio"), provide a detailed analysis including:
     - Portfolio holdings, allocations, and performance metrics.
     - Specific details about orders, folios, and mutual funds from the user data.
     - Comparisons with market trends or benchmarks (e.g., "Your portfolio has 5% in tech stocks, while the tech sector has grown 10% this year").
   - For general financial queries (e.g., "Apple stock performance"), provide:
     - Recent stock performance (price trends, market cap, P/E ratio, etc.).
     - Financial metrics (revenue, net income, cash flow, etc.).
     - Broader market trends affecting the stock (e.g., economic conditions, sector performance).
     - Related stock funds (e.g., ETFs or mutual funds that include the stock).
   - For mixed queries (e.g., "How does Apple stock compare to my portfolio?"), combine user-specific data with general financial insights.
   - Suggest visualizations to enhance understanding:
     - Pie charts for portfolio allocations (e.g., "Insert a pie chart showing your portfolio allocation by sector here").
     - Bar graphs for performance comparisons (e.g., "Insert a bar graph comparing your portfolio returns to the S&P 500 here").
     - Line graphs for time-series data (e.g., "Insert a line graph of Apple Inc.'s stock price over the past year here").
   - Ensure responses are concise yet comprehensive, providing actionable insights.

4. **Formatting**:
   - Format all monetary amounts in Indian Rupees (₹) for Indian stocks or USD ($) for international stocks as appropriate.
   - Provide specific details from the actual data when discussing orders, folios, or investments.
   - Format responses using markdown for better readability:
     - Use headings (#, ##, ###) for sections.
     - Use bullet points (-) for lists.
     - Use tables for structured data with the following strict guidelines:
       - Use bold (**Header**) for table headers to make them stand out.
       - Add a separator row with dashes (e.g., | --- | --- | --- |) below the header row to clearly delineate headers from data.
       - Ensure a minimum of 3 spaces between columns for padding to improve readability.
       - Standardize column widths by setting each column to the width of the longest entry in that column, padding shorter entries with spaces.
       - For long text entries (e.g., "Reliance Industries"), truncate with an ellipsis (e.g., "Reliance Ind…") to fit within a maximum width of 15 characters per column, or split into multiple lines if truncation is not suitable.
       - Example of a well-formatted table:
         | **Company**        | **Sector**     | **Allocation** |
         |--------------------|----------------|----------------|
         | HDFC Bank          | Banking        | 8.5%           |
         | Reliance Ind…      | Energy         | 7.2%           |
         | Infosys            | IT             | 6.3%           |
     - Use bold (**text**) and italic (*text*) for emphasis where appropriate.
   - **Do NOT include hashtags (e.g., #FinanceTips), emojis, or any social media-style formatting.** Keep the tone professional and clean.

5. **Content**:
   - CRITICAL: If orders exist in the data, you MUST acknowledge and detail them. Never say "no orders found" when orders are present.
   - If user data is missing or incomplete, acknowledge this gracefully (e.g., "I couldn’t find your portfolio data, but I can still provide general insights about Apple stock").
   - Interpret typos, abbreviations, and incomplete sentences to understand the user's intent (e.g., "portfolo" → "portfolio", "SBI" → "State Bank of India").
   - Offer clear, actionable financial insights based on the available data.
   - For queries involving partial names (e.g., "SBI"), interpret them as referring to the full entity (e.g., "State Bank of India") and respond accordingly.

6. **Errors and Exceptions**:
   - If an error occurs, provide a clear explanation and suggest a solution.
   - If the query is not understood, provide a clear explanation and suggest a related topic.
   - If the query is too vague, ask for clarification (e.g., "Could you please specify which mutual fund you are referring to?").
   - If the query is too broad, suggest narrowing it down (e.g., "Are you looking for information on a specific stock or mutual fund?").

STRICT OPERATIONAL RULES:
- You MUST ONLY respond to queries related to finance, investments, portfolio management, and financial markets.
- Do NOT engage in conversations about:
  * General knowledge questions unrelated to finance
  * Personal advice unrelated to finance
  * Technical support for non-financial systems
  * Entertainment, sports, weather, news (unless directly related to financial markets)
  * Programming or coding help
  * Health, relationships, or lifestyle advice
  * Any topic outside financial services

CONTEXT AWARENESS:
- Use the conversation history (recentMessages) to understand the context.
- If the user asked about a specific stock or portfolio earlier, reference it in the response if relevant.
- Summarize prior context if the conversation involves multiple related queries (e.g., "You previously asked about your portfolio's tech allocation, and now you're asking about Apple stock...").

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
    
    // Post-process the response to remove any hashtags
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