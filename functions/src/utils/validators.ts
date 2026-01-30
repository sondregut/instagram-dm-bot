/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Extract email from text
 */
export function extractEmail(text: string): string | null {
  const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
  const match = text.match(emailRegex);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Validate phone number (basic international format)
 */
export function isValidPhone(phone: string): boolean {
  // Remove common formatting
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  // Check if it's a valid phone number format
  const phoneRegex = /^\+?[1-9]\d{6,14}$/;
  return phoneRegex.test(cleaned);
}

/**
 * Extract phone number from text
 */
export function extractPhone(text: string): string | null {
  // Match various phone formats
  const phoneRegex = /(?:\+?[1-9])?[\s\-\.\(\)]*(?:\d[\s\-\.\(\)]*){7,14}/;
  const match = text.match(phoneRegex);
  if (match) {
    // Clean up the match
    return match[0].replace(/[\s\-\(\)\.]/g, '');
  }
  return null;
}

/**
 * Truncate message to Instagram DM limit
 */
export function truncateMessage(message: string, maxLength: number = 1000): string {
  if (message.length <= maxLength) {
    return message;
  }
  return message.substring(0, maxLength - 3) + '...';
}

/**
 * Sanitize user input for safety
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 5000); // Limit length
}

/**
 * Check if text contains any of the keywords (case-insensitive)
 */
export function containsKeyword(text: string, keywords: string[]): string | null {
  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return keyword;
    }
  }
  return null;
}
