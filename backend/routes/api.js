const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const authMiddleware = require('../middleware/auth');

// Sanitize input to prevent XSS
const sanitizeInput = (input) => {
    return input.replace(/<[^>]*>?/gm, '');
};

// Signup
router.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: 'Invalid email format' });
        }

        const sanitizedName = sanitizeInput(name);
        const sanitizedEmail = sanitizeInput(email);

        const existingUser = await User.findOne({ email: sanitizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const user = new User({
            name: sanitizedName,
            email: sanitizedEmail,
            password
        });
        await user.save();

        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const sanitizedEmail = sanitizeInput(email);
        const user = await User.findOne({ email: sanitizedEmail });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify token
router.get('/auth/verify', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user: { id: user._id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all chats for a user
router.get('/chat', authMiddleware, async (req, res) => {
    try {
        const chats = await Chat.find({ userId: req.user.id });
        res.json(chats);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Create or update a chat
router.post('/chat', authMiddleware, async (req, res) => {
    try {
        const { chatId, title, message } = req.body;
        if (!message || !title) {
            return res.status(400).json({ message: 'Title and message are required' });
        }

        const sanitizedTitle = sanitizeInput(title);
        const sanitizedMessage = sanitizeInput(message);

        let chat;
        if (chatId) {
            chat = await Chat.findOne({ _id: chatId, userId: req.user.id });
            if (!chat) {
                return res.status(404).json({ message: 'Chat not found' });
            }
            chat.messages.push({ sender: 'user', content: sanitizedMessage });
            await chat.save();
        } else {
            chat = new Chat({
                userId: req.user.id,
                title: sanitizedTitle,
                messages: [{ sender: 'user', content: sanitizedMessage }]
            });
            await chat.save();
        }

        // Mock bot response (replace with real AI integration, e.g., xAI's Grok API)
        let botResponse = '';
        if (sanitizedMessage.includes('SIP')) {
            botResponse = 'Your SIPs are performing well. Current value: ₹50,000 with a 12% annual return.';
        } else if (sanitizedMessage.includes('portfolio')) {
            botResponse = 'Your portfolio includes 60% equities, 30% bonds, and 10% cash. Total value: ₹2,50,000.';
        } else if (sanitizedMessage.includes('transactions')) {
            botResponse = 'Recent transactions: ₹10,000 SIP on 01/06/2025, ₹5,000 withdrawal on 30/05/2025.';
        } else if (sanitizedMessage.includes('balance')) {
            botResponse = 'Your current account balance is ₹1,20,000.';
        } else {
            botResponse = 'I can help with SIPs, portfolio, transactions, or balance inquiries. Try a specific question!';
        }

        chat.messages.push({ sender: 'bot', content: botResponse });
        await chat.save();

        res.json(chat);
    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;