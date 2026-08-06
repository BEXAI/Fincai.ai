import { RequestHandler } from "express";
import crypto from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

const isProduction = process.env.NODE_ENV === "production";

export const generateCsrfToken = (): string => {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
};

export const setCsrfCookie = (res: any, token: string): void => {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: 24 * 60 * 60 * 1000,
  });
};

export const validateCsrf: RequestHandler = (req: any, res, next) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!cookieToken || !headerToken) {
    return res.status(403).json({ message: "CSRF validation failed" });
  }

  // Guard: Check token lengths match before timing-safe comparison
  // timingSafeEqual throws if buffers have different lengths
  if (cookieToken.length !== headerToken.length) {
    return res.status(403).json({ message: "CSRF validation failed" });
  }

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(cookieToken, "utf8"), 
      Buffer.from(headerToken, "utf8")
    );
    
    if (!isValid) {
      return res.status(403).json({ message: "CSRF validation failed" });
    }
  } catch (error) {
    // Catch any unexpected errors (encoding issues, etc.)
    console.error("[CSRF] Validation error:", error instanceof Error ? error.message : "Unknown error");
    return res.status(403).json({ message: "CSRF validation failed" });
  }

  next();
};

export const csrfTokenHandler: RequestHandler = (req: any, res) => {
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  res.json({ csrfToken: token });
};
