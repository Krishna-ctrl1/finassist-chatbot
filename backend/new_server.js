const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");
const rateLimit = require("express-rate-limit");
const path = require("path");
const { OpenAI } = require("openai");

dotenv.config();

const app = express();

// Configuration
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!MONGO_URI) {
  console.error("MONGO_URI environment variable is required");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY environment variable is required");
  process.exit(1);
}

let mongoClient;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Initialize MongoDB connection
async function initMongoDB() {
  try {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    console.log("MongoDB client connected");

    const db = mongoClient.db("financeai");
    await db.admin().ping();
    console.log("MongoDB ping successful");

    // Create indexes for chats collection
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
    origin: "http://localhost:3000", // Adjust to match your frontend URL
    methods: ["GET", "POST", "PUT"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Serve static files from the Frontend directory
app.use(express.static(path.join(__dirname, "../Frontend")));

// JWT middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// API Routes

// POST /api/auth/signup
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
      JWT_SECRET,
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

// POST /api/auth/login
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
      JWT_SECRET,
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

// GET /api/auth/verify
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

// Helper function to calculate portfolio metrics
function calculatePortfolioMetrics(userData) {
  const { orders, orderDetails, folios, performanceSummary, investmentReturns } = userData;

  let totalInvested = 0;
  let currentValue = 0;
  let completedOrders = [];
  let pendingOrders = [];

  // Calculate total invested from orders
  if (orders && orders.length > 0) {
    orders.forEach((order) => {
      if (order.payment_status === "completed") {
        totalInvested += order.amount || 0;
        completedOrders.push(order);
      } else {
        pendingOrders.push(order);
      }
    });
  }

  // Calculate current value from folios or performance summary
  if (performanceSummary && performanceSummary.current_value) {
    currentValue = performanceSummary.current_value;
  } else if (folios && folios.length > 0) {
    folios.forEach((folio) => {
      if (folio.units && folio.nav) {
        currentValue += folio.units * folio.nav;
      }
    });
  }

  // Calculate absolute return
  let absoluteReturn = 0;
  if (totalInvested > 0 && currentValue > 0) {
    absoluteReturn = ((currentValue - totalInvested) / totalInvested) * 100;
  }

  return {
    totalInvested,
    currentValue,
    absoluteReturn: absoluteReturn.toFixed(2),
    completedOrders,
    pendingOrders,
  };
}

// Helper function to format user data and portfolio metrics into a context string
function formatUserDataContext(userData, portfolioMetrics, query) {
  const {
    customer,
    customerDetail,
    folios,
    performanceSummary,
    investmentPerformance,
    investmentReturns,
    orders,
    orderDetails,
    mutualFunds,
  } = userData;

  let context = `Customer: ${customer.name} (ID: ${customer.id}, Email: ${customer.email})\n`;

  // Portfolio Metrics
  context += `Portfolio Metrics (as of 27 June 2025):\n`;
  context += `- Total Invested: ₹${portfolioMetrics.totalInvested.toLocaleString()}\n`;
  context += `- Current Value: ₹${portfolioMetrics.currentValue.toLocaleString()}\n`;
  context += `- Absolute Return: ${portfolioMetrics.absoluteReturn}%\n`;
  context += `- Completed Orders: ${portfolioMetrics.completedOrders.length} (Total: ₹${portfolioMetrics.completedOrders.reduce((sum, o) => sum + (o.amount || 0), 0).toLocaleString()})\n`;
  context += `- Pending/Processing Orders: ${portfolioMetrics.pendingOrders.length}\n`;

  // Orders
  context += `Orders (${orders.length}): `;
  if (orders.length > 0) {
    context += orders
      .map((o) => `Order ID: ${o.id}, Amount: ₹${o.amount}, Status: ${o.payment_status}`)
      .join("; ");
  } else {
    context += "No orders found";
  }
  context += "\n";

  // Order Details
  context += `Order Details (${orderDetails.length}): `;
  if (orderDetails.length > 0) {
    context += orderDetails
      .map((od) => `Order ID: ${od.order_id}, Units: ${od.units}, NAV: ${od.nav}`)
      .join("; ");
  } else {
    context += "No order details found";
  }
  context += "\n";

  // Folios
  context += `Folios (${folios.length}): `;
  if (folios.length > 0) {
    context += folios
      .map((f) => `Folio: ${f.folio}, MF ID: ${f.mf_id}, Units: ${f.units}, NAV: ${f.nav || "N/A"}`)
      .join("; ");
  } else {
    context += "No folios found";
  }
  context += "\n";

  // Mutual Funds
  context += `Mutual Funds (${mutualFunds.length}): `;
  if (mutualFunds.length > 0) {
    context += mutualFunds
      .map((mf) => `Scheme: ${mf.scheme_name || "Unknown"}, Code: ${mf.scheme_code}`)
      .join("; ");
  } else {
    context += "No mutual funds found";
  }
  context += "\n";

  // Investment Performance Summary
  if (performanceSummary) {
    context += `Performance Summary: Total Invested: ₹${performanceSummary.total_invested || "N/A"}, Current Value: ₹${performanceSummary.current_value || "N/A"}, Returns: ${performanceSummary.returns || "N/A"}%\n`;
  } else {
    context += "Performance Summary: Not available\n";
  }

  // Investment Returns
  context += `Investment Returns (${investmentReturns.length}): `;
  if (investmentReturns.length > 0) {
    context += investmentReturns
      .map((ir) => `MF ID: ${ir.mf_id}, Return: ${ir.return}%`)
      .join("; ");
  } else {
    context += "No investment returns data found";
  }
  context += "\n";

  // Nifty 50 Data
  context += `Nifty 50 Performance (as of 27 June 2025):\n`;
  context += `- Current Value: 25,549.00 INR\n`;
  context += `- 1-Year Return: 7.70%\n`;
  context += `- 3-Year CAGR: 17.6%\n`;
  context += `- 5-Year CAGR: 12.04%\n`;
  context += `Source: NSE, Angel One, Financial Express\n`;

  // User Query
  context += `User Query: ${query}\n`;

  return context;
}

// POST /api/chat
app.post("/api/chat", authenticateToken, async (req, res) => {
  try {
    const { message, chatId, title } = req.body;
    const userId = new ObjectId(req.user._id);
    const customerId = req.user.customerId; // From JWT payload

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

      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }
    } else {
      chat = {
        userId: userId,
        title: title || message.slice(0, 50),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        __v: 0,
      };
    }

    const userMessage = {
      sender: "user",
      content: message,
      timestamp: new Date(),
    };

    if (!chat.messages) {
      chat.messages = [];
    }
    chat.messages.push(userMessage);

    // Fetch user financial data
    const userData = await getUserData(customerId);

    // Calculate portfolio metrics
    const portfolioMetrics = calculatePortfolioMetrics(userData);

    // Format user data and portfolio metrics into a context string
    const userDataContext = formatUserDataContext(userData, portfolioMetrics, message);

    // Construct OpenAI prompt with user data and query
    const openaiMessages = [
      {
        role: "system",
        content: `
          You are FinanceAI, a personal financial assistant. Use the provided user financial data and portfolio metrics to answer queries accurately and professionally. Focus on investments, SIPs, portfolio management, or financial planning unless otherwise specified. For queries requiring external data (e.g., Nifty 50 performance), use the provided Nifty 50 data. If the user's data is insufficient, use available data to provide a partial answer and suggest what additional data is needed. For comparison queries (e.g., "Compare my portfolio with Nifty 50"), provide a structured response with a summary table, absolute return calculations, and actionable guidance, following this format:

          **Portfolio vs Nifty 50 - Direct Comparison**

          **Your Portfolio (Completed Orders Only):**
          - Total Invested: ₹X
          - Current Value: ₹Y
          - Absolute Return: Z%

          **Nifty 50 Index (as of 27 June 2025):**
          - 1-Year Return: 7.70%
          - 3-Year CAGR: 17.6%
          - 5-Year CAGR: 12.04%

          **Absolute Portfolio Return Example (Based on Available Data):**
          - Invested: ₹A
          - Current Value: ₹B
          - Absolute Return: ((B - A) / A) × 100 = C%

          **If You Invested Entirely in Nifty 50 (Past Year):**
          - Invested: ₹A
          - 1-Year Return at 7.70%: ₹A × 1.077 = ₹D
          - Gain: ₹(D - A)
          - Absolute Return: 7.70%

          **Summary Table:**
          | Investment | Invested | Current Value | Gain | Absolute Return |
          |------------|----------|---------------|------|-----------------|
          | Your Portfolio | ₹A | ₹B | ₹(B-A) | C% |
          | Nifty 50 (1Y) | ₹A | ₹D | ₹(D-A) | 7.70% |

          **Analysis:**
          - Compare portfolio performance vs. Nifty 50.
          - Note any pending orders affecting calculations.
          - Suggest reasons for under/overperformance.

          **Actionable Guidance:**
          - Suggest monitoring pending orders.
          - Recommend diversification or index funds if applicable.
          - Advise reviewing specific holdings.

          **Disclaimer:** Data as of 27 June 2025 – Market prices change constantly. Calculations based on available data and public index returns. Mutual fund investments are subject to market risks.

          **User Financial Data and Portfolio Metrics**:
          ${userDataContext}

          Answer the user's query concisely and clearly, following the above format for comparison queries.
        `,
      },
      ...chat.messages.map((msg) => ({
        role: msg.sender === "user" ? "user" : "assistant",
        content: msg.content,
      })),
    ];

    // Call OpenAI API for response
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1", // Updated to a valid model; replace with "gpt-4.1" or another available model if needed
      messages: openaiMessages,
      max_tokens: 1000, // Increased to accommodate detailed response
      temperature: 0.7,
    });

    const botResponse = completion.choices[0].message.content;

    const assistantMessage = {
      sender: "bot",
      content: botResponse,
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

// GET /api/chat/:chatId
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

// GET /api/chats
app.get("/api/chats", authenticateToken, async (req, res) => {
  try {
    const userId = new ObjectId(req.user._id);
    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    const chats = await chatsCollection
      .find({ userId })
      .sort({ updatedAt: -1 })
      .project({ _id: 1, title: 1, updatedAt: 1, createdAt: 1 })
      .toArray();

    res.json(chats);
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

// PUT /api/chat/:chatId
app.put("/api/chat/:chatId", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;
    const userId = new ObjectId(req.user._id);

    if (!ObjectId.isValid(chatId)) {
      return res.status(400).json({ error: "Invalid chat ID format" });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const db = mongoClient.db("financeai");
    const chatsCollection = db.collection("chats");

    const result = await chatsCollection.updateOne(
      { _id: new ObjectId(chatId), userId },
      { $set: { title: title.trim(), updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json({ message: "Chat title updated successfully" });
  } catch (error) {
    console.error("Chat rename error:", error);
    res.status(500).json({ error: "Failed to rename chat" });
  }
});

// Serve index.html for root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend", "index.html"), (err) => {
    if (err) {
      res.status(500).send("Error serving index.html");
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Global error:", err.stack);
  res.status(500).json({ message: "Something went wrong on the server." });
});

// Connect to MongoDB and start server
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB via Mongoose"))
  .catch((err) => console.error("MongoDB Mongoose connection error:", err));

initMongoDB();

// Get local IP address for logging
const os = require("os");
const networkInterfaces = os.networkInterfaces();
const localIP = Object.values(networkInterfaces)
  .flat()
  .find((iface) => iface.family === "IPv4" && !iface.internal)?.address;

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on:`);
  console.log(`→ Local: http://localhost:${PORT}`);
  console.log(`→ Network: http://${localIP}:${PORT}`);
});

// Graceful shutdown
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

// Placeholder for getUserData function (unchanged from original)
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