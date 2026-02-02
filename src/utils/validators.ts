/**
 * Input Validation Utilities
 * Validate user inputs to prevent injection and XSS attacks
 */

/**
 * Validate Google Sheets URL and verify accessibility via API
 * @param url Sheet URL to validate
 * @param accessToken Optional Google OAuth access token for deep verification
 * @returns Validation result with spreadsheet ID and metadata
 */
export async function validateGoogleSheetUrl(
  url: string,
  accessToken?: string
): Promise<{
  valid: boolean;
  spreadsheetId?: string;
  error?: string;
  metadata?: {
    title?: string;
    rowCount?: number;
  };
}> {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  try {
    const urlObj = new URL(url);
    
    // Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return { valid: false, error: 'Sheet URL must use HTTPS' };
    }
    
    // Only allow Google Sheets domains
    if (!urlObj.hostname.includes('docs.google.com')) {
      return { valid: false, error: 'Sheet URL must be from docs.google.com' };
    }
    
    // Extract spreadsheet ID
    const spreadsheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!spreadsheetMatch || !spreadsheetMatch[1]) {
      return { valid: false, error: 'Invalid spreadsheet ID in URL' };
    }
    
    const spreadsheetId = spreadsheetMatch[1];
    
    // Validate spreadsheet ID format
    if (!/^[a-zA-Z0-9-_]+$/.test(spreadsheetId)) {
      return { valid: false, error: 'Spreadsheet ID contains invalid characters' };
    }
    
    // Step 2: ✅ If access token provided, verify sheet via Google Sheets API
    if (accessToken) {
      try {
        const response = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          }
        );
        
        if (response.status === 404) {
          return { valid: false, error: 'Sheet not found (deleted or inaccessible)' };
        }
        
        if (response.status === 403) {
          return { valid: false, error: 'No permission to access this sheet' };
        }
        
        if (!response.ok) {
          return { valid: false, error: `API error: ${response.statusText}` };
        }
        
        const data = await response.json();
        
        // ✅ Validate sheet size (prevent DOS via massive sheets)
        const firstSheet = data.sheets?.[0];
        const rowCount = firstSheet?.properties?.gridProperties?.rowCount || 0;
        
        if (rowCount > 100000) {
          return {
            valid: false,
            error: `Sheet too large (${rowCount} rows, max 100k allowed)`
          };
        }
        
        return {
          valid: true,
          spreadsheetId,
          metadata: {
            title: data.properties?.title,
            rowCount
          }
        };
      } catch (apiError) {
        console.error('❌ API verification failed:', apiError);
        return {
          valid: false,
          error: 'Failed to verify sheet with Google Sheets API'
        };
      }
    }
    
    // Format validation only (no API access)
    return {
      valid: true,
      spreadsheetId,
      error: 'Warning: Cannot verify sheet accessibility without access token'
    };
  } catch (error) {
    console.warn('❌ URL validation error:', error);
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Extract spreadsheet ID from URL
 * @param url Sheet URL
 * @returns Spreadsheet ID or null if invalid
 */
export function extractSpreadsheetId(url: string): string | null {
  if (!validateGoogleSheetUrl(url)) return null;
  
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

/**
 * Sanitize user input to prevent XSS
 * @param input User input
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  // Remove potentially dangerous characters/patterns
  return input
    .replace(/[<>\"']/g, '') // Remove HTML tags and quotes
    .trim();
}

/**
 * Validate column mapping data with bounds checking
 * @param mapping Column mapping object { date: 0, time: 1, person: 2, task: 3 }
 * @param maxColumns Maximum column count in the sheet
 * @returns Validation result with error details
 */
export function validateColumnMapping(
  mapping: Record<string, any>,
  maxColumns?: number
): {
  valid: boolean;
  error?: string;
} {
  if (!mapping || typeof mapping !== 'object') {
    return { valid: false, error: 'Mapping must be a non-null object' };
  }
  
  // Check required fields
  const requiredFields = ['date', 'time', 'person', 'task'];
  for (const field of requiredFields) {
    if (!(field in mapping)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
    
    const index = mapping[field];
    
    // ✅ Validate index is a number
    if (typeof index !== 'number' && typeof index !== 'string') {
      return { valid: false, error: `Invalid type for ${field}: must be number or string` };
    }
    
    const colIndex = typeof index === 'string' ? parseInt(index) : index;
    
    // ✅ Validate bounds (0-based indexing)
    if (!Number.isInteger(colIndex) || colIndex < 0) {
      return { valid: false, error: `${field} index must be non-negative integer` };
    }
    
    if (maxColumns && colIndex >= maxColumns) {
      return {
        valid: false,
        error: `${field} index (${colIndex}) exceeds sheet column count (${maxColumns})`
      };
    }
  }
  
  // ✅ Check for duplicates
  const indices = Object.values(mapping).map(v => typeof v === 'string' ? parseInt(v) : v);
  const uniqueIndices = new Set(indices);
  if (uniqueIndices.size !== requiredFields.length) {
    return {
      valid: false,
      error: 'Column indices must be unique (no duplicates allowed)'
    };
  }
  
  return { valid: true };
}

export default {
  validateGoogleSheetUrl,
  extractSpreadsheetId,
  sanitizeInput,
  validateColumnMapping
};
