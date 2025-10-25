import * as React from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuthUser } from "../lib/useAuthUser";
import { signInWithGoogle } from "../lib/auth";

export default function Welcome() {
  const user = useAuthUser();
  const nav = useNavigate();

  React.useEffect(() => {
    if (user) nav("/");
  }, [user, nav]);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-10">
      {/* Hero */}
      <section className="text-center space-y-4">
        <motion.h1
          className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span>HelpHub Local</span>
          <span role="img" aria-hidden>📍</span>
        </motion.h1>

        <motion.p
          className="text-gray-600 max-w-xl mx-auto text-sm sm:text-base"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          Ask for quick help nearby — carry a package, pick up something, fix a small thing —
          or offer help and get a thank you (or coffee money ☕).
        </motion.p>

        {/* Auth CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row gap-3 justify-center pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <button
            onClick={signInWithGoogle}
            className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Continue with Google
          </button>

          <Link
            to="/auth"
            className="rounded-xl border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 text-center"
          >
            Continue with Email / Phone
          </Link>
        </motion.div>
      </section>

      {/* How it works */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: "🗺️",
            title: "See requests near you",
            desc: "Live map of neighbors who need a hand right now.",
          },
          {
            icon: "💬",
            title: "Chat safely",
            desc: "Coordinate details in-app. No phone sharing required.",
          },
          {
            icon: "🎉",
            title: "Mark done & review",
            desc: "Both sides leave a short review. Good vibes only.",
          },
        ].map((step, i) => (
          <motion.div
            key={step.title}
            className="rounded-2xl border bg-white p-4 shadow-sm cursor-default"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 * i }}
            whileHover={{ scale: 1.03 }}
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none">{step.icon}</div>
              <div>
                <div className="font-semibold text-gray-900 text-sm">
                  {step.title}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {step.desc}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      {/* Mini interactive preview card */}
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-5 items-start">
          <motion.div
            className="flex-1 space-y-3 text-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="font-semibold text-gray-800 flex items-center gap-2">
              <span role="img" aria-hidden>📦</span>
              <span>Example request:</span>
            </div>
            <div className="rounded-lg border p-3 bg-gray-50">
              <div className="font-medium text-gray-900">
                “Can someone grab my package from pickup point on Dizengoff?”
              </div>
              <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1">
                  <span role="img" aria-hidden>🏷️</span> Errand
                </span>
                <span className="inline-flex items-center gap-1">
                  <span role="img" aria-hidden>💰</span> Coffee / 20₪
                </span>
                <span className="inline-flex items-center gap-1">
                  <span role="img" aria-hidden>📍</span> ~0.8 km
                </span>
              </div>
            </div>

            <div className="rounded-lg border p-3 bg-white">
              <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                <span role="img" aria-hidden>💬</span>
                Chat preview
              </div>
              <div className="text-[13px] leading-relaxed text-gray-800">
                <b>Amit:</b> Hey I can pick it up in 20 min 👍  
                <br />
                <b>You:</b> Amazing, locker code is 4921. Thanks!!
              </div>
            </div>

            <div className="rounded-lg border p-3 bg-emerald-50/60">
              <div className="text-xs text-emerald-700 font-medium flex items-center gap-2">
                <span role="img" aria-hidden>✅</span>
                Marked as done
              </div>
              <div className="text-[13px] text-emerald-800 mt-1">
                Both of you will leave a short review (and yes, we throw confetti 🎉)
              </div>
            </div>
          </motion.div>

          <motion.div
            className="flex-shrink-0 w-full sm:w-48 rounded-xl border p-4 bg-gradient-to-br from-indigo-50 to-purple-50 text-xs text-gray-700 shadow-inner"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="font-semibold text-gray-800 text-sm mb-2 flex items-center gap-2">
              <span role="img" aria-hidden>🔒</span>
              Trust & Safety
            </div>
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <span role="img" aria-hidden>⭐</span>
                <span>Profiles have reviews</span>
              </li>
              <li className="flex items-start gap-2">
                <span role="img" aria-hidden>📞</span>
                <span>Phone/email verified</span>
              </li>
              <li className="flex items-start gap-2">
                <span role="img" aria-hidden>📍</span>
                <span>Requests are location-based</span>
              </li>
            </ul>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
