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
const OpenAI = require('openai');
const textToSpeech = require('@google-cloud/text-to-speech');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Initialize Google Cloud Text-to-Speech client
const ttsClient = new textToSpeech.TextToSpeechClient();

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
            .slice(-5)
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
6. "TICKET_REQUEST" - Phrases indicating a need to raise a ticket or report an issue, e.g., "I want to raise a ticket", "I am having issue", "need support", or descriptions of issues like "my order fails"

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
      "TICKET_REQUEST",
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

  if (lowerMessage.includes("raise a ticket") || 
      lowerMessage.includes("having issue") || 
      lowerMessage.includes("need support") ||
      lowerMessage.includes("fails") ||
      lowerMessage.includes("issue")) {
    return "TICKET_REQUEST";
  }

  if (!hasFinancialKeyword) {
    return "NON-FINANCIAL";
  }

  return hasUserSpecific ? "USER-SPECIFIC-FINANCIAL" : "GENERAL-FINANCIAL";
}

// Function to parse ticket details using OpenAI
async function parseTicketDetails(message, conversationContext = []) {
  try {
    const validCategories = [
      "General Enquiry",
      "KYC Related",
      "Product Related",
      "Orders Related",
      "Payments/Bank Accounts",
      "Account Related",
      "Others",
    ];

    const contextInfo = conversationContext.length > 0
      ? `\n\nConversation Context:\n${conversationContext.slice(-3).map(msg => `${msg.role}: ${msg.content}`).join("\n")}`
      : "";

    const parsePrompt = `
You are a financial advisor AI assistant tasked with extracting ticket details from a user's message. The user is trying to raise a support ticket, and their input may be in any format (e.g., structured, unstructured, natural language). Your job is to identify and extract the following fields:
- Issue Title: A brief title summarizing the issue (max 50 characters).
- Category: One of the following: ${validCategories.join(", ")}.
- Description: A detailed description of the issue (max 500 characters).

If any field is missing or unclear, provide sensible defaults based on the message content:
- Issue Title: Summarize the issue or use "User Reported Issue"
- Category: Infer from context (e.g., "payment" -> "Payments/Bank Accounts") or use "Others"
- Description: Use the user's message or "No description provided"

User message: "${message}"${contextInfo}

Return a JSON object with the extracted fields:
{
  "issue_title": "<title>",
  "category": "<category>",
  "description": "<description>"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1",
      messages: [{ role: "user", content: parsePrompt }],
      max_tokens: 300,
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return {
      issue_title: result.issue_title?.trim().substring(0, 50) || "User Reported Issue",
      category: validCategories.includes(result.category?.trim()) ? result.category.trim() : "Others",
      description: result.description?.trim().substring(0, 500) || "No description provided",
    };
  } catch (error) {
    console.error("Error parsing ticket details:", error);
    return {
      issue_title: "User Reported Issue",
      category: "Others",
      description: "No description provided",
    };
  }
}

// Function to create a ticket via webhook
async function createTicket(userData, ticketDetails) {
  const ticketId = `TCK${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const validCategories = [
    "General Enquiry",
    "KYC Related",
    "Product Related",
    "Orders Related",
    "Payments/Bank Accounts",
    "Account Related",
    "Others",
  ];
  const category = validCategories.includes(ticketDetails.category)
    ? ticketDetails.category
    : "Others";

  const payload = {
    ticket_id: ticketId,
    customer_id: userData.customer.id,
    customer_email: userData.customer.email,
    issue_title: ticketDetails.issue_title || "User Reported Issue",
    category: category,
    description: ticketDetails.description || "No description provided",
    status: "Open",
    priority: "Medium",
  };

  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: { "Content-Type": "application/json" },
    });
    console.log(`Ticket ${ticketId} created successfully. Response:`, response.data);
    return `Ticket ${ticketId} has been raised for your issue. Our team will contact you soon at ${userData.customer.email}.`;
  } catch (error) {
    console.error("Failed to create ticket:", {
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: WEBHOOK_URL,
      payload: payload,
    });
    return "Failed to raise ticket. Please try again later or contact support directly.";
  }
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
        maxTokens = 250;
        break;
      case "USER-SPECIFIC-FINANCIAL":
        maxTokens = processedMessage.includes("details") ? 1000 : 800;
        break;
      case "GENERAL-FINANCIAL":
        maxTokens = processedMessage.includes("analysis") ? 1200 : 900;
        break;
      case "AFFIRMATIVE_RESPONSE":
        maxTokens = 500;
        break;
      case "TICKET_REQUEST":
        maxTokens = 300;
        break;
      default:
        maxTokens = 600;
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
    } else if (queryType === "TICKET_REQUEST") {
      // Parse ticket details immediately
      const ticketDetails = await parseTicketDetails(processedMessage, conversationContext);
      
      if (ticketDetails.issue_title === "User Reported Issue" || ticketDetails.description === "No description provided") {
        const missingFields = [];
        if (ticketDetails.issue_title === "User Reported Issue") missingFields.push("title");
        if (ticketDetails.description === "No description provided") missingFields.push("description");

        const aiResponse = `I need a bit more information to raise your ticket. Please provide the ${missingFields.join(" and ")} of your issue. For example, you could say: "I'm having trouble with my KYC verification, please help with document upload errors."`;
        
        const assistantMessage = { sender: "bot", content: aiResponse, timestamp: new Date() };
        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            { $set: { messages: chat.messages, updatedAt: chat.updatedAt }, $inc: { __v: 1 } }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        return res.json(chat);
      }

      const aiResponse = await createTicket(userData, ticketDetails);
      
      const assistantMessage = { 
        sender: "bot", 
        content: aiResponse, 
        timestamp: new Date() 
      };
      chat.messages.push(assistantMessage);
      chat.updatedAt = new Date();

      if (chat._id) {
        await chatsCollection.updateOne(
          { _id: chat._id },
          { $set: { messages: chat.messages, updatedAt: chat.updatedAt }, $inc: { __v: 1 } }
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

      systemPrompt = `
**System Prompt for Financial Advisor AI Assistant**

You are a specialized financial advisor AI assistant powered by Grok 3, built by xAI. Provide DIRECT, COMPACT (under 170 words), and ACTIONABLE responses, leveraging user data from the getUserData function and adhering to the following rules.

**CRITICAL RESPONSE RULES:**
- Answer ONLY the user's question without additional unsolicited information.
- Do not include verbose disclaimers about data availability or limitations.
- Always be direct and confident, providing specific numbers and figures.
- Keep responses concise but complete, avoiding fluff.
- Show complete calculations with clear methodology when applicable.
- Include professional disclaimers in the specified format.
- Ask one strategic follow-up question related to the user's portfolio or financial goals.
- Do not use tables in responses; use bullet points or plain text for data presentation.

**AUTHORIZATION SCOPE:**
You are authorized to discuss:
- Portfolio analysis and performance (including historical estimates).
- Investment holdings and allocations.
- Order history and transaction details.
- Mutual fund information and performance.
- Stock prices and market data (using available data or assumptions with disclaimers).
- Financial planning recommendations.
- Financial education and investment concepts.
- Investment strategy and risk assessment.
- Returns, gains, losses, and performance calculations.
- Account balances and folio information.
- Tax implications (general guidance).
- Market analysis and trends.
- Investment product recommendations and onboarding.
- Historical performance analysis and projections.

**USER DATA ACCESS (from getUserData function):**
- Customer Name: ${userData.customer?.name || "Unknown"}
- Customer ID: ${userData.customer?.id || "Unknown"}
- RAYI Customer ID: ${userData.customer?.rayi_customer_id || "Unknown"}
- Email: ${userData.customer?.email || "unknown@email.com"}
- Total Orders: ${userData.orders?.length || 0}
- Total Folios: ${userData.folios?.length || 0}
- Bank Accounts: ${userData.bankAccounts?.length || 0}
- UPI Accounts: ${userData.upiAccounts?.length || 0}
- Cards: ${userData.cards?.length || 0}
- Mutual Funds Invested: ${userData.mutualFundsInvested?.length || 0}

**CRITICAL ORDER INFORMATION:**
${userData.orders && userData.orders.length > 0
  ? `The user has ${userData.orders.length} order(s). Details:
${userData.orders.map(order => `- Order ID: ${order.id}
  - Amount: ₹${order.amount}
  - Payment Status: ${order.payment_status}
  - Investment ID: ${order.investment_id}
`).join("")}
Order Details Count: ${userData.orderDetails?.length || 0}`
  : "The user currently has no orders in the system."
}

**Detailed Financial Data (from getUserData):**
- Customer Detail: ${userData.customerDetail ? JSON.stringify(userData.customerDetail) : "No customer details available"}
- Folios: ${userData.folios?.length || 0} folios (${JSON.stringify(userData.folios) || "No folios"})
- Performance Summary: ${userData.performanceSummary ? JSON.stringify(userData.performanceSummary) : "No performance summary"}
- Investment Performance: ${userData.investmentPerformance?.length || 0} records (${JSON.stringify(userData.investmentPerformance) || "No performance data"})
- Investment Returns: ${userData.investmentReturns?.length || 0} records (${JSON.stringify(userData.investmentReturns) || "No returns data"})
- Mutual Funds: ${userData.mutualFunds?.length || 0} funds (${JSON.stringify(userData.mutualFunds) || "No mutual funds"})
- Bank Accounts: ${JSON.stringify(userData.bankAccounts) || "No bank accounts"}
- UPI Accounts: ${JSON.stringify(userData.upiAccounts) || "No UPI accounts"}
- Cards: ${JSON.stringify(userData.cards) || "No cards"}
- Mutual Funds Invested: ${JSON.stringify(userData.mutualFundsInvested) || "No mutual funds invested"}

**ENTITY MAPPING:**
- sbi: State Bank of India
- apple: Apple Inc.
- reliance: Reliance Industries
- hdfc: HDFC Bank
- icici: ICICI Bank

**DATA HANDLING PROTOCOL:**
- Use user data from getUserData as the primary source for all responses.
- For current market data (e.g., stock prices, NAVs), rely on assumptions or historical data from user records if real-time data is unavailable, and clearly state assumptions.
- Ensure all calculations are precise and include step-by-step methodology.

**Stock Prices (when real-time data is unavailable):**
- Use historical data from user records or assume reasonable values based on entity mapping.
- Provide: Assumed price, change, market context, and disclaimer.
- Format:
**[COMPANY NAME] ([SYMBOL]) - Assumed Price**
Current Price: ₹XXX.XX
Change: +₹XX.XX (+X.XX%)
Market Cap: ₹X,XXX Cr
Note: Based on historical data or assumptions.

**Mutual Fund NAVs (when real-time data is unavailable):**
- Use data from userData.mutualFunds or userData.mutualFundsInvested.
- Provide: Assumed NAV, fund house, category, performance metrics.
- Format:
**[FUND NAME] - Analysis**
Current NAV: ₹XXX.XX (date)
Category: [Exact category]
AUM: ₹[Amount] Cr
Expense Ratio: [X]%
**Performance:**
1Y Return: [X]%
3Y CAGR: [X]%
5Y CAGR: [X]%
**Top Holdings:** (based on user data or assumptions)
1. [Company] - [X]%
2. [Company] - [X]%
[List top 5 holdings if available]

**Historical Calculations:**
For "What if I invested X years ago" questions:
STEP 1: Initial Investment = ₹[Amount]
STEP 2: Time Period = [Years] years
STEP 3: Assumed CAGR = [X]% (based on user data or historical averages)
STEP 4: Final Value = ₹[Amount] × (1 + 0.[X])^[Years]
STEP 5: Final Value = ₹[Exact calculated amount]
STEP 6: Total Gain = ₹[Final Value] - ₹[Initial Investment] = ₹[Gain]
STEP 7: Total Return = [Percentage]%

**RESPONSE FORMATTING STANDARDS:**

**Investment Calculations:**
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

**Professional Disclaimers:**
- Data based on user records or assumptions - Market prices change constantly.
- Historical returns: Past performance doesn't guarantee future results.
- Calculations based on [specific methodology/assumptions].
- Mutual fund investments are subject to market risks. Read all scheme-related documents carefully.
- For investments above ₹1 lakh, consider consulting a certified financial advisor.

**RESPONSE STRUCTURE:**
1. Answer: Direct and complete response to the user's query, using specific data from getUserData or clearly stated assumptions.
2. Data (if applicable): Relevant figures from getUserData or assumptions with clear notation.
3. Calculation (not on every answer wherever is asked or needed): Step-by-step breakdown of calculations, showing precise methodology.
4. Disclaimer (if relevant): Brief risk warnings, e.g., "Historical returns do not guarantee future results" or "Mutual fund investments are subject to market risks."
5. Follow-up: One strategic question related to the user's portfolio.

**QUALITY CONTROL CHECKLIST:**
Before sending any response, verify:
- Specific numbers provided (no ranges or approximations).
- Complete calculations shown step-by-step.
- Data sourced from getUserData or clearly stated assumptions.
- Professional formatting with clear structure.
- Appropriate disclaimers included.
- One strategic follow-up question asked.

**ERROR PREVENTION:**
- Never use "approximately," "around," or "roughly" - provide exact figures.
- Never provide incomplete calculations.
- Never give generic responses without user context.
- Always format currency with ₹ symbol and proper comma separation (e.g., ₹1,23,456.78).
- Always validate calculations (compound interest, percentages, decimals).

**TECHNICAL IMPLEMENTATION:**
- Use userData from getUserData as the primary data source.
- Handle missing data gracefully, returning defaults as per getUserData (e.g., empty arrays, null values).
- Format all currency with ₹ symbol and proper comma separation.
- Include assumptions clearly when real-time data is unavailable.

**GOAL**: Be the most accurate, helpful, and professionally formatted financial advisor AI, delivering definitive answers with complete supporting data from getUserData, using assumptions when necessary, and ensuring actionable financial advice.

For non-financial queries, provide clear redirection to appropriate sources.

*NON-FINANCIAL QUERIES:*
•⁠  ⁠If the query does not contain financial-related terms (e.g., "mutual fund," "stock," "portfolio," "investment," "order," "folio," "bank," "return," "NAV"), respond: "This query is outside my financial advisory scope. Please provide a finance-related question."
•⁠  ⁠Do not attempt to answer non-financial queries under any circumstances
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationMessages,
          { role: "user", content: processedMessage },
        ],
        max_tokens: maxTokens,
        temperature: 0.65,
      });

      let aiResponse = completion.choices[0].message.content;

      aiResponse = stripHashtags(aiResponse);

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

// Text-to-Speech API endpoint
app.post('/api/text-to-speech', authenticateToken, async (req, res) => {
  try {
    const { 
      text, 
      voice = 'en-US-Neural2-F', 
      languageCode = 'en-US',
      ssmlGender = 'FEMALE',
      speakingRate = 1.0,
      pitch = 0.0,
      volumeGainDb = 0.0,
      effectsProfileId = []
    } = req.body;

    if (!text) {
      return res.status(400).json({ 
        success: false, 
        message: 'Text is required for text-to-speech conversion' 
      });
    }

    console.log('TTS Request:', {
      text: text.substring(0, 50) + '...',
      voice,
      languageCode,
      ssmlGender,
      speakingRate,
      pitch
    });

    // Configure the request
    const request = {
      input: { text },
      voice: {
        name: voice,
        languageCode,
        ssmlGender
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate,
        pitch,
        volumeGainDb,
        effectsProfileId
      }
    };

    // Call the Text-to-Speech API
    const [response] = await ttsClient.synthesizeSpeech(request);

    // Send the audio content as a Buffer
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.audioContent.length
    });
    res.send(response.audioContent);

  } catch (error) {
    console.error('Text-to-speech error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error generating speech', 
      error: error.message 
    });
  }
});

// Get available voices endpoint
app.get('/api/text-to-speech/voices', authenticateToken, async (req, res) => {
  try {
    const [result] = await ttsClient.listVoices({});
    const voices = result.voices.map(voice => ({
      name: voice.name,
      languageCode: voice.languageCodes[0],
      ssmlGender: voice.ssmlGender,
      naturalSampleRateHertz: voice.naturalSampleRateHertz
    }));
    
    res.json({
      success: true,
      voices
    });
  } catch (error) {
    console.error('Error listing voices:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching available voices', 
      error: error.message 
    });
  }
});

// Save user voice preferences
app.post('/api/text-to-speech/preferences', authenticateToken, async (req, res) => {
  try {
    const { 
      voice, 
      languageCode, 
      ssmlGender, 
      speakingRate, 
      pitch, 
      volumeGainDb 
    } = req.body;
    
    const userId = req.user._id;
    
    const db = mongoClient.db('financeai');
    const preferencesCollection = db.collection('tts_preferences');
    
    // Upsert the preferences (create or update)
    await preferencesCollection.updateOne(
      { userId: new ObjectId(userId) },
      { 
        $set: { 
          userId: new ObjectId(userId),
          voice,
          languageCode,
          ssmlGender,
          speakingRate: parseFloat(speakingRate),
          pitch: parseFloat(pitch),
          volumeGainDb: parseFloat(volumeGainDb),
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );
    
    res.json({
      success: true,
      message: 'Voice preferences saved successfully'
    });
    
  } catch (error) {
    console.error('Error saving voice preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error saving voice preferences', 
      error: error.message 
    });
  }
});

// Get user voice preferences
app.get('/api/text-to-speech/preferences', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    const db = mongoClient.db('financeai');
    const preferencesCollection = db.collection('tts_preferences');
    
    const preferences = await preferencesCollection.findOne({ userId: new ObjectId(userId) });
    
    if (preferences) {
      res.json({
        success: true,
        preferences: {
          voice: preferences.voice,
          languageCode: preferences.languageCode,
          ssmlGender: preferences.ssmlGender,
          speakingRate: preferences.speakingRate,
          pitch: preferences.pitch,
          volumeGainDb: preferences.volumeGainDb
        }
      });
    } else {
      // Return default preferences if none are saved
      res.json({
        success: true,
        preferences: {
          voice: 'en-US-Neural2-F',
          languageCode: 'en-US',
          ssmlGender: 'FEMALE',
          speakingRate: 1.0,
          pitch: 0.0,
          volumeGainDb: 0.0
        }
      });
    }
    
  } catch (error) {
    console.error('Error fetching voice preferences:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching voice preferences', 
      error: error.message 
    });
  }
});

// Convert bot response to speech
app.post('/api/chat/:chatId/message/:messageId/speech', authenticateToken, async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user._id;
    
    if (!ObjectId.isValid(chatId) || !ObjectId.isValid(messageId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid chat or message ID format' 
      });
    }
    
    // Get user's voice preferences
    const db = mongoClient.db('financeai');
    const preferencesCollection = db.collection('tts_preferences');
    const chatsCollection = db.collection('chats');
    
    // Fetch the message text
    const chat = await chatsCollection.findOne(
      { _id: new ObjectId(chatId), userId: new ObjectId(userId) }
    );
    
    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: 'Chat not found' 
      });
    }
    
    // Find the specific message by its _id
    const message = chat.messages.find(msg => 
      msg._id && msg._id.toString() === messageId
    );
    
    if (!message) {
      return res.status(404).json({ 
        success: false, 
        message: 'Message not found in chat' 
      });
    }
    
    // Only bot messages can be converted to speech
    if (message.sender !== 'bot') {
      return res.status(400).json({ 
        success: false, 
        message: 'Only bot messages can be converted to speech' 
      });
    }
    
    // Get user's voice preferences or use defaults
    const preferences = await preferencesCollection.findOne({ userId: new ObjectId(userId) }) || {
      voice: 'en-US-Neural2-F',
      languageCode: 'en-US',
      ssmlGender: 'FEMALE',
      speakingRate: 1.0,
      pitch: 0.0,
      volumeGainDb: 0.0
    };
    
    // Clean the text for text-to-speech
    let cleanText = message.content
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/```[^`]*```/g, '')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ');
    
    // Configure the TTS request
    const request = {
      input: { text: cleanText },
      voice: {
        name: preferences.voice,
        languageCode: preferences.languageCode,
        ssmlGender: preferences.ssmlGender
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: preferences.speakingRate,
        pitch: preferences.pitch,
        volumeGainDb: preferences.volumeGainDb
      }
    };
    
    console.log('Converting to speech:', {
      messageId,
      textLength: cleanText.length,
      voice: preferences.voice,
      speakingRate: preferences.speakingRate,
      pitch: preferences.pitch
    });
    
    // Call the Text-to-Speech API
    const [response] = await ttsClient.synthesizeSpeech(request);
    
    // Send the audio content as a Buffer
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': response.audioContent.length
    });
    res.send(response.audioContent);
    
  } catch (error) {
    console.error('Error converting message to speech:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error converting message to speech', 
      error: error.message 
    });
  }
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