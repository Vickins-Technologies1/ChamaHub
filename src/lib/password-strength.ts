export type PasswordStrength = { score: 0 | 1 | 2 | 3; label: "Too short" | "Fair" | "Good" | "Strong" };

export function passwordStrength(value: string): PasswordStrength {
  if (value.length < 12) return { score: 0, label: "Too short" };
  const variety = [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  const distinct = new Set(value).size;
  if ((value.length >= 20 && distinct >= 12) || (value.length >= 16 && variety >= 2 && distinct >= 10)) {
    return { score: 3, label: "Strong" };
  }
  if ((value.length >= 16 || variety >= 2) && distinct >= 8) return { score: 2, label: "Good" };
  return { score: 1, label: "Fair" };
}
