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
