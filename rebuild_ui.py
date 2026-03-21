import os

css_path = 'Frontend/index.css'

with open(css_path, 'r', encoding='utf-8') as f:
    original_css = f.read()

# Find where the original CSS actually starts
reset_index = original_css.find('/* Reset and Base Styles */')
if reset_index != -1:
    clean_css = original_css[reset_index:]
else:
    clean_css = original_css  # fallback

# The new beautiful Aurora theme and premium chat input styling
aurora_css = """
:root {
  /* Aurora Glassmorphism Light Theme */
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-sidebar: rgba(255, 255, 255, 0.85);
  --bg-chat: transparent;
  --bg-user-message: rgba(59, 130, 246, 0.9);
  --bg-bot-message: rgba(255, 255, 255, 0.9);
  --bg-input: rgba(255, 255, 255, 0.85);
  --bg-hover: rgba(59, 130, 246, 0.05);

  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-sidebar: #1e293b;
  --text-muted: #94a3b8;

  --border: rgba(0, 0, 0, 0.05);
  --border-light: rgba(0, 0, 0, 0.03);
  --border-hover: rgba(59, 130, 246, 0.2);
  --border-focus: #3b82f6;

  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --secondary: #0f172a;
  
  --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow: 0 8px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);
  --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.08), 0 8px 16px rgba(0, 0, 0, 0.04);
  
  --rounded-lg: 16px;
  --rounded-xl: 24px;
  --font-family: 'Inter', -apple-system, sans-serif;
}

body {
  background: #f1f5f9;
  font-family: var(--font-family);
  color: var(--text-primary);
  margin: 0;
  -webkit-font-smoothing: antialiased;
}

/* Beautiful Animated Aurora Background */
.bg-decoration {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 0;
  background: radial-gradient(circle at 15% 50%, rgba(59, 130, 246, 0.1), transparent 50%),
              radial-gradient(circle at 85% 30%, rgba(236, 72, 153, 0.08), transparent 50%),
              radial-gradient(circle at 50% 80%, rgba(16, 185, 129, 0.08), transparent 50%);
  background-color: var(--bg-primary);
  animation: bg-shift 15s ease-in-out infinite alternate;
}

@keyframes bg-shift {
  0% { transform: scale(1.0); }
  100% { transform: scale(1.05); }
}

/* Base App Elements */
.app-container {
  position: relative;
  z-index: 1;
}

/* Sidebar overriding */
.sidebar {
  background: var(--bg-sidebar) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border-right: 1px solid var(--border) !important;
}

/* Premium Main Cards */
.finance-card, .welcome-card, .quick-action {
  background: rgba(255, 255, 255, 0.7) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--rounded-xl) !important;
  box-shadow: var(--shadow) !important;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.finance-card:hover, .quick-action:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg) !important;
  border-color: var(--border-hover) !important;
}

/* Overhauling the Send Message Box */
.chat-input-container {
  background: transparent !important;
  border: none !important;
  padding: 0 0 24px 0 !important;
}

.chat-input-wrapper {
  max-width: 850px;
  margin: 0 auto;
  padding: 0 16px;
}

.chat-input-box {
  background: rgba(255, 255, 255, 0.85) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(0,0,0,0.08) !important;
  border-radius: 28px !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0,0,0,0.03) !important;
  padding: 8px 16px 8px 24px !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  gap: 12px;
  transition: box-shadow 0.3s ease, border-color 0.3s ease;
}

.chat-input-box:focus-within {
  border-color: rgba(59, 130, 246, 0.4) !important;
  box-shadow: 0 16px 40px rgba(59, 130, 246, 0.12), 0 4px 12px rgba(0,0,0,0.04) !important;
}

.input-row-top { margin: 0 !important; flex: 1; }
.input-row-bottom { display: flex; align-items: center; justify-content: flex-end; margin: 0 !important; gap: 8px; }

.chat-input {
  background: transparent !important;
  border: none !important;
  color: var(--text-primary) !important;
  font-size: 1.05rem !important;
  line-height: 1.5 !important;
  padding: 12px 0 !important;
  max-height: 120px !important;
  resize: none !important;
  box-shadow: none !important;
}

.chat-input::placeholder {
  color: #94a3b8 !important;
  font-weight: 400;
}

.chat-input:focus {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
}

/* Floating beautiful send buttons */
.input-actions {
  display: flex;
  gap: 8px;
}

.send-btn, .voice-btn, .waves-btn {
  width: 44px !important;
  height: 44px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.2s ease !important;
  border: none !important;
  cursor: pointer;
}

.send-btn {
  background: linear-gradient(135deg, var(--primary), #2563eb) !important;
  color: white !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05) translateY(-2px) !important;
  box-shadow: 0 6px 16px rgba(59, 130, 246, 0.4) !important;
}

.send-btn:disabled {
  background: #e2e8f0 !important;
  color: #94a3b8 !important;
  box-shadow: none !important;
  transform: none !important;
}

.voice-btn, .waves-btn {
  background: #f1f5f9 !important;
  color: var(--text-secondary) !important;
}

.voice-btn:hover, .waves-btn:hover {
  background: #e2e8f0 !important;
  color: var(--primary) !important;
}

/* Messages */
.message-avatar {
  background: var(--primary) !important;
  color: white !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3) !important;
}

.user-message .message-content {
  background: linear-gradient(135deg, var(--primary), #2563eb) !important;
  color: white !important;
  border-radius: 20px 20px 4px 20px !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2) !important;
  border: none !important;
  font-size: 1rem !important;
}

.bot-message .message-content {
  background: var(--bg-bot-message) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid var(--border) !important;
  border-radius: 20px 20px 20px 4px !important;
  box-shadow: var(--shadow-sm) !important;
  color: var(--text-primary) !important;
  font-size: 1rem !important;
}

/* High contrast numbers for values */
.value, .positive, .credit { font-weight: 600 !important; color: #10b981 !important; }
.negative, .debit { font-weight: 600 !important; color: #ef4444 !important; }

/* Fixing Auth */
.auth-container {
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border-radius: 24px !important;
  border: 1px solid rgba(255,255,255,0.4) !important;
  box-shadow: var(--shadow-lg) !important;
}
"""

finalcss = aurora_css + "\\n\\n" + clean_css

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(finalcss)

print("UI Successfully rebuilt with Aurora theme and new send message box!")
