const API_BASE = window.location.origin + "/api";
const THEME_KEY = 'theme-preference';
let authToken = null; // Don't use localStorage initially
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

// Debounce utility function
function debounce(fn, ms) {
  let timeout;
  return function(...args) {
    const self = this;
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      fn.apply(self, args);
    }, ms);
  };
}

// Initialize app
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOM loaded, initializing app...");
  showAuthScreen();
  initializeTheme();
  checkAuthStatus();
  setupEventListeners();
});

function setupEventListeners() {
  // Auto-resize textarea with enhanced mobile support
  if (elements.messageInput) {
    elements.messageInput.addEventListener("input", function () {
      this.style.height = "auto";
      const newHeight = Math.min(this.scrollHeight, 120);
      this.style.height = newHeight + "px";
      
      // On mobile, ensure the input stays visible when content expands
      if (window.innerWidth <= 768 && document.body.classList.contains('keyboard-open')) {
        setTimeout(() => {
          this.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'end',
            inline: 'nearest'
          });
        }, 50);
      }
      
      // Enable/disable send button based on input
      updateSendButtonState();
    });
  }

  // Send message on Enter (but allow Shift+Enter for new lines)
  if (elements.messageInput) {
    elements.messageInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Form submissions
  if (elements.loginForm) {
    elements.loginForm.addEventListener("submit", handleLogin);
  }
  if (elements.signupForm) {
    elements.signupForm.addEventListener("submit", handleSignup);
  }

  // Real-time form validation
  if (elements.loginForm) {
    const loginEmail = elements.loginForm.querySelector("#loginEmail");
    const loginPassword = elements.loginForm.querySelector("#loginPassword");
    if (loginEmail) loginEmail.addEventListener("input", validateLoginForm);
    if (loginPassword) loginPassword.addEventListener("input", validateLoginForm);
  }

  if (elements.signupForm) {
    const signupName = elements.signupForm.querySelector("#signupName");
    const signupEmail = elements.signupForm.querySelector("#signupEmail");
    const signupPassword = elements.signupForm.querySelector("#signupPassword");
    if (signupName) signupName.addEventListener("input", validateSignupForm);
    if (signupEmail) signupEmail.addEventListener("input", validateSignupForm);
    if (signupPassword) signupPassword.addEventListener("input", validateSignupForm);
  }

  // Close sidebar when clicking outside or on overlay
  document.addEventListener("click", function (e) {
    const toggleBtn = document.querySelector(".sidebar-toggle");
    const overlay = document.getElementById("sidebarOverlay");
    
    if (
      elements.sidebar && elements.sidebar.classList.contains("active") &&
      !elements.sidebar.contains(e.target) &&
      (!toggleBtn || !toggleBtn.contains(e.target))
    ) {
      elements.sidebar.classList.remove("active");
    }
  });
  
  // Handle overlay click
  const overlay = document.getElementById("sidebarOverlay");
  if (overlay) {
    overlay.addEventListener("click", function() {
      if (elements.sidebar) {
        elements.sidebar.classList.remove("active");
      }
    });
  }

  // Send button click handler
  if (elements.sendBtn) {
    elements.sendBtn.addEventListener("click", sendMessage);
  }
}

// Form validation functions
const validateLoginForm = debounce(() => {
  if (!elements.loginForm) return;
  
  const email = elements.loginForm.querySelector("#loginEmail");
  const password = elements.loginForm.querySelector("#loginPassword");
  const emailError = elements.loginForm.querySelector("#loginEmailError");
  const passwordError = elements.loginForm.querySelector("#loginPasswordError");
  
  if (!email || !password) return;
  
  let isValid = true;

  // Email validation
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    if (emailError) emailError.style.display = "block";
    email.classList.add("error");
    isValid = false;
  } else {
    if (emailError) emailError.style.display = "none";
    email.classList.remove("error");
  }

  // Password validation
  if (!password.value) {
    if (passwordError) passwordError.style.display = "block";
    password.classList.add("error");
    isValid = false;
  } else {
    if (passwordError) passwordError.style.display = "none";
    password.classList.remove("error");
  }

  if (elements.loginBtn) elements.loginBtn.disabled = !isValid;
}, 300);

const validateSignupForm = debounce(() => {
  if (!elements.signupForm) return;
  
  const name = elements.signupForm.querySelector("#signupName");
  const email = elements.signupForm.querySelector("#signupEmail");
  const password = elements.signupForm.querySelector("#signupPassword");
  const nameError = elements.signupForm.querySelector("#signupNameError");
  const emailError = elements.signupForm.querySelector("#signupEmailError");
  const passwordError = elements.signupForm.querySelector("#signupPasswordError");
  
  if (!name || !email || !password) return;
  
  let isValid = true;

  // Name validation
  if (!name.value.trim()) {
    if (nameError) nameError.style.display = "block";
    name.classList.add("error");
    isValid = false;
  } else {
    if (nameError) nameError.style.display = "none";
    name.classList.remove("error");
  }

  // Email validation
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    if (emailError) emailError.style.display = "block";
    email.classList.add("error");
    isValid = false;
  } else {
    if (emailError) emailError.style.display = "none";
    email.classList.remove("error");
  }

  // Password validation
  if (!password.value || password.value.length < 8) {
    if (passwordError) passwordError.style.display = "block";
    password.classList.add("error");
    isValid = false;
  } else {
    if (passwordError) passwordError.style.display = "none";
    password.classList.remove("error");
  }

  if (elements.signupBtn) elements.signupBtn.disabled = !isValid;
}, 300);

// Utility function to sanitize user input
function sanitizeInput(input) {
  if (!input) return '';
  if (typeof input !== 'string') {
    input = String(input);
  }
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

// Authentication functions
async function checkAuthStatus() {
  // Try to get token from memory first, then localStorage
  authToken = authToken || (typeof localStorage !== 'undefined' ? localStorage.getItem("authToken") : null);
  
  if (!authToken) {
    console.log("No authentication token found");
    showAuthScreen();
    return;
  }

  try {
    console.log("Verifying authentication token...");
    const response = await fetch(`${API_BASE}/auth/verify`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
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
    authToken = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem("authToken");
    }
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
    authToken = data.token;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem("authToken", data.token);
    }
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
    authToken = data.token;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem("authToken", data.token);
    }
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
  if (!button) return;
  
  if (isLoading) {
    button.disabled = true;
    button.classList.add('btn-loading');
    button.setAttribute('data-original-text', button.textContent);
    button.innerHTML = text;
  } else {
    button.disabled = false;
    button.classList.remove('btn-loading');
    const iconClass = button === elements.loginBtn ? "fa-sign-in-alt" : "fa-user-plus";
    button.innerHTML = `<i class="fas ${iconClass}" style="margin-right: 8px;"></i> ${text}`;
  }
}

// Update send button state based on input
function updateSendButtonState() {
  if (!elements.sendBtn || !elements.messageInput) return;
  
  const hasText = elements.messageInput.value.trim().length > 0;
  const isCurrentlyDisabled = elements.sendBtn.disabled;
  
  elements.sendBtn.disabled = !hasText;
  
  // Animate button state changes
  if (hasText && isCurrentlyDisabled) {
    // Animate to enabled state
    elements.sendBtn.style.transition = 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    elements.sendBtn.style.opacity = '1';
    elements.sendBtn.style.transform = 'scale(1)';
    elements.sendBtn.style.boxShadow = '0 4px 12px rgba(16, 163, 127, 0.3)';
  } else if (!hasText && !isCurrentlyDisabled) {
    // Animate to disabled state
    elements.sendBtn.style.transition = 'all 0.2s ease-out';
    elements.sendBtn.style.opacity = '0.5';
    elements.sendBtn.style.transform = 'scale(0.9)';
    elements.sendBtn.style.boxShadow = 'none';
  }
}

function showNotification(message, type = "info") {
  try {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    
    const iconClass = type === 'success' ? 'fa-check-circle' : 
                     type === 'error' ? 'fa-exclamation-circle' : 
                     type === 'warning' ? 'fa-exclamation-triangle' : 
                     'fa-info-circle';
    
    notification.innerHTML = `
      <div class="notification-content">
        <i class="fas ${iconClass}"></i>
        <span>${sanitizeInput(message)}</span>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Add haptic feedback on mobile
    if ('vibrate' in navigator && window.innerWidth <= 768) {
      try {
        if (type === 'error') {
          navigator.vibrate([100, 50, 100]); // Error pattern
        } else if (type === 'success') {
          navigator.vibrate(100); // Success vibration
        }
      } catch (vibrateError) {
        console.warn('Vibration not supported:', vibrateError);
      }
    }
    
    // Remove after delay with exit animation
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px) scale(0.9)';
        
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 400);
      }
    }, 4000);
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

function switchToSignup() {
  if (elements.loginForm) elements.loginForm.style.display = "none";
  if (elements.signupForm) {
    elements.signupForm.style.display = "block";
    const nameField = elements.signupForm.querySelector("#signupName");
    if (nameField) nameField.focus();
  }
}

function switchToLogin() {
  if (elements.signupForm) elements.signupForm.style.display = "none";
  if (elements.loginForm) {
    elements.loginForm.style.display = "block";
    const emailField = elements.loginForm.querySelector("#loginEmail");
    if (emailField) emailField.focus();
  }
}

function showAuthScreen() {
  if (elements.authScreen) elements.authScreen.style.display = "flex";
  if (elements.chatScreen) elements.chatScreen.style.display = "none";
  // Focus first input field
  setTimeout(() => {
    if (elements.loginForm) {
      const firstInput = elements.loginForm.querySelector("#loginEmail");
      if (firstInput) firstInput.focus();
    }
  }, 100);
}

function showChatScreen(user) {
  currentUser = user;
  
  // Smooth transition from auth to chat
  if (elements.authScreen) {
    elements.authScreen.style.opacity = '0';
    elements.authScreen.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
      elements.authScreen.style.display = "none";
      if (elements.chatScreen) {
        elements.chatScreen.style.display = "flex";
        elements.chatScreen.style.opacity = '0';
        elements.chatScreen.style.transform = 'scale(1.05)';
        
        // Animate in the chat screen
        requestAnimationFrame(() => {
          elements.chatScreen.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          elements.chatScreen.style.opacity = '1';
          elements.chatScreen.style.transform = 'scale(1)';
        });
      }
    }, 200);
  }
  
  // Update user info in header with animation
  if (elements.userName) {
    elements.userName.style.opacity = '0';
    elements.userName.textContent = sanitizeInput(user.name);
    setTimeout(() => {
      elements.userName.style.transition = 'opacity 0.3s ease';
      elements.userName.style.opacity = '1';
    }, 100);
  }
  
  if (elements.userInitials) {
    elements.userInitials.style.transform = 'scale(0)';
    elements.userInitials.textContent = sanitizeInput(user.name.charAt(0).toUpperCase());
    setTimeout(() => {
      elements.userInitials.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      elements.userInitials.style.transform = 'scale(1)';
    }, 200);
  }
  
  // Update profile dropdown information
  updateProfileDropdown(user);
  
  // Reset chat area to welcome state
  resetChatArea();
  
  // Initialize send button state
  updateSendButtonState();
  
  // Focus input on desktop with delay for animation
  if (window.innerWidth > 768 && elements.messageInput) {
    setTimeout(() => elements.messageInput.focus(), 600);
  }
}

function resetChatArea() {
  if (!elements.chatMessages) return;
  
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
    <div class="typing-indicator" id="typingIndicator" style="display: none;">
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
  
  // Close profile dropdown first
  const dropdown = document.getElementById('profileDropdown');
  const userMenu = document.querySelector('.user-menu');
  if (dropdown) dropdown.classList.remove('active');
  if (userMenu) userMenu.classList.remove('active');
  
  authToken = null;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem("authToken");
  }
  currentUser = null;
  currentChatId = null;
  
  // Reset UI state
  resetChatArea();
  if (elements.chatHistory) elements.chatHistory.innerHTML = "";
  
  showAuthScreen();
  showNotification("You have been logged out.", "info");
}

// Sidebar functions
function toggleSidebar() {
  console.log("Toggling sidebar...");
  if (elements.sidebar) {
    const isActive = elements.sidebar.classList.contains("active");
    const toggleBtn = document.querySelector('.sidebar-toggle');
    
    // Add visual feedback to toggle button
    if (toggleBtn) {
      toggleBtn.style.transform = 'scale(0.9) rotate(180deg)';
      setTimeout(() => {
        toggleBtn.style.transform = isActive ? 'scale(1) rotate(0deg)' : 'scale(1) rotate(180deg)';
      }, 100);
    }
    
    if (isActive) {
      elements.sidebar.classList.remove("active");
      // Remove overlay
      const overlay = document.getElementById('sidebarOverlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
      }
    } else {
      elements.sidebar.classList.add("active");
      
      // Show overlay on mobile
      if (window.innerWidth <= 768) {
        document.body.style.overflow = 'hidden';
        const overlay = document.getElementById('sidebarOverlay');
        if (overlay) {
          overlay.style.opacity = '1';
          overlay.style.visibility = 'visible';
        }
      }
    }
    
    // Log current state for debugging
    console.log(`Sidebar is now ${!isActive ? 'open' : 'closed'}`);
  }
}

// Close sidebar and restore body scroll
function closeSidebar() {
  if (elements.sidebar) {
    elements.sidebar.classList.remove("active");
    document.body.style.overflow = '';
  }
}

// Chat history functions
async function loadChatHistory() {
  if (!authToken || !currentUser) {
    console.log("No auth token or user, skipping chat history load");
    return;
  }

  try {
    console.log("Loading chat history...");
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
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
  if (!elements.chatHistory) return;
  
  // Fade out existing content
  elements.chatHistory.style.opacity = '0';
  elements.chatHistory.style.transform = 'translateY(20px)';
  
  setTimeout(() => {
    elements.chatHistory.innerHTML = "";
    
    if (chats.length === 0) {
      elements.chatHistory.innerHTML = `
        <div class="chat-history-empty stagger-animation">
          <p>No chat history yet. Start a conversation!</p>
        </div>
      `;
    } else {
      chats.forEach((chat, index) => {
        const chatItem = document.createElement("div");
        chatItem.className = `chat-history-item ${chat._id === currentChatId ? "active" : ""}`;
        chatItem.setAttribute("tabindex", "0");
        chatItem.style.animationDelay = `${index * 0.05}s`;
        
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
        
        // Click handlers with haptic feedback on mobile
        chatItem.onclick = (e) => {
          if (!e.target.closest(".delete-chat-btn")) {
            // Add visual feedback
            chatItem.style.transform = 'scale(0.98)';
            setTimeout(() => {
              chatItem.style.transform = '';
              loadChat(chat._id);
            }, 100);
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
          // Add visual feedback
          deleteBtn.style.transform = 'scale(1.2) rotate(5deg)';
          setTimeout(() => {
            deleteBtn.style.transform = '';
            deleteChat(chat._id);
          }, 150);
        };
        
        elements.chatHistory.appendChild(chatItem);
      });
    }
    
    // Fade in new content
    requestAnimationFrame(() => {
      elements.chatHistory.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      elements.chatHistory.style.opacity = '1';
      elements.chatHistory.style.transform = 'translateY(0)';
    });
  }, 100);
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
  if (!authToken) return;
  
  try {
    console.log(`Loading chat: ${chatId}`);
    const response = await fetch(`${API_BASE}/chat/${chatId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${authToken}`,
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
    if (elements.chatMessages) {
      elements.chatMessages.innerHTML = "";
    }
    
    // Render messages
    chat.messages.forEach((message) => {
      appendMessage(message.sender, message.content, false);
    });
    
    scrollToBottom();
    closeSidebar(); // Use the new function to properly close sidebar
    
    // Update active state in sidebar
    document.querySelectorAll('.chat-history-item').forEach(item => {
      const deleteBtn = item.querySelector('.delete-chat-btn');
      if (deleteBtn) {
        item.classList.toggle('active', deleteBtn.dataset.chatId === chatId);
      }
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

  if (!authToken) return;
  
  try {
    console.log(`Deleting chat: ${chatId}`);
    const response = await fetch(`${API_BASE}/chat/${chatId}`, {
      method: "DELETE",
      headers: { 
        'Authorization': `Bearer ${authToken}`,
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
  if (!elements.chatMessages) return;
  
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  
  const avatar = sender === "user" 
    ? sanitizeInput(currentUser ? currentUser.name.charAt(0).toUpperCase() : "U")
    : '<i class="fas fa-robot" aria-label="FinanceAI assistant"></i>';
  
  messageDiv.innerHTML = `
    <div class="message-content">
      <div class="message-avatar">${avatar}</div>
      <div class="message-bubble">${formatMessage(message)}</div>
    </div>
  `;
  
  if (animate) {
    // More sophisticated animation based on sender
    if (sender === 'user') {
      messageDiv.style.opacity = '0';
      messageDiv.style.transform = 'translateX(50px) scale(0.9)';
    } else {
      messageDiv.style.opacity = '0';
      messageDiv.style.transform = 'translateX(-50px) scale(0.9) rotateX(15deg)';
    }
  }
  
  elements.chatMessages.appendChild(messageDiv);
  
  if (animate) {
    // Trigger animation with physics-based easing
    requestAnimationFrame(() => {
      messageDiv.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
      messageDiv.style.opacity = '1';
      messageDiv.style.transform = 'translateX(0) scale(1) rotateX(0deg)';
    });
  }
  
  scrollToBottom();
}

function formatMessage(message) {
  if (!message) return '';
  // Basic formatting - convert newlines to <br> and preserve spacing
  return sanitizeInput(message)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
    .replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic text
}

// This function is now defined above in the resize handler section

async function sendMessage() {
  if (!elements.messageInput || !authToken) return;
  
  const message = elements.messageInput.value.trim();
  if (!message) return;

  // Remove welcome elements with animation if present
  if (elements.chatMessages) {
    const welcomeCard = elements.chatMessages.querySelector(".welcome-card");
    const quickActions = elements.chatMessages.querySelector(".quick-actions");
    
    if (welcomeCard) {
      welcomeCard.style.transition = 'all 0.4s ease-out';
      welcomeCard.style.opacity = '0';
      welcomeCard.style.transform = 'translateY(-20px) scale(0.95)';
      setTimeout(() => welcomeCard.remove(), 400);
    }
    
    if (quickActions) {
      quickActions.style.transition = 'all 0.4s ease-out';
      quickActions.style.opacity = '0';
      quickActions.style.transform = 'translateY(-20px) scale(0.95)';
      setTimeout(() => quickActions.remove(), 400);
    }
  }

  // Add user message with enhanced animation
  appendMessage("user", message);
  
  // Animate input clearing
  elements.messageInput.style.transition = 'all 0.2s ease-out';
  elements.messageInput.style.transform = 'scale(0.98)';
  
  setTimeout(() => {
    elements.messageInput.value = "";
    elements.messageInput.style.height = "auto";
    elements.messageInput.style.transform = 'scale(1)';
    updateSendButtonState();
  }, 100);
  
  // Animate send button to loading state
  if (elements.sendBtn) {
    elements.sendBtn.disabled = true;
    elements.sendBtn.style.transform = 'scale(0.9)';
    setTimeout(() => {
      elements.sendBtn.style.transform = 'scale(1)';
    }, 100);
  }
  
  // Show typing indicator with animation
  if (elements.typingIndicator) {
    elements.typingIndicator.style.display = "flex";
    elements.typingIndicator.style.opacity = '0';
    elements.typingIndicator.style.transform = 'translateY(20px) scale(0.9)';
    
    requestAnimationFrame(() => {
      elements.typingIndicator.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
      elements.typingIndicator.style.opacity = '1';
      elements.typingIndicator.style.transform = 'translateY(0) scale(1)';
    });
  }

  try {
    // Generate title for new chats
    const title = currentChatId ? "" : (message.substring(0, 50) + (message.length > 50 ? "..." : ""));
    
    console.log("Sending message...", { chatId: currentChatId, hasTitle: !!title });
    
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authToken}`,
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

    // Add AI response (get the last message that's from assistant)
    const aiResponses = chat.messages.filter(msg => msg.sender === "assistant");
    const lastAiResponse = aiResponses[aiResponses.length - 1];
    
    if (lastAiResponse) {
      setTimeout(() => {
        appendMessage("bot", lastAiResponse.content);
      }, 800); // Slightly longer delay for better UX
    }
    
    // Reload chat history to update sidebar
    loadChatHistory();
    
  } catch (error) {
    console.error("Failed to send message:", error);
    appendMessage("bot", "Sorry, I'm having trouble processing your request right now. Please try again in a moment.");
    showNotification("Failed to send message", "error");
  } finally {
    // Hide typing indicator with animation
    if (elements.typingIndicator) {
      elements.typingIndicator.style.transition = 'all 0.3s ease-out';
      elements.typingIndicator.style.opacity = '0';
      elements.typingIndicator.style.transform = 'translateY(20px) scale(0.9)';
      
      setTimeout(() => {
        elements.typingIndicator.style.display = "none";
      }, 300);
    }
    
    // Re-enable send button with animation
    if (elements.sendBtn) {
      elements.sendBtn.style.transition = 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
      elements.sendBtn.disabled = false;
      elements.sendBtn.style.transform = 'scale(1.05)';
      
      setTimeout(() => {
        elements.sendBtn.style.transform = 'scale(1)';
      }, 200);
    }
  }
}

function sendQuickMessage(message) {
  if (elements.messageInput) {
    elements.messageInput.value = message;
    sendMessage();
  }
}

function startNewChat() {
  console.log("Starting new chat...");
  currentChatId = null;
  resetChatArea();
  
  // Remove active state from all chat items
  document.querySelectorAll('.chat-history-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Close sidebar properly
  closeSidebar();
  
  // Focus input on desktop
  if (window.innerWidth > 768 && elements.messageInput) {
    setTimeout(() => elements.messageInput.focus(), 100);
  }
  
  showNotification("New chat started", "success");
}

// Handle window resize for responsive behavior
const handleWindowResize = debounce(function() {
  // Close sidebar on resize to larger screen
  if (window.innerWidth > 768 && elements.sidebar) {
    elements.sidebar.classList.remove('active');
    document.body.style.overflow = '';
    
    // Hide overlay
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.visibility = 'hidden';
    }
    
    // Reset toggle button
    const toggleBtn = document.querySelector('.sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.style.transform = 'scale(1) rotate(0deg)';
    }
  }
}, 150);

window.addEventListener('resize', handleWindowResize);

// Add smooth scrolling to messages
function scrollToBottom() {
  if (elements.chatMessages && elements.chatMessages.scrollTo) {
    elements.chatMessages.scrollTo({
      top: elements.chatMessages.scrollHeight,
      behavior: 'smooth'
    });
  } else if (elements.chatMessages) {
    // Fallback for older browsers
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }
}

// Enhanced focus management for better UX
function enhanceFocusManagement() {
  // Add focus rings for keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      document.body.classList.add('keyboard-navigation');
    }
  });
  
  document.addEventListener('mousedown', function() {
    document.body.classList.remove('keyboard-navigation');
  });
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.body.classList.add('dark-mode');
    document.body.classList.remove('light-mode');
  } else {
    document.body.classList.add('light-mode');
    document.body.classList.remove('dark-mode');
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      if (e.matches) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
      } else {
        document.body.classList.add('light-mode');
        document.body.classList.remove('dark-mode');
      }
    }
  });
}

function toggleTheme() {
  const isDarkMode = document.body.classList.contains('dark-mode');
  const toggleBtn = document.querySelector('.profile-menu-item[onclick="toggleTheme()"] i');
  if (isDarkMode) {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
    localStorage.setItem(THEME_KEY, 'light');
    if (toggleBtn) toggleBtn.className = 'fas fa-moon';
    showNotification('Light mode enabled', 'success');
  } else {
    document.body.classList.remove('light-mode');
    document.body.classList.add('dark-mode');
    localStorage.setItem(THEME_KEY, 'dark');
    if (toggleBtn) toggleBtn.className = 'fas fa-sun';
    showNotification('Dark mode enabled', 'success');
  }
  toggleProfileDropdown();
}
// Initialize enhanced features
document.addEventListener('DOMContentLoaded', function() {
  enhanceFocusManagement();
  
  // Add intersection observer for element animations
  if ('IntersectionObserver' in window) {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '50px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in');
        }
      });
    }, observerOptions);
    
    // Observe elements for animation with error handling
    setTimeout(() => {
      try {
        document.querySelectorAll('.message, .quick-action, .chat-history-item').forEach(el => {
          if (el && observer) {
            observer.observe(el);
          }
        });
      } catch (error) {
        console.warn('Failed to observe elements for animation:', error);
      }
    }, 1000);
  }
});

// Enhanced mobile optimizations
function initializeMobileOptimizations() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  if (isMobile) {
    // Prevent zoom on input focus
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    }
    
    // Add mobile-specific class for CSS targeting
    document.body.classList.add('mobile-device');
    
    // Improve scroll performance
    document.body.style.webkitOverflowScrolling = 'touch';
    
    // Add touch feedback for buttons
    addTouchFeedback();
    
    // Handle keyboard appearance on mobile
    handleMobileKeyboard();
  }
}

function addTouchFeedback() {
  const interactiveElements = document.querySelectorAll(
    '.send-btn, .auth-btn, .quick-action, .chat-history-item, .new-chat-btn, .logout-btn, .sidebar-toggle'
  );
  
  interactiveElements.forEach(element => {
    element.addEventListener('touchstart', function() {
      this.style.transform = 'scale(0.98)';
      this.style.transition = 'transform 0.1s ease';
    }, { passive: true });
    
    element.addEventListener('touchend', function() {
      setTimeout(() => {
        this.style.transform = '';
        this.style.transition = '';
      }, 100);
    }, { passive: true });
  });
}

function handleMobileKeyboard() {
  const inputElements = [elements.messageInput].filter(Boolean);
  const authInputs = [
    document.getElementById('loginEmail'),
    document.getElementById('loginPassword'),
    document.getElementById('signupName'),
    document.getElementById('signupEmail'),
    document.getElementById('signupPassword')
  ].filter(Boolean);
  
  const allInputs = [...inputElements, ...authInputs];
  
  allInputs.forEach(input => {
    if (input) {
      input.addEventListener('focus', () => {
        // Add keyboard-open class immediately on focus
        setTimeout(() => {
          document.body.classList.add('keyboard-open');
          
          // Enhanced scroll behavior for mobile
          if (input.scrollIntoView) {
            // For chat input, ensure it's visible above the keyboard
            if (input === elements.messageInput) {
              const container = document.querySelector('.chat-input-container');
              if (container) {
                container.classList.add('keyboard-open');
                // Scroll to ensure input is visible
                setTimeout(() => {
                  input.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'end',
                    inline: 'nearest'
                  });
                }, 100);
              }
            } else {
              // For auth inputs, scroll to center
              input.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
              });
            }
          }
        }, 100);
      });
      
      input.addEventListener('blur', () => {
        // Remove keyboard-open class when input loses focus
        setTimeout(() => {
          // Check if any input still has focus
          const activeElement = document.activeElement;
          const isInputFocused = allInputs.some(inp => inp === activeElement);
          
          if (!isInputFocused) {
            document.body.classList.remove('keyboard-open');
            const container = document.querySelector('.chat-input-container');
            if (container) {
              container.classList.remove('keyboard-open');
            }
          }
        }, 100);
      });
    }
  });
  
  // Enhanced viewport height monitoring
  let initialViewportHeight = window.innerHeight;
  let keyboardDetectionTimeout;
  
  const handleResize = () => {
    clearTimeout(keyboardDetectionTimeout);
    
    keyboardDetectionTimeout = setTimeout(() => {
      const currentHeight = window.innerHeight;
      const heightDifference = initialViewportHeight - currentHeight;
      
      // More intelligent keyboard detection
      if (heightDifference > 150) {
        document.body.classList.add('keyboard-open');
        const container = document.querySelector('.chat-input-container');
        if (container && document.activeElement === elements.messageInput) {
          container.classList.add('keyboard-open');
        }
      } else if (heightDifference < 50) {
        document.body.classList.remove('keyboard-open');
        const container = document.querySelector('.chat-input-container');
        if (container) {
          container.classList.remove('keyboard-open');
        }
      }
    }, 100);
  };
  
  window.addEventListener('resize', handleResize);
  
  // Additional iOS-specific handling
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    // Visual viewport API support for better iOS handling
    if (window.visualViewport) {
      const handleViewportChange = () => {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const heightDifference = windowHeight - viewportHeight;
        
        if (heightDifference > 100) {
          document.body.classList.add('keyboard-open');
          const container = document.querySelector('.chat-input-container');
          if (container && document.activeElement === elements.messageInput) {
            container.classList.add('keyboard-open');
          }
        } else {
          document.body.classList.remove('keyboard-open');
          const container = document.querySelector('.chat-input-container');
          if (container) {
            container.classList.remove('keyboard-open');
          }
        }
      };
      
      window.visualViewport.addEventListener('resize', handleViewportChange);
    }
  }
}

// Initialize mobile optimizations
document.addEventListener('DOMContentLoaded', () => {
  try {
    initializeMobileOptimizations();
  } catch (error) {
    console.warn('Failed to initialize mobile optimizations:', error);
  }
});


// Performance optimizations
function initializePerformanceOptimizations() {
  // Use requestIdleCallback for non-critical operations
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      // Preload animations
      const style = document.createElement('style');
      style.textContent = '.preload-animations * { transition: none !important; animation: none !important; }';
      document.head.appendChild(style);
      
      // Remove preload class after DOM is ready
      setTimeout(() => {
        document.body.classList.remove('preload-animations');
        if (style.parentNode) {
          style.parentNode.removeChild(style);
        }
      }, 100);
    });
  }
  
  // Optimize images and assets loading
  if ('loading' in HTMLImageElement.prototype) {
    const images = document.querySelectorAll('img[data-src]');
    images.forEach(img => {
      img.src = img.dataset.src;
    });
  }
}

// Progressive enhancement for modern features
function initializeProgressiveEnhancements() {
  // Service Worker registration (if available)
  if ('serviceWorker' in navigator) {
    // Could register SW here for offline functionality
  }
  
  // Web App Manifest support
  if ('share' in navigator) {
    // Could add native sharing functionality
  }
  
  // Improved error handling with user feedback
  window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
    showNotification('Something went wrong. Please refresh the page.', 'error');
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showNotification('Connection issue detected. Please check your internet.', 'warning');
  });
}

// Initialize all enhancements
document.addEventListener('DOMContentLoaded', () => {
  try {
    initializePerformanceOptimizations();
    initializeProgressiveEnhancements();
  } catch (error) {
    console.warn('Failed to initialize enhancements:', error);
  }
});

// Profile dropdown functionality
function toggleProfileDropdown() {
  const dropdown = document.getElementById('profileDropdown');
  const userMenu = document.querySelector('.user-menu');
  const chevron = document.getElementById('profileChevron');
  
  if (!dropdown) return;
  
  const isActive = dropdown.classList.contains('active');
  
  if (isActive) {
    dropdown.classList.remove('active');
    userMenu?.classList.remove('active');
  } else {
    dropdown.classList.add('active');
    userMenu?.classList.add('active');
  }
}

// Close profile dropdown when clicking outside
document.addEventListener('click', function(e) {
  const dropdown = document.getElementById('profileDropdown');
  const userMenu = document.querySelector('.user-menu');
  
  if (dropdown && !userMenu?.contains(e.target)) {
    dropdown.classList.remove('active');
    userMenu?.classList.remove('active');
  }
});

// Account settings and preferences (placeholder functions)
function showAccountSettings() {
  toggleProfileDropdown();
  showNotification('Account settings coming soon!', 'info');
}

function showPreferences() {
  toggleProfileDropdown();
  showNotification('Preferences coming soon!', 'info');
}

// Update profile information in dropdown
function updateProfileDropdown(user) {
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  const profileAvatar = document.getElementById('profileAvatar');
  
  if (profileName) profileName.textContent = sanitizeInput(user.name);
  if (profileEmail) profileEmail.textContent = sanitizeInput(user.email || 'user@example.com');
  if (profileAvatar) profileAvatar.textContent = sanitizeInput(user.name.charAt(0).toUpperCase());
}

// Make functions globally available for onclick handlers
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
window.logout = logout;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;
window.sendQuickMessage = sendQuickMessage;
window.startNewChat = startNewChat;
window.closeSidebar = closeSidebar;
window.toggleProfileDropdown = toggleProfileDropdown;
window.showAccountSettings = showAccountSettings;
window.showPreferences = showPreferences;
