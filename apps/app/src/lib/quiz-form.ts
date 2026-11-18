/** The quiz editor's form shape (Admin → Quiz): languages, option slots and the text limits of migrations 0049–0050. */
export const QUIZ_LOCALES = ['en', 'fi', 'fr', 'ar'] as const;
export const QUIZ_MAX_OPTIONS = 6;
export const QUIZ_LIMITS = { question: 300, option: 150, explain: 600, source: 200 } as const;
export const QUIZ_TOPICS = ['rules', 'club', 'football'] as const;
