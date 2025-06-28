const mongoose = require('mongoose');
const customerMutualFundsSchema = new mongoose.Schema({
  customer_id: { type: Number, required: true },
  fund_name: { type: String, required: true },
  amount: { type: Number, required: true },
  investment_type: { type: String, enum: ["SIP", "Lumpsum"], required: true },
  deduction_date: { type: String }, // For SIPs
  goal: { type: String },
  target_amount: { type: Number },
  investment_horizon: { type: Number },
  order_id: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  status: { type: String, enum: ["Active", "Inactive", "Pending"], default: "Active" },
});

const CustomerMutualFunds = mongoose.model("CustomerMutualFunds", customerMutualFundsSchema);