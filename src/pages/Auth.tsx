import React from "react";
import {
  signInWithGoogle,
  registerWithEmail,
  signInWithEmail,
  sendPhoneCode,
  confirmPhoneCode,
} from "../lib/auth";

import { useAuthUser } from "../lib/useAuthUser";
import { useNavigate } from "react-router-dom";

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

  const [phone, setPhone] = React.useState("");
  const [smsSent, setSmsSent] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [sending, setSending] = React.useState(false);

  async function handleSendSMS() {
    if (sending) return;
    setSending(true);
    const ok = await sendPhoneCode(phone.trim());
    if (ok) setSmsSent(true);
    setSending(false);
  }

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-4 text-xl font-semibold text-center">
        Sign in / Register
      </h1>

      {/* 🔹 Google Sign In */}
      <div className="mb-6 rounded-2xl border p-4 text-center">
        <div className="mb-2 text-sm font-semibold">Google</div>
        <button
          onClick={signInWithGoogle}
          className="rounded-lg bg-black px-4 py-2 text-white hover:opacity-90"
        >
          Continue with Google
        </button>
      </div>

      {/* 🔹 Email Register / Login */}
      <div className="mb-6 grid gap-4 rounded-2xl border p-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-sm font-semibold">Register (Email)</div>
          <input
            className="mb-2 w-full rounded-lg border p-2 text-sm"
            placeholder="Email"
            type="email"
            value={regEmail}
            onChange={(e) => setRegEmail(e.target.value)}
          />
          <input
            className="mb-2 w-full rounded-lg border p-2 text-sm"
            placeholder="Password"
            type="password"
            value={regPass}
            onChange={(e) => setRegPass(e.target.value)}
          />
          <button
            onClick={() => registerWithEmail(regEmail.trim(), regPass)}
            className="w-full rounded-lg bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            Create account
          </button>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">Sign in (Email)</div>
          <input
            className="mb-2 w-full rounded-lg border p-2 text-sm"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="mb-2 w-full rounded-lg border p-2 text-sm"
            placeholder="Password"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
          <button
            onClick={() => signInWithEmail(email.trim(), pass)}
            className="w-full rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
          >
            Sign in
          </button>
        </div>
      </div>

      {/* 🔹 Phone Auth */}
      <div className="rounded-2xl border p-4">
        <div className="mb-2 text-sm font-semibold">Phone (Israel)</div>
        <p className="mb-2 text-xs text-gray-500">
          You can enter your number like <strong>054-9203398</strong> or with{" "}
          <strong>+972</strong> prefix.
        </p>

        <div id="recaptcha-container" className="mb-2" />

        {!smsSent ? (
          <>
            <input
              className="mb-2 w-full rounded-lg border p-2 text-sm"
              placeholder="054-9203398 or +972549203398"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              onClick={handleSendSMS}
              disabled={sending}
              className={`w-full rounded-lg px-4 py-2 text-sm text-white transition ${
                sending ? "bg-gray-500" : "bg-black hover:opacity-90"
              }`}
            >
              {sending ? "Sending..." : "Send SMS code"}
            </button>
          </>
        ) : (
          <>
            <input
              className="mb-2 w-full rounded-lg border p-2 text-sm"
              placeholder="Enter the 6-digit code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
            <button
              onClick={() => confirmPhoneCode(otp)}
              className="w-full rounded-lg border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Verify & Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
