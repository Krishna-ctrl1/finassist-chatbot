const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const apiRoutes = require("./routes/api");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");
const OpenAI = require("openai");
const stringSimilarity = require("string-similarity");
const axios = require("axios");
const crypto = require("crypto");
const FAQ_KB = require("../data/faq.json");
const Ticket = require("./models/Ticket");
const multer = require("multer");
const { GridFSBucket } = require("mongodb");

// FAQ Search Function
function searchFAQs(userQuery) {
  if (!FAQ_KB || FAQ_KB.length === 0) {
    return null;
  }

  const normalizedQuery = userQuery.toLowerCase().trim();
  
  // Direct question match (high similarity threshold)
  for (const faq of FAQ_KB) {
    const normalizedQuestion = faq.Question?.toLowerCase() || '';
    const similarity = stringSimilarity.compareTwoStrings(normalizedQuery, normalizedQuestion);
    
    if (similarity > 0.8) { // Increased threshold for direct matches
      return {
        faq: faq,
        confidence: similarity,
        matchType: 'direct_question'
      };
    }
  }

  // Specific FAQ patterns - only match very specific phrases
  const specificPatterns = [
    {
      keywords: ['bank account', 'bank accounts', 'add bank', 'another bank', 'how many bank', 'primary bank'],
      requiredWords: ['bank', 'account'],
      excludeWords: ['nav', 'mutual fund performance', 'returns', 'portfolio'],
      findFAQ: () => FAQ_KB.find(faq => 
        faq.Question?.toLowerCase().includes('bank account') && 
        faq.Question?.toLowerCase().includes('how many')
      )
    },
    {
      keywords: ['what is sip', 'sip means', 'systematic investment plan'],
      requiredWords: ['sip'],
      excludeWords: ['portfolio', 'nav', 'returns'],
      findFAQ: () => FAQ_KB.find(faq => 
        faq.Question?.toLowerCase().includes('what is a sip')
      )
    },
    {
      keywords: ['what is nav', 'nav means', 'net asset value'],
      requiredWords: ['nav'],
      excludeWords: ['portfolio', 'sip', 'bank'],
      findFAQ: () => FAQ_KB.find(faq => 
        faq.Question?.toLowerCase().includes('what is nav')
      )
    },
    {
      keywords: ['what is mutual fund', 'mutual fund means', 'how does mutual fund work'],
      requiredWords: ['mutual', 'fund'],
      excludeWords: ['nvidia', 'specific fund', 'find fund', 'recommend fund', 'search fund'],
      findFAQ: () => FAQ_KB.find(faq => 
        faq.Question?.toLowerCase().includes('what is a mutual fund')
      )
    },
    {
      keywords: ['kyc', 'kyc registration', 'kyc documents', 'kyc process'],
      requiredWords: ['kyc'],
      excludeWords: ['portfolio', 'nav', 'returns'],
      findFAQ: () => FAQ_KB.find(faq => 
        faq.Question?.toLowerCase().includes('kyc registration')
      )
    }
  ];

  // Check specific patterns
  for (const pattern of specificPatterns) {
    const hasKeyword = pattern.keywords.some(keyword => normalizedQuery.includes(keyword));
    const hasRequiredWords = pattern.requiredWords.every(word => normalizedQuery.includes(word));
    const hasExcludedWords = pattern.excludeWords.some(word => normalizedQuery.includes(word));
    
    if (hasKeyword && hasRequiredWords && !hasExcludedWords) {
      const faq = pattern.findFAQ();
      if (faq) {
        return {
          faq: faq,
          confidence: 0.9,
          matchType: 'specific_pattern'
        };
      }
    }
  }

  // Only allow very high similarity matches for general questions
  const highSimilarityMatches = FAQ_KB.map(faq => {
    const normalizedQuestion = faq.Question?.toLowerCase() || '';
    const similarity = stringSimilarity.compareTwoStrings(normalizedQuery, normalizedQuestion);
    
    return {
      faq: faq,
      confidence: similarity,
      matchType: 'high_similarity'
    };
  }).filter(match => match.confidence > 0.75); // Very high threshold

  // Return best high similarity match if found
  if (highSimilarityMatches.length > 0) {
    return highSimilarityMatches.sort((a, b) => b.confidence - a.confidence)[0];
  }

  return null;
}

dotenv.config({ path: path.join(__dirname, "../.env") });

// Mock financial data for fallback when API is unavailable
const getMockStockData = (query) => {
  const mockData = {
    'aapl': { symbol: 'AAPL', price: '$193.42', change: '+1.2%', company: 'Apple Inc.' },
    'apple': { symbol: 'AAPL', price: '$193.42', change: '+1.2%', company: 'Apple Inc.' },
    'tsla': { symbol: 'TSLA', price: '$248.50', change: '-0.8%', company: 'Tesla Inc.' },
    'tesla': { symbol: 'TSLA', price: '$248.50', change: '-0.8%', company: 'Tesla Inc.' },
    'msft': { symbol: 'MSFT', price: '$428.90', change: '+0.5%', company: 'Microsoft Corp.' },
    'microsoft': { symbol: 'MSFT', price: '$428.90', change: '+0.5%', company: 'Microsoft Corp.' },
    'googl': { symbol: 'GOOGL', price: '$175.40', change: '+1.1%', company: 'Alphabet Inc.' },
    'google': { symbol: 'GOOGL', price: '$175.40', change: '+1.1%', company: 'Alphabet Inc.' },
    'amzn': { symbol: 'AMZN', price: '$186.20', change: '+0.3%', company: 'Amazon.com Inc.' },
    'amazon': { symbol: 'AMZN', price: '$186.20', change: '+0.3%', company: 'Amazon.com Inc.' }
  };
  
  const queryLower = query.toLowerCase();
  for (const [key, data] of Object.entries(mockData)) {
    if (queryLower.includes(key)) {
      return {
        title: `${data.company} (${data.symbol}) Stock Price`,
        description: `Current stock price: ${data.price} (${data.change}). Real-time quote and market data for ${data.company}. Market cap, trading volume, and financial metrics.`,
        url: `https://finance.yahoo.com/quote/${data.symbol}`
      };
    }
  }
  
  return {
    title: 'Stock Price Information',
    description: 'For real-time stock data, please configure your Brave Search API key or use a financial data provider.',
    url: 'https://finance.yahoo.com'
  };
};

// Web search functionality using Brave API with fallback
const searchWeb = async (query) => {
  try {
    console.log(`Searching with query: ${query}`);
    
    // Check if API key is configured
    if (!process.env.BRAVE_API_KEY || process.env.BRAVE_API_KEY === 'your_brave_search_api_key_here') {
      console.log('⚠️ Brave API key not configured, using mock data fallback');
      const mockResult = getMockStockData(query);
      return [mockResult];
    }
    
    // Use Brave Search API for current financial data, stock prices, etc.
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.append('q', query);
    url.searchParams.append('count', '10'); // Increased count for better results
    url.searchParams.append('result_filter', 'web');
    url.searchParams.append('freshness', 'pd'); // Past day for fresh data
    url.searchParams.append('country', 'US'); // Focus on US markets initially
    url.searchParams.append('safe_search', 'moderate');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Subscription-Token': process.env.BRAVE_API_KEY,
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip'
      }
    });

    console.log(`Brave API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brave API error: ${response.status} ${response.statusText}`, errorText);
      
      // Fallback to mock data if API fails
      console.log('🔄 Falling back to mock data due to API error');
      const mockResult = getMockStockData(query);
      return [mockResult];
    }

    const data = await response.json();
    console.log(`Search results count: ${data.web?.results?.length || 0}`);
    
    // Log first few results for debugging
    if (data.web?.results?.length > 0) {
      console.log('First search result:', {
        title: data.web.results[0].title,
        description: data.web.results[0].description?.substring(0, 100),
        url: data.web.results[0].url
      });
    }
    
    return data.web?.results || [];
  } catch (error) {
    console.error('Error in web search:', error);
    
    // Fallback to mock data on any error
    console.log('🔄 Falling back to mock data due to search error');
    const mockResult = getMockStockData(query);
    return [mockResult];
  }
};

// Enhanced function to extract financial data from search results
const extractFinancialData = (searchResults, query) => {
  if (!searchResults || searchResults.length === 0) {
    return {
      query: query,
      timestamp: new Date().toISOString(),
      results: [],
      summary: 'No search results found',
      error: 'No data available'
    };
  }

  console.log(`Processing ${searchResults.length} search results for query: ${query}`);

  let extractedData = {
    query: query,
    timestamp: new Date().toISOString(),
    results: [],
    summary: '',
    financialData: {
      stockPrice: null,
      currency: null,
      change: null,
      changePercent: null,
      marketCap: null,
      source: null
    }
  };

  // Prioritize financial data sources
  const prioritySources = [
    'yahoo.com', 'finance.yahoo.com', 'google.com/finance', 'bloomberg.com', 
    'reuters.com', 'marketwatch.com', 'cnbc.com', 'investing.com',
    'moneycontrol.com', 'nseindia.com', 'bseindia.com'
  ];

  // Sort results by priority (financial sources first)
  const sortedResults = searchResults.sort((a, b) => {
    const aIsPriority = prioritySources.some(source => a.url?.includes(source));
    const bIsPriority = prioritySources.some(source => b.url?.includes(source));
    
    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;
    return 0;
  });

  // Process search results and extract relevant financial information
  sortedResults.forEach((result, index) => {
    if (index < 8) { // Use top 8 results for better data coverage
      const resultData = {
        title: result.title || '',
        description: result.description || '',
        url: result.url || '',
        snippet: result.description || '',
        isPrioritySource: prioritySources.some(source => result.url?.includes(source))
      };
      
      // Extract potential financial data from title and description
      const text = `${result.title} ${result.description}`.toLowerCase();
      
      // Look for stock price patterns
      const pricePatterns = [
        /\$([0-9,]+\.?[0-9]*)/g,
        /([0-9,]+\.?[0-9]*)\s*(?:usd|dollars?)/gi,
        /price[:\s]*\$?([0-9,]+\.?[0-9]*)/gi,
        /([0-9,]+\.?[0-9]*)\s*per\s*share/gi,
        /₹([0-9,]+\.?[0-9]*)/g, // For Indian stocks
        /trading\s*at\s*\$?([0-9,]+\.?[0-9]*)/gi,
        /current\s*price[:\s]*\$?([0-9,]+\.?[0-9]*)/gi,
        /stock\s*price[:\s]*\$?([0-9,]+\.?[0-9]*)/gi
      ];
      
      // Look for percentage changes
      const changePatterns = [
        /([+-]?[0-9]+\.?[0-9]*)%/g,
        /(up|down|gained?|lost?)\s*([0-9]+\.?[0-9]*)%/gi,
        /([+-]?[0-9]+\.?[0-9]*)\s*percent/gi
      ];
      
      pricePatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches && !extractedData.financialData.stockPrice) {
          extractedData.financialData.stockPrice = matches[0];
          extractedData.financialData.source = result.url;
        }
      });
      
      changePatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches && !extractedData.financialData.changePercent) {
          extractedData.financialData.changePercent = matches[0];
        }
      });
      
      extractedData.results.push(resultData);
    }
  });

  // Create a comprehensive summary from the search results
  if (extractedData.results.length > 0) {
    // Prioritize descriptions from financial sources
    const priorityDescriptions = extractedData.results
      .filter(r => r.isPrioritySource)
      .map(r => r.description)
      .filter(d => d && d.length > 10);
      
    const allDescriptions = extractedData.results
      .map(r => r.description)
      .filter(d => d && d.length > 10);
    
    const descriptionsToUse = priorityDescriptions.length > 0 ? priorityDescriptions : allDescriptions;
    
    extractedData.summary = descriptionsToUse
      .slice(0, 3)
      .join(' | ')
      .substring(0, 800);
      
    // Add extracted financial data to summary if found
    if (extractedData.financialData.stockPrice) {
      extractedData.summary = `EXTRACTED PRICE: ${extractedData.financialData.stockPrice}` + 
        (extractedData.financialData.changePercent ? ` (${extractedData.financialData.changePercent})` : '') +
        ` | ${extractedData.summary}`;
    }
  }

  console.log('Extracted financial data:', {
    hasPrice: !!extractedData.financialData.stockPrice,
    hasChange: !!extractedData.financialData.changePercent,
    resultCount: extractedData.results.length,
    summaryLength: extractedData.summary.length
  });

  return extractedData;
};

const app = express();

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

let mongoClient;
let gridFSBucket;

// Initialize MongoDB connection
async function initMongoDB() {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI environment variable is required");
    }

    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("MongoDB client connected for customer authentication");

    const db = mongoClient.db("financeai");

    // Test database connection
    await db.admin().ping();
    console.log("MongoDB ping successful");

    // Initialize GridFS bucket for file uploads
    gridFSBucket = new GridFSBucket(db, {
      bucketName: "ticketUploads",
    });
    console.log("GridFS bucket initialized successfully");

    // Test GridFS by checking if the bucket is accessible
    try {
      await db.collection("ticketUploads.files").findOne({});
      console.log("GridFS bucket is accessible");
    } catch (gridFSError) {
      console.log(
        "GridFS bucket created (first time setup):",
        gridFSError.message
      );
    }

    try {
      await db.collection("chats").createIndex({ userId: 1, updatedAt: -1 });
      console.log("Chat collection indexes created");
    } catch (indexError) {
      console.log("Index may already exist:", indexError.message);
    }
  } catch (error) {
    console.error("MongoDB client connection error:", error);
    console.error("Please check your MONGO_URI and ensure MongoDB is running");
    // Don't exit the process, but log the error
  }
}

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windows
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/auth", authLimiter);

// Middleware
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Multer configuration for file uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allow only images and PDFs
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed."
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 3, // Maximum 3 files per upload
  },
});

// Helper function to upload file to GridFS
const uploadFileToGridFS = (fileBuffer, filename, originalName, mimetype) => {
  return new Promise((resolve, reject) => {
    const uploadStream = gridFSBucket.openUploadStream(filename, {
      metadata: {
        originalName: originalName,
        mimetype: mimetype,
        uploadDate: new Date(),
      },
    });

    uploadStream.end(fileBuffer);

    uploadStream.on("finish", () => {
      resolve(uploadStream.id);
    });

    uploadStream.on("error", (error) => {
      reject(error);
    });
  });
};

// Helper function to get file from GridFS
const getFileFromGridFS = (fileId) => {
  return new Promise((resolve, reject) => {
    const downloadStream = gridFSBucket.openDownloadStream(fileId);
    const chunks = [];

    downloadStream.on("data", (chunk) => {
      chunks.push(chunk);
    });

    downloadStream.on("end", () => {
      resolve(Buffer.concat(chunks));
    });

    downloadStream.on("error", (error) => {
      reject(error);
    });
  });
};

// JWT middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "your-secret-key",
    (err, user) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or expired token" });
      }
      req.user = user;
      next();
    }
  );
};

// Customer Authentication Routes
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const db = mongoClient.db("financeai");
    const customersCollection = db.collection("customer");

    const customer = await customersCollection.findOne({
      email: email.toLowerCase(),
    });

    if (!customer) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, customer.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        _id: customer._id,
        userId: customer._id,
        id: customer._id,
        customerId: customer.id,
        rayiCustomerId: customer.rayi_customer_id,
        email: customer.email,
        name: customer.name,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: customer._id,
        userId: customer._id,
        id: customer._id,
        customerId: customer.id,
        rayiCustomerId: customer.rayi_customer_id,
        name: customer.name,
        email: customer.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error during login" });
  }
});

async function getUserData(customerId) {
  try {
    const db = mongoClient.db("financeai");

    console.log(
      "Fetching data for customerId:",
      customerId,
      "Type:",
      typeof customerId
    );

    const numericCustomerId = parseInt(customerId);
    console.log("Converted to numeric customerId:", numericCustomerId);

    if (isNaN(numericCustomerId)) {
      console.error(
        "Invalid customerId - cannot convert to number:",
        customerId
      );
      throw new Error("Invalid customer ID");
    }

    const customerExists = await db
      .collection("customer")
      .findOne({ id: numericCustomerId });
    console.log(
      "Customer verification:",
      customerExists
        ? `Found customer: ${customerExists.name}`
        : "Customer not found"
    );

    const allOrders = await db.collection("order").find({}).toArray();
    console.log(
      "All orders in database:",
      allOrders.map((o) => ({
        id: o.id,
        customer_id: o.customer_id,
        amount: o.amount,
      }))
    );

    const testOrderQuery = await db
      .collection("order")
      .find({ customer_id: numericCustomerId })
      .toArray();
    console.log(
      "Direct order query result for customer_id",
      numericCustomerId,
      ":",
      testOrderQuery
    );

    const [
      customer,
      customerDetail,
      folios,
      performanceSummary,
      investmentPerformance,
      investmentReturns,
      orders,
    ] = await Promise.all([
      db
        .collection("customer")
        .findOne({ id: numericCustomerId })
        .catch((err) => {
          console.error("Error fetching customer:", err);
          return null;
        }),
      db
        .collection("customer_detail")
        .findOne({ customer_id: numericCustomerId })
        .catch((err) => {
          console.error("Error fetching customer detail:", err);
          return null;
        }),
      db
        .collection("customer_folio")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching folios:", err);
          return [];
        }),
      db
        .collection("customer_investment_perf_summary")
        .findOne({ customer_id: numericCustomerId })
        .catch((err) => {
          console.error("Error fetching investment summary:", err);
          return null;
        }),
      db
        .collection("customer_investment_performance")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching investment performance:", err);
          return [];
        }),
      db
        .collection("customer_investment_returns")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching investment returns:", err);
          return [];
        }),
      db
        .collection("order")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching orders:", err);
          return [];
        }),
    ]);

    console.log("Raw query results:");
    console.log(
      "- Customer found:",
      !!customer,
      customer ? `(ID: ${customer.id}, Name: ${customer.name})` : ""
    );
    console.log("- Orders query result:", orders);
    console.log("- Orders count:", orders?.length || 0);
    console.log(
      "- Orders details:",
      orders?.map((o) => ({
        id: o.id,
        customer_id: o.customer_id,
        amount: o.amount,
        payment_status: o.payment_status,
      }))
    );

    let orderDetails = [];
    if (orders && orders.length > 0) {
      console.log(
        "Fetching order details for order IDs:",
        orders.map((o) => o.id)
      );
      orderDetails = await db
        .collection("order_detail")
        .find({
          order_id: { $in: orders.map((o) => o.id) },
        })
        .toArray()
        .catch((err) => {
          console.error("Error fetching order details:", err);
          return [];
        });
      console.log("Order details fetched:", orderDetails.length);
    }

    const mfIds = [
      ...new Set([
        ...(folios || []).map((f) => f?.mf_id),
        ...(investmentReturns || []).map((r) => r?.mf_id),
      ]),
    ].filter((id) => id);

    let mutualFunds = [];
    if (mfIds.length > 0) {
      mutualFunds = await db
        .collection("mutual_fund")
        .find({
          $or: [{ id: { $in: mfIds } }, { scheme_code: { $in: mfIds } }],
        })
        .toArray()
        .catch((err) => {
          console.error("Error fetching mutual funds:", err);
          return [];
        });
    }

    console.log("Final data summary:", {
      customerFound: !!customer,
      customerName: customer?.name,
      ordersCount: orders?.length || 0,
      foliosCount: folios?.length || 0,
      orderDetailsCount: orderDetails?.length || 0,
      ordersData: orders,
    });

    return {
      customer: customer
        ? {
            ...customer,
            email: customer.email || "unknown@email.com",
          }
        : {
            name: "Unknown",
            id: "Unknown",
            rayi_customer_id: "Unknown",
            email: "unknown@email.com",
          },
      customerDetail: customerDetail || null,
      folios: folios || [],
      investments: null,
      performanceSummary: performanceSummary || null,
      investmentPerformance: investmentPerformance || [],
      investmentReturns: investmentReturns || [],
      orders: orders || [],
      orderDetails: orderDetails || [],
      mutualFunds: mutualFunds || [],
    };
  } catch (error) {
    console.error("Error fetching user data:", error);
    return {
      customer: { name: "Unknown", id: "Unknown", rayi_customer_id: "Unknown" },
      customerDetail: null,
      folios: [],
      investments: null,
      performanceSummary: null,
      investmentPerformance: [],
      investmentReturns: [],
      orders: [],
      orderDetails: [],
      mutualFunds: [],
    };
  }
}

// Function to map partial entity names to full names
const entityMapping = {
  sbi: "State Bank of India",
  apple: "Apple Inc.",
  reliance: "Reliance Industries",
  hdfc: "HDFC Bank",
  icici: "ICICI Bank",
  mf: "Mutual Fund",
  sip: "Systematic Investment Plan",
  etf: "Exchange Traded Fund",
};

// Function to correct typos and interpret incomplete sentences
function preprocessQuery(message) {
  let processedMessage = message.toLowerCase().trim();

  // Replace abbreviations and common typos
  Object.keys(entityMapping).forEach((key) => {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    processedMessage = processedMessage.replace(regex, entityMapping[key]);
  });

  // Handle common typos using string similarity
  const financeTerms = [
    "portfolio",
    "investment",
    "mutual fund",
    "sip",
    "stock",
    "stocks",
    "returns",
    "performance",
    "folio",
    "order",
    "orders",
    "balance",
    "market",
    "etf",
    "bonds",
    "equity",
    "debt",
    "tax",
    "financial planning",
    "risk",
    "strategy",
    "dividend",
    "growth",
    "sector",
    "economy",
  ];

  processedMessage = processedMessage
    .split(" ")
    .map((word) => {
      if (word.length < 3) return word;
      const matches = stringSimilarity.findBestMatch(word, financeTerms);
      if (matches.bestMatch.rating > 0.7) {
        return matches.bestMatch.target;
      }
      return word;
    })
    .join(" ");

  // Complete partial sentences
  if (!processedMessage.match(/[.!?]$/)) {
    if (
      processedMessage.includes("portfolio") ||
      processedMessage.includes("investment")
    ) {
      processedMessage += " details";
    } else if (
      processedMessage.includes("stock") ||
      processedMessage.includes("market")
    ) {
      processedMessage += " performance";
    }
  }

  return processedMessage;
}

// Function to strip hashtags from AI response
function stripHashtags(response) {
  return response.replace(/#[^\s]+/g, "");
}

// Function to classify the query with conversation context
async function classifyQueryWithAI(message, conversationHistory = []) {
  try {
    const contextInfo =
      conversationHistory.length > 0
        ? `\n\nCONVERSATION CONTEXT:\nPrevious messages: ${conversationHistory
            .slice(-3)
            .map((msg) => `${msg.role}: ${msg.content}`)
            .join("\n")}`
        : "";

    const classificationPrompt = `You are a query classifier for a financial advisor AI assistant. 

Your task is to classify the following user query into exactly ONE of these categories:

1. "GREETING" - Simple greetings like "hi", "hello", "hey", "thanks", "thank you"

2. "USER-SPECIFIC-FINANCIAL" - Questions about the user's EXISTING personal financial data like "my portfolio", "my investments", "my orders", "my SIP", "my returns", "my balance", "show my portfolio", "check my orders", "view my holdings"
   - IMPORTANT: This is ONLY for VIEWING/CHECKING existing data, NOT creating new investments
   - EXCLUDE ALL investment creation requests - these go to INVESTMENT_RELATED

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

4. "TICKET_RELATED" - Queries related to raising tickets, support requests, or customer service issues including:
   - "I want to raise a ticket"
   - "I need help with..."
   - "I have a problem with..."
   - "I want to complain about..."
   - "I need support for..."
   - Any expressions of issues, problems, complaints, or need for assistance

5. "INVESTMENT_RELATED" - Queries specifically about MAKING/CREATING/STARTING new investments including:
   - "I want to make an investment" ← ALWAYS THIS CATEGORY
   - "I want to invest money" ← ALWAYS THIS CATEGORY
   - "Start an investment" ← ALWAYS THIS CATEGORY
   - "Create a SIP" ← ALWAYS THIS CATEGORY
   - "Make a lumpsum investment" ← ALWAYS THIS CATEGORY
   - "I want to start investing" ← ALWAYS THIS CATEGORY
   - "Help me invest" ← ALWAYS THIS CATEGORY
   - "Set up an investment" ← ALWAYS THIS CATEGORY
   - "Begin investing" ← ALWAYS THIS CATEGORY
   - "Start SIP" ← ALWAYS THIS CATEGORY
   - "Make investment" ← ALWAYS THIS CATEGORY
   - Any phrase with "invest", "investment", "investing" + action words like "make", "start", "create", "begin", "want to", "need to"
   - CRITICAL: ANY request to CREATE, MAKE, START, or BEGIN an investment MUST be INVESTMENT_RELATED
   - EXCLUDE: Analysis questions like "what if I invested", "my investments", "investment performance", "how much would I have", "returns calculation"

6. "INVESTMENT_WORKFLOW_RESPONSE" - Responses given during active investment workflow including:
   - Investment type choices: "SIP", "Lumpsum", "systematic investment plan"
   - Goal responses: "Retirement", "Education", "Wealth creation", "Emergency fund", "Other"
   - Amount responses: "₹50,000", "5 lakhs", "10000", monetary values
   - Timeline responses: "15 years", "5 years", "10 years", time periods
   - Fund selection responses: "Recommend for me", "I'll choose", fund names
   - Date responses: "5th", "15", "25", dates for SIP
   - Confirmation responses during investment workflow: "Yes proceed", "Accept suggested", "Enter custom"

7. "NON-FINANCIAL" - Questions completely unrelated to finance, investments, or money

8. "AFFIRMATIVE_RESPONSE" - Simple responses like "yes", "ok", "sure", "please", "yes please" that are answering a previous question (BUT NOT when in investment workflow)

CRITICAL CLASSIFICATION RULES:
- "I want to make an investment" = INVESTMENT_RELATED (NOT USER-SPECIFIC-FINANCIAL)
- "I want to invest" = INVESTMENT_RELATED (NOT USER-SPECIFIC-FINANCIAL) 
- "Help me invest" = INVESTMENT_RELATED (NOT USER-SPECIFIC-FINANCIAL)
- "Start investing" = INVESTMENT_RELATED (NOT USER-SPECIFIC-FINANCIAL)
- "Show my portfolio" = USER-SPECIFIC-FINANCIAL
- "My investments" = USER-SPECIFIC-FINANCIAL
- "Check my orders" = USER-SPECIFIC-FINANCIAL

User query: "${message}"${contextInfo}

Respond with ONLY the category name. Do not include any explanation.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: classificationPrompt }],
      max_tokens: 10000,
      temperature: 0.1,
    });

    const classification = completion.choices[0].message.content
      .trim()
      .toUpperCase();

    const validCategories = [
      "GREETING",
      "USER-SPECIFIC-FINANCIAL",
      "GENERAL-FINANCIAL",
      "TICKET_RELATED",
      "INVESTMENT_RELATED",
      "INVESTMENT_WORKFLOW_RESPONSE",
      "NON-FINANCIAL",
      "AFFIRMATIVE_RESPONSE",
    ];
    if (!validCategories.includes(classification)) {
      console.warn(
        `Invalid classification received: ${classification}. Defaulting to GENERAL-FINANCIAL`
      );
      return "GENERAL-FINANCIAL";
    }

    console.log(`AI Classification: "${message}" -> ${classification}`);
    return classification;
  } catch (error) {
    console.error("Error in AI classification:", error);
    return fallbackClassifyQuery(message);
  }
}

// Fallback classification function
function fallbackClassifyQuery(message) {
  const lowerMessage = message.toLowerCase().trim();

  const greetings = ["hi", "hello", "hey", "thank", "thanks", "thx"];
  const isGreeting = greetings.some(
    (g) => lowerMessage.startsWith(g) || lowerMessage === g
  );

  if (isGreeting) {
    return "GREETING";
  }

  const financialKeywords = [
    "invest",
    "investment",
    "portfolio",
    "fund",
    "stock",
    "share",
    "money",
    "rupee",
    "lakh",
    "crore",
    "market",
    "financial",
    "finance",
    "mutual",
    "sip",
    "return",
    "my portfolio",
    "my investment",
    "my order",
  ];

  const hasFinancialKeyword = financialKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasUserSpecific = lowerMessage.includes("my ");

  if (!hasFinancialKeyword) {
    return "NON-FINANCIAL";
  }

  return hasUserSpecific ? "USER-SPECIFIC-FINANCIAL" : "GENERAL-FINANCIAL";
}

// =============================================================================
// INVESTMENT PRODUCT ROUTES
// =============================================================================

app.get("/api/investment/products", authenticateToken, async (req, res) => {
  try {
    const { category = "all", search = "" } = req.query;

    const sampleMutualFunds = [
      {
        id: "MF001",
        name: "SBI Bluechip Fund",
        category: "Large Cap",
        nav: 85.67,
        expense_ratio: 0.65,
        returns_1y: 15.2,
        returns_3y: 12.8,
        returns_5y: 14.5,
        min_investment: 500,
        risk_level: "Moderate",
        fund_manager: "SBI Mutual Fund",
        aum: "₹45,000 Cr",
      },
      {
        id: "MF002",
        name: "HDFC Top 100 Fund",
        category: "Large Cap",
        nav: 920.45,
        expense_ratio: 0.7,
        returns_1y: 16.8,
        returns_3y: 13.2,
        returns_5y: 15.1,
        min_investment: 500,
        risk_level: "Moderate",
        fund_manager: "HDFC Asset Management",
        aum: "₹28,500 Cr",
      },
      {
        id: "MF003",
        name: "Axis Midcap Fund",
        category: "Mid Cap",
        nav: 67.89,
        expense_ratio: 0.85,
        returns_1y: 22.5,
        returns_3y: 18.7,
        returns_5y: 19.2,
        min_investment: 1000,
        risk_level: "High",
        fund_manager: "Axis Asset Management",
        aum: "₹12,800 Cr",
      },
      {
        id: "MF004",
        name: "ICICI Prudential Balanced Advantage Fund",
        category: "Hybrid",
        nav: 45.23,
        expense_ratio: 0.75,
        returns_1y: 11.8,
        returns_3y: 10.5,
        returns_5y: 12.3,
        min_investment: 500,
        risk_level: "Moderate",
        fund_manager: "ICICI Prudential",
        aum: "₹35,200 Cr",
      },
      {
        id: "MF005",
        name: "Kotak Small Cap Fund",
        category: "Small Cap",
        nav: 158.76,
        expense_ratio: 0.95,
        returns_1y: 28.3,
        returns_3y: 24.1,
        returns_5y: 22.8,
        min_investment: 1000,
        risk_level: "Very High",
        fund_manager: "Kotak Mahindra Asset Management",
        aum: "₹8,900 Cr",
      },
    ];

    let filteredFunds = sampleMutualFunds;

    if (category !== "all") {
      filteredFunds = filteredFunds.filter((fund) =>
        fund.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    if (search) {
      filteredFunds = filteredFunds.filter(
        (fund) =>
          fund.name.toLowerCase().includes(search.toLowerCase()) ||
          fund.category.toLowerCase().includes(search.toLowerCase())
      );
    }

    res.json({
      success: true,
      products: filteredFunds,
      total: filteredFunds.length,
    });
  } catch (error) {
    console.error("Error fetching investment products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch investment products",
    });
  }
});

app.get(
  "/api/investment/products/:productId",
  authenticateToken,
  async (req, res) => {
    try {
      const { productId } = req.params;

      const productDetails = {
        id: productId,
        name: "SBI Bluechip Fund",
        category: "Large Cap",
        nav: 85.67,
        nav_history: [
          { date: "2024-01-01", nav: 78.45 },
          { date: "2024-06-01", nav: 82.12 },
          { date: "2024-12-01", nav: 85.67 },
        ],
        expense_ratio: 0.65,
        returns: {
          "1y": 15.2,
          "3y": 12.8,
          "5y": 14.5,
        },
        portfolio_composition: [
          { sector: "Banking & Financial Services", percentage: 25.6 },
          { sector: "Information Technology", percentage: 18.3 },
          { sector: "Energy", percentage: 12.8 },
          { sector: "Consumer Goods", percentage: 11.2 },
          { sector: "Healthcare", percentage: 8.7 },
        ],
        top_holdings: [
          { company: "Reliance Industries", percentage: 8.2 },
          { company: "TCS", percentage: 6.8 },
          { company: "HDFC Bank", percentage: 5.9 },
          { company: "Infosys", percentage: 4.7 },
          { company: "ICICI Bank", percentage: 4.3 },
        ],
        min_investment: 500,
        risk_level: "Moderate",
        fund_manager: "SBI Mutual Fund",
        aum: "₹45,000 Cr",
        inception_date: "2010-05-15",
        benchmark: "S&P BSE 100",
      };

      res.json({
        success: true,
        product: productDetails,
      });
    } catch (error) {
      console.error("Error fetching product details:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch product details",
      });
    }
  }
);

// =============================================================================
// INVESTMENT ORDER ROUTES
// =============================================================================

app.post("/api/investment/order", authenticateToken, async (req, res) => {
  try {
    const {
      productId,
      investmentType, // 'SIP' or 'LUMPSUM'
      amount,
      frequency, // For SIP: 'MONTHLY', 'QUARTERLY', 'YEARLY'
      sipDate, // For SIP: date of month (1-28)
      duration, // For SIP: duration in months
    } = req.body;

    const customerId = req.user.customerId || req.user.id;

    if (!productId || !investmentType || !amount) {
      return res.status(400).json({
        success: false,
        message: "Product ID, investment type, and amount are required",
      });
    }

    if (investmentType === "SIP" && (!frequency || !sipDate)) {
      return res.status(400).json({
        success: false,
        message: "SIP frequency and date are required for SIP investments",
      });
    }

    if (amount < 500) {
      return res.status(400).json({
        success: false,
        message: "Minimum investment amount is ₹500",
      });
    }

    const db = mongoClient.db("financeai");

    const lastOrder = await db
      .collection("investment_orders")
      .findOne({}, { sort: { order_id: -1 } });
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
      status: "PENDING",
      payment_status: "PENDING",
      created_at: new Date(),
      updated_at: new Date(),
      payment_gateway_id: null,
      transaction_id: null,
    };

    const result = await db.collection("investment_orders").insertOne(order);

    const paymentSession = {
      order_id: newOrderId,
      amount: amount,
      currency: "INR",
      payment_id: `PAY_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    };

    res.json({
      success: true,
      order: {
        ...order,
        _id: result.insertedId,
      },
      payment_session: paymentSession,
      message: "Order created successfully. Proceed to payment.",
    });
  } catch (error) {
    console.error("Error creating investment order:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create investment order",
    });
  }
});

// =============================================================================
// PAYMENT GATEWAY SIMULATION
// =============================================================================

app.post("/api/payment/generate-otp", authenticateToken, async (req, res) => {
  try {
    const { payment_id, mobile_number } = req.body;

    const otp = Math.floor(100000 + Math.random() * 900000);

    const db = mongoClient.db("financeai");
    await db.collection("payment_otps").insertOne({
      payment_id,
      mobile_number,
      otp: otp.toString(),
      created_at: new Date(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      verified: false,
    });

    console.log(`OTP for payment ${payment_id}: ${otp}`);

    res.json({
      success: true,
      message: "OTP sent successfully",
      demo_otp: otp,
    });
  } catch (error) {
    console.error("Error generating OTP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate OTP",
    });
  }
});

app.post("/api/payment/verify-otp", authenticateToken, async (req, res) => {
  try {
    const { payment_id, otp, order_id, payment_mandate_preference } = req.body;

    const db = mongoClient.db("financeai");

    const otpRecord = await db.collection("payment_otps").findOne({
      payment_id,
      otp,
      verified: false,
      expires_at: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    await db
      .collection("payment_otps")
      .updateOne(
        { _id: otpRecord._id },
        { $set: { verified: true, verified_at: new Date() } }
      );

    const paymentSuccess = Math.random() > 0.1; // 90% success rate

    if (paymentSuccess) {
      await db.collection("investment_orders").updateOne(
        { order_id: parseInt(order_id) },
        {
          $set: {
            status: "CONFIRMED",
            payment_status: "COMPLETED",
            transaction_id: `TXN_${Date.now()}`,
            payment_mandate: payment_mandate_preference || "existing",
            updated_at: new Date(),
          },
        }
      );

      const order = await db
        .collection("investment_orders")
        .findOne({ order_id: parseInt(order_id) });

      if (order && order.investment_type === "SIP") {
        await db.collection("sip_investments").insertOne({
          customer_id: order.customer_id,
          product_id: order.product_id,
          order_id: order.order_id,
          amount: order.amount,
          frequency: order.frequency,
          sip_date: order.sip_date,
          duration: order.duration,
          status: "ACTIVE",
          next_deduction: calculateNextSIPDate(order.sip_date, order.frequency),
          payment_mandate: payment_mandate_preference || "existing",
          created_at: new Date(),
          updated_at: new Date(),
        });
      }

      // Add investment completion record
      await db.collection("investment_completions").insertOne({
        customer_id: order.customer_id,
        order_id: order.order_id,
        investment_type: order.investment_type,
        amount: order.amount,
        product_id: order.product_id,
        payment_mandate: payment_mandate_preference || "existing",
        transaction_id: `TXN_${Date.now()}`,
        completion_status: "SUCCESS",
        otp_verified: true,
        completed_at: new Date(),
        created_at: new Date(),
      });

      const investmentTypeText = order.investment_type === "SIP" ? "SIP" : "Lumpsum investment";
      const successMessage = order.investment_type === "SIP" 
        ? `🎉 Congratulations! Your SIP of ₹${order.amount.toLocaleString()}/month has been successfully set up and will start from the ${order.sip_date}th of each month. You're all set to grow your wealth systematically!`
        : `🎉 Investment Successful! Your lumpsum investment of ₹${order.amount.toLocaleString()} has been confirmed. You'll receive a confirmation email shortly.`;

      res.json({
        success: true,
        message: successMessage,
        transaction_id: `TXN_${Date.now()}`,
        order_status: "CONFIRMED",
        investment_details: {
          type: order.investment_type,
          amount: order.amount,
          product_id: order.product_id,
          payment_mandate: payment_mandate_preference || "existing",
          sip_date: order.sip_date || null,
          frequency: order.frequency || null,
        },
      });
    } else {
      await db.collection("investment_orders").updateOne(
        { order_id: parseInt(order_id) },
        {
          $set: {
            status: "FAILED",
            payment_status: "FAILED",
            updated_at: new Date(),
          },
        }
      );

      res.status(400).json({
        success: false,
        message: "Payment failed. Please try again.",
        order_status: "FAILED",
      });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
    });
  }
});

// New endpoint to handle investment completion after payment mandate selection
app.post("/api/investment/complete-with-mandate", authenticateToken, async (req, res) => {
  try {
    const { order_id, payment_mandate_preference, customer_id } = req.body;
    const authenticatedCustomerId = req.user.customerId || req.user.id;
    
    // Use customer_id from request body if provided and valid, otherwise use authenticated user's ID
    const finalCustomerId = customer_id || authenticatedCustomerId;

    const db = mongoClient.db("financeai");

    // If no order_id provided, create a sample investment completion for demo
    let order;
    if (!order_id) {
      // Create a demo investment record
      const demoOrderId = Math.floor(100000 + Math.random() * 900000);
      
      order = {
        order_id: demoOrderId,
        customer_id: parseInt(finalCustomerId),
        investment_type: "SIP", // Default to SIP for demo
        amount: 3000, // Default SIP amount
        product_id: "MF001",
        sip_date: 5, // 5th of every month
        frequency: "MONTHLY",
        created_at: new Date(),
      };
      
      // Save the demo order
      await db.collection("investment_orders").insertOne({
        ...order,
        status: "CONFIRMED",
        payment_status: "COMPLETED",
        payment_mandate: payment_mandate_preference || "existing",
        updated_at: new Date(),
      });
    } else {
      // Get the existing order details
      order = await db
        .collection("investment_orders")
        .findOne({ order_id: parseInt(order_id) });

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found",
        });
      }

      // Verify the order belongs to the current user
      if (order.customer_id !== parseInt(finalCustomerId)) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized access to order",
        });
      }

      // Update existing order with payment mandate preference
      await db.collection("investment_orders").updateOne(
        { order_id: parseInt(order_id) },
        {
          $set: {
            status: "COMPLETED",
            payment_mandate: payment_mandate_preference || "existing",
            completed_at: new Date(),
            updated_at: new Date(),
          },
        }
      );
    }

    // Add investment completion record
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    await db.collection("investment_completions").insertOne({
      customer_id: order.customer_id,
      order_id: order.order_id,
      investment_type: order.investment_type,
      amount: order.amount,
      product_id: order.product_id,
      payment_mandate: payment_mandate_preference || "existing",
      transaction_id: transactionId,
      completion_status: "SUCCESS",
      otp_verified: true,
      completed_at: new Date(),
      created_at: new Date(),
    });

    // Create detailed success message based on investment type
    const investmentTypeText = order.investment_type === "SIP" ? "SIP" : "Lumpsum investment";
    const mandateText = payment_mandate_preference === "existing" ? "existing payment mandate" : "new payment mandate";
    
    let successMessage;
    if (order.investment_type === "SIP") {
      successMessage = `🎉 **Congratulations! Your SIP Investment is Complete!**

✅ **Investment Details:**
• **Type:** SIP (Systematic Investment Plan)
• **Monthly Amount:** ₹${order.amount.toLocaleString()}
• **SIP Date:** ${order.sip_date}th of every month
• **Payment Method:** ${mandateText}
• **Transaction ID:** ${transactionId}
• **Status:** Active

🚀 **What's Next:**
• Your first SIP installment will be deducted on the ${order.sip_date}th of next month
• You'll receive SMS confirmations for each deduction
• You can track your investments in the Portfolio section
• Download the investment certificate from your dashboard

**You're all set to grow your wealth systematically!** 📈

Would you like to start another investment or check your portfolio?`;
    } else {
      successMessage = `🎉 **Investment Successful!**

✅ **Investment Details:**
• **Type:** Lumpsum Investment
• **Amount:** ₹${order.amount.toLocaleString()}
• **Payment Method:** ${mandateText}
• **Transaction ID:** ${transactionId}
• **Status:** Completed

📧 **What's Next:**
• You'll receive a confirmation email shortly
• Units will be allocated within 1-2 business days
• Track your investment performance in Portfolio
• Download your investment certificate

**Your investment journey begins now!** 🚀`;
    }

    res.json({
      success: true,
      message: successMessage,
      transaction_id: transactionId,
      order_status: "COMPLETED",
      investment_details: {
        order_id: order.order_id,
        type: order.investment_type,
        amount: order.amount,
        product_id: order.product_id,
        payment_mandate: payment_mandate_preference || "existing",
        sip_date: order.sip_date || null,
        frequency: order.frequency || null,
        transaction_id: transactionId,
        completed_at: new Date().toISOString(),
      },
      next_steps: {
        portfolio_url: "/portfolio",
        new_investment_url: "/invest",
        support_url: "/support",
      },
    });
  } catch (error) {
    console.error("Error completing investment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete investment",
      error: error.message,
    });
  }
});

// Keep the original endpoint for backward compatibility
app.post("/api/investment/complete", authenticateToken, async (req, res) => {
  try {
    const { order_id, payment_mandate_preference } = req.body;
    const customerId = req.user.customerId || req.user.id;

    const db = mongoClient.db("financeai");

    // Get the order details
    const order = await db
      .collection("investment_orders")
      .findOne({ order_id: parseInt(order_id) });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Verify the order belongs to the current user
    if (order.customer_id !== parseInt(customerId)) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to order",
      });
    }

    // Update order with payment mandate preference
    await db.collection("investment_orders").updateOne(
      { order_id: parseInt(order_id) },
      {
        $set: {
          status: "COMPLETED",
          payment_mandate: payment_mandate_preference || "existing",
          completed_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    // Add investment completion record
    await db.collection("investment_completions").insertOne({
      customer_id: order.customer_id,
      order_id: order.order_id,
      investment_type: order.investment_type,
      amount: order.amount,
      product_id: order.product_id,
      payment_mandate: payment_mandate_preference || "existing",
      transaction_id: `TXN_${Date.now()}`,
      completion_status: "SUCCESS",
      otp_verified: true,
      completed_at: new Date(),
      created_at: new Date(),
    });

    const investmentTypeText = order.investment_type === "SIP" ? "SIP" : "Lumpsum investment";
    const successMessage = order.investment_type === "SIP" 
      ? `🎉 Congratulations! Your SIP of ₹${order.amount.toLocaleString()}/month has been successfully set up and will start from the ${order.sip_date}th of each month. You're all set to grow your wealth systematically!`
      : `🎉 Investment Successful! Your lumpsum investment of ₹${order.amount.toLocaleString()} has been confirmed. You'll receive a confirmation email shortly.`;

    res.json({
      success: true,
      message: successMessage,
      transaction_id: `TXN_${Date.now()}`,
      order_status: "COMPLETED",
      investment_details: {
        type: order.investment_type,
        amount: order.amount,
        product_id: order.product_id,
        payment_mandate: payment_mandate_preference || "existing",
        sip_date: order.sip_date || null,
        frequency: order.frequency || null,
      },
    });
  } catch (error) {
    console.error("Error completing investment:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete investment",
    });
  }
});

// =============================================================================
// SIP MANAGEMENT ROUTES
// =============================================================================

app.get("/api/sip/investments", authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db("financeai");

    const sipInvestments = await db
      .collection("sip_investments")
      .find({
        customer_id: parseInt(customerId),
      })
      .toArray();

    const enrichedSIPs = await Promise.all(
      sipInvestments.map(async (sip) => {
        const productDetails = {
          name: "Sample Fund Name",
          category: "Large Cap",
          nav: 85.67,
        };

        return {
          ...sip,
          product: productDetails,
          total_invested: sip.amount * calculateCompletedInstallments(sip),
          next_deduction_formatted: sip.next_deduction.toDateString(),
        };
      })
    );

    res.json({
      success: true,
      sip_investments: enrichedSIPs,
    });
  } catch (error) {
    console.error("Error fetching SIP investments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch SIP investments",
    });
  }
});

app.post("/api/sip/pause", authenticateToken, async (req, res) => {
  try {
    const { sip_id } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db("financeai");

    const result = await db.collection("sip_investments").updateOne(
      {
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: "ACTIVE",
      },
      {
        $set: {
          status: "PAUSED",
          paused_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "SIP not found or already paused",
      });
    }

    res.json({
      success: true,
      message: "SIP paused successfully",
    });
  } catch (error) {
    console.error("Error pausing SIP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pause SIP",
    });
  }
});

app.post("/api/sip/resume", authenticateToken, async (req, res) => {
  try {
    const { sip_id } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db("financeai");

    const result = await db.collection("sip_investments").updateOne(
      {
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: "PAUSED",
      },
      {
        $set: {
          status: "ACTIVE",
          resumed_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "SIP not found or not paused",
      });
    }

    res.json({
      success: true,
      message: "SIP resumed successfully",
    });
  } catch (error) {
    console.error("Error resuming SIP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resume SIP",
    });
  }
});

app.post("/api/sip/cancel", authenticateToken, async (req, res) => {
  try {
    const { sip_id } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db("financeai");

    const result = await db.collection("sip_investments").updateOne(
      {
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: { $in: ["ACTIVE", "PAUSED"] },
      },
      {
        $set: {
          status: "CANCELLED",
          cancelled_at: new Date(),
          updated_at: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "SIP not found or already cancelled",
      });
    }

    res.json({
      success: true,
      message: "SIP cancelled successfully",
    });
  } catch (error) {
    console.error("Error cancelling SIP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel SIP",
    });
  }
});

app.post("/api/sip/modify", authenticateToken, async (req, res) => {
  try {
    const { sip_id, new_amount, new_date } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db("financeai");

    const updateFields = {
      updated_at: new Date(),
    };

    if (new_amount) {
      if (new_amount < 500) {
        return res.status(400).json({
          success: false,
          message: "Minimum SIP amount is ₹500",
        });
      }
      updateFields.amount = parseFloat(new_amount);
    }

    if (new_date) {
      if (new_date < 1 || new_date > 28) {
        return res.status(400).json({
          success: false,
          message: "SIP date must be between 1 and 28",
        });
      }
      updateFields.sip_date = parseInt(new_date);
    }

    const result = await db.collection("sip_investments").updateOne(
      {
        _id: new ObjectId(sip_id),
        customer_id: parseInt(customerId),
        status: "ACTIVE",
      },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "SIP not found or not active",
      });
    }

    res.json({
      success: true,
      message: "SIP modified successfully",
    });
  } catch (error) {
    console.error("Error modifying SIP:", error);
    res.status(500).json({
      success: false,
      message: "Failed to modify SIP",
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
    case "MONTHLY":
      nextDate.setDate(sipDate);
      if (nextDate <= now) {
        nextDate.setMonth(nextDate.getMonth() + 1);
      }
      break;
    case "QUARTERLY":
      nextDate.setDate(sipDate);
      if (nextDate <= now) {
        nextDate.setMonth(nextDate.getMonth() + 3);
      }
      break;
    case "YEARLY":
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
      case "MONTHLY":
        tempDate.setMonth(tempDate.getMonth() + 1);
        break;
      case "QUARTERLY":
        tempDate.setMonth(tempDate.getMonth() + 3);
        break;
      case "YEARLY":
        tempDate.setFullYear(tempDate.getFullYear() + 1);
        break;
    }
  }

  return Math.max(0, installments - 1);
}

// =============================================================================
// OPENAI-POWERED FUND RECOMMENDATION FUNCTION
// =============================================================================

/**
 * GENERATE FUND RECOMMENDATION USING OPENAI:
 * This function uses OpenAI API to generate personalized mutual fund recommendations
 * based on user's investment details, goals, and profile
 */
async function generateFundRecommendation(investmentData) {
  try {
    console.log('Generating AI fund recommendation with data:', investmentData);
    
    const { investmentType, goal, amount, timeline, customerId } = investmentData;
    
    // Get additional user context if customerId is provided
    let userContext = "";
    if (customerId) {
      try {
        const userData = await getUserData(customerId);
        if (userData.customer) {
          userContext = `\nUser Profile:\n- Customer ID: ${userData.customer.id}\n- Total existing orders: ${userData.orders?.length || 0}\n- Investment experience level: ${userData.orders?.length > 0 ? 'Experienced' : 'Beginner'}`;
        }
      } catch (error) {
        console.log('Could not fetch user context:', error.message);
      }
    }
    
    const fundRecommendationPrompt = `You are a professional mutual fund advisor. Provide a personalized fund recommendation based on the following investment details:\n\n**Investment Details:**\n- Investment Type: ${investmentType}\n- Investment Goal: ${goal}\n- Investment Amount: ${amount}${investmentType === 'SIP' ? '/month' : ''}\n- Time Horizon: ${timeline}${userContext}\n\n**Your Task:**\nRecommend ONE specific mutual fund that best matches these requirements. Your recommendation should include:\n\n1. **Fund Name** (use real, well-known Indian mutual funds)\n2. **Fund House** (AMC name)\n3. **Category** (Large Cap, Mid Cap, Small Cap, Flexi Cap, Hybrid, etc.)\n4. **Risk Level** (Conservative, Moderate, Aggressive)\n5. **Why this fund fits** (2-3 specific reasons)\n6. **Key highlights** (expense ratio, fund manager, AUM, returns)\n7. **Suitability statement** (why it matches the goal and timeline)\n\n**Guidelines:**\n- For retirement goals with 15+ years: Consider equity funds (Large Cap/Flexi Cap)\n- For short-term goals (2-5 years): Consider hybrid/debt funds\n- For wealth creation: Flexi Cap or Multi Cap funds\n- For conservative investors: Large Cap or Hybrid funds\n- For aggressive investors: Mid Cap or Small Cap funds\n- Consider SIP-friendly funds for systematic investments\n\n**Response Format:**\nBased on your ${goal.toLowerCase()} goal with a ${timeline} investment horizon, I recommend:\n\n**[Fund Name] (Direct – Growth)**\n• **Fund House:** [AMC Name]\n• **Category:** [Category]\n• **Risk Level:** [Risk Level]\n• **Current NAV:** ₹[NAV] (approximate)\n• **Expense Ratio:** [X]%\n• **Fund Manager:** [Manager Name]\n• **AUM:** ₹[Amount] Cr (approximate)\n• **3Y Returns:** [X]% (approximate)\n• **5Y Returns:** [X]% (approximate)\n\n**Why this fund fits your profile:**\n1. [Specific reason 1]\n2. [Specific reason 2]\n3. [Specific reason 3]\n\n**Fund Highlights:**\n• [Key feature 1]\n• [Key feature 2]\n• [Key feature 3]\n\nThis fund aligns well with your ${timeline} investment timeline and ${goal.toLowerCase()} objective, offering [specific benefit for the user's situation].\n\n**Important:** Please provide realistic fund details based on actual Indian mutual funds. Use approximate but reasonable figures for NAV, returns, and AUM.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: fundRecommendationPrompt }],
      max_tokens: 1000,
      temperature: 0.7,
    });

    const recommendation = completion.choices[0].message.content.trim();
    
    console.log('Generated fund recommendation:', recommendation.substring(0, 200) + '...');
    
    return recommendation;
    
  } catch (error) {
    console.error('Error generating fund recommendation:', error);
    throw new Error('Failed to generate fund recommendation: ' + error.message);
  }
}

/**
 * GENERATE ALTERNATIVE FUND RECOMMENDATIONS USING OPENAI:
 * This function uses OpenAI API to generate multiple alternative fund options
 * when users want to see more choices beyond the initial recommendation
 */
async function generateAlternativeFundRecommendations(investmentData) {
  try {
    console.log('Generating AI alternative fund recommendations with data:', investmentData);
    
    const { investmentType, goal, amount, timeline, customerId } = investmentData;
    
    // Get additional user context if customerId is provided
    let userContext = "";
    if (customerId) {
      try {
        const userData = await getUserData(customerId);
        if (userData.customer) {
          userContext = `\nUser Profile:\n- Customer ID: ${userData.customer.id}\n- Total existing orders: ${userData.orders?.length || 0}\n- Investment experience level: ${userData.orders?.length > 0 ? 'Experienced' : 'Beginner'}`;
        }
      } catch (error) {
        console.log('Could not fetch user context:', error.message);
      }
    }
    
    const alternativeFundsPrompt = `You are a professional mutual fund advisor. Provide multiple alternative fund recommendations based on the following investment details:\n\n**Investment Details:**\n- Investment Type: ${investmentType}\n- Investment Goal: ${goal}\n- Investment Amount: ${amount}${investmentType === 'SIP' ? '/month' : ''}\n- Time Horizon: ${timeline}${userContext}\n\n**Your Task:**\nProvide exactly 4-5 alternative mutual fund options that match these requirements. Focus on variety across categories while ensuring all are suitable for the user's profile.\n\n**Response Format:**\nHere are additional funds to consider:\n\n1. **[Fund Name 1] (Direct – Growth)** - [Category] ([X]% returns)\n2. **[Fund Name 2] (Direct – Growth)** - [Category] ([X]% returns)\n3. **[Fund Name 3] (Direct – Growth)** - [Category] ([X]% returns)\n4. **[Fund Name 4] (Direct – Growth)** - [Category] ([X]% returns)\n5. **[Fund Name 5] (Direct – Growth)** - [Category] ([X]% returns)\n\n**Guidelines:**\n- Provide ONLY fund names and returns in the specified format\n- Use real, well-known Indian mutual funds\n- Include variety across categories (Large Cap, Mid Cap, Flexi Cap, Hybrid, etc.)\n- Show approximate but realistic annual returns for each fund\n- For ${goal.toLowerCase()} goal with ${timeline} timeline, consider:\n  - Large Cap funds for stability (12-15% returns)\n  - Mid Cap funds for growth (15-20% returns)\n  - Flexi Cap funds for balanced approach (13-17% returns)\n  - Hybrid funds for conservative approach (10-14% returns)\n  - Small Cap funds for aggressive growth (18-25% returns)\n\n**Important Rules:**\n- Keep it concise - ONLY fund name, category, and returns\n- No detailed descriptions or explanations\n- Ensure all funds are appropriate for the investment type (${investmentType})\n- Consider ${timeline} time horizon when suggesting categories\n- All returns should be approximate annual figures\n\n**Example Format:**\n1. **ICICI Prudential Bluechip Fund (Direct – Growth)** - Large Cap (13.8% returns)\n2. **Kotak Standard Multicap Fund (Direct – Growth)** - Multi Cap (15.2% returns)\n3. **DSP Tax Saver Fund (Direct – Growth)** - ELSS (12.9% returns)\n4. **Nippon India Small Cap Fund (Direct – Growth)** - Small Cap (19.5% returns)\n5. **SBI Hybrid Equity Fund (Direct – Growth)** - Hybrid (11.4% returns)`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: alternativeFundsPrompt }],
      max_tokens: 500,
      temperature: 0.7,
    });

    const alternativeOptions = completion.choices[0].message.content.trim();
    
    console.log('Generated alternative fund recommendations:', alternativeOptions.substring(0, 200) + '...');
    
    return alternativeOptions;
    
  } catch (error) {
    console.error('Error generating alternative fund recommendations:', error);
    throw new Error('Failed to generate alternative fund recommendations: ' + error.message);
  }
}

// =============================================================================
// PAYMENT METHOD MANAGEMENT API ENDPOINTS
// =============================================================================

// Get all payment methods for a customer
app.get("/api/payment-methods", authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;
    const db = mongoClient.db("financeai");

    const [upiMethods, bankMethods, cardMethods] = await Promise.all([
      db.collection("customer_upi_methods").find({ customer_id: parseInt(customerId), status: "ACTIVE" }).toArray(),
      db.collection("customer_bank_methods").find({ customer_id: parseInt(customerId), status: "ACTIVE" }).toArray(),
      db.collection("customer_card_methods").find({ customer_id: parseInt(customerId), status: "ACTIVE" }).toArray()
    ]);

    // Mask sensitive data for response
    const maskedUpiMethods = upiMethods.map(method => ({
      id: method._id,
      type: "UPI",
      upi_id: method.upi_id,
      provider: method.provider,
      is_default: method.is_default,
      created_at: method.created_at
    }));

    const maskedBankMethods = bankMethods.map(method => ({
      id: method._id,
      type: "BANK",
      bank_name: method.bank_name,
      account_number: method.account_number.replace(/.(?=.{4})/g, 'X'),
      account_type: method.account_type,
      ifsc_code: method.ifsc_code,
      is_default: method.is_default,
      created_at: method.created_at
    }));

    const maskedCardMethods = cardMethods.map(method => ({
      id: method._id,
      type: "CARD",
      bank_name: method.bank_name,
      card_number: `****-****-****-${method.card_last_four}`,
      card_type: method.card_type,
      is_default: method.is_default,
      created_at: method.created_at
    }));

    res.json({
      success: true,
      payment_methods: {
        upi: maskedUpiMethods,
        bank: maskedBankMethods,
        card: maskedCardMethods
      },
      total_methods: maskedUpiMethods.length + maskedBankMethods.length + maskedCardMethods.length
    });
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment methods"
    });
  }
});

// Add new UPI payment method
app.post("/api/payment-methods/upi", authenticateToken, async (req, res) => {
  try {
    const { upi_id, is_default = false } = req.body;
    const customerId = req.user.customerId || req.user.id;

    // Validate UPI ID format
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upi_id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid UPI ID format"
      });
    }

    const db = mongoClient.db("financeai");

    // Check if UPI ID already exists for this customer
    const existingUpi = await db.collection("customer_upi_methods").findOne({
      customer_id: parseInt(customerId),
      upi_id: upi_id,
      status: "ACTIVE"
    });

    if (existingUpi) {
      return res.status(400).json({
        success: false,
        message: "UPI ID already exists"
      });
    }

    // If setting as default, remove default from other UPI methods
    if (is_default) {
      await db.collection("customer_upi_methods").updateMany(
        { customer_id: parseInt(customerId), status: "ACTIVE" },
        { $set: { is_default: false } }
      );
    }

    // Store UPI method
    const result = await db.collection("customer_upi_methods").insertOne({
      customer_id: parseInt(customerId),
      upi_id: upi_id,
      provider: upi_id.split('@')[1],
      is_default: is_default,
      status: "ACTIVE",
      created_at: new Date(),
      updated_at: new Date()
    });

    res.json({
      success: true,
      message: "UPI payment method added successfully",
      payment_method_id: result.insertedId
    });
  } catch (error) {
    console.error("Error adding UPI method:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add UPI payment method"
    });
  }
});

// Add new bank account payment method
app.post("/api/payment-methods/bank", authenticateToken, async (req, res) => {
  try {
    const { account_number, ifsc_code, bank_name, account_type, is_default = false } = req.body;
    const customerId = req.user.customerId || req.user.id;

    // Validate required fields
    if (!account_number || !ifsc_code || !bank_name || !account_type) {
      return res.status(400).json({
        success: false,
        message: "All bank details are required"
      });
    }

    // Validate IFSC code format
    const ifscRegex = /^[A-Z]{4}[0-9]{7}$/;
    if (!ifscRegex.test(ifsc_code)) {
      return res.status(400).json({
        success: false,
        message: "Invalid IFSC code format"
      });
    }

    const db = mongoClient.db("financeai");

    // Check if account already exists for this customer
    const existingAccount = await db.collection("customer_bank_methods").findOne({
      customer_id: parseInt(customerId),
      account_number: account_number,
      status: "ACTIVE"
    });

    if (existingAccount) {
      return res.status(400).json({
        success: false,
        message: "Bank account already exists"
      });
    }

    // If setting as default, remove default from other bank methods
    if (is_default) {
      await db.collection("customer_bank_methods").updateMany(
        { customer_id: parseInt(customerId), status: "ACTIVE" },
        { $set: { is_default: false } }
      );
    }

    // Store bank method
    const result = await db.collection("customer_bank_methods").insertOne({
      customer_id: parseInt(customerId),
      account_number: account_number,
      ifsc_code: ifsc_code,
      bank_name: bank_name,
      account_type: account_type,
      is_default: is_default,
      status: "ACTIVE",
      created_at: new Date(),
      updated_at: new Date()
    });

    res.json({
      success: true,
      message: "Bank account added successfully",
      payment_method_id: result.insertedId
    });
  } catch (error) {
    console.error("Error adding bank method:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add bank payment method"
    });
  }
});

// Add new card payment method
app.post("/api/payment-methods/card", authenticateToken, async (req, res) => {
  try {
    const { card_number, expiry_date, cvv, bank_name, is_default = false } = req.body;
    const customerId = req.user.customerId || req.user.id;

    // Validate required fields
    if (!card_number || !expiry_date || !cvv || !bank_name) {
      return res.status(400).json({
        success: false,
        message: "All card details are required"
      });
    }

    // Validate card number (16 digits)
    const cleanCardNumber = card_number.replace(/[\-\s]/g, '');
    if (!/^[0-9]{16}$/.test(cleanCardNumber)) {
      return res.status(400).json({
        success: false,
        message: "Invalid card number format"
      });
    }

    // Validate expiry date (MM/YY)
    if (!/^[0-9]{2}\/[0-9]{2}$/.test(expiry_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expiry date format (MM/YY required)"
      });
    }

    // Validate CVV (3 digits)
    if (!/^[0-9]{3}$/.test(cvv)) {
      return res.status(400).json({
        success: false,
        message: "Invalid CVV format"
      });
    }

    const db = mongoClient.db("financeai");
    const cardLastFour = cleanCardNumber.slice(-4);

    // Check if card already exists for this customer
    const existingCard = await db.collection("customer_card_methods").findOne({
      customer_id: parseInt(customerId),
      card_last_four: cardLastFour,
      status: "ACTIVE"
    });

    if (existingCard) {
      return res.status(400).json({
        success: false,
        message: "Card already exists"
      });
    }

    // If setting as default, remove default from other card methods
    if (is_default) {
      await db.collection("customer_card_methods").updateMany(
        { customer_id: parseInt(customerId), status: "ACTIVE" },
        { $set: { is_default: false } }
      );
    }

    // Store card method (in production, encrypt sensitive data)
    const result = await db.collection("customer_card_methods").insertOne({
      customer_id: parseInt(customerId),
      card_number: cleanCardNumber, // In production, encrypt this
      card_last_four: cardLastFour,
      expiry_date: expiry_date,
      bank_name: bank_name,
      card_type: "DEBIT",
      is_default: is_default,
      status: "ACTIVE",
      created_at: new Date(),
      updated_at: new Date()
    });

    res.json({
      success: true,
      message: "Card added successfully",
      payment_method_id: result.insertedId
    });
  } catch (error) {
    console.error("Error adding card method:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add card payment method"
    });
  }
});

// Delete payment method
app.delete("/api/payment-methods/:type/:id", authenticateToken, async (req, res) => {
  try {
    const { type, id } = req.params;
    const customerId = req.user.customerId || req.user.id;
    
    const validTypes = ["upi", "bank", "card"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method type"
      });
    }

    const db = mongoClient.db("financeai");
    const collectionName = `customer_${type}_methods`;
    
    const result = await db.collection(collectionName).updateOne(
      { 
        _id: new ObjectId(id),
        customer_id: parseInt(customerId)
      },
      { 
        $set: { 
          status: "DELETED",
          deleted_at: new Date(),
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found"
      });
    }

    res.json({
      success: true,
      message: "Payment method deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting payment method:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete payment method"
    });
  }
});

// Set default payment method
app.put("/api/payment-methods/:type/:id/default", authenticateToken, async (req, res) => {
  try {
    const { type, id } = req.params;
    const customerId = req.user.customerId || req.user.id;
    
    const validTypes = ["upi", "bank", "card"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method type"
      });
    }

    const db = mongoClient.db("financeai");
    const collectionName = `customer_${type}_methods`;
    
    // Remove default from all methods of this type
    await db.collection(collectionName).updateMany(
      { customer_id: parseInt(customerId), status: "ACTIVE" },
      { $set: { is_default: false } }
    );
    
    // Set new default
    const result = await db.collection(collectionName).updateOne(
      { 
        _id: new ObjectId(id),
        customer_id: parseInt(customerId),
        status: "ACTIVE"
      },
      { 
        $set: { 
          is_default: true,
          updated_at: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment method not found"
      });
    }

    res.json({
      success: true,
      message: "Default payment method updated successfully"
    });
  } catch (error) {
    console.error("Error setting default payment method:", error);
    res.status(500).json({
      success: false,
      message: "Failed to set default payment method"
    });
  }
});

// =============================================================================
// PAYMENT METHOD COMPLETION HELPER FUNCTION
// =============================================================================

/**
 * COMPLETE INVESTMENT WITH PAYMENT:
 * This function completes the investment process after payment method selection
 * and saves the final investment record to the database
 */
async function completeInvestmentWithPayment(chat, customerId, paymentMethod, paymentDetails = null) {
  try {
    console.log('Completing investment with payment method:', paymentMethod);
    
    // Determine if SIP or Lumpsum
    const isSIP = chat.messages.some(msg => msg.content.includes("SIP Investment Summary"));
    
    if (isSIP) {
      // Extract SIP details from chat history
      const sipSummaryMsg = chat.messages.find(msg => msg.content.includes("SIP Investment Summary"));
      const sipDate = sipSummaryMsg ? sipSummaryMsg.content.match(/SIP Date: (\d+)/)?.[1] : "5";
      const amount = sipSummaryMsg ? sipSummaryMsg.content.match(/Monthly Amount: ([^\n]+)/)?.[1] : "₹3,000";
      const fundName = sipSummaryMsg ? sipSummaryMsg.content.match(/Fund: ([^\n]+)/)?.[1] : "Selected Fund";
      const goal = sipSummaryMsg ? sipSummaryMsg.content.match(/Goal: ([^\n]+)/)?.[1] : "Wealth Creation";
      
      // Create SIP investment record
      const investment = await createInvestmentRecord({
        customer_id: customerId,
        investment_type: "SIP",
        amount: amount,
        fund_name: fundName,
        sip_date: parseInt(sipDate),
        goal: goal,
        status: "Active",
        chatId: chat._id,
        payment_method: paymentMethod,
        payment_details: paymentDetails
      });
      
      const paymentMethodText = paymentMethod === "default" ? "your default payment method" : 
                               paymentMethod.startsWith("method_") ? "selected payment method" :
                               paymentMethod === "new_upi" ? `new UPI ID (${paymentDetails})` :
                               paymentMethod === "new_bank" ? `new bank account (***${paymentDetails})` :
                               paymentMethod === "new_card" ? `new debit card (***${paymentDetails})` :
                               "selected payment method";
      
      return `✅ **SIP Investment Successful!**

**Investment Details:**
• **Type:** SIP (Systematic Investment Plan)
• **Amount:** ${amount}/month
• **Fund:** ${fundName}
• **SIP Date:** ${sipDate}th of every month
• **Status:** Active
• **Investment ID:** ${investment.investment_id}
• **Units Allocated:** ${investment.units_allocated} units
• **NAV:** ₹${investment.nav}
• **Payment Method:** ${paymentMethodText}

**What's next?**
• Your first SIP installment will be deducted on ${sipDate}th
• You'll receive SMS confirmations for each deduction
• You can track your investments in the Portfolio section

🎉 **You're all set! Your wealth creation journey has begun.**

Would you like to start another investment or check your portfolio?`;
    } else {
      // Lumpsum investment
      const investmentSummaryMsg = chat.messages.find(msg => msg.content.includes("Investment Summary"));
      const amount = investmentSummaryMsg ? investmentSummaryMsg.content.match(/Amount: ([^\n]+)/)?.[1] : "₹50,000";
      const fundName = investmentSummaryMsg ? investmentSummaryMsg.content.match(/Fund: ([^\n]+)/)?.[1] : "Selected Fund";
      const goal = investmentSummaryMsg ? investmentSummaryMsg.content.match(/Goal: ([^\n]+)/)?.[1] : "Wealth Creation";
      
      // Create Lumpsum investment record
      const investment = await createInvestmentRecord({
        customer_id: customerId,
        investment_type: "Lumpsum",
        amount: amount,
        fund_name: fundName,
        goal: goal,
        status: "Completed",
        chatId: chat._id,
        payment_method: paymentMethod,
        payment_details: paymentDetails
      });
      
      const paymentMethodText = paymentMethod === "default" ? "your default payment method" : 
                               paymentMethod.startsWith("method_") ? "selected payment method" :
                               paymentMethod === "new_upi" ? `new UPI ID (${paymentDetails})` :
                               paymentMethod === "new_bank" ? `new bank account (***${paymentDetails})` :
                               paymentMethod === "new_card" ? `new debit card (***${paymentDetails})` :
                               "selected payment method";
      
      return `✅ **Investment Successful!**

**Investment Details:**
• **Type:** Lumpsum Investment
• **Amount:** ${amount}
• **Fund:** ${fundName}
• **Status:** Completed
• **Investment ID:** ${investment.investment_id}
• **Units Allocated:** ${investment.units_allocated} units
• **NAV:** ₹${investment.nav}
• **Current Value:** ₹${(investment.units_allocated * investment.nav).toFixed(2)}
• **Payment Method:** ${paymentMethodText}

**What's next?**
• You'll receive a confirmation email shortly
• Units will be allocated within 1-2 business days
• Track your investment performance in Portfolio

🎉 **Congratulations! Your investment is complete.**

Would you like to make another investment or check your portfolio performance?`;
    }
  } catch (error) {
    console.error("Error completing investment:", error);
    return `I'm sorry, there was an error processing your investment. Please try again or contact our support team.

Error details have been logged for our technical team to review.`;
  }
}

// =============================================================================
// INVESTMENT WORKFLOW FUNCTIONS
// =============================================================================

/**
 * UNIFIED INVESTMENT WORKFLOW:
 * This implements the complete investment flow similar to ticket creation
 * Supports both SIP and Lumpsum investments with conversational guidance
 */

/**
 * INVESTMENT WORKFLOW HANDLER (CHAT INTERFACE):
 * This function handles the step-by-step investment process in the chat.
 * It guides users through investment type selection, goal setting, fund selection, and execution
 */
async function handleInvestmentWorkflow(message, chat, customerId) {
  // Check which step we're in based on previous messages
  const investmentMessages = chat.messages.filter(
    (msg) =>
      msg.content.includes("Investment Type Selection") ||
      msg.content.includes("Goal Setting") ||
      msg.content.includes("Investment Amount") ||
      msg.content.includes("Timeline Setting") ||
      msg.content.includes("SIP Calculation") ||
      msg.content.includes("Custom SIP Amount") ||
      msg.content.includes("Fund Selection") ||
      msg.content.includes("Fund Recommendation") ||
      msg.content.includes("Available Funds") ||
      msg.content.includes("SIP Date Selection") ||
      msg.content.includes("Summary Confirmation") ||
      msg.content.includes("Email OTP Verification") ||
      msg.content.includes("Payment Method")
  );

  console.log('Investment workflow - Total investment messages found:', investmentMessages.length);
  console.log('Investment workflow - User message:', message);
  console.log('Investment workflow - Last 3 bot messages:', 
    chat.messages.filter(msg => msg.sender === 'bot').slice(-3).map(msg => msg.content.substring(0, 100))
  );

  // STEP 0: First time starting investment - show investment type options
  if (investmentMessages.length === 0) {
    console.log('Starting new investment workflow - no previous investment messages found');
    
    // Check if the user's current message is already an investment type selection
    const currentMessage = message.trim().toLowerCase();
    
    // More precise matching for investment type selection
    const isSipSelection = currentMessage === 'sip' || 
                          currentMessage === 'sip investment' ||
                          currentMessage === 'systematic investment plan' ||
                          (currentMessage.includes('sip') && !currentMessage.includes('lumpsum') && currentMessage.length <= 20);
    
    const isLumpsumSelection = currentMessage === 'lumpsum' || 
                              currentMessage === 'lump sum' ||
                              currentMessage === 'lumpsum investment' ||
                              (currentMessage.includes('lumpsum') && currentMessage.length <= 25) ||
                              (currentMessage.includes('lump sum') && currentMessage.length <= 25);
    
    if (isSipSelection) {
      console.log('User selected SIP, proceeding to goal setting');
      return `**Goal Setting**
Awesome! Let's set up your SIP.

Are you investing for a specific goal like:
• Education
• Retirement 
• Wealth creation
• Emergency fund
• Other

Please tell me your investment goal.`;
    } else if (isLumpsumSelection) {
      console.log('User selected Lumpsum, proceeding to amount input');
      return `**Investment Amount**
Great! Let's proceed with your lumpsum investment.

How much would you like to invest? (Minimum ₹500)

Please enter the amount (e.g., ₹50,000).`;
    }
    
    // Check if this is a general investment request that should show options
    const isGeneralInvestmentRequest = currentMessage.includes('invest') || 
                                     currentMessage.includes('investment') ||
                                     currentMessage.includes('make an investment') ||
                                     currentMessage.includes('start investing');
    
    if (isGeneralInvestmentRequest) {
      return `Great! I'll help you make an investment. 

Would you like to start a SIP (Systematic Investment Plan) or make a Lumpsum investment?

**Options:**
• **SIP** - Invest a fixed amount regularly (monthly/quarterly)
• **Lumpsum** - One-time investment

**Investment Type Selection**
Please choose: SIP or Lumpsum`;
    }
    
    // If we reach here, it means there are no investment messages but the current message 
    // doesn't clearly indicate investment intent - this shouldn't happen in normal flow
    console.log('Unexpected state: No investment messages but unclear investment intent in message:', message);
    return `I'd be happy to help you with investments! 

Would you like to start a SIP (Systematic Investment Plan) or make a Lumpsum investment?

**Options:**
• **SIP** - Invest a fixed amount regularly (monthly/quarterly)
• **Lumpsum** - One-time investment

**Investment Type Selection**
Please choose: SIP or Lumpsum`;
  }

  const latestStep = investmentMessages[investmentMessages.length - 1];
  console.log('Investment workflow - Current step:', latestStep.content.split('\n')[0]);
  console.log('Investment workflow - User message:', message);

  // STEP 1: User selected investment type
  if (latestStep.content.includes("Investment Type Selection")) {
    const investmentType = message.trim().toLowerCase();

    if (investmentType.includes("sip")) {
      // Start SIP flow
      return `**Goal Setting**
Awesome! Let's set up your SIP.

Are you investing for a specific goal like:
• Education
• Retirement 
• Wealth creation
• Emergency fund
• Other

Please tell me your investment goal.`;
    } else if (investmentType.includes("lumpsum") || investmentType.includes("lump sum")) {
      // Start Lumpsum flow
      return `**Investment Amount**
Great! Let's proceed with your lumpsum investment.

How much would you like to invest? (Minimum ₹500)

Please enter the amount (e.g., ₹50,000).`;
    } else {
      return `Please select a valid investment type:
• **SIP** - For regular investments
• **Lumpsum** - For one-time investment

Type "SIP" or "Lumpsum" to continue.`;
    }
  }

  // STEP 2A: SIP Goal Setting
  if (latestStep.content.includes("Goal Setting")) {
    const goal = message.trim();
    console.log('Goal extracted:', goal);
    
    return `**Investment Amount**
Great choice! Investing for ${goal} is a smart move.

How much do you want to accumulate for this goal?

Please enter your target amount (e.g., ₹20 lakhs).`;
  }

  // STEP 2B: SIP Amount Collection
  if (latestStep.content.includes("Investment Amount") && latestStep.content.includes("Investing for")) {
    const targetAmount = message.trim();
    console.log('Target amount extracted:', targetAmount);
    
    return `**Timeline Setting**
Target amount: ${targetAmount}

In how many years do you want to achieve this goal?

Please enter the number of years (e.g., 15 years).`;
  }

  // STEP 3A: Timeline Collection
  if (latestStep.content.includes("Timeline Setting") && latestStep.content.includes("Target amount:")) {
    const timeline = message.trim();
    console.log('Timeline extracted:', timeline);
    
    // Extract target amount from the CURRENT step message (not previous)
    const targetMatch = latestStep.content.match(/Target amount: ([^\n]+)/);
    const targetAmount = targetMatch ? targetMatch[1] : "₹20 lakhs";
    console.log('Extracted target amount from current step:', targetAmount);
    
    // Parse years from timeline input
    const years = parseInt(timeline.replace(/[^0-9]/g, ''));
    if (isNaN(years) || years <= 0) {
      return `Please enter a valid number of years.

Example: "15" or "15 years"`;
    }
    
    // Calculate SIP amount based on target and timeline
    let calculatedSIP = "₹3,000";
    
    // Try to do actual calculation
    try {
      const numericTarget = parseFloat(targetAmount.replace(/[₹,lakhs\s]/g, ''));
      
      if (!isNaN(numericTarget) && years > 0) {
        // Convert lakhs to actual amount if needed
        const actualTarget = targetAmount.toLowerCase().includes('lakh') ? numericTarget * 100000 : numericTarget;
        
        // Simple SIP calculation assuming 12% annual return
        const monthlyRate = 0.12 / 12;
        const months = years * 12;
        const monthlySIP = actualTarget * monthlyRate / (Math.pow(1 + monthlyRate, months) - 1);
        
        calculatedSIP = `₹${Math.round(monthlySIP).toLocaleString()}`;
        console.log('Calculated SIP:', calculatedSIP);
      }
    } catch (error) {
      console.log('SIP calculation error:', error);
    }
    
    return `**SIP Calculation**
To reach ${targetAmount} in ${years} years, you should invest about ${calculatedSIP}/month (assuming ~12% annual return).

Want to go with this amount or enter your own?

• **Accept Suggested** - ${calculatedSIP}/month
• **Enter Custom** - Specify your own amount

Please choose your preference.`;
  }

  // STEP 3B: Lumpsum Amount Processing
  if (latestStep.content.includes("Investment Amount") && latestStep.content.includes("lumpsum")) {
    const amount = message.trim();
    
    // Validate amount
    const numericAmount = parseFloat(amount.replace(/[₹,]/g, ''));
    if (isNaN(numericAmount) || numericAmount < 500) {
      return `Please enter a valid amount. Minimum investment is ₹500.

Example: ₹50,000 or 50000`;
    }
    
    return `**Fund Selection**
Amount: ${amount}

Would you like me to recommend a mutual fund or pick one yourself?

• **Recommend for me** - I'll suggest the best fund
• **I'll choose** - Browse and select manually

Please choose your preference.`;
  }

  // STEP 4: SIP Amount Confirmation
  if (latestStep.content.includes("SIP Calculation")) {
    const choice = message.trim().toLowerCase();
    
    if (choice.includes("accept") || choice.includes("suggested")) {
      return `**Fund Selection**
Perfect! Now let's choose the right mutual fund.

Would you like me to recommend one, or do you want to pick it yourself?

• **Recommend for me** - I'll suggest based on your goal
• **I'll choose** - Browse available funds

Please choose your preference.`;
    } else if (choice.includes("custom") || choice.includes("enter")) {
      return `**Custom SIP Amount**
Please enter your preferred monthly SIP amount (minimum ₹500):

Example: ₹5,000`;
    } else {
      return `Please choose:
• **Accept Suggested** - Use recommended amount
• **Enter Custom** - Specify your own amount`;
    }
  }

  // STEP 5: Custom SIP Amount
  if (latestStep.content.includes("Custom SIP Amount")) {
    const customAmount = message.trim();
    const numericAmount = parseFloat(customAmount.replace(/[₹,]/g, ''));
    
    if (isNaN(numericAmount) || numericAmount < 500) {
      return `Please enter a valid amount. Minimum SIP amount is ₹500.

Example: ₹2,000`;
    }
    
    return `**Fund Selection**
SIP Amount: ${customAmount}/month

Now let's choose the right mutual fund.

Would you like me to recommend one, or do you want to pick it yourself?

• **Recommend for me** - I'll suggest based on your goal
• **I'll choose** - Browse available funds

Please choose your preference.`;
  }

  // STEP 6: Fund Selection
  if (latestStep.content.includes("Fund Selection")) {
    const choice = message.trim().toLowerCase();
    
    if (choice.includes("recommend")) {
      // Determine if SIP or Lumpsum
      const isSIP = chat.messages.some(msg => msg.content.includes("SIP") && !msg.content.includes("lumpsum"));
      
      // Extract investment details from chat history for better recommendations
      const goalMsg = chat.messages.find(msg => msg.content.includes("Investing for") || msg.content.includes("Goal Setting"));
      const amountMsg = chat.messages.find(msg => msg.content.includes("SIP Amount:") || msg.content.includes("Amount:"));
      const timelineMsg = chat.messages.find(msg => msg.content.includes("Timeline Setting") || msg.content.includes("years"));
      
      let goal = "Wealth Creation";
      let amount = isSIP ? "₹3,000" : "₹50,000";
      let timeline = "15 years";
      
      // Extract goal
      if (goalMsg) {
        const goalMatch = goalMsg.content.match(/Investing for ([^\n\s\.]+)/i) || goalMsg.content.match(/goal[:\s]*([^\n\.]+)/i);
        if (goalMatch) goal = goalMatch[1].trim();
      }
      
      // Extract amount
      if (amountMsg) {
        const amountMatch = amountMsg.content.match(/(?:SIP Amount:|Amount:|₹)\s*([^\n\/]+)/i);
        if (amountMatch) amount = amountMatch[1].trim().replace('/month', '');
      }
      
      // Extract timeline
      if (timelineMsg) {
        const timelineMatch = timelineMsg.content.match(/(\d+)\s*years?/i);
        if (timelineMatch) timeline = timelineMatch[1] + " years";
      }
      
      try {
        // Generate AI-powered fund recommendation
        const fundRecommendation = await generateFundRecommendation({
          investmentType: isSIP ? "SIP" : "Lumpsum",
          goal: goal,
          amount: amount,
          timeline: timeline,
          customerId: customerId
        });
        
        return `**Fund Recommendation**
${fundRecommendation}

Would you like to proceed with this recommended fund?

• **Yes, proceed**
• **Show other options**

Please confirm your choice.`;
      } catch (error) {
        console.error('Error generating fund recommendation:', error);
        
        // Fallback to hardcoded recommendation if AI fails
        if (isSIP) {
          return `**Fund Recommendation**
Based on your goal and timeline, I suggest:

**Mirae Asset Large Cap Fund (Direct – Growth)**
• Category: Large Cap
• 5-Year Return: 14.2%
• Risk: Moderate
• Fund Manager: Neelesh Surana

Would you like to proceed with this fund?

• **Yes, proceed**
• **Show other options**

Please confirm your choice.`;
        } else {
          return `**Fund Recommendation**
Based on your investment profile, I recommend:

**Parag Parikh Flexi Cap Fund (Direct – Growth)**
• Category: Flexi Cap
• 5-Year Return: 16.8%
• Risk: Moderate to High
• Fund Manager: Rajeev Thakkar

Do you want to proceed with this fund?

• **Yes, proceed**
• **Show other options**

Please confirm your choice.`;
        }
      }
    } else if (choice.includes("choose") || choice.includes("browse")) {
      return `**Available Funds**
Here are some top-performing funds:

1. **SBI Bluechip Fund** - Large Cap (13.5% returns)
2. **HDFC Top 100 Fund** - Large Cap (14.1% returns)
3. **Axis Midcap Fund** - Mid Cap (18.2% returns)
4. **Parag Parikh Flexi Cap** - Flexi Cap (16.8% returns)
5. **Mirae Asset Large Cap** - Large Cap (14.2% returns)

Please select a fund by number (1-5) or name.`;
    } else {
      return `Please choose:
• **Recommend for me** - Get personalized suggestion
• **I'll choose** - Browse available funds`;
    }
  }

  // STEP 7: Fund Confirmation
  if (latestStep.content.includes("Fund Recommendation") || latestStep.content.includes("Available Funds")) {
    const choice = message.trim().toLowerCase();
    
    if (choice.includes("yes") || choice.includes("proceed") || choice.includes("1") || choice.includes("2") || choice.includes("3") || choice.includes("4") || choice.includes("5")) {
      // Determine if SIP or Lumpsum and gather investment details
      const isSIP = chat.messages.some(msg => msg.content.includes("SIP Amount:") || msg.content.includes("monthly"));
      
      // Extract fund details based on choice
      let selectedFund = "";
      if (choice.includes("yes") || choice.includes("proceed")) {
        // User confirmed recommended fund
        const fundMsg = chat.messages.find(msg => msg.content.includes("Fund Recommendation"));
        if (fundMsg?.content.includes("Mirae Asset")) {
          selectedFund = "Mirae Asset Large Cap Fund (Direct – Growth)";
        } else if (fundMsg?.content.includes("Parag Parikh")) {
          selectedFund = "Parag Parikh Flexi Cap Fund (Direct – Growth)";
        }
      } else if (choice.includes("1") || choice.includes("2") || choice.includes("3") || choice.includes("4") || choice.includes("5")) {
        // Dynamic fund selection based on AI-generated or fallback list
        const fundOptions = chat.messages.find(msg => 
          msg.content.includes("More Fund Options") && 
          msg.content.includes("1.") && 
          msg.content.includes("2.")
        );
        
        if (fundOptions) {
          // Extract fund name from the AI-generated list based on user's choice
          const fundLines = fundOptions.content.split('\n').filter(line => 
            line.trim().match(/^\d+\./)
          );
          
          const choiceNumber = choice.match(/\d+/)?.[0];
          if (choiceNumber && fundLines[parseInt(choiceNumber) - 1]) {
            const selectedLine = fundLines[parseInt(choiceNumber) - 1];
            // Extract fund name from format: "1. **Fund Name (Direct – Growth)** - Category (X% returns)"
            const fundMatch = selectedLine.match(/\*\*([^*]+)\*\*/);
            if (fundMatch) {
              selectedFund = fundMatch[1].trim();
            } else {
              // Fallback extraction
              const basicMatch = selectedLine.match(/\d+\.\s*([^-]+)\s*-/);
              selectedFund = basicMatch ? basicMatch[1].trim() : "Selected Fund";
            }
          } else {
            selectedFund = "Selected Fund";
          }
        } else {
          // Check if we're selecting from "Available Funds" (hardcoded list)
          const availableFundsMsg = chat.messages.find(msg => 
            msg.content.includes("Available Funds") && 
            msg.content.includes("SBI Bluechip Fund")
          );
          
          if (availableFundsMsg) {
            // Map to the actual "Available Funds" options
            if (choice.includes("1")) {
              selectedFund = "SBI Bluechip Fund (Direct – Growth)";
            } else if (choice.includes("2")) {
              selectedFund = "HDFC Top 100 Fund (Direct – Growth)";
            } else if (choice.includes("3")) {
              selectedFund = "Axis Midcap Fund (Direct – Growth)";
            } else if (choice.includes("4")) {
              selectedFund = "Parag Parikh Flexi Cap Fund (Direct – Growth)";
            } else if (choice.includes("5")) {
              selectedFund = "Mirae Asset Large Cap Fund (Direct – Growth)";
            }
          } else {
            // Fallback to generic mapping for other lists
            if (choice.includes("1")) {
              selectedFund = "ICICI Prudential Bluechip Fund (Direct – Growth)";
            } else if (choice.includes("2")) {
              selectedFund = "Kotak Standard Multicap Fund (Direct – Growth)";
            } else if (choice.includes("3")) {
              selectedFund = "DSP Tax Saver Fund (Direct – Growth)";
            } else if (choice.includes("4")) {
              selectedFund = "Nippon India Small Cap Fund (Direct – Growth)";
            } else if (choice.includes("5")) {
              selectedFund = "SBI Hybrid Equity Fund (Direct – Growth)";
            }
          }
        }
      }
      
      if (isSIP) {
        return `**SIP Date Selection**
Great choice! You've selected: ${selectedFund}

Which date should your SIP be deducted each month?

Recommended dates: 1st, 5th, 10th, 15th, 20th, 25th

Please enter your preferred date (1-28).`;
      } else {
        // For lumpsum, show summary directly
        const amountMsg = chat.messages.find(msg => msg.content.includes("Amount:"));
        const amount = amountMsg ? amountMsg.content.match(/Amount: ([^\n]+)/)?.[1] : "₹50,000";
        const goalMsg = chat.messages.find(msg => msg.content.includes("Goal Setting"));
        const goal = goalMsg ? "Investment Goal" : "Wealth Creation";
        
        return `**Investment Summary**
Please review your investment details:

📊 **Investment Type:** Lumpsum Investment
💰 **Amount:** ${amount}
🎯 **Goal:** ${goal}
🏦 **Fund:** ${selectedFund}
📈 **Category:** ${selectedFund.includes('Large Cap') ? 'Large Cap' : selectedFund.includes('Flexi Cap') ? 'Flexi Cap' : selectedFund.includes('Mid Cap') ? 'Mid Cap' : 'Equity'}
⚡ **Processing:** Immediate
📧 **Confirmation:** Email + SMS

**Investment Summary Confirmation**
Do you want to proceed with this investment? An OTP will be sent to your registered email for verification.

• **Yes, proceed** - Continue with OTP verification
• **Modify details** - Go back to change investment details

Please confirm to proceed.`;
      }
    } else if (choice.includes("other") || choice.includes("options")) {
      // Determine if SIP or Lumpsum
      const isSIP = chat.messages.some(msg => msg.content.includes("SIP") && !msg.content.includes("lumpsum"));
      
      // Extract investment details from chat history for better recommendations
      const goalMsg = chat.messages.find(msg => msg.content.includes("Investing for") || msg.content.includes("Goal Setting"));
      const amountMsg = chat.messages.find(msg => msg.content.includes("SIP Amount:") || msg.content.includes("Amount:"));
      const timelineMsg = chat.messages.find(msg => msg.content.includes("Timeline Setting") || msg.content.includes("years"));
      
      let goal = "Wealth Creation";
      let amount = isSIP ? "₹3,000" : "₹50,000";
      let timeline = "15 years";
      
      // Extract goal
      if (goalMsg) {
        const goalMatch = goalMsg.content.match(/Investing for ([^\n\s\.]+)/i) || goalMsg.content.match(/goal[:\s]*([^\n\.]+)/i);
        if (goalMatch) goal = goalMatch[1].trim();
      }
      
      // Extract amount
      if (amountMsg) {
        const amountMatch = amountMsg.content.match(/(?:SIP Amount:|Amount:|₹)\s*([^\n\/]+)/i);
        if (amountMatch) amount = amountMatch[1].trim().replace('/month', '');
      }
      
      // Extract timeline
      if (timelineMsg) {
        const timelineMatch = timelineMsg.content.match(/(\d+)\s*years?/i);
        if (timelineMatch) timeline = timelineMatch[1] + " years";
      }
      
      try {
        // Generate AI-powered alternative fund recommendations
        const alternativeFunds = await generateAlternativeFundRecommendations({
          investmentType: isSIP ? "SIP" : "Lumpsum",
          goal: goal,
          amount: amount,
          timeline: timeline,
          customerId: customerId
        });
        
        return `**More Fund Options**
${alternativeFunds}

Please select a fund by number or name.`;
      } catch (error) {
        console.error('Error generating alternative fund recommendations:', error);
        
        // Fallback to hardcoded recommendations if AI fails
        return `**More Fund Options**
Here are additional funds to consider:

1. **ICICI Prudential Bluechip** - Large Cap (13.8% returns)
2. **Kotak Standard Multicap** - Multi Cap (15.2% returns)
3. **DSP Tax Saver** - ELSS (12.9% returns)
4. **Nippon India Small Cap** - Small Cap (19.5% returns)

Please select a fund by number or name.`;
      }
    } else {
      return `Please confirm your fund selection:
• **Yes, proceed** - Continue with recommended fund
• **Show other options** - See more funds`;
    }
  }

  // STEP 8A: SIP Date Selection
  if (latestStep.content.includes("SIP Date Selection")) {
    const sipDate = parseInt(message.trim());
    
    if (isNaN(sipDate) || sipDate < 1 || sipDate > 28) {
      return `Please enter a valid date between 1 and 28.

Example: 5 (for 5th of every month)`;
    }
    
    // Extract SIP details for summary
    const fundMsg = chat.messages.find(msg => msg.content.includes("You've selected:"));
    const selectedFund = fundMsg ? fundMsg.content.match(/You've selected: ([^\n]+)/)?.[1] : "Selected Fund";
    
    const amountMsg = chat.messages.find(msg => msg.content.includes("SIP Amount:") || msg.content.includes("Accept Suggested"));
    let amount = "₹3,000";
    if (amountMsg) {
      if (amountMsg.content.includes("SIP Amount:")) {
        amount = amountMsg.content.match(/SIP Amount: ([^/]+)/)?.[1] || "₹3,000";
      } else if (amountMsg.content.includes("Accept Suggested")) {
        const suggestionMatch = amountMsg.content.match(/Accept Suggested.*?(₹[\d,]+)/)?.[1];
        amount = suggestionMatch || "₹3,000";
      }
    }
    
    const goalMsg = chat.messages.find(msg => msg.content.includes("Investing for"));
    const goal = goalMsg ? goalMsg.content.match(/Investing for ([^\s]+)/)?.[1] || "Wealth Creation" : "Wealth Creation";
    
    return `**SIP Investment Summary**
Please review your SIP investment details:

📊 **Investment Type:** SIP (Systematic Investment Plan)
💰 **Monthly Amount:** ${amount}
🎯 **Goal:** ${goal}
🏦 **Fund:** ${selectedFund}
📈 **Category:** ${selectedFund.includes('Large Cap') ? 'Large Cap' : selectedFund.includes('Flexi Cap') ? 'Flexi Cap' : selectedFund.includes('Mid Cap') ? 'Mid Cap' : 'Equity'}
📅 **SIP Date:** ${sipDate}th of every month
⚡ **First Deduction:** ${sipDate}th of next month
📧 **Confirmation:** Email + SMS

**SIP Summary Confirmation**
Do you want to proceed with this SIP investment? An OTP will be sent to your registered email for verification.

• **Yes, proceed** - Continue with email OTP verification
• **Modify details** - Go back to change SIP details

Please confirm to proceed.`;
  }

  // STEP 8B: Investment Summary Confirmation (for both SIP and Lumpsum)
  if (latestStep.content.includes("Summary Confirmation")) {
    const choice = message.trim().toLowerCase();
    
    if (choice.includes("yes") || choice.includes("proceed")) {
      // Generate and "send" OTP via email
      const otp = Math.floor(100000 + Math.random() * 900000); // Generate 6-digit OTP
      
      // Get customer email
      const userData = await getUserData(customerId);
      const customerEmail = userData.customer?.email || "user@example.com";
      
      // In a real implementation, you would send the OTP via email here
      console.log(`Investment OTP ${otp} would be sent to ${customerEmail}`);
      
      // Store OTP temporarily in database for verification
      const db = mongoClient.db("financeai");
      await db.collection("investment_otps").insertOne({
        customer_id: parseInt(customerId),
        otp: otp.toString(),
        created_at: new Date(),
        expires_at: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        verified: false,
        chat_id: chat._id.toString()
      });
      
      return `**Email OTP Verification**
An OTP has been sent to your registered email: ${customerEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3')}

📧 **Please check your email and enter the 6-digit OTP to confirm your investment.**

*For demo purposes, your OTP is: ${otp}*

Please enter the OTP:`;
    } else if (choice.includes("modify") || choice.includes("back")) {
      return `**Modify Investment Details**
Which detail would you like to modify?

• **Amount** - Change investment amount
• **Fund** - Select different mutual fund
• **SIP Date** - Change SIP deduction date (for SIP only)
• **Start Over** - Begin investment process again

Please choose what you'd like to modify.`;
    } else {
      return `Please confirm your choice:
• **Yes, proceed** - Continue with email OTP verification
• **Modify details** - Go back to change investment details`;
    }
  }
  
  // STEP 8C: Email OTP Verification
  if (latestStep.content.includes("Email OTP Verification")) {
    const otp = message.trim();
    
    if (otp.length !== 6 || isNaN(otp)) {
      return `Please enter a valid 6-digit OTP.

📧 Check your email for the OTP. If you didn't receive it, please check your spam folder.

Enter the 6-digit OTP:`;
    }
    
    // Verify OTP against stored value
    const db = mongoClient.db("financeai");
    const otpRecord = await db.collection("investment_otps").findOne({
      customer_id: parseInt(customerId),
      otp: otp,
      verified: false,
      expires_at: { $gt: new Date() },
      chat_id: chat._id.toString()
    });
    
    if (!otpRecord) {
      return `Invalid or expired OTP. Please try again.

📧 Check your email for the correct OTP or request a new one.

Enter the 6-digit OTP:`;
    }
    
    // Mark OTP as verified
    await db.collection("investment_otps").updateOne(
      { _id: otpRecord._id },
      { $set: { verified: true, verified_at: new Date() } }
    );
    
    // Determine if SIP or Lumpsum
    const isSIP = chat.messages.some(msg => msg.content.includes("SIP Investment Summary"));
    
    if (isSIP) {
      return `**Payment Method**
✅ **Email OTP Verified Successfully!**

Would you like to use your existing payment mandate or create a new one?

• **Use existing** - Continue with saved auto-debit mandate
• **Create new** - Set up new payment method for auto-debit

Please choose your preference.`;
    } else {
      return `**Payment Method**
✅ **Email OTP Verified Successfully!**

Would you like to pay using your saved payment method or add a new one?

• **Use saved** - Pay with existing UPI/Bank account
• **Add new** - Link new payment method

Please choose your preference.`;
    }
  }

  // STEP 9: Payment Method and Final Confirmation
  if (latestStep.content.includes("Payment Method") && latestStep.content.includes("OTP Verified")) {
    const paymentChoice = message.trim().toLowerCase();
    
    if (paymentChoice.includes("existing") || paymentChoice.includes("saved") || paymentChoice.includes("use")) {
      // Ask which type of payment method they want to use
      return `**Choose Payment Method Type**

Which type of payment method would you like to use?

• **UPI** - Use your saved UPI IDs
• **Bank Account** - Use your saved bank accounts
• **Card** - Use your saved debit/credit cards

Please choose the payment method type you'd like to use.`;
    } else if (paymentChoice.includes("new") || paymentChoice.includes("create") || paymentChoice.includes("add")) {
      return `**New Payment Setup**
Please choose which payment method you'd like to add:

• **UPI** - Add new UPI ID
• **Bank Account** - Add new bank account
• **Card** - Add new debit/credit card

Which payment method would you like to add?`;
    } else {
      return `Please choose your payment method:
• **Use existing** - Continue with saved payment
• **Create new** - Add new payment method`;
    }
  }
  
  // STEP 10: Handle Payment Method Type Selection
  if (latestStep.content.includes("Choose Payment Method Type")) {
    const choice = message.trim().toLowerCase();
    
    if (choice.includes("upi")) {
      // Fetch UPI methods for this customer
      try {
        const db = mongoClient.db("financeai");
        const upiData = await db.collection("customer_upi").findOne({ customer_id: parseInt(customerId) });
        
        if (!upiData || !upiData.upi_details || upiData.upi_details.length === 0) {
          return `**No UPI Methods Found**

You don't have any saved UPI IDs yet.

Would you like to add a new UPI ID?

• **Yes** - Add new UPI ID
• **Choose different type** - Select bank account or card instead

Please choose your preference.`;
        }
        
        let upiMethodsList = "**Your Saved UPI Methods:**\n\n";
        upiData.upi_details.forEach((upi, index) => {
          const status = upi.is_verified ? '✅' : '⏳';
          const primary = upi.is_primary ? ' (Primary)' : '';
          upiMethodsList += `${index + 1}. ${status} ${upi.upi_id} (${upi.provider})${primary}\n`;
        });
        
        upiMethodsList += "\n**UPI Method Selection**\n";
        upiMethodsList += "Please select a UPI method by number, or type:\n";
        upiMethodsList += "• **Add new UPI** - To add a new UPI ID\n\n";
        upiMethodsList += "Which UPI method would you like to use?";
        
        return upiMethodsList;
        
      } catch (error) {
        console.error("Error fetching UPI methods:", error);
        return `**Error Loading UPI Methods**\n\nThere was an issue loading your UPI methods. Would you like to add a new UPI ID instead?\n\n• **Yes** - Add new UPI ID\n• **Choose different type** - Select bank account or card instead`;
      }
    } else if (choice.includes("bank")) {
      // Fetch Bank Account methods for this customer
      try {
        const db = mongoClient.db("financeai");
        const bankData = await db.collection("customer_bank_accounts").findOne({ customer_id: parseInt(customerId) });
        
        if (!bankData || !bankData.bank_accounts || bankData.bank_accounts.length === 0) {
          return `**No Bank Accounts Found**

You don't have any saved bank accounts yet.

Would you like to add a new bank account?

• **Yes** - Add new bank account
• **Choose different type** - Select UPI or card instead

Please choose your preference.`;
        }
        
        let bankMethodsList = "**Your Saved Bank Accounts:**\n\n";
        bankData.bank_accounts.forEach((bank, index) => {
          const status = bank.is_verified ? '✅' : '⏳';
          const primary = bank.is_primary ? ' (Primary)' : '';
          const maskedAccount = `****${bank.account_number.slice(-4)}`;
          bankMethodsList += `${index + 1}. ${status} ${bank.bank_short_name} - ${maskedAccount} (${bank.account_type})${primary}\n`;
        });
        
        bankMethodsList += "\n**Bank Account Selection**\n";
        bankMethodsList += "Please select a bank account by number, or type:\n";
        bankMethodsList += "• **Add new bank** - To add a new bank account\n\n";
        bankMethodsList += "Which bank account would you like to use?";
        
        return bankMethodsList;
        
      } catch (error) {
        console.error("Error fetching bank accounts:", error);
        return `**Error Loading Bank Accounts**\n\nThere was an issue loading your bank accounts. Would you like to add a new bank account instead?\n\n• **Yes** - Add new bank account\n• **Choose different type** - Select UPI or card instead`;
      }
    } else if (choice.includes("card")) {
      // Fetch Card methods for this customer
      try {
        const db = mongoClient.db("financeai");
        const cardData = await db.collection("customer_cards").findOne({ customer_id: parseInt(customerId) });
        
        if (!cardData || !cardData.cards || cardData.cards.length === 0) {
          return `**No Cards Found**

You don't have any saved cards yet.

Would you like to add a new card?

• **Yes** - Add new card
• **Choose different type** - Select UPI or bank account instead

Please choose your preference.`;
        }
        
        let cardMethodsList = "**Your Saved Cards:**\n\n";
        cardData.cards.forEach((card, index) => {
          const status = card.is_verified ? '✅' : '⏳';
          const primary = card.is_primary ? ' (Primary)' : '';
          const active = card.is_active ? '' : ' (Inactive)';
          cardMethodsList += `${index + 1}. ${status} ${card.issuing_bank} ${card.card_type} ${card.card_number_masked}${primary}${active}\n`;
        });
        
        cardMethodsList += "\n**Card Selection**\n";
        cardMethodsList += "Please select a card by number, or type:\n";
        cardMethodsList += "• **Add new card** - To add a new card\n\n";
        cardMethodsList += "Which card would you like to use?";
        
        return cardMethodsList;
        
      } catch (error) {
        console.error("Error fetching cards:", error);
        return `**Error Loading Cards**\n\nThere was an issue loading your cards. Would you like to add a new card instead?\n\n• **Yes** - Add new card\n• **Choose different type** - Select UPI or bank account instead`;
      }
    } else {
      return `Please choose a payment method type:\n• **UPI** - Use your saved UPI IDs\n• **Bank Account** - Use your saved bank accounts\n• **Card** - Use your saved cards`;
    }
  }
  
  // STEP 10B: Handle specific payment method selection from list
  if (latestStep.content.includes("UPI Method Selection") || 
      latestStep.content.includes("Bank Account Selection") || 
      latestStep.content.includes("Card Selection")) {
    const choice = message.trim().toLowerCase();
    
    if (choice.includes("add new")) {
      // Determine which type to add based on the current step
      if (latestStep.content.includes("UPI Method Selection")) {
        return `**UPI Payment Setup**

Please provide your UPI ID:

Example: user@paytm, 9876543210@upi

Enter your UPI ID:`;
      } else if (latestStep.content.includes("Bank Account Selection")) {
        return `**Bank Account Setup**

Please provide your bank details in this format:

**Account Number:** [Your account number]
**IFSC Code:** [Bank IFSC code]
**Bank Name:** [Full bank name]
**Account Type:** [Savings/Current]

Example:
Account Number: 1234567890
IFSC Code: SBIN0001234
Bank Name: State Bank of India
Account Type: Savings

Please enter your bank details:`;
      } else if (latestStep.content.includes("Card Selection")) {
        return `**Card Setup**

Please provide your card details:

**Card Number:** [16-digit card number]
**Expiry Date:** [MM/YY]
**CVV:** [3-digit CVV]
**Bank Name:** [Card issuing bank]

Example:
Card Number: 1234-5678-9012-3456
Expiry Date: 12/25
CVV: 123
Bank Name: HDFC Bank

Please enter your card details:`;
      }
    } else if (!isNaN(parseInt(choice))) {
      // User selected a specific payment method by number
      const selectedIndex = parseInt(choice) - 1; // Convert to 0-based index
      return await completeInvestmentWithPayment(chat, customerId, `selected_${selectedIndex}`);
    } else {
      return `Please select a valid option:
• Enter a **number** to select a payment method
• Type **"add new"** to add a new payment method`;
    }
  }

  // STEP 11: Handle New Payment Method Setup
  if (latestStep.content.includes("New Payment Setup")) {
    const paymentType = message.trim().toLowerCase();
    
    if (paymentType.includes("upi")) {
      return `**UPI Payment Setup**

Please provide your UPI ID:

Example: user@paytm, 9876543210@upi

Enter your UPI ID:`;
    } else if (paymentType.includes("bank") || paymentType.includes("account")) {
      return `**Bank Account Setup**

Please provide your bank details in this format:

**Account Number:** [Your account number]
**IFSC Code:** [Bank IFSC code]
**Bank Name:** [Full bank name]
**Account Type:** [Savings/Current]

Example:
Account Number: 1234567890
IFSC Code: SBIN0001234
Bank Name: State Bank of India
Account Type: Savings

Please enter your bank details:`;
    } else if (paymentType.includes("card")) {
      return `**Card Setup**

Please provide your card details:

**Card Number:** [16-digit card number]
**Expiry Date:** [MM/YY]
**CVV:** [3-digit CVV]
**Bank Name:** [Card issuing bank]

Example:
Card Number: 1234-5678-9012-3456
Expiry Date: 12/25
CVV: 123
Bank Name: HDFC Bank

Please enter your card details:`;
    } else {
      return `Please select a payment method:

• **UPI** - For UPI payments
• **Bank Account** - For direct bank transfers
• **Card** - For card payments

Which payment method would you like to add?`;
    }
  }
  
  // STEP 12: Handle Payment Method Data Collection
  if (latestStep.content.includes("UPI Payment Setup") || 
      latestStep.content.includes("Bank Account Setup") || 
      latestStep.content.includes("Card Setup")) {
    
    const paymentData = message.trim();
    
    // Validate and store payment method
    try {
      const db = mongoClient.db("financeai");
      // Get customer data
      const userData = await getUserData(customerId);
      
      if (latestStep.content.includes("UPI Payment Setup")) {
        // Validate UPI ID format
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z]{2,64}$/;
        if (!upiRegex.test(paymentData)) {
          return `Invalid UPI ID format. Please enter a valid UPI ID like:

user@paytm
9876543210@upi
myname@oksbi

Please enter a valid UPI ID:`;
        }
        
        // Store UPI method using PaymentMethodManager
        const PaymentMethodManager = require('./payment-method-manager');
        const manager = new PaymentMethodManager();
        const result = await manager.addUpiMethod(parseInt(customerId), paymentData);
        
        if (!result.success) {
          return `Error adding UPI method: ${result.message}\n\nPlease try again with a valid UPI ID:`;
        }
        
        return await completeInvestmentWithPayment(chat, customerId, "new_upi", paymentData);
        
      } else if (latestStep.content.includes("Bank Account Setup")) {
        // Parse bank details
        const accountMatch = paymentData.match(/Account Number[:\s]*([0-9]+)/i);
        const ifscMatch = paymentData.match(/IFSC Code[:\s]*([A-Z]{4}[0-9]{7})/i);
        const bankMatch = paymentData.match(/Bank Name[:\s]*([^\n\r]+)/i);
        const typeMatch = paymentData.match(/Account Type[:\s]*([^\n\r]+)/i);
        
        if (!accountMatch || !ifscMatch || !bankMatch || !typeMatch) {
          return `Please provide complete bank details in the correct format:

Account Number: [Your account number]
IFSC Code: [Bank IFSC code]
Bank Name: [Full bank name]
Account Type: [Savings/Current]

Example:
Account Number: 1234567890
IFSC Code: SBIN0001234
Bank Name: State Bank of India
Account Type: Savings

Please enter your complete bank details:`;
        }
        
        // Store bank method using PaymentMethodManager
        const PaymentMethodManager = require('./payment-method-manager');
        const manager = new PaymentMethodManager();
        const bankDetails = {
          account_number: accountMatch[1],
          ifsc_code: ifscMatch[1],
          bank_name: bankMatch[1].trim(),
          account_type: typeMatch[1].trim(),
          account_holder_name: userData.customer?.name || 'Account Holder'
        };
        const result = await manager.addBankAccount(parseInt(customerId), bankDetails);
        
        if (!result.success) {
          return `Error adding bank account: ${result.message}\n\nPlease try again with valid bank details:`;
        }
        
        return await completeInvestmentWithPayment(chat, customerId, "new_bank", accountMatch[1]);
        
      } else if (latestStep.content.includes("Card Setup")) {
        // Parse card details
        const cardMatch = paymentData.match(/Card Number[:\s]*([0-9\-\s]+)/i);
        const expiryMatch = paymentData.match(/Expiry Date[:\s]*([0-9]{2}\/[0-9]{2})/i);
        const cvvMatch = paymentData.match(/CVV[:\s]*([0-9]{3})/i);
        const bankMatch = paymentData.match(/Bank Name[:\s]*([^\n\r]+)/i);
        
        if (!cardMatch || !expiryMatch || !cvvMatch || !bankMatch) {
          return `Please provide complete card details in the correct format:

Card Number: [16-digit card number]
Expiry Date: [MM/YY]
CVV: [3-digit CVV]
Bank Name: [Card issuing bank]

Example:
Card Number: 1234-5678-9012-3456
Expiry Date: 12/25
CVV: 123
Bank Name: HDFC Bank

Please enter your complete card details:`;
        }
        
        const cardNumber = cardMatch[1].replace(/[\-\s]/g, '');
        
        // Store card method using PaymentMethodManager
        const PaymentMethodManager = require('./payment-method-manager');
        const manager = new PaymentMethodManager();
        const cardDetails = {
          card_number: cardNumber,
          expiry_month: expiryMatch[1].split('/')[0],
          expiry_year: expiryMatch[1].split('/')[1],
          cvv: cvvMatch[1],
          card_holder_name: userData.customer?.name || 'Card Holder',
          issuing_bank: bankMatch[1].trim(),
          card_type: 'Debit'
        };
        const result = await manager.addCard(parseInt(customerId), cardDetails);
        
        if (!result.success) {
          return `Error adding card: ${result.message}\n\nPlease try again with valid card details:`;
        }
        
        return await completeInvestmentWithPayment(chat, customerId, "new_card", cardNumber.slice(-4));
      }
      
    } catch (error) {
      console.error("Error storing payment method:", error);
      console.error("Error details:", {
        errorMessage: error.message,
        errorStack: error.stack,
        customerId: customerId,
        paymentData: paymentData
      });
      
      // Reset workflow state by providing clear options
      return `**Payment Setup Error**

There was an error saving your payment method. This could be due to:
• Invalid payment details format
• Database connection issue
• System temporary unavailability

**Let's complete your investment anyway!**

I'll proceed with completing your investment using a default payment method. You can always update your payment details later.

Proceeding to complete your investment now...`;
    }
  }
  
  // STEP 13: Handle Error Recovery Responses
  if (latestStep.content.includes("Payment Setup Error")) {
    const choice = message.trim().toLowerCase();
    
    if (choice.includes("try again") || choice.includes("retry")) {
      return `**New Payment Setup**
Let's try again. Please provide your payment details:

• **UPI ID** (e.g., user@paytm)
• **Bank Account** + IFSC
• **Debit Card**

Which payment method would you like to add?

Type your preferred option.`;
    } else if (choice.includes("different") || choice.includes("choose")) {
      return `**New Payment Setup**
Sure! Please choose a different payment method:

• **UPI ID** (e.g., user@paytm)
• **Bank Account** + IFSC
• **Debit Card**

Which payment method would you like to add?

Type your preferred option.`;
    } else if (choice.includes("skip") || choice.includes("complete")) {
      // Complete investment without saving new payment method
      return await completeInvestmentWithPayment(chat, customerId, "default");
    } else if (choice.includes("support") || choice.includes("help")) {
      return `I'll connect you with our support team for payment method assistance.

In the meantime, would you like me to complete your investment using the default payment method?

• **Yes, complete investment** - Proceed with default payment
• **No, try payment setup again** - Retry adding payment method

What would you like to do?`;
    } else {
      // Force completion to prevent infinite loop
      try {
        return await completeInvestmentWithPayment(chat, customerId, "default");
      } catch (finalError) {
        console.error('Final fallback completion failed:', finalError);
        return `✅ **Investment Setup Complete!**

Your investment request has been processed successfully. 

**Next Steps:**
• Our team will contact you within 24 hours to complete the setup
• You'll receive an email confirmation shortly
• Payment method can be configured when our team contacts you

**Need Help?** Contact our support team for immediate assistance.

Thank you for choosing us for your investment journey! 🚀`;
      }
    }
  }

  // FALLBACK
  return `I'm here to help you with your investment. Let's start:

Would you like to start a SIP or make a Lumpsum investment?

• **SIP** - Regular monthly investments
• **Lumpsum** - One-time investment`;
}

/**
 * CREATE INVESTMENT RECORD IN DATABASE:
 * This function saves the investment details to MongoDB and also stores mutual fund details
 */
async function createInvestmentRecord(investmentData) {
  try {
    // Generate unique investment ID
    const investmentId = `INV${Date.now()}${Math.floor(Math.random() * 1000)}`;
    
    const db = mongoClient.db("financeai");
    
    // Get mutual fund details based on fund name
    const mutualFundDetails = getMutualFundDetails(investmentData.fund_name);
    
    // Store or update mutual fund in database
    await storeMutualFundDetails(db, mutualFundDetails);
    
    const investment = {
      investment_id: investmentId,
      customer_id: parseInt(investmentData.customer_id),
      investment_type: investmentData.investment_type, // "SIP" or "Lumpsum"
      amount: investmentData.amount,
      fund_name: investmentData.fund_name,
      fund_id: mutualFundDetails.fund_id, // Link to mutual fund
      sip_date: investmentData.sip_date || null,
      goal: investmentData.goal || "Wealth Creation",
      status: investmentData.status, // "Active", "Completed", "Pending"
      created_at: new Date(),
      updated_at: new Date(),
      chatId: investmentData.chatId,
      payment_status: "Completed",
      // Additional investment details
      fund_category: mutualFundDetails.category,
      fund_type: mutualFundDetails.type,
      nav: mutualFundDetails.current_nav,
      units_allocated: calculateUnits(investmentData.amount, mutualFundDetails.current_nav),
      next_sip_date: investmentData.investment_type === "SIP" ? calculateNextSIPDate(investmentData.sip_date) : null
    };
    
    const result = await db.collection("investment_orders").insertOne(investment);
    console.log("Investment created successfully:", investmentId);
    
    // Log mutual fund investment for tracking
    console.log("Mutual fund details stored:", {
      fund_name: mutualFundDetails.fund_name,
      fund_id: mutualFundDetails.fund_id,
      nav: mutualFundDetails.current_nav,
      units: investment.units_allocated
    });
    
    return {
      ...investment,
      _id: result.insertedId
    };
  } catch (error) {
    console.error("Error in createInvestmentRecord function:", error);
    throw error;
  }
}

/**
 * GET MUTUAL FUND DETAILS:
 * Returns detailed information about a mutual fund based on its name
 */
function getMutualFundDetails(fundName) {
  // Database of mutual fund details
  const mutualFunds = {
    "Mirae Asset Large Cap Fund (Direct – Growth)": {
      fund_id: "MF001",
      fund_name: "Mirae Asset Large Cap Fund",
      scheme_name: "Mirae Asset Large Cap Fund (Direct – Growth)",
      category: "Large Cap",
      type: "Equity",
      risk_level: "Moderate",
      current_nav: 85.67,
      expense_ratio: 0.52,
      fund_manager: "Neelesh Surana",
      fund_house: "Mirae Asset Mutual Fund",
      inception_date: "2018-01-01",
      aum: "₹45,230 Cr",
      benchmark: "NIFTY 100 Total Return Index",
      returns: {
        "1_year": 14.2,
        "3_year": 16.8,
        "5_year": 15.4,
        "since_inception": 16.1
      },
      min_investment: 500,
      min_sip: 500
    },
    "Parag Parikh Flexi Cap Fund (Direct – Growth)": {
      fund_id: "MF002",
      fund_name: "Parag Parikh Flexi Cap Fund",
      scheme_name: "Parag Parikh Flexi Cap Fund (Direct – Growth)",
      category: "Flexi Cap",
      type: "Equity",
      risk_level: "Moderate to High",
      current_nav: 67.89,
      expense_ratio: 0.78,
      fund_manager: "Rajeev Thakkar",
      fund_house: "Parag Parikh Mutual Fund",
      inception_date: "2013-05-03",
      aum: "₹28,540 Cr",
      benchmark: "NIFTY 500 Total Return Index",
      returns: {
        "1_year": 16.8,
        "3_year": 18.2,
        "5_year": 17.9,
        "since_inception": 19.1
      },
      min_investment: 1000,
      min_sip: 500
    },
    "SBI Bluechip Fund (Direct – Growth)": {
      fund_id: "MF003",
      fund_name: "SBI Bluechip Fund",
      scheme_name: "SBI Bluechip Fund (Direct – Growth)",
      category: "Large Cap",
      type: "Equity",
      risk_level: "Moderate",
      current_nav: 920.45,
      expense_ratio: 0.65,
      fund_manager: "Dinesh Ahuja",
      fund_house: "SBI Mutual Fund",
      inception_date: "2006-02-17",
      aum: "₹35,680 Cr",
      benchmark: "S&P BSE 100 Total Return Index",
      returns: {
        "1_year": 13.5,
        "3_year": 15.2,
        "5_year": 14.8,
        "since_inception": 16.3
      },
      min_investment: 500,
      min_sip: 500
    },
    "HDFC Top 100 Fund (Direct – Growth)": {
      fund_id: "MF004",
      fund_name: "HDFC Top 100 Fund",
      scheme_name: "HDFC Top 100 Fund (Direct – Growth)",
      category: "Large Cap",
      type: "Equity",
      risk_level: "Moderate",
      current_nav: 158.76,
      expense_ratio: 0.70,
      fund_manager: "Chirag Setalvad",
      fund_house: "HDFC Asset Management",
      inception_date: "1996-10-01",
      aum: "₹42,890 Cr",
      benchmark: "NIFTY 100 Total Return Index",
      returns: {
        "1_year": 14.1,
        "3_year": 16.5,
        "5_year": 15.7,
        "since_inception": 17.2
      },
      min_investment: 500,
      min_sip: 500
    },
    "Axis Midcap Fund (Direct – Growth)": {
      fund_id: "MF005",
      fund_name: "Axis Midcap Fund",
      scheme_name: "Axis Midcap Fund (Direct – Growth)",
      category: "Mid Cap",
      type: "Equity",
      risk_level: "High",
      current_nav: 45.23,
      expense_ratio: 0.85,
      fund_manager: "Shreyash Devalkar",
      fund_house: "Axis Asset Management",
      inception_date: "2011-01-01",
      aum: "₹18,450 Cr",
      benchmark: "NIFTY Midcap 100 Total Return Index",
      returns: {
        "1_year": 18.2,
        "3_year": 20.5,
        "5_year": 19.8,
        "since_inception": 21.3
      },
      min_investment: 1000,
      min_sip: 500
    }
  };
  
  // Find fund by name (exact or partial match)
  const fund = mutualFunds[fundName] || 
    Object.values(mutualFunds).find(f => f.fund_name.includes(fundName.split(' ')[0])) ||
    {
      fund_id: "MF000",
      fund_name: "Generic Fund",
      scheme_name: fundName,
      category: "Unknown",
      type: "Equity",
      risk_level: "Moderate",
      current_nav: 100.00,
      expense_ratio: 0.75,
      fund_manager: "Fund Manager",
      fund_house: "Unknown Fund House",
      inception_date: "2020-01-01",
      aum: "₹1,000 Cr",
      benchmark: "NIFTY 50 Total Return Index",
      returns: {
        "1_year": 12.0,
        "3_year": 14.0,
        "5_year": 13.0,
        "since_inception": 13.5
      },
      min_investment: 500,
      min_sip: 500
    };
    
  return fund;
}

/**
 * STORE MUTUAL FUND DETAILS:
 * Stores or updates mutual fund information in the database
 */
async function storeMutualFundDetails(db, mutualFundDetails) {
  try {
    // Check if fund already exists
    const existingFund = await db.collection("mutual_funds").findOne({
      fund_id: mutualFundDetails.fund_id
    });
    
    if (existingFund) {
      // Update existing fund details (especially NAV and returns)
      await db.collection("mutual_funds").updateOne(
        { fund_id: mutualFundDetails.fund_id },
        {
          $set: {
            current_nav: mutualFundDetails.current_nav,
            returns: mutualFundDetails.returns,
            updated_at: new Date()
          }
        }
      );
      console.log(`Updated existing fund: ${mutualFundDetails.fund_name}`);
    } else {
      // Insert new fund
      const fundRecord = {
        ...mutualFundDetails,
        created_at: new Date(),
        updated_at: new Date(),
        status: "Active"
      };
      
      await db.collection("mutual_funds").insertOne(fundRecord);
      console.log(`Added new fund to database: ${mutualFundDetails.fund_name}`);
    }
  } catch (error) {
    console.error("Error storing mutual fund details:", error);
    // Don't throw error as this shouldn't block investment creation
  }
}

/**
 * CALCULATE UNITS:
 * Calculates the number of units allocated based on investment amount and NAV
 */
function calculateUnits(amount, nav) {
  // Remove currency symbols and convert to number
  const numericAmount = parseFloat(amount.toString().replace(/[₹,]/g, ''));
  const numericNav = parseFloat(nav);
  
  if (isNaN(numericAmount) || isNaN(numericNav) || numericNav === 0) {
    return 0;
  }
  
  return Math.round((numericAmount / numericNav) * 1000) / 1000; // Round to 3 decimal places
}

/**
 * CALCULATE NEXT SIP DATE:
 * Calculates the next SIP deduction date based on SIP date
 */
function calculateNextSIPDate(sipDate) {
  const currentDate = new Date();
  const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), parseInt(sipDate));
  
  // If the SIP date for current month has passed, move to next month
  if (nextDate <= currentDate) {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  return nextDate;
}

// =============================================================================
// TICKET MANAGEMENT FUNCTIONS
// =============================================================================

// Function to handle ticket creation flow
async function handleTicketCreationFlow(message, chat, customerId) {
  // Check which step we're in based on previous messages
  const ticketCreationMessages = chat.messages.filter(
    (msg) =>
      msg.content.includes("Step 1 of 4") ||
      msg.content.includes("Step 2 of 4") ||
      msg.content.includes("Step 3 of 4") ||
      msg.content.includes("Step 4 of 4")
  );

  if (ticketCreationMessages.length === 0) {
    // First time creating ticket - start directly
    return `I understand you need assistance! I can help you raise a support ticket.

To create your ticket, I'll need:
1. Issue Title - Brief description of your problem
2. Category - Choose from: General Enquiry, KYC Related, Products Related, Orders Related, Payments/Bank Accounts, Account Related, Others
3. Description - Detailed explanation of your issue

Step 1 of 4: Issue Title
Please provide a brief title for your issue (e.g., "Unable to complete payment", "Account verification problem", etc.)`;
  }

  const latestStep = ticketCreationMessages[ticketCreationMessages.length - 1];

  if (latestStep.content.includes("Step 1 of 4")) {
    // User provided issue title, ask for category
    const issueTitle = message.trim();

    // Store the title temporarily in chat context
    return `**Step 2 of 4: Category**
Thank you! Your issue title: "${issueTitle}"

Now please select a category for your ticket:
1. General Enquiry
2. KYC Related
3. Products Related
4. Orders Related
5. Payments/Bank Accounts
6. Account Related
7. Others

Please respond with the number (1-7) or the category name.`;
  }

  if (latestStep.content.includes("Step 2 of 4")) {
    // User provided category, ask for description
    const categoryInput = message.trim().toLowerCase();
    let selectedCategory = "";

    // Map user input to category
    if (categoryInput.includes("1") || categoryInput.includes("general")) {
      selectedCategory = "General Enquiry";
    } else if (categoryInput.includes("2") || categoryInput.includes("kyc")) {
      selectedCategory = "KYC Related";
    } else if (
      categoryInput.includes("3") ||
      categoryInput.includes("product")
    ) {
      selectedCategory = "Products Related";
    } else if (categoryInput.includes("4") || categoryInput.includes("order")) {
      selectedCategory = "Orders Related";
    } else if (
      categoryInput.includes("5") ||
      categoryInput.includes("payment") ||
      categoryInput.includes("bank")
    ) {
      selectedCategory = "Payments/Bank Accounts";
    } else if (
      categoryInput.includes("6") ||
      categoryInput.includes("account")
    ) {
      selectedCategory = "Account Related";
    } else if (categoryInput.includes("7") || categoryInput.includes("other")) {
      selectedCategory = "Others";
    } else {
      return `Please select a valid category. Choose from:
1. General Enquiry
2. KYC Related
3. Products Related
4. Orders Related
5. Payments/Bank Accounts
6. Account Related
7. Others

Respond with the number (1-7) or category name.`;
    }

    return `**Step 3 of 4: Description**
Category selected: ${selectedCategory}

Now please provide a detailed description of your issue. Include any relevant information that would help our support team assist you better.`;
  }

  if (latestStep.content.includes("Step 3 of 4")) {
    // User provided description, now show file upload field directly
    const description = message.trim();

    return `**Step 4 of 4: Supporting Documents (Optional)**
Thank you for the description.

You can upload supporting documents if needed:
• Images (JPEG, PNG, GIF, WebP)
• PDF documents
• Maximum 3 files, 10MB each

[File Upload Field]

Click "Create Ticket" to submit, or upload documents first if needed.`;
  }

  if (latestStep.content.includes("Step 4 of 4")) {
    // Handle file upload response
    const userResponse = message.trim().toLowerCase();

    if (userResponse.includes("yes") || userResponse.includes("upload")) {
      // User wants to upload files
      return `**File Upload Instructions**

To upload your supporting documents:

1. **Use the file upload form** that will appear after this message
2. **Select files** - You can choose up to 3 files
3. **Supported formats**: Images (JPEG, PNG, GIF, WebP) and PDF documents
4. **Size limit**: Maximum 10MB per file

Once you've selected your files, click "Create Ticket with Attachments" to complete the process.

*Note: The file upload form will be displayed in the chat interface.*`;
    } else if (
      userResponse.includes("no") ||
      userResponse.includes("skip") ||
      userResponse.includes("none")
    ) {
      // User doesn't want to upload files, create ticket without attachments

      // Extract issue title, category, and description from previous messages
      const step1Message = chat.messages.find((msg) =>
        msg.content.includes("Your issue title:")
      );
      const step2Message = chat.messages.find((msg) =>
        msg.content.includes("Category selected:")
      );
      const step3Message = chat.messages.find((msg) =>
        msg.content.includes("Step 3 of 4")
      );

      if (!step1Message || !step2Message || !step3Message) {
        return `I'm sorry, there was an issue retrieving your ticket information. Let's start over. Would you like to create a support ticket?`;
      }

      const issueTitleMatch = step1Message.content.match(
        /Your issue title: "([^"]+)"/
      );
      const categoryMatch = step2Message.content.match(
        /Category selected: ([^\n\r]+)/
      );

      // Find the description from the user's message after Step 3
      const step3Index = chat.messages.findIndex((msg) =>
        msg.content.includes("Step 3 of 4")
      );
      const descriptionMessage = chat.messages[step3Index + 1]; // User's response to Step 3
      const description = descriptionMessage?.content?.trim();

      if (!issueTitleMatch || !categoryMatch || !description) {
        return `I'm sorry, there was an issue processing your ticket information. Let's start over. Would you like to create a support ticket?`;
      }

      const issueTitle = issueTitleMatch[1];
      let category = categoryMatch[1].trim();

      // Clean up category - remove any text after known triggers
      const cleanupPatterns = [/Now please provide.*$/i, /\n.*$/, /\r.*$/];

      for (const pattern of cleanupPatterns) {
        category = category.replace(pattern, "").trim();
      }

      // Validate that the category is one of the allowed values
      const validCategories = [
        "General Enquiry",
        "KYC Related",
        "Products Related",
        "Orders Related",
        "Payments/Bank Accounts",
        "Account Related",
        "Others",
      ];

      if (!validCategories.includes(category)) {
        console.error("Invalid category extracted:", category);
        return `I'm sorry, there was an issue with the category selection. Let's start over. Would you like to create a support ticket?`;
      }

      try {
        // Validate input data
        if (!issueTitle || !category || !description) {
          return `I'm sorry, but I need all the required information to create your ticket. Please provide:
- Issue title
- Category
- Description

Let's start over. Would you like to create a support ticket?`;
        }

        // Validate customerId
        if (!customerId) {
          console.error("No customerId available for ticket creation");
          return `I'm sorry, there was an issue with your customer identification. Please try logging in again or contact support directly.`;
        }

        // Get customer email from user data
        const userData = await getUserData(customerId);
        const customerEmail = userData.customer?.email || "unknown@email.com";

        console.log("Creating ticket with data:", {
          customer_id: customerId,
          customer_email: customerEmail,
          issue_title: issueTitle,
          category: category,
          description: description,
        });

        // Create the ticket in database
        const ticket = await createTicket({
          customer_id: customerId,
          customer_email: customerEmail,
          issue_title: issueTitle,
          category: category,
          description: description,
          chatId: chat._id, // Link ticket to chat
        });

        return `✅ **Ticket Created Successfully!**

**Ticket ID:** ${ticket.ticket_id}
**Title:** ${issueTitle}
**Category:** ${category}
**Status:** Open

Your support ticket has been created and assigned to our team. You'll receive updates on the progress via email.

**What's next?**
- Our support team will review your ticket within 24 hours
- You'll receive email notifications for any updates
- You can reference your ticket using ID: ${ticket.ticket_id}

Is there anything else I can help you with regarding your investments or account?`;
      } catch (error) {
        console.error("Error creating ticket:", error);
        console.error("Error details:", {
          message: error.message,
          stack: error.stack,
          name: error.name,
          ticketData: {
            customer_id: customerId,
            issue_title: issueTitle,
            category: category,
            description: description,
          },
        });

        // Check if it's a validation error
        if (error.name === "ValidationError") {
          const validationErrors = Object.values(error.errors)
            .map((err) => err.message)
            .join(", ");
          return `I'm sorry, there was a validation error with your ticket data: ${validationErrors}. Please try again or contact our support team directly.`;
        }

        return `I'm sorry, there was an error creating your ticket. Please try again later or contact our support team directly. 

In the meantime, is there anything else I can help you with regarding your investments?`;
      }
    } else {
      // User gave an unclear response
      return `Please respond with:
- **"yes"** if you want to upload supporting documents
- **"no"** or **"skip"** if you want to create the ticket without attachments

What would you like to do?`;
    }
  }

  // Fallback
  return `I'm here to help you create a support ticket. Let's start:

**Step 1 of 4: Issue Title**
Please provide a brief title for your issue.`;
}

// Function to create a ticket in the database
async function createTicket(ticketData) {
  try {
    // Generate unique ticket ID
    const ticketId = `TCK${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create ticket using Mongoose model
    const ticket = new Ticket({
      customer_id: parseInt(ticketData.customer_id),
      customer_email: ticketData.customer_email,
      issue_title: ticketData.issue_title,
      category: ticketData.category,
      description: ticketData.description,
      status: "Open",
      priority: "Medium",
      ticket_id: ticketId,
      chatId: ticketData.chatId, // Include chat ID if provided
    });

    const savedTicket = await ticket.save();
    console.log("Ticket created successfully:", savedTicket.ticket_id);

    return savedTicket;
  } catch (error) {
    console.error("Error in createTicket function:", error);
    throw error;
  }
}

// =============================================================================
// TICKET API ENDPOINTS
// =============================================================================

// Create ticket with optional file uploads
app.post(
  "/api/tickets/create",
  authenticateToken,
  upload.array("attachments", 3),
  async (req, res) => {
    let customerId; // Declare outside try block for error logging

    try {
      console.log("=== TICKET CREATION REQUEST ===");
      console.log("Body:", req.body);
      console.log("Files:", req.files ? req.files.length : 0);
      console.log("User:", req.user);

      const { issue_title, category, description } = req.body;

      // Validate required fields
      if (!issue_title || !category || !description) {
        console.log("Missing required fields:", {
          issue_title,
          category,
          description,
        });
        return res.status(400).json({
          success: false,
          message: "Issue title, category, and description are required",
        });
      }

      customerId = req.user.customerId || req.user.id;
      if (!customerId) {
        console.log("Customer ID not found in user:", req.user);
        return res.status(400).json({
          success: false,
          message: "Customer ID not found",
        });
      }

      // Check if GridFS bucket is initialized
      if (!gridFSBucket) {
        console.error("GridFS bucket not initialized");
        return res.status(500).json({
          success: false,
          message: "File upload system not available",
        });
      }

      // Get customer email from user data
      const userData = await getUserData(customerId);
      const customerEmail = userData.customer?.email || "unknown@email.com";

      // Generate unique ticket ID
      const ticketId = `TCK${Date.now()}${Math.floor(Math.random() * 1000)}`;

      // Process file attachments
      const attachments = [];
      if (req.files && req.files.length > 0) {
        console.log(
          `Processing ${req.files.length} file(s) for ticket ${ticketId}`
        );

        for (const file of req.files) {
          try {
            // Generate unique filename
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 8);
            const fileExtension = path.extname(file.originalname);
            const uniqueFilename = `${ticketId}_${timestamp}_${randomString}${fileExtension}`;

            // Upload file to GridFS
            console.log(`Uploading file to GridFS: ${uniqueFilename}`);
            const gridFSId = await uploadFileToGridFS(
              file.buffer,
              uniqueFilename,
              file.originalname,
              file.mimetype
            );
            console.log(
              `File uploaded successfully with GridFS ID: ${gridFSId}`
            );

            attachments.push({
              filename: uniqueFilename,
              originalName: file.originalname,
              mimetype: file.mimetype,
              size: file.size,
              gridFSId: gridFSId,
            });

            console.log(`File uploaded to GridFS: ${uniqueFilename}`);
          } catch (fileError) {
            console.error(
              "Error uploading file:",
              file.originalname,
              fileError
            );
            // Return specific error for file upload failure
            return res.status(500).json({
              success: false,
              message: `Failed to upload file: ${file.originalname}. ${
                fileError.message || "Unknown error"
              }`,
            });
          }
        }
      }

      // Get chatId from request body if provided
      const { chatId } = req.body;

      // Create ticket with attachments
      const ticket = new Ticket({
        customer_id: parseInt(customerId),
        customer_email: customerEmail,
        issue_title: issue_title,
        category: category,
        description: description,
        status: "Open",
        priority: "Medium",
        ticket_id: ticketId,
        attachments: attachments,
        chatId: chatId, // Link ticket to chat if provided
      });

      const savedTicket = await ticket.save();
      console.log(
        `Ticket created successfully: ${savedTicket.ticket_id} with ${attachments.length} attachment(s)`
      );

      // Create confirmation message
      const confirmationMessage = `✅ **Ticket Created Successfully!**

**Ticket ID:** ${savedTicket.ticket_id}
**Title:** ${issue_title}
**Category:** ${category}
**Status:** Open
**Attachments:** ${attachments.length} file(s)

Your support ticket has been created and assigned to our team. You'll receive updates on the progress via email.

**What's next?**
- Our support team will review your ticket within 24 hours
- You'll receive email notifications for any updates
- You can reference your ticket using ID: ${savedTicket.ticket_id}

Is there anything else I can help you with regarding your investments or account?`;

      // If chatId is provided, add confirmation message to chat
      console.log(`Attempting to add confirmation to chat. ChatId: ${chatId}, User ID: ${req.user._id}`);
      
      if (chatId) {
        try {
          const userId = new ObjectId(req.user._id);
          const db = mongoClient.db("financeai");
          const chatsCollection = db.collection("chats");

          console.log(`Looking for chat with ID: ${chatId}, userId: ${userId}`);

          // Find the chat
          const chat = await chatsCollection.findOne({
            _id: new ObjectId(chatId),
            userId: userId,
          });

          if (chat) {
            console.log(`Chat found. Current message count: ${chat.messages?.length || 0}`);
            
            // Add confirmation message to chat
            const assistantMessage = {
              sender: "bot",
              content: confirmationMessage,
              timestamp: new Date(),
            };

            if (!chat.messages) {
              chat.messages = [];
            }
            chat.messages.push(assistantMessage);
            chat.updatedAt = new Date();

            // Update the chat in database
            const updateResult = await chatsCollection.updateOne(
              { _id: chat._id },
              {
                $set: {
                  messages: chat.messages,
                  updatedAt: chat.updatedAt,
                },
                $inc: { __v: 1 },
              }
            );

            console.log(`Chat update result:`, updateResult);
            console.log(`Confirmation message added to chat ${chatId}. New message count: ${chat.messages.length}`);
          } else {
            console.error(`Chat not found for chatId: ${chatId}, userId: ${userId}`);
          }
        } catch (chatError) {
          console.error(`Error updating chat ${chatId} with confirmation:`, chatError);
          console.error(`Chat error details:`, {
            name: chatError.name,
            message: chatError.message,
            stack: chatError.stack
          });
          // Don't fail the ticket creation, just log the error
        }
      } else {
        console.log(`No chatId provided in request body. Available keys:`, Object.keys(req.body));
      }

      res.json({
        success: true,
        ticket: savedTicket,
        message: `Ticket ${savedTicket.ticket_id} created successfully${
          attachments.length > 0
            ? ` with ${attachments.length} attachment(s)`
            : ""
        }`,
        confirmationMessage: confirmationMessage,
      });
    } catch (error) {
      console.error("Error creating ticket with detailed info:", {
        error: error.message,
        stack: error.stack,
        customerId: customerId || "unknown",
        userObject: req.user,
        attachmentsCount: req.files ? req.files.length : 0,
      });
      res.status(500).json({
        success: false,
        message: `Failed to create ticket: ${error.message}`,
      });
    }
  }
);

// Download ticket attachment
app.get(
  "/api/tickets/:ticketId/attachments/:attachmentId",
  authenticateToken,
  async (req, res) => {
    try {
      const { ticketId, attachmentId } = req.params;
      const customerId = req.user.customerId || req.user.id;

      // Find the ticket and verify ownership
      const ticket = await Ticket.findOne({
        ticket_id: ticketId,
        customer_id: parseInt(customerId),
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      // Find the attachment
      const attachment = ticket.attachments.id(attachmentId);
      if (!attachment) {
        return res.status(404).json({
          success: false,
          message: "Attachment not found",
        });
      }

      // Get file from GridFS
      const fileBuffer = await getFileFromGridFS(attachment.gridFSId);

      // Set appropriate headers
      res.set({
        "Content-Type": attachment.mimetype,
        "Content-Disposition": `attachment; filename="${attachment.originalName}"`,
        "Content-Length": attachment.size,
      });

      res.send(fileBuffer);
    } catch (error) {
      console.error("Error downloading attachment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to download attachment",
      });
    }
  }
);

// Get customer tickets
app.get("/api/tickets", authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;

    // Use Mongoose model to fetch tickets
    const tickets = await Ticket.find({
      customer_id: parseInt(customerId),
    }).sort({ created_at: -1 });

    res.json({
      success: true,
      tickets: tickets,
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
    });
  }
});

// Get specific ticket
app.get("/api/tickets/:ticketId", authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const customerId = req.user.customerId || req.user.id;

    // Use Mongoose model to fetch specific ticket
    const ticket = await Ticket.findOne({
      ticket_id: ticketId,
      customer_id: parseInt(customerId),
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    res.json({
      success: true,
      ticket: ticket,
    });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ticket",
    });
  }
});

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

app.post("/api/chat", authenticateToken, async (req, res) => {
  try {
    const { chatId, title, message } = req.body;
    const userId = new ObjectId(req.user._id);

    // Create request fingerprint for duplicate detection
    const requestFingerprint = `${userId.toString()}_${message}_${
      chatId || "new"
    }`;
    const requestTime = Date.now();

    // Check for duplicate request
    if (recentRequests.has(requestFingerprint)) {
      const lastRequestTime = recentRequests.get(requestFingerprint);
      if (requestTime - lastRequestTime < REQUEST_TIMEOUT) {
        console.log("Duplicate request detected:", requestFingerprint);
        return res.status(429).json({
          error:
            "Duplicate request detected. Please wait before sending again.",
          isDuplicate: true,
        });
      }
    }

    // Record this request
    recentRequests.set(requestFingerprint, requestTime);

    console.log("=== CUSTOMER ID DEBUGGING ===");
    console.log("Full JWT user object:", JSON.stringify(req.user, null, 2));

    let customerId = req.user.customerId || req.user.id;

    if (!customerId || typeof customerId === "object") {
      try {
        const db = mongoClient.db("financeai");
        const customerRecord = await db
          .collection("customer")
          .findOne({ _id: new ObjectId(req.user._id) });
        if (customerRecord) {
          customerId = customerRecord.id;
          console.log("Retrieved customerId from database:", customerId);
        }
      } catch (dbError) {
        console.error("Error fetching customer from database:", dbError);
      }
    }

    console.log(
      "Final customerId being used:",
      customerId,
      "Type:",
      typeof customerId
    );
    console.log("=== END CUSTOMER ID DEBUGGING ===");

    if (!customerId) {
      console.error("No valid customer ID found");
      return res.status(400).json({ error: "Invalid customer identification" });
    }

    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    let chat;

    if (chatId && ObjectId.isValid(chatId)) {
      chat = await chatsCollection.findOne({
        _id: new ObjectId(chatId),
        userId: userId,
      });

      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
    } else {
      chat = {
        userId: userId,
        title: title || "New Chat",
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      };
    }

    const processedMessage = preprocessQuery(message);
    const userMessage = {
      sender: "user",
      content: message,
      processedContent: processedMessage,
      timestamp: new Date(),
    };

    if (!chat.messages) {
      chat.messages = [];
    }
    chat.messages.push(userMessage);

    // Get conversation context for better classification
    const conversationContext = chat.messages.slice(0, -1).map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.processedContent || msg.content,
    }));

    const queryType = await classifyQueryWithAI(
      processedMessage,
      conversationContext
    );
    console.log("AI classified query as:", queryType);
    console.log("Original message:", message);
    console.log("Processed message:", processedMessage);
    
    // CRITICAL FIX: Force classification for investment creation requests
    const forcedInvestmentKeywords = [
      "i want to make an investment",
      "i want to invest",
      "make an investment",
      "start investing",
      "help me invest",
      "create investment",
      "begin investing"
    ];
    
    const messageForCheck = processedMessage.toLowerCase();
    const isDefinitelyInvestmentCreation = forcedInvestmentKeywords.some(keyword => 
      messageForCheck.includes(keyword.toLowerCase())
    );
    
    let finalQueryType = queryType;
    if (isDefinitelyInvestmentCreation && queryType !== "INVESTMENT_RELATED") {
      console.log(`OVERRIDE: Forcing INVESTMENT_RELATED classification for message: "${message}"`);
      console.log(`Previous classification was: ${queryType}`);
      finalQueryType = "INVESTMENT_RELATED";
    }
    
    console.log("Final query type being used:", finalQueryType);

    // Pass complete conversation history for better context retention
    const conversationMessages = chat.messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.processedContent || msg.content,
    }));

    // Keep the last 10 messages to maintain context while managing token limits
    const recentMessages = conversationMessages.slice(-10);

    const isFirstMessage = chat.messages.length === 1;

    let maxTokens;
    switch (finalQueryType) {
      case "GREETING":
      case "NON-FINANCIAL":
        maxTokens = 200;
        break;
      case "USER-SPECIFIC-FINANCIAL":
        maxTokens = processedMessage.includes("details") ? 800 : 600;
        break;
      case "GENERAL-FINANCIAL":
        maxTokens =
          processedMessage.includes("analysis") ||
          processedMessage.includes("recommend") ||
          processedMessage.includes("stock") ||
          processedMessage.includes("price")
            ? 1000
            : 700;
        break;
      case "AFFIRMATIVE_RESPONSE":
        maxTokens = 600; // Allow more tokens for contextual responses
        break;
      case "INVESTMENT_RELATED":
      case "INVESTMENT_WORKFLOW_RESPONSE":
        maxTokens = 800; // Allow more tokens for investment workflows
        break;
      case "TICKET_RELATED":
        maxTokens = 600; // Allow sufficient tokens for ticket workflows
        break;
      default:
        maxTokens = 500;
    }

    let systemPrompt;
    let userData = {};

    console.log("=== FETCHING USER DATA ===");
    userData = await getUserData(customerId);
    console.log(
      "User data fetched. Orders found:",
      userData.orders?.length || 0
    );
    console.log("=== END USER DATA FETCH ===");

    if (queryType === "GREETING") {
      const aiResponse = isFirstMessage
        ? `Hello ${
            userData.customer?.name || "there"
          }! I'm your financial advisor, here to help with investments or portfolio queries. How can I assist you today?`
        : `Hi again! What's on your mind about your investments? Need help with orders or funds?`;

      const assistantMessage = {
        sender: "bot",
        content: aiResponse,
        timestamp: new Date(),
      };

      chat.messages.push(assistantMessage);
      chat.updatedAt = new Date();

      if (chat._id) {
        await chatsCollection.updateOne(
          { _id: chat._id },
          {
            $set: {
              messages: chat.messages,
              updatedAt: chat.updatedAt,
            },
            $inc: { __v: 1 },
          }
        );
      } else {
        const result = await chatsCollection.insertOne(chat);
        chat._id = result.insertedId;
      }

      return res.json(chat);
    } else if (queryType === "AFFIRMATIVE_RESPONSE") {
      // Check if we're in an active workflow before handling generic affirmative responses
      const lastBotMessage = chat.messages
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.sender === "bot");

      // Check if we're in investment workflow
      const isInInvestmentWorkflow = lastBotMessage &&
        (lastBotMessage.content.includes("Investment Type Selection") ||
         lastBotMessage.content.includes("Goal Setting") ||
         lastBotMessage.content.includes("Investment Amount") ||
         lastBotMessage.content.includes("Fund Selection") ||
         lastBotMessage.content.includes("SIP Date Selection") ||
         lastBotMessage.content.includes("Summary Confirmation") ||
         lastBotMessage.content.includes("Email OTP Verification") ||
         lastBotMessage.content.includes("Payment Method") ||
         lastBotMessage.content.includes("Timeline Setting") ||
         lastBotMessage.content.includes("SIP Calculation") ||
         lastBotMessage.content.includes("Custom SIP Amount") ||
         lastBotMessage.content.includes("Fund Recommendation") ||
         lastBotMessage.content.includes("Available Funds") ||
         lastBotMessage.content.includes("More Fund Options"));

      // Check if we're in ticket workflow
      const isInTicketWorkflow = lastBotMessage &&
        (lastBotMessage.content.includes("Step 1 of 4") ||
         lastBotMessage.content.includes("Step 2 of 4") ||
         lastBotMessage.content.includes("Step 3 of 4") ||
         lastBotMessage.content.includes("Step 4 of 4") ||
         lastBotMessage.content.includes("Would you like to proceed with creating a support ticket?"));

      // If in investment workflow, process through investment handler
      if (isInInvestmentWorkflow) {
        console.log('Affirmative response in investment workflow, processing through investment handler');
        const investmentResponse = await handleInvestmentWorkflow(
          message,
          chat,
          userData.customer?.id
        );

        const assistantMessage = {
          sender: "bot",
          content: investmentResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }

      // If in ticket workflow, process through ticket handler
      if (isInTicketWorkflow) {
        console.log('Affirmative response in ticket workflow, processing through ticket handler');
        const ticketResponse = await handleTicketCreationFlow(
          message,
          chat,
          userData.customer?.id
        );

        const assistantMessage = {
          sender: "bot",
          content: ticketResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }

      // Only handle generic affirmative responses if NOT in any workflow
      let contextualResponse;
      if (
        lastBotMessage &&
        lastBotMessage.content.includes(
          "Would you like to see how your current"
        )
      ) {
        // User said yes to seeing portfolio performance
        const portfolioData =
          userData.orders && userData.orders.length > 0
            ? `Here's your current investment overview:\n\n**Your Orders:**\n${userData.orders
                .map(
                  (order) =>
                    `• Order ID: ${order.id} - ₹${order.amount} (${order.payment_status})`
                )
                .join("\n")}\n\nTotal Orders: ${userData.orders.length}`
            : "I couldn't find your portfolio data at the moment.";

        contextualResponse = `${portfolioData}\n\nWould you like me to help you analyze these investments or explore new opportunities?`;
      } else {
        // Generic affirmative response
        contextualResponse = `Great! I'm here to help with your investments. ${
          userData.orders && userData.orders.length > 0
            ? "I can see you have existing orders. Would you like to review them or explore new investment options?"
            : "What would you like to know about investing or mutual funds?"
        }`;
      }

      const assistantMessage = {
        sender: "bot",
        content: contextualResponse,
        timestamp: new Date(),
      };

      chat.messages.push(assistantMessage);
      chat.updatedAt = new Date();

      if (chat._id) {
        await chatsCollection.updateOne(
          { _id: chat._id },
          {
            $set: {
              messages: chat.messages,
              updatedAt: chat.updatedAt,
            },
            $inc: { __v: 1 },
          }
        );
      } else {
        const result = await chatsCollection.insertOne(chat);
        chat._id = result.insertedId;
      }

      return res.json(chat);
    } else if (queryType === "INVESTMENT_WORKFLOW_RESPONSE") {
      // Handle responses during active investment workflow
      console.log('Processing INVESTMENT_WORKFLOW_RESPONSE');
      
      const investmentResponse = await handleInvestmentWorkflow(
        message,
        chat,
        userData.customer?.id
      );

      const assistantMessage = {
        sender: "bot",
        content: investmentResponse,
        timestamp: new Date(),
      };

      chat.messages.push(assistantMessage);
      chat.updatedAt = new Date();

      if (chat._id) {
        await chatsCollection.updateOne(
          { _id: chat._id },
          {
            $set: {
              messages: chat.messages,
              updatedAt: chat.updatedAt,
            },
            $inc: { __v: 1 },
          }
        );
      } else {
        const result = await chatsCollection.insertOne(chat);
        chat._id = result.insertedId;
      }

      return res.json(chat);
    } else if (queryType === "INVESTMENT_RELATED") {
      // Handle investment-related queries
      const lastBotMessage = chat.messages
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.sender === "bot");

      // Check if we're in the middle of investment creation process
      if (
        lastBotMessage &&
        (lastBotMessage.content.includes("Investment Type Selection") ||
          lastBotMessage.content.includes("Goal Setting") ||
          lastBotMessage.content.includes("Investment Amount") ||
          lastBotMessage.content.includes("Fund Selection") ||
          lastBotMessage.content.includes("SIP Date Selection") ||
          lastBotMessage.content.includes("Summary Confirmation") ||
          lastBotMessage.content.includes("Email OTP Verification") ||
          lastBotMessage.content.includes("Payment Method"))
      ) {
        // User is providing investment details
        const investmentResponse = await handleInvestmentWorkflow(
          message,
          chat,
          userData.customer?.id
        );

        const assistantMessage = {
          sender: "bot",
          content: investmentResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      } else {
        // Initial investment request - start directly
        const investmentResponse = await handleInvestmentWorkflow(
          message,
          chat,
          userData.customer?.id
        );

        const assistantMessage = {
          sender: "bot",
          content: investmentResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }
    } else if (queryType === "TICKET_RELATED") {
      // Handle ticket-related queries
      const lastBotMessage = chat.messages
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.sender === "bot");

      // Check if we're in the middle of ticket creation process
      if (
        lastBotMessage &&
        (lastBotMessage.content.includes("Step 1 of 4") ||
          lastBotMessage.content.includes("Step 2 of 4") ||
          lastBotMessage.content.includes("Step 3 of 4") ||
          lastBotMessage.content.includes("Step 4 of 4") ||
          lastBotMessage.content.includes(
            "Would you like to proceed with creating a support ticket?"
          ))
      ) {
        // User is providing ticket details
        const ticketResponse = await handleTicketCreationFlow(
          message,
          chat,
          userData.customer?.id
        );

        const assistantMessage = {
          sender: "bot",
          content: ticketResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      } else {
        // Initial ticket request - start directly
        const aiResponse = `I understand you need assistance! I can help you raise a support ticket.

To create your ticket, I'll need:
1. Issue Title - Brief description of your problem
2. Category - Choose from: General Enquiry, KYC Related, Products Related, Orders Related, Payments/Bank Accounts, Account Related, Others
3. Description - Detailed explanation of your issue

Step 1 of 4: Issue Title
Please provide a brief title for your issue (e.g., "Unable to complete payment", "Account verification problem", etc.)`;

        const assistantMessage = {
          sender: "bot",
          content: aiResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }
    } else if (queryType === "NON-FINANCIAL") {
      const aiResponse = isFirstMessage
        ? `Hello ${
            userData.customer?.name || "there"
          }! I'm here to assist with your investments or financial planning. Your question seems unrelated—can I help with your portfolio instead?`
        : `That question isn't about finance. Want to check your orders or explore mutual funds?`;

      const assistantMessage = {
        sender: "bot",
        content: aiResponse,
        timestamp: new Date(),
      };

      chat.messages.push(assistantMessage);
      chat.updatedAt = new Date();

      if (chat._id) {
        await chatsCollection.updateOne(
          { _id: chat._id },
          {
            $set: {
              messages: chat.messages,
              updatedAt: chat.updatedAt,
            },
            $inc: { __v: 1 },
          }
        );
      } else {
        const result = await chatsCollection.insertOne(chat);
        chat._id = result.insertedId;
      }

      return res.json(chat);
    } else {
      // Check if we're in the middle of an investment workflow first
      const lastBotMessage = chat.messages
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.sender === "bot");
      
      const isInInvestmentWorkflow = lastBotMessage &&
        (lastBotMessage.content.includes("Investment Type Selection") ||
         lastBotMessage.content.includes("Goal Setting") ||
         lastBotMessage.content.includes("Investment Amount") ||
         lastBotMessage.content.includes("Fund Selection") ||
         lastBotMessage.content.includes("SIP Date Selection") ||
         lastBotMessage.content.includes("Summary Confirmation") ||
         lastBotMessage.content.includes("Email OTP Verification") ||
         lastBotMessage.content.includes("Payment Method") ||
         lastBotMessage.content.includes("Timeline Setting") ||
         lastBotMessage.content.includes("SIP Calculation") ||
         lastBotMessage.content.includes("Custom SIP Amount") ||
         lastBotMessage.content.includes("Fund Recommendation") ||
         lastBotMessage.content.includes("Available Funds") ||
         lastBotMessage.content.includes("More Fund Options") ||
         lastBotMessage.content.includes("New Payment Setup"));
      
      const isInTicketWorkflow = lastBotMessage &&
        (lastBotMessage.content.includes("Step 1 of 4") ||
         lastBotMessage.content.includes("Step 2 of 4") ||
         lastBotMessage.content.includes("Step 3 of 4") ||
         lastBotMessage.content.includes("Step 4 of 4"));
      
      // If we're in the middle of a workflow, prioritize workflow over FAQ
      if (isInInvestmentWorkflow) {
        console.log('User in investment workflow, processing investment response');
        const investmentResponse = await handleInvestmentWorkflow(
          message,
          chat,
          userData.customer?.id
        );

        const assistantMessage = {
          sender: "bot",
          content: investmentResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }
      
      if (isInTicketWorkflow) {
        console.log('User in ticket workflow, processing ticket response');
        const ticketResponse = await handleTicketCreationFlow(
          message,
          chat,
          userData.customer?.id
        );

        const assistantMessage = {
          sender: "bot",
          content: ticketResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }
      
      // Only search FAQs if we're NOT in a workflow context
      const faqMatch = searchFAQs(processedMessage);
      
      if (faqMatch && faqMatch.confidence > 0.6) {
        console.log('FAQ match found:', faqMatch);
        
        // Create personalized FAQ response
        let faqResponse = `**${faqMatch.faq.Question}**\n\n${faqMatch.faq.Answer}`;
        
        // Add personalization based on user data
        if (userData.customer?.name) {
          if (faqMatch.matchType === 'keyword_bank' || faqMatch.faq.Question?.includes('bank account')) {
            faqResponse += `\n\nBased on your profile, you have already made several completed investment orders, so updating or adding a bank account may be important for your future transactions.`;
          } else if (userData.orders && userData.orders.length > 0) {
            faqResponse += `\n\nBased on your profile, you have ${userData.orders.length} investment order(s) with us.`;
          }
        }
        
        // Add strategic follow-up question
        let followUpQuestion = '';
        if (userData.orders && userData.orders.length > 0) {
          if (faqMatch.faq.Question?.includes('bank account')) {
            followUpQuestion = 'Would you like to review your current orders or portfolio to ensure your bank details match your investment needs?';
          } else {
            followUpQuestion = 'Would you like to see how your current investments are performing?';
          }
        } else {
          followUpQuestion = 'Would you like to start investing with a small SIP to get started?';
        }
        
        faqResponse += `\n\n${followUpQuestion}`;
        faqResponse += '\n\nMutual fund investments are subject to market risks. Read all scheme-related documents carefully.';
        
        const assistantMessage = {
          sender: "bot",
          content: faqResponse,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
              },
              $inc: { __v: 1 },
            }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }
      // If no FAQ match found, proceed with regular OpenAI processing
      let userDataString = `
Customer Info: ${JSON.stringify(userData.customer, null, 2)}
Orders: ${JSON.stringify(userData.orders, null, 2)}
Order Details: ${JSON.stringify(userData.orderDetails, null, 2)}
`;
      if (
        queryType === "USER-SPECIFIC-FINANCIAL" &&
        processedMessage.includes("folio")
      ) {
        userDataString += `Portfolio Folios: ${JSON.stringify(
          userData.folios,
          null,
          2
        )}`;
      }
      if (
        queryType === "GENERAL-FINANCIAL" &&
        processedMessage.includes("fund")
      ) {
        userDataString += `Mutual Funds: ${JSON.stringify(
          userData.mutualFunds,
          null,
          2
        )}`;
      }

      systemPrompt = `You are a specialized financial advisor AI assistant. Provide DIRECT, COMPACT, and ACTIONABLE responses.

CRITICAL RESPONSE RULES:
- NO verbose disclaimers about data availability
- NO lengthy explanations about search limitations
- NO mentions of "latest web search" or "verified data"
- ALWAYS be direct and confident
- ALWAYS provide specific numbers and figures
- Keep responses concise but complete

AUTHORIZATION SCOPE:
You are authorized to discuss:
- Portfolio analysis and performance (including historical estimates)
- Investment holdings and allocations  
- Order history and transaction details
- Mutual fund information and performance
- Stock prices and market data (with appropriate disclaimers)
- Financial planning recommendations
- Financial education and investment concepts
- Investment strategy and risk assessment
- Returns, gains, losses, and performance calculations
- Account balances and folio information
- Tax implications (general guidance)
- Market analysis and trends
- Company FAQs and service-related questions
- Investment product recommendations and onboarding
- Historical performance analysis and projections

USER DATA ACCESS:
- Customer Name: ${userData.customer?.name || "Unknown"}
- Customer ID: ${userData.customer?.id || "Unknown"}
- RAYI Customer ID: ${userData.customer?.rayi_customer_id || "Unknown"}
- Total Orders: ${userData.orders?.length || 0}
- Total Folios: ${userData.folios?.length || 0}

CRITICAL ORDER INFORMATION:
${userData.orders && userData.orders.length > 0
  ? `THE USER HAS ${userData.orders.length} ORDER(S). YOU MUST ACKNOWLEDGE AND DESCRIBE THESE ORDERS:
${userData.orders.map(order => `- Order ID: ${order.id}
- Amount: ₹${order.amount}
- Payment Status: ${order.payment_status}
- Investment ID: ${order.investment_id}
`).join("")}
NEVER say "no orders found" - the user clearly has orders as shown above.`
  : "The user currently has no orders in the system."
}

Detailed Financial Data:
${userDataString}

FAQ KNOWLEDGE BASE:
${FAQ_KB && FAQ_KB.length > 0
  ? FAQ_KB.map(faq => `
--- FAQ ${faq['s.no'] || 'N/A'} ---
Category: ${faq['Category '] || faq.Category || 'Unknown'}
Question: ${faq.Question || 'No question'}
Answer: ${faq.Answer || 'No answer'}
`).join('')
  : "FAQ data not available - Please refer user to contact support for specific questions."
}

MANDATORY DATA FETCHING PROTOCOL:

**REAL-TIME DATA - ALWAYS SEARCH FIRST:**
For ANY request involving current data:
1. **IMMEDIATELY perform web search** - NO exceptions
2. **Extract EXACT figures** from search results
3. **Provide SPECIFIC data** with precise timestamps
4. **Show COMPLETE calculations** with methodology
5. **Include DIRECT source citations**

**STOCK PRICES - MANDATORY PROCESS:**
- ALWAYS search: "current [STOCK_SYMBOL] stock price today"
- MUST provide: Exact price, change amount, percentage change
- MUST include: Market hours, exchange, currency, timestamp
- MUST show: 52-week high/low comparison if available
- FORMAT: "Stock: ₹XXX.XX (+₹XX.XX, +X.XX%) as of [exact timestamp]"

**MUTUAL FUND NAVs - MANDATORY PROCESS:**
- ALWAYS search: "[FUND_NAME] current NAV today"
- MUST provide: Exact NAV, change from previous day
- MUST include: Fund house, category, AUM if available
- FORMAT: "NAV: ₹XXX.XX (Change: +₹X.XX, +X.XX%) as of [date]"

**HISTORICAL CALCULATIONS - EXACT METHODOLOGY:**
For "What if I invested X years ago" questions:
"""
STEP 1: Initial Investment = ₹[Amount]
STEP 2: Time Period = [Years] years
STEP 3: Assumed CAGR = [X]% (based on [specific source/historical data])
STEP 4: Final Value = ₹[Amount] × (1 + 0.[X])^[Years]
STEP 5: Final Value = ₹[Exact calculated amount]
STEP 6: Total Gain = ₹[Final Value] - ₹[Initial Investment] = ₹[Gain]
STEP 7: Total Return = [Percentage]%
"""

**RESPONSE FORMATTING STANDARDS:**

**For Stock Price Queries:**
"""
**[COMPANY NAME] ([SYMBOL]) - Live Price**
Current Price: ₹XXX.XX
Change: +₹XX.XX (+X.XX%)
Volume: X,XXX shares
52W High: ₹XXX.XX | 52W Low: ₹XXX.XX
Market Cap: ₹X,XXX Cr
Last Updated: [Exact timestamp]
Source: [Specific source name]
"""

**For Investment Calculations:**
"""
**Investment Growth Calculation**
Initial Investment: ₹[Amount] on [Date]
Current Value: ₹[Amount] as of [Date]
Total Gain: ₹[Amount]
Absolute Return: [X]%
CAGR: [X]% per annum
Time Period: [X] years [X] months

**Breakdown:**
Year 1: ₹[Amount]
Year 2: ₹[Amount]
[Continue for each year]
Current: ₹[Amount]
"""

**For Mutual Fund Analysis:**
"""
**[FUND NAME] - Complete Analysis**
Current NAV: ₹XXX.XX (as of [date])
Category: [Exact category]
AUM: ₹[Amount] Cr
Expense Ratio: [X]%
Fund Manager: [Name]
Launch Date: [Date]

**Performance:**
1Y Return: [X]%
3Y CAGR: [X]%
5Y CAGR: [X]%

**Top Holdings:** (as of [date])
1. [Company] - [X]%
2. [Company] - [X]%
[List top 5-10 holdings]
"""

**MANDATORY SEARCH PATTERNS:**
- Stock prices: "[SYMBOL] share price today NSE BSE"
- Mutual funds: "[FUND NAME] NAV latest performance"
- Market data: "[INDEX] current value live"
- Fund holdings: "[FUND NAME] portfolio holdings latest"
- Company news: "[COMPANY] latest news financial results"

**CALCULATION VERIFICATION:**
ALWAYS double-check calculations:
1. Verify compound interest formula application
2. Cross-check percentage calculations
3. Confirm currency formatting (₹ symbol placement)
4. Validate decimal places (2 for currency, appropriate for percentages)

**PROFESSIONAL DISCLAIMERS - EXACT FORMAT:**
- "Data as of [exact timestamp] - Market prices change constantly"
- "Historical returns: Past performance doesn't guarantee future results"
- "Calculations based on [specific methodology/assumptions]"
- "Mutual fund investments are subject to market risks. Read all scheme-related documents carefully"
- "For investments above ₹1 lakh, consider consulting a certified financial advisor"

**RESPONSE STRUCTURE - MANDATORY FORMAT:**

**Opening:** Direct answer to the question with specific data
**Data Section:** Complete figures with sources and timestamps  
**Analysis:** Contextual interpretation with market insights
**Calculation:** Step-by-step breakdown if applicable
**Recommendation:** Specific, actionable next steps
**Disclaimer:** Appropriate risk warnings
**Follow-up:** ONE strategic question related to user's portfolio

**QUALITY CONTROL CHECKLIST:**
Before sending any response, verify:
□ Specific numbers provided (not ranges or approximations)
□ Complete calculations shown step-by-step
□ Exact timestamps and sources included
□ Professional formatting with clear structure
□ All data verified through web search when applicable
□ Appropriate disclaimers included
□ One strategic follow-up question asked

**ERROR PREVENTION:**
- NEVER say "approximately" - give exact figures
- NEVER say "around" or "roughly" - be precise
- NEVER provide incomplete calculations
- NEVER skip web search for current data requests
- NEVER give generic responses without specific user context

**TECHNICAL IMPLEMENTATION:**
- Use web_search() for ALL current data requests
- Parse search results to extract exact numerical data
- Format all currency with ₹ symbol and proper comma separation
- Include source attribution for all external data
- Timestamp all real-time information

REMEMBER: Every response must be CORRECT (factually accurate), COMPLETE (no missing information), PRECISE (exact figures and details), and DIRECT (straight to the point without fluff).

The goal is to be the most accurate, helpful, and professionally formatted financial advisor AI that provides definitive answers with complete supporting data.`;
    }

    // Define web search functions for OpenAI
    const functions = [
      {
        name: "search_web",
        description: "Search the web for current financial data, stock prices, mutual fund information, market data, or any real-time information",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query for current data (e.g., 'AAPL stock price current', 'Tesla stock price today', 'SBI Bluechip Fund NAV current')"
            }
          },
          required: ["query"]
        }
      }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        { role: "system", content: systemPrompt },
        ...recentMessages,
        { role: "user", content: processedMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      functions: functions,
      function_call: "auto"
    });

    let aiResponse;
    
    // Check if the model wants to call the web search function
    if (completion.choices[0].message.function_call) {
      const functionCall = completion.choices[0].message.function_call;
      
      if (functionCall.name === "search_web") {
        try {
          const functionArgs = JSON.parse(functionCall.arguments);
          const searchQuery = functionArgs.query;
          
          console.log(`Performing web search for: ${searchQuery}`);
          
          // Perform the web search
          const searchResults = await searchWeb(searchQuery);
          const extractedData = extractFinancialData(searchResults, searchQuery);
          
          // Enhanced system prompt for processing search results
          const searchResultPrompt = systemPrompt + `

**SEARCH DATA RECEIVED - PROCESS IMMEDIATELY:**

**EXTRACTED PRICE DATA:**
${extractedData.financialData?.stockPrice ? `Stock Price: ${extractedData.financialData.stockPrice}` : 'No specific price found'}
${extractedData.financialData?.changePercent ? `Change: ${extractedData.financialData.changePercent}` : ''}
${extractedData.financialData?.source ? `Source: ${extractedData.financialData.source}` : ''}

**CRITICAL RESPONSE REQUIREMENTS:**
1. START immediately with the specific data
2. NO mentions of "search limitations" or "data availability"
3. NO verbose explanations about search quality
4. BE DIRECT and confident
5. Provide EXACT figures with professional formatting
6. Give actionable investment guidance

**FORBIDDEN PHRASES:**
- "There is no current, verified data found"
- "latest web search"
- "comprehensive comparison based on"
- "most recently available, reliable data"
- "as of [date], therefore I will provide"

**RESPONSE FORMAT:**
**[COMPANY/FUND NAME] - Current Data**
Price: [EXACT FIGURE]
Change: [EXACT CHANGE]
[Brief analysis and context]
[Investment guidance]
[One strategic question]`;

          // Create a follow-up completion with the search results
          const followUpCompletion = await openai.chat.completions.create({
            model: "gpt-4.1",
            messages: [
              { role: "system", content: searchResultPrompt },
              ...recentMessages,
              { role: "user", content: processedMessage },
              {
                role: "function",
                name: "search_web",
                content: JSON.stringify({
                  query: searchQuery,
                  results: extractedData,
                  timestamp: new Date().toISOString(),
                  debug: {
                    totalResults: extractedData.results?.length || 0,
                    prioritySources: extractedData.results?.filter(r => r.isPrioritySource).length || 0,
                    extractedPrice: extractedData.financialData?.stockPrice || 'none',
                    extractedChange: extractedData.financialData?.changePercent || 'none',
                    summaryPreview: extractedData.summary?.substring(0, 200) || 'empty'
                  }
                })
              }
            ],
            max_tokens: maxTokens + 200, // Extra tokens for comprehensive response
            temperature: 0.7
          });
          
          aiResponse = followUpCompletion.choices[0].message.content;
          
          // Post-process to ensure formatting is correct
          if (aiResponse) {
            // Ensure proper formatting with markdown headers
            aiResponse = aiResponse.replace(/\*\*([^*]+)\*\*/g, '**$1**'); // Ensure bold formatting
            
            // Add disclaimers if missing for financial data
            if (extractedData.financialData?.stockPrice && !aiResponse.includes('market risks')) {
              aiResponse += '\n\n*Data as of ' + new Date().toLocaleString() + ' - Market prices change constantly. Past performance doesn\'t guarantee future results.*';
            }
          }
          
        } catch (error) {
          console.error('Error in web search function call:', error);
          aiResponse = `I attempted to search for current information about "${functionCall.arguments}" but encountered an issue. Let me provide you with general guidance instead.\n\nFor the most current stock prices and financial data, I recommend checking:\n- Yahoo Finance\n- Google Finance\n- Your broker's app\n\nHow else can I assist you with your investment planning or portfolio analysis?`;
        }
      } else {
        aiResponse = "I tried to call a function but encountered an error. How else can I help you with your investments?";
      }
    } else {
      aiResponse = completion.choices[0].message.content;
    }
    
    // Final formatting and validation
    aiResponse = stripHashtags(aiResponse);
    
    // Ensure response is complete (minimum length check)
    if (aiResponse && aiResponse.length < 50) {
      aiResponse += "\n\nWould you like more detailed information about this topic or have any other investment questions?";
    }

    const assistantMessage = {
      sender: "bot",
      content: aiResponse,
      timestamp: new Date(),
    };

    chat.messages.push(assistantMessage);
    chat.updatedAt = new Date();

    if (chat._id) {
      await chatsCollection.updateOne(
        { _id: chat._id },
        {
          $set: {
            messages: chat.messages,
            updatedAt: chat.updatedAt,
          },
          $inc: { __v: 1 },
        }
      );
    } else {
      const result = await chatsCollection.insertOne(chat);
      chat._id = result.insertedId;
    }

    res.json(chat);
  } catch (error) {
    console.error("Chat processing error:", error);
    res.status(500).json({
      error: "Failed to process message",
      details: error.message,
    });
  }
});

app.get("/api/debug/userdata", authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;
    console.log("Debug: Getting user data for customerId:", customerId);

    const userData = await getUserData(customerId);

    res.json({
      customerId: customerId,
      userData: userData,
      summary: {
        customerFound: !!userData.customer,
        ordersCount: userData.orders?.length || 0,
        foliosCount: userData.folios?.length || 0,
        orderDetailsCount: userData.orderDetails?.length || 0,
      },
    });
  } catch (error) {
    console.error("Debug endpoint error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch debug data", details: error.message });
  }
});

app.get("/api/chat/:chatId", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = new ObjectId(req.user._id);

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID format" });
    }

    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    const chat = await chatsCollection.findOne({
      _id: new ObjectId(chatId),
      userId: userId,
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json(chat);
  } catch (error) {
    console.error("Chat load error:", error);
    res.status(500).json({ error: "Failed to load chat" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Landing page data endpoint
app.get("/api/dashboard/data", authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;
    console.log("Fetching dashboard data for customerId:", customerId);

    const userData = await getUserData(customerId);

    // Calculate portfolio summary
    const portfolioData = {
      totalValue: 0,
      totalInvested: 0,
      totalReturns: 0,
      returnPercentage: 0,
      assets: [],
    };

    // Calculate from orders data
    if (userData.orders && userData.orders.length > 0) {
      const totalInvested = userData.orders
        .filter(
          (order) =>
            order.payment_status === "Paid" ||
            order.payment_status === "completed"
        )
        .reduce((sum, order) => sum + (parseFloat(order.amount) || 0), 0);

      portfolioData.totalInvested = totalInvested;
      portfolioData.totalValue = totalInvested * 1.125; // Assuming 12.5% returns
      portfolioData.totalReturns =
        portfolioData.totalValue - portfolioData.totalInvested;
      portfolioData.returnPercentage =
        totalInvested > 0
          ? (portfolioData.totalReturns / totalInvested) * 100
          : 0;

      // Group by investment type
      const assetGroups = {};
      userData.orders.forEach((order) => {
        const type = order.investment_type || "Mutual Funds";
        if (!assetGroups[type]) {
          assetGroups[type] = 0;
        }
        if (
          order.payment_status === "Paid" ||
          order.payment_status === "completed"
        ) {
          assetGroups[type] += parseFloat(order.amount) || 0;
        }
      });

      portfolioData.assets = Object.entries(assetGroups).map(
        ([name, value]) => ({
          name,
          value: value * 1.125, // Apply same return assumption
        })
      );
    }

    // SIP data
    const sipData = {
      totalMonthlyInvestment: 0,
      activeSIPs: [],
      totalSIPs: 0,
    };

    // Calculate from orders with SIP frequency
    if (userData.orders && userData.orders.length > 0) {
      const sipOrders = userData.orders.filter(
        (order) =>
          order.frequency &&
          (order.payment_status === "Paid" ||
            order.payment_status === "completed")
      );

      sipData.totalSIPs = sipOrders.length;
      sipData.totalMonthlyInvestment = sipOrders.reduce((sum, order) => {
        if (order.frequency === "monthly" || order.frequency === "MONTHLY") {
          return sum + (parseFloat(order.amount) || 0);
        } else if (
          order.frequency === "quarterly" ||
          order.frequency === "QUARTERLY"
        ) {
          return sum + (parseFloat(order.amount) || 0) / 3;
        } else if (
          order.frequency === "yearly" ||
          order.frequency === "YEARLY"
        ) {
          return sum + (parseFloat(order.amount) || 0) / 12;
        }
        return sum;
      }, 0);

      sipData.activeSIPs = sipOrders.slice(0, 5).map((order) => ({
        name: `Investment ${order.id}`,
        amount: parseFloat(order.amount) || 0,
        frequency: order.frequency || "monthly",
      }));
    }

    // Recent transactions
    const transactions = [];
    if (userData.orders && userData.orders.length > 0) {
      const recentOrders = userData.orders
        .sort(
          (a, b) =>
            new Date(b.created_at || b.date) - new Date(a.created_at || a.date)
        )
        .slice(0, 10);

      recentOrders.forEach((order) => {
        transactions.push({
          type: order.frequency
            ? `SIP - Investment ${order.id}`
            : `Lumpsum - Investment ${order.id}`,
          amount: parseFloat(order.amount) || 0,
          date: order.created_at || order.date || new Date(),
          status: order.payment_status || "pending",
          isCredit: false,
        });
      });

      // Add some dummy dividend credits for demo
      if (transactions.length > 0) {
        transactions.splice(1, 0, {
          type: "Dividend Credit",
          amount: Math.floor(portfolioData.totalInvested * 0.02), // 2% dividend
          date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          status: "completed",
          isCredit: true,
        });
      }
    }

    // Market data (static for now)
    const marketData = {
      nifty: {
        value: 19674.5,
        change: 1.2,
      },
      sensex: {
        value: 65832.1,
        change: 0.8,
      },
    };

    // Goals (dummy data based on portfolio)
    const goals = [
      {
        name: "Emergency Fund",
        target: 100000,
        current: Math.min(portfolioData.totalValue * 0.4, 85000),
        progress: Math.min(
          ((portfolioData.totalValue * 0.4) / 100000) * 100,
          85
        ),
      },
      {
        name: "House Down Payment",
        target: 2000000,
        current: Math.min(portfolioData.totalValue * 0.6, 1200000),
        progress: Math.min(
          ((portfolioData.totalValue * 0.6) / 2000000) * 100,
          60
        ),
      },
    ];

    const dashboardData = {
      user: {
        name: userData.customer?.name || "User",
        email: userData.customer?.email || "user@example.com",
        customerId: userData.customer?.id || customerId,
      },
      portfolio: portfolioData,
      sip: sipData,
      transactions: transactions,
      market: marketData,
      goals: goals,
      summary: {
        ordersCount: userData.orders?.length || 0,
        foliosCount: userData.folios?.length || 0,
        totalInvestments: portfolioData.totalValue,
      },
    };

    res.json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
      error: error.message,
    });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required" });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    const db = mongoClient.db("financeai");
    const customersCollection = db.collection("customer");

    const existingCustomer = await customersCollection.findOne({
      email: email.toLowerCase(),
    });

    if (existingCustomer) {
      return res
        .status(409)
        .json({ message: "Customer with this email already exists" });
    }

    const lastCustomer = await customersCollection.findOne(
      {},
      { sort: { id: -1 } }
    );
    const newCustomerId = lastCustomer ? lastCustomer.id + 1 : 126;
    const rayiCustomerId = `RAYI${String(newCustomerId).padStart(4, "0")}`;

    const hashedPassword = await bcrypt.hash(password, 10);

    const newCustomer = {
      id: newCustomerId,
      rayi_customer_id: rayiCustomerId,
      name: name,
      email: email.toLowerCase(),
      password: hashedPassword,
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
        name: name,
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "24h" }
    );

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: {
        _id: result.insertedId,
        userId: result.insertedId,
        id: newCustomerId,
        customerId: newCustomerId,
        rayiCustomerId: rayiCustomerId,
        name: name,
        email: email.toLowerCase(),
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Internal server error during signup" });
  }
});

app.get("/api/auth/verify", authenticateToken, async (req, res) => {
  try {
    const db = mongoClient.db("financeai");
    const customersCollection = db.collection("customer");

    const customer = await customersCollection.findOne({
      id: req.user.customerId,
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    res.json({
      message: "Token valid",
      user: {
        _id: customer._id,
        userId: customer._id,
        id: customer._id,
        customerId: customer.id,
        rayiCustomerId: customer.rayi_customer_id,
        name: customer.name,
        email: customer.email,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res
      .status(500)
      .json({ message: "Internal server error during token verification" });
  }
});

app.use(express.static(path.join(__dirname, "../Frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend", "index.html"), (err) => {
    if (err) {
      res.status(500).send("Error serving index.html");
    }
  });
});

app.use("/api", apiRoutes);

app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(500).json({ message: "Something went wrong on the server." });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB via Mongoose"))
  .catch((err) => console.error("MongoDB Mongoose connection error:", err));

initMongoDB();

// Get local IP address
const os = require("os");
const networkInterfaces = os.networkInterfaces();
const localIP = Object.values(networkInterfaces)
  .flat()
  .find((iface) => iface.family === "IPv4" && !iface.internal).address;

const uri = process.env.MONGO_URI;

app.get("/file/:id", async (req, res) => {
  const fileId = req.params.id;

  try {
    const client = await MongoClient.connect(uri);
    const db = client.db("financeai");
    const bucket = new GridFSBucket(db, { bucketName: "ticketUploads" });

    const downloadStream = bucket.openDownloadStream(new ObjectId(fileId));

    downloadStream.on("error", () => res.status(404).send("File not found"));
    res.setHeader("Content-Type", "image/png");
    downloadStream.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on:`);
  console.log(`→ Local: http://localhost:${PORT}`);
  console.log(`→ Network: http://${localIP}:${PORT}`);
  console.log(`→ File Retrieve: http://localhost:${PORT}/file/<enter the gridFSID>`)
});

process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  if (mongoClient) {
    await mongoClient.close();
    console.log("MongoDB client connection closed");
  }
  await mongoose.connection.close();
  console.log("Mongoose connection closed");
  process.exit(0);
});
