import re
import os

filepath = 'services/chart_service.py'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

currency_logic = 'currency = "₹" if symbol.upper().endswith(".NS") or symbol.upper().endswith(".BO") else "$"'

# 1. Add currency variable
text = text.replace(
    'hist = get_hybrid_history(symbol, period)',
    f'hist = get_hybrid_history(symbol, period)\n            {currency_logic}'
)

# 2. Fix Price labels
text = text.replace("'Price (₹)'", "f'Price ({currency})'")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print('Success')
