/** Encodes an email address for ProtectedEmail (reversed, then base64), so it never appears in the page as written. */
export const encodeEmail = (email: string): string => btoa([...email.trim()].reverse().join(''));

/** The club's public contact address (website footer, contact page, team pages, privacy policy fallback). */
export const CLUB_EMAIL = 'info@afrofoot.club';
