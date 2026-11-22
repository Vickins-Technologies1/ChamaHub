import { passwordStrength } from "@/lib/password-strength";

export default function PasswordStrengthIndicator({ value }: { value: string }) {
  if (!value) return null;
  const strength = passwordStrength(value);
  return <span className="auth-strength" role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={3} aria-valuenow={strength.score} aria-valuetext={strength.label}>
    <span className="auth-strength__track" aria-hidden="true">{[1, 2, 3].map((step) => <span key={step} className={step <= strength.score ? strength.score === 3 ? "is-strong" : "is-active" : ""} />)}</span>
    <span className="auth-strength__label">Password strength: {strength.label}</span>
  </span>;
}
