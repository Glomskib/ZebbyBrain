import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ZebbyAvatar from "@/components/zebby-avatar";
import { Loader2, Mail, Lock, User } from "lucide-react";

export default function AuthPage() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [location, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate("/");
    if (location === "/signup") setTab("signup");
  }, [isAuthenticated, isLoading, navigate, location]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [signupFirst, setSignupFirst] = useState("");
  const [signupLast, setSignupLast] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    try {
      await apiRequest("POST", "/api/auth/login", {
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });
      await qc.invalidateQueries();
      toast({ title: "Welcome back!", description: "You're signed in." });
      navigate("/");
    } catch (err: any) {
      toast({
        title: "Sign in failed",
        description: parseMessage(err) || "Check your email and password.",
        variant: "destructive",
      });
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (signupPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Pick a password with at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (signupPassword !== signupConfirm) {
      toast({
        title: "Passwords don't match",
        description: "Double-check and try again.",
        variant: "destructive",
      });
      return;
    }
    setSignupBusy(true);
    try {
      await apiRequest("POST", "/api/auth/signup", {
        email: signupEmail.trim().toLowerCase(),
        password: signupPassword,
        firstName: signupFirst.trim() || null,
        lastName: signupLast.trim() || null,
      });
      await qc.invalidateQueries();
      toast({
        title: "Welcome to Zebby's World!",
        description: "Let's get you set up.",
      });
      navigate("/onboarding");
    } catch (err: any) {
      toast({
        title: "Couldn't create account",
        description: parseMessage(err) || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSignupBusy(false);
    }
  }

  return (
    <div className="min-h-screen sky-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <ZebbyAvatar size="large" followUser={false} className="mx-auto mb-4" />
          <h1 className="text-3xl font-bold">Zebby's World</h1>
          <p className="text-muted-foreground mt-1">
            You are understood here.
          </p>
        </div>

        <Card className="rounded-3xl shadow-zebby border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-center">
              {tab === "login" ? "Welcome back" : "Create your account"}
            </CardTitle>
            <CardDescription className="text-center">
              {tab === "login"
                ? "Sign in to keep tracking and get your insights."
                : "Start tracking symptoms and unlock Zebby's support."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "signup")}>
              <TabsList className="grid grid-cols-2 w-full rounded-full mb-5">
                <TabsTrigger value="login" className="rounded-full">Sign in</TabsTrigger>
                <TabsTrigger value="signup" className="rounded-full">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4" data-testid="form-login">
                  <Field icon={<Mail className="h-4 w-4" />} htmlFor="login-email" label="Email">
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      data-testid="input-login-email"
                    />
                  </Field>
                  <Field icon={<Lock className="h-4 w-4" />} htmlFor="login-password" label="Password">
                    <Input
                      id="login-password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      data-testid="input-login-password"
                    />
                  </Field>
                  <Button
                    type="submit"
                    className="w-full rounded-full"
                    disabled={loginBusy}
                    data-testid="button-login-submit"
                  >
                    {loginBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4" data-testid="form-signup">
                  <div className="grid grid-cols-2 gap-3">
                    <Field icon={<User className="h-4 w-4" />} htmlFor="signup-first" label="First name">
                      <Input
                        id="signup-first"
                        value={signupFirst}
                        onChange={(e) => setSignupFirst(e.target.value)}
                        data-testid="input-signup-first"
                      />
                    </Field>
                    <Field icon={<User className="h-4 w-4" />} htmlFor="signup-last" label="Last name">
                      <Input
                        id="signup-last"
                        value={signupLast}
                        onChange={(e) => setSignupLast(e.target.value)}
                        data-testid="input-signup-last"
                      />
                    </Field>
                  </div>
                  <Field icon={<Mail className="h-4 w-4" />} htmlFor="signup-email" label="Email">
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      data-testid="input-signup-email"
                    />
                  </Field>
                  <Field icon={<Lock className="h-4 w-4" />} htmlFor="signup-password" label="Password">
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      data-testid="input-signup-password"
                    />
                  </Field>
                  <Field icon={<Lock className="h-4 w-4" />} htmlFor="signup-confirm" label="Confirm password">
                    <Input
                      id="signup-confirm"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      value={signupConfirm}
                      onChange={(e) => setSignupConfirm(e.target.value)}
                      data-testid="input-signup-confirm"
                    />
                  </Field>
                  <Button
                    type="submit"
                    className="w-full rounded-full"
                    disabled={signupBusy}
                    data-testid="button-signup-submit"
                  >
                    {signupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    By creating an account you agree to take care of yourself kindly.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  icon,
  children,
}: {
  htmlFor: string;
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-2 text-sm">
        {icon}
        <span>{label}</span>
      </Label>
      {children}
    </div>
  );
}

function parseMessage(err: any): string | null {
  if (!err) return null;
  const raw = err.message || String(err);
  const m = raw.match(/^\d{3}:\s*(.*)$/);
  const body = m ? m[1] : raw;
  try {
    const parsed = JSON.parse(body);
    return parsed.message || parsed.error || null;
  } catch {
    return body;
  }
}
