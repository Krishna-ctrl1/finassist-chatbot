const API_BASE = window.location.origin + "/api";
let currentUser = null;
let currentChatId = null;

// Cache DOM elements
const elements = {
  authScreen: document.getElementById("authScreen"),
  chatScreen: document.getElementById("chatScreen"),
  chatMessages: document.getElementById("chatMessages"),
  chatHistory: document.getElementById("chatHistory"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),
  typingIndicator: document.getElementById("typingIndicator"),
  userName: document.getElementById("userName"),
  userInitials: document.getElementById("userInitials"),
  loginForm: document.getElementById("loginForm"),
  signupForm: document.getElementById("signupForm"),
  loginBtn: document.getElementById("loginBtn"),
  signupBtn: document.getElementById("signupBtn"),
  sidebar: document.getElementById("sidebar"),
};

// Debounce utility
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Initialize app
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded, initializing app...");
  showAuthScreen();
  checkAuthStatus();
  setupEventListeners();
});

function setupEventListeners() {
  // Auto-resize textarea
  elements.messageInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 100) + "px";
  });

  // Send message on Enter (but allow Shift+Enter for new lines)
  elements.messageInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Form submissions
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.signupForm.addEventListener("submit", handleSignup);

  // Real-time form validation
  elements.loginForm.querySelector("#loginEmail").addEventListener("input", validateLoginForm);
  elements.loginForm.querySelector("#loginPassword").addEventListener("input", validateLoginForm);
  elements.signupForm.querySelector("#signupName").addEventListener("input", validateSignupForm);
  elements.signupForm.querySelector("#signupEmail").addEventListener("input", validateSignupForm);
  elements.signupForm.querySelector("#signupPassword").addEventListener("input", validateSignupForm);

  // Close sidebar when clicking outside
  document.addEventListener("click", function (e) {
    const toggleBtn = document.querySelector(".sidebar-toggle");
    if (
      elements.sidebar.classList.contains("active") &&
      !elements.sidebar.contains(e.target) &&
      !toggleBtn.contains(e.target)
    ) {
      elements.sidebar.classList.remove("active");
    }
  });
}

// Form validation functions
const validateLoginForm = debounce(() => {
  const email = elements.loginForm.querySelector("#loginEmail");
  const password = elements.loginForm.querySelector("#loginPassword");
  const emailError = elements.loginForm.querySelector("#loginEmailError");
  const passwordError = elements.loginForm.querySelector("#loginPasswordError");
  let isValid = true;

  // Email validation
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    emailError.style.display = "block";
    email.classList.add("error");
    isValid = false;
  } else {
    emailError.style.display = "none";
    email.classList.remove("error");
  }

  // Password validation
  if (!password.value) {
    passwordError.style.display = "block";
    password.classList.add("error");
    isValid = false;
  } else {
    passwordError.style.display = "none";
    password.classList.remove("error");
  }

  elements.loginBtn.disabled = !isValid;
}, 300);

const validateSignupForm = debounce(() => {
  const name = elements.signupForm.querySelector("#signupName");
  const email = elements.signupForm.querySelector("#signupEmail");
  const password = elements.signupForm.querySelector("#signupPassword");
  const nameError = elements.signupForm.querySelector("#signupNameError");
  const emailError = elements.signupForm.querySelector("#signupEmailError");
  const passwordError = elements.signupForm.querySelector("#signupPasswordError");
  let isValid = true;

  // Name validation
  if (!name.value.trim()) {
    nameError.style.display = "block";
    name.classList.add("error");
    isValid = false;
  } else {
    nameError.style.display = "none";
    name.classList.remove("error");
  }

  // Email validation
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    emailError.style.display = "block";
    email.classList.add("error");
    isValid = false;
  } else {
    emailError.style.display = "none";
    email.classList.remove("error");
  }

  // Password validation
  if (!password.value || password.value.length < 8) {
    passwordError.style.display = "block";
    password.classList.add("error");
    isValid = false;
  } else {
    passwordError.style.display = "none";
    password.classList.remove("error");
  }

  elements.signupBtn.disabled = !isValid;
}, 300);

// Utility function to sanitize user input
function sanitizeInput(input) {
  if (!input) return '';
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

// Authentication functions
async function checkAuthStatus() {
  const token = localStorage.getItem("authToken");
  if (!token) {
    console.log("No authentication token found");
    showAuthScreen();
    return;
  }

  try {
    console.log("Verifying authentication token...");
    const response = await fetch(`${API_BASE}/auth/verify`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status}`);
    }

    const data = await response.json();
    console.log("Authentication successful:", data);

    currentUser = data.user;
    showChatScreen(data.user);
    await loadChatHistory();
  } catch (error) {
    console.error("Authentication check failed:", error);
    localStorage.removeItem("authToken");
    showAuthScreen();
    showNotification("Session expired. Please sign in again.", "warning");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  console.log("Attempting login...");
  
  setButtonLoading(elements.loginBtn, true, "Signing In...");

  const formData = new FormData(e.target);
  const credentials = {
    email: formData.get("email").trim(),
    password: formData.get("password")
  };

  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });

    const data = await response.json();
    console.log("Login response:", { success: response.ok, message: data.message });

    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    // Store authentication token
    localStorage.setItem("authToken", data.token);
    currentUser = data.user;
    
    console.log("Login successful for user:", currentUser.name);
    showChatScreen(data.user);
    showNotification("Welcome back!", "success");
    
    // Load chat history after a brief delay
    setTimeout(() => loadChatHistory(), 100);
  } catch (error) {
    console.error("Login error:", error);
    showNotification(error.message || "Login failed. Please check your credentials.", "error");
  } finally {
    setButtonLoading(elements.loginBtn, false, "Sign In");
  }
}

async function handleSignup(e) {
  e.preventDefault();
  console.log("Attempting signup...");
  
  setButtonLoading(elements.signupBtn, true, "Creating Account...");

  const formData = new FormData(e.target);
  const userData = {
    name: formData.get("name").trim(),
    email: formData.get("email").trim(),
    password: formData.get("password")
  };

  try {
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });

    const data = await response.json();
    console.log("Signup response:", { success: response.ok, message: data.message });

    if (!response.ok) {
      throw new Error(data.message || "Signup failed");
    }

    // Store authentication token
    localStorage.setItem("authToken", data.token);
    currentUser = data.user;
    
    console.log("Signup successful for user:", currentUser.name);
    showChatScreen(data.user);
    showNotification("Account created successfully! Welcome to FinanceAI!", "success");
    
    setTimeout(() => loadChatHistory(), 100);
  } catch (error) {
    console.error("Signup error:", error);
    showNotification(error.message || "Signup failed. Please try again.", "error");
  } finally {
    setButtonLoading(elements.signupBtn, false, "Create Account");
  }
}

// UI helper functions
function setButtonLoading(button, isLoading, text) {
  if (isLoading) {
    button.disabled = true;
    button.innerHTML = `<i class="fas fa-spinner fa-spin" aria-label="Loading"></i> ${text}`;
  } else {
    button.disabled = false;
    const iconClass = button === elements.loginBtn ? "fa-sign-in-alt" : "fa-user-plus";
    button.innerHTML = `<i class="fas ${iconClass}" style="margin-right: 8px;"></i> ${text}`;
  }
}

function showNotification(message, type = "info") {
  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
      <span>${sanitizeInput(message)}</span>
    </div>
  `;
  
  // Add to DOM
  document.body.appendChild(notification);
  
  // Remove after delay
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

function switchToSignup() {
  elements.loginForm.style.display = "none";
  elements.signupForm.style.display = "block";
  elements.signupForm.querySelector("#signupName").focus();
}

function switchToLogin() {
  elements.signupForm.style.display = "none";
  elements.loginForm.style.display = "block";
  elements.loginForm.querySelector("#loginEmail").focus();
}

function showAuthScreen() {
  elements.authScreen.style.display = "flex";
  elements.chatScreen.style.display = "none";
  // Focus first input field
  setTimeout(() => {
    const firstInput = elements.loginForm.querySelector("#loginEmail");
    if (firstInput) firstInput.focus();
  }, 100);
}

function showChatScreen(user) {
  currentUser = user;
  elements.authScreen.style.display = "none";
  elements.chatScreen.style.display = "flex";
  
  // Update user info in header
  elements.userName.textContent = sanitizeInput(user.name);
  elements.userInitials.textContent = sanitizeInput(user.name.charAt(0).toUpperCase());
  
  // Reset chat area to welcome state
  resetChatArea();
}

function resetChatArea() {
  elements.chatMessages.innerHTML = `
    <div class="welcome-card">
      <h2>Welcome to FinanceAI! 👋</h2>
      <p>I'm your personal financial assistant. Ask me anything about your investments, SIPs, portfolio, or financial planning.</p>
    </div>
    <div class="quick-actions">
      <div class="quick-action" role="button" tabindex="0" onclick="sendQuickMessage('What is the status of my SIP?')" onkeydown="if(event.key === 'Enter') sendQuickMessage('What is the status of my SIP?')">
        <div class="quick-action-icon">
          <i class="fas fa-calendar-check" aria-hidden="true"></i>
        </div>
        <h4>SIP Status</h4>
        <p>Check your current SIP investments</p>
      </div>
      <div class="quick-action" role="button" tabindex="0" onclick="sendQuickMessage('Show me my portfolio')" onkeydown="if(event.key === 'Enter') sendQuickMessage('Show me my portfolio')">
        <div class="quick-action-icon">
          <i class="fas fa-chart-pie" aria-hidden="true"></i>
        </div>
        <h4>Portfolio Overview</h4>
        <p>View your investment portfolio</p>
      </div>
      <div class="quick-action" role="button" tabindex="0" onclick="sendQuickMessage('What are my recent transactions?')" onkeydown="if(event.key === 'Enter') sendQuickMessage('What are my recent transactions?')">
        <div class="quick-action-icon">
          <i class="fas fa-receipt" aria-hidden="true"></i>
        </div>
        <h4>Transactions</h4>
        <p>Review recent financial activities</p>
      </div>
      <div class="quick-action" role="button" tabindex="0" onclick="sendQuickMessage('What is my account balance?')" onkeydown="if(event.key === 'Enter') sendQuickMessage('What is my account balance?')">
        <div class="quick-action-icon">
          <i class="fas fa-wallet" aria-hidden="true"></i>
        </div>
        <h4>Balance Inquiry</h4>
        <p>Check your available balance</p>
      </div>
    </div>
    <div class="typing-indicator" id="typingIndicator">
      <div class="message-avatar">
        <i class="fas fa-robot" aria-label="FinanceAI assistant"></i>
      </div>
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
    </div>
  `;
  
  // Update reference to typing indicator
  elements.typingIndicator = document.getElementById("typingIndicator");
}

function logout() {
  console.log("Logging out user...");
  localStorage.removeItem("authToken");
  currentUser = null;
  currentChatId = null;
  
  // Reset UI state
  resetChatArea();
  elements.chatHistory.innerHTML = "";
  
  showAuthScreen();
  showNotification("You have been logged out.", "info");
}

// Sidebar functions
function toggleSidebar() {
  console.log("Toggling sidebar...");
  elements.sidebar.classList.toggle("active");
  
  // Log current state for debugging
  const isActive = elements.sidebar.classList.contains("active");
  console.log(`Sidebar is now ${isActive ? 'open' : 'closed'}`);
}

// Chat history functions
async function loadChatHistory() {
  const token = localStorage.getItem("authToken");
  if (!token || !currentUser) {
    console.log("No auth token or user, skipping chat history load");
    return;
  }

  try {
    console.log("Loading chat history...");
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch chat history: ${response.status}`);
    }

    const chats = await response.json();
    console.log(`Loaded ${chats.length} chats from history`);

    renderChatHistory(chats);
  } catch (error) {
    console.error("Failed to load chat history:", error);
    showNotification("Failed to load chat history", "error");
  }
}

function renderChatHistory(chats) {
  elements.chatHistory.innerHTML = "";
  
  if (chats.length === 0) {
    elements.chatHistory.innerHTML = `
      <div class="chat-history-empty">
        <p>No chat history yet. Start a conversation!</p>
      </div>
    `;
    return;
  }

  chats.forEach((chat) => {
    const chatItem = document.createElement("div");
    chatItem.className = `chat-history-item ${chat._id === currentChatId ? "active" : ""}`;
    chatItem.setAttribute("tabindex", "0");
    
    // Get preview text from first user message
    const firstUserMessage = chat.messages.find(msg => msg.sender === 'user');
    const preview = firstUserMessage ? firstUserMessage.content : "New chat";
    
    chatItem.innerHTML = `
      <div class="chat-history-content">
        <h4>${sanitizeInput(chat.title || preview)}</h4>
        <p>${sanitizeInput(preview.length > 50 ? preview.substring(0, 47) + "..." : preview)}</p>
        <span class="chat-date">${formatDate(chat.updatedAt || chat.createdAt)}</span>
      </div>
      <button class="delete-chat-btn" data-chat-id="${chat._id}" aria-label="Delete chat">
        <i class="fas fa-trash-alt"></i>
      </button>
    `;
    
    // Click handlers
    chatItem.onclick = (e) => {
      if (!e.target.closest(".delete-chat-btn")) {
        loadChat(chat._id);
      }
    };
    
    chatItem.onkeydown = (e) => {
      if (e.key === "Enter" && !e.target.closest(".delete-chat-btn")) {
        loadChat(chat._id);
      }
    };
    
    // Delete button handler
    const deleteBtn = chatItem.querySelector(".delete-chat-btn");
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteChat(chat._id);
    };
    
    elements.chatHistory.appendChild(chatItem);
  });
}

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) return 'Today';
  if (diffDays === 2) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// Chat functions
async function loadChat(chatId) {
  const token = localStorage.getItem("authToken");
  
  try {
    console.log(`Loading chat: ${chatId}`);
    const response = await fetch(`${API_BASE}/chat/${chatId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load chat: ${response.status}`);
    }

    const chat = await response.json();
    console.log(`Loaded chat with ${chat.messages.length} messages`);

    currentChatId = chatId;
    
    // Clear current messages
    elements.chatMessages.innerHTML = "";
    
    // Render messages
    chat.messages.forEach((message) => {
      appendMessage(message.sender, message.content, false);
    });
    
    scrollToBottom();
    elements.sidebar.classList.remove("active");
    
    // Update active state in sidebar
    document.querySelectorAll('.chat-history-item').forEach(item => {
      item.classList.toggle('active', item.querySelector('.delete-chat-btn').dataset.chatId === chatId);
    });
    
  } catch (error) {
    console.error("Failed to load chat:", error);
    showNotification("Failed to load chat", "error");
  }
}

async function deleteChat(chatId) {
  if (!confirm("Are you sure you want to delete this chat? This action cannot be undone.")) {
    return;
  }

  const token = localStorage.getItem("authToken");
  
  try {
    console.log(`Deleting chat: ${chatId}`);
    const response = await fetch(`${API_BASE}/chat/${chatId}`, {
      method: "DELETE",
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete chat: ${response.status}`);
    }

    console.log("Chat deleted successfully");
    
    // If this was the current chat, reset the view
    if (chatId === currentChatId) {
      currentChatId = null;
      resetChatArea();
    }
    
    // Reload chat history
    await loadChatHistory();
    showNotification("Chat deleted successfully", "success");
    
  } catch (error) {
    console.error("Failed to delete chat:", error);
    showNotification("Failed to delete chat", "error");
  }
}

function appendMessage(sender, message, animate = true) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  
  const avatar = sender === "user" 
    ? sanitizeInput(currentUser.name.charAt(0).toUpperCase())
    : '<i class="fas fa-robot" aria-label="FinanceAI assistant"></i>';
  
  messageDiv.innerHTML = `
    <div class="message-content">
      <div class="message-avatar">${avatar}</div>
      <div class="message-bubble">${sanitizeInput(message)}</div>
    </div>
  `;
  
  if (animate) {
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
  }
  
  elements.chatMessages.appendChild(messageDiv);
  
  if (animate) {
    setTimeout(() => {
      messageDiv.style.transition = 'all 0.3s ease';
      messageDiv.style.opacity = '1';
      messageDiv.style.transform = 'translateY(0)';
    }, 10);
  }
  
  scrollToBottom();
}

function scrollToBottom() {
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

async function sendMessage() {
  const message = elements.messageInput.value.trim();
  if (!message) return;

  // Remove welcome elements if present
  const welcomeCard = elements.chatMessages.querySelector(".welcome-card");
  const quickActions = elements.chatMessages.querySelector(".quick-actions");
  if (welcomeCard) welcomeCard.remove();
  if (quickActions) quickActions.remove();

  // Add user message
  appendMessage("user", message);
  
  // Clear input and reset height
  elements.messageInput.value = "";
  elements.messageInput.style.height = "48px";
  
  // Disable send button and show typing indicator
  elements.sendBtn.disabled = true;
  elements.typingIndicator.style.display = "flex";

  const token = localStorage.getItem("authToken");
  
  try {
    // Generate title for new chats
    const title = currentChatId ? "" : (message.substring(0, 50) + (message.length > 50 ? "..." : ""));
    
    console.log("Sending message...", { chatId: currentChatId, hasTitle: !!title });
    
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ 
        chatId: currentChatId, 
        title, 
        message 
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status}`);
    }

    const chat = await response.json();
    console.log("Message sent successfully");

    // Update current chat ID
    currentChatId = chat._id;

    // Add AI response (get the last message that's not from user)
    const aiResponses = chat.messages.filter(msg => msg.sender !== "user");
    const lastAiResponse = aiResponses[aiResponses.length - 1];
    
    if (lastAiResponse) {
      setTimeout(() => {
        appendMessage("bot", lastAiResponse.content);
      }, 500); // Small delay for better UX
    }

    // Reload chat history to update sidebar
    loadChatHistory();
    
  } catch (error) {
    console.error("Failed to send message:", error);
    appendMessage("bot", "Sorry, I'm having trouble processing your request right now. Please try again in a moment.");
    showNotification("Failed to send message", "error");
  } finally {
    elements.typingIndicator.style.display = "none";
    elements.sendBtn.disabled = false;
  }
}

function sendQuickMessage(message) {
  elements.messageInput.value = message;
  sendMessage();
}

function startNewChat() {
  console.log("Starting new chat...");
  currentChatId = null;
  resetChatArea();
  
  // Remove active state from all chat items
  document.querySelectorAll('.chat-history-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Close sidebar on mobile
  elements.sidebar.classList.remove("active");
  
  showNotification("New chat started", "success");
}