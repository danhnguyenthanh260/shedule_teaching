/**
 * Admin configuration and role management
 */

// Hard-coded admin emails
export const ADMIN_EMAILS = [
    'duongkien.090905@gmail.com',
    'ngohoangtruongdat2@gmail.com'
];

/**
 * Check if user is admin
 */
export const isAdmin = (email: string | null | undefined): boolean => {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
};

/**
 * Get user role
 */
export const getUserRole = (email: string | null | undefined): 'admin' | 'lecturer' => {
    return isAdmin(email) ? 'admin' : 'lecturer';
};

/**
 * ⚠️ SECURITY WARNING:
 * This client-side check is for UI convenience only.
 * DO NOT rely on this for backend security.
 * 
 * TODO: Migrate to Firebase Custom Claims for secure role management:
 * 1. Set custom claim 'admin' on the user object in Firebase Auth.
 * 2. Verify request.auth.token.admin === true in Firestore Rules.
 * 3. Verify decodedToken.admin === true in Apps Script / Backend.
 */
