import type { Express } from "express";
import { z } from "zod";
import {
  registerInputSchema,
  loginInputSchema,
  registerUser,
  loginUser,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  clearAuthCookies,
  optionalAuth,
  isAuthenticatedJwt,
  extractRefreshToken,
  validateRefreshToken,
} from "../auth";
import { csrfTokenHandler, validateCsrf } from "../csrf";
import { authRateLimiter, registerRateLimiter } from "../rate-limiter";
import { storage } from "../storage";

export function registerAuthRoutes(app: Express): void {
  // CSRF Token Endpoint
  app.get('/api/auth/csrf', csrfTokenHandler);

  // Email/Password Auth Routes (Primary)
  app.post('/api/auth/register', registerRateLimiter, validateCsrf, async (req, res) => {
    try {
      const validated = registerInputSchema.parse(req.body);
      const user = await registerUser(validated);
      
      const accessToken = generateAccessToken(user.id, user.email!);
      const refreshToken = generateRefreshToken(user.id, user.email!);
      
      setAuthCookies(res, accessToken, refreshToken);
      
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      if (error.message === "Email already registered") {
        return res.status(409).json({ message: error.message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post('/api/auth/login', authRateLimiter, validateCsrf, async (req, res) => {
    try {
      const validated = loginInputSchema.parse(req.body);
      const user = await loginUser(validated);
      
      const accessToken = generateAccessToken(user.id, user.email!);
      const refreshToken = generateRefreshToken(user.id, user.email!);
      
      setAuthCookies(res, accessToken, refreshToken);
      
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      if (error.message === "Invalid email or password") {
        return res.status(401).json({ message: error.message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post('/api/auth/logout', validateCsrf, (req, res) => {
    clearAuthCookies(res);
    res.json({ message: "Logged out successfully" });
  });

  app.post('/api/auth/refresh', validateCsrf, async (req, res) => {
    try {
      const refreshToken = extractRefreshToken(req);
      
      if (!refreshToken) {
        return res.status(401).json({ message: "No refresh token" });
      }
      
      const payload = validateRefreshToken(refreshToken);
      
      if (!payload) {
        clearAuthCookies(res);
        return res.status(401).json({ message: "Invalid refresh token" });
      }
      
      const user = await storage.getUser(payload.userId);
      
      if (!user) {
        clearAuthCookies(res);
        return res.status(401).json({ message: "User not found" });
      }
      
      const newAccessToken = generateAccessToken(user.id, user.email!);
      const newRefreshToken = generateRefreshToken(user.id, user.email!);
      
      setAuthCookies(res, newAccessToken, newRefreshToken);
      
      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
        },
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      clearAuthCookies(res);
      res.status(401).json({ message: "Token refresh failed" });
    }
  });

  // Get current user (supports both JWT and Replit Auth)
  app.get('/api/auth/user', optionalAuth, async (req: any, res) => {
    try {
      // Check JWT auth first
      if (req.user) {
        const user = req.user;
        return res.json({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          onboardingCompleted: user.onboardingCompleted ?? false,
        });
      }
      
      // Fallback to Replit Auth
      if (req.isAuthenticated && req.isAuthenticated() && req.user?.claims?.sub) {
        const userId = req.user.claims.sub;
        const user = await storage.getUser(userId);
        if (user) {
          return res.json({
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            profileImageUrl: user.profileImageUrl,
            onboardingCompleted: user.onboardingCompleted ?? false,
          });
        }
      }
      
      res.status(401).json({ message: "Not authenticated" });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Mark the first-run onboarding walkthrough as completed/dismissed for the
  // signed-in user, so it doesn't re-trigger on another device. Anonymous users
  // persist this in localStorage instead and never hit this endpoint.
  app.post('/api/auth/onboarding/complete', validateCsrf, isAuthenticatedJwt, async (req: any, res) => {
    try {
      const userId = req.user?.id ?? req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      await storage.updateUser(userId, { onboardingCompleted: true });
      res.json({ onboardingCompleted: true });
    } catch (error) {
      console.error("Error updating onboarding state:", error);
      res.status(500).json({ message: "Failed to update onboarding state" });
    }
  });
}
