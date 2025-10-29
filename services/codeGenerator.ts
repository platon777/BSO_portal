/**
 * Generates a unique user code based on first and last names.
 * Format: FL-ABCDE
 * @param firstName - The user's first name.
 * @param lastName - The user's last name.
 * @returns A generated user code string.
 */
export function generateUserCode(firstName?: string, lastName?: string): string {
  if (!firstName || !lastName || firstName.length === 0 || lastName.length === 0) {
    // Fallback if names are missing
    return `XX-${Date.now().toString(36).slice(-5)}`.toUpperCase();
  }
  // Extract initials
  const prefix = (firstName[0] + lastName[0]).toUpperCase();

  // Combine timestamp and random part for uniqueness
  const timePart = Date.now().toString(36).slice(-3);
  const randPart = Math.random().toString(36).substring(2, 4);

  return `${prefix}-${timePart}${randPart}`.toUpperCase();
}


/**
 * Generates a custom account number based on a prefix.
 * Format: PREFIX-XYZ
 * @param prefix - The prefix for the code (e.g., client code or savings account number).
 * @returns A generated account number string.
 */
export function generateCustomCode(prefix?: string): string {
    if (!prefix) {
        prefix = 'ACC';
    }
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';

  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    suffix += characters[randomIndex];
  }

  return `${prefix}-${suffix}`;
}
