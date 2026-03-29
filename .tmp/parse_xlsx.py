
import json, openpyxl, sys
wb = openpyxl.load_workbook('/Users/tarique/projects/data-studio/.tmp/FederallyInsuredCreditUnions_2025q4.xlsx', read_only=True, data_only=True)
ws = wb.active
rows = []
for row in ws.iter_rows(values_only=True):
    rows.append(list(row))
wb.close()
json.dump(rows, sys.stdout)
