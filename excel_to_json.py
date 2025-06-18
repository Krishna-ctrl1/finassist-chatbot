import pandas as pd
import json

# Simple conversion - no arguments needed
excel_file = "FAQ 2.0.xlsx"
output_file = "faq.json"

print(f"Converting {excel_file} to JSON...")

# Read Excel file
df = pd.read_excel(excel_file)

print(f"Found {len(df)} rows and {len(df.columns)} columns")
print(f"Columns: {list(df.columns)}")

# Convert to list of dictionaries
records = df.to_dict('records')

# Clean up NaN values
clean_records = []
for record in records:
    clean_record = {}
    for key, value in record.items():
        if pd.notna(value):
            clean_record[key] = value
    if clean_record:
        clean_records.append(clean_record)

# Save JSON
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(clean_records, f, indent=2, ensure_ascii=False)

# Save JavaScript version
js_file = "faq.js"
with open(js_file, 'w', encoding='utf-8') as f:
    f.write("const FAQ_KB = ")
    json.dump(clean_records, f, indent=2, ensure_ascii=False)
    f.write(";\n")

print(f"✅ JSON saved to: {output_file}")
print(f"✅ JavaScript saved to: {js_file}")
print(f"✅ Converted {len(clean_records)} records")

# Show first record as sample
if clean_records:
    print("\nSample record:")
    print(json.dumps(clean_records[0], indent=2))