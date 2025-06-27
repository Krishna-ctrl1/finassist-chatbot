const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");
const OpenAI = require("openai");

// Import ticket model
const Ticket = require("./models/ticketModel");

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

    // Make MongoDB client available to routes
    app.set('mongoClient', mongoClient);

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
            .slice(-5) // Increased to 5 for better context
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
    "stock",
    "mutual fund",
    "tax",
    "investment",
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

    const conversationContext = chat.messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.processedContent || msg.content,
    }));

    // Check for ticket raising workflow
    const isTicketRequest = checkIfTicketRequest(processedMessage, conversationContext);
    
    if (isTicketRequest) {
      const ticketResponse = await handleTicketWorkflow(message, chat, req.user);
      
      if (ticketResponse.shouldRespond) {
        const assistantMessage = {
          sender: "bot",
          content: ticketResponse.response,
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
    }

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

    let maxTokens;
    switch (queryType) {
      case "GREETING":
      case "NON-FINANCIAL":
        maxTokens = 250; // Slightly increased for richer casual responses
        break;
      case "USER-SPECIFIC-FINANCIAL":
        maxTokens = processedMessage.includes("details") ? 1000 : 800; // More room for detailed financial data
        break;
      case "GENERAL-FINANCIAL":
        maxTokens = processedMessage.includes("analysis") ? 1200 : 900; // Extra tokens for complex topics
        break;
      case "AFFIRMATIVE_RESPONSE":
        maxTokens = 500; // Moderate for contextual follow-ups
        break;
      default:
        maxTokens = 600; // Balanced default
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
      const previousGreeting = conversationContext
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "assistant" && msg.content.toLowerCase().includes("hey"));
      const aiResponse = previousGreeting
        ? `Hey ${userData.customer?.name || "friend"}, great to catch up again! Ready to dive into your finances or got something new on your mind?`
        : `Hi ${userData.customer?.name || "there"}! I’m your go-to financial buddy—excited to help with your money matters. What’s up?`;

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
      const lastBotMessage = conversationContext
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "assistant");

      let contextualResponse;
      if (
        lastBotMessage &&
        lastBotMessage.content.toLowerCase().includes("would you like")
      ) {
        if (
          lastBotMessage.content.toLowerCase().includes("portfolio") ||
          lastBotMessage.content.toLowerCase().includes("orders")
        ) {
          contextualResponse =
            userData.orders && userData.orders.length > 0
              ? `Awesome, let’s check out your portfolio. You’ve got ${
                  userData.orders.length
                } orders worth a total of ₹${userData.orders
                  .reduce((sum, order) => sum + (parseFloat(order.amount) || 0), 0)
                  .toLocaleString("en-IN")}. For instance, Order ID ${
                  userData.orders[0].id
                } is ₹${parseFloat(userData.orders[0].amount).toLocaleString(
                  "en-IN"
                )} and marked as ${userData.orders[0].payment_status}. Want to dig into a specific order or see how they’re performing overall?`
              : `Looks like you don’t have any orders yet, but no worries! Want to explore some investment options, like the mutual funds we discussed before, or start fresh with something new?`;
        } else {
          contextualResponse = `Got it! Since we were chatting about “${lastBotMessage.content
            .slice(0, 50)
            .toLowerCase()}…”, what’s next? Maybe a peek at your investments or some financial tips?`;
        }
      } else {
        contextualResponse = `Sweet, you’re on board! What’s the next thing you want to talk about—your portfolio, investment ideas, or maybe something like tax planning?`;
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
      const previousNonFinancial = conversationContext
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "user" && !msg.content.toLowerCase().includes("portfolio"));
      const aiResponse = previousNonFinancial
        ? `Haha, going off-topic again with “${previousNonFinancial.content.slice(
            0,
            30
          )}…”? I’m all about the money stuff, so how about we swing back to your finances? Maybe check your orders or talk about investment goals?`
        : `Hey ${userData.customer?.name || "there"}, that’s a bit outside my financial wheelhouse! Want to talk about your portfolio or maybe some money-saving strategies instead?`;

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
Customer: ${userData.customer?.name || "Unknown"} (ID: ${userData.customer?.id || "Unknown"}, RAYI ID: ${
        userData.customer?.rayi_customer_id || "Unknown"
      })
Email: ${userData.customer?.email || "unknown@email.com"}
Orders: ${userData.orders?.length || 0} orders
${
  userData.orders?.length > 0
    ? userData.orders
        .map(
          (order) =>
            `- Order ID: ${order.id}, Amount: ₹${parseFloat(
              order.amount
            ).toLocaleString("en-IN")}, Status: ${order.payment_status}, Type: ${
              order.investment_type || "General"
            }, Date: ${new Date(order.created_at || order.date).toLocaleDateString("en-IN")}`
        )
        .join("\n")
    : "No orders available yet."
}
Folios: ${userData.folios?.length || 0} folios
${
  userData.folios?.length > 0
    ? userData.folios
        .map((folio) => `- Folio: ${folio.folio_number}, MF ID: ${folio.mf_id}`)
        .join("\n")
    : "No folios available yet."
}
Mutual Funds: ${userData.mutualFunds?.length || 0} funds
${
  userData.mutualFunds?.length > 0
    ? userData.mutualFunds
        .map((fund) => `- Fund: ${fund.name || fund.scheme_code}`)
        .join("\n")
    : "No mutual funds available yet."
}
`;

      systemPrompt = `You are a friendly, engaging financial advisor AI, like a trusted friend who’s an expert in money matters. Your goal is to provide detailed, accurate, and conversational responses that feel natural and tailored to the user’s financial queries. Use the full conversation history to maintain context, referencing past topics or questions to create a seamless, ChatGPT-like dialogue.

**Guidelines:**
- **Tone**: Warm, approachable, and confident, like chatting with a friend. Avoid formal headers (e.g., "Portfolio Overview"), repetitive disclaimers, or overly technical jargon unless needed.
- **Context Awareness**: Leverage the full conversation history to reference prior queries or topics (e.g., “Since you asked about your portfolio earlier…”). Ensure responses feel like a continuation of the chat.
- **Data Usage**: Include specific data from the user’s financial profile (e.g., orders, folios) when relevant. Format currency as ₹ with proper comma separation (e.g., ₹1,23,456).
- **Response Structure**: Start with a direct, concise answer to the query, followed by detailed insights or explanations in a conversational tone. Include a single, natural follow-up question only if it fits the context and encourages engagement.
- **Error Prevention**: Use exact figures from the provided data, avoiding vague terms like “approximately.” If data is missing, offer proactive suggestions (e.g., “No orders yet—want to explore some investment options?”).
- **Scope**: You can discuss:
  - Portfolio analysis and performance
  - Order history and transaction details
  - Financial planning recommendations
  - General financial education (e.g., stocks, mutual funds, taxes)
  - Tax implications (general guidance only)
  - Market analysis and trends
- **Disclaimer**: Include a brief, natural disclaimer only for complex financial advice (e.g., “For a personalized plan, you might want to check with a financial advisor”).
- **Follow-up Questions**: Ask a relevant follow-up only if it enhances the conversation and aligns with the user’s interests.

**User Data:**
${userDataString}

**Conversation History (Full):**
${JSON.stringify(conversationMessages, null, 2)}

Respond directly to the user’s query with specific data and a natural, engaging tone. Reference the conversation history to maintain continuity, especially if the user mentioned related topics earlier. If the query involves the user’s portfolio or orders, include precise details from the data above. End with a follow-up question only if it feels natural and relevant.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationMessages, // Full history for context
          { role: "user", content: processedMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.65, // Slightly higher for natural variation
      });

      let aiResponse = completion.choices[0].message.content;

      aiResponse = stripHashtags(aiResponse);

      // Ensure response isn’t too short for financial queries
      if (aiResponse.length < 100 && queryType !== "GREETING" && queryType !== "NON-FINANCIAL") {
        aiResponse += "\n\nAnything else you’d like to explore about your finances or investments?";
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

// Ticket workflow functions
function checkIfTicketRequest(message, conversationContext) {
  const lowerMessage = message.toLowerCase().trim();
  
  // Check for explicit ticket raising requests
  const ticketKeywords = [
    'raise a ticket',
    'create a ticket', 
    'i want to raise a ticket',
    'having a problem',
    'having some problems',
    'having an issue',
    'i am having an issue',
    'i am having a problem',
    'i am having some problems',
    'i have an issue',
    'i have a problem',
    'need help with',
    'support ticket',
    'ticket',
    'issue with',
    'problem with'
  ];
  
  // Check if message contains ticket-related keywords
  const hasTicketKeyword = ticketKeywords.some(keyword => 
    lowerMessage.includes(keyword)
  );
  
  // Check conversation context for ongoing ticket flow
  const isInTicketFlow = conversationContext.some(msg => 
    msg.content && (
      msg.content.includes('Step 1 of 4') ||
      msg.content.includes('Step 2 of 4') ||
      msg.content.includes('Step 3 of 4') ||
      msg.content.includes('Step 4 of 4') ||
      msg.content.includes('Issue Detail') ||
      msg.content.includes('Choose a category') ||
      msg.content.includes('Description')
    )
  );
  
  return hasTicketKeyword || isInTicketFlow;
}

async function handleTicketWorkflow(message, chat, user) {
  const lowerMessage = message.toLowerCase().trim();
  const conversationHistory = chat.messages || [];
  
  // Find the current step based on conversation history
  const lastBotMessage = conversationHistory
    .slice()
    .reverse()
    .find(msg => msg.sender === 'bot');
  
  const lastBotContent = lastBotMessage?.content || '';
  
  // Check if this is the initial ticket request
  const isInitialRequest = (
    lowerMessage.includes('raise a ticket') ||
    lowerMessage.includes('create a ticket') ||
    lowerMessage.includes('i want to raise a ticket') ||
    lowerMessage.includes('having a problem') ||
    lowerMessage.includes('having some problems') ||
    lowerMessage.includes('having an issue') ||
    lowerMessage.includes('i am having an issue') ||
    lowerMessage.includes('i am having a problem') ||
    lowerMessage.includes('i am having some problems') ||
    lowerMessage.includes('i have an issue') ||
    lowerMessage.includes('i have a problem')
  ) && !lastBotContent.includes('Step');
  
  if (isInitialRequest) {
    // Step 1: Ask for issue details
    return {
      shouldRespond: true,
      response: `Sure, I can help you raise a ticket for this issue. Let me guide you through the process.

**Step 1 of 4: Issue Detail**

Please provide a brief title or summary of your issue. This will help our support team understand your concern quickly.

For example: "Unable to access my portfolio" or "Payment not reflecting in account"`
    };
  }
  
  // Check if we're in Step 1 (collecting issue title)
  if (lastBotContent.includes('Step 1 of 4') && lastBotContent.includes('Issue Detail')) {
    // User provided issue title, move to Step 2
    return {
      shouldRespond: true,
      response: `Thank you! Your issue title: "${message}"

**Step 2 of 4: Choose a category**

Please select the category that best describes your issue:

1. General Enquiry
2. KYC Related
3. Products Related
4. Orders Related
5. Payment/Bank Accounts
6. Account Related
7. Others

You can respond with either the number (1-7) or the category name.`
    };
  }
  
  // Check if we're in Step 2 (collecting category)
  if (lastBotContent.includes('Step 2 of 4') && lastBotContent.includes('Choose a category')) {
    // Map user response to category
    const categoryMap = {
      '1': 'General Enquiry',
      '2': 'KYC Related',
      '3': 'Products Related', 
      '4': 'Orders Related',
      '5': 'Payment/Bank Accounts',
      '6': 'Account Related',
      '7': 'Others',
      'general enquiry': 'General Enquiry',
      'general': 'General Enquiry',
      'kyc related': 'KYC Related',
      'kyc': 'KYC Related',
      'products related': 'Products Related',
      'products': 'Products Related',
      'orders related': 'Orders Related',
      'orders': 'Orders Related',
      'payment/bank accounts': 'Payment/Bank Accounts',
      'payment': 'Payment/Bank Accounts',
      'bank accounts': 'Payment/Bank Accounts',
      'account related': 'Account Related',
      'account': 'Account Related',
      'others': 'Others',
      'other': 'Others'
    };
    
    const selectedCategory = categoryMap[lowerMessage] || categoryMap[message.trim()];
    
    if (selectedCategory) {
      return {
        shouldRespond: true,
        response: `Category selected: ${selectedCategory}

**Step 3 of 4: Description**

Now please provide a detailed description of your issue. Include any relevant information such as:
- When did this issue occur?
- What steps did you take?
- Any error messages you received?
- How is this affecting you?

The more details you provide, the better our support team can assist you.`
      };
    } else {
      return {
        shouldRespond: true,
        response: `I didn't recognize that category. Please choose from:

1. General Enquiry
2. KYC Related
3. Products Related
4. Orders Related
5. Payment/Bank Accounts
6. Account Related
7. Others

Respond with either the number (1-7) or the category name.`
      };
    }
  }
  
  // Check if we're in Step 3 (collecting description)
  if (lastBotContent.includes('Step 3 of 4') && lastBotContent.includes('Description')) {
    // User provided description, move to Step 4
    return {
      shouldRespond: true,
      response: `Thank you for the detailed description.

**Step 4 of 4: Upload Supporting Documents (Optional)**

You can now upload supporting documents such as screenshots, receipts, or any other relevant files to help us resolve your issue faster.

**Supported file types:** Images (JPEG, PNG, GIF, WebP) and PDF files
**Maximum file size:** 10MB per file
**Maximum files:** 3 files

[File Upload Field]

A file upload interface will appear after this message. You can either:
- Upload supporting documents and create the ticket
- Skip the upload and create the ticket without attachments

Both options will create your support ticket successfully.`
    };
  }
  
  // Handle "no" response for file upload
  if (lowerMessage === 'no' && lastBotContent.includes('Step 4 of 4')) {
    // Create ticket without attachments
    try {
      // Extract ticket data from conversation
      const messages = chat.messages || [];
      let issueTitle = '';
      let category = '';
      let description = '';
      
      // Find the issue title (first user message after Step 1)
      const step1Index = messages.findIndex(msg => 
        msg.content && msg.content.includes('Step 1 of 4')
      );
      if (step1Index !== -1 && messages[step1Index + 1]) {
        issueTitle = messages[step1Index + 1].content;
      }
      
      // Find the category (first user message after Step 2)
      const step2Index = messages.findIndex(msg => 
        msg.content && msg.content.includes('Step 2 of 4')
      );
      if (step2Index !== -1 && messages[step2Index + 1]) {
        const userCategoryResponse = messages[step2Index + 1].content.toLowerCase().trim();
        const categoryMap = {
          '1': 'General Enquiry', '2': 'KYC Related', '3': 'Products Related',
          '4': 'Orders Related', '5': 'Payment/Bank Accounts', 
          '6': 'Account Related', '7': 'Others',
          'general enquiry': 'General Enquiry', 'general': 'General Enquiry',
          'kyc related': 'KYC Related', 'kyc': 'KYC Related',
          'products related': 'Products Related', 'products': 'Products Related',
          'orders related': 'Orders Related', 'orders': 'Orders Related',
          'payment/bank accounts': 'Payment/Bank Accounts', 'payment': 'Payment/Bank Accounts',
          'bank accounts': 'Payment/Bank Accounts', 'account related': 'Account Related',
          'account': 'Account Related', 'others': 'Others', 'other': 'Others'
        };
        category = categoryMap[userCategoryResponse] || 'Others';
      }
      
      // Find the description (first user message after Step 3)
      const step3Index = messages.findIndex(msg => 
        msg.content && msg.content.includes('Step 3 of 4')
      );
      if (step3Index !== -1 && messages[step3Index + 1]) {
        description = messages[step3Index + 1].content;
      }
      
      if (issueTitle && category && description) {
        // Create ticket without files
        const ticketId = `TCK${Date.now()}${Math.floor(Math.random() * 10000)}`;
        
        const ticket = new Ticket({
          customer_id: user.customerId || user.id,
          customer_email: user.email,
          issue_title: issueTitle,
          category: category,
          description: description,
          status: "Open",
          priority: "Medium",
          ticket_id: ticketId,
          attachments: []
        });
        
        await ticket.save();
        console.log('Ticket created without attachments:', ticketId);
        
        return {
          shouldRespond: true,
          response: `✅ **Ticket Created Successfully!**

**Ticket ID:** ${ticketId}
**Title:** ${issueTitle}
**Category:** ${category}
**Status:** Open
**Attachments:** None

Your support ticket has been created and assigned to our team. You'll receive updates on the progress via email.

**What's next?**
- Our support team will review your ticket within 24 hours
- You'll receive email notifications for any updates
- You can reference your ticket using ID: ${ticketId}

Is there anything else I can help you with regarding your investments or account?`
        };
      } else {
        return {
          shouldRespond: true,
          response: 'I\'m sorry, there seems to be missing information for creating your ticket. Please start the ticket creation process again by saying "I want to raise a ticket".'
        };
      }
    } catch (error) {
      console.error('Error creating ticket without attachments:', error);
      return {
        shouldRespond: true,
        response: 'I\'m sorry, there was an error creating your ticket. Please try again or contact our support team directly.'
      };
    }
  }
  
  // Default response if we can't determine the step
  return {
    shouldRespond: false,
    response: ''
  };
}

// Get all chats for a user
app.get("/api/chat", authenticateToken, async (req, res) => {
  try {
    const userId = new ObjectId(req.user._id);
    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    const chats = await chatsCollection
      .find({ userId: userId })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    res.json(chats);
  } catch (error) {
    console.error("Chat list error:", error);
    res.status(500).json({ error: "Failed to load chats" });
  }
});

// Get specific chat
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

// Delete a chat
app.delete("/api/chat/:chatId", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = new ObjectId(req.user._id);

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID format" });
    }

    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    const result = await chatsCollection.deleteOne({
      _id: new ObjectId(chatId),
      userId: userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Chat deletion error:", error);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// Update chat title
app.put("/api/chat/:chatId", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;
    const userId = new ObjectId(req.user._id);

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID format" });
    }

    if (!title || title.trim().length === 0) {
      return res.status(400).json({ error: "Title is required" });
    }

    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    const result = await chatsCollection.updateOne(
      {
        _id: new ObjectId(chatId),
        userId: userId,
      },
      {
        $set: {
          title: title.trim(),
          updatedAt: new Date(),
        },
        $inc: { __v: 1 },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json({ message: "Chat title updated successfully", title: title.trim() });
  } catch (error) {
    console.error("Chat title update error:", error);
    res.status(500).json({ error: "Failed to update chat title" });
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

// Include ticket routes directly
const ticketRoutes = require("./routes/ticketRoutes");
app.use("/api/tickets", ticketRoutes);

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