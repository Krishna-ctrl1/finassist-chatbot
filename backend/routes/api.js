const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Chat = require('../models/Chat');
const authMiddleware = require('../middleware/auth');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

// Create a DOMPurify instance
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Sanitize input to prevent XSS
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return purify.sanitize(input);
};

// Signup
router.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        console.log('Signup request:', { name, email, password: '****' });

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

        const token = jwt.sign(
            { id: user._id, email: user.email, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.status(201).json({ token: token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Signup error:', error.message, error.stack);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

// Login
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Login request:', { email, password: '****' });
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

        const token = jwt.sign(
            { id: user._id, email: user.email, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token: token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Login error:', error.message, error.stack);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// Verify token
router.get('/auth/verify', authMiddleware, async (req, res) => {
    try {
        console.log('Verifying token for user ID:', req.user.id);
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ user: { id: user._id, name: user.name, email: user.email } });
    } catch (error) {
        console.error('Verify token error:', error.message, error.stack);
        res.status(500).json({ message: 'Server error during token verification.' });
    }
});

// Get all chats for a user
router.get('/chat', authMiddleware, async (req, res) => {
    try {
        console.log('Fetching chats for user ID:', req.user.id);
        const chats = await Chat.find({ userId: req.user.id });
        res.json(chats);
    } catch (error) {
        console.error('Get chats error:', error.message, error.stack);
        res.status(500).json({ message: 'Server error while fetching chats.' });
    }
});

// Get a single chat by ID
router.get('/chat/:id', authMiddleware, async (req, res) => {
    try {
        console.log('Fetching chat with ID:', req.params.id);
        const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }
        res.json(chat);
    } catch (error) {
        console.error('Get chat error:', error.message, error.stack);
        res.status(500).json({ message: 'Server error while fetching chat.' });
    }
});

// Create or update a chat
router.post('/chat', authMiddleware, async (req, res) => {
    try {
        const { chatId, title, message } = req.body;
        console.log('Chat request:', { chatId, title, message, userId: req.user.id });
        if (!title || !message) {
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
        if (sanitizedMessage.toLowerCase().includes('sip')) {
            botResponse = 'Your SIPs are performing well. Current value: ₹50,000 with a 12% annual return.';
        } else if (sanitizedMessage.toLowerCase().includes('portfolio')) {
            botResponse = 'Your portfolio includes 60% equities, 30% bonds, and 10% cash. Total value: ₹2,50,000.';
        } else if (sanitizedMessage.toLowerCase().includes('transactions')) {
            botResponse = 'Recent transactions: ₹10,000 SIP on 01/06/2025, ₹5,000 withdrawal on 30/05/2025.';
        } else if (sanitizedMessage.toLowerCase().includes('balance')) {
            botResponse = 'Your current account balance is ₹1,20,000.';
        } else {
            botResponse = 'I can help with your SIPs, investments, portfolio, or financial planning. Try a specific question!';
        }

        chat.messages.push({ sender: 'bot', content: botResponse });
        await chat.save();

        res.json(chat);
    } catch (error) {
        console.error('Chat error:', error.message, error.stack);
        res.status(500).json({ message: 'Server error while processing chat.' });
    }
});

// Delete a chat
router.delete('/chat/:id', authMiddleware, async (req, res) => {
    try {
        console.log('Deleting chat with ID:', req.params.id, 'for user:', req.user.id);
        const chat = await Chat.findOne({ _id: req.params.id, userId: req.user.id });
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        const result = await Chat.deleteOne({ _id: req.params.id, userId: req.user.id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        res.status(200).json({ message: 'Chat deleted successfully' });
    } catch (error) {
        console.error('Delete chat error:', error.message, error.stack);
        res.status(500).json({ message: 'Server error while deleting chat.' });
    }
});

module.exports = router;