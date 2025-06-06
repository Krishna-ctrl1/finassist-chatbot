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

document.addEventListener("DOMContentLoaded", function () {
  showAuthScreen();
  checkAuthStatus();
  setupEventListeners();
});

function setupEventListeners() {
  elements.messageInput.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 100) + "px";
  });

  elements.messageInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  elements.loginForm.addEventListener("submit", handleLogin);
  elements.signupForm.addEventListener("submit", handleSignup);

  elements.loginForm
    .querySelector("#loginEmail")
    .addEventListener("input", validateLoginForm);
  elements.loginForm
    .querySelector("#loginPassword")
    .addEventListener("input", validateLoginForm);
  elements.signupForm
    .querySelector("#signupName")
    .addEventListener("input", validateSignupForm);
  elements.signupForm
    .querySelector("#signupEmail")
    .addEventListener("input", validateSignupForm);
  elements.signupForm
    .querySelector("#signupPassword")
    .addEventListener("input", validateSignupForm);

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

const validateLoginForm = debounce(() => {
  const email = elements.loginForm.querySelector("#loginEmail");
  const password = elements.loginForm.querySelector("#loginPassword");
  const emailError = elements.loginForm.querySelector("#loginEmailError");
  const passwordError = elements.loginForm.querySelector("#loginPasswordError");
  let isValid = true;

  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    emailError.style.display = "block";
    isValid = false;
  } else {
    emailError.style.display = "none";
  }

  if (!password.value) {
    passwordError.style.display = "block";
    isValid = false;
  } else {
    passwordError.style.display = "none";
  }

  elements.loginBtn.disabled = !isValid;
}, 300);

const validateSignupForm = debounce(() => {
  const name = elements.signupForm.querySelector("#signupName");
  const email = elements.signupForm.querySelector("#signupEmail");
  const password = elements.signupForm.querySelector("#signupPassword");
  const nameError = elements.signupForm.querySelector("#signupNameError");
  const emailError = elements.signupForm.querySelector("#signupEmailError");
  const passwordError = elements.signupForm.querySelector(
    "#signupPasswordError"
  );
  let isValid = true;

  if (!name.value) {
    nameError.style.display = "block";
    isValid = false;
  } else {
    nameError.style.display = "none";
  }

  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    emailError.style.display = "block";
    isValid = false;
  } else {
    emailError.style.display = "none";
  }

  if (!password.value || password.value.length < 8) {
    passwordError.style.display = "block";
    isValid = false;
  } else {
    passwordError.style.display = "none";
  }

  elements.signupBtn.disabled = !isValid;
}, 300);

function sanitizeInput(input) {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

async function checkAuthStatus() {
  const token = localStorage.getItem("authToken");
  if (!token) {
    console.log("No token found, showing auth screen");
    showAuthScreen();
    return;
  }

  try {
    console.log("Verifying token with endpoint:", `${API_BASE}/auth/verify`);
    const response = await fetch(`${API_BASE}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    console.log("Auth status response:", data);

    if (!response.ok) {
      throw new Error(data.message || "Authentication failed");
    }

    currentUser = data.user;
    showChatScreen(data.user);
    loadChatHistory();
  } catch (error) {
    console.error("Auth check failed:", error.message);
    localStorage.removeItem("authToken");
    showAuthScreen();
    alert("Session expired. Please sign in again.");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  elements.loginBtn.disabled = true;
  elements.loginBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin" aria-label="Loading"></i> Signing In...';

  const formData = new FormData(e.target);
  const email = formData.get("email");
  const password = formData.get("password");
  const payload = { email, password };

  try {
    console.log("Login attempt:", { email, password: "****" });
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    console.log("Login response:", data);

    if (!response.ok) {
      throw new Error(data.message || "Login failed");
    }

    localStorage.setItem("authToken", data.token);
    currentUser = data.user;
    showChatScreen(data.user);
    setTimeout(() => loadChatHistory(), 100); // Slight delay to ensure UI transition
  } catch (error) {
    console.error("Login error:", error.message);
    alert(error.message || "Login failed. Please check your credentials.");
  } finally {
    elements.loginBtn.disabled = false;
    elements.loginBtn.innerHTML =
      '<i class="fas fa-sign-in-alt" style="margin-right: 8px;" aria-label="Sign in"></i> Sign In';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  elements.signupBtn.disabled = true;
  elements.signupBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin" aria-label="Loading"></i> Creating...';

  const formData = new FormData(e.target);
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const payload = { name, email, password };

  try {
    console.log("Signup attempt:", { name, email, password: "****" });
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    console.log("Signup response:", data);

    if (!response.ok) {
      throw new Error(data.message || "Signup failed");
    }

    localStorage.setItem("authToken", data.token);
    currentUser = data.user;
    showChatScreen(data.user);
    setTimeout(() => loadChatHistory(), 100);
  } catch (error) {
    console.error("Signup error:", error.message);
    alert(error.message || "Signup failed. Please try again.");
  } finally {
    elements.signupBtn.disabled = false;
    elements.signupBtn.innerHTML =
      '<i class="fas fa-user-plus" style="margin-right: 8px;" aria-label="Create account"></i> Create Account';
  }
}

function switchToSignup() {
  elements.loginForm.style.display = "none";
  elements.signupForm.style.display = "block";
}

function switchToLogin() {
  elements.signupForm.style.display = "none";
  elements.loginForm.style.display = "block";
}

function showAuthScreen() {
  elements.authScreen.style.display = "flex";
  elements.chatScreen.style.display = "none";
}

function showChatScreen(user) {
  currentUser = user;
  elements.authScreen.style.display = "none";
  elements.chatScreen.style.display = "flex";
  elements.userName.textContent = sanitizeInput(user.name);
  elements.userInitials.textContent = sanitizeInput(
    user.name.charAt(0).toUpperCase()
  );
}

function logout() {
  localStorage.removeItem("authToken");
  currentUser = null;
  currentChatId = null;
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
  showAuthScreen();
}

function toggleSidebar() {
  elements.sidebar.classList.toggle("active");
}

async function loadChatHistory() {
  const token = localStorage.getItem("authToken");
  try {
    console.log("Fetching chat history from:", `${API_BASE}/chat`);
    const response = await fetch(`${API_BASE}/chat`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const chats = await response.json();
    console.log("Chat history response:", chats);

    if (!response.ok) {
      throw new Error(chats.message || "Failed to fetch chat history");
    }

    elements.chatHistory.innerHTML = "";
    chats.forEach((chat) => {
      const chatItem = document.createElement("div");
      chatItem.className = `chat-history-item ${
        chat._id === currentChatId ? "active" : ""
      }`;
      chatItem.setAttribute("tabindex", "0");
      const preview = chat.messages[0]?.content || "No messages yet";
      chatItem.innerHTML = `
                        <div class="chat-history-content">
                            <h4>${sanitizeInput(chat.title)}</h4>
                            <p>${sanitizeInput(
                              preview.length > 50
                                ? preview.substring(0, 47) + "..."
                                : preview
                            )}</p>
                        </div>
                        <button class="delete-chat-btn" data-chat-id="${
                          chat._id
                        }" aria-label="Delete chat">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `;
      chatItem.onclick = (e) => {
        if (!e.target.closest(".delete-chat-btn")) loadChat(chat._id);
      };
      chatItem.onkeydown = (e) => {
        if (e.key === "Enter" && !e.target.closest(".delete-chat-btn"))
          loadChat(chat._id);
      };
      const deleteBtn = chatItem.querySelector(".delete-chat-btn");
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deleteChat(chat._id, deleteBtn);
      };
      elements.chatHistory.appendChild(chatItem);
    });
  } catch (error) {
    console.error("Load chat history error:", error.message);
    alert("Failed to load chat history. Please try again or contact support.");
  }
}

async function loadChat(chatId) {
  currentChatId = chatId;
  const token = localStorage.getItem("authToken");
  try {
    console.log("Fetching chat from:", `${API_BASE}/chat/${chatId}`);
    const response = await fetch(`${API_BASE}/chat/${chatId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const chat = await response.json();
    console.log("Load chat response:", chat);

    if (!response.ok) {
      throw new Error(chat.message || "Failed to fetch chat");
    }

    elements.chatMessages.innerHTML = "";
    if (chat) {
      chat.messages.forEach((message) => {
        appendMessage(message.sender, message.content);
      });
    }
    scrollToBottom();
    elements.sidebar.classList.remove("active");
    loadChatHistory();
  } catch (error) {
    console.error("Load chat error:", error.message);
    alert("Failed to load chat. Please try again or contact support.");
  }
}

async function deleteChat(chatId, deleteBtn) {
  if (
    !confirm(
      "Are you sure you want to delete this chat? This action cannot be undone."
    )
  )
    return;
  deleteBtn.disabled = true;
  deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  const token = localStorage.getItem("authToken");

  try {
    console.log("Deleting chat with ID:", chatId);
    console.log("Delete endpoint:", `${API_BASE}/chat/${chatId}`);
    const response = await fetch(`${API_BASE}/chat/${chatId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    console.log("Delete response:", data);

    if (!response.ok) {
      throw new Error(data.message || "Failed to delete chat");
    }

    if (chatId === currentChatId) {
      currentChatId = null;
      elements.chatMessages.innerHTML = `
                        <div class="welcome-card">
                            <h2>Chat Deleted</h2>
                            <p>Start a new chat or select another from the history.</p>
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
    }
    loadChatHistory();
  } catch (error) {
    console.error("Delete chat error:", error.message);
    alert(
      "Failed to delete chat: " +
        error.message +
        ". Please check your connection or contact support."
    );
  } finally {
    deleteBtn.disabled = false;
    deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
  }
}

function appendMessage(sender, message) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  messageDiv.innerHTML = `
                <div class="message-content">
                    <div class="message-avatar">${
                      sender === "user"
                        ? sanitizeInput(
                            currentUser.name.charAt(0).toUpperCase()
                          )
                        : '<i class="fas fa-robot" aria-label="FinanceAI assistant"></i>'
                    }</div>
                    <div class="message-bubble">${sanitizeInput(message)}</div>
                </div>
            `;
  elements.chatMessages.appendChild(messageDiv);
  scrollToBottom();
}

function scrollToBottom() {
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

async function sendMessage() {
  const message = elements.messageInput.value.trim();
  if (!message) return;

  const welcomeCard = elements.chatMessages.querySelector(".welcome-card");
  const quickActions = elements.chatMessages.querySelector(".quick-actions");
  if (welcomeCard) welcomeCard.remove();
  if (quickActions) quickActions.remove();

  appendMessage("user", message);
  elements.messageInput.value = "";
  elements.messageInput.style.height = "48px";
  elements.sendBtn.disabled = true;
  elements.typingIndicator.style.display = "flex";

  try {
    const token = localStorage.getItem("authToken");
    const title = currentChatId
      ? ""
      : message.substring(0, 30) + (message.length > 30 ? "..." : "");
    console.log("Sending message to:", `${API_BASE}/chat`);
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ chatId: currentChatId, title, message }),
    });
    const chat = await response.json();
    console.log("Send message response:", chat);

    if (!response.ok) {
      throw new Error(chat.message || "Failed to send message");
    }

    currentChatId = chat._id;
    chat.messages.forEach((msg) => {
      if (msg.sender !== "user" || msg.content !== message) {
        appendMessage(msg.sender, msg.content);
      }
    });
    loadChatHistory();
  } catch (error) {
    console.error("Message error:", error.message);
    appendMessage("bot", "Sorry, something went wrong. Please try again.");
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
  currentChatId = null;
  elements.chatMessages.innerHTML = `
                <div class="welcome-card">
                    <h2>New Chat Started! ✨</h2>
                    <p>Ask me anything about your investments, SIPs, portfolio, or financial planning.</p>
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
  loadChatHistory();
}
