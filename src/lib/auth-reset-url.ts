const AUTH_BASE_PATH = "/api/auth";

export const getPasswordResetEmailUrl = (url: string) => {
  const resetUrl = new URL(url);
  if (!resetUrl.pathname.startsWith(`${AUTH_BASE_PATH}/`)) {
    resetUrl.pathname = `${AUTH_BASE_PATH}${resetUrl.pathname}`;
  }
  return resetUrl.toString();
};
