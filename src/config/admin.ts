/**
 * Configuration for administrator emails
 * Add admin emails to this list to grant them access to the Admin Dashboard
 */
export const ADMIN_EMAILS = [
    'danhnguyenthanh260@gmail.com', // Primary Admin
    'thanhnd26@fe.edu.vn',           // Organization Admin
    'admin@example.com',               // Placeholder
];

/**
 * Checks if a given email address belongs to an administrator
 * @param email The email address to check
 * @returns true if the email is an admin, false otherwise
 */
export const isAdmin = (email: string | null | undefined): boolean => {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
};