import os

filepath = 'Frontend/index.css'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

bg_decoration = '''
.bg-decoration {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  overflow: hidden;
  background: var(--bg-primary);
  pointer-events: none;
}

.bg-decoration::before, .bg-decoration::after {
  content: '';
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  filter: blur(120px);
  opacity: 0.6;
  animation: float 20s infinite ease-in-out alternate;
}

.bg-decoration::before {
  top: -100px;
  right: -100px;
  background: radial-gradient(circle, rgba(16, 163, 127, 0.4) 0%, rgba(255,255,255,0) 70%);
}

.bg-decoration::after {
  bottom: -200px;
  left: -200px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, rgba(255,255,255,0) 70%);
  animation-delay: -10s;
}

@keyframes float {
  0% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
  100% { transform: translate(0, 0) scale(1); }
}

.dark-mode .auth-container {
  background: rgba(30, 41, 59, 0.6) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
}
.dark-mode .bg-decoration::before {
  background: radial-gradient(circle, rgba(16, 163, 127, 0.2) 0%, rgba(255,255,255,0) 70%);
}
.dark-mode .bg-decoration::after {
  background: radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, rgba(255,255,255,0) 70%);
}
'''

if '.bg-decoration' not in text:
    text = bg_decoration + '\\n' + text

text = text.replace('.app-container {\\n  display: flex;', '.app-container {\\n  display: flex;\\n  position: relative;\\n  z-index: 1;\\n  background: transparent !important;')
text = text.replace('.auth-screen {\\n  display: flex;', '.auth-screen {\\n  display: flex;\\n  position: relative;\\n  z-index: 10;\\n  background: transparent !important;')
text = text.replace('.auth-container {\\n  background: var(--bg-primary);', '.auth-container {\\n  background: rgba(255, 255, 255, 0.7) !important;\\n  backdrop-filter: blur(20px);\\n  -webkit-backdrop-filter: blur(20px);\\n  border: 1px solid rgba(255, 255, 255, 0.4);')

text = text.replace('.landing-area {\\n  position: absolute;\\n  top: 0;\\n  left: 0;\\n  width: 100vw;\\n  height: 100vh;\\n  background-color: var(--bg-primary);', '.landing-area {\\n  position: absolute;\\n  top: 0;\\n  left: 0;\\n  width: 100vw;\\n  height: 100vh;\\n  background-color: transparent !important;\\n  z-index: 5;')
text = text.replace('.chat-screen {\\n  display: none;\\n  flex-direction: row;\\n  width: 100%;\\n  height: 100vh;\\n  height: 100dvh;\\n  background: var(--bg-primary);', '.chat-screen {\\n  display: none;\\n  flex-direction: row;\\n  width: 100%;\\n  height: 100vh;\\n  height: 100dvh;\\n  background: transparent !important;\\n  z-index: 5;')

text = text.replace('.finance-card {\\n  background: var(--bg-secondary);', '.finance-card {\\n  background: var(--bg-secondary);\\n  backdrop-filter: blur(12px);\\n  -webkit-backdrop-filter: blur(12px);\\n  border: 1px solid var(--border);')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print('Success')
