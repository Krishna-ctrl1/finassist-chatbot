const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const rateLimit = require("express-rate-limit");
const apiRoutes = require("./routes/api");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId, GridFSBucket } = require("mongodb");
const CustomerMutualFunds = require("./models/customerMutualFundsModel");
const OpenAI = require("openai");
const nodemailer = require("nodemailer");

// Import ticket model
const Ticket = require("./models/ticketModel");

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Configure nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
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

    app.set("mongoClient", mongoClient);

    const db = mongoClient.db("financeai");

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
  windowMs: 15 * 60 * 1000,
  max: 100,
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

    const [
      customer,
      customerDetail,
      folios,
      performanceSummary,
      investmentPerformance,
      investmentReturns,
      orders,
      bankAccounts,
      upiAccounts,
      cards,
      mutualFundsInvested, // Add this to fetch customer_mutual_funds
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
        .collection("customer_bank_accounts")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching bank accounts:", err);
          return [];
        }),
      db
        .collection("customer_upi")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching UPI accounts:", err);
          return [];
        }),
      db
        .collection("customer_cards")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching cards:", err);
          return [];
        }),
      db
        .collection("customer_mutual_funds")
        .find({ customer_id: numericCustomerId })
        .toArray()
        .catch((err) => {
          console.error("Error fetching customer mutual funds:", err);
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
        ...(mutualFundsInvested || []).map((m) => m?.fund_name), // Include fund names or IDs if applicable
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
      bankAccountsCount: bankAccounts?.length || 0,
      upiAccountsCount: upiAccounts?.length || 0,
      cardsCount: cards?.length || 0,
      mutualFundsInvestedCount: mutualFundsInvested?.length || 0, // Log mutual funds count
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
      bankAccounts: bankAccounts || [],
      upiAccounts: upiAccounts || [],
      cards: cards || [],
      mutualFundsInvested: mutualFundsInvested || [], // Add mutual funds data
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
      bankAccounts: [],
      upiAccounts: [],
      cards: [],
      mutualFundsInvested: [], // Add mutual funds data in case of error
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

  Object.keys(entityMapping).forEach((key) => {
    const regex = new RegExp(`\\b${key}\\b`, "gi");
    processedMessage = processedMessage.replace(regex, entityMapping[key]);
  });

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
            .slice(-7)
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
6. "INVESTMENT_REQUEST" - Requests to start an investment, like "I want to make an investment", "start investing", "invest money"

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
      "INVESTMENT_REQUEST",
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

  const investmentKeywords = [
    "make an investment",
    "start investing",
    "invest money",
    "i want to make an investment",
    "i want to invest",
    "start an sip",
    "lumpsum investment",
  ];

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

  const hasInvestmentKeyword = investmentKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasFinancialKeyword = financialKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );
  const hasUserSpecific = lowerMessage.includes("my ");

  if (hasInvestmentKeyword) {
    return "INVESTMENT_REQUEST";
  }

  if (!hasFinancialKeyword) {
    return "NON-FINANCIAL";
  }

  return hasUserSpecific ? "USER-SPECIFIC-FINANCIAL" : "GENERAL-FINANCIAL";
}

// Function to check if message is an investment request
function checkIfInvestmentRequest(message, conversationContext, chat) {
  const lowerMessage = message.toLowerCase().trim();

  const investmentKeywords = [
    "make an investment",
    "start investing",
    "invest money",
    "i want to make an investment",
    "i want to invest",
    "start an sip",
    "lumpsum investment",
    "sip",
    "lumpsum",
  ];

  const cancellationKeywords = [
    "cancel my sip",
    "pause my sip",
    "stop my sip",
    "cancel my lumpsum",
    "pause my lumpsum",
    "stop my lumpsum",
    "cancel an investment",
    "pause an investment",
  ];

  const hasInvestmentKeyword = investmentKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  const hasCancellationKeyword = cancellationKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  const workflowState = chat.workflowState || {};
  const isInWorkflow = workflowState.step && workflowState.step >= 1;

  // Check if the message is part of an ongoing investment or cancellation/pause workflow
  const isInInvestmentFlow = isInWorkflow && conversationContext.some(
    (msg) =>
      msg.content &&
      (msg.content.toLowerCase().includes("sip or lumpsum") ||
        msg.content.toLowerCase().includes("step") ||
        msg.content.toLowerCase().includes("investing for a specific goal") ||
        msg.content.toLowerCase().includes("accumulate for this goal") ||
        msg.content.toLowerCase().includes("mutual fund") ||
        msg.content.toLowerCase().includes("otp sent") ||
        msg.content.toLowerCase().includes("payment mandate") ||
        msg.content.toLowerCase().includes("pay using your saved upi") ||
        msg.content.toLowerCase().includes("select the investment") ||
        msg.content.toLowerCase().includes("authorize the cancel") ||
        msg.content.toLowerCase().includes("authorize the pause") ||
        msg.content.toLowerCase().includes("your recent active investments"))
  );

  console.log("checkIfInvestmentRequest:", {
    message: lowerMessage,
    hasInvestmentKeyword,
    hasCancellationKeyword,
    isInInvestmentFlow,
    isInWorkflow,
    workflowState,
  });

  // Return true for both investment and cancellation/pause requests
  return hasInvestmentKeyword || hasCancellationKeyword || isInInvestmentFlow;
}

// Function to generate OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Function to send OTP via email
async function sendOTPEmail(email, otp) {
  try {
    if (!EMAIL_USER || !EMAIL_PASS) {
      throw new Error(
        "Email configuration is missing (EMAIL_USER or EMAIL_PASS)"
      );
    }

    const mailOptions = {
      from: EMAIL_USER,
      to: email,
      subject: "Investment Authorization OTP",
      text: `Your OTP for authorizing the investment is ${otp}. It is valid for 10 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP ${otp} sent to ${email}`);
    return true;
  } catch (error) {
    console.error(`Error sending OTP to ${email}:`, error.message);
    return false;
  }
}
 
// Function to handle cancel/pause workflow
async function handleCancelPauseWorkflow(message, chat, user) {
  const lowerMessage = message.toLowerCase().trim();
  const conversationHistory = chat.messages || [];
  const lastBotMessage = conversationHistory
    .slice()
    .reverse()
    .find((msg) => msg.sender === "bot");
  const lastBotContent = lastBotMessage?.content || "";
  const db = mongoClient.db("financeai");

  chat.workflowState = chat.workflowState || {};
  const workflowState = chat.workflowState;

  // Step 1: Check if it's a new cancel/pause request or a specific cancellation
  const isInitialRequest =
    (lowerMessage.includes("cancel my sip") ||
      lowerMessage.includes("pause my sip") ||
      lowerMessage.includes("stop my sip") ||
      lowerMessage.includes("cancel my lumpsum") ||
      lowerMessage.includes("pause my lumpsum") ||
      lowerMessage.includes("stop my lumpsum") ||
      lowerMessage.includes("cancel an investment") ||
      lowerMessage.includes("pause an investment")) &&
    !lastBotContent.includes("Your recent active investments");

  const isSpecificCancelRequest =
    (lowerMessage.includes("cancel") || lowerMessage.includes("pause")) &&
    (lowerMessage.includes("sip") || lowerMessage.includes("lumpsum")) &&
    lowerMessage.includes("in");

  if (isInitialRequest) {
    const action = lowerMessage.includes("cancel") ? "cancel" : "pause";
    workflowState.action = action;

    // Fetch user's active mutual funds
    const mutualFunds = await db
      .collection("customer_mutual_funds")
      .find({
        customer_id: parseInt(user.customerId || user.id),
        status: "Active",
      })
      .toArray();

    if (!mutualFunds || mutualFunds.length === 0) {
      chat.workflowState = {};
      return {
        shouldRespond: true,
        response: `No active investments found to ${action}.`,
        tempData: { step: null },
      };
    }

    // Format each investment as a numbered item
    const formattedInvestments = mutualFunds
      .map((mf, index) => {
        const details = [
          `${index + 1}. ${mf.fund_name} (${mf.investment_type})`,
          `Amount: ₹${mf.amount.toLocaleString("en-IN")}`,
          `Goal: ${mf.goal || "General"}`,
        ];
        if (mf.investment_type === "SIP") {
          details.push(`Deduction: ${mf.deduction_date}`);
        }
        return details.join(" - ");
      })
      .join("\n");

    workflowState.mutualFunds = mutualFunds;
    workflowState.step = 1;
    const responseMessage = `Your recent active investments:\n\n${formattedInvestments}\n\nPlease reply with the number (1-${mutualFunds.length}) to ${action} or "Cancel" to exit.`;

    return {
      shouldRespond: true,
      response: responseMessage,
      tempData: { step: 1, action, mutualFunds },
    };
  }

  // Handle specific cancellation/pause request (e.g., "Cancel SIP of ₹4,790 in Mirae Asset Large Cap Fund")
  if (isSpecificCancelRequest && !workflowState.step) {
    const action = lowerMessage.includes("cancel") ? "cancel" : "pause";
    const mutualFunds = await db
      .collection("customer_mutual_funds")
      .find({
        customer_id: parseInt(user.customerId || user.id),
        status: "Active",
      })
      .toArray();

    if (!mutualFunds || mutualFunds.length === 0) {
      chat.workflowState = {};
      return {
        shouldRespond: true,
        response: `No active investments found to ${action}.`,
        tempData: { step: null },
      };
    }

    // Parse the message to extract fund name and amount
    const matchFund = lowerMessage.match(/in\s+(.+?)\s*(?:fund|$)/i);
    const matchAmount = lowerMessage.match(/₹?\s*([\d,]+)\s*(?:\/month)?/i);
    const fundName = matchFund ? matchFund[1].trim() : null;
    const amount = matchAmount ? parseFloat(matchAmount[1].replace(/,/g, "")) : null;
    const isSIP = lowerMessage.includes("sip");

    const matchedInvestment = mutualFunds.find(
      (mf) =>
        mf.fund_name.toLowerCase().includes(fundName) &&
        mf.amount === amount &&
        mf.investment_type === (isSIP ? "SIP" : "Lumpsum")
    );

    if (!matchedInvestment) {
      // If no specific match, show the numbered list
      const formattedInvestments = mutualFunds
        .map((mf, index) => {
          const details = [
            `${index + 1}. ${mf.fund_name} (${mf.investment_type})`,
            `Amount: ₹${mf.amount.toLocaleString("en-IN")}`,
            `Goal: ${mf.goal || "General"}`,
          ];
          if (mf.investment_type === "SIP") {
            details.push(`Deduction: ${mf.deduction_date}`);
          }
          return details.join(" - ");
        })
        .join("\n");

      workflowState.mutualFunds = mutualFunds;
      workflowState.step = 1;
      workflowState.action = action;
      return {
        shouldRespond: true,
        response: `Could not find the specified investment. Here are your recent active investments:\n\n${formattedInvestments}\n\nPlease reply with the number (1-${mutualFunds.length}) to ${action} or "Cancel" to exit.`,
        tempData: { step: 1, action, mutualFunds },
      };
    }

    workflowState.selectedInvestment = matchedInvestment;
    workflowState.step = 2;
    workflowState.action = action;

    const responseMessage = `Confirm ${action} of ${matchedInvestment.fund_name} (${matchedInvestment.investment_type}, ₹${matchedInvestment.amount.toLocaleString("en-IN")}). Reply "Confirm" or "Cancel".`;

    return {
      shouldRespond: true,
      response: responseMessage,
      tempData: { step: 2, selectedInvestment: matchedInvestment, action },
    };
  }

  // Step 2: Handle investment selection (by number, "Cancel <number>", or just "<number>")
  if (
    (lastBotContent.includes("Your recent active investments") || lastBotContent.includes("Could not find the specified investment")) &&
    workflowState.step === 1
  ) {
    if (lowerMessage === "cancel") {
      chat.workflowState = {};
      return {
        shouldRespond: true,
        response: `Cancelled the ${workflowState.action} request.`,
        tempData: { step: null },
      };
    }

    // Handle "Cancel <number>", "Pause <number>", or just "<number>"
    let selectionIndex;
    if (lowerMessage.startsWith("cancel ") || lowerMessage.startsWith("pause ")) {
      selectionIndex = parseInt(lowerMessage.split(" ")[1]) - 1;
    } else {
      selectionIndex = parseInt(message) - 1;
    }

    const mutualFunds = workflowState.mutualFunds || [];

    if (isNaN(selectionIndex) || selectionIndex < 0 || selectionIndex >= mutualFunds.length) {
      return {
        shouldRespond: true,
        response: `Please reply with a number (1-${mutualFunds.length}) to ${workflowState.action}, or "Cancel" to exit.`,
        tempData: { step: 1, action: workflowState.action, mutualFunds },
      };
    }

    const selectedInvestment = mutualFunds[selectionIndex];
    workflowState.selectedInvestment = selectedInvestment;
    workflowState.step = 2;

    const responseMessage = `Confirm ${workflowState.action} of ${selectedInvestment.fund_name} (${selectedInvestment.investment_type}, ₹${selectedInvestment.amount.toLocaleString("en-IN")}). Reply "Confirm" or "Cancel".`;

    return {
      shouldRespond: true,
      response: responseMessage,
      tempData: { step: 2, selectedInvestment, action: workflowState.action },
    };
  }

  // Step 3: Handle confirmation
  if (
    lastBotContent.includes("Reply \"Confirm\"") &&
    workflowState.step === 2
  ) {
    if (lowerMessage === "cancel") {
      chat.workflowState = {};
      return {
        shouldRespond: true,
        response: `Cancelled the ${workflowState.action} request.`,
        tempData: { step: null },
      };
    }

    if (lowerMessage === "confirm") {
      const otp = generateOTP();
      workflowState.otp = otp;
      workflowState.otpTimestamp = Date.now();

      const emailSent = await sendOTPEmail(user.email, otp);
      if (!emailSent) {
        return {
          shouldRespond: true,
          response: `Failed to send OTP to ${user.email}. Please try again or contact support.`,
          tempData: { step: 2, selectedInvestment: workflowState.selectedInvestment, action: workflowState.action },
        };
      }

      workflowState.step = 3;
      return {
        shouldRespond: true,
        response: `OTP sent to ${user.email}. Enter the 6-digit OTP to ${workflowState.action}.`,
        tempData: {
          step: 3,
          selectedInvestment: workflowState.selectedInvestment,
          otp,
          otpTimestamp: Date.now(),
          action: workflowState.action,
        },
      };
    }

    return {
      shouldRespond: true,
      response: `Please reply "Confirm" or "Cancel".`,
      tempData: { step: 2, selectedInvestment: workflowState.selectedInvestment, action: workflowState.action },
    };
  }

  // Step 4: OTP Verification
  if (
    lastBotContent.includes("Enter the 6-digit OTP") &&
    workflowState.step === 3
  ) {
    if (lowerMessage === "resend otp") {
      const otp = generateOTP();
      workflowState.otp = otp;
      workflowState.otpTimestamp = Date.now();

      const emailSent = await sendOTPEmail(user.email, otp);
      if (!emailSent) {
        return {
          shouldRespond: true,
          response: `Failed to resend OTP to ${user.email}. Please try again or contact support.`,
          tempData: { step: 3, selectedInvestment: workflowState.selectedInvestment, action: workflowState.action },
        };
      }

      return {
        shouldRespond: true,
        response: `New OTP sent to ${user.email}. Please enter the 6-digit OTP.`,
        tempData: { otp, otpTimestamp: Date.now(), action: workflowState.action, selectedInvestment: workflowState.selectedInvestment },
      };
    }

    if (
      message === workflowState.otp &&
      Date.now() - workflowState.otpTimestamp < 10 * 60 * 1000
    ) {
      try {
        const selectedInvestment = workflowState.selectedInvestment;
        const newStatus = workflowState.action === "cancel" ? "Cancelled" : "Paused";

        // Update customer_mutual_funds collection
        const updateResult = await db.collection("customer_mutual_funds").updateOne(
          {
            _id: new ObjectId(selectedInvestment._id),
            customer_id: parseInt(user.customerId || user.id),
          },
          {
            $set: { status: newStatus, updated_at: new Date() },
          }
        );

        if (updateResult.matchedCount === 0) {
          return {
            shouldRespond: true,
            response: `Error: Could not ${workflowState.action} investment. Please try again or contact support.`,
            tempData: { step: null },
          };
        }

        // Update corresponding order status
        await db.collection("order").updateOne(
          {
            id: selectedInvestment.order_id,
            customer_id: parseInt(user.customerId || user.id),
          },
          {
            $set: { payment_status: newStatus, updated_at: new Date() },
          }
        );

        chat.workflowState = {};
        return {
          shouldRespond: true,
          response: `${selectedInvestment.fund_name} (${selectedInvestment.investment_type}, ₹${selectedInvestment.amount.toLocaleString("en-IN")}) ${newStatus.toLowerCase()}.`,
          tempData: { step: null },
        };
      } catch (error) {
        console.error(`Error ${workflowState.action}ing investment:`, error);
        return {
          shouldRespond: true,
          response: `Error ${workflowState.action}ing investment. Please try again or contact support.`,
          tempData: { step: null },
        };
      }
    }

    return {
      shouldRespond: true,
      response: `Invalid or expired OTP. Please enter a valid 6-digit OTP or say "Resend OTP".`,
      tempData: { step: 3, selectedInvestment: workflowState.selectedInvestment, action: workflowState.action },
    };
  }

  return {
    shouldRespond: false,
    response: "",
  };
}

// Function to handle investment workflow
async function handleInvestmentWorkflow(message, chat, user) {
  const lowerMessage = message.toLowerCase().trim();
  const conversationHistory = chat.messages || [];
  const lastBotMessage = conversationHistory
    .slice()
    .reverse()
    .find((msg) => msg.sender === "bot");
  const lastBotContent = lastBotMessage?.content || "";
  const userData = await getUserData(user.customerId || user.id);

  chat.workflowState = chat.workflowState || {};
  const workflowState = chat.workflowState;

  console.log("Investment Workflow - Message:", message);
  console.log("Last Bot Content:", lastBotContent);
  console.log("Current Workflow State:", workflowState);

  const investmentKeywords = [
    "make an investment",
    "start investing",
    "invest money",
    "i want to make an investment",
    "i want to invest",
    "start an sip",
    "lumpsum investment",
  ];
  const isInitialRequest =
    investmentKeywords.some((keyword) => lowerMessage.includes(keyword)) &&
    !lastBotContent.includes("Step");

  if (isInitialRequest) {
    console.log("Starting new investment workflow - Step 1");
    workflowState.step = 1;
    workflowState.investmentType = null;
    return {
      shouldRespond: true,
      response: `Great! Would you like to start a SIP (Systematic Investment Plan) or make a Lumpsum investment?\n\n**Options:**\n- SIP\n- Lumpsum`,
      tempData: { step: 1 },
    };
  }

  // SIP Flow: Step 2 - Ask for investment goal
  if (
    lowerMessage === "sip" &&
    (lastBotContent.includes("SIP or Lumpsum") || workflowState.step === 1)
  ) {
    console.log("Advancing to Step 2 - Investment Goal");
    workflowState.step = 2;
    workflowState.investmentType = "SIP";
    return {
      shouldRespond: true,
      response: `Awesome! Let’s get started.\n**Step 2 of 6: Investment Goal**\n\nAre you investing for a specific goal like education, retirement, or just growing wealth?`,
      tempData: { step: 2, investmentType: "SIP" },
    };
  }

  if (
    lastBotContent.includes("Step 2 of 6") &&
    lastBotContent.includes("Investment Goal")
  ) {
    workflowState.step = 3;
    workflowState.goal = message;
    return {
      shouldRespond: true,
      response: `Got it, you're investing for ${message}.\n**Step 3 of 6: Target Amount**\n\nHow much do you want to accumulate for this goal? (e.g., ₹20 lakhs)`,
      tempData: { step: 3, goal: message },
    };
  }

  if (
    lastBotContent.includes("Step 3 of 6") &&
    lastBotContent.includes("Target Amount")
  ) {
    const targetAmount = message.match(
      /₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lakhs)?/i
    );
    if (targetAmount) {
      let amount = parseFloat(targetAmount[1].replace(/,/g, ""));
      if (targetAmount[2]) amount *= 100000;
      workflowState.step = 4;
      workflowState.targetAmount = amount;
      return {
        shouldRespond: true,
        response: `Noted, your target is ₹${amount.toLocaleString(
          "en-IN"
        )}.\n**Step 4 of 6: Investment Horizon**\n\nIn how many years do you want to achieve this goal?`,
        tempData: { step: 4, targetAmount: amount },
      };
    } else {
      return {
        shouldRespond: true,
        response: `Please provide a valid amount (e.g., ₹20 lakhs or ₹2000000).`,
      };
    }
  }

  if (
    lastBotContent.includes("Step 4 of 6") &&
    lastBotContent.includes("Investment Horizon")
  ) {
    const years = parseInt(message);
    if (isNaN(years) || years <= 0) {
      return {
        shouldRespond: true,
        response: `Please provide a valid number of years (e.g., 15).`,
      };
    }

    const targetAmount = workflowState.targetAmount || 0;
    const monthlyRate = 0.12 / 12;
    const months = years * 12;
    const sipAmount = Math.round(
      targetAmount / ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate)
    );

    workflowState.step = 5;
    workflowState.years = years;
    workflowState.sipAmount = sipAmount;
    return {
      shouldRespond: true,
      response: `To reach ₹${targetAmount.toLocaleString(
        "en-IN"
      )} in ${years} years, you should invest about ₹${sipAmount.toLocaleString(
        "en-IN"
      )}/month (at ~12% return).\n\n**Step 5 of 6: Confirm SIP Amount**\n\nWould you like to go with this or enter your own amount? (Reply "Go with this" or specify an amount, e.g., ₹5000)`,
      tempData: { step: 5, years, sipAmount },
    };
  }

  if (
    lastBotContent.includes("Step 5 of 6") &&
    lastBotContent.includes("Confirm SIP Amount")
  ) {
    let sipAmount = 0;
    if (lowerMessage === "go with this") {
      sipAmount = workflowState.sipAmount || 0;
    } else {
      const amountMatch = message.match(/₹?\s*([\d,]+)/);
      if (amountMatch) {
        sipAmount = parseInt(amountMatch[1].replace(/,/g, ""));
      } else {
        return {
          shouldRespond: true,
          response: `Please specify a valid amount (e.g., ₹5000) or say "Go with this".`,
        };
      }
    }

    workflowState.step = 6;
    workflowState.sipAmount = sipAmount;
    return {
      shouldRespond: true,
      response: `Got it, your SIP amount is ₹${sipAmount.toLocaleString(
        "en-IN"
      )}/month.\n**Step 6 of 6: Choose Mutual Fund**\n\nWould you like me to recommend a mutual fund, or do you want to pick one yourself?\n\n**Options:**\n- Recommend for me\n- I’ll choose`,
      tempData: { step: 6, sipAmount },
    };
  }

  if (
    lastBotContent.includes("Step 6 of 6") &&
    lastBotContent.includes("Choose Mutual Fund")
  ) {
    if (lowerMessage.includes("recommend for me")) {
      const fund = workflowState.goal?.toLowerCase().includes("retirement")
        ? "Mirae Asset Large Cap Fund (Direct – Growth)"
        : "SBI Bluechip Fund (Direct – Growth)";
      workflowState.fund = fund;
      return {
        shouldRespond: true,
        response: `Based on your goal and timeline, I suggest ${fund}.\nWould you like to go ahead with this? (Reply "Yes" or "No")`,
        tempData: { step: 7, fund },
      };
    } else if (lowerMessage.includes("i’ll choose")) {
      return {
        shouldRespond: true,
        response: `Please specify the mutual fund you'd like to invest in (e.g., Mirae Asset Large Cap Fund).`,
      };
    } else {
      return {
        shouldRespond: true,
        response: `Please choose an option: "Recommend for me" or "I’ll choose".`,
      };
    }
  }

  if (
    (lastBotContent.includes("suggest") || lastBotContent.includes("chosen")) &&
    (lastBotContent.includes("mutual fund") ||
      lastBotContent.includes("SBI Bluechip Fund") ||
      lastBotContent.includes("Mirae Asset Large Cap Fund")) &&
    lowerMessage === "yes" &&
    workflowState.step === 7
  ) {
    console.log("Advancing to Step 8 - Investment Summary and Deduction Date");
    workflowState.step = 8;
    const { sipAmount, fund, goal, targetAmount, years } = workflowState;
    return {
      shouldRespond: true,
      response: `Here’s a summary of your SIP investment:\n\n**Goal:** ${
        goal || "General"
      }\n**Target Amount:** ₹${targetAmount.toLocaleString(
        "en-IN"
      )}\n**Horizon:** ${years} years\n**SIP Amount:** ₹${sipAmount.toLocaleString(
        "en-IN"
      )}/month\n**Mutual Fund:** ${fund}\n\nWhich date should your SIP be deducted each month? (e.g., 1st, 5th, 10th)`,
      tempData: { step: 8 },
    };
  }

  if (
    lastBotContent.includes("deducted each month") &&
    message.match(/\d+(st|nd|rd|th)/i)
  ) {
    const dayMatch = message.match(/\d+/);
    const day = parseInt(dayMatch[0]);
    if (day < 1 || day > 28) {
      return {
        shouldRespond: true,
        response: `Please select a valid date between the 1st and 28th of the month.`,
      };
    }

    const otp = generateOTP();
    workflowState.step = 9;
    workflowState.deductionDate = message;
    workflowState.otp = otp;
    workflowState.otpTimestamp = Date.now();

    const emailSent = await sendOTPEmail(user.email, otp);
    if (!emailSent) {
      return {
        shouldRespond: true,
        response: `Failed to send OTP to your registered email. Please try again or contact support.`,
      };
    }

    return {
      shouldRespond: true,
      response: `Please enter the OTP sent to your registered email (${user.email}) to authorize the investment.`,
      tempData: {
        step: 9,
        deductionDate: message,
        otp,
        otpTimestamp: Date.now(),
      },
    };
  }

  if (
    lastBotContent.includes("OTP sent to your registered email") &&
    workflowState.investmentType === "SIP"
  ) {
    if (
      message === workflowState.otp &&
      Date.now() - workflowState.otpTimestamp < 10 * 60 * 1000
    ) {
      const paymentMethods = [];
      if (userData.bankAccounts && userData.bankAccounts.length > 0) {
        userData.bankAccounts.forEach((account, index) => {
          paymentMethods.push({
            id: `bank_${account._id}`,
            display: `Bank Account: ${account.bank_name} (****${
              account.account_number?.slice(-4) || "unknown"
            })`,
          });
        });
      }
      if (userData.upiAccounts && userData.upiAccounts.length > 0) {
        userData.upiAccounts.forEach((upi, index) => {
          paymentMethods.push({
            id: `upi_${upi._id}`,
            display: `UPI: ${upi.upi_id}`,
          });
        });
      }
      if (userData.cards && userData.cards.length > 0) {
        userData.cards.forEach((card, index) => {
          paymentMethods.push({
            id: `card_${card._id}`,
            display: `Card: ${card.card_type} (****${
              card.card_number?.slice(-4) || "unknown"
            })`,
          });
        });
      }

      let responseMessage = `OTP verified!\nPlease select a payment method for your SIP investment:\n\n`;
      if (paymentMethods.length > 0) {
        responseMessage +=
          paymentMethods
            .map((method, index) => `${index + 1}. ${method.display}`)
            .join("\n") +
          `\n${paymentMethods.length + 1}. Add a new payment method`;
        workflowState.paymentMethods = paymentMethods;
        return {
          shouldRespond: true,
          response: responseMessage,
          tempData: { step: 10, paymentMethods },
        };
      } else {
        return {
          shouldRespond: true,
          response: `No saved payment methods found. Would you like to add a new payment method? (Reply "Yes" or "Cancel")`,
          tempData: { step: 10, paymentMethods: [] },
        };
      }
    } else {
      return {
        shouldRespond: true,
        response: `Invalid or expired OTP. Please enter a valid 6-digit OTP or request a new one by saying "Resend OTP".`,
      };
    }
  }

  if (
    lastBotContent.includes("Please select a payment method") &&
    workflowState.step === 10
  ) {
    if (lowerMessage === "resend otp") {
      const otp = generateOTP();
      workflowState.otp = otp;
      workflowState.otpTimestamp = Date.now();

      const emailSent = await sendOTPEmail(user.email, otp);
      if (!emailSent) {
        return {
          shouldRespond: true,
          response: `Failed to send OTP to your registered email. Please try again or contact support.`,
        };
      }

      return {
        shouldRespond: true,
        response: `A new OTP has been sent to your registered email (${user.email}). Please enter the OTP.`,
        tempData: { otp, otpTimestamp: Date.now() },
      };
    }

    const paymentMethods = workflowState.paymentMethods || [];
    const selectionIndex = parseInt(message) - 1;

    if (
      message.toLowerCase() === "add a new payment method" ||
      (selectionIndex === paymentMethods.length && paymentMethods.length > 0)
    ) {
      workflowState.step = 11;
      return {
        shouldRespond: true,
        response: `Please provide the details for the new payment method:\n- Type (Bank Account, UPI, or Card)\n- Details (e.g., for Bank: bank name, account number, IFSC; for UPI: UPI ID; for Card: card type, card number, expiry, CVV)`,
        tempData: { step: 11 },
      };
    }

    if (selectionIndex >= 0 && selectionIndex < paymentMethods.length) {
      const selectedMethod = paymentMethods[selectionIndex];
      workflowState.selectedPaymentMethod = selectedMethod.id;

      try {
        const { sipAmount, fund, deductionDate, goal, targetAmount, years } =
          workflowState;
        const db = mongoClient.db("financeai");

        // Create order in the 'order' collection
        const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 10000)}`;
        const order = {
          customer_id: user.customerId || user.id,
          id: orderId,
          amount: sipAmount,
          investment_type: "SIP",
          payment_status: "Pending",
          created_at: new Date(),
          fund_name: fund,
          deduction_date: deductionDate,
          goal: goal || "General",
          target_amount: targetAmount || 0,
          investment_horizon: years || 0,
          payment_method: selectedMethod.id,
        };
        await db.collection("order").insertOne(order);

        // Save SIP details to 'customer_mutual_funds' collection
        const mutualFundRecord = {
          customer_id: user.customerId || user.id,
          fund_name: fund,
          amount: sipAmount,
          deduction_date: deductionDate,
          investment_type: "SIP",
          goal: goal || "General",
          target_amount: targetAmount || 0,
          investment_horizon: years || 0,
          order_id: orderId,
          created_at: new Date(),
          status: "Active",
        };
        await db
          .collection("customer_mutual_funds")
          .insertOne(mutualFundRecord);

        // Fetch payment method details for display
        let paymentDisplay = selectedMethod.display;
        if (selectedMethod.id.startsWith("bank_")) {
          const bankId = selectedMethod.id.replace("bank_", "");
          const bankAccount = await db
            .collection("customer_bank_accounts")
            .findOne({
              _id: new ObjectId(bankId),
              customer_id: user.customerId || user.id,
            });
          if (bankAccount) {
            paymentDisplay = `Bank Account: ${bankAccount.bank_name} (****${
              bankAccount.account_number?.slice(-4) || "unknown"
            })`;
          } else {
            paymentDisplay = "Bank Account: Unknown";
          }
        } else if (selectedMethod.id.startsWith("upi_")) {
          const upiId = selectedMethod.id.replace("upi_", "");
          const upiAccount = await db.collection("customer_upi").findOne({
            _id: new ObjectId(upiId),
            customer_id: user.customerId || user.id,
          });
          paymentDisplay = upiAccount
            ? `UPI: ${upiAccount.upi_id}`
            : "UPI: Unknown";
        } else if (selectedMethod.id.startsWith("card_")) {
          const cardId = selectedMethod.id.replace("card_", "");
          const card = await db.collection("customer_cards").findOne({
            _id: new ObjectId(cardId),
            customer_id: user.customerId || user.id,
          });
          paymentDisplay = card
            ? `Card: ${card.card_type} (****${
                card.card_number?.slice(-4) || "unknown"
              })`
            : "Card: Unknown";
        }

        workflowState.step = null;
        return {
          shouldRespond: true,
          response: `Done! Your SIP of ₹${sipAmount.toLocaleString(
            "en-IN"
          )}/month in ${fund} will start from the ${deductionDate} using ${paymentDisplay}.\nYou’re all set! You'll receive a confirmation soon.\n\n**Order ID:** ${orderId}\n**Goal:** ${
            goal || "General"
          }\n**Target Amount:** ₹${targetAmount.toLocaleString(
            "en-IN"
          )}\n**Horizon:** ${years} years\n\nIs there anything else I can help you with?`,
          tempData: { step: null },
        };
      } catch (error) {
        console.error(
          "Error creating SIP order or saving to customer_mutual_funds:",
          error
        );
        return {
          shouldRespond: true,
          response: `Sorry, there was an error setting up your SIP. Please try again or contact support.`,
        };
      }
    }

    return {
      shouldRespond: true,
      response: `Please select a valid option by number (1-${
        paymentMethods.length + 1
      }) or say "Add a new payment method".`,
    };
  }

  if (
    lastBotContent.includes(
      "Please provide the details for the new payment method"
    ) &&
    workflowState.step === 11 &&
    workflowState.investmentType === "SIP"
  ) {
    try {
      const db = mongoClient.db("financeai");
      const { sipAmount, fund, deductionDate, goal, targetAmount, years } =
        workflowState;
      let paymentMethodId;

      const paymentDetails = lowerMessage;
      if (paymentDetails.includes("bank")) {
        const bankDetails = {
          customer_id: user.customerId || user.id,
          bank_name: message.match(/bank name: ([^\n]+)/i)?.[1] || "User Bank",
          account_number:
            message.match(/account number: (\d+)/i)?.[1] || "1234567890",
          ifsc_code: message.match(/ifsc: ([^\n]+)/i)?.[1] || "ABCD0001234",
        };
        const result = await db
          .collection("customer_bank_accounts")
          .insertOne(bankDetails);
        paymentMethodId = `bank_${result.insertedId}`;
      } else if (paymentDetails.includes("upi")) {
        const upiDetails = {
          customer_id: user.customerId || user.id,
          upi_id: message.match(/upi id: ([^\n]+)/i)?.[1] || "user@upi",
        };
        const result = await db
          .collection("customer_upi")
          .insertOne(upiDetails);
        paymentMethodId = `upi_${result.insertedId}`;
      } else if (paymentDetails.includes("card")) {
        const cardDetails = {
          customer_id: user.customerId || user.id,
          card_type: message.match(/card type: ([^\n]+)/i)?.[1] || "Visa",
          card_number:
            message.match(/card number: (\d+)/i)?.[1] || "1234567890123456",
          expiry: message.match(/expiry: ([^\n]+)/i)?.[1] || "12/25",
          cvv: message.match(/cvv: (\d+)/i)?.[1] || "123",
        };
        const result = await db
          .collection("customer_cards")
          .insertOne(cardDetails);
        paymentMethodId = `card_${result.insertedId}`;
      } else {
        return {
          shouldRespond: true,
          response: `Invalid payment method details. Please specify Type (Bank Account, UPI, or Card) and provide relevant details (e.g., for Bank: bank name, account number, IFSC; for UPI: UPI ID; for Card: card type, card number, expiry, CVV).`,
        };
      }

      const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 10000)}`;
      const order = {
        customer_id: user.customerId || user.id,
        id: orderId,
        amount: sipAmount,
        investment_type: "SIP",
        payment_status: "Pending",
        created_at: new Date(),
        fund_name: fund,
        deduction_date: deductionDate,
        goal: goal || "General",
        target_amount: targetAmount || 0,
        investment_horizon: years || 0,
        payment_method: paymentMethodId,
      };
      await db.collection("order").insertOne(order);

      // Save SIP details to 'customer_mutual_funds' collection
      const mutualFundRecord = {
        customer_id: user.customerId || user.id,
        fund_name: fund,
        amount: sipAmount,
        deduction_date: deductionDate,
        investment_type: "SIP",
        goal: goal || "General",
        target_amount: targetAmount || 0,
        investment_horizon: years || 0,
        order_id: orderId,
        created_at: new Date(),
        status: "Active",
      };
      await db.collection("customer_mutual_funds").insertOne(mutualFundRecord);

      // Fetch payment method details for display
      let paymentDisplay = "Unknown";
      if (paymentMethodId.startsWith("bank_")) {
        const bankId = paymentMethodId.replace("bank_", "");
        const bankAccount = await db
          .collection("customer_bank_accounts")
          .findOne({
            _id: new ObjectId(bankId),
            customer_id: user.customerId || user.id,
          });
        if (bankAccount) {
          paymentDisplay = `Bank Account: ${bankAccount.bank_name} (****${
            bankAccount.account_number?.slice(-4) || "unknown"
          })`;
        }
      } else if (paymentMethodId.startsWith("upi_")) {
        const upiId = paymentMethodId.replace("upi_", "");
        const upiAccount = await db.collection("customer_upi").findOne({
          _id: new ObjectId(upiId),
          customer_id: user.customerId || user.id,
        });
        paymentDisplay = upiAccount
          ? `UPI: ${upiAccount.upi_id}`
          : "UPI: Unknown";
      } else if (paymentMethodId.startsWith("card_")) {
        const cardId = paymentMethodId.replace("card_", "");
        const card = await db.collection("customer_cards").findOne({
          _id: new ObjectId(cardId),
          customer_id: user.customerId || user.id,
        });
        paymentDisplay = card
          ? `Card: ${card.card_type} (****${
              card.card_number?.slice(-4) || "unknown"
            })`
          : "Card: Unknown";
      }

      workflowState.step = null;
      return {
        shouldRespond: true,
        response: `New payment method added and SIP of ₹${sipAmount.toLocaleString(
          "en-IN"
        )}/month in ${fund} will start from the ${deductionDate} using ${paymentDisplay}.\nYou’re all set! You'll receive a confirmation soon.\n\n**Order ID:** ${orderId}\n**Goal:** ${
          goal || "General"
        }\n**Target Amount:** ₹${targetAmount.toLocaleString(
          "en-IN"
        )}\n**Horizon:** ${years} years\n\nIs there anything else I can help you with?`,
        tempData: { step: null },
      };
    } catch (error) {
      console.error("Error creating SIP order with new payment method:", error);
      return {
        shouldRespond: true,
        response: `Sorry, there was an error adding your new payment method and setting up your SIP. Please try again or contact support.`,
      };
    }
  }

  // Lumpsum Flow: Step 2 - Ask for investment amount
  if (
    lowerMessage === "lumpsum" &&
    (lastBotContent.includes("SIP or Lumpsum") || workflowState.step === 1)
  ) {
    workflowState.step = 2;
    workflowState.investmentType = "Lumpsum";
    return {
      shouldRespond: true,
      response: `Great!\n**Step 2 of 5: Investment Amount**\n\nHow much would you like to invest? (e.g., ₹50,000)`,
      tempData: { step: 2, investmentType: "Lumpsum" },
    };
  }

  if (
    lastBotContent.includes("Step 2 of 5") &&
    lastBotContent.includes("Investment Amount")
  ) {
    const amountMatch = message.match(
      /₹?\s*([\d,]+(?:\.\d+)?)\s*(lakh|lakhs)?/i
    );
    if (amountMatch) {
      let lumpsumAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (amountMatch[2]) lumpsumAmount *= 100000; // Convert lakhs to rupees
      workflowState.step = 3;
      workflowState.lumpsumAmount = lumpsumAmount;
      return {
        shouldRespond: true,
        response: `Got it, you want to invest ₹${lumpsumAmount.toLocaleString(
          "en-IN"
        )}.\n**Step 3 of 5: Choose Mutual Fund**\n\nWould you like me to recommend a mutual fund or pick one yourself?\n\n**Options:**\n- Recommend for me\n- I'll choose`,
        tempData: { step: 3, lumpsumAmount },
      };
    } else {
      return {
        shouldRespond: true,
        response: `Please provide a valid amount (e.g., ₹50,000 or ₹1 lakh).`,
      };
    }
  }

  if (
    lastBotContent.includes("Step 3 of 5") &&
    lastBotContent.includes("Choose Mutual Fund")
  ) {
    if (lowerMessage.includes("recommend for me")) {
      const fund = "Parag Parikh Flexi Cap Fund (Direct – Growth)";
      workflowState.fund = fund;
      return {
        shouldRespond: true,
        response: `Based on your profile, I recommend ${fund}.\nWould you like to go ahead with this? (Reply "Yes" or "No")`,
        tempData: { step: 4, fund },
      };
    } else if (lowerMessage.includes("i’ll choose")) {
      return {
        shouldRespond: true,
        response: `Please specify the mutual fund you'd like to invest in (e.g., Parag Parikh Flexi Cap Fund).`,
      };
    } else {
      return {
        shouldRespond: true,
        response: `Please choose an option: "Recommend for me" or "I’ll choose".`,
      };
    }
  }

  if (
    (lastBotContent.includes("recommend") || lastBotContent.includes("suggest") || lastBotContent.includes("chosen")) &&
    (lastBotContent.includes("mutual fund") ||
      lastBotContent.includes("Parag Parikh Flexi Cap Fund")) &&
    (lastBotContent.includes("go ahead with this") || lastBotContent.includes("Would you like to go ahead")) &&
    lowerMessage === "yes" &&
    workflowState.step === 4 &&
    workflowState.investmentType === "Lumpsum"
  ) {
    workflowState.step = 5;
    const { lumpsumAmount, fund } = workflowState;
    const otp = generateOTP();
    workflowState.otp = otp;
    workflowState.otpTimestamp = Date.now();

    const emailSent = await sendOTPEmail(user.email, otp);
    if (!emailSent) {
      return {
        shouldRespond: true,
        response: `Failed to send OTP to your registered email. Please try again or contact support.`,
      };
    }

    return {
      shouldRespond: true,
      response: `Here's a summary of your Lumpsum investment:\n\n**Amount:** ₹${lumpsumAmount.toLocaleString(
        "en-IN"
      )}\n**Mutual Fund:** ${fund}\n\nPlease enter the OTP sent to your registered email (${
        user.email
      }) to authorize the investment.`,
      tempData: { step: 5, otp, otpTimestamp: Date.now() },
    };
  }

  if (
    lastBotContent.includes("OTP sent to your registered email") &&
    workflowState.investmentType === "Lumpsum"
  ) {
    if (
      message === workflowState.otp &&
      Date.now() - workflowState.otpTimestamp < 10 * 60 * 1000
    ) {
      const paymentMethods = [];
      if (userData.bankAccounts && userData.bankAccounts.length > 0) {
        userData.bankAccounts.forEach((account, index) => {
          paymentMethods.push({
            id: `bank_${account._id}`,
            display: `Bank Account: ${account.bank_name} (****${
              account.account_number?.slice(-4) || "unknown"
            })`,
          });
        });
      }
      if (userData.upiAccounts && userData.upiAccounts.length > 0) {
        userData.upiAccounts.forEach((upi, index) => {
          paymentMethods.push({
            id: `upi_${upi._id}`,
            display: `UPI: ${upi.upi_id}`,
          });
        });
      }
      if (userData.cards && userData.cards.length > 0) {
        userData.cards.forEach((card, index) => {
          paymentMethods.push({
            id: `card_${card._id}`,
            display: `Card: ${card.card_type} (****${
              card.card_number?.slice(-4) || "unknown"
            })`,
          });
        });
      }

      let responseMessage = `OTP verified!\nPlease select a payment method for your Lumpsum investment:\n\n`;
      if (paymentMethods.length > 0) {
        responseMessage +=
          paymentMethods
            .map((method, index) => `${index + 1}. ${method.display}`)
            .join("\n") +
          `\n${paymentMethods.length + 1}. Add a new payment method`;
        workflowState.paymentMethods = paymentMethods;
        return {
          shouldRespond: true,
          response: responseMessage,
          tempData: { step: 6, paymentMethods },
        };
      } else {
        return {
          shouldRespond: true,
          response: `No saved payment methods found. Would you like to add a new payment method? (Reply "Yes" or "Cancel")`,
          tempData: { step: 6, paymentMethods: [] },
        };
      }
    } else {
      return {
        shouldRespond: true,
        response: `Invalid or expired OTP. Please enter a valid 6-digit OTP or request a new one by saying "Resend OTP".`,
      };
    }
  }

  if (
    lastBotContent.includes("Please select a payment method") &&
    workflowState.step === 6 &&
    workflowState.investmentType === "Lumpsum"
  ) {
    if (lowerMessage === "resend otp") {
      const otp = generateOTP();
      workflowState.otp = otp;
      workflowState.otpTimestamp = Date.now();

      const emailSent = await sendOTPEmail(user.email, otp);
      if (!emailSent) {
        return {
          shouldRespond: true,
          response: `Failed to send OTP to your registered email. Please try again or contact support.`,
        };
      }

      return {
        shouldRespond: true,
        response: `A new OTP has been sent to your registered email (${user.email}). Please enter the OTP.`,
        tempData: { otp, otpTimestamp: Date.now() },
      };
    }

    const paymentMethods = workflowState.paymentMethods || [];
    const selectionIndex = parseInt(message) - 1;

    if (
      message.toLowerCase() === "add a new payment method" ||
      (selectionIndex === paymentMethods.length && paymentMethods.length > 0)
    ) {
      workflowState.step = 7;
      return {
        shouldRespond: true,
        response: `Please provide the details for the new payment method:\n- Type (Bank Account, UPI, or Card)\n- Details (e.g., for Bank: bank name, account number, IFSC; for UPI: UPI ID; for Card: card type, card number, expiry, CVV)`,
        tempData: { step: 7 },
      };
    }

    if (selectionIndex >= 0 && selectionIndex < paymentMethods.length) {
      const selectedMethod = paymentMethods[selectionIndex];
      workflowState.selectedPaymentMethod = selectedMethod.id;

      try {
        const { lumpsumAmount, fund } = workflowState;
        const db = mongoClient.db("financeai");

        // Create order in the 'order' collection
        const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 10000)}`;
        const order = {
          customer_id: user.customerId || user.id,
          id: orderId,
          amount: lumpsumAmount,
          investment_type: "Lumpsum",
          payment_status: "Pending",
          created_at: new Date(),
          fund_name: fund,
          payment_method: selectedMethod.id,
        };
        await db.collection("order").insertOne(order);

        // Save lumpsum details to 'customer_mutual_funds' collection
        const mutualFundRecord = {
          customer_id: user.customerId || user.id,
          fund_name: fund,
          amount: lumpsumAmount,
          investment_type: "Lumpsum",
          order_id: orderId,
          created_at: new Date(),
          status: "Active",
        };
        await db
          .collection("customer_mutual_funds")
          .insertOne(mutualFundRecord);

        // Fetch payment method details for display
        let paymentDisplay = selectedMethod.display;
        if (selectedMethod.id.startsWith("bank_")) {
          const bankId = selectedMethod.id.replace("bank_", "");
          const bankAccount = await db
            .collection("customer_bank_accounts")
            .findOne({
              _id: new ObjectId(bankId),
              customer_id: user.customerId || user.id,
            });
          if (bankAccount) {
            paymentDisplay = `Bank Account: ${bankAccount.bank_name} (****${
              bankAccount.account_number?.slice(-4) || "unknown"
            })`;
          } else {
            paymentDisplay = "Bank Account: Unknown";
          }
        } else if (selectedMethod.id.startsWith("upi_")) {
          const upiId = selectedMethod.id.replace("upi_", "");
          const upiAccount = await db.collection("customer_upi").findOne({
            _id: new ObjectId(upiId),
            customer_id: user.customerId || user.id,
          });
          paymentDisplay = upiAccount
            ? `UPI: ${upiAccount.upi_id}`
            : "UPI: Unknown";
        } else if (selectedMethod.id.startsWith("card_")) {
          const cardId = selectedMethod.id.replace("card_", "");
          const card = await db.collection("customer_cards").findOne({
            _id: new ObjectId(cardId),
            customer_id: user.customerId || user.id,
          });
          paymentDisplay = card
            ? `Card: ${card.card_type} (****${
                card.card_number?.slice(-4) || "unknown"
              })`
            : "Card: Unknown";
        }

        workflowState.step = null;
        return {
          shouldRespond: true,
          response: `Investment successful! ₹${lumpsumAmount.toLocaleString(
            "en-IN"
          )} has been invested in ${fund} using ${paymentDisplay}.\nYou’ll receive a confirmation soon.\n\n**Order ID:** ${orderId}\n\nIs there anything else I can help you with?`,
          tempData: { step: null },
        };
      } catch (error) {
        console.error(
          "Error creating Lumpsum order or saving to customer_mutual_funds:",
          error
        );
        return {
          shouldRespond: true,
          response: `Sorry, there was an error processing your investment. Please try again or contact support.`,
        };
      }
    }

    return {
      shouldRespond: true,
      response: `Please select a valid option by number (1-${
        paymentMethods.length + 1
      }) or say "Add a new payment method".`,
    };
  }

  if (
    lastBotContent.includes(
      "Please provide the details for the new payment method"
    ) &&
    workflowState.step === 7 &&
    workflowState.investmentType === "Lumpsum"
  ) {
    try {
      const db = mongoClient.db("financeai");
      const { lumpsumAmount, fund } = workflowState;
      let paymentMethodId;

      const paymentDetails = lowerMessage;
      if (paymentDetails.includes("bank")) {
        const bankDetails = {
          customer_id: user.customerId || user.id,
          bank_name: message.match(/bank name: ([^\n]+)/i)?.[1] || "User Bank",
          account_number:
            message.match(/account number: (\d+)/i)?.[1] || "1234567890",
          ifsc_code: message.match(/ifsc: ([^\n]+)/i)?.[1] || "ABCD0001234",
        };
        const result = await db
          .collection("customer_bank_accounts")
          .insertOne(bankDetails);
        paymentMethodId = `bank_${result.insertedId}`;
      } else if (paymentDetails.includes("upi")) {
        const upiDetails = {
          customer_id: user.customerId || user.id,
          upi_id: message.match(/upi id: ([^\n]+)/i)?.[1] || "user@upi",
        };
        const result = await db
          .collection("customer_upi")
          .insertOne(upiDetails);
        paymentMethodId = `upi_${result.insertedId}`;
      } else if (paymentDetails.includes("card")) {
        const cardDetails = {
          customer_id: user.customerId || user.id,
          card_type: message.match(/card type: ([^\n]+)/i)?.[1] || "Visa",
          card_number:
            message.match(/card number: (\d+)/i)?.[1] || "1234567890123456",
          expiry: message.match(/expiry: ([^\n]+)/i)?.[1] || "12/25",
          cvv: message.match(/cvv: (\d+)/i)?.[1] || "123",
        };
        const result = await db
          .collection("customer_cards")
          .insertOne(cardDetails);
        paymentMethodId = `card_${result.insertedId}`;
      } else {
        return {
          shouldRespond: true,
          response: `Invalid payment method details. Please specify Type (Bank Account, UPI, or Card) and provide relevant details (e.g., for Bank: bank name, account number, IFSC; for UPI: UPI ID; for Card: card type, card number, expiry, CVV).`,
        };
      }

      const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 10000)}`;
      const order = {
        customer_id: user.customerId || user.id,
        id: orderId,
        amount: lumpsumAmount,
        investment_type: "Lumpsum",
        payment_status: "Pending",
        created_at: new Date(),
        fund_name: fund,
        payment_method: paymentMethodId,
      };
      await db.collection("order").insertOne(order);

      // Save lumpsum details to 'customer_mutual_funds' collection
      const mutualFundRecord = {
        customer_id: user.customerId || user.id,
        fund_name: fund,
        amount: lumpsumAmount,
        investment_type: "Lumpsum",
        order_id: orderId,
        created_at: new Date(),
        status: "Active",
      };
      await db.collection("customer_mutual_funds").insertOne(mutualFundRecord);

      // Fetch payment method details for display
      let paymentDisplay = "Unknown";
      if (paymentMethodId.startsWith("bank_")) {
        const bankId = paymentMethodId.replace("bank_", "");
        const bankAccount = await db
          .collection("customer_bank_accounts")
          .findOne({
            _id: new ObjectId(bankId),
            customer_id: user.customerId || user.id,
          });
        if (bankAccount) {
          paymentDisplay = `Bank Account: ${bankAccount.bank_name} (****${
            bankAccount.account_number?.slice(-4) || "unknown"
          })`;
        }
      } else if (paymentMethodId.startsWith("upi_")) {
        const upiId = paymentMethodId.replace("upi_", "");
        const upiAccount = await db.collection("customer_upi").findOne({
          _id: new ObjectId(upiId),
          customer_id: user.customerId || user.id,
        });
        paymentDisplay = upiAccount
          ? `UPI: ${upiAccount.upi_id}`
          : "UPI: Unknown";
      } else if (paymentMethodId.startsWith("card_")) {
        const cardId = paymentMethodId.replace("card_", "");
        const card = await db.collection("customer_cards").findOne({
          _id: new ObjectId(cardId),
          customer_id: user.customerId || user.id,
        });
        paymentDisplay = card
          ? `Card: ${card.card_type} (****${
              card.card_number?.slice(-4) || "unknown"
            })`
          : "Card: Unknown";
      }

      workflowState.step = null;
      return {
        shouldRespond: true,
        response: `New payment method added and ₹${lumpsumAmount.toLocaleString(
          "en-IN"
        )} has been invested in ${fund} using ${paymentDisplay}.\nYou’ll receive a confirmation soon.\n\n**Order ID:** ${orderId}\n\nIs there anything else I can help you with?`,
        tempData: { step: null },
      };
    } catch (error) {
      console.error(
        "Error creating Lumpsum order with new payment method:",
        error
      );
      return {
        shouldRespond: true,
        response: `Sorry, there was an error adding your new payment method and processing your investment. Please try again or contact support.`,
      };
    }
  }

  if (
    lastBotContent.includes("Please specify the mutual fund") &&
    workflowState.investmentType === "SIP"
  ) {
    workflowState.fund = message;
    return {
      shouldRespond: true,
      response: `Got it, you’ve chosen ${message}.\nWould you like to go ahead with this? (Reply "Yes" or "No")`,
      tempData: { step: 7, fund: message },
    };
  }

  if (
    lastBotContent.includes("Please specify the mutual fund") &&
    workflowState.investmentType === "Lumpsum"
  ) {
    workflowState.fund = message;
    return {
      shouldRespond: true,
      response: `Got it, you’ve chosen ${message}.\nWould you like to go ahead with this? (Reply "Yes" or "No")`,
      tempData: { step: 4, fund: message },
    };
  }

  return {
    shouldRespond: false,
    response: "",
  };
}

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
        workflowState: {},
      };
    }

    const processedMessage = preprocessQuery(message);
    const userMessage = {
      sender: "user",
      content: message,
      processedContent: processedMessage,
      timestamp: new Date(),
    };

    chat.messages.push(userMessage);

    const conversationContext = chat.messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "assistant",
      content: msg.processedContent || msg.content,
    }));

    // Check for ticket request first
    const isTicketRequest = checkIfTicketRequest(
      processedMessage,
      conversationContext
    );

    console.log("Processing /api/chat request:", {
      message,
      chatId,
      customerId,
      isTicketRequest,
      isInvestmentRequest: checkIfInvestmentRequest(
        processedMessage,
        conversationContext,
        chat
      ),
      workflowState: chat.workflowState,
    });

    if (isTicketRequest) {
      const ticketResponse = await handleTicketWorkflow(message, chat, req.user);

      if (ticketResponse.shouldRespond) {
        console.log("Ticket Workflow Response:", {
          response: ticketResponse.response,
        });

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
                workflowState: chat.workflowState,
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
        console.log(
          "No ticket workflow response generated, falling back to AI"
        );
        const assistantMessage = {
          sender: "bot",
          content: `It looks like you're in the middle of raising a ticket. Please provide the requested information to continue, or say "cancel" to exit the workflow.`,
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
                workflowState: chat.workflowState,
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

    // Check for investment request
    const isInvestmentRequest = checkIfInvestmentRequest(
      processedMessage,
      conversationContext,
      chat
    );

    if (isInvestmentRequest) {
      // Handle specific investment cancellation (e.g., "I want to cancel my SIP of ₹4,790 in Mirae Asset Large Cap Fund")
      const lowerMessage = processedMessage.toLowerCase().trim();
      if (
        lowerMessage.includes("cancel") &&
        (lowerMessage.includes("sip") || lowerMessage.includes("lumpsum")) &&
        lowerMessage.includes("in")
      ) {
        const mutualFunds = await db
          .collection("customer_mutual_funds")
          .find({
            customer_id: parseInt(customerId),
            status: "Active",
          })
          .toArray();

        if (!mutualFunds || mutualFunds.length === 0) {
          chat.workflowState = {};
          const response = `No active investments found to cancel.`;
          const assistantMessage = {
            sender: "bot",
            content: response,
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
                  workflowState: chat.workflowState,
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

        // Parse the message to extract fund name and amount
        const matchFund = lowerMessage.match(/in\s+(.+?)\s*(?:fund|$)/i);
        const matchAmount = lowerMessage.match(/₹?\s*([\d,]+)\s*(?:\/month)?/i);
        const fundName = matchFund ? matchFund[1].trim() : null;
        const amount = matchAmount ? parseFloat(matchAmount[1].replace(/,/g, "")) : null;
        const isSIP = lowerMessage.includes("sip");

        const matchedInvestment = mutualFunds.find(
          (mf) =>
            mf.fund_name.toLowerCase().includes(fundName) &&
            mf.amount === amount &&
            mf.investment_type === (isSIP ? "SIP" : "Lumpsum")
        );

        if (matchedInvestment) {
          chat.workflowState = {
            action: "cancel",
            step: 2,
            selectedInvestment: matchedInvestment,
          };
          const responseMessage = `Confirm cancel of ${matchedInvestment.fund_name} (${matchedInvestment.investment_type}, ₹${matchedInvestment.amount.toLocaleString("en-IN")}). Reply "Confirm" or "Cancel".`;
          const assistantMessage = {
            sender: "bot",
            content: responseMessage,
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
                  workflowState: chat.workflowState,
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

      // Handle cancel/pause workflow
      const cancelPauseResponse = await handleCancelPauseWorkflow(
        message,
        chat,
        req.user
      );

      if (cancelPauseResponse.shouldRespond) {
        console.log("Cancel/Pause Workflow Response:", {
          response: cancelPauseResponse.response,
          tempData: cancelPauseResponse.tempData,
        });

        const assistantMessage = {
          sender: "bot",
          content: cancelPauseResponse.response,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();
        if (cancelPauseResponse.tempData) {
          chat.workflowState = {
            ...chat.workflowState,
            ...cancelPauseResponse.tempData,
          };
        }

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
                workflowState: chat.workflowState,
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

      // Proceed with investment workflow if not a cancel/pause request
      const investmentResponse = await handleInvestmentWorkflow(
        message,
        chat,
        req.user
      );

      if (investmentResponse.shouldRespond) {
        console.log("Investment Workflow Response:", {
          response: investmentResponse.response,
          tempData: investmentResponse.tempData,
        });

        const assistantMessage = {
          sender: "bot",
          content: investmentResponse.response,
          timestamp: new Date(),
        };

        chat.messages.push(assistantMessage);
        chat.updatedAt = new Date();
        if (investmentResponse.tempData) {
          chat.workflowState = {
            ...chat.workflowState,
            ...investmentResponse.tempData,
          };
        }

        if (chat._id) {
          await chatsCollection.updateOne(
            { _id: chat._id },
            {
              $set: {
                messages: chat.messages,
                updatedAt: chat.updatedAt,
                workflowState: chat.workflowState,
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
        console.log(
          "No investment workflow response generated, falling back to AI"
        );
        const assistantMessage = {
          sender: "bot",
          content: `It looks like you're in the middle of an investment process. Please provide the requested information to continue, or say "cancel" to exit the workflow.`,
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
                workflowState: chat.workflowState,
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

    // Fetch user data including mutual funds and orders
    const userData = await getUserData(customerId);

    // Prepare mutual funds data for the prompt
    const mutualFundsData = userData.mutualFundsInvested.map((mf) => ({
      fund_name: mf.fund_name,
      amount: mf.amount,
      investment_type: mf.investment_type,
      deduction_date: mf.deduction_date || null,
      goal: mf.goal || "General",
      target_amount: mf.target_amount || 0,
      investment_horizon: mf.investment_horizon || 0,
      status: mf.status,
      created_at: mf.created_at,
    }));

    // Prepare orders data for the prompt
    const ordersData = userData.orders.map((order) => ({
      order_id: order.id,
      amount: order.amount,
      investment_type: order.investment_type,
      fund_name: order.fund_name || "N/A",
      payment_status: order.payment_status,
      created_at: order.created_at,
      goal: order.goal || "General",
      target_amount: order.target_amount || 0,
      investment_horizon: order.investment_horizon || 0,
      payment_method: order.payment_method || "N/A",
    }));

    const prompt = `
      You are a financial assistant bot for an Indian audience. Provide accurate and concise answers about personal finance, investments, or related topics. Use Indian Rupees (₹) for currency and consider Indian financial regulations and products. If the user asks about a specific investment or action, guide them through relevant steps or suggest consulting a financial advisor for personalized advice. Avoid giving definitive investment advice without context.

      **User's Mutual Fund Investments:**
      ${JSON.stringify(mutualFundsData, null, 2)}

      **User's Orders:**
      ${JSON.stringify(ordersData, null, 2)}

      User message: ${processedMessage}
      Conversation context: ${JSON.stringify(conversationContext, null, 2)}
      User details: ${JSON.stringify(
        {
          customerId: userData.customer.id,
          email: userData.customer.email,
          name: userData.customer.name,
        },
        null, 2
      )}
    `;

    let aiResponse;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: processedMessage },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      aiResponse = response.choices[0].message.content;
    } catch (error) {
      console.error("Error calling OpenAI API:", error.message);
      aiResponse =
        "Sorry, I couldn't process your request. Please try again or contact support.";
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
            workflowState: chat.workflowState,
          },
          $inc: { __v: 1 },
        }
      );
    } else {
      const result = await chatsCollection.insertOne(chat);
      chat._id = result.insertedId;
    }

    return res.json(chat);
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return res.status(500).json({ error: "Internal server error" });
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

function checkIfTicketRequest(message, conversationContext) {
  const lowerMessage = message.toLowerCase().trim();

  const ticketKeywords = [
    "raise a ticket",
    "create a ticket",
    "i want to raise a ticket",
    "having a problem",
    "having some problems",
    "having an issue",
    "i am having an issue",
    "i am having a problem",
    "i am having some problems",
    "i have an issue",
    "i have a problem",
    "need help with",
    "support ticket",
    "ticket",
    "issue with",
    "problem with",
  ];

  const hasTicketKeyword = ticketKeywords.some((keyword) =>
    lowerMessage.includes(keyword)
  );

  const isInTicketFlow = conversationContext.some(
    (msg) =>
      msg.content &&
      (msg.content.includes("Step 1 of 4") ||
        msg.content.includes("Step 2 of 4") ||
        msg.content.includes("Step 3 of 4") ||
        msg.content.includes("Step 4 of 4") ||
        msg.content.includes("Issue Detail") ||
        msg.content.includes("Choose a category") ||
        msg.content.includes("Description"))
  );

  return hasTicketKeyword || isInTicketFlow;
}

async function handleTicketWorkflow(message, chat, user) {
  const lowerMessage = message.toLowerCase().trim();
  const conversationHistory = chat.messages || [];

  const lastBotMessage = conversationHistory
    .slice()
    .reverse()
    .find((msg) => msg.sender === "bot");

  const lastBotContent = lastBotMessage?.content || "";

  const isInitialRequest =
    (lowerMessage.includes("raise a ticket") ||
      lowerMessage.includes("create a ticket") ||
      lowerMessage.includes("i want to raise a ticket") ||
      lowerMessage.includes("having a problem") ||
      lowerMessage.includes("having some problems") ||
      lowerMessage.includes("having an issue") ||
      lowerMessage.includes("i am having an issue") ||
      lowerMessage.includes("i am having a problem") ||
      lowerMessage.includes("i am having some problems") ||
      lowerMessage.includes("i have an issue") ||
      lowerMessage.includes("i have a problem")) &&
    !lastBotContent.includes("Step");

  if (isInitialRequest) {
    return {
      shouldRespond: true,
      response: `Sure, I can help you raise a ticket for this issue. Let me guide you through the process.\n\n**Step 1 of 4: Issue Detail**\n\nPlease provide a brief title or summary of your issue. This will help our support team understand your concern quickly.\n\nFor example: "Unable to access my portfolio" or "Payment not reflecting in account"`,
    };
  }

  if (
    lastBotContent.includes("Step 1 of 4") &&
    lastBotContent.includes("Issue Detail")
  ) {
    return {
      shouldRespond: true,
      response: `Thank you! Your issue title: "${message}"\n\n**Step 2 of 4: Choose a category**\n\nPlease select the category that best describes your issue:\n\n1. General Enquiry\n2. KYC Related\n3. Products Related\n4. Orders Related\n5. Payment/Bank Accounts\n6. Account Related\n7. Others\n\nYou can respond with either the number (1-7) or the category name.`,
    };
  }

  if (
    lastBotContent.includes("Step 2 of 4") &&
    lastBotContent.includes("Choose a category")
  ) {
    const categoryMap = {
      1: "General Enquiry",
      2: "KYC Related",
      3: "Products Related",
      4: "Orders Related",
      5: "Payment/Bank Accounts",
      6: "Account Related",
      7: "Others",
      "general enquiry": "General Enquiry",
      general: "General Enquiry",
      "kyc related": "KYC Related",
      kyc: "KYC Related",
      "products related": "Products Related",
      products: "Products Related",
      "orders related": "Orders Related",
      orders: "Orders Related",
      "payment/bank accounts": "Payment/Bank Accounts",
      payment: "Payment/Bank Accounts",
      "bank accounts": "Payment/Bank Accounts",
      "account related": "Account Related",
      account: "Account Related",
      others: "Others",
      other: "Others",
    };

    const selectedCategory =
      categoryMap[lowerMessage] || categoryMap[message.trim()];

    if (selectedCategory) {
      return {
        shouldRespond: true,
        response: `Category selected: ${selectedCategory}\n\n**Step 3 of 4: Description**\n\nNow please provide a detailed description of your issue. Include any relevant information such as:\n- When did this issue occur?\n- What steps did you take?\n- Any error messages you received?\n- How is this affecting you?\n\nThe more details you provide, the better our support team can assist you.`,
      };
    } else {
      return {
        shouldRespond: true,
        response: `I didn't recognize that category. Please choose from:\n\n1. General Enquiry\n2. KYC Related\n3. Products Related\n4. Orders Related\n5. Payment/Bank Accounts\n6. Account Related\n7. Others\n\nRespond with either the number (1-7) or the category name.`,
      };
    }
  }

  if (
    lastBotContent.includes("Step 3 of 4") &&
    lastBotContent.includes("Description")
  ) {
    return {
      shouldRespond: true,
      response: `Thank you for the detailed description.\n\n**Step 4 of 4: Upload Supporting Documents (Optional)**\n\nYou can now upload supporting documents such as screenshots, receipts, or any other relevant files to help us resolve your issue faster.\n\n**Supported file types:** Images (JPEG, PNG, GIF, WebP) and PDF files\n**Maximum file size:** 10MB per file\n**Maximum files:** 3 files\n\n[File Upload Field]\n\nA file upload interface will appear after this message. You can either:\n- Upload supporting documents and create the ticket\n- Skip the upload and create the ticket without attachments\n\nBoth options will create your support ticket successfully.`,
    };
  }

  if (lowerMessage === "no" && lastBotContent.includes("Step 4 of 4")) {
    try {
      const messages = chat.messages || [];
      let issueTitle = "";
      let category = "";
      let description = "";

      const step1Index = messages.findIndex(
        (msg) => msg.content && msg.content.includes("Step 1 of 4")
      );
      if (step1Index !== -1 && messages[step1Index + 1]) {
        issueTitle = messages[step1Index + 1].content;
      }

      const step2Index = messages.findIndex(
        (msg) => msg.content && msg.content.includes("Step 2 of 4")
      );
      if (step2Index !== -1 && messages[step2Index + 1]) {
        const userCategoryResponse = messages[step2Index + 1].content
          .toLowerCase()
          .trim();
        const categoryMap = {
          1: "General Enquiry",
          2: "KYC Related",
          3: "Products Related",
          4: "Orders Related",
          5: "Payment/Bank Accounts",
          6: "Account Related",
          7: "Others",
          "general enquiry": "General Enquiry",
          general: "General Enquiry",
          "kyc related": "KYC Related",
          kyc: "KYC Related",
          "products related": "Products Related",
          products: "Products Related",
          "orders related": "Orders Related",
          orders: "Orders Related",
          "payment/bank accounts": "Payment/Bank Accounts",
          payment: "Payment/Bank Accounts",
          "bank accounts": "Payment/Bank Accounts",
          "account related": "Account Related",
          account: "Account Related",
          others: "Others",
          other: "Others",
        };
        category = categoryMap[userCategoryResponse] || "Others";
      }

      const step3Index = messages.findIndex(
        (msg) => msg.content && msg.content.includes("Step 3 of 4")
      );
      if (step3Index !== -1 && messages[step3Index + 1]) {
        description = messages[step3Index + 1].content;
      }

      if (issueTitle && category && description) {
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
          attachments: [],
        });

        await ticket.save();
        console.log("Ticket created without attachments:", ticketId);

        return {
          shouldRespond: true,
          response: `✅ **Ticket Created Successfully!**\n\n**Ticket ID:** ${ticketId}\n**Title:** ${issueTitle}\n**Category:** ${category}\n**Status:** Open\n**Attachments:** None\n\nYour support ticket has been created and assigned to our team. You'll receive updates on the progress via email.\n\n**What's next?**\n- Our support team will review your ticket within 24 hours\n- You'll receive email notifications for any updates\n- You can reference your ticket using ID: ${ticketId}\n\nIs there anything else I can help you with regarding your investments or account?`,
        };
      } else {
        return {
          shouldRespond: true,
          response:
            "I'm sorry, there seems to be missing information for creating your ticket. Please start the ticket creation process again by saying 'I want to raise a ticket'.",
        };
      }
    } catch (error) {
      console.error("Error creating ticket without attachments:", error);
      return {
        shouldRespond: true,
        response:
          "I'm sorry, there was an error creating your ticket. Please try again or contact our support team directly.",
      };
    }
  }

  return {
    shouldRespond: false,
    response: "",
  };
}

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

    res.json({
      message: "Chat title updated successfully",
      title: title.trim(),
    });
  } catch (error) {
    console.error("Chat title update error:", error);
    res.status(500).json({ error: "Failed to update chat title" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/api/dashboard/data", authenticateToken, async (req, res) => {
  try {
    const customerId = req.user.customerId || req.user.id;
    console.log("Fetching dashboard data for customerId:", customerId);

    const userData = await getUserData(customerId);

    const portfolioData = {
      totalValue: 0,
      totalInvested: 0,
      totalReturns: 0,
      returnPercentage: 0,
      assets: [],
    };

    if (
      userData.mutualFundsInvested &&
      userData.mutualFundsInvested.length > 0
    ) {
      const totalInvested = userData.mutualFundsInvested
        .filter((mf) => mf.status === "Active")
        .reduce((sum, mf) => sum + (parseFloat(mf.amount) || 0), 0);

      portfolioData.totalInvested = totalInvested;
      portfolioData.totalValue = totalInvested * 1.125; // Assuming 12.5% growth for simplicity
      portfolioData.totalReturns =
        portfolioData.totalValue - portfolioData.totalInvested;
      portfolioData.returnPercentage =
        totalInvested > 0
          ? (portfolioData.totalReturns / totalInvested) * 100
          : 0;

      // Group by investment type
      const assetGroups = {};
      userData.mutualFundsInvested.forEach((mf) => {
        const type = mf.investment_type || "General";
        if (!assetGroups[type]) {
          assetGroups[type] = 0;
        }
        if (mf.status === "Active") {
          assetGroups[type] += parseFloat(mf.amount) || 0;
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
    if (
      userData.mutualFundsInvested &&
      userData.mutualFundsInvested.length > 0
    ) {
      const recentInvestments = userData.mutualFundsInvested
        .sort(
          (a, b) =>
            new Date(b.created_at || b.date) - new Date(a.created_at || a.date)
        )
        .slice(0, 10);

      recentInvestments.forEach((mf) => {
        transactions.push({
          type: `Investment - ${mf.fund_name} (${mf.investment_type})`,
          amount: parseFloat(mf.amount) || 0,
          date: mf.created_at || mf.date || new Date(),
          status: mf.status || "Active",
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

    // Goals
    const goals = userData.mutualFundsInvested
      .filter((mf) => mf.goal && mf.target_amount)
      .map((mf) => ({
        name: mf.goal,
        target: mf.target_amount,
        current: Math.min(
          parseFloat(mf.amount) * 1.125,
          mf.target_amount * 0.9
        ),
        progress: Math.min(
          ((parseFloat(mf.amount) * 1.125) / mf.target_amount) * 100,
          90
        ),
      }));

    const dashboardData = {
      user: {
        name: userData.customer?.name || "User",
        email: userData.customer?.email || "user@example.com",
        customerId: userData.customer?.id || customerId,
      },
      portfolio: portfolioData,
      transactions: transactions,
      market: marketData,
      goals:
        goals.length > 0
          ? goals
          : [
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
            ],
      summary: {
        ordersCount: userData.orders?.length || 0,
        foliosCount: userData.folios?.length || 0,
        mutualFundsCount: userData.mutualFundsInvested?.length || 0,
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

const uri = process.env.MONGO_URI;

app.get("/file/:id", async (req, res) => {
  const fileId = req.params.id;

  try {
    const client = await MongoClient.connect(uri);
    const db = client.db("financeai");
    const bucket = new GridFSBucket(db, { bucketName: "ticket_attachments" });

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
  console.log(
    `→ File Retrieve: http://localhost:${PORT}/file/<enter the gridFSID>`
  );
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
