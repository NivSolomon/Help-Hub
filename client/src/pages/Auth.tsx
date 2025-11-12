import React from "react";
import { useNavigate } from "react-router-dom";

import {
  confirmPhoneCode,
  registerWithEmail,
  sendPhoneCode,
  signInWithEmail,
  signInWithGoogle,
} from "../lib/auth";
import { useAuthUser } from "../lib/useAuthUser";
import googleLogo from "../assets/Logo-google-icon-PNG.png";
import { apiFetch } from "../lib/api";

type CardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
};

function AuthCard({ title, subtitle, children, className }: CardProps) {
  return (
    <section
      className={`rounded-3xl border border-white/40 bg-white/85 p-6 shadow-xl backdrop-blur transition hover:shadow-2xl ${className ?? ""}`}
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export default function AuthPage() {
  const user = useAuthUser();
  const nav = useNavigate();

  React.useEffect(() => {
    if (user) nav("/");
  }, [user, nav]);

  const [email, setEmail] = React.useState("");
  const [pass, setPass] = React.useState("");
  const [regEmail, setRegEmail] = React.useState("");
  const [regPass, setRegPass] = React.useState("");
  const [regError, setRegError] = React.useState<string | null>(null);
  const [loginError, setLoginError] = React.useState<string | null>(null);
  const [resetStatus, setResetStatus] = React.useState<{
    state: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ state: "idle" });

  const [phone, setPhone] = React.useState("");
  const [smsSent, setSmsSent] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [otpError, setOtpError] = React.useState<string | null>(null);
  const [numverifyMeta, setNumverifyMeta] = React.useState<{
    country_name?: string | null;
    carrier?: string | null;
  } | null>(null);

  async function handleSendSMS() {
    if (sending) return;
    const trimmed = phone.trim();
    if (!trimmed) {
      setPhoneError("Phone number is required.");
      return;
    }
    setSending(true);
    setPhoneError(null);
    setNumverifyMeta(null);
    try {
      const validated = await validatePhoneNumberWithNumverify(trimmed);
      if (!validated.valid) {
        setPhoneError(
          validated.errorMessage ??
            "We couldn't verify this phone number. Please double-check it and try again."
        );
        return;
      }

      const formattedNumber =
        validated.international_format?.replace(/\s+/g, "") ?? trimmed;

      await sendPhoneCode(formattedNumber);
      setPhone(formattedNumber);
      setNumverifyMeta({
        country_name: validated.country_name,
        carrier: validated.carrier,
      });
      setSmsSent(true);
    } catch (error: any) {
      setPhoneError(
        error?.message ??
          "Could not send code. Please verify the number and try again."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleRegister() {
    if (!regEmail.trim() || !regPass.trim()) {
      setRegError("Email and password are required.");
      return;
    }
    try {
      setRegError(null);
      await registerWithEmail(regEmail.trim(), regPass);
    } catch (error: any) {
      setRegError(
        error?.message ?? "Failed to create account. Please try again."
      );
    }
  }

  async function handleLogin() {
    if (!email.trim() || !pass.trim()) {
      setLoginError("Email and password are required.");
      return;
    }
    try {
      setLoginError(null);
      setResetStatus({ state: "idle" });
      await signInWithEmail(email.trim(), pass);
    } catch (error: any) {
      setLoginError(
        error?.message ?? "Failed to sign in. Please check your details."
      );
    }
  }

  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed) {
      setResetStatus({
        state: "error",
        message: "Enter your email above so we know where to send the link.",
      });
      return;
    }

    try {
      setResetStatus({ state: "loading" });
      const data = await apiFetch<{ message?: string }>(
        "/auth/forgot-password",
        {
          method: "POST",
          auth: false,
          body: { email: trimmed },
        }
      );
      setResetStatus({
        state: "success",
        message:
          data?.message ??
          "If that email is registered, you’ll get reset instructions shortly.",
      });
    } catch (error: any) {
      setResetStatus({
        state: "error",
        message:
          error?.message ??
          "Something went wrong while sending the reset email.",
      });
    }
  }

  async function handleConfirmOtp() {
    try {
      setOtpError(null);
      await confirmPhoneCode(otp);
    } catch (error: any) {
      setOtpError(error?.message ?? "Invalid code. Please try again.");
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-100 via-white to-emerald-100">
      <div className="pointer-events-none absolute inset-0">
        <span className="absolute -left-24 top-0 h-64 w-64 rounded-full bg-indigo-300/30 blur-3xl" />
        <span className="absolute right-[-10%] top-28 h-60 w-60 rounded-full bg-emerald-300/30 blur-3xl" />
        <span className="absolute bottom-[-15%] left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-violet-300/25 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-16">
        <header className="text-center sm:text-left">
          <p className="text-xs uppercase tracking-[0.4em] text-indigo-500">
            Join the community
          </p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
            Sign in or create your HelpHub account
          </h1>
          <p className="mt-2 max-w-xl text-sm text-gray-600">
            Choose the method that fits you best—Google, email & password, or a
            quick SMS code. We keep your information private and only share what
            the community needs to coordinate.
          </p>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <AuthCard
              title="Single-tap with Google"
              subtitle="Fast, secure, and synced with your existing account."
            >
              <button
                onClick={signInWithGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200/60 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <img
                  src={googleLogo}
                  alt=""
                  className="h-6 w-6 rounded-full bg-white object-cover"
                  loading="lazy"
                  aria-hidden
                />
                Continue with Google
              </button>
              <p className="text-xs text-gray-500">
                We’ll create your profile using your Google name and photo. You
                can edit details any time.
              </p>
            </AuthCard>

            <AuthCard
              title="Use your email"
              subtitle="Create a login or sign in if you already joined."
            >
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-800">
                    New here? Create an account
                  </h3>
                  <div className="space-y-3 text-sm">
                    <input
                      className="w-full rounded-xl border border-gray-200/80 px-3 py-2 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="name@email.com"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                    <input
                      className="w-full rounded-xl border border-gray-200/80 px-3 py-2 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Create a password"
                      type="password"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                    />
                    {regError ? (
                      <p className="text-xs text-red-600">{regError}</p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Minimum 8 characters recommended. You can change it any
                        time.
                      </p>
                    )}
                    <button
                      onClick={handleRegister}
                      className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-500"
                    >
                      Create account
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-800">
                    Already have an account?
                  </h3>
                  <div className="space-y-3 text-sm">
                    <input
                      className="w-full rounded-xl border border-gray-200/80 px-3 py-2 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Your email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <input
                      className="w-full rounded-xl border border-gray-200/80 px-3 py-2 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Your password"
                      type="password"
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                    />
                    {loginError ? (
                      <p className="text-xs text-red-600">{loginError}</p>
                    ) : (
                      <p className="text-xs text-gray-500">
                        Use the same email you registered with. You can always switch to Google or SMS instead.
                      </p>
                    )}
                    <button
                      onClick={handleLogin}
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600"
                    >
                      Sign in
                    </button>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={handleForgotPassword}
                        disabled={resetStatus.state === "loading"}
                        className="self-start text-xs font-semibold text-indigo-600 transition hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {resetStatus.state === "loading"
                          ? "Sending reset email..."
                          : "Forgot password?"}
                      </button>
                      {resetStatus.state === "success" && (
                        <p className="text-xs text-emerald-600">
                          {resetStatus.message}
                        </p>
                      )}
                      {resetStatus.state === "error" && (
                        <p className="text-xs text-red-600">
                          {resetStatus.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </AuthCard>
          </div>

          <AuthCard
            title="Sign in by SMS"
            subtitle="Perfect if you don’t want to remember another password."
            className="lg:sticky lg:top-24"
          >
            <div>
              <p className="text-xs text-gray-500">
                Works with Israeli numbers such as{" "}
                <strong>054-9203398</strong> or international format{" "}
                <strong>+972549203398</strong>.
              </p>
            </div>

            <div
              id="recaptcha-container"
              className="rounded-xl border border-dashed border-gray-200 bg-white/70 p-3 text-xs text-gray-500"
            />

            {!smsSent ? (
              <div className="space-y-3">
                <label className="text-xs font-medium text-gray-600">
                  Mobile number
                </label>
                <input
                  className="w-full rounded-xl border border-gray-200/80 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="054-9203398 or +972549203398"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {phoneError ? (
                  <p className="text-xs text-red-600">{phoneError}</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    We’ll text you a 6-digit code once the number passes Numverify
                    validation. Standard SMS rates may apply.
                  </p>
                )}
                {numverifyMeta ? (
                  <div className="rounded-xl bg-emerald-100/60 p-3 text-xs text-emerald-800">
                    <p className="font-semibold">Number verified</p>
                    <p>
                      Country: {numverifyMeta.country_name ?? "Unknown"} · Carrier:{" "}
                      {numverifyMeta.carrier ?? "Unknown"}
                    </p>
                  </div>
                ) : null}
                <button
                  onClick={handleSendSMS}
                  disabled={sending}
                  className={`w-full rounded-xl px-4 py-2 text-sm font-semibold text-white transition ${
                    sending
                      ? "cursor-not-allowed bg-gray-400"
                      : "bg-emerald-600 shadow-md hover:bg-emerald-500"
                  }`}
                >
                  {sending ? "Sending…" : "Send SMS code"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="text-xs font-medium text-gray-600">
                  Enter the 6-digit code
                </label>
                <input
                  className="w-full rounded-xl border border-gray-200/80 px-3 py-2 text-sm tracking-widest focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  placeholder="● ● ● ● ● ●"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
                {otpError ? (
                  <p className="text-xs text-red-600">{otpError}</p>
                ) : (
                  <p className="text-xs text-gray-500">
                    Didn’t receive it? Double-check the phone number or resend in
                    60 seconds.
                  </p>
                )}
                <button
                  onClick={handleConfirmOtp}
                  className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-600"
                >
                  Verify &amp; sign in
                </button>
              </div>
            )}

            <div className="rounded-2xl bg-emerald-50/60 p-4 text-xs text-emerald-800">
              <p className="font-semibold">What happens next?</p>
              <ul className="mt-2 space-y-1">
                <li>• We’ll auto-create your profile if you’re new.</li>
                <li>• You’ll land back on the map to find or post requests.</li>
                <li>• Update your profile anytime under Settings.</li>
              </ul>
            </div>
          </AuthCard>
        </div>
      </div>
    </main>
  );
}

type NumverifyResponse =
  | {
      valid: true;
      international_format: string | null;
      country_name: string | null;
      carrier: string | null;
    }
  | {
      valid: false;
      error?: { code: number; type: string; info: string };
    };

async function validatePhoneNumberWithNumverify(input: string): Promise<{
  valid: boolean;
  international_format?: string | null;
  country_name?: string | null;
  carrier?: string | null;
  errorMessage?: string;
}> {
  const accessKey = import.meta.env.VITE_NUMVERIFY_API_KEY;
  if (!accessKey) {
    return {
      valid: false,
      errorMessage:
        "Phone validation is temporarily unavailable (missing API key).",
    };
  }

  const sanitized = input.replace(/[^\d+]/g, "");
  const params = new URLSearchParams({
    access_key: accessKey,
    number: sanitized,
  });

  const response = await fetch(
    `https://apilayer.net/api/validate?${params.toString()}`
  );
  if (!response.ok) {
    return {
      valid: false,
      errorMessage: "Failed to reach Numverify service. Please try again later.",
    };
  }

  const payload = (await response.json()) as NumverifyResponse;

  if ("error" in payload && payload.error) {
    return {
      valid: false,
      errorMessage: payload.error.info ?? "Numverify reported an error.",
    };
  }

  if (!payload.valid) {
    return {
      valid: false,
      errorMessage:
        "Numverify marked this phone number as invalid. Please check the digits.",
    };
  }

  return {
    valid: true,
    international_format: payload.international_format,
    country_name: payload.country_name ?? undefined,
    carrier: payload.carrier ?? undefined,
  };
}
