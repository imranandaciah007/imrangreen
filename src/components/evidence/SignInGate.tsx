import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SIGNED_OUT_EVENT } from "@/lib/signed-out";

type Status = "checking" | "signed-in" | "signed-out";

const SignOutContext = createContext<() => void>(() => undefined);

/** Signs this device out and returns to the sign-in screen. */
export function useSignOut() {
  return useContext(SignOutContext);
}

async function checkSignedIn(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth", { cache: "no-store" });
    const body = (await response.json()) as { signedIn?: boolean };
    return body.signedIn === true;
  } catch {
    return false;
  }
}

/**
 * Shows the sign-in screen until this device has a valid login, and only then
 * mounts the case, so no case data is requested before sign-in.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  const recheck = useCallback(async () => {
    setStatus((await checkSignedIn()) ? "signed-in" : "signed-out");
  }, []);

  useEffect(() => {
    void recheck();
    const onSignedOut = () => setStatus("signed-out");
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, [recheck]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => undefined);
    setStatus("signed-out");
  }, []);

  if (status === "checking") {
    return <p className="py-20 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (status === "signed-out") {
    return <SignInScreen onSignedIn={() => setStatus("signed-in")} />;
  }
  return <SignOutContext.Provider value={() => void signOut()}>{children}</SignOutContext.Provider>;
}

function SignInScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        onSignedIn();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign-in failed. Please try again.");
    } catch {
      setError("Could not reach the app. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="" className="size-10 rounded-md" />
          <div>
            <h1 className="font-display text-lg font-black">Evidence portal</h1>
            <p className="text-xs font-semibold text-muted-foreground">Private case · Imran &amp; Aciah</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signin-username">Username</Label>
          <Input
            id="signin-username"
            autoComplete="username"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="h-11"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="signin-password">Password</Label>
          <div className="relative">
            <Input
              id="signin-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-2.5 text-xs font-semibold text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" className="h-11 w-full gap-2 font-bold" disabled={busy}>
          <Lock className="size-4" />
          {busy ? "Signing in…" : "Sign in"}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          This device stays signed in for 90 days.
        </p>
      </form>
    </main>
  );
}
