import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { TrendingUp, BarChart3, Shield, ArrowLeft } from "lucide-react";

type AuthView = "login" | "register";

interface AuthPageProps {
  initialMode?: AuthView;
  onBack?: () => void;
}

export default function AuthPage({ initialMode = "login", onBack }: AuthPageProps) {
  const [view, setView] = useState<AuthView>(initialMode);

  useEffect(() => {
    setView(initialMode);
  }, [initialMode]);

  return (
    <div className="app-min-h flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="gap-1"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        )}
        
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Trading Platform</h1>
          </div>
          <p className="text-muted-foreground">
            {view === "login" 
              ? "Welcome back. Sign in to access your portfolio." 
              : "Create an account to start trading."}
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">
              {view === "login" ? "Sign In" : "Create Account"}
            </CardTitle>
            <CardDescription>
              {view === "login" 
                ? "Enter your credentials to access the platform" 
                : "Fill in your details to get started"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {view === "login" ? (
              <LoginForm onSwitchToRegister={() => setView("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setView("login")} />
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-1">
            <div className="flex justify-center">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-xs text-muted-foreground">Real-Time Data</p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-center">
              <BarChart3 className="h-5 w-5 text-blue-500" />
            </div>
            <p className="text-xs text-muted-foreground">AI Analysis</p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-center">
              <Shield className="h-5 w-5 text-orange-500" />
            </div>
            <p className="text-xs text-muted-foreground">Secure Trading</p>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Your data is encrypted and securely stored. 
          By continuing, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}
