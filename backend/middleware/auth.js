const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const token = req.headers.authorization?.split(' ') ? req.headers.authorization.split(' ')[1] : null;
    if (!token) {
        console.log('No token provided for request:', req.url);
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token decoded:', decoded);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification error:', error.message, error.stack);
        res.status(401).json({ message: 'Invalid token' });
    }
};