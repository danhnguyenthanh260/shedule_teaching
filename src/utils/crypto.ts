/**
 * Encryption Utility - Protect sensitive localStorage data
 * Uses Web Crypto API + PBKDF2 for browser-native encryption
 * Per-user key derived from Firebase UID with random salt
 */

/**
 * Generate random salt for PBKDF2
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Derive encryption key from user UID using PBKDF2
 * @param uid Firebase user UID
 * @param salt Random salt (16 bytes)
 */
async function deriveKeyFromUID(uid: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  
  // Step 1: Import UID as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(uid),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Step 2: Derive key using PBKDF2 with salt
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer, // ✅ Random salt (BufferSource)
      iterations: 100000, // ✅ Strong iterations
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt sensitive data using PBKDF2 + AES-GCM
 * @param plaintext Data to encrypt
 * @param uid Firebase user UID for key derivation
 * @returns Base64: salt(16) + iv(12) + ciphertext + authTag(16)
 */
export async function encryptData(plaintext: string, uid: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    // ✅ Generate RANDOM salt for PBKDF2
    const salt = generateSalt();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // ✅ Derive key with salt (PBKDF2 protected)
    const key = await deriveKeyFromUID(uid, salt);
    
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    // ✅ Store salt + iv + ciphertext
    const combined = new Uint8Array(
      salt.length + iv.length + encryptedBuffer.byteLength
    );
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw new Error('Failed to encrypt sensitive data');
  }
}

/**
 * Decrypt sensitive data using PBKDF2 + AES-GCM
 * @param ciphertext Encrypted data (base64: salt + iv + ciphertext + authTag)
 * @param uid Firebase user UID for key derivation
 */
export async function decryptData(ciphertext: string, uid: string): Promise<string> {
  try {
    // Decode from base64
    const combined = new Uint8Array(
      atob(ciphertext).split('').map(c => c.charCodeAt(0))
    );
    
    // ✅ Extract salt (first 16 bytes)
    const salt = combined.slice(0, 16);
    // ✅ Extract IV (next 12 bytes)
    const iv = combined.slice(16, 28);
    // ✅ Extract ciphertext + authTag (remaining)
    const encryptedData = combined.slice(28);
    
    // ✅ Re-derive key with SAME salt
    const key = await deriveKeyFromUID(uid, salt);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('❌ Decryption failed:', error);
    throw new Error('Failed to decrypt sensitive data');
  }
}

/**
 * Safely store encrypted data in localStorage
 * @param key Storage key
 * @param value Data to encrypt and store
 * @param uid User UID
 */
export async function secureSetItem(key: string, value: string, uid: string): Promise<void> {
  try {
    const encrypted = await encryptData(value, uid);
    localStorage.setItem(key, encrypted);
  } catch (error) {
    console.error('❌ Failed to securely store item:', error);
    throw error;
  }
}

/**
 * Safely retrieve encrypted data from localStorage
 * @param key Storage key
 * @param uid User UID
 */
export async function secureGetItem(key: string, uid: string): Promise<string | null> {
  try {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    
    return await decryptData(encrypted, uid);
  } catch (error) {
    console.error('❌ Failed to retrieve secure item:', error);
    return null;
  }
}

/**
 * Safely remove encrypted data from localStorage
 * @param key Storage key
 */
export function secureRemoveItem(key: string): void {
  localStorage.removeItem(key);
}

/**
 * Clear all encrypted data
 */
export function secureClearAll(): void {
  // List of sensitive keys to clear
  const sensitiveKeys = [
    'accessToken',
    'refreshToken',
    'tokenExpiry',
    'sheetMeta',
    'columnMap',
    'allRows',
    'fullHeaders',
    'fullDetailHeaders',
    'titleRow',
    'fullRows',
    'selectedIds',
    'google_access_token'
  ];
  
  sensitiveKeys.forEach(key => secureRemoveItem(key));
}

export default {
  encryptData,
  decryptData,
  secureSetItem,
  secureGetItem,
  secureRemoveItem,
  secureClearAll
};
