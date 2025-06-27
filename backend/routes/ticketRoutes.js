const express = require("express");
const router = express.Router();
const multer = require("multer");
const { GridFSBucket } = require("mongodb");
const Ticket = require("../models/ticketModel");

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPEG, PNG, GIF, WebP) and PDF files are allowed.'), false);
    }
  }
});

// JWT middleware for authentication (same as in server)
const jwt = require("jsonwebtoken");
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

// Create ticket endpoint
router.post("/create", authenticateToken, upload.array('attachments', 3), async (req, res) => {
  try {
    console.log("=== TICKET CREATION REQUEST ===");
    console.log("User:", req.user);
    console.log("Body:", req.body);
    console.log("Files:", req.files?.length || 0);

    const { issue_title, category, description, chatId } = req.body;
    const files = req.files || [];

    // Validate required fields
    if (!issue_title || !category || !description) {
      return res.status(400).json({ 
        message: "Missing required fields: issue_title, category, and description are required" 
      });
    }

    // Validate category
    const validCategories = [
      "General Enquiry",
      "KYC Related", 
      "Products Related",
      "Orders Related",
      "Payment/Bank Accounts",
      "Account Related",
      "Others"
    ];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({ 
        message: "Invalid category. Must be one of: " + validCategories.join(", ") 
      });
    }

    // Get user information
    const customer_id = req.user.customerId || req.user.id;
    const customer_email = req.user.email;

    // Generate unique ticket ID
    const ticket_id = `TCK${Date.now()}${Math.floor(Math.random() * 10000)}`;

    // Process file attachments
    let attachments = [];
    
    if (files && files.length > 0) {
      console.log(`Processing ${files.length} file(s)...`);
      
      // Get MongoDB connection from app
      const mongoClient = req.app.get('mongoClient');
      
      if (!mongoClient) {
        console.error("MongoDB client not available");
        return res.status(500).json({ message: "Database connection error" });
      }

      const db = mongoClient.db("financeai");
      const bucket = new GridFSBucket(db, { bucketName: 'ticket_attachments' });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filename = `${ticket_id}_${Date.now()}_${file.originalname}`;
        
        try {
          // Upload file to GridFS
          const uploadStream = bucket.openUploadStream(filename, {
            metadata: {
              originalName: file.originalname,
              mimetype: file.mimetype,
              ticketId: ticket_id
            }
          });

          // Write file buffer to GridFS
          uploadStream.end(file.buffer);

          // Wait for upload to complete
          const gridFSId = await new Promise((resolve, reject) => {
            uploadStream.on('finish', () => {
              resolve(uploadStream.id);
            });
            uploadStream.on('error', reject);
          });

          attachments.push({
            filename: filename,
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            gridFSId: gridFSId,
            uploadDate: new Date()
          });

          console.log(`File uploaded: ${filename} (GridFS ID: ${gridFSId})`);
        } catch (fileError) {
          console.error(`Error uploading file ${file.originalname}:`, fileError);
          // Continue with other files, don't fail the entire request
        }
      }
    }

    // Create ticket
    const ticket = new Ticket({
      customer_id,
      customer_email,
      issue_title,
      category,
      description,
      status: "Open",
      priority: "Medium", 
      ticket_id,
      attachments
    });

    await ticket.save();

    console.log("Ticket created successfully:", ticket_id);

    // If chatId is provided, update the chat to mark it as containing a ticket
    if (chatId) {
      try {
        const { ObjectId } = require("mongodb");
        const mongoClient = req.app.get('mongoClient');
        if (mongoClient) {
          const db = mongoClient.db("financeai");
          const chatsCollection = db.collection("chats");
          
          await chatsCollection.updateOne(
            { _id: new ObjectId(chatId) },
            { 
              $set: { 
                hasTicket: true, 
                ticketId: ticket_id,
                ticketCreatedAt: new Date()
              } 
            }
          );
          console.log(`Chat ${chatId} updated with ticket reference`);
        }
      } catch (chatError) {
        console.error("Error updating chat with ticket reference:", chatError);
        // Don't fail the request if chat update fails
      }
    }

    res.status(201).json({
      success: true,
      message: "Ticket created successfully",
      ticket: {
        _id: ticket._id,
        customer_id: ticket.customer_id,
        customer_email: ticket.customer_email,
        issue_title: ticket.issue_title,
        category: ticket.category,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        ticket_id: ticket.ticket_id,
        attachments: ticket.attachments,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        __v: ticket.__v
      }
    });

  } catch (error) {
    console.error("Error creating ticket:", error);
    
    if (error.code === 11000) {
      // Duplicate ticket ID (very unlikely but possible)
      return res.status(409).json({ 
        message: "Ticket ID conflict. Please try again." 
      });
    }
    
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({ 
        message: error.message 
      });
    }
    
    res.status(500).json({ 
      message: "Failed to create ticket",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get user's tickets
router.get("/", authenticateToken, async (req, res) => {
  try {
    const customer_id = req.user.customerId || req.user.id;
    
    const tickets = await Ticket.find({ customer_id })
      .sort({ created_at: -1 })
      .select('-__v');
    
    res.json({
      success: true,
      tickets
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ 
      message: "Failed to fetch tickets" 
    });
  }
});

// Get specific ticket
router.get("/:ticketId", authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const customer_id = req.user.customerId || req.user.id;
    
    const ticket = await Ticket.findOne({ 
      ticket_id: ticketId, 
      customer_id 
    }).select('-__v');
    
    if (!ticket) {
      return res.status(404).json({ 
        message: "Ticket not found" 
      });
    }
    
    res.json({
      success: true,
      ticket
    });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({ 
      message: "Failed to fetch ticket" 
    });
  }
});

module.exports = router;
