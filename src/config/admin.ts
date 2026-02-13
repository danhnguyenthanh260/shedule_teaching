import { database } from './firebase';
import { ref, onValue } from 'firebase/database';

/**
 * Super Admin Email - Permanent primary access
 */
export const SUPER_ADMIN_EMAIL = 'ngohoangtruongdat2@gmail.com';

/**
 * Static fallback admins (initial set)
 */
let dynamicAdminEmails: string[] = [];
// This is now managed by FirebaseContext to ensure React re-renders

/**
 * Checks if a given email address belongs to an administrator
 * @param email The email address to check
 * @returns true if the email is an admin, false otherwise
 */
export const isAdmin = (email: string | null | undefined): boolean => {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    
    // 1. Check Super Admin (Hardcoded fallback)
    if (cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase()) return true;

    // 2. Check Dynamic Whitelist
    const result = dynamicAdminEmails.includes(cleanEmail);
    
    console.log(`🛡️ Admin check for "${cleanEmail}": ${result}`);
    return result;
};

/**
 * Check if the user is the Super Admin
 */
export const isSuperAdmin = (email: string | null | undefined): boolean => {
    return email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
};