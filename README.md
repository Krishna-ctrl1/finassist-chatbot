# 🚀 FinAssist Chatbot

[![Node.js](https://img.shields.io/badge/Node.js-Backend-green.svg)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-MCP_Server-blue.svg)](https://python.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-brightgreen.svg)](https://www.mongodb.com/)
[![OpenAI](https://img.shields.io/badge/AI-GPT--4o-orange.svg)](https://openai.com/)

FinAssist is an advanced, AI-powered financial advisor and portfolio management assistant. Built specifically for the Indian and global markets, it leverages advanced natural language understanding, RAG (Retrieval-Augmented Generation), and real-time market data to act as a comprehensive personal wealth manager.

## ✨ Core Features

### 1️⃣ Natural Language Understanding
Understands broken, vague, or typo-laden inputs gracefully. 
- *"Show me mf"* → "Show my mutual fund portfolio"
- *"appplle price"* → "Apple Inc. stock price"

### 2️⃣ Smart Query Classification
Intelligently routes messages into intent categories for accurate handling:
- **USER-SPECIFIC-FINANCIAL**: Orders, portfolio reviews, SIPs.
- **GENERAL-FINANCIAL**: Market concepts, top mutual funds, CAGR.
- **TICKET_REQUEST**: Customer support, issue reporting.
- **GREETINGS & NON-FINANCIAL**: Casual chatter, affirmations, fallback handling.

### 3️⃣ Finance Education + Market Advisory
Explains complex concepts like SIP, CAGR, NAV, Equity, and ELSS. Evaluates risk profiles (low, moderate, high) and offers data-backed, realistic market suggestions.

### 4️⃣ What-If Scenario Analysis
Simulates historical investment growth using CAGR-based projections. 
*(e.g., "If I had invested ₹25,000 in HDFC Top 100 5 years ago, what would be the return?")*

### 5️⃣ Comparative Financial Analysis
Side-by-side comparisons of mutual funds and stocks analyzing NAV, 1Y/3Y/5Y CAGR, AUM, and Expense Ratios. 

### 6️⃣ Portfolio-Specific Smart Answers
Direct database integration to answer highly personalized questions:
- *"How is my portfolio performing?"*
- *"Show last 3 orders."*
- Analyzes invested value vs. current value and active SIPs.

### 7️⃣ Mutual Fund Discovery
Advanced search capabilities using specific filters.
*(e.g., "Best ELSS fund with 3Y CAGR > 15%" or "Find a mutual fund with 5% Apple holdings.")*

### 8️⃣ AI-Powered Ticket Creation
Auto-generates structured support tickets directly from chat context. Extracts titles, categories (Payments, Orders), and descriptions, logging them to the database securely.

### 9️⃣ Voice Support
Integrated Google Cloud Text-to-Speech allowing users to set voice preferences, safely converting text replies to rich audio, and auto-reading chat answers.

## 🎨 UI/UX System

Our interface is engineered for a premium, native feel:
- **Design Tokens:** Primary (Orange `#eb8021`, Purple `#6929d9`), Secondary (Peach `#ffede0`, Dark Grey `#111111`)
- **Modern Aesthetics:** Glassmorphism, subtle noise textures, and dynamic gradient buttons.
- **Micro-Animations:** Fade, shimmer, and realistic typing effects.
- **Theme Support:** Adaptive Light & Dark modes.
- **Responsive:** Fully optimized mobile-friendly dashboard and chat UI.

---

## 🏗️ Architecture & Tech Stack

The application is split into three primary layers:

1. **Frontend UI (React/Vanilla JS + CSS)**
   - Premium glassmorphic styling and dynamic visualizations.
   
2. **Backend API (Node.js & Express)**
   - Manages user authentication, MongoDB connections (chat histories, folios, orders, tickets), AI prompting, RAG embedding generation, and query classification.
   - Integrates with OpenAI (`gpt-4o`) using a highly tuned, hallucination-resistant financial prompt.

3. **Context Protocol Server (Python)**
   - An isolated Python MCP (Model Context Protocol) server (`stock_market_server.py`).
   - Powers the 38+ live market tools bridging APIs like `yfinance`, `finnhub`, and `mftool` (Indian Mutual Funds) to generate dynamic charts and fetch real-time NAVs and stock quotes.

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- MongoDB instance (Local or Atlas)
- Required API Keys: OpenAI, Finnhub, Google Cloud TTS (optional)

### 1. Backend Server Setup
```bash
cd backend
npm install
# Ensure your .env is configured with MONGO_URI and OPENAI_API_KEY
node new_server.js
```

### 2. Python MCP Server Setup
```bash
cd mcp-server
python -m venv venv
# Activate the virtual environment
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python stock_market_server.py
```

### 3. Frontend Setup
Navigate to your frontend directory and start your local development server or open the bundled interface.

## 📝 Configuration (`.env` file)
You will need to create a `.env` file in the `backend` directory:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/financeai
OPENAI_API_KEY=your_openai_api_key
FINNHUB_API_KEY=your_finnhub_api_key
```

## 🔒 Security & Data Privacy
- **Strict Data Handling:** The AI operates under rigorous system prompts preventing generic answers and financial hallucinations. 
- **User Isolation:** Database fetching strictly filters records by validated customer IDs.

---
*Built with ❤️ for intelligent wealth management.*
