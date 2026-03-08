import re
import os

filepath = 'Frontend/index.css'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# The new beautiful CSS to inject
premium_css = """
:root {
  /* Ultra-Premium Fintech Dark Theme */
  --bg-primary: #09090b; /* Zinc 950 */
  --bg-secondary: rgba(24, 24, 27, 0.5); /* Zinc 900 Glass */
  --bg-sidebar: rgba(24, 24, 27, 0.7);
  --bg-chat: transparent;
  --bg-user-message: rgba(59, 130, 246, 0.15); /* Blue tinted */
  --bg-bot-message: rgba(39, 39, 42, 0.5);
  --bg-input: rgba(39, 39, 42, 0.6);
  --bg-hover: rgba(255, 255, 255, 0.05);
  --bg-pill: rgba(39, 39, 42, 0.8);
  --bg-pill-hover: rgba(63, 63, 70, 1);

  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-sidebar: #f8fafc;
  --text-muted: #64748b;
  --text-light: #cbd5e1;

  --border: rgba(255, 255, 255, 0.08);
  --border-light: rgba(255, 255, 255, 0.03);
  --border-hover: rgba(59, 130, 246, 0.3);
  --border-focus: #3b82f6;

  --primary: #3b82f6; /* Blue 500 */
  --primary-hover: #60a5fa;
  --primary-light: rgba(59, 130, 246, 0.2);
  --secondary: #18181b;
  --secondary-hover: #27272a;
  --secondary-light: #3f3f46;
  
  --success: #10b981; /* Emerald */
  --error: #ef4444; /* Red */
  --warning: #f59e0b; /* Amber */

  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.5);
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3);
  
  --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.15);
  
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;

  --rounded-sm: 0.375rem;
  --rounded: 0.5rem;
  --rounded-lg: 0.75rem;
  --rounded-xl: 1rem;
  --rounded-2xl: 1.5rem;
  --rounded-full: 9999px;

  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-mono: 'Roboto Mono', ui-monospace, SFMono-Regular, monospace;
}

body {
  background: var(--bg-primary) !important;
  color: var(--text-primary) !important;
  font-family: var(--font-family) !important;
  transition: all 0.3s ease;
}

.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  overflow: hidden;
  background: #09090b !important;
  pointer-events: none;
}

.bg-decoration::before, .bg-decoration::after {
  content: '';
  position: absolute;
  width: 80vw;
  height: 80vh;
  border-radius: 50%;
  filter: blur(150px);
  opacity: 0.4;
  animation: float 25s infinite ease-in-out alternate;
}

.bg-decoration::before {
  top: -20vh;
  right: -10vw;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(0,0,0,0) 60%) !important;
}

.bg-decoration::after {
  bottom: -20vh;
  left: -10vw;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.1) 0%, rgba(0,0,0,0) 60%) !important;
  animation-delay: -12s;
}

@keyframes float {
  0% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(2vw, -2vh) scale(1.05); }
  100% { transform: translate(-2vw, 2vh) scale(0.95); }
}

.app-container {
  display: flex;
  position: relative;
  z-index: 1;
  background: transparent !important;
}

.auth-container {
  background: rgba(24, 24, 27, 0.7) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 20px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05) !important;
}

.finance-card, .sidebar, .chat-input-box, .welcome-card, .quick-action {
  background: rgba(24, 24, 27, 0.6) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.02) !important;
  border-radius: var(--rounded-xl);
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.finance-card:hover, .quick-action:hover {
  transform: translateY(-2px);
  border-color: rgba(255,255,255,0.15) !important;
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.1), 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
  background: rgba(39, 39, 42, 0.7) !important;
}

.auth-btn, .action-btn {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  border: none !important;
  color: white !important;
  text-shadow: 0 1px 2px rgba(0,0,0,0.2);
  box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255,255,255,0.2) !important;
}

.auth-btn:hover, .action-btn:hover {
  background: linear-gradient(135deg, #60a5fa, #3b82f6) !important;
  transform: translateY(-1px);
  box-shadow: 0 6px 15px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2) !important;
}

.form-input, .chat-input {
  background: rgba(0, 0, 0, 0.2) !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  color: #f8fafc !important;
}

.form-input:focus, .chat-input:focus {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2) !important;
  background: rgba(0, 0, 0, 0.3) !important;
}

h1, h2, h3, h4, h5, h6, .card-header h3, .landing-title, .auth-title {
  color: #f8fafc !important;
  letter-spacing: -0.02em;
  font-weight: 600;
}

.value {
  background: linear-gradient(135deg, #f8fafc, #94a3b8) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  font-weight: 700;
}

.positive, .credit { color: #10b981 !important; }
.negative, .debit { color: #ef4444 !important; }

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
"""

# Since index.css is huge and was already modified, we just append this at the top with !important to override old styles
if 'Ultra-Premium Fintech Dark Theme' not in text:
    final_text = premium_css + '\\n' + text
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(final_text)

print('Success')
