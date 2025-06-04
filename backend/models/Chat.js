const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: String,
        required: true,
        enum: ['user', 'bot']
    },
    content: {
        type: String,
        required: true,
        trim: true,
        minLength: 1
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const chatSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        minLength: 1,
        maxLength: 50
    },
    messages: [messageSchema]
});

chatSchema.index({ userId: 1, _id: 1 });

module.exports = mongoose.model('Chat', chatSchema);