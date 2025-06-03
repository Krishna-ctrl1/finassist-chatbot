const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path'); // Moved to the top
const apiRoutes = require('./routes/api');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors()); // For development; restrict in production if needed
app.use(express.json());

// Serve static files (e.g., index.html) from the frontend folder
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'), (err) => {
        if (err) {
            res.status(500).send('Error serving index.html');
        }
    });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI) // Removed deprecated options
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api', apiRoutes);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});