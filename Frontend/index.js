// Immediate test to verify JS is loading
console.log('🚀 JavaScript file is loading...');
window.WARP_JS_LOADED = true;

const API_BASE = "http://localhost:5000/api";
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
  console.log("🎯 DOM loaded, initializing app...");
  console.log('Available functions:', {
    toggleProfileDropdown: typeof toggleProfileDropdown,
    showAccountSettings: typeof showAccountSettings
  });

  showAuthScreen();
  initializeTheme();
  checkAuthStatus();
  setupEventListeners();
  initializeVoiceFunctionality();

  // Force attach global functions immediately
  attachGlobalFunctions();
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

  // Note: skip-upload-btn and create-ticket-btn click handling is done
  // by the event delegation handler below (using .closest() for robustness).

  // Additional event delegation to handle dynamically created buttons
  document.addEventListener('click', function (e) {
    console.log('🎯 Document click detected:', {
      target: e.target.tagName,
      targetClass: e.target.className,
      targetText: e.target.textContent?.trim(),
    });

    // Check if clicked element or its parents have the skip-upload-btn class
    const skipButton = e.target.closest('.skip-upload-btn');
    if (skipButton) {
      console.log('🎯 Skip button clicked via event delegation!');
      e.preventDefault();
      e.stopPropagation();
      skipFileUpload();
      return;
    }

    // Check if clicked element or its parents have the create-ticket-btn class
    const createButton = e.target.closest('.create-ticket-btn');
    if (createButton) {
      console.log('🎯 Create button clicked via event delegation!');
      e.preventDefault();
      e.stopPropagation();
      handleTicketCreation(createButton);
      return;
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
    elements.sendBtn.addEventListener("click", handleSendButtonClick);
  }

  // Waves button click handler
  if (elements.wavesBtn) {
    elements.wavesBtn.addEventListener("click", toggleVoiceOutput);
  }

  // Voice input button click handler
  if (elements.voiceBtn) {
    elements.voiceBtn.addEventListener("click", toggleVoiceInput);
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

  // Smooth transition from auth to landing area
  if (elements.authScreen) {
    elements.authScreen.style.opacity = '0';
    elements.authScreen.style.transform = 'scale(0.95)';

    setTimeout(() => {
      elements.authScreen.style.display = "none";
      showLandingArea(user);
    }, 200);
  }

  // Update user info in header with animation for chat screen use
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

  const chatScreen = document.getElementById('chatScreen');
  const isLauncherMode = chatScreen && chatScreen.classList.contains('launcher-mode');
  const isCurrentlyOpen = elements.sidebar.classList.contains("active");
  const overlay = document.getElementById('sidebarOverlay');
  const toggleBtn = document.querySelector('.sidebar-toggle');
  const collapseBtn = document.querySelector('.sidebar-collapse-btn');

  // Add visual feedback to button that was clicked
  const clickedBtn = event?.target.closest('button');
  if (clickedBtn) {
    clickedBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
      clickedBtn.style.transform = 'scale(1)';
    }, 100);
  }

  // In launcher mode, behave differently based on screen size
  if (isLauncherMode) {
    if (window.innerWidth <= 768) {
      // Mobile launcher mode - use overlay behavior
      if (isCurrentlyOpen) {
        // Close sidebar
        elements.sidebar.classList.remove("active");
        document.body.style.overflow = '';
        if (overlay) {
          overlay.style.opacity = '0';
          overlay.style.visibility = 'hidden';
        }
        console.log('Sidebar closed in launcher mobile mode');
      } else {
        // Open sidebar
        elements.sidebar.classList.add("active");
        document.body.style.overflow = 'hidden';
        if (overlay) {
          overlay.style.opacity = '1';
          overlay.style.visibility = 'visible';
        }
        console.log('Sidebar opened in launcher mobile mode');
      }
    } else {
      // Desktop launcher mode - use collapse behavior like normal chat
      const isCollapsed = chatScreen.classList.contains("sidebar-collapsed");

      if (isCollapsed) {
        // Expand sidebar
        chatScreen.classList.remove('sidebar-collapsed');
        console.log('Sidebar expanded in launcher desktop mode');
      } else {
        // Collapse sidebar
        chatScreen.classList.add('sidebar-collapsed');
        console.log('Sidebar collapsed in launcher desktop mode');
      }
    }
  } else if (window.innerWidth <= 768) {
    // Mobile behavior for regular chat
    if (isCurrentlyOpen) {
      // Close sidebar
      elements.sidebar.classList.remove("active");
      document.body.style.overflow = '';
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
      }
      console.log('Sidebar closed in mobile mode');
    } else {
      // Open sidebar
      elements.sidebar.classList.add("active");
      document.body.style.overflow = 'hidden';
      if (overlay) {
        overlay.style.opacity = '1';
        overlay.style.visibility = 'visible';
      }
      console.log('Sidebar opened in mobile mode');
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

  // Handle object content (e.g., document_upload_modal from ticket flow)
  if (typeof message === 'object' && message !== null) {
    if (message.type === 'document_upload_modal') {
      message = message.content || 'Document upload step';
    } else {
      message = typeof message === 'string' ? message : JSON.stringify(message);
    }
  }

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
  
  // Custom parsing for chain-of-thought inside <thought>...</thought>
  let thoughtHtml = '';
  const thoughtMatch = message.match(/<thought>([\s\S]*?)<\/thought>/i);
  if (thoughtMatch) {
    let thoughtContent = thoughtMatch[1].trim();
    message = message.replace(/<thought>[\s\S]*?<\/thought>/i, '');
    
    thoughtContent = thoughtContent.replace(/\n/g, '<br>');
    
    thoughtHtml = `
      <div class="glass-accordion thought-accordion" style="margin-bottom: 12px; border-radius: 12px; overflow: hidden; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); color: inherit;">
        <div class="accordion-header" onclick="this.parentElement.classList.toggle('active')" style="padding: 10px 15px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 0.9em; user-select: none;">
          <div><i class="fas fa-brain" style="margin-right: 8px; color: var(--accent-light, #10a37f);"></i> <span style="font-weight: 500;">AI Reasoning Process</span></div>
          <i class="fas fa-chevron-down toggle-icon" style="transition: transform 0.3s;"></i>
        </div>
        <div class="accordion-content" style="max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out; background: rgba(0,0,0,0.02);">
          <div style="padding: 0 15px 15px 15px; font-size: 0.85em; opacity: 0.9; line-height: 1.5;">
            ${thoughtContent}
          </div>
        </div>
      </div>
    `;
  }

  let formattedMessage = '';
  // Enhanced formatting with marked and DOMPurify if available
  if (window.marked && window.DOMPurify) {
    try {
      const html = marked.parse(message);
      formattedMessage = DOMPurify.sanitize(html);
    } catch (e) {
      console.error("Markdown parsing failed", e);
      formattedMessage = sanitizeInput(message)
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    }
  } else {
    // Basic formatting fallback
    formattedMessage = sanitizeInput(message)
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
      .replace(/\*(.*?)\*/g, '<em>$1</em>'); // Italic text
  }
  return thoughtHtml + formattedMessage;
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
        message,
        stream: true // Request streaming
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

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const chatData = await response.json();
      currentChatId = chatData._id || chatData.id;
      
      if (elements.typingIndicator) {
        elements.typingIndicator.style.display = "none";
      }

      if (chatData.messages && chatData.messages.length > 0) {
        const lastMsg = chatData.messages[chatData.messages.length - 1];
        if (lastMsg.sender === "bot") {
          let botContent = lastMsg.content;
          if (typeof botContent === 'object' && botContent.type === 'document_upload_modal') {
             const modalConfig = botContent.modalConfig;
             const displayMessage = `${modalConfig.description}\n\nYou can upload up to ${modalConfig.maxFiles} files (max ${modalConfig.maxFileSize} each).\nSupported formats: ${modalConfig.allowedTypes.join(', ')}`;
             appendMessage("bot", displayMessage);
             setTimeout(() => {
                if (typeof showFileUploadInterface === 'function') showFileUploadInterface();
             }, 500);
          } else {
             appendMessage("bot", typeof botContent === 'string' ? botContent : JSON.stringify(botContent));
             if (typeof botContent === 'string' && window.voiceOutputActive && typeof playTTS === 'function') {
               playTTS(botContent);
             }
          }
        }
      }
      
      if (typeof loadChatHistory === 'function') loadChatHistory();
      
      isSendingMessage = false;
      if (elements.sendBtn) {
        elements.sendBtn.disabled = false;
      }
      return;
    }

    console.log("Streaming response started");

    // Hide typing indicator once stream starts
    if (elements.typingIndicator) {
      elements.typingIndicator.style.display = "none";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let aiMessageDiv = null;
    let fullResponse = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split("\n");

      for (const line of lines) {
        if (line.trim().startsWith("data: ")) {
          const dataStr = line.trim().slice(6);
          if (dataStr === "[DONE]") continue;

          try {
            const data = JSON.parse(dataStr);
            if (data.chatId) {
              currentChatId = data.chatId; // Update chat ID
            }
            if (data.chunk) {
              if (!aiMessageDiv) {
                // Initialize empty bot message
                aiMessageDiv = appendMessage("bot", "", true);
              }
              fullResponse += data.chunk;
              const bubble = aiMessageDiv.querySelector(".message-bubble");
              if (bubble) {
                bubble.innerHTML = formatMessage(fullResponse);
              }
              scrollToBottom();
            }
            if (data.type === "document_upload_modal") {
              const modalConfig = data.modalConfig;
              const displayMessage = `${modalConfig.description}\n\nYou can upload up to ${modalConfig.maxFiles} files (max ${modalConfig.maxFileSize} each).\nSupported formats: ${modalConfig.allowedTypes.join(', ')}`;
              appendMessage("bot", displayMessage);
              setTimeout(() => {
                showFileUploadInterface();
              }, 500);
            }
          } catch (e) {
            console.error("Stream parse error", e, dataStr);
          }
        }
      }
    }

    // Call TTS after streaming finishes if voice is enabled
    if (fullResponse && window.voiceOutputActive && typeof playTTS === 'function') {
      playTTS(fullResponse);
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

function toggleFullChat() {
  const chatScreen = document.getElementById("chatScreen");
  if (!chatScreen) return;

  chatScreen.classList.toggle("hidden");

  if (!chatScreen.classList.contains("hidden")) {
    // Show chat screen fully
    const messageInput = document.getElementById("messageInput");
    if (messageInput) messageInput.focus();
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

  // If the last bot message is a document_upload_modal and no ticket success follows,
  // re-show the file upload interface so the user can continue their ticket flow.
  const lastBotIdx = [...messages].reverse().findIndex(m => m.sender === 'bot');
  if (lastBotIdx >= 0) {
    const actualIdx = messages.length - 1 - lastBotIdx;
    const lastBotMessage = messages[actualIdx];
    const content = lastBotMessage.content;
    const isModal = typeof content === 'object' && content !== null && content.type === 'document_upload_modal';
    const hasTicketSuccess = messages.slice(actualIdx + 1).some(m => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.includes('Ticket Created Successfully');
    });
    if (isModal && !hasTicketSuccess) {
      setTimeout(() => {
        if (typeof showFileUploadInterface === 'function') showFileUploadInterface();
      }, 300);
    }
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
  const toggleBtn = document.querySelector('.profile-menu-item[data-action="toggle-theme"] i');
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
  // Close the dropdown after theme change
  ProfileDropdown.close();
}
// Initialize enhanced features
document.addEventListener('DOMContentLoaded', function () {
  enhanceFocusManagement();

  // Initialize voice functionality if supported
  initializeVoiceFunctionality();

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
    // Only show error notification for critical errors, not minor UI errors
    const errorMessage = event.error?.message || event.message || '';
    const isUIError = errorMessage.includes('ProfileDropdown') ||
      errorMessage.includes('dropdown') ||
      errorMessage.includes('Cannot read property') ||
      errorMessage.includes('null is not an object') ||
      errorMessage.includes('classList') ||
      errorMessage.includes('toggle') ||
      errorMessage.includes('closest') ||
      errorMessage.includes('undefined');

    if (!isUIError) {
      showNotification('Something went wrong. Please refresh the page.', 'error');
    } else {
      // For UI errors, just log them but don't show notification
      console.warn('UI Error (non-critical):', errorMessage);
    }
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



// Update profile information in dropdown
function updateProfileDropdown(user) {
  // Update chat screen profile dropdown
  const profileName = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  const profileAvatar = document.getElementById('profileAvatar');

  if (profileName) profileName.textContent = sanitizeInput(user.name);
  if (profileEmail) profileEmail.textContent = sanitizeInput(user.email || 'user@example.com');
  if (profileAvatar) profileAvatar.textContent = sanitizeInput(user.name.charAt(0).toUpperCase());

  // Update landing area profile dropdown
  const landingProfileName = document.getElementById('landingProfileName');
  const landingProfileEmail = document.getElementById('landingProfileEmail');
  const landingProfileAvatar = document.getElementById('landingProfileAvatar');

  if (landingProfileName) landingProfileName.textContent = sanitizeInput(user.name);
  if (landingProfileEmail) landingProfileEmail.textContent = sanitizeInput(user.email || 'user@example.com');
  if (landingProfileAvatar) landingProfileAvatar.textContent = sanitizeInput(user.name.charAt(0).toUpperCase());
}

// ============================================
// PROFILE DROPDOWN IMPLEMENTATION
// ============================================

const ProfileDropdown = {
  // Initialize the profile dropdown functionality
  init() {
    console.log('🔧 Initializing Profile Dropdown...');
    this.setupEventListeners();
  },

  // Set up all event listeners
  setupEventListeners() {
    console.log('🔧 Setting up ProfileDropdown event listeners');

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => this.handleOutsideClick(e));

    // Set up menu item listeners
    this.setupMenuItemListeners();

    console.log('✅ ProfileDropdown event listeners set up successfully');
  },

  // Toggle the dropdown
  toggle(event, context = 'chat') {
    try {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const dropdownId = context === 'chat' ? 'profileDropdown' : 'landingProfileDropdown';
      const userMenuId = context === 'chat' ? 'chatUserMenu' : 'landingUserMenu';

      const dropdown = document.getElementById(dropdownId);
      const userMenu = document.getElementById(userMenuId);

      if (!dropdown) {
        console.warn(`ProfileDropdown: ${dropdownId} not found`);
        return;
      }

      const isActive = dropdown.classList.contains('active');

      // Close all dropdowns first
      this.closeAll();

      // If it wasn't active, open it
      if (!isActive) {
        dropdown.classList.add('active');
        if (userMenu) {
          userMenu.classList.add('active');
        }
      }
    } catch (error) {
      console.error('ProfileDropdown toggle error:', error);
      // Don't re-throw the error to prevent global error handler
    }
  },

  // Close all dropdowns
  closeAll() {
    const chatDropdown = document.getElementById('profileDropdown');
    const landingDropdown = document.getElementById('landingProfileDropdown');
    const chatUserMenu = document.getElementById('chatUserMenu');
    const landingUserMenu = document.getElementById('landingUserMenu');

    if (chatDropdown) {
      chatDropdown.classList.remove('active');
    }
    if (landingDropdown) {
      landingDropdown.classList.remove('active');
    }
    if (chatUserMenu) {
      chatUserMenu.classList.remove('active');
    }
    if (landingUserMenu) {
      landingUserMenu.classList.remove('active');
    }
  },

  // Close dropdown (public method)
  close() {
    this.closeAll();
  },

  // Handle clicks outside the dropdown
  handleOutsideClick(event) {
    // Check if click is inside user menu or profile dropdown
    const isClickInsideUserMenu = event.target.closest('.user-menu');
    const isClickInsideDropdown = event.target.closest('.profile-dropdown');
    const isClickInsideMenuItem = event.target.closest('.profile-menu-item');

    // Only close if clicked completely outside the dropdown area
    if (!isClickInsideUserMenu && !isClickInsideDropdown) {
      this.closeAll();
    }

    // Don't close when clicking menu items (let the item handlers decide)
    if (isClickInsideMenuItem) {
      event.stopPropagation();
    }
  },

  // Set up menu item click listeners
  setupMenuItemListeners() {
    document.addEventListener('click', (e) => {
      const menuItem = e.target.closest('.profile-menu-item');
      if (!menuItem) return;

      // Prevent event propagation to avoid closing dropdown immediately
      e.preventDefault();
      e.stopPropagation();

      const action = menuItem.getAttribute('data-action');
      console.log(`🔧 Menu item clicked: ${action}`);

      switch (action) {
        case 'account-settings':
          this.handleAccountSettings();
          break;
        case 'preferences':
          this.handlePreferences();
          break;
        case 'toggle-theme':
          this.handleToggleTheme();
          break;
        case 'logout':
          this.handleLogout();
          break;
      }
    });
  },

  // Menu item handlers
  handleAccountSettings() {
    // Don't close dropdown automatically - let user decide
    showNotification('Account settings coming soon!', 'info');
  },

  handlePreferences() {
    // Don't close dropdown automatically - let user decide
    showNotification('Preferences coming soon!', 'info');
  },

  handleToggleTheme() {
    // Call the existing theme toggle function
    toggleTheme();
    // Don't close dropdown - let user continue using it
  },

  handleLogout() {
    this.close();
    // Call the existing logout function
    logout();
  }
};

// Function to attach global functions
function attachGlobalFunctions() {
  console.log('📌 Attaching global functions...');

  // Make functions globally available for onclick handlers
  window.switchToSignup = switchToSignup;
  window.switchToLogin = switchToLogin;
  window.logout = logout;
  window.toggleSidebar = toggleSidebar;
  window.toggleTheme = toggleTheme;
  window.sendQuickMessage = sendQuickMessage;
  window.startNewChat = startNewChat;
  window.closeSidebar = closeSidebar;
  window.clearSearch = clearSearch;
  window.searchChats = searchChats;
  window.openChatFromLanding = openChatFromLanding;
  window.closeChatToLanding = closeChatToLanding;

  // Profile dropdown functions (properly bound)
  window.toggleProfileDropdown = function (event, context) {
    try {
      return ProfileDropdown.toggle(event, context);
    } catch (error) {
      console.warn('Profile dropdown toggle failed:', error);
      return false;
    }
  };
  window.showAccountSettings = function () {
    try {
      return ProfileDropdown.handleAccountSettings();
    } catch (error) {
      console.warn('Profile account settings failed:', error);
      return false;
    }
  };

  // Make ProfileDropdown globally accessible
  window.ProfileDropdown = ProfileDropdown;

  console.log('✅ Global functions attached:', {
    toggleProfileDropdown: typeof window.toggleProfileDropdown,
    showAccountSettings: typeof window.showAccountSettings,
    logout: typeof window.logout
  });
}

// Call immediately after ProfileDropdown is defined
attachGlobalFunctions();

// Initialize ProfileDropdown when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    ProfileDropdown.init();
    console.log('✅ ProfileDropdown initialized successfully');
  } catch (error) {
    console.warn('ProfileDropdown initialization failed:', error);
  }
});

// Make ProfileDropdown globally available
window.ProfileDropdown = ProfileDropdown;



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

async function skipFileUpload() {
  console.log('🎫 skipFileUpload() called!');

  // Create ticket without attachments by directly calling the ticket creation API
  const skipButton = document.querySelector('.skip-upload-btn');
  console.log('🎫 Skip button found:', !!skipButton);

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
  if (skipButton) {
    skipButton.disabled = true;
    skipButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Ticket...';
  }

  try {
    // Create FormData with ticket information (no files)
    const formData = new FormData();
    formData.append('issue_title', issueTitle);
    formData.append('category', category);
    formData.append('description', description);

    console.log('Creating ticket without attachments...', {
      issueTitle,
      category,
      description: description.substring(0, 100) + '...'
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
    console.log('Ticket created successfully (no attachments):', result);

    // Clear the file upload interface
    const fileUploadContainer = document.querySelector('.file-upload-container');
    if (fileUploadContainer) {
      fileUploadContainer.remove();
    }

    // Reload the chat to show the server-pushed success message (avoid duplicates)
    if (currentChatId) {
      await loadChat(currentChatId);
    }

    // Reset state
    selectedFiles = [];
    ticketData = {};

    showNotification(`Ticket ${result.ticket.ticket_id} created successfully!`, 'success');

    // Optional: Reload chat history to show the updated ticket in sidebar (but don't reload the current chat)
    setTimeout(() => {
      loadChatHistory();
    }, 1000);

  } catch (error) {
    console.error('Error creating ticket:', error);
    showNotification(error.message || 'Failed to create ticket. Please try again.', 'error');

    // Add error message to chat
    appendMessage('bot', 'I\'m sorry, there was an error creating your ticket. Please try again or contact our support team directly.');
  } finally {
    // Reset button state
    if (skipButton) {
      skipButton.disabled = false;
      skipButton.innerHTML = '<i class="fas fa-skip-forward"></i> Skip Upload';
    }
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

    // Clear the file upload interface
    const fileUploadContainer = document.querySelector('.file-upload-container');
    if (fileUploadContainer) {
      fileUploadContainer.remove();
    }

    // Reload the chat to show the server-pushed success message (avoid duplicates)
    if (currentChatId) {
      await loadChat(currentChatId);
    }

    // Reset state
    selectedFiles = [];
    ticketData = {};

    showNotification(`Ticket ${result.ticket.ticket_id} created successfully!`, 'success');

    // Optional: Reload chat history to show the updated ticket in sidebar (but don't reload the current chat)
    setTimeout(() => {
      loadChatHistory();
    }, 1000);

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

    // Auto-trigger file upload dialog immediately
    setTimeout(() => {
      fileInput.click();
    }, 500);
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
  // New flow: Show file upload when Step 4 of 4 with [File Upload Field] is mentioned
  if (content.includes('step 4 of 4') && content.includes('[file upload field]')) {
    setTimeout(() => {
      showFileUploadInterface();
    }, 500);
  }
  // Keep old flow for backward compatibility
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
window.toggleVoiceInput = toggleVoiceInput;

// Voice input variables
let isRecording = false;
let recognition = null;
let isVoiceInputActive = false;
let currentTranscript = ''; // Store the transcript separately
let originalInputValue = ''; // Store original input value

// Voice output variables
let isVoiceOutputEnabled = false;
let speechSynthesis = null;
let currentUtterance = null;
let voiceOutputQueue = [];

// Audio visualization variables
let audioContext = null;
let analyser = null;
let microphone = null;
let dataArray = null;
let animationId = null;
let audioStream = null;

// Initialize Speech Recognition
function initializeSpeechRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Speech recognition not supported in this browser');
    return null;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  return recognition;
}

// Initialize Speech Synthesis
function initializeSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser');
    return null;
  }

  return window.speechSynthesis;
}

// Stop current speech and clear queue
function stopSpeech() {
  if (speechSynthesis) {
    speechSynthesis.cancel();
    voiceOutputQueue = [];
    currentUtterance = null;
  }
}

// Speak text with queue management
function speakText(text) {
  if (!isVoiceOutputEnabled || !speechSynthesis || !text.trim()) {
    return;
  }

  // Stop any current speech before starting new one
  stopSpeech();

  // Clean the text for better speech synthesis
  const cleanText = cleanTextForSpeech(text);

  const utterance = new SpeechSynthesisUtterance(cleanText);

  // Configure speech settings
  utterance.rate = 0.9; // Slightly slower for better comprehension
  utterance.pitch = 1.0;
  utterance.volume = 0.8;

  // Try to use a more natural voice if available
  const voices = speechSynthesis.getVoices();
  const preferredVoice = voices.find(voice =>
    voice.name.includes('Google') ||
    voice.name.includes('Natural') ||
    voice.name.includes('Enhanced') ||
    (voice.lang.startsWith('en') && voice.localService === false)
  ) || voices.find(voice => voice.lang.startsWith('en'));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  // Event handlers
  utterance.onstart = () => {
    console.log('Speech synthesis started');
    currentUtterance = utterance;
    // Add visual feedback that speech is active
    if (elements.wavesBtn) {
      elements.wavesBtn.classList.add('speaking');
    }
  };

  utterance.onend = () => {
    console.log('Speech synthesis ended');
    currentUtterance = null;
    // Remove visual feedback
    if (elements.wavesBtn) {
      elements.wavesBtn.classList.remove('speaking');
    }
  };

  utterance.onerror = (event) => {
    console.error('Speech synthesis error:', event.error);
    currentUtterance = null;
    if (elements.wavesBtn) {
      elements.wavesBtn.classList.remove('speaking');
    }
  };

  // Speak the text
  speechSynthesis.speak(utterance);
}

// Clean text for better speech synthesis
function cleanTextForSpeech(text) {
  return text
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Convert common symbols to words
    .replace(/&/g, ' and ')
    .replace(/@/g, ' at ')
    .replace(/#/g, ' hash ')
    .replace(/\$/g, ' dollar ')
    .replace(/%/g, ' percent ')
    // Handle abbreviations
    .replace(/\bAPI\b/g, 'A P I')
    .replace(/\bURL\b/g, 'U R L')
    .replace(/\bHTTP\b/g, 'H T T P')
    .replace(/\bJSON\b/g, 'J S O N')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Toggle voice input function
function toggleVoiceInput() {
  if (!elements.voiceBtn || !elements.sendBtn || !elements.messageInput) return;

  if (!isVoiceInputActive) {
    startVoiceInput();
  } else {
    stopVoiceInput();
  }
}

// Start voice input
function startVoiceInput() {
  if (!recognition) {
    recognition = initializeSpeechRecognition();
    if (!recognition) {
      showNotification('Voice input not supported in this browser', 'error');
      return;
    }
    setupSpeechRecognitionEvents();
  }

  try {
    // Store the original input value before starting
    originalInputValue = elements.messageInput.value;
    currentTranscript = '';

    recognition.start();
    isVoiceInputActive = true;
    updateVoiceInputUI(true);

    // Start audio visualization
    startAudioVisualization();

    showNotification('Listening... Speak now', 'info');
  } catch (error) {
    console.error('Error starting voice recognition:', error);
    showNotification('Failed to start voice input', 'error');
  }
}

// Stop voice input
function stopVoiceInput() {
  if (recognition) {
    recognition.stop();
  }
  isVoiceInputActive = false;

  // Stop audio visualization
  stopAudioVisualization();

  // Reset voice input variables if cancelling
  if (!currentTranscript.trim()) {
    currentTranscript = '';
    originalInputValue = '';
  }

  updateVoiceInputUI(false);
}

// Update UI for voice input state
function updateVoiceInputUI(isActive) {
  if (!elements.voiceBtn || !elements.sendBtn) return;

  if (isActive) {
    // Change mic button to X (cancel) button
    elements.voiceBtn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
    elements.voiceBtn.setAttribute('title', 'Cancel voice input');
    elements.voiceBtn.setAttribute('aria-label', 'Cancel voice input');
    elements.voiceBtn.classList.add('recording');

    // Change send button to checkmark
    elements.sendBtn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
    elements.sendBtn.setAttribute('title', 'Accept voice input');
    elements.sendBtn.setAttribute('aria-label', 'Accept voice input');
    elements.sendBtn.classList.add('voice-confirm');
    elements.sendBtn.disabled = false;

    // Add visual feedback for active state
    elements.voiceBtn.style.background = 'var(--red)';
    elements.voiceBtn.style.color = 'white';
    elements.sendBtn.style.background = 'var(--green)';
    elements.sendBtn.style.color = 'white';

    // Add live sound waves visualization to textarea
    elements.messageInput.classList.add('voice-active');
    elements.messageInput.placeholder = 'Listening... Speak now';

    // Create audio wave visualization container
    createAudioWaveContainer();

  } else {
    // Reset mic button
    elements.voiceBtn.innerHTML = '<i class="fas fa-microphone" aria-hidden="true"></i>';
    elements.voiceBtn.setAttribute('title', 'Voice input');
    elements.voiceBtn.setAttribute('aria-label', 'Voice input');
    elements.voiceBtn.classList.remove('recording');

    // Reset send button
    elements.sendBtn.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i>';
    elements.sendBtn.setAttribute('title', 'Send message');
    elements.sendBtn.setAttribute('aria-label', 'Send message');
    elements.sendBtn.classList.remove('voice-confirm');

    // Reset visual feedback
    elements.voiceBtn.style.background = '';
    elements.voiceBtn.style.color = '';
    elements.sendBtn.style.background = '';
    elements.sendBtn.style.color = '';

    // Remove voice active state from textarea
    elements.messageInput.classList.remove('voice-active');
    elements.messageInput.placeholder = 'Send a message...';

    // Remove audio wave visualization
    removeAudioWaveContainer();

    // Update send button state
    updateSendButtonState();
  }
}

// Setup speech recognition events
function setupSpeechRecognitionEvents() {
  if (!recognition) return;

  recognition.onstart = () => {
    console.log('Voice recognition started');
    isRecording = true;
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    // Process all results to get complete transcripts
    for (let i = 0; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // Store the transcript separately - DON'T update the input field during recording
    // Only update the stored transcript for when user confirms
    currentTranscript = finalTranscript + (interimTranscript ? ' ' + interimTranscript : '');

    console.log('Current transcript:', currentTranscript); // For debugging

    // The textarea will only show live waves animation, no text updates during recording
  };

  recognition.onerror = (event) => {
    console.error('Voice recognition error:', event.error);
    let errorMessage = 'Voice input error';

    switch (event.error) {
      case 'no-speech':
        errorMessage = 'No speech detected. Please try again.';
        break;
      case 'audio-capture':
        errorMessage = 'Microphone not accessible. Please check permissions.';
        break;
      case 'not-allowed':
        errorMessage = 'Microphone permission denied. Please allow microphone access.';
        break;
      case 'network':
        errorMessage = 'Network error. Please check your connection.';
        break;
      default:
        errorMessage = 'Voice input failed. Please try again.';
    }

    showNotification(errorMessage, 'error');
    stopVoiceInput();
  };

  recognition.onend = () => {
    console.log('Voice recognition ended');
    isRecording = false;

    if (isVoiceInputActive) {
      // Recognition ended but we're still in voice input mode
      // Clean up the interim indicator
      if (elements.messageInput) {
        const currentText = elements.messageInput.value;
        elements.messageInput.value = currentText.replace(/\s*\.\.\.$/, '');
      }
    }
  };
}

// Audio visualization functions
function createAudioWaveContainer() {
  // Remove existing container if any
  removeAudioWaveContainer();

  const inputContainer = elements.messageInput.parentElement;
  if (!inputContainer) return;

  const waveContainer = document.createElement('div');
  waveContainer.id = 'audioWaveContainer';
  waveContainer.className = 'audio-wave-container';

  // Create canvas for audio visualization
  const canvas = document.createElement('canvas');
  canvas.id = 'audioWaveCanvas';
  canvas.className = 'audio-wave-canvas';

  waveContainer.appendChild(canvas);
  inputContainer.appendChild(waveContainer);

  // Position the container over the input
  positionAudioWaveContainer();
}

function removeAudioWaveContainer() {
  const existingContainer = document.getElementById('audioWaveContainer');
  if (existingContainer) {
    existingContainer.remove();
  }
}

function positionAudioWaveContainer() {
  const waveContainer = document.getElementById('audioWaveContainer');
  const inputElement = elements.messageInput;

  if (!waveContainer || !inputElement) return;

  const inputRect = inputElement.getBoundingClientRect();
  const containerRect = inputElement.parentElement.getBoundingClientRect();

  waveContainer.style.position = 'absolute';
  waveContainer.style.left = `${inputRect.left - containerRect.left}px`;
  waveContainer.style.top = `${inputRect.top - containerRect.top}px`;
  waveContainer.style.width = `${inputRect.width}px`;
  waveContainer.style.height = `${inputRect.height}px`;
  waveContainer.style.pointerEvents = 'none';
  waveContainer.style.zIndex = '10';
}

async function startAudioVisualization() {
  try {
    // Get user media for audio visualization
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(audioStream);

    // Configure analyser
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;

    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    // Connect microphone to analyser
    microphone.connect(analyser);

    // Start visualization
    visualizeAudio();

  } catch (error) {
    console.error('Error accessing microphone for visualization:', error);
    // Continue without visualization if microphone access fails
  }
}

function stopAudioVisualization() {
  // Cancel animation frame
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Stop audio stream
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  // Close audio context
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  // Reset variables
  analyser = null;
  microphone = null;
  dataArray = null;
}

function visualizeAudio() {
  if (!analyser || !dataArray || !isVoiceInputActive) {
    return;
  }

  const canvas = document.getElementById('audioWaveCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const containerRect = canvas.parentElement.getBoundingClientRect();

  // Set canvas size
  canvas.width = containerRect.width;
  canvas.height = containerRect.height;

  // Get audio data
  analyser.getByteFrequencyData(dataArray);

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Calculate average volume
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const average = sum / dataArray.length;

  // Create wave visualization (moving from right to left)
  const waveHeight = Math.max(2, (average / 255) * (canvas.height * 0.6));
  const numBars = 40;
  const barWidth = 3;
  const barSpacing = 2;
  const totalWidth = numBars * (barWidth + barSpacing);

  // Animate bars from right to left
  const time = Date.now() * 0.005;

  ctx.fillStyle = getComputedStyle(document.documentElement)
    .getPropertyValue('--green').trim() || '#10a37f';

  for (let i = 0; i < numBars; i++) {
    // Create wave effect with different frequencies
    const frequency1 = Math.sin(time + i * 0.3) * 0.5;
    const frequency2 = Math.sin(time * 1.5 + i * 0.2) * 0.3;
    const frequency3 = Math.sin(time * 0.8 + i * 0.4) * 0.2;

    // Combine audio data with wave animation
    const audioInfluence = (dataArray[i * 2] || 0) / 255;
    const combinedHeight = Math.max(2,
      waveHeight * (0.3 + audioInfluence * 0.7) *
      (1 + frequency1 + frequency2 + frequency3)
    );

    // Position from right to left
    const x = canvas.width - totalWidth + i * (barWidth + barSpacing);
    const y = (canvas.height - combinedHeight) / 2;

    // Add opacity based on position (fade from right to left)
    const opacity = Math.max(0.2, 1 - (i / numBars) * 0.8);
    ctx.globalAlpha = opacity;

    // Draw bar with rounded edges
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, combinedHeight, barWidth / 2);
    ctx.fill();
  }

  // Reset opacity
  ctx.globalAlpha = 1;

  // Continue animation
  animationId = requestAnimationFrame(visualizeAudio);
}

// Add polyfill for roundRect if not supported
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, width, height, radius) {
    this.beginPath();
    this.moveTo(x + radius, y);
    this.lineTo(x + width - radius, y);
    this.arcTo(x + width, y, x + width, y + radius, radius);
    this.lineTo(x + width, y + height - radius);
    this.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    this.lineTo(x + radius, y + height);
    this.arcTo(x, y + height, x, y + height - radius, radius);
    this.lineTo(x, y + radius);
    this.arcTo(x, y, x + radius, y, radius);
    this.closePath();
  };
}

// Override send button behavior when in voice input mode
function handleSendButtonClick() {
  if (isVoiceInputActive) {
    // Accept voice input and populate text field with transcript
    stopVoiceInput();

    // Apply the stored transcript to the input field
    if (elements.messageInput && currentTranscript.trim()) {
      // Combine original value with the voice transcript
      const finalText = originalInputValue + (originalInputValue ? ' ' : '') + currentTranscript.trim();
      elements.messageInput.value = finalText;

      // Auto-resize textarea
      elements.messageInput.style.height = 'auto';
      const newHeight = Math.min(elements.messageInput.scrollHeight, 120);
      elements.messageInput.style.height = newHeight + 'px';

      // Update send button state
      updateSendButtonState();

      showNotification('Voice input applied. You can edit the text before sending.', 'success');
    } else {
      showNotification('No voice input detected. Please try again.', 'warning');
    }

    // Reset voice input variables
    currentTranscript = '';
    originalInputValue = '';
  } else {
    // Normal send message
    sendMessage();
  }
}

// Initialize voice functionality when DOM is loaded
function initializeVoiceFunctionality() {
  // Initialize speech recognition if supported
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    recognition = initializeSpeechRecognition();
    if (recognition) {
      setupSpeechRecognitionEvents();
    }
  } else {
    // Hide voice button if not supported
    if (elements.voiceBtn) {
      elements.voiceBtn.style.display = 'none';
    }
  }

  // Initialize speech synthesis if supported
  if ('speechSynthesis' in window) {
    speechSynthesis = initializeSpeechSynthesis();
    isVoiceOutputEnabled = false; // Start disabled
  } else {
    // Hide waves button if not supported
    if (elements.wavesBtn) {
      elements.wavesBtn.style.display = 'none';
    }
  }
}

// Toggle voice output function for waves button
function toggleVoiceOutput() {
  if (!elements.wavesBtn) return;

  // Initialize speech synthesis if not already done
  if (!speechSynthesis) {
    speechSynthesis = initializeSpeechSynthesis();
    if (!speechSynthesis) {
      showNotification('Voice output not supported in this browser', 'error');
      return;
    }
  }

  const isActive = elements.wavesBtn.classList.contains('active');

  if (isActive) {
    // Deactivate voice output
    isVoiceOutputEnabled = false;
    elements.wavesBtn.classList.remove('active');
    // Stop any current speech
    stopSpeech();
    showNotification('Voice output disabled', 'info');
  } else {
    // Activate voice output
    isVoiceOutputEnabled = true;
    elements.wavesBtn.classList.add('active');
    showNotification('Voice output enabled - bot responses will be spoken aloud', 'success');
  }

  // Add visual feedback
  elements.wavesBtn.style.transform = 'scale(0.95)';
  setTimeout(() => {
    elements.wavesBtn.style.transform = 'scale(1)';
  }, 100);
}
function toggleChatView() {
  const chatScreen = document.getElementById("chatScreen");
  const launcher = document.getElementById("chatLauncher");

  if (!chatScreen || !launcher) return;

  const isVisible = chatScreen.style.display === "flex";

  if (isVisible) {
    chatScreen.style.display = "none";
    launcher.innerHTML = `<i class="fas fa-comment-dots"></i>`;
  } else {
    chatScreen.style.display = "flex";
    launcher.innerHTML = `<i class="fas fa-times"></i>`;

    // Optional: focus the message input after showing chat
    const input = document.getElementById("messageInput");
    if (input) setTimeout(() => input.focus(), 100);
  }
}
function openChatFromLanding() {
  const chatScreen = document.getElementById("chatScreen");
  const launcher = document.getElementById("chatLauncher");
  const chatWidget = document.getElementById("chatWidget");
  const closeBtn = document.querySelector(".close-chat-btn");

  if (!chatScreen) return;

  // Add launcher-mode class to properly handle layout
  chatScreen.classList.add("launcher-mode");
  chatScreen.style.display = "flex";

  // Show the chat widget that was hidden
  if (chatWidget) {
    chatWidget.classList.remove("hidden");
  }

  // Show the close button in launcher mode
  if (closeBtn) {
    closeBtn.style.display = "flex";
  }

  // Hide the floating launcher
  if (launcher) {
    launcher.style.display = "none";
  }

  // Focus the message input after a short delay
  setTimeout(() => {
    const messageInput = document.getElementById("messageInput");
    if (messageInput) {
      messageInput.focus();
    }
  }, 300);
}

function closeChatToLanding() {
  const chatScreen = document.getElementById("chatScreen");
  const launcher = document.getElementById("chatLauncher");
  const chatWidget = document.getElementById("chatWidget");
  const closeBtn = document.querySelector(".close-chat-btn");

  if (!chatScreen) return;

  // Remove launcher-mode class
  chatScreen.classList.remove("launcher-mode");
  chatScreen.style.display = "none";

  // Hide the chat widget
  if (chatWidget) {
    chatWidget.classList.add("hidden");
  }

  // Hide the close button when leaving launcher mode
  if (closeBtn) {
    closeBtn.style.display = "none";
  }

  // Show the floating launcher again
  if (launcher) {
    launcher.style.display = "flex";
  }
}

function showLandingArea(user) {
  console.log("Showing landing area for user:", user.name);

  // Hide other screens
  if (elements.authScreen) elements.authScreen.style.display = "none";
  if (elements.chatScreen) elements.chatScreen.style.display = "none";

  // Show landing area
  const landingArea = document.getElementById("landingArea");
  if (landingArea) {
    landingArea.classList.remove("hidden");
    landingArea.style.display = "block";

    // Update user info in landing header
    const landingUserName = document.getElementById("landingUserName");
    const landingUserInitials = document.getElementById("landingUserInitials");

    if (landingUserName) {
      landingUserName.textContent = sanitizeInput(user.name);
    }
    if (landingUserInitials) {
      landingUserInitials.textContent = sanitizeInput(user.name.charAt(0).toUpperCase());
    }

    // Also update profile dropdown in landing area
    updateProfileDropdown(user);

    // Ensure ProfileDropdown is initialized and available for landing area
    setTimeout(() => {
      try {
        if (window.ProfileDropdown) {
          console.log('✅ ProfileDropdown is available for landing area');
          // Test the dashboard dropdown
          const landingUserMenu = document.getElementById('landingUserMenu');
          if (landingUserMenu) {
            console.log('✅ Landing user menu found:', landingUserMenu);
          }
        } else {
          console.error('❌ ProfileDropdown not available for landing area');
          // Re-attach global functions
          attachGlobalFunctions();
        }
      } catch (error) {
        console.error('Error checking ProfileDropdown availability:', error);
        console.error('Error checking ProfileDropdown availability:', error);
      }
    }, 100);

    // Load real dashboard data
    loadDashboardData();

    // Show floating launcher after a delay
    setTimeout(() => {
      showFloatingLauncher();
    }, 1000);
  }
}

// Function to load real dashboard data from backend
async function loadDashboardData() {
  try {
    console.log('Loading dashboard data...');
    const response = await fetch(`${API_BASE}/dashboard/data`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard data: ${response.status}`);
    }

    const result = await response.json();
    console.log('Dashboard data loaded:', result.data);

    if (result.success && result.data) {
      updateLandingAreaWithData(result.data);
    }
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    showNotification('Failed to load dashboard data', 'warning');
  }
}

// Function to update landing area with real data
function updateLandingAreaWithData(data) {
  try {
    // Update portfolio overview
    const portfolioValue = document.querySelector('.portfolio-value .value');
    const portfolioChange = document.querySelector('.portfolio-value .change');
    const assetItems = document.querySelectorAll('.asset-item');

    if (portfolioValue && data.portfolio) {
      portfolioValue.textContent = `₹${formatCurrency(data.portfolio.totalValue)}`;
    }

    if (portfolioChange && data.portfolio) {
      const changeClass = data.portfolio.returnPercentage >= 0 ? 'positive' : 'negative';
      portfolioChange.className = `change ${changeClass}`;
      portfolioChange.textContent = `${data.portfolio.returnPercentage >= 0 ? '+' : ''}${data.portfolio.returnPercentage.toFixed(1)}%`;
    }

    // Update asset breakdown
    if (assetItems.length >= 2 && data.portfolio.assets.length >= 2) {
      assetItems[0].querySelector('.asset-value').textContent = `₹${formatCurrency(data.portfolio.assets[0]?.value || 0)}`;
      assetItems[1].querySelector('.asset-value').textContent = `₹${formatCurrency(data.portfolio.assets[1]?.value || 0)}`;
    }

    // Update SIP data
    const sipTotal = document.querySelector('.sip-total .value');
    const sipItems = document.querySelectorAll('.sip-item');

    if (sipTotal && data.sip) {
      sipTotal.textContent = `₹${formatCurrency(data.sip.totalMonthlyInvestment)}`;
    }

    if (sipItems.length >= 2 && data.sip.activeSIPs.length >= 2) {
      sipItems[0].querySelector('.sip-name').textContent = data.sip.activeSIPs[0]?.name || 'Investment 1';
      sipItems[0].querySelector('.sip-amount').textContent = `₹${formatCurrency(data.sip.activeSIPs[0]?.amount || 0)}`;
      sipItems[1].querySelector('.sip-name').textContent = data.sip.activeSIPs[1]?.name || 'Investment 2';
      sipItems[1].querySelector('.sip-amount').textContent = `₹${formatCurrency(data.sip.activeSIPs[1]?.amount || 0)}`;
    }

    // Update recent transactions
    const transactionItems = document.querySelectorAll('.transaction-item');

    if (transactionItems.length >= 3 && data.transactions.length >= 3) {
      for (let i = 0; i < Math.min(3, data.transactions.length); i++) {
        const transaction = data.transactions[i];
        const item = transactionItems[i];

        item.querySelector('.transaction-type').textContent = transaction.type;
        item.querySelector('.transaction-date').textContent = formatTransactionDate(transaction.date);

        const amountEl = item.querySelector('.transaction-amount');
        amountEl.textContent = `${transaction.isCredit ? '+' : '-'}₹${formatCurrency(transaction.amount)}`;
        amountEl.className = `transaction-amount ${transaction.isCredit ? 'credit' : 'debit'}`;
      }
    }

    // Update market data
    const niftyValue = document.querySelector('.index-item:first-child .index-value');
    const niftyChange = document.querySelector('.index-item:first-child .index-change');
    const sensexValue = document.querySelector('.index-item:last-child .index-value');
    const sensexChange = document.querySelector('.index-item:last-child .index-change');

    if (niftyValue && data.market?.nifty) {
      niftyValue.textContent = data.market.nifty.value.toFixed(2);
      if (niftyChange) {
        const changeClass = data.market.nifty.change >= 0 ? 'positive' : 'negative';
        niftyChange.className = `index-change ${changeClass}`;
        niftyChange.textContent = `${data.market.nifty.change >= 0 ? '+' : ''}${data.market.nifty.change}%`;
      }
    }

    if (sensexValue && data.market?.sensex) {
      sensexValue.textContent = data.market.sensex.value.toFixed(2);
      if (sensexChange) {
        const changeClass = data.market.sensex.change >= 0 ? 'positive' : 'negative';
        sensexChange.className = `index-change ${changeClass}`;
        sensexChange.textContent = `${data.market.sensex.change >= 0 ? '+' : ''}${data.market.sensex.change}%`;
      }
    }

    // Update goals
    const goalItems = document.querySelectorAll('.goal-item');

    if (goalItems.length >= 2 && data.goals.length >= 2) {
      for (let i = 0; i < Math.min(2, data.goals.length); i++) {
        const goal = data.goals[i];
        const item = goalItems[i];

        item.querySelector('.goal-name').textContent = goal.name;
        item.querySelector('.goal-progress').textContent = `₹${formatCurrency(goal.current)} / ₹${formatCurrency(goal.target)}`;
        item.querySelector('.progress-fill').style.width = `${goal.progress}%`;
      }
    }

    console.log('Landing area updated with real data');
  } catch (error) {
    console.error('Error updating landing area with data:', error);
  }
}

// Helper functions for formatting
function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';

  if (currency === 'INR') {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(num);
  } else {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(num);
  }
}
function formatTransactionDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

function showFloatingLauncher() {
  const launcher = document.getElementById("chatLauncher");
  const tooltip = document.getElementById("chatTooltip");
  if (!launcher) return;

  launcher.style.display = "flex"; // Show button

  // Add initial text content to launcher
  launcher.innerHTML = `
    <i class="fas fa-comment-dots"></i>
    <span class="launcher-text">Need help with finance?</span>
  `;

  // Auto-expand animation after login
  setTimeout(() => {
    launcher.classList.add("expanded");

    // Auto-contract after 5 seconds if user doesn't interact
    setTimeout(() => {
      if (!launcher.matches(':hover')) {
        launcher.classList.remove("expanded");
        launcher.classList.add("contracting");

        // Remove contracting class after animation
        setTimeout(() => {
          launcher.classList.remove("contracting");
          launcher.innerHTML = `<i class="fas fa-comment-dots"></i>`;
        }, 400);
      }
    }, 5000);
  }, 500);

  // Tooltip fade
  if (tooltip) {
    tooltip.style.opacity = "1";
    setTimeout(() => {
      tooltip.style.opacity = "0";
    }, 4000);
  }
}

// ==========================================
// VOICE ASSISTANT FUNCTIONALITY
// ==========================================

window.voiceOutputActive = false;

function playTTS(text) {
  const audio = document.getElementById("ttsAudio");
  if (!audio || !authToken) return;

  // Use backend endpoint to get audio blob
  fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${authToken}`
    },
    body: JSON.stringify({ text })
  })
    .then(res => {
      if (!res.ok) throw new Error("TTS request failed");
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.play();
    })
    .catch(err => console.error("TTS error:", err));
}

function stopTTS() {
  const audio = document.getElementById("ttsAudio");
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}

function initializeVoiceFunctionality() {
  if (elements.wavesBtn) {
    elements.wavesBtn.addEventListener("click", () => {
      window.voiceOutputActive = !window.voiceOutputActive;
      elements.wavesBtn.classList.toggle("active", window.voiceOutputActive);
      if (window.voiceOutputActive) {
        showNotification("Voice output enabled", "success");
      } else {
        showNotification("Voice output disabled", "info");
        stopTTS();
      }
    });
  }

  if (elements.voiceBtn) {
    elements.voiceBtn.addEventListener("click", () => {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showNotification("Speech recognition is not supported in your browser.", "error");
        return;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      elements.voiceBtn.classList.add("recording");
      elements.voiceBtn.style.color = "var(--error)";
      showNotification("Listening...", "info");

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (elements.messageInput) {
          elements.messageInput.value = transcript;
          updateSendButtonState();
          sendMessage();
        }
      };

      recognition.onerror = (event) => {
        console.error("Speech recognition error", event.error);
        showNotification("Error listening. Please try again.", "error");
        elements.voiceBtn.classList.remove("recording");
        elements.voiceBtn.style.color = "";
      };

      recognition.onend = () => {
        elements.voiceBtn.classList.remove("recording");
        elements.voiceBtn.style.color = "";
      };

      recognition.start();
    });
  }
}