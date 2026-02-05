
/**
 * Utility functions for string manipulation
 */

/**
 * Remove Vietnamese accents and convert to lowercase
 */
export const khongDau = (str: any): string => {
  if (!str) return "";
  return str
    .toString()
    .normalize('NFD') // Tách dấu ra khỏi chữ cái
    .replace(/[\u0300-\u036f]/g, '') // Xóa các dấu vừa tách
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
};
