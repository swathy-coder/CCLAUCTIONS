// CSV import/export utility (robust escaping + BOM for Excel compatibility)

export interface CSVColumn<T extends Record<string, unknown>> {
  key: keyof T | string; // property name in row object
  header: string;        // header label
  transform?: (value: unknown, row: T, index: number) => string | number; // optional transform
}

// Escape a single CSV field per RFC 4180.
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // Normalize line breaks
  str = str.replace(/\r\n|\r|\n/g, '\n');
  if (/[",\n]/.test(str)) {
    str = '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Generic CSV export with explicit column definition.
 * Adds UTF-8 BOM so Excel opens it without mojibake.
 */
export function exportToCSV<T extends Record<string, unknown>>(filename: string, rows: T[], columns?: CSVColumn<T>[]) {
  if (!rows || rows.length === 0) return;
  let headers: string[];
  let serializeRow: (row: T, index: number) => string[];

  if (columns && columns.length) {
    headers = columns.map(c => c.header);
    serializeRow = (row, index) => columns.map(col => {
      const raw = typeof col.transform === 'function' ? col.transform((row as Record<string, unknown>)[col.key as string], row, index) : (row as Record<string, unknown>)[col.key as string];
      return escapeField(raw);
    });
  } else {
    // Fallback: derive from first row keys (existing behaviour backwards-compatible)
    const keys = Object.keys(rows[0] as Record<string, unknown>);
    headers = keys;
    serializeRow = (row: T) => keys.map(k => escapeField((row as Record<string, unknown>)[k]));
  }

  const lines = [headers.map(escapeField).join(',')];
  rows.forEach((row, i) => lines.push(serializeRow(row, i).join(',')));
  const csvString = '\uFEFF' + lines.join('\n'); // Add BOM

  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
  }, 0);
}

// CSV import that properly handles quoted fields with embedded newlines (Alt+Enter in Excel)
export function importFromCSV(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = (reader.result as string) || '';
      
      // Parse CSV properly handling quoted fields with newlines
      const parseCSV = (csvText: string): string[][] => {
        const rows: string[][] = [];
        let currentRow: string[] = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let i = 0; i < csvText.length; i++) {
          const char = csvText[i];
          const nextChar = csvText[i + 1];
          
          if (inQuotes) {
            if (char === '"') {
              if (nextChar === '"') {
                // Escaped quote
                currentField += '"';
                i++; // Skip next quote
              } else {
                // End of quoted field
                inQuotes = false;
              }
            } else {
              // Any character inside quotes (including newlines)
              currentField += char;
            }
          } else {
            if (char === '"') {
              // Start of quoted field
              inQuotes = true;
            } else if (char === ',') {
              // Field separator
              currentRow.push(currentField);
              currentField = '';
            } else if (char === '\n' || char === '\r') {
              // Row separator (only when not inside quotes)
              if (char === '\r' && nextChar === '\n') {
                i++; // Skip \n in \r\n
              }
              if (currentField || currentRow.length > 0) {
                currentRow.push(currentField);
                if (currentRow.some(f => f.trim().length > 0)) {
                  rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
              }
            } else {
              currentField += char;
            }
          }
        }
        
        // Handle last field and row
        if (currentField || currentRow.length > 0) {
          currentRow.push(currentField);
          if (currentRow.some(f => f.trim().length > 0)) {
            rows.push(currentRow);
          }
        }
        
        return rows;
      };
      
      const rows = parseCSV(text);
      if (rows.length === 0) return resolve([]);
      
      const headers = rows[0].map(h => h.trim());
      const data = rows.slice(1).map(row => {
        return headers.reduce<Record<string, string>>((acc, header, idx) => {
          acc[header] = (row[idx] || '').trim();
          return acc;
        }, {} as Record<string, string>);
      });
      
      resolve(data);
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// Helper for quickly exporting simple arrays with inferred headers (legacy behaviour wrapper)
export function quickCSV<T extends Record<string, unknown>>(filename: string, rows: T[]) {
  exportToCSV<T>(filename, rows);
}
