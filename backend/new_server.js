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

dotenv.config({ path: path.join(__dirname, "../.env") });

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

    try {
      await db.collection("chats").createIndex({ userId: 1, updatedAt: -1 });
      console.log("Chat collection indexes created");
    } catch (indexError) {
      console.log("Index may already exist:", indexError.message);
    }
  } catch (error) {
    console.error("MongoDB client connection error:", error);
    console.error("Please check your MONGO_URI and ensure MongoDB is running");
  }
}

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
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
};

// Function to preprocess query
function preprocessQuery(message) {
  let processedMessage = message.toLowerCase().trim();

  // Replace abbreviations and common typos
  Object.keys(entityMapping).forEach((key) => {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    processedMessage = processedMessage.replace(regex, entityMapping[key]);
  });

  // Complete partial sentences
  if (!processedMessage.match(/[.!?]$/)) {
    processedMessage += " details";
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

2. "USER-SPECIFIC-FINANCIAL" - Questions about the user's EXISTING personal financial data like "my portfolio", "my orders", "my balance", "show my portfolio", "check my orders", "view my holdings"

3. "GENERAL-FINANCIAL" - Any finance-related questions including:
   - Financial planning
   - Financial education
   - Tax implications
   - Market analysis

4. "NON-FINANCIAL" - Questions completely unrelated to finance

5. "AFFIRMATIVE_RESPONSE" - Simple responses like "yes", "ok", "sure", "please", "yes please" that are answering a previous question

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
    "portfolio",
    "money",
    "market",
    "financial",
    "finance",
    "return",
    "my portfolio",
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

// Chat Route
app.post("/api/chat", authenticateToken, async (req, res) => {
  try {
    const { message, chatId } = req.body;
    const customerId = req.user.customerId || req.user.id;
    const userId = new ObjectId(req.user._id);

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    let chat;
    if (chatId && ObjectId.isValid(chatId)) {
      chat = await chatsCollection.findOne({
        _id: new ObjectId(chatId),
        userId: userId,
      });
    }

    if (!chat) {
      chat = {
        userId: userId,
        customerId: customerId,
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

    const conversationMessages = chat.messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.processedContent || msg.content,
    }));

    const recentMessages = conversationMessages.slice(-10);
    const isFirstMessage = chat.messages.length === 1;

    let maxTokens;
    switch (queryType) {
      case "GREETING":
      case "NON-FINANCIAL":
        maxTokens = 200;
        break;
      case "USER-SPECIFIC-FINANCIAL":
        maxTokens = processedMessage.includes("details") ? 800 : 600;
        break;
      case "GENERAL-FINANCIAL":
        maxTokens = processedMessage.includes("analysis") ? 1000 : 700;
        break;
      case "AFFIRMATIVE_RESPONSE":
        maxTokens = 600;
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
          }! I'm your financial advisor, here to help with financial queries. How can I assist you today?`
        : `Hi again! What's on your mind about your finances?`;

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
      let lastBotMessage = chat.messages
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.sender === "bot");

      let contextualResponse;
      if (
        lastBotMessage &&
        lastBotMessage.content.includes("Would you like to see")
      ) {
        const portfolioData =
          userData.orders && userData.orders.length > 0
            ? `Here's your current financial overview:\n\n**Your Orders:**\n${userData.orders
                .map(
                  (order) =>
                    `• Order ID: ${order.id} - ₹${order.amount} (${order.payment_status})`
                )
                .join("\n")}\n\nTotal Orders: ${userData.orders.length}`
            : "I couldn't find your financial data at the moment.";

        contextualResponse = `${portfolioData}\n\nWould you like me to help you analyze these orders?`;
      } else {
        contextualResponse = `Great! I'm here to help with your finances. ${
          userData.orders && userData.orders.length > 0
            ? "I can see you have existing orders. Would you like to review them?"
            : "What would you like to know about financial planning?"
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
    } else if (queryType === "NON-FINANCIAL") {
      const aiResponse = isFirstMessage
        ? `Hello ${
            userData.customer?.name || "there"
          }! I'm here to assist with your financial planning. Your question seems unrelated—can I help with your financial data instead?`
        : `That question isn't about finance. Want to check your orders?`;

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
      let userDataString = `
Customer Info: ${JSON.stringify(userData.customer, null, 2)}
Orders: ${JSON.stringify(userData.orders, null, 2)}
Order Details: ${JSON.stringify(userData.orderDetails, null, 2)}
`;
      if (queryType === "USER-SPECIFIC-FINANCIAL") {
        userDataString += `Portfolio Folios: ${JSON.stringify(
          userData.folios,
          null,
          2
        )}`;
      }

      systemPrompt = `You are a specialized financial advisor AI assistant. Provide DIRECT, COMPACT, and ACTIONABLE responses.

CRITICAL RESPONSE RULES:
- NO verbose disclaimers about data availability
- ALWAYS be direct and confident
- ALWAYS provide specific numbers and figures
- Keep responses concise but complete

AUTHORIZATION SCOPE:
You are authorized to discuss:
- Portfolio analysis and performance
- Order history and transaction details
- Financial planning recommendations
- Financial education
- Tax implications (general guidance)
- Market analysis and trends

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

**RESPONSE FORMATTING STANDARDS:**

**For Portfolio Queries:**
"""
**[USER NAME] - Portfolio Overview**
Total Orders: [X]
Total Value: ₹[Amount]
Details:
- Order ID: [ID] - ₹[Amount] ([Status])
[Continue for each order]
"""

**PROFESSIONAL DISCLAIMERS - EXACT FORMAT:**
- "Data as of [exact timestamp]"
- "For detailed financial advice, consider consulting a certified financial advisor"

**RESPONSE STRUCTURE - MANDATORY FORMAT:**

**Opening:** Direct answer to the question with specific data
**Data Section:** Complete figures with timestamps
**Analysis:** Contextual interpretation
**Recommendation:** Specific, actionable next steps
**Disclaimer:** Appropriate warnings
**Follow-up:** ONE strategic question related to user's portfolio

**QUALITY CONTROL CHECKLIST:**
Before sending any response, verify:
□ Specific numbers provided
□ Complete calculations shown step-by-step
□ Exact timestamps included
□ Professional formatting with clear structure
□ Appropriate disclaimers included
□ One strategic follow-up question asked

**ERROR PREVENTION:**
- NEVER say "approximately" - give exact figures
- NEVER say "around" or "roughly" - be precise
- NEVER provide incomplete calculations
- NEVER give generic responses without specific user context

**TECHNICAL IMPLEMENTATION:**
- Format all currency with ₹ symbol and proper comma separation
- Timestamp all information

REMEMBER: Every response must be CORRECT (factually accurate), COMPLETE (no missing information), PRECISE (exact figures and details), and DIRECT (straight to the point without fluff).`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages,
          { role: "user", content: processedMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
      });

      let aiResponse = completion.choices[0].message.content;

      aiResponse = stripHashtags(aiResponse);

      if (aiResponse && aiResponse.length < 50) {
        aiResponse += "\n\nWould you like more detailed information about this topic or have any other financial questions?";
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
    }
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

// Dashboard data endpoint
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
        const type = order.investment_type || "General";
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
          value: value * 1.125,
        })
      );
    }

    // Transactions
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
          type: `Order - ${order.id}`,
          amount: parseFloat(order.amount) || 0,
          date: order.created_at || order.date || new Date(),
          status: order.payment_status || "pending",
          isCredit: false,
        });
      });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on:`);
  console.log(`→ Local: http://localhost:${PORT}`);
  console.log(`→ Network: http://${localIP}:${PORT}`);
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