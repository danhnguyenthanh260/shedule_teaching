import { database } from './firebase';
import { ref, onValue } from 'firebase/database';

/**
 * Super Admin Email - Permanent primary access
 */
export const SUPER_ADMIN_EMAILS = ['ngohoangtruongdat2@gmail.com', 'longt5@fpt.edu.vn'];

/**
 * Static fallback admins (initial set)
 */
let dynamicAdminEmails: string[] = [];

/**
 * Updates the dynamic admin whitelist from external sources (e.g. Firebase)
 * @param emails List of admin emails
 */
export const setDynamicAdmins = (emails: string[]) => {
    dynamicAdminEmails = emails.map(e => e.trim().toLowerCase());
    console.log('🛡️ Admin Config Updated:', dynamicAdminEmails.length, 'admins');
};

/**
 * Checks if a given email address belongs to an administrator
 * @param email The email address to check
 * @returns true if the email is an admin, false otherwise
 */
export const isAdmin = (email: string | null | undefined): boolean => {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    
    // 1. Check Super Admins (Hardcoded fallback)
    if (SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail)) return true;

    // 2. Check Dynamic Whitelist
    const result = dynamicAdminEmails.includes(cleanEmail);
    
    console.log(`🛡️ Admin check for "${cleanEmail}": ${result}`);
    return result;
};

/**
 * Check if the user is the Super Admin
 */
export const isSuperAdmin = (email: string | null | undefined): boolean => {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    return SUPER_ADMIN_EMAILS.some(e => e.toLowerCase() === cleanEmail);
};