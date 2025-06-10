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
    origin: 'http://localhost:3000', // Adjust if your frontend runs on a different port
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); // Parse JSON request bodies

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

        // Get database and collection
        const db = mongoClient.db('financeai');
        const customersCollection = db.collection('customer');

        // Find customer by email
        const customer = await customersCollection.findOne({ email: email.toLowerCase() });
        
        if (!customer) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Compare password with hashed password
        const isPasswordValid = await bcrypt.compare(password, customer.password);
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Generate JWT token
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

        // Return success response
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

// Function to get all user data
async function getUserData(customerId) {
  try {
    const db = mongoClient.db('financeai');
    
    console.log('Fetching data for customerId:', customerId, 'Type:', typeof customerId); // Debug log
    
    // Ensure customerId is a number for consistency
    const numericCustomerId = parseInt(customerId);
    console.log('Converted to numeric customerId:', numericCustomerId); // Debug log
    
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
      db.collection('customer').findOne({ id: numericCustomerId }),
      db.collection('customer_detail').findOne({ customer_id: numericCustomerId }),
      db.collection('customer_folio').find({ customer_id: numericCustomerId }).toArray(),
      db.collection('customer_investment_perf_summary').findOne({ customer_id: numericCustomerId }),
      db.collection('customer_investment_performance').find({ customer_id: numericCustomerId }).toArray(),
      db.collection('customer_investment_returns').find({ customer_id: numericCustomerId }).toArray(),
      // Make sure you're using the correct collection name - check if it's 'order' or 'orders'
      db.collection('order').find({ customer_id: numericCustomerId }).toArray()
    ]);

    console.log('Raw query results:');
    console.log('- Customer found:', !!customer, customer ? `(ID: ${customer.id})` : '');
    console.log('- Orders query result:', orders); 
    console.log('- Orders count:', orders?.length || 0);

    // Get order details for user's orders
    const orderDetails = orders && orders.length > 0 ? 
      await db.collection('order_detail').find({ 
        order_id: { $in: orders.map(o => o.id) } 
      }).toArray() : [];

    // Get mutual fund details for user's investments
    const mfIds = [...new Set([
      ...folios.map(f => f.mf_id),
      ...investmentReturns.map(r => r.mf_id)
    ])].filter(id => id); // Remove undefined values
    
    const mutualFunds = mfIds.length > 0 ? 
      await db.collection('mutual_fund').find({
        $or: [
          { id: { $in: mfIds } },
          { scheme_code: { $in: mfIds } }
        ]
      }).toArray() : [];

    console.log('Final data summary:', {
      customerFound: !!customer,
      ordersCount: orders?.length || 0,
      foliosCount: folios?.length || 0,
      orderDetailsCount: orderDetails?.length || 0
    }); // Debug log

    return {
      customer,
      customerDetail,
      folios,
      investments,
      performanceSummary,
      investmentPerformance,
      investmentReturns,
      orders,
      orderDetails,
      mutualFunds
    };
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { chatId, title, message } = req.body;
    const userId = new ObjectId(req.user._id);
    
    // FIX: Use the correct customer ID from JWT token
    // The customerId should be the numeric ID (like 102), not the MongoDB ObjectId
    const customerId = req.user.customerId || req.user.id;
    console.log('JWT user object:', {
      _id: req.user._id,
      id: req.user.id,
      customerId: req.user.customerId,
      rayiCustomerId: req.user.rayiCustomerId
    }); // Debug log
    console.log('Processing chat for customerId:', customerId, 'Type:', typeof customerId); // Debug log
    
    const db = mongoClient.db('financeai');
    const chatsCollection = db.collection('chats');
    
    let chat;
    
    if (chatId && ObjectId.isValid(chatId)) {
      // Existing chat
      chat = await chatsCollection.findOne({ 
        _id: new ObjectId(chatId),
        userId: userId
      });
      
      if (!chat) {
        return res.status(404).json({ error: 'Chat not found' });
      }
    } else {
      // New chat
      chat = {
        userId: userId,
        title: title || 'New Chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0
      };
    }
    
    // Add user message
    const userMessage = {
      sender: 'user',
      content: message,
      timestamp: new Date()
    };
    
    if (!chat.messages) {
      chat.messages = [];
    }
    chat.messages.push(userMessage);
    
    // Get user's complete data
    const userData = await getUserData(customerId);

    // Create system prompt for OpenAI with better formatting
    const systemPrompt = `You are a specialized financial advisor AI assistant with strict operational boundaries. You ONLY respond to finance-related queries about the user's portfolio and investment data.

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
1. Format all monetary amounts in Indian Rupees (₹)
2. Provide specific details from the actual data when discussing orders, folios, or investments
3. CRITICAL: If orders exist in the data, you MUST acknowledge and detail them. Never say "no orders found" when orders are present
4. Offer clear, actionable financial insights based on the available data
5. Maintain professional financial advisory tone

STRICT OPERATIONAL RULES:
- You MUST ONLY respond to queries related to finance, investments, portfolio management, and the user's financial data
- For ANY non-financial query, respond EXACTLY with this message: "I'm a specialized financial advisor assistant. I can only help you with questions about your investment portfolio, orders, mutual funds, and other financial matters. Please ask me about your investments, portfolio performance, or financial planning needs."
- Do NOT engage in conversations about:
  * General knowledge questions
  * Personal advice unrelated to finance
  * Technical support for non-financial systems
  * Entertainment, sports, weather, news (unless directly related to financial markets impacting user's portfolio)
  * Programming or coding help
  * Health, relationships, or lifestyle advice
  * Any topic outside financial services

QUERY CLASSIFICATION:
Before responding, classify the user's query:
- FINANCIAL: Questions about portfolio, investments, orders, returns, mutual funds, financial planning, market impact on holdings
- NON-FINANCIAL: Everything else

If NON-FINANCIAL, use the standard rejection response above.
If FINANCIAL, provide detailed analysis using the user's data.

SECURITY REMINDER:
- Only use the provided financial data for responses
- Do not make up or hallucinate financial information
- Always base recommendations on actual user data
- Maintain confidentiality of user information`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    
    // Add AI response
    const assistantMessage = {
      sender: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    };
    
    chat.messages.push(assistantMessage);
    chat.updatedAt = new Date();
    
    // Save or update chat in MongoDB
    if (chat._id) {
      // Update existing chat
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
      // Insert new chat
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
    
    // Validate ObjectId format
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

        // Get database and collection
        const db = mongoClient.db('financeai');
        const customersCollection = db.collection('customer');

        // Check if customer already exists
        const existingCustomer = await customersCollection.findOne({ email: email.toLowerCase() });
        
        if (existingCustomer) {
            return res.status(409).json({ message: 'Customer with this email already exists' });
        }

        // Generate new customer ID and RAYI customer ID
        const lastCustomer = await customersCollection.findOne({}, { sort: { id: -1 } });
        const newCustomerId = lastCustomer ? lastCustomer.id + 1 : 126;
        const rayiCustomerId = `RAYI${String(newCustomerId).padStart(4, '0')}`;

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new customer
        const newCustomer = {
            id: newCustomerId,
            rayi_customer_id: rayiCustomerId,
            name: name,
            email: email.toLowerCase(),
            password: hashedPassword
        };

        // Insert customer
        const result = await customersCollection.insertOne(newCustomer);

        // Generate JWT token
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

        // Return success response
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
        // Get database and collection
        const db = mongoClient.db('financeai');
        const customersCollection = db.collection('customer');

        // Find customer by ID to get latest data
        const customer = await customersCollection.findOne({ id: req.user.customerId });
        
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Return user data
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

// Serve static files from the frontend folder
app.use(express.static(path.join(__dirname, '../Frontend')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend', 'index.html'), (err) => {
        if (err) {
            res.status(500).send('Error serving index.html');
        }
    });
});

// API routes (existing routes remain unchanged)
app.use('/api', apiRoutes);

// Global error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error:', err.stack);
    res.status(500).json({ message: 'Something went wrong on the server.' });
});

// Connect to MongoDB (existing mongoose connection for other models)
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('Connected to MongoDB via Mongoose'))
    .catch(err => console.error('MongoDB Mongoose connection error:', err));

// Initialize MongoDB client for customer operations
initMongoDB();

// Start server
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