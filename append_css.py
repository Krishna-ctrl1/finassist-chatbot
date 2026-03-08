with open('Frontend/index.css', 'a', encoding='utf-8') as f:
    f.write(r'''
.auth-screen {
  justify-content: center !important;
  align-items: center !important;
}
.sidebar-brand-text {
  background: linear-gradient(135deg, var(--primary), #2563eb) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  font-weight: 800 !important;
}
.landing-title {
  font-weight: 800 !important;
  background: linear-gradient(135deg, #f8fafc, #cbd5e1) !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
}
''')
