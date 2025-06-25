const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
  customer_id: {
    type: Number,
    required: true,
    index: true
  },
  customer_email: {
    type: String,
    required: true
  },
  investment_type: {
    type: String,
    required: true,
    enum: ['SIP', 'LUMPSUM']
  },
  // Goal-related fields for SIP
  goal: {
    type: String,
    required: function() { return this.investment_type === 'SIP'; }
  },
  target_amount: {
    type: Number,
    required: function() { return this.investment_type === 'SIP'; }
  },
  target_years: {
    type: Number,
    required: function() { return this.investment_type === 'SIP'; }
  },
  recommended_amount: {
    type: Number,
    required: function() { return this.investment_type === 'SIP'; }
  },
  // Investment amount
  investment_amount: {
    type: Number,
    required: true,
    min: 500
  },
  // Fund selection
  fund_selection_type: {
    type: String,
    required: true,
    enum: ['RECOMMENDED', 'SELF_SELECTED']
  },
  selected_fund: {
    name: {
      type: String,
      required: true
    },
    id: {
      type: String,
      required: true
    },
    category: String,
    nav: Number,
    expense_ratio: Number
  },
  // SIP specific fields
  sip_date: {
    type: Number,
    min: 1,
    max: 28,
    required: function() { return this.investment_type === 'SIP'; }
  },
  // Payment fields
  payment_method: {
    type: String,
    required: true,
    enum: ['EXISTING_MANDATE', 'NEW_MANDATE', 'SAVED_UPI', 'NEW_UPI']
  },
  otp_verification: {
    otp_sent: {
      type: String
    },
    verified: {
      type: Boolean,
      default: false
    },
    verified_at: Date
  },
  // Status fields
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'OTP_SENT', 'VERIFIED', 'PAYMENT_PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING'
  },
  investment_id: {
    type: String,
    required: true,
    unique: true
  },
  // Tracking
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  completed_at: Date,
  // Chat integration
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat'
  },
  // Email confirmation
  email_sent: {
    type: Boolean,
    default: false
  },
  email_sent_at: Date
});

// Update the updated_at field before saving
investmentSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

// Create indexes for better performance
investmentSchema.index({ customer_id: 1, created_at: -1 });
investmentSchema.index({ investment_id: 1 });
investmentSchema.index({ status: 1 });

module.exports = mongoose.model('Investment', investmentSchema);
