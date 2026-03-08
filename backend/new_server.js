const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const apiRoutes = require("./routes/api");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const multer = require("multer");
const OpenAI = require("openai");
const textToSpeech = require("@google-cloud/text-to-speech");
const fs = require("fs");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { SSEClientTransport } = require("@modelcontextprotocol/sdk/client/sse.js");

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();



let faqData = [];
try {
  const faqFilePath = path.join(__dirname, "../data/faq.json");
  faqData = JSON.parse(fs.readFileSync(faqFilePath, "utf8"));
  console.log("FAQ data loaded successfully:", faqData.length, "entries");
} catch (error) {
  console.error("Error loading faq.json:", error.message);
  faqData = [];
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

let mcpClient = null;
let mcpTools = [];

async function connectToMCPServer() {
  try {
    // This URL must match where your Python server runs (default 8087)
    const transport = new SSEClientTransport(new URL("http://localhost:8087/sse"));
    mcpClient = new Client({ name: "FinAssist-App", version: "1.0" }, { capabilities: { tools: {} } });

    await mcpClient.connect(transport);
    const result = await mcpClient.listTools();

    // Format tools for OpenAI
    mcpTools = result.tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
    console.log(`✅ Connected to Stock/MF MCP Server. Loaded ${mcpTools.length} tools.`);
  } catch (error) {
    console.error("❌ Failed to connect to Python MCP Server:", error.message);
  }
}

// Call this on server start
connectToMCPServer();
// ==========================================
// START: RAG & EMBEDDING LOGIC (ADD THIS)
// ==========================================

let faqEmbeddings = [];

// Helper: Calculate Cosine Similarity
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 1. Generate Embeddings on Server Startup
async function generateFAQEmbeddings() {
  // Check if API key exists
  if (!process.env.OPENAI_API_KEY) {
    console.log("⚠️  Skipping Embeddings: No OPENAI_API_KEY found.");
    return;
  }

  // Check if FAQ data exists
  if (!faqData || faqData.length === 0) {
    console.log("⚠️  Skipping Embeddings: No FAQ data loaded.");
    return;
  }

  console.log("🔄 Generating Embeddings for FAQs... This may take a moment.");

  // Prepare input text: Combined Category + Question + Answer
  const inputs = faqData.map(item =>
    `Category: ${item["Category "] || item.Category || 'General'}. Question: ${item.Question}. Answer: ${item.Answer}`
  );

  try {
    const batchSize = 20; // OpenAI batch limit
    for (let i = 0; i < inputs.length; i += batchSize) {
      const batch = inputs.slice(i, i + batchSize);
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small", // Fast & efficient model
        input: batch,
      });

      response.data.forEach((embeddingObj, index) => {
        const originalIndex = i + index;
        faqEmbeddings.push({
          index: originalIndex,
          embedding: embeddingObj.embedding,
          content: faqData[originalIndex]
        });
      });
      console.log(`   Embedded ${Math.min(i + batchSize, inputs.length)}/${inputs.length} FAQs`);
    }
    console.log("✅ FAQ Embeddings generated successfully!");
  } catch (error) {
    console.error("❌ Error generating embeddings:", error.message);
  }
}

// Start the embedding process immediately
generateFAQEmbeddings();

// 2. Retrieval Function (Finds relevant FAQs)
async function retrieveRelevantFAQs(query, topK = 3) {
  if (faqEmbeddings.length === 0) return [];

  try {
    // Embed the user's query
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });
    const queryEmbedding = response.data[0].embedding;

    // Calculate similarity scores
    const scoredFAQs = faqEmbeddings.map(item => ({
      ...item,
      score: cosineSimilarity(queryEmbedding, item.embedding)
    }));

    // Filter by relevance threshold (0.3) and get top K
    return scoredFAQs
      .filter(item => item.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => item.content);
  } catch (error) {
    console.error("Error retrieving FAQs:", error);
    return [];
  }
}
// ==========================================
// END: RAG LOGIC
// ==========================================

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// Initialize Google Cloud Text-to-Speech client
const ttsClient = new textToSpeech.TextToSpeechClient();

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
      bucketName: "ticket_documents"
    });
    console.log("GridFS bucket initialized for ticket documents");

    try {
      await db.collection("chats").createIndex({ userId: 1, updatedAt: -1 });
      console.log("Chat collection indexes created");
      await db.collection("sips").createIndex({ customer_id: 1, updated_at: -1 });
      console.log("SIPs collection indexes created");
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
    origin: ["http://localhost:5000", "http://127.0.0.1:5500"],
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
      sips,
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
      db
        .collection("sips")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching SIPs:", err);
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
        ...(sips || []).map((s) => s?.mf_id),
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
      sipsCount: sips?.length || 0,
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
      sips: sips || [],
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
      sips: [],
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

// FAQ endpoint
app.get("/api/faqs", (req, res) => {
  try {
    res.json({
      success: true,
      data: faqData,
    });
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch FAQs",
      error: error.message,
    });
  }
});

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
2. "USER-SPECIFIC-FINANCIAL" - Questions about the user's EXISTING personal financial data like "my portfolio", "my orders", "my balance", "show my portfolio", "check my orders", "view my holdings", "my sips", "check my sip"
3. "GENERAL-FINANCIAL" - Any finance-related questions including:
   - Financial planning
   - Financial education
   - Tax implications
   - Market analysis
   - Mutual fund searches (e.g., "find a mutual fund with 5% Nvidia", "mutual funds with tech exposure")
4. "NON-FINANCIAL" - Questions completely unrelated to finance
5. "AFFIRMATIVE_RESPONSE" - Simple responses like "yes", "ok", "sure", "please", "yes please" that are answering a previous question
6. "TICKET_REQUEST" - Phrases indicating a need to raise a ticket or report an issue, e.g., "I want to raise a ticket", "I am having issue", "need support", or descriptions of issues like "my order fails"
7. "FAQ" - Questions that match or are similar to questions in the FAQ dataset, e.g., "What is a mutual fund?", "How do mutual funds work?"

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
      "FAQ",
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
    "sip",
    "my sips",
    "check my sip",
  ];

  const faqKeywords = [
    "what is a mutual fund",
    "how does a mutual fund work",
    "mutual fund faq",
    "faq",
    "frequently asked questions",
  ];

  const hasFinancialKeyword = financialKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasUserSpecific = lowerMessage.includes("my ") || lowerMessage.includes("check my sip");
  const hasFAQKeyword = faqKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  if (
    lowerMessage.includes("raise a ticket") ||
    lowerMessage.includes("having issue") ||
    lowerMessage.includes("need support") ||
    lowerMessage.includes("fails") ||
    lowerMessage.includes("issue")
  ) {
    return "TICKET_REQUEST";
  }

  if (hasFAQKeyword) {
    return "FAQ";
  }

  if (!hasFinancialKeyword) {
    return "NON-FINANCIAL";
  }

  return hasUserSpecific ? "USER-SPECIFIC-FINANCIAL" : "GENERAL-FINANCIAL";
}

// Function to search FAQs for a matching question
function searchFAQs(query) {
  const lowerQuery = query.toLowerCase().trim();
  const matchedFAQ = faqData.find((faq) =>
    faq.Question.toLowerCase().includes(lowerQuery) ||
    lowerQuery.includes(faq.Question.toLowerCase()) ||
    lowerQuery.includes("faq") ||
    lowerQuery.includes("frequently asked questions")
  );

  return matchedFAQ
    ? {
      question: matchedFAQ.Question,
      answer: matchedFAQ.Answer,
      category: matchedFAQ["Category "] || "General",
    }
    : null;
}

// Function to handle ticket creation flow
async function handleTicketCreationFlow(message, chat, customerId) {
  // Helper function to safely convert content to string
  const getContentAsString = (content) => {
    if (typeof content === 'string') {
      return content;
    } else if (typeof content === 'object' && content !== null) {
      if (content.type === 'document_upload_modal' && content.content) {
        return content.content;
      } else {
        return JSON.stringify(content);
      }
    } else {
      return String(content || '');
    }
  };

  // Check which step we're in based on previous messages
  const ticketCreationMessages = chat.messages.filter(
    (msg) => {
      const contentStr = getContentAsString(msg.content);
      return contentStr.includes("Step 1 of 4") ||
        contentStr.includes("Step 2 of 4") ||
        contentStr.includes("Step 3 of 4") ||
        contentStr.includes("Step 4 of 4");
    }
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

  if (getContentAsString(latestStep.content).includes("Step 1 of 4")) {
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

  if (getContentAsString(latestStep.content).includes("Step 2 of 4")) {
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

  if (getContentAsString(latestStep.content).includes("Step 3 of 4")) {
    // User provided description, now show document upload option
    const description = message.trim();

    return {
      type: "document_upload_modal",
      content: `**Step 4 of 4: Document Upload**
Thank you for the description.

📎 **Optional Document Upload**
You can attach supporting documents to help our support team better understand your issue.

Please choose one of the following options:`,
      modalConfig: {
        title: "Upload Supporting Documents",
        description: "Attach files that can help our support team better understand your issue",
        maxFiles: 5,
        maxFileSize: "10MB",
        allowedTypes: [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".txt"],
        buttons: [
          {
            id: "continue_with_documents",
            text: "Continue with Documents",
            type: "primary",
            action: "open_upload"
          },
          {
            id: "continue_without_documents",
            text: "Continue without Documents",
            type: "secondary",
            action: "skip_upload"
          }
        ]
      }
    };
  }

  if (getContentAsString(latestStep.content).includes("Step 4 of 4")) {
    // Handle final confirmation
    const userResponse = message.trim().toLowerCase();

    if (userResponse.includes("review")) {
      // Extract and show ticket details for review
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
      const descriptionMessage = chat.messages[step3Index + 1];
      const description = descriptionMessage?.content?.trim();

      return `**Ticket Review**

**Title:** ${issueTitleMatch?.[1] || "Not found"}
**Category:** ${categoryMatch?.[1]?.trim() || "Not found"}
**Description:** ${description || "Not found"}

Does this look correct? Respond with:
- **"create"** or **"yes"** - Create the ticket
- **"edit"** - Start over with corrections`;
    } else if (
      userResponse.includes("create") ||
      userResponse.includes("yes")
    ) {
      // User wants to create the ticket
      // Extract issue title, category, and description from previous messages
      const step1Message = chat.messages.find((msg) =>
        getContentAsString(msg.content).includes("Your issue title:")
      );
      const step2Message = chat.messages.find((msg) =>
        getContentAsString(msg.content).includes("Category selected:")
      );
      const step3Message = chat.messages.find((msg) =>
        getContentAsString(msg.content).includes("Step 3 of 4")
      );

      if (!step1Message || !step2Message || !step3Message) {
        return `I'm sorry, there was an issue retrieving your ticket information. Let's start over. Would you like to create a support ticket?`;
      }

      const issueTitleMatch = getContentAsString(step1Message.content).match(
        /Your issue title: "([^"]+)"/
      );
      const categoryMatch = getContentAsString(step2Message.content).match(
        /Category selected: ([^\n\r]+)/
      );

      // Find the description from the user's message after Step 3
      const step3Index = chat.messages.findIndex((msg) =>
        getContentAsString(msg.content).includes("Step 3 of 4")
      );
      const descriptionMessage = chat.messages[step3Index + 1];
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

        // Create the ticket
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

        return `I'm sorry, there was an error creating your ticket. Please try again later or contact our support team directly. 

In the meantime, is there anything else I can help you with regarding your investments?`;
      }
    } else if (userResponse.includes("edit")) {
      // User wants to start over
      return `Let's start over with your ticket creation.

**Step 1 of 4: Issue Title**
Please provide a brief title for your issue.`;
    } else {
      // User gave an unclear response
      return `Please respond with:
- **"create"** or **"yes"** to create the ticket
- **"review"** to see the details before creating
- **"edit"** to start over with corrections

What would you like to do?`;
    }
  }

  // Fallback
  return `I'm here to help you create a support ticket. Let's start:

**Step 1 of 4: Issue Title**
Please provide a brief title for your issue.`;
}

// Function to create a ticket (enhanced version)
async function createTicket(ticketData) {
  try {
    // Generate unique ticket ID
    const ticketId = `TCK${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create payload for database
    const payload = {
      ticket_id: ticketId,
      customer_id: ticketData.customer_id,
      customer_email: ticketData.customer_email,
      issue_title: ticketData.issue_title,
      category: ticketData.category,
      description: ticketData.description,
      status: "Open",
      priority: "Medium",
      chatId: ticketData.chatId, // Include chat ID if provided
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Save ticket to MongoDB tickets collection
    try {
      const db = mongoClient.db("financeai");
      const ticketsCollection = db.collection("tickets");

      const mongoTicket = {
        ...payload,
        _id: undefined, // Let MongoDB generate the _id
      };

      const result = await ticketsCollection.insertOne(mongoTicket);
      console.log(`Ticket ${ticketId} saved to MongoDB with _id: ${result.insertedId}`);

      // Add the MongoDB _id to the payload
      payload.mongo_id = result.insertedId;
    } catch (mongoError) {
      console.error(`Failed to save ticket ${ticketId} to MongoDB:`, mongoError.message);
      throw mongoError; // Re-throw the error since we only have MongoDB now
    }

    console.log(`Ticket created successfully: ${ticketId} (MongoDB)`);
    return { ticket_id: ticketId, ...payload };
  } catch (error) {
    console.error("Error in createTicket function:", error);
    throw error;
  }
}

// RAG Test Route
app.get("/api/test-rag", async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: "Query parameter required" });

  try {
    const results = await retrieveRelevantFAQs(query, 5);
    res.json({ query, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Text-to-Speech Route (OpenAI)
app.post("/api/tts", authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Text is required" });

    const mp3Response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (error) {
    console.error("TTS error:", error);
    res.status(500).json({ error: "Failed to synthesize speech" });
  }
});

// Chat Route
app.post("/api/chat", authenticateToken, async (req, res) => {
  try {
    const { message, chatId, stream } = req.body;
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

    const conversationMessages = chat.messages.map((msg) => {
      const content = msg.processedContent || msg.content;

      // Ensure content is always a string
      let processedContent;
      if (typeof content === 'string') {
        processedContent = content;
      } else if (typeof content === 'object' && content !== null) {
        if (content.type === 'document_upload_modal' && content.content) {
          processedContent = content.content;
        } else {
          processedContent = JSON.stringify(content);
        }
      } else {
        processedContent = String(content || '');
      }

      return {
        role: msg.sender === "user" ? "user" : "assistant",
        content: processedContent,
      };
    });

    let maxTokens;
    switch (queryType) {
      case "GREETING":
      case "NON-FINANCIAL":
      case "FAQ":
        maxTokens = 250;
        break;
      case "USER-SPECIFIC-FINANCIAL":
        maxTokens = processedMessage.includes("details") || processedMessage.includes("sip") ? 1000 : 800;
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
      userData.orders?.length || 0,
      "SIPs found:",
      userData.sips?.length || 0
    );
    console.log("=== END USER DATA FETCH ===");

    if (queryType === "GREETING") {
      const previousGreeting = conversationContext
        .slice(0, -1)
        .reverse()
        .find(
          (msg) =>
            msg.role === "assistant" &&
            msg.content.toLowerCase().includes("hey")
        );
      const aiResponse = previousGreeting
        ? `Hey ${userData.customer?.name || "friend"
        }, great to catch up again! Ready to dive into your finances, SIPs, or got something new on your mind?`
        : `Hi ${userData.customer?.name || "there"
        }! I’m your go-to financial buddy—excited to help with your money matters or SIPs. What’s up?`;

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

      const getContentAsString = (content) => {
        if (typeof content === 'string') {
          return content;
        } else if (typeof content === 'object' && content !== null) {
          if (content.type === 'document_upload_modal' && content.content) {
            return content.content;
          } else {
            return JSON.stringify(content);
          }
        } else {
          return String(content || '');
        }
      };

      const lastBotMessageContent = lastBotMessage ? getContentAsString(lastBotMessage.content) : '';
      const isInTicketWorkflow = lastBotMessage &&
        (lastBotMessageContent.includes("Step 1 of 4") ||
          lastBotMessageContent.includes("Step 2 of 4") ||
          lastBotMessageContent.includes("Step 3 of 4") ||
          lastBotMessageContent.includes("Step 4 of 4") ||
          lastBotMessageContent.includes("Would you like to proceed with creating a support ticket?"));

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

      let contextualResponse = "Got it! Let's dive deeper. ";

      if (lastBotMessage) {
        const lastBotMessageContentStr = getContentAsString(lastBotMessage.content);
        const lowerLastBotMessage = lastBotMessageContentStr.toLowerCase();

        if (
          lowerLastBotMessage.includes("historical performance") ||
          lowerLastBotMessage.includes("performance analysis")
        ) {
          if (userData.investmentPerformance?.length > 0) {
            contextualResponse = `Your portfolio's historical performance:\n`;
            userData.investmentPerformance.slice(0, 3).forEach((perf) => {
              const fund =
                userData.mutualFunds.find((f) => f.id === perf.mf_id) || {};
              contextualResponse += `- ${fund.name || perf.mf_id || "Fund"
                }: ₹${(perf.current_value || 0).toLocaleString("en-IN")}, ${perf.cagr || 0
                }% CAGR (as of ${new Date(
                  perf.date || new Date()
                ).toLocaleDateString("en-IN")})\n`;
            });
            contextualResponse += `**Disclaimer**: Past performance does not guarantee future results.\nWhich fund would you like more details on?`;
          } else {
            contextualResponse = `No historical performance data found.\nWould you like to explore current holdings or investment options?`;
          }
        } else if (
          lowerLastBotMessage.includes("diversification") ||
          lowerLastBotMessage.includes("diversify")
        ) {
          const assetTypes = [
            ...new Set(
              userData.orders.map((order) => order.investment_type || "General")
            ),
          ];
          const mutualFundCategories = [
            ...new Set(
              userData.mutualFunds.map((fund) => fund.category || "Unknown")
            ),
          ];
          contextualResponse = `Your portfolio spans ${assetTypes.length
            } asset types: ${assetTypes.join(", ")}.\n`;
          if (mutualFundCategories.length > 0) {
            contextualResponse += `Fund categories: ${mutualFundCategories.join(
              ", "
            )}.\n`;
          }
          contextualResponse +=
            assetTypes.length < 3
              ? `Consider adding ${!mutualFundCategories.includes("Equity")
                ? "equity funds, "
                : ""
              }${!mutualFundCategories.includes("Debt") ? "debt funds, " : ""
              }or FDs for better diversification.\n`
              : `Your portfolio is well-diversified.\n`;
          contextualResponse += `**Disclaimer**: Diversification reduces risk but consult an advisor for tailored advice.\nWant fund recommendations?`;
        } else if (lowerLastBotMessage.includes("cancelled/paused orders")) {
          const cancelledOrPausedOrders = userData.orders.filter(
            (order) =>
              order.payment_status.toLowerCase() === "cancelled" ||
              order.payment_status.toLowerCase() === "paused"
          );
          if (cancelledOrPausedOrders.length > 0) {
            contextualResponse += `Cancelled/Paused orders:\n${cancelledOrPausedOrders
              .map(
                (order) =>
                  `- ID: ${order.id}, ₹${parseFloat(
                    order.amount
                  ).toLocaleString("en-IN")}, ${order.payment_status
                  } (${new Date(
                    order.created_at || order.date
                  ).toLocaleDateString("en-IN")})`
              )
              .join("\n")}\nWant to restart any?`;
          } else {
            contextualResponse += `No cancelled or paused orders.\nExplore active investments?`;
          }
        } else if (
          lowerLastBotMessage.includes("portfolio") ||
          lowerLastBotMessage.includes("orders")
        ) {
          contextualResponse +=
            userData.orders?.length > 0
              ? `Your portfolio: ${userData.orders.length
              } orders, total ₹${userData.orders
                .reduce(
                  (sum, order) => sum + (parseFloat(order.amount) || 0),
                  0
                )
                .toLocaleString("en-IN")}. Example: Order ID ${userData.orders[0].id
              }, ₹${parseFloat(userData.orders[0].amount).toLocaleString(
                "en-IN"
              )}, ${userData.orders[0].payment_status
              }.\nDig into a specific order?`
              : `No orders yet.\nExplore investment options?`;
        }
        // Handle SIPs follow-up
        else if (
          lowerLastBotMessage.includes("sip") ||
          lowerLastBotMessage.includes("sips")
        ) {
          if (userData.sips?.length > 0) {
            contextualResponse += `Your active SIPs:\n`;
            userData.sips.slice(0, 3).forEach((sip) => {
              const fund =
                userData.mutualFunds.find((f) => f.id === sip.mf_id) || {};
              contextualResponse += `- SIP ID: ${sip.sip_id
                }, Fund: ${fund.name || sip.mf_id || "Unknown"}, ₹${parseFloat(
                  sip.amount
                ).toLocaleString("en-IN")} (${sip.frequency
                }, Started: ${new Date(sip.start_date).toLocaleDateString(
                  "en-IN"
                )})\n`;
            });
            contextualResponse += `Want more details on a specific SIP?`;
          } else {
            contextualResponse += `No active SIPs found.\nInterested in starting a new SIP?`;
          }
        }
        // Generic fallback
        else {
          contextualResponse += `What's next—portfolio details, SIPs, investment ideas, or tax planning?`;
        }
      } else {
        contextualResponse += `What's next—portfolio details, SIPs, investment ideas, or tax planning?`;
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
            $set: { messages: chat.messages, updatedAt: chat.updatedAt },
            $inc: { __v: 1 },
          }
        );
      } else {
        const result = await chatsCollection.insertOne(chat);
        chat._id = result.insertedId;
      }

      return res.json(chat);
    } else if (queryType === "TICKET_REQUEST") {
      const lastBotMessage = conversationContext
        .slice(0, -1)
        .reverse()
        .find((msg) => msg.role === "assistant");

      const getContentAsString2 = (content) => {
        if (typeof content === 'string') {
          return content;
        } else if (typeof content === 'object' && content !== null) {
          if (content.type === 'document_upload_modal' && content.content) {
            return content.content;
          } else {
            return JSON.stringify(content);
          }
        } else {
          return String(content || '');
        }
      };

      const lastBotMessageContent2 = lastBotMessage ? getContentAsString2(lastBotMessage.content) : '';
      if (
        lastBotMessage &&
        (lastBotMessageContent2.includes("Step 1 of 4") ||
          lastBotMessageContent2.includes("Step 2 of 4") ||
          lastBotMessageContent2.includes("Step 3 of 4") ||
          lastBotMessageContent2.includes("Step 4 of 4") ||
          lastBotMessageContent2.includes(
            "Would you like to proceed with creating a support ticket?"
          ))
      ) {
        const ticketResponse = await handleTicketCreationFlow(
          message,
          chat,
          userData.customer?.id
        );

        let assistantMessage;
        if (typeof ticketResponse === 'object' && ticketResponse.type === 'document_upload_modal') {
          assistantMessage = {
            sender: "bot",
            content: ticketResponse,
            timestamp: new Date(),
          };
        } else {
          assistantMessage = {
            sender: "bot",
            content: ticketResponse,
            timestamp: new Date(),
          };
        }

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
    } else {
      // 1. Retrieve ONLY relevant FAQs (Top 4) using the new RAG function
      const relevantFAQs = await retrieveRelevantFAQs(processedMessage, 4);
      console.log("🔹 RAG Retrieved", relevantFAQs.length, "relevant FAQs for query:", processedMessage);

      // 2. Format them for the AI Prompt
      const ragContent = relevantFAQs.length > 0
        ? relevantFAQs.map(faq => `Q: ${faq.Question}\nA: ${faq.Answer}`).join("\n\n")
        : "No specific FAQ matched. Answer based on general financial knowledge.";

      let userDataString = `
Customer: ${userData.customer?.name || "Unknown"} (ID: ${userData.customer?.id || "Unknown"
        }, RAYI ID: ${userData.customer?.rayi_customer_id || "Unknown"})
Email: ${userData.customer?.email || "unknown@email.com"}
Orders: ${userData.orders?.length || 0} orders
${userData.orders?.length > 0
          ? userData.orders
            .map(
              (order) =>
                `- Order ID: ${order.id}, Amount: ₹${parseFloat(
                  order.amount
                ).toLocaleString("en-IN")}, Status: ${order.payment_status
                }, Type: ${order.investment_type || "General"}, Date: ${new Date(
                  order.created_at || order.date
                ).toLocaleDateString("en-IN")}`
            )
            .join("\n")
          : "No orders available yet."
        }
Folios: ${userData.folios?.length || 0} folios
${userData.folios?.length > 0
          ? userData.folios
            .map((folio) => `- Folio: ${folio.folio_number}, MF ID: ${folio.mf_id}`)
            .join("\n")
          : "No folios available yet."
        }
SIPs: ${userData.sips?.length || 0} SIPs
${userData.sips?.length > 0
          ? userData.sips
            .map(
              (sip) =>
                `- SIP ID: ${sip.sip_id}, Fund ID: ${sip.mf_id}, Amount: ₹${parseFloat(
                  sip.amount
                ).toLocaleString("en-IN")}, Frequency: ${sip.frequency}, Status: ${sip.status
                }, Start Date: ${new Date(sip.start_date).toLocaleDateString(
                  "en-IN"
                )}${sip.end_date ? `, End Date: ${new Date(sip.end_date).toLocaleDateString("en-IN")}` : ""}`
            )
            .join("\n")
          : "No SIPs available yet."
        }
Mutual Funds: ${userData.mutualFunds?.length || 0} funds
${userData.mutualFunds?.length > 0
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
- Do not use tables in responses; use bullet points or plain text for data presentation.
- Don't ask any follow up questions.


**RELEVANT KNOWLEDGE BASE (RAG Context):**
The following FAQs are most relevant to the user's current query. Use this information as the PRIMARY source if it answers the question.
${ragContent}

**AUTHORIZATION SCOPE:**
You are authorized to discuss:
- Portfolio analysis and performance (including historical estimates).
- Investment holdings and allocations.
- Order history and transaction details.
- Systematic Investment Plans (SIPs) details and performance.
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
- Mutual fund searches (e.g., finding funds with specific holdings like "5% Nvidia").

**USER DATA ACCESS (from getUserData function):**
- Customer Name: ${userData.customer?.name || "Unknown"}
- Customer ID: ${userData.customer?.id || "Unknown"}
- RAYI Customer ID: ${userData.customer?.rayi_customer_id || "Unknown"}
- Email: ${userData.customer?.email || "unknown@email.com"}
- Total Orders: ${userData.orders?.length || 0}
- Total Folios: ${userData.folios?.length || 0}
- Total SIPs: ${userData.sips?.length || 0}
- Bank Accounts: ${userData.bankAccounts?.length || 0}
- UPI Accounts: ${userData.upiAccounts?.length || 0}
- Cards: ${userData.cards?.length || 0}
- Mutual Funds Invested: ${userData.mutualFundsInvested?.length || 0}

**CRITICAL ORDER INFORMATION:**
${userData.orders && userData.orders.length > 0
          ? `The user has ${userData.orders.length} order(s). Details:
${userData.orders
            .map(
              (order) => `- Order ID: ${order.id}
  - Amount: ₹${order.amount}
  - Payment Status: ${order.payment_status}
  - Investment ID: ${order.investment_id}
`
            )
            .join("")}
Order Details Count: ${userData.orderDetails?.length || 0}`
          : "The user currently has no orders in the system."
        }

**CRITICAL SIP INFORMATION:**
${userData.sips && userData.sips.length > 0
          ? `The user has ${userData.sips.length} SIP(s). Details:
${userData.sips
            .map(
              (sip) => `- SIP ID: ${sip.sip_id}
  - Fund ID: ${sip.mf_id}
  - Amount: ₹${sip.amount}
  - Frequency: ${sip.frequency}
  - Status: ${sip.status}
  - Start Date: ${new Date(sip.start_date).toLocaleDateString("en-IN")}
  - End Date: ${sip.end_date ? new Date(sip.end_date).toLocaleDateString("en-IN") : "Ongoing"}
  - Folio Number: ${sip.folio_number}
`
            )
            .join("")}`
          : "The user currently has no SIPs in the system."
        }

**Detailed Financial Data (from getUserData):**
- Customer Detail: ${userData.customerDetail
          ? JSON.stringify(userData.customerDetail)
          : "No customer details available"
        }
- Folios: ${userData.folios?.length || 0} folios (${JSON.stringify(userData.folios) || "No folios"
        })
- SIPs: ${userData.sips?.length || 0} SIPs (${JSON.stringify(userData.sips) || "No SIPs"
        })
- Performance Summary: ${userData.performanceSummary
          ? JSON.stringify(userData.performanceSummary)
          : "No performance summary"
        }
- Investment Performance: ${userData.investmentPerformance?.length || 0
        } records (${JSON.stringify(userData.investmentPerformance) || "No performance data"
        })
- Investment Returns: ${userData.investmentReturns?.length || 0} records (${JSON.stringify(userData.investmentReturns) || "No returns data"
        })
- Mutual Funds: ${userData.mutualFunds?.length || 0} funds (${JSON.stringify(userData.mutualFunds) || "No mutual funds"
        })
- Bank Accounts: ${JSON.stringify(userData.bankAccounts) || "No bank accounts"}
- UPI Accounts: ${JSON.stringify(userData.upiAccounts) || "No UPI accounts"}
- Cards: ${JSON.stringify(userData.cards) || "No cards"}
- Mutual Funds Invested: ${JSON.stringify(userData.mutualFundsInvested) ||
        "No mutual funds invested"
        }

**FAQ DATA ACCESS:**
- You have access to a set of Frequently Asked Questions (FAQs) stored in faqData.
- For queries classified as "FAQ", directly return the relevant FAQ answer if a match is found.
- If no exact match is found, answer like you answer to a general financial question.
- Example FAQ: "What is a Mutual Fund?" -> "A mutual fund is an investment option that pools money from multiple investors to invest in diversified assets like stocks, bonds, or other securities. The returns generated are distributed among investors in proportion to their investments, represented in the form of units."

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

**SIP Calculations (when requested):**
For "What if I continued my SIP for X years" or similar questions:
STEP 1: Monthly Investment = ₹[Amount]
STEP 2: Time Period = [Years] years
STEP 3: Assumed Annual Return = [X]% (based on user data or historical averages)
STEP 4: Number of Investments = [Years] × [12 for Monthly, 4 for Quarterly]
STEP 5: Future Value = ₹[Amount] × ((1 + [X]/100/12)^[Number of Investments] - 1) / ([X]/100/12)
STEP 6: Total Invested = ₹[Amount] × [Number of Investments]
STEP 7: Total Gain = ₹[Future Value] - ₹[Total Invested]
STEP 8: Total Return = [Percentage]%

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

**SIP Details (when requested):**
**SIP Details for [SIP ID]**
SIP ID: [SIP ID]
Fund: [Fund Name or MF ID]
Amount: ₹[Amount] per [Frequency]
Start Date: [Date]
End Date: [Date or Ongoing]
Status: [Status]
Folio Number: [Folio Number]
Total Invested: ₹[Calculated Total]
**Disclaimer**: SIP returns are subject to market risks. Past performance does not guarantee future results.

**Professional Disclaimers:**
- Data based on user records or assumptions - Market prices change constantly.
- Historical returns: Past performance doesn't guarantee future results.
- Calculations based on [specific methodology/assumptions].
- Mutual fund investments and SIPs are subject to market risks. Read all scheme-related documents carefully.
- For investments above ₹1 lakh, consider consulting a certified financial advisor.

**RESPONSE STRUCTURE:**
1. Answer: Direct and complete response to the user's query, using specific data from getUserData or clearly stated assumptions.
2. Data (if applicable): Relevant figures from getUserData or assumptions with clear notation.
3. Calculation (not on every answer wherever is asked or needed): Step-by-step breakdown of calculations, showing precise methodology.
4. Disclaimer (if relevant): Brief risk warnings, e.g., "Historical returns do not guarantee future results" or "Mutual fund investments are subject to market risks."

**QUALITY CONTROL CHECKLIST:**
Before sending any response, verify:
- Specific numbers provided (no ranges or approximations).
- Complete calculations shown step-by-step.
- Data sourced from getUserData or clearly stated assumptions.
- Professional formatting with clear structure.
- Appropriate disclaimers included.

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

For questions that require current events, live news, or real-time web knowledge to answer accurately, you MUST use the provided Web Search tools.

*STRICT NON-FINANCIAL QUERIES RULE:*
You are a specialized Financial Assistant. You must prioritize questions related to finance, investing, stock markets, mutual funds, personal wealth, or economics. 
However, you must ALSO be helpful and flexible. If a user asks to "compare" items, asks about their portfolio, or gives a short vague query, ALWAYS do your best to answer it using the available data or tools. 
If the user asks an obviously non-financial query (like coding, sports, history), politely remind them: "I specialize in finance, but..." and then provide a very brief, helpful answer anyway. Do NOT aggressively refuse to answer.`;

      // --- START OF UPDATED LOGIC ---

      // 1. Prepare the full message history
      const requestMessages = [
        { role: "system", content: systemPrompt },
        ...conversationMessages,
        { role: "user", content: processedMessage },
      ];

      // 2. Call OpenAI with MCP Tools enabled (No streaming for the tool-call detection phase)
      const completion = await openai.chat.completions.create({
        model: "gpt-4o", // Upgraded model for better tool calling and speed
        messages: requestMessages,
        max_tokens: maxTokens,
        temperature: 0.65,
        tools: mcpTools.length > 0 ? mcpTools : undefined, // Inject the tools we loaded globally
        tool_choice: "auto",
      });

      let aiResponse = completion.choices[0].message.content;
      const toolCalls = completion.choices[0].message.tool_calls;

      let toolImageUrls = [];

      // 3. Handle Tool Execution (If AI wants to check Stocks/MFs)
      if (toolCalls) {
        console.log(`🤖 AI requested ${toolCalls.length} tool(s)`);

        // Add the assistant's "intent" to call a tool to the history
        requestMessages.push(completion.choices[0].message);

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          console.log(`🔨 Executing MCP Tool: ${toolName}`);

          let toolResultContent;
          try {
            // Execute the tool via your Python MCP Server
            const result = await mcpClient.callTool({
              name: toolName,
              arguments: toolArgs
            });

            if (result.content && result.content.length > 0) {
              const imageContent = result.content.find(c => c.type === "image");
              if (imageContent) {
                // Intercept the image, save it to our array to render manually later
                toolImageUrls.push(`data:${imageContent.mimeType};base64,${imageContent.data}`);
                toolResultContent = `Chart generated successfully and displayed to the user. Do not try to describe the visual chart yourself. Just provide a brief financial summary based on the request.`;
              } else {
                // Standard text response
                toolResultContent = Array.isArray(result.content)
                  ? result.content.map(c => c.text).join("\n")
                  : JSON.stringify(result.content);
              }
            } else {
              toolResultContent = "No data returned from tool.";
            }

          } catch (error) {
            console.error(`❌ Tool execution failed: ${error.message}`);
            toolResultContent = `Error: Failed to fetch data for ${toolName}.`;
          }

          // Add the tool's result back to the conversation history
          requestMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResultContent
          });
        }
      }

      // 4. Handle Streaming vs Non-Streaming Final Response
      if (req.body.stream) {
        // Setup SSE Headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Inject the images right away before the AI starts typing
        let fullStreamedContent = "";
        if (toolImageUrls.length > 0) {
          const imageTags = toolImageUrls.map(url => `<br><img src="${url}" alt="Generated Chart" style="max-width: 100%; border-radius: 8px; margin: 10px 0; border: 1px solid var(--border);"><br>`).join("");
          fullStreamedContent += imageTags;
          res.write(`data: ${JSON.stringify({ chunk: imageTags })}\n\n`);
        }

        const streamResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: requestMessages,
          max_tokens: maxTokens,
          temperature: 0.65,
          stream: true,
        });

        for await (const chunk of streamResponse) {
          const chunkContent = chunk.choices[0]?.delta?.content || "";
          if (chunkContent) {
            fullStreamedContent += chunkContent;
            res.write(`data: ${JSON.stringify({ chunk: chunkContent })}\n\n`);
          }
        }

        aiResponse = stripHashtags(fullStreamedContent);

        if (aiResponse.length < 100 && queryType !== "GREETING" && queryType !== "NON-FINANCIAL") {
          const followup = "\n\nAnything else you’d like to explore about your finances, SIPs, or investments?";
          aiResponse += followup;
          res.write(`data: ${JSON.stringify({ chunk: followup })}\n\n`);
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
            { $set: { messages: chat.messages, updatedAt: chat.updatedAt }, $inc: { __v: 1 } }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        // Send final signal with chat ID
        res.write(`data: ${JSON.stringify({ final: true, chatId: chat._id })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      } else {
        // Non-streaming execution
        if (toolCalls) {
          const secondResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: requestMessages,
            max_tokens: maxTokens,
            temperature: 0.65,
          });
          aiResponse = secondResponse.choices[0].message.content;
        }

        // If tools returned images, prepend them to the AI's final text
        if (toolImageUrls.length > 0) {
          const imageTags = toolImageUrls.map(url => `<br><img src="${url}" alt="Generated Chart" style="max-width: 100%; border-radius: 8px; margin: 10px 0; border: 1px solid var(--border);"><br>`).join("");
          aiResponse = imageTags + "\n" + aiResponse;
        }

        aiResponse = stripHashtags(aiResponse);

        if (aiResponse.length < 100 && queryType !== "GREETING" && queryType !== "NON-FINANCIAL") {
          aiResponse += "\n\nAnything else you’d like to explore about your finances, SIPs, or investments?";
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
            { $set: { messages: chat.messages, updatedAt: chat.updatedAt }, $inc: { __v: 1 } }
          );
        } else {
          const result = await chatsCollection.insertOne(chat);
          chat._id = result.insertedId;
        }

        res.json(chat);
      }
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

    // Calculate from orders and SIPs data
    let totalInvested = 0;
    if (userData.orders && userData.orders.length > 0) {
      totalInvested += userData.orders
        .filter(
          (order) =>
            order.payment_status === "Paid" ||
            order.payment_status === "completed"
        )
        .reduce((sum, order) => sum + (parseFloat(order.amount) || 0), 0);
    }
    if (userData.sips && userData.sips.length > 0) {
      totalInvested += userData.sips
        .filter((sip) => sip.status === "Active")
        .reduce((sum, sip) => {
          const months = sip.frequency === "Monthly" ? 12 : 4;
          const duration = Math.max(
            1,
            Math.floor(
              (new Date() - new Date(sip.start_date)) / (1000 * 60 * 60 * 24 * 30)
            )
          );
          return sum + (parseFloat(sip.amount) || 0) * duration;
        }, 0);
    }

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
    if (userData.orders) {
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
    }
    if (userData.sips) {
      userData.sips.forEach((sip) => {
        const type = "SIP";
        if (!assetGroups[type]) {
          assetGroups[type] = 0;
        }
        if (sip.status === "Active") {
          const months = sip.frequency === "Monthly" ? 12 : 4;
          const duration = Math.max(
            1,
            Math.floor(
              (new Date() - new Date(sip.start_date)) / (1000 * 60 * 60 * 24 * 30)
            )
          );
          assetGroups[type] += (parseFloat(sip.amount) || 0) * duration;
        }
      });
    }

    portfolioData.assets = Object.entries(assetGroups).map(([name, value]) => ({
      name,
      value: value * 1.125,
    }));

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
    if (userData.sips && userData.sips.length > 0) {
      userData.sips.slice(0, 5).forEach((sip) => {
        transactions.push({
          type: `SIP - ${sip.sip_id}`,
          amount: parseFloat(sip.amount) || 0,
          date: sip.start_date,
          status: sip.status,
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
        sipsCount: userData.sips?.length || 0,
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
app.post("/api/text-to-speech", authenticateToken, async (req, res) => {
  try {
    const {
      text,
      voice = "en-US-Neural2-F",
      languageCode = "en-US",
      ssmlGender = "FEMALE",
      speakingRate = 1.0,
      pitch = 0.0,
      volumeGainDb = 0.0,
      effectsProfileId = [],
    } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Text is required for text-to-speech conversion",
      });
    }

    console.log("TTS Request:", {
      text: text.substring(0, 50) + "...",
      voice,
      languageCode,
      ssmlGender,
      speakingRate,
      pitch,
    });

    // Configure the request
    const request = {
      input: { text },
      voice: {
        name: voice,
        languageCode,
        ssmlGender,
      },
      audioConfig: {
        audioEncoding: "MP3",
        speakingRate,
        pitch,
        volumeGainDb,
        effectsProfileId,
      },
    };

    // Call the Text-to-Speech API
    const [response] = await ttsClient.synthesizeSpeech(request);

    // Send the audio content as a Buffer
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": response.audioContent.length,
    });
    res.send(response.audioContent);
  } catch (error) {
    console.error("Text-to-speech error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating speech",
      error: error.message,
    });
  }
});

// Get available voices endpoint
app.get("/api/text-to-speech/voices", authenticateToken, async (req, res) => {
  try {
    const [result] = await ttsClient.listVoices({});
    const voices = result.voices.map((voice) => ({
      name: voice.name,
      languageCode: voice.languageCodes[0],
      ssmlGender: voice.ssmlGender,
      naturalSampleRateHertz: voice.naturalSampleRateHertz,
    }));

    res.json({
      success: true,
      voices,
    });
  } catch (error) {
    console.error("Error listing voices:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching available voices",
      error: error.message,
    });
  }
});

// Save user voice preferences
app.post(
  "/api/text-to-speech/preferences",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        voice,
        languageCode,
        ssmlGender,
        speakingRate,
        pitch,
        volumeGainDb,
      } = req.body;

      const userId = req.user._id;

      const db = mongoClient.db("financeai");
      const preferencesCollection = db.collection("tts_preferences");

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
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      res.json({
        success: true,
        message: "Voice preferences saved successfully",
      });
    } catch (error) {
      console.error("Error saving voice preferences:", error);
      res.status(500).json({
        success: false,
        message: "Error saving voice preferences",
        error: error.message,
      });
    }
  }
);

// Get user voice preferences
app.get(
  "/api/text-to-speech/preferences",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user._id;

      const db = mongoClient.db("financeai");
      const preferencesCollection = db.collection("tts_preferences");

      const preferences = await preferencesCollection.findOne({
        userId: new ObjectId(userId),
      });

      if (preferences) {
        res.json({
          success: true,
          preferences: {
            voice: preferences.voice,
            languageCode: preferences.languageCode,
            ssmlGender: preferences.ssmlGender,
            speakingRate: preferences.speakingRate,
            pitch: preferences.pitch,
            volumeGainDb: preferences.volumeGainDb,
          },
        });
      } else {
        // Return default preferences if none are saved
        res.json({
          success: true,
          preferences: {
            voice: "en-US-Neural2-F",
            languageCode: "en-US",
            ssmlGender: "FEMALE",
            speakingRate: 1.0,
            pitch: 0.0,
            volumeGainDb: 0.0,
          },
        });
      }
    } catch (error) {
      console.error("Error fetching voice preferences:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching voice preferences",
        error: error.message,
      });
    }
  }
);

// Convert bot response to speech
app.post(
  "/api/chat/:chatId/message/:messageId/speech",
  authenticateToken,
  async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const userId = req.user._id;

      if (!ObjectId.isValid(chatId) || !ObjectId.isValid(messageId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid chat or message ID format",
        });
      }

      // Get user's voice preferences
      const db = mongoClient.db("financeai");
      const preferencesCollection = db.collection("tts_preferences");
      const chatsCollection = db.collection("chats");

      // Fetch the message text
      const chat = await chatsCollection.findOne({
        _id: new ObjectId(chatId),
        userId: new ObjectId(userId),
      });

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      // Find the specific message by its _id
      const message = chat.messages.find(
        (msg) => msg._id && msg._id.toString() === messageId
      );

      if (!message) {
        return res.status(404).json({
          success: false,
          message: "Message not found in chat",
        });
      }

      // Only bot messages can be converted to speech
      if (message.sender !== "bot") {
        return res.status(400).json({
          success: false,
          message: "Only bot messages can be converted to speech",
        });
      }

      // Get user's voice preferences or use defaults
      const preferences = (await preferencesCollection.findOne({
        userId: new ObjectId(userId),
      })) || {
        voice: "en-US-Neural2-F",
        languageCode: "en-US",
        ssmlGender: "FEMALE",
        speakingRate: 1.0,
        pitch: 0.0,
        volumeGainDb: 0.0,
      };

      // Clean the text for text-to-speech
      let cleanText = message.content
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")
        .replace(/```[^`]*```/g, "")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ");

      // Configure the TTS request
      const request = {
        input: { text: cleanText },
        voice: {
          name: preferences.voice,
          languageCode: preferences.languageCode,
          ssmlGender: preferences.ssmlGender,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: preferences.speakingRate,
          pitch: preferences.pitch,
          volumeGainDb: preferences.volumeGainDb,
        },
      };

      console.log("Converting to speech:", {
        messageId,
        textLength: cleanText.length,
        voice: preferences.voice,
        speakingRate: preferences.speakingRate,
        pitch: preferences.pitch,
      });

      // Call the Text-to-Speech API
      const [response] = await ttsClient.synthesizeSpeech(request);

      // Send the audio content as a Buffer
      res.set({
        "Content-Type": "audio/mpeg",
        "Content-Length": response.audioContent.length,
      });
      res.send(response.audioContent);
    } catch (error) {
      console.error("Error converting message to speech:", error);
      res.status(500).json({
        success: false,
        message: "Error converting message to speech",
        error: error.message,
      });
    }
  }
);

// Add ticket routes
const ticketRoutes = require('./routes/ticketRoutes');
app.set('mongoClient', () => mongoClient); // Make mongoClient available to routes
app.use("/api/tickets", ticketRoutes);

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

const PORT = process.env.PORT || 5000;
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
