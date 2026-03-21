import re
import os

css_path = 'Frontend/index.css'

with open(css_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Locate where the keyframes begin so we don't delete them!
# We know the keyframes start at /* ChatGPT-style animations */
start_of_keyframes = text.find('/* ChatGPT-style animations */')

if start_of_keyframes != -1:
    clean_css = text[start_of_keyframes:]
else:
    # Fallback to Reset if keyframes missing
    reset_index = text.find('/* Reset and Base Styles */')
    if reset_index != -1:
        clean_css = text[reset_index:]
    else:
        clean_css = text

crystal_theme = """
:root {
  /* Ultra-Premium Glass UI - Professional Light Pattern */
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-sidebar: rgba(255, 255, 255, 0.9);
  --bg-chat: transparent;
  --bg-user-message: rgba(59, 130, 246, 0.95);
  --bg-bot-message: rgba(255, 255, 255, 0.95);
  --bg-input: rgba(255, 255, 255, 0.9);
  --bg-hover: rgba(59, 130, 246, 0.05);

  --text-primary: #0f172a;
  --text-secondary: #334155;
  --text-sidebar: #1e293b;
  --text-muted: #64748b;

  --border: rgba(0, 0, 0, 0.06);
  --border-light: rgba(0, 0, 0, 0.03);
  --border-hover: rgba(59, 130, 246, 0.3);
  --border-focus: #3b82f6;

  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --primary-light: #eff6ff;
  --secondary: #0f172a;
  
  --success: #10b981;
  --error: #ef4444;
  --warning: #f59e0b;

  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.02);
  --shadow: 0 4px 12px rgba(0, 0, 0, 0.04), 0 1px 4px rgba(0, 0, 0, 0.02);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.03);
  
  --rounded-lg: 12px;
  --rounded-xl: 20px;
  --font-family: 'Inter', -apple-system, blinkmacsystemfont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

body {
  background: #f1f5f9;
  font-family: var(--font-family);
  color: var(--text-primary);
  margin: 0;
  -webkit-font-smoothing: antialiased;
}

.bg-decoration {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 0;
  background: radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.06), transparent 50%),
              radial-gradient(circle at 100% 100%, rgba(16, 185, 129, 0.04), transparent 50%);
  background-color: var(--bg-primary);
}

.finance-card, .welcome-card, .quick-action {
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--rounded-xl) !important;
  box-shadow: var(--shadow) !important;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.finance-card:hover, .quick-action:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg) !important;
  border-color: var(--border-hover) !important;
}

/* Beautiful Sidebar */
.sidebar {
  background: var(--bg-sidebar) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border-right: 1px solid var(--border) !important;
  box-shadow: 1px 0 12px rgba(0,0,0,0.02) !important;
}

/* Perfecting the Send Message Box */
.chat-input-container {
  background: transparent !important;
  border: none !important;
  padding: 0 0 24px 0 !important;
}

.chat-input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 16px;
}

.chat-input-box {
  background: rgba(255, 255, 255, 0.95) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(0,0,0,0.08) !important;
  border-radius: 24px !important;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0,0,0,0.03) !important;
  padding: 12px 18px !important;
  display: flex !important;
  flex-direction: column !important; /* Fixes layout break */
  gap: 8px;
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

.chat-input-box:focus-within {
  border-color: rgba(59, 130, 246, 0.4) !important;
  box-shadow: 0 16px 32px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(0,0,0,0.04) !important;
}

.input-row-top { 
  margin: 0 !important; 
  width: 100%; 
}

.input-row-bottom { 
  display: flex !important; 
  justify-content: space-between !important; 
  align-items: center !important; 
  width: 100%; 
}

.input-actions {
  display: flex !important;
  align-items: center !important;
  gap: 8px;
}

.chat-input {
  background: transparent !important;
  border: none !important;
  color: var(--text-primary) !important;
  font-size: 1.05rem !important;
  line-height: 1.5 !important;
  padding: 4px 4px !important;
  max-height: 120px !important;
  width: 100% !important;
  resize: none !important;
  box-shadow: none !important;
}

.chat-input::placeholder {
  color: #94a3b8 !important;
  font-weight: 400;
}

.chat-input:focus {
  outline: none !important;
}

/* Polished Buttons */
.send-btn, .voice-btn, .waves-btn {
  width: 38px !important;
  height: 38px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
  border: none !important;
  cursor: pointer;
}

.send-btn {
  background: var(--primary) !important;
  color: white !important;
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.2) !important;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-2px) !important;
  box-shadow: 0 6px 14px rgba(59, 130, 246, 0.3) !important;
  background: var(--primary-hover) !important;
}

.send-btn:disabled {
  background: #f1f5f9 !important;
  color: #cbd5e1 !important;
  box-shadow: none !important;
  pointer-events: none !important;
}

.voice-btn, .waves-btn {
  background: transparent !important;
  color: var(--text-secondary) !important;
}

.voice-btn:hover, .waves-btn:hover {
  background: var(--primary-light) !important;
  color: var(--primary) !important;
}

/* Beautiful Gradient Chat Bubbles */
.message-avatar {
  background: var(--primary) !important;
  color: white !important;
}

.user-message .message-content {
  background: linear-gradient(135deg, var(--primary), #2563eb) !important;
  color: white !important;
  border-radius: 20px 20px 4px 20px !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2) !important;
  border: none !important;
}

.bot-message .message-content {
  background: var(--bg-bot-message) !important;
  border: 1px solid var(--border) !important;
  border-radius: 20px 20px 20px 4px !important;
  box-shadow: var(--shadow-sm) !important;
  color: var(--text-primary) !important;
  padding: 16px 20px !important;
}

/* Clean Typography Values */
.value, .positive, .credit { font-weight: 600 !important; color: #10b981 !important; }
.negative, .debit { font-weight: 600 !important; color: #ef4444 !important; }

/* Fixing Auth Container Layout if needed */
.auth-container {
  background: rgba(255, 255, 255, 0.95) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border-radius: 24px !important;
  border: 1px solid var(--border) !important;
  box-shadow: var(--shadow-lg) !important;
}
"""

finalcss = crystal_theme + "\\n\\n" + clean_css

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(finalcss)

print("Crystal UI Successfully rebuilt. The chat box is beautiful and functional.")
