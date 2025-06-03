const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const apiRoutes = require('./routes/api');

// Load environment variables from the .env file in the root directory
dotenv.config({ path: path.join(__dirname, '../.env') });
console.log('MONGO_URI:', process.env.MONGO_URI); // Debug line
console.log('JWT_SECRET:', process.env.JWT_SECRET); // Debug line

// Check if MONGO_URI is undefined
if (!process.env.MONGO_URI) {
    console.error('Error: MONGO_URI is not defined in the .env file');
    process.exit(1);
}

const app = express();

// Middleware
app.use(cors());
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

// Connect to MongoDB with a timeout
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000 // Timeout after 5 seconds
})
    .then(() => {
        console.log('Connected to MongoDB');
        // Start server only after MongoDB connection is successful
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Routes
app.use('/api', apiRoutes);