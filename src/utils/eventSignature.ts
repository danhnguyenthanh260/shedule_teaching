/**
 * Generate unique signature for calendar event to detect duplicates
 * Signature is based on: title, date, start time, location
 * Uses Web Crypto API (browser-compatible)
 * @param event The calendar event
 * @returns SHA-256 hash signature (Promise)
 */
export async function generateEventSignature(event: {
    title: string;
    start: string;
    location?: string;
}): Promise<string> {
    // Extract date and start time from ISO string (ignore end time for signature)
    const startDate = event.start.split('T')[0]; // YYYY-MM-DD
    const startTime = event.start.split('T')[1]?.substring(0, 5) || '00:00'; // HH:mm

    // Normalize data for consistent hashing
    const normalized = {
        title: (event.title || '').trim().toLowerCase(),
        date: startDate,
        time: startTime,
        location: (event.location || '').trim().toLowerCase()
    };

    // Create signature string
    const signatureString = `${normalized.title}|${normalized.date}|${normalized.time}|${normalized.location}`;

    // Use Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Return first 16 characters for compact signature
    return hashHex.substring(0, 16);
}

/**
 * Synchronous fallback using simple hash (for compatibility)
 * Not cryptographically secure, but sufficient for event deduplication
 */
export function generateEventSignatureSync(event: {
    title: string;
    start: string;
    location?: string;
}): string {
    const startDate = event.start.split('T')[0];
    const startTime = event.start.split('T')[1]?.substring(0, 5) || '00:00';

    const signatureString = `${(event.title || '').trim().toLowerCase()}|${startDate}|${startTime}|${(event.location || '').trim().toLowerCase()}`;

    // Simple string hash (djb2 algorithm)
    let hash = 5381;
    for (let i = 0; i < signatureString.length; i++) {
        hash = ((hash << 5) + hash) + signatureString.charCodeAt(i);
    }

    // Convert to hex string
    return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
}
