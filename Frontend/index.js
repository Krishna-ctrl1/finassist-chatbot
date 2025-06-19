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
  wavesBtn: document.getElementById("wavesBtn"),
  voiceBtn: document.getElementById("voiceBtn"),
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
  return function (...args) {
    const self = this;
    clearTimeout(timeout);
    timeout = setTimeout(function () {
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

  // File upload event listeners
  document.addEventListener('change', function (e) {
    if (e.target && e.target.classList.contains('file-upload-input')) {
      handleFileSelection(e.target);
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.classList.contains('create-ticket-btn')) {
      e.preventDefault();
      handleTicketCreation(e.target);
    } else if (e.target && e.target.classList.contains('skip-upload-btn')) {
      e.preventDefault();
      skipFileUpload();
    }
  });

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
    overlay.addEventListener("click", function () {
      if (elements.sidebar) {
        elements.sidebar.classList.remove("active");
      }
    });
  }

  // Send button click handler
  if (elements.sendBtn) {
    elements.sendBtn.addEventListener("click", sendMessage);
  }

  // Waves button click handler
  if (elements.wavesBtn) {
    elements.wavesBtn.addEventListener("click", toggleVoiceOutput);
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

        // Initialize sidebar state and header visibility
        initializeSidebarState();

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

// Initialize sidebar state and header visibility based on screen size
function initializeSidebarState() {
  const chatScreen = document.getElementById('chatScreen');
  if (!chatScreen || !elements.sidebar) return;

  if (window.innerWidth <= 768) {
    // Mobile: sidebar is closed by default, show header elements
    elements.sidebar.classList.remove('active');
    chatScreen.classList.add('sidebar-collapsed');
  } else {
    // Desktop: sidebar is open by default, hide header elements
    elements.sidebar.classList.remove('collapsed');
    chatScreen.classList.remove('sidebar-collapsed');
  }
}

// Sidebar functions
function toggleSidebar(event) {
  console.log("Toggling sidebar...");
  if (!elements.sidebar) {
    console.error('Sidebar element not found');
    return;
  }

  const isCurrentlyOpen = elements.sidebar.classList.contains("active") || window.innerWidth > 768;
  const overlay = document.getElementById('sidebarOverlay');
  const toggleBtn = document.querySelector('.sidebar-toggle');
  const collapseBtn = document.querySelector('.sidebar-collapse-btn');
  const chatScreen = document.getElementById('chatScreen');

  // Add visual feedback to button that was clicked
  const clickedBtn = event?.target.closest('button');
  if (clickedBtn) {
    clickedBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
      clickedBtn.style.transform = 'scale(1)';
    }, 100);
  }

  if (window.innerWidth <= 768) {
    // Mobile behavior - toggle sidebar visibility
    if (isCurrentlyOpen) {
      // Close sidebar
      elements.sidebar.classList.remove("active");
      document.body.style.overflow = '';
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
      }
      // Show header elements when sidebar is closed
      if (chatScreen) chatScreen.classList.add('sidebar-collapsed');
      console.log('Sidebar closed on mobile');
    } else {
      // Open sidebar
      elements.sidebar.classList.add("active");
      document.body.style.overflow = 'hidden';
      if (overlay) {
        overlay.style.opacity = '1';
        overlay.style.visibility = 'visible';
      }
      // Hide header elements when sidebar is open
      if (chatScreen) chatScreen.classList.remove('sidebar-collapsed');
      console.log('Sidebar opened on mobile');
    }
  } else {
    // Desktop behavior - toggle collapsed state
    const isCollapsed = elements.sidebar.classList.contains("collapsed");

    if (isCollapsed) {
      // Expand sidebar
      elements.sidebar.classList.remove("collapsed");
      elements.sidebar.style.width = '260px';
      elements.sidebar.style.transform = 'translateX(0)';
      // Hide header elements when sidebar is expanded
      if (chatScreen) chatScreen.classList.remove('sidebar-collapsed');
      console.log('Sidebar expanded on desktop');
    } else {
      // Collapse sidebar
      elements.sidebar.classList.add("collapsed");
      elements.sidebar.style.width = '0';
      elements.sidebar.style.transform = 'translateX(-100%)';
      // Show header elements when sidebar is collapsed
      if (chatScreen) chatScreen.classList.add('sidebar-collapsed');
      console.log('Sidebar collapsed on desktop');
    }
  }
}

// Close sidebar and restore body scroll
function closeSidebar() {
  if (!elements.sidebar) return;
  
  const overlay = document.getElementById('sidebarOverlay');
  const chatScreen = document.getElementById('chatScreen');
  
  // Remove active class from sidebar
  elements.sidebar.classList.remove("active");
  
  // Restore body scroll
  document.body.style.overflow = '';
  
  // Hide overlay
  if (overlay) {
    overlay.classList.remove('active');
    overlay.style.opacity = '0';
    overlay.style.visibility = 'hidden';
  }
  
  // Update chat screen state for mobile
  if (window.innerWidth <= 768 && chatScreen) {
    chatScreen.classList.add('sidebar-collapsed');
  }
  
  // Force remove any lingering overlay classes
  if (overlay) {
    overlay.classList.remove('active');
    // Force immediate style update
    overlay.style.setProperty('opacity', '0', 'important');
    overlay.style.setProperty('visibility', 'hidden', 'important');
    overlay.style.setProperty('pointer-events', 'none', 'important');
  }
  
  // Ensure body scroll is restored
  document.body.style.removeProperty('overflow');
  document.body.classList.remove('sidebar-open');
  
  console.log('Sidebar closed properly');
}

// Chat history functions
let allChats = []; // Store all chats for search functionality

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

    allChats = chats; // Store for search functionality
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
        const chatItem = createChatHistoryItem(chat, index);
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

    // Show loading indicator for large chats
    if (chat.messages.length > 50) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'loading-messages';
      loadingDiv.innerHTML = '<div class="loading-spinner"></div><p>Loading messages...</p>';
      elements.chatMessages.appendChild(loadingDiv);
    }

    // Render messages with performance optimization
    await renderMessagesOptimized(chat.messages);

    scrollToBottom(false); // No smooth scroll for initial load
    closeSidebar(); // Use the new function to properly close sidebar

    // Update active state in sidebar
    document.querySelectorAll('.chat-history-item').forEach(item => {
      const itemChatId = item.getAttribute('data-chat-id');
      if (itemChatId === chatId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
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

function appendMessage(sender, message, animate = true, skipScroll = false) {
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

  // Only scroll if not skipped (for batch loading)
  if (!skipScroll) {
    scrollToBottom();
  }

  // Check for file upload trigger only for new bot messages
  if (sender === 'bot' && animate) {
    checkForFileUploadTrigger(message);
  }

  return messageDiv;
}

function formatMessage(message) {
  if (!message) return '';
  // Basic formatting - convert newlines to <br> and preserve spacing
  return sanitizeInput(message)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
    .replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic text
}

// Global variables for request management
let isSendingMessage = false;
let lastMessageContent = null;
let lastMessageTime = 0;

async function sendMessage() {
  if (!elements.messageInput || !authToken) return;

  const message = elements.messageInput.value.trim();
  if (!message) return;

  // Prevent duplicate requests
  const currentTime = Date.now();
  if (isSendingMessage) {
    console.log("Already sending a message, ignoring duplicate request");
    return;
  }

  // Prevent rapid duplicate messages (within 1 second)
  if (message === lastMessageContent && (currentTime - lastMessageTime) < 1000) {
    console.log("Duplicate message detected within 1 second, ignoring");
    return;
  }

  // Set sending state
  isSendingMessage = true;
  lastMessageContent = message;
  lastMessageTime = currentTime;

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
      if (response.status === 429) {
        const errorData = await response.json();
        if (errorData.isDuplicate) {
          console.log('Backend detected duplicate request, ignoring silently');
          return; // Exit silently without showing error to user
        }
      }
      throw new Error(`Failed to send message: ${response.status}`);
    }

    const chat = await response.json();
    console.log("Message sent successfully");

    // Update current chat ID
    currentChatId = chat._id;

    // Add AI response (get the last message that's from assistant or bot)
    const aiResponses = chat.messages.filter(msg => msg.sender === "assistant" || msg.sender === "bot");
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
    // Reset sending state
    isSendingMessage = false;

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
const handleWindowResize = debounce(function () {
  const chatScreen = document.getElementById('chatScreen');
  
  if (window.innerWidth > 768 && elements.sidebar) {
    // Desktop behavior
    elements.sidebar.classList.remove('active');
    elements.sidebar.classList.remove('collapsed');
    document.body.style.overflow = '';
    
    // Hide header elements when sidebar is visible on desktop
    if (chatScreen) chatScreen.classList.remove('sidebar-collapsed');

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
  } else if (window.innerWidth <= 768 && elements.sidebar) {
    // Mobile behavior - sidebar closed by default, show header elements
    elements.sidebar.classList.remove('active');
    elements.sidebar.classList.remove('collapsed');
    if (chatScreen) chatScreen.classList.add('sidebar-collapsed');
  }
}, 150);

window.addEventListener('resize', handleWindowResize);

// Add smooth scrolling to messages
function scrollToBottom(smooth = true) {
  if (!elements.chatMessages) return;
  
  // Use smooth scrolling only when appropriate (not for initial loads or mobile)
  const shouldUseSmooth = smooth && !isMobileDevice() && elements.chatMessages.children.length < 100;
  
  if (elements.chatMessages.scrollTo && shouldUseSmooth) {
    elements.chatMessages.scrollTo({
      top: elements.chatMessages.scrollHeight,
      behavior: 'smooth'
    });
  } else {
    // Direct scroll for better performance
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }
}

// Helper function to detect mobile devices
function isMobileDevice() {
  return /iPhone|iPad|iPod|Android|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
         window.innerWidth <= 768;
}

// Optimized message rendering for better performance with large chat histories
async function renderMessagesOptimized(messages) {
  if (!elements.chatMessages || !messages.length) return;

  // Remove loading indicator if present
  const loadingDiv = elements.chatMessages.querySelector('.loading-messages');
  if (loadingDiv) {
    loadingDiv.remove();
  }

  const isLargeChat = messages.length > 50;
  const isMobile = isMobileDevice();
  
  if (isLargeChat && isMobile) {
    // For large chats on mobile, render in chunks to prevent UI blocking
    await renderMessagesInChunks(messages);
  } else {
    // For smaller chats or desktop, render normally but without animations
    messages.forEach(message => {
      appendMessage(message.sender, message.content, false, true); // no animation, skip scroll
    });
  }
}

// Render messages in chunks to prevent UI blocking on mobile
async function renderMessagesInChunks(messages) {
  const chunkSize = 10; // Render 10 messages at a time
  const chunks = [];
  
  // Split messages into chunks
  for (let i = 0; i < messages.length; i += chunkSize) {
    chunks.push(messages.slice(i, i + chunkSize));
  }
  
  // Render each chunk with a small delay
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Render chunk
    chunk.forEach(message => {
      appendMessage(message.sender, message.content, false, true); // no animation, skip scroll
    });
    
    // Show progress for large chats
    if (chunks.length > 5) {
      const progress = Math.round(((i + 1) / chunks.length) * 100);
      console.log(`Rendering messages: ${progress}%`);
    }
    
    // Small delay to prevent UI blocking, except for the last chunk
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

// Enhanced focus management for better UX
function enhanceFocusManagement() {
  // Add focus rings for keyboard navigation
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') {
      document.body.classList.add('keyboard-navigation');
    }
  });

  document.addEventListener('mousedown', function () {
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
document.addEventListener('DOMContentLoaded', function () {
  enhanceFocusManagement();

  // Add intersection observer for element animations
  if ('IntersectionObserver' in window) {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '50px'
    };

    const observer = new IntersectionObserver(function (entries) {
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
    element.addEventListener('touchstart', function () {
      this.style.transform = 'scale(0.98)';
      this.style.transition = 'transform 0.1s ease';
    }, { passive: true });

    element.addEventListener('touchend', function () {
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
document.addEventListener('click', function (e) {
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
window.clearSearch = clearSearch;
window.searchChats = searchChats;

// Search functionality
let searchTimeout;

function searchChats() {
  const searchInput = document.getElementById('chatSearch');
  const searchClear = document.getElementById('searchClear');

  if (!searchInput) return;

  const query = searchInput.value.trim().toLowerCase();

  // Show/hide clear button
  if (searchClear) {
    searchClear.style.display = query ? 'flex' : 'none';
  }

  // Clear previous timeout
  clearTimeout(searchTimeout);

  // Debounce search
  searchTimeout = setTimeout(() => {
    if (!query) {
      // Show all chats when search is empty
      renderChatHistory(allChats);
      return;
    }

    // Filter chats based on search query
    const filteredChats = allChats.filter(chat => {
      const title = chat.title || '';
      const firstUserMessage = chat.messages.find(msg => msg.sender === 'user');
      const preview = firstUserMessage ? firstUserMessage.content : '';

      return (
        title.toLowerCase().includes(query) ||
        preview.toLowerCase().includes(query)
      );
    });

    renderChatHistory(filteredChats);
  }, 300);
}

function clearSearch() {
  const searchInput = document.getElementById('chatSearch');
  const searchClear = document.getElementById('searchClear');

  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }

  if (searchClear) {
    searchClear.style.display = 'none';
  }

  // Show all chats
  renderChatHistory(allChats);
}

// Initialize search functionality
function initializeSearch() {
  const searchInput = document.getElementById('chatSearch');
  if (searchInput) {
    searchInput.addEventListener('input', searchChats);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        clearSearch();
      }
    });
  }
}

// Enhanced chat history item with menu functionality
function createChatHistoryItem(chat, index) {
  const chatItem = document.createElement("div");
  chatItem.className = `chat-history-item ${chat._id === currentChatId ? "active" : ""}`;
  chatItem.setAttribute("tabindex", "0");
  chatItem.setAttribute("data-chat-id", chat._id);
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
    <div class="chat-menu">
      <button class="chat-menu-btn" onclick="toggleChatMenu('${chat._id}', event)" aria-label="Chat options">
        <i class="fas fa-ellipsis-h"></i>
      </button>
      <div class="chat-menu-dropdown" id="chatMenu-${chat._id}">
        <button class="chat-menu-item" onclick="shareChat('${chat._id}')">
          <i class="fas fa-share"></i>
          <span>Share</span>
        </button>
        <button class="chat-menu-item" onclick="renameChat('${chat._id}')">
          <i class="fas fa-edit"></i>
          <span>Rename</span>
        </button>
        <button class="chat-menu-item" onclick="archiveChat('${chat._id}')">
          <i class="fas fa-archive"></i>
          <span>Archive</span>
        </button>
        <hr class="chat-menu-divider">
        <button class="chat-menu-item delete-item" onclick="deleteChat('${chat._id}')">
          <i class="fas fa-trash-alt"></i>
          <span>Delete</span>
        </button>
      </div>
    </div>
  `;

  // Click handlers
  chatItem.onclick = (e) => {
    if (!e.target.closest(".chat-menu")) {
      // Add visual feedback
      chatItem.style.transform = 'scale(0.98)';
      setTimeout(() => {
        chatItem.style.transform = '';
        loadChat(chat._id);
      }, 100);
    }
  };

  chatItem.onkeydown = (e) => {
    if (e.key === "Enter" && !e.target.closest(".chat-menu")) {
      loadChat(chat._id);
    }
  };

  return chatItem;
}

// Chat menu functions
function toggleChatMenu(chatId, event) {
  event.stopPropagation();

  const menu = document.getElementById(`chatMenu-${chatId}`);
  if (!menu) return;

  // Close all other menus
  document.querySelectorAll('.chat-menu-dropdown.active').forEach(dropdown => {
    if (dropdown !== menu) {
      dropdown.classList.remove('active');
    }
  });

  menu.classList.toggle('active');
}

// Close chat menus when clicking outside
document.addEventListener('click', function (e) {
  if (!e.target.closest('.chat-menu')) {
    document.querySelectorAll('.chat-menu-dropdown.active').forEach(dropdown => {
      dropdown.classList.remove('active');
    });
  }
});

function shareChat(chatId) {
  // Close menu
  const menu = document.getElementById(`chatMenu-${chatId}`);
  if (menu) menu.classList.remove('active');

  showNotification('Share functionality coming soon!', 'info');
}

async function renameChat(chatId) {
  // Close menu
  const menu = document.getElementById(`chatMenu-${chatId}`);
  if (menu) menu.classList.remove('active');

  const chat = allChats.find(c => c._id === chatId);
  if (!chat) return;

  const currentTitle = chat.title || chat.messages.find(msg => msg.sender === 'user')?.content || 'New chat';
  const newTitle = prompt('Enter new chat title:', currentTitle);

  if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
    try {
      console.log(`Renaming chat ${chatId} to: ${newTitle.trim()}`);

      const response = await fetch(`${API_BASE}/chat/${chatId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ title: newTitle.trim() })
      });

      if (!response.ok) {
        throw new Error(`Failed to rename chat: ${response.status}`);
      }

      const result = await response.json();
      console.log('Chat renamed successfully:', result);

      // Update local data
      chat.title = newTitle.trim();

      // Reload chat history to reflect changes
      await loadChatHistory();

      showNotification('Chat renamed successfully!', 'success');
    } catch (error) {
      console.error('Failed to rename chat:', error);
      showNotification('Failed to rename chat. Please try again.', 'error');
    }
  }
}

function archiveChat(chatId) {
  // Close menu
  const menu = document.getElementById(`chatMenu-${chatId}`);
  if (menu) menu.classList.remove('active');

  showNotification('Archive functionality coming soon!', 'info');
}

// Update the renderChatHistory function to use the new createChatHistoryItem
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
        const chatItem = createChatHistoryItem(chat, index);
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

// Initialize search when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(() => {
    initializeSearch();
  }, 100);
});

// File upload functionality for ticket creation
let selectedFiles = [];
let ticketData = {};

function handleFileSelection(fileInput) {
  const files = Array.from(fileInput.files);
  const maxFiles = 3;
  const maxSize = 10 * 1024 * 1024; // 10MB

  // Validate file count
  if (files.length > maxFiles) {
    showNotification(`You can only upload up to ${maxFiles} files at once.`, 'error');
    fileInput.value = '';
    return;
  }

  // Validate file types and sizes
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
  const validFiles = [];

  for (const file of files) {
    if (!allowedTypes.includes(file.type)) {
      showNotification(`File "${file.name}" is not supported. Please upload images (JPEG, PNG, GIF, WebP) or PDF files only.`, 'error');
      continue;
    }

    if (file.size > maxSize) {
      showNotification(`File "${file.name}" is too large. Maximum size is 10MB.`, 'error');
      continue;
    }

    validFiles.push(file);
  }

  if (validFiles.length === 0) {
    fileInput.value = '';
    return;
  }

  selectedFiles = validFiles;
  updateFilePreview();

  // Show success message
  showNotification(`${validFiles.length} file(s) selected successfully.`, 'success');
}

function updateFilePreview() {
  const previewContainer = document.querySelector('.file-preview');
  if (!previewContainer) return;

  if (selectedFiles.length === 0) {
    previewContainer.innerHTML = '';
    return;
  }

  const previewHTML = selectedFiles.map((file, index) => {
    const fileIcon = getFileIcon(file.type);
    const fileSize = formatFileSize(file.size);

    return `
      <div class="file-preview-item">
        <div class="file-icon">
          <i class="${fileIcon}"></i>
        </div>
        <div class="file-info">
          <span class="file-name">${sanitizeInput(file.name)}</span>
          <span class="file-size">${fileSize}</span>
        </div>
        <button type="button" class="remove-file-btn" onclick="removeFile(${index})" aria-label="Remove file">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
  }).join('');

  previewContainer.innerHTML = previewHTML;
}

function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) {
    return 'fas fa-image';
  } else if (mimeType === 'application/pdf') {
    return 'fas fa-file-pdf';
  }
  return 'fas fa-file';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  updateFilePreview();

  // Update file input
  const fileInput = document.querySelector('.file-upload-input');
  if (fileInput) {
    fileInput.value = '';
  }

  showNotification('File removed.', 'info');
}

function skipFileUpload() {
  // Create ticket without attachments by sending "no" message
  if (elements.messageInput) {
    elements.messageInput.value = 'no';
    sendMessage();
  }
}

async function handleTicketCreation(button) {
  if (selectedFiles.length === 0) {
    showNotification('Please select at least one file or click "Skip Upload" to proceed without attachments.', 'warning');
    return;
  }

  // Extract ticket data from the chat conversation
  if (!elements.chatMessages) {
    showNotification('Unable to find ticket information. Please start over.', 'error');
    return;
  }

  const messages = Array.from(elements.chatMessages.querySelectorAll('.message'));
  const botMessages = messages.filter(msg => msg.classList.contains('bot'));

  // Find step messages
  let issueTitle = '';
  let category = '';
  let description = '';

  // Extract data from conversation
  for (const message of botMessages) {
    const content = message.textContent || message.innerText;

    const titleMatch = content.match(/Your issue title: ["']([^"']+)["']/);
    if (titleMatch) {
      issueTitle = titleMatch[1];
    }

    const categoryMatch = content.match(/Category selected: ([^\n\r]+)/);
    if (categoryMatch) {
      category = categoryMatch[1].trim();
      // Additional cleanup to remove any text after the category
      const cleanCategory = category.split('Now please provide')[0].trim();
      category = cleanCategory;
    }
  }

  // Find description from user messages (after Step 3)
  const userMessages = messages.filter(msg => msg.classList.contains('user'));
  if (userMessages.length >= 3) {
    description = userMessages[2].textContent || userMessages[2].innerText || '';
  }

  if (!issueTitle || !category || !description) {
    showNotification('Missing ticket information. Please ensure you have completed all steps.', 'error');
    return;
  }

  // Disable button and show loading state
  button.disabled = true;
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Ticket...';

  try {
    // Create FormData with ticket information and files
    const formData = new FormData();
    formData.append('issue_title', issueTitle);
    formData.append('category', category);
    formData.append('description', description);

    // Add files
    selectedFiles.forEach((file, index) => {
      formData.append('attachments', file);
    });

    console.log('Creating ticket with attachments...', {
      issueTitle,
      category,
      description: description.substring(0, 100) + '...',
      fileCount: selectedFiles.length
    });

    // Add chatId to the form data
    if (currentChatId) {
      formData.append('chatId', currentChatId);
    }

    const response = await fetch(`${API_BASE}/tickets/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to create ticket');
    }

    const result = await response.json();
    console.log('Ticket created successfully:', result);

    // Show success message in chat
    const successMessage = `✅ **Ticket Created Successfully!**

**Ticket ID:** ${result.ticket.ticket_id}
**Title:** ${issueTitle}
**Category:** ${category}
**Status:** Open
**Attachments:** ${selectedFiles.length} file(s)

Your support ticket has been created and assigned to our team. You'll receive updates on the progress via email.

**What's next?**
- Our support team will review your ticket within 24 hours
- You'll receive email notifications for any updates
- You can reference your ticket using ID: ${result.ticket.ticket_id}

Is there anything else I can help you with regarding your investments or account?`;

    // Clear the file upload interface
    const fileUploadContainer = document.querySelector('.file-upload-container');
    if (fileUploadContainer) {
      fileUploadContainer.remove();
    }

    // Reset state
    selectedFiles = [];
    ticketData = {};

    showNotification(`Ticket ${result.ticket.ticket_id} created successfully!`, 'success');
    
    // Reload chat to get the success message from backend with retry mechanism
    if (currentChatId) {
      let retryCount = 0;
      const maxRetries = 3;
      
      const reloadChat = async () => {
        try {
          await loadChat(currentChatId);
          console.log('Chat reloaded successfully after ticket creation');
        } catch (error) {
          console.error('Error reloading chat:', error);
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`Retrying chat reload (${retryCount}/${maxRetries})...`);
            setTimeout(reloadChat, 1000);
          } else {
            console.error('Failed to reload chat after maximum retries');
            showNotification('Chat update may be delayed. Please refresh if needed.', 'warning');
          }
        }
      };
      
      // Initial delay to allow backend processing
      setTimeout(reloadChat, 1500);
    }

  } catch (error) {
    console.error('Error creating ticket:', error);
    showNotification(error.message || 'Failed to create ticket. Please try again.', 'error');

    // Add error message to chat
    appendMessage('bot', 'I\'m sorry, there was an error creating your ticket with attachments. Please try again or contact our support team directly.');
  } finally {
    // Reset button state
    button.disabled = false;
    button.innerHTML = '<i class="fas fa-upload"></i> Create Ticket with Attachments';
  }
}

// Function to show file upload interface in chat
function showFileUploadInterface() {
  if (!elements.chatMessages) return;

  const uploadInterface = document.createElement('div');
  uploadInterface.className = 'file-upload-container';
  uploadInterface.innerHTML = `
    <div class="file-upload-interface">
      <div class="file-upload-header">
        <h3><i class="fas fa-paperclip"></i> Upload Supporting Documents</h3>
        <p>Select up to 3 files (Images or PDF, max 10MB each)</p>
      </div>

      <div class="file-upload-area">
        <label for="ticketFileUpload" class="file-upload-label">
          <div class="file-upload-icon">
            <i class="fas fa-cloud-upload-alt"></i>
          </div>
          <div class="file-upload-text">
            <span class="upload-primary">Click to upload files</span>
            <span class="upload-secondary">or drag and drop files here</span>
          </div>
          <input type="file" id="ticketFileUpload" class="file-upload-input" multiple accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" style="display: none;">
        </label>
      </div>

      <div class="file-preview"></div>

      <div class="file-upload-actions">
        <button type="button" class="btn-secondary skip-upload-btn">
          <i class="fas fa-skip-forward"></i> Skip Upload
        </button>
        <button type="button" class="btn-primary create-ticket-btn" disabled>
          <i class="fas fa-upload"></i> Create Ticket with Attachments
        </button>
      </div>
    </div>
  `;

  elements.chatMessages.appendChild(uploadInterface);
  scrollToBottom();

  // Update create button state based on file selection
  const updateCreateButton = () => {
    const createBtn = uploadInterface.querySelector('.create-ticket-btn');
    if (createBtn) {
      createBtn.disabled = selectedFiles.length === 0;
    }
  };

  // Set up file input change handler
  const fileInput = uploadInterface.querySelector('.file-upload-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      handleFileSelection(e.target);
      updateCreateButton();
    });
  }

  // Set up drag and drop
  const uploadArea = uploadInterface.querySelector('.file-upload-area');
  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer.files);
      if (fileInput) {
        // Create a new FileList-like object
        const dt = new DataTransfer();
        files.forEach(file => dt.items.add(file));
        fileInput.files = dt.files;

        handleFileSelection(fileInput);
        updateCreateButton();
      }
    });
  }
}

// Check if bot message indicates file upload is needed and show interface
function checkForFileUploadTrigger(botMessage) {
  const content = botMessage.toLowerCase();
  if (content.includes('ticket created successfully')) {
    return; // Skip file upload trigger if ticket is already created
  }
  if (content.includes('use the file upload form') && content.includes('will appear after this message')) {
    setTimeout(() => {
      showFileUploadInterface();
    }, 500);
  }
}

// Make new functions globally available
window.toggleChatMenu = toggleChatMenu;
window.shareChat = shareChat;
window.renameChat = renameChat;
window.archiveChat = archiveChat;
window.handleFileSelection = handleFileSelection;
window.handleTicketCreation = handleTicketCreation;
window.skipFileUpload = skipFileUpload;
window.removeFile = removeFile;
window.toggleVoiceOutput = toggleVoiceOutput;

// Toggle voice output function for waves button
function toggleVoiceOutput() {
  if (!elements.wavesBtn) return;
  
  const isActive = elements.wavesBtn.classList.contains('active');
  
  if (isActive) {
    // Deactivate voice output
    elements.wavesBtn.classList.remove('active');
    showNotification('Voice output disabled', 'info');
  } else {
    // Activate voice output
    elements.wavesBtn.classList.add('active');
    showNotification('Voice output enabled', 'success');
  }
  
  // Add visual feedback
  elements.wavesBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    elements.wavesBtn.style.transform = 'scale(1)';
  }, 100);
}
