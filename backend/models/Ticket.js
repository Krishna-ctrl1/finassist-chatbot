const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    customer_id: {
        type: Number,
        required: true,
        index: true
    },
    issue_title: {
        type: String,
        required: true,
        trim: true,
        maxLength: 200
    },
    category: {
        type: String,
        required: true,
        enum: [
            'General Enquiry',
            'KYC Related',
            'Products Related',
            'Orders Related',
            'Payments/Bank Accounts',
            'Account Related',
            'Others'
        ]
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxLength: 2000
    },
    status: {
        type: String,
        enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
        default: 'Open'
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Critical'],
        default: 'Medium'
    },
    ticket_id: {
        type: String,
        required: true,
        unique: true
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    resolved_at: {
        type: Date
    },
    admin_notes: {
        type: String,
        trim: true
    }
});

// Index for efficient querying
ticketSchema.index({ customer_id: 1, created_at: -1 });
ticketSchema.index({ ticket_id: 1 });
ticketSchema.index({ status: 1 });

// Update the updated_at field on save
ticketSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

module.exports = mongoose.model('Ticket', ticketSchema);

