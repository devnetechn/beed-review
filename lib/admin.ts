export const OWNER_EMAIL = "yatamakura12@gmail.com";

export function isOwnerEmail(email: string | null | undefined) {
  return email === OWNER_EMAIL;
}
