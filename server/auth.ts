import { RequestHandler } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { storage } from "./storage";
import { z } from "zod";

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

const getJwtSecret = (): string => {
  // Use JWT_SECRET if available, otherwise fall back to SESSION_SECRET
  // Both are valid cryptographic secrets for signing tokens
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }
  // In production, we must have a stable secret for JWT validation across restarts
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET or SESSION_SECRET environment variable is required in production");
  }
  // Development only: generate ephemeral secret (will break on restart)
  console.warn("[Auth] Warning: Using ephemeral JWT secret. Set JWT_SECRET or SESSION_SECRET for persistence.");
  const generated = crypto.randomBytes(64).toString("hex");
  process.env.JWT_SECRET = generated;
  return generated;
};

const JWT_SECRET = getJwtSecret();

const isProduction = process.env.NODE_ENV === "production";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const emailSchema = z.string().email("Invalid email address");

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
});

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;

interface TokenPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
}

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const comparePassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateAccessToken = (userId: string, email: string): string => {
  return jwt.sign(
    { userId, email, type: "access" } as TokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

export const generateRefreshToken = (userId: string, email: string): string => {
  return jwt.sign(
    { userId, email, type: "refresh" } as TokenPayload,
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
};

export const setAuthCookies = (
  res: any,
  accessToken: string,
  refreshToken: string
): void => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};

export const clearAuthCookies = (res: any): void => {
  res.clearCookie("accessToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
  });
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
  });
};

export const isAuthenticatedJwt: RequestHandler = async (req: any, res, next) => {
  const accessToken = req.cookies?.accessToken;

  if (!accessToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const payload = verifyToken(accessToken);

  if (!payload || payload.type !== "access") {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = await storage.getUser(payload.userId);

  if (!user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  req.user = user;
  req.userId = user.id;
  next();
};

export const optionalAuth: RequestHandler = async (req: any, res, next) => {
  const accessToken = req.cookies?.accessToken;

  if (accessToken) {
    const payload = verifyToken(accessToken);
    if (payload && payload.type === "access") {
      const user = await storage.getUser(payload.userId);
      if (user) {
        req.user = user;
        req.userId = user.id;
      }
    }
  }

  next();
};

export const registerUser = async (input: RegisterInput) => {
  const existingUser = await storage.getUserByEmail(input.email);
  if (existingUser) {
    throw new Error("Email already registered");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await storage.createUser({
    email: input.email,
    passwordHash,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
  });

  return user;
};

export const loginUser = async (input: LoginInput) => {
  const user = await storage.getUserByEmail(input.email);

  if (!user || !user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  const isValid = await comparePassword(input.password, user.passwordHash);

  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  return user;
};

export const extractRefreshToken = (req: any): string | null => {
  return req.cookies?.refreshToken || null;
};

export const validateRefreshToken = (token: string): TokenPayload | null => {
  const payload = verifyToken(token);
  if (!payload || payload.type !== "refresh") {
    return null;
  }
  return payload;
};
