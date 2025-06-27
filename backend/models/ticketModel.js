const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema({
  customer_id: {
    type: Number,
    required: true
  },
  customer_email: {
    type: String,
    required: true
  },
  issue_title: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      "General Enquiry",
      "KYC Related", 
      "Products Related",
      "Orders Related",
      "Payment/Bank Accounts",
      "Account Related",
      "Others"
    ]
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: "Open",
    enum: ["Open", "In Progress", "Resolved", "Closed"]
  },
  priority: {
    type: String,
    default: "Medium",
    enum: ["Low", "Medium", "High", "Critical"]
  },
  ticket_id: {
    type: String,
    unique: true,
    required: true
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    gridFSId: mongoose.Schema.Types.ObjectId,
    uploadDate: {
      type: Date,
      default: Date.now
    },
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    }
  }],
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  __v: {
    type: Number,
    default: 0
  }
});

// Update the updated_at field before saving
ticketSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

// Generate ticket ID before saving
ticketSchema.pre('save', function(next) {
  if (!this.ticket_id) {
    this.ticket_id = `TCK${Date.now()}${Math.floor(Math.random() * 10000)}`;
  }
  next();
});

module.exports = mongoose.model("Ticket", ticketSchema);
