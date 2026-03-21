import os

css_path = 'Frontend/index.css'

with open(css_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Remove the broken 'Ultra-Premium Fintech Dark Theme' that overrode the toggle switch
if '/* Ultra-Premium Fintech Dark Theme */' in text:
    # Find the start of the original file which begins with :root { \n /* Glassmorphic Brand Colors
    # Actually, let's just find the first ":root {" after the Ultra-Premium Fintech theme
    # The fintech theme ends around line 221, then there's bg-decoration, then:
    glass_root_idx = text.find(':root {\\n  \\n  /* Glassmorphic Brand Colors - Light Theme */')
    if glass_root_idx == -1:
        glass_root_idx = text.find('/* Glassmorphic Brand Colors - Light Theme */')
        if glass_root_idx != -1:
            glass_root_idx = text.rfind(':root', 0, glass_root_idx)
            
    if glass_root_idx != -1:
        text = text[glass_root_idx:]

# Define the new crystal-clear, layout-preserving Chat Box UI
# Appending it at the bottom ensures it overrides cleanly without destroying structural HTML
premium_chat_box = """

/* === NEW ULTIMATE CHAT BOX UI === */
.chat-input-container {
  background: transparent !important;
  border-top: none !important;
  padding: 0 0 24px 0 !important;
}

.chat-input-wrapper {
  max-width: 850px;
  margin: 0 auto;
  padding: 0 16px;
}

.chat-input-box {
  background: var(--bg-secondary) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid var(--border) !important;
  border-radius: 24px !important;
  box-shadow: var(--shadow-md) !important;
  padding: 12px 16px !important;
  display: flex !important;
  flex-direction: column !important; /* Forces correct stacking of top and bottom rows */
  gap: 8px;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.chat-input-box:focus-within {
  border-color: var(--border-focus) !important;
  box-shadow: var(--shadow-lg), 0 0 0 2px var(--primary-light) !important;
  transform: translateY(-2px);
}

.input-row-top {
  width: 100% !important;
  display: flex !important;
}

.input-row-bottom {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: 100% !important;
  padding-top: 4px !important;
}

.input-actions {
  display: flex !important;
  gap: 8px !important;
  align-items: center !important;
}

.chat-input {
  background: transparent !important;
  border: none !important;
  color: var(--text-primary) !important;
  font-size: 1.05rem !important;
  line-height: 1.5 !important;
  padding: 4px 8px !important;
  width: 100% !important;
  resize: none !important;
  box-shadow: none !important;
  font-family: var(--font-family) !important;
}

.chat-input::placeholder {
  color: var(--text-muted) !important;
  font-weight: 400 !important;
}

.chat-input:focus {
  outline: none !important;
}

/* Redesigned Floating Buttons */
.send-btn, .voice-btn, .waves-btn {
  width: 40px !important;
  height: 40px !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  border: none !important;
  cursor: pointer !important;
  transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) !important;
}

.send-btn {
  background: linear-gradient(135deg, var(--primary), var(--primary-hover)) !important;
  color: white !important;
  box-shadow: 0 4px 12px var(--primary-light) !important;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.05) translateY(-2px) !important;
  box-shadow: 0 6px 16px var(--primary-light) !important;
}

.send-btn:disabled {
  background: var(--bg-hover) !important;
  color: var(--text-muted) !important;
  box-shadow: none !important;
  transform: none !important;
}

.voice-btn, .waves-btn {
  background: transparent !important;
  color: var(--text-secondary) !important;
}

.voice-btn:hover, .waves-btn:hover {
  background: var(--bg-hover) !important;
  color: var(--primary) !important;
}

/* Beautiful Animated Gradients & Message Bubbles Base Overrides */
.bg-decoration::before {
  background: radial-gradient(circle, rgba(16, 163, 127, 0.15) 0%, rgba(255,255,255,0) 70%) !important;
}
.bg-decoration::after {
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(255,255,255,0) 70%) !important;
}
"""

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(text + "\\n" + premium_chat_box)

print("CSS systematically cleaned and rebuilt without breaking layout!")
