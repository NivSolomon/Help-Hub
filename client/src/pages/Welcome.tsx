import * as React from "react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";

import { useAuthUser } from "../lib/useAuthUser";
import { signInWithGoogle } from "../lib/auth";
import welcomeVisual from "../assets/HelpHub-Comunity.png";
import googleLogo from "../assets/Logo-google-icon-PNG.png";
import RequestLifecycleDiagram from "../components/RequestLifecycleDiagram";

const featureVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 0.7, 0.36, 1] as [number, number, number, number] },
  },
};

const ctaVariants = {
  hover: { scale: 1.03, y: -2 },
  tap: { scale: 0.98 },
};

const HERO_BACKGROUND_COLOR = "#f5f1ea";

const team = [
  {
    name: "Niv Solomon",
    role: "Founder & Product",
    quote:
      "I built HelpHub Local after watching neighbors quietly struggle with everyday tasks. We can do better when we feel connected.",
  },
  {
    name: "Community Crew",
    role: "Volunteer moderators",
    quote:
      "We keep the lights on, greet newcomers, and make sure every interaction stays friendly, safe, and respectful.",
  },
];

function DecorativeBackdrop() {
  return (
    <div
      className="absolute inset-0 -z-10"
      style={{ backgroundColor: HERO_BACKGROUND_COLOR }}
    />
  );
}

export default function Welcome() {
  const user = useAuthUser();
  const nav = useNavigate();

  React.useEffect(() => {
    if (user) nav("/");
  }, [user, nav]);

  const featureCards = useMemo(
    () => [
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
    ],
    []
  );

  return (
    <div className="relative mx-auto max-w-6xl space-y-12 overflow-hidden p-6">
      <DecorativeBackdrop />

      <motion.section
        className="relative overflow-hidden rounded-3xl border border-white/30 bg-white/70 shadow-2xl backdrop-blur"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <div
          className="aspect-[16/9] w-full overflow-hidden rounded-3xl border-b border-white/20"
          style={{ backgroundColor: HERO_BACKGROUND_COLOR }}
        >
          <img
            src={welcomeVisual}
            alt="HelpHub community illustration"
            className="h-full w-full object-contain object-top"
            loading="lazy"
          />
        </div>
        <div className="absolute inset-x-6 bottom-6 flex flex-wrap items-center justify-between gap-6 text-slate-900 drop-shadow-lg">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-400 px-5 py-3 text-sm text-white shadow-xl shadow-indigo-300/60 backdrop-blur">
            <p className="text-[11px] font-semibold uppercase tracking-[0.45em] text-white/85">
              Welcome to HelpHub Local
            </p>
            <h1 className="mt-1 text-xl font-semibold sm:text-2xl text-white">
              Small favors, big community impact.
            </h1>
          </div>
          <motion.button
            onClick={signInWithGoogle}
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-indigo-600 shadow-lg shadow-indigo-200/60 transition hover:-translate-y-0.5 hover:bg-indigo-50"
            variants={ctaVariants}
            whileHover="hover"
            whileTap="tap"
          >
            <span className="flex items-center gap-2 text-indigo-600">
              <img
                src={googleLogo}
                alt=""
                className="h-5 w-5 rounded-full bg-white object-cover"
                loading="lazy"
                aria-hidden
              />
              Continue with Google
            </span>
          </motion.button>
        </div>
      </motion.section>

      <section className="grid gap-10 rounded-3xl border border-white/30 bg-white/85 p-8 shadow-xl backdrop-blur-xl sm:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="flex flex-col justify-center space-y-6 text-center sm:text-left">
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-indigo-100/60 bg-indigo-50/80 px-3 py-1 text-xs font-medium text-indigo-600 sm:mx-0"
          >
            <span role="img" aria-hidden>
              ✨
            </span>
            Help your neighborhood thrive
          </motion.span>

          <motion.h1
            className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.6 }}
          >
            HelpHub Local connects neighbors to get things done.
          </motion.h1>

          <motion.p
            className="text-sm text-gray-600 sm:text-base"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.6 }}
          >
            Ask for quick help — carry a package, fix a chair, pick up a parcel —
            or offer your skills and earn thanks (or coffee money ☕). We build
            trust with verified profiles, in-app chat, and post-task reviews.
          </motion.p>

          <motion.div
            className="flex flex-col gap-3 pt-2 sm:flex-row"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <motion.button
              onClick={signInWithGoogle}
              className="rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200/50"
              variants={ctaVariants}
              whileHover="hover"
              whileTap="tap"
            >
              <span className="flex items-center justify-center gap-3">
                <img
                  src={googleLogo}
                  alt=""
                  className="h-6 w-6 rounded-full bg-white object-cover"
                  loading="lazy"
                  aria-hidden
                />
                Continue with Google
              </span>
            </motion.button>

            <motion.div variants={ctaVariants} whileHover="hover" whileTap="tap">
              <Link
                to="/auth"
                className="flex h-full items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Continue with Email / Phone
              </Link>
            </motion.div>
          </motion.div>
        </div>

        <div className="relative">
          <motion.div
            className="absolute inset-0 rounded-[2rem] bg-gradient-to-tr from-indigo-200/40 via-violet-200/30 to-transparent blur-3xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
          />

          <motion.div
            className="relative flex h-full flex-col justify-between gap-4 overflow-hidden rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-lg backdrop-blur"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
                Nearby snapshot
              </div>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">
                “Can someone grab my package from pickup point on Dizengoff?”
              </h2>
              <p className="mt-2 text-xs text-gray-600">
                Real-time map pulls in open tasks around you. Accept in one tap,
                chat instantly, arrive prepared.
              </p>
            </div>

            <motion.div
              className="grid gap-3 rounded-2xl bg-gradient-to-br from-indigo-500/15 via-violet-500/5 to-white/60 p-4 text-sm text-gray-800"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.6 }}
            >
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <span role="img" aria-hidden>
                    🏷️
                  </span>
                  Errand
                </span>
                <span className="inline-flex items-center gap-1">
                  <span role="img" aria-hidden>
                    💰
                  </span>
                  Coffee / 20₪
                </span>
                <span className="inline-flex items-center gap-1">
                  <span role="img" aria-hidden>
                    📍
                  </span>
                  ~0.8 km
                </span>
              </div>
              <div className="rounded-xl border border-white/50 bg-white/70 p-3 text-xs text-gray-600 shadow-sm">
                <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-indigo-500">
                  <span role="img" aria-hidden>
                    💬
                  </span>
                  Chat preview
                </div>
                <div className="space-y-1 text-[13px] leading-relaxed text-gray-800">
                  <p>
                    <b>Amit:</b> Hey! I can pick it up in 20 min 👍
                  </p>
                  <p>
                    <b>You:</b> Amazing, locker code is 4921. Thanks!!
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/70 p-3 text-xs text-emerald-700 shadow-sm">
                <div className="flex items-center gap-2 font-medium">
                  <span role="img" aria-hidden>
                    ✅
                  </span>
                  Marked as done
                </div>
                <p className="mt-1 text-[13px] text-emerald-800">
                  Both of you leave a short review (and yes, we throw confetti 🎉)
                </p>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {featureCards.map((step, index) => (
          <motion.div
            key={step.title}
            variants={featureVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: index * 0.1 + 0.2 }}
            whileHover={{
              y: -4,
              boxShadow: "0 18px 35px rgba(79, 70, 229, 0.15)",
            }}
            className="rounded-2xl border border-gray-100 bg-white/85 p-4 shadow-sm backdrop-blur"
          >
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none">{step.icon}</div>
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  {step.title}
                </div>
                <div className="mt-1 text-xs text-gray-600">{step.desc}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      <RequestLifecycleDiagram />

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 220, damping: 24 }}
        className="rounded-[32px] border border-white/50 bg-white/90 px-6 py-8 shadow-xl backdrop-blur"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Built by neighbors</h2>
            <p className="mt-1 text-sm text-gray-600">
              We’re a tiny core team backed by moderators, volunteers, and generous beta testers. Every release, every new idea—comes from you.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {team.map((member) => (
            <div
              key={member.name}
              className="rounded-2xl border border-gray-100 bg-gradient-to-br from-indigo-50/70 via-white to-white p-4 shadow-sm"
            >
              <div className="text-sm font-semibold text-gray-900">{member.name}</div>
              <div className="text-xs uppercase tracking-wide text-indigo-500">{member.role}</div>
              <p className="mt-2 text-xs text-gray-600 leading-relaxed">“{member.quote}”</p>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Newly added support call-to-action */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: "spring", stiffness: 220, damping: 24 }}
        className="rounded-[32px] border border-white/50 bg-white/90 px-6 py-8 shadow-xl backdrop-blur"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Need a hand getting started?</h2>
            <p className="text-sm text-gray-600">
              Our support assistant can walk you through setup, fix common issues, or escalate anything urgent to the team. You don’t even need to sign in—help is one tap away.
            </p>
            <ul className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
              <li className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                ✅ Guided troubleshooting flows
              </li>
              <li className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                ✅ Escalate to a human in minutes
              </li>
              <li className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                ✅ Mobile friendly & multilingual tips
              </li>
              <li className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
                ✅ Available even before you sign in
              </li>
            </ul>
            <button
              onClick={() => nav("/support")}
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500"
            >
              Visit HelpHub Support
            </button>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, type: "spring", stiffness: 240, damping: 22 }}
            className="overflow-hidden rounded-[26px] border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-6 shadow-inner"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-500">
              Support preview
            </div>
            <p className="mt-2 text-sm text-gray-700">
              “Hi there! I’m the HelpHub assistant. Tell me what’s going on and I’ll point you to a fix or connect you with a team member.”
            </p>
            <div className="mt-4 space-y-2 text-[11px] text-gray-500">
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm">
                Example issue • “I can’t mark my request as done.”
              </div>
              <div className="rounded-2xl bg-white/80 px-3 py-2 shadow-sm">
                Assistant reply • “Tap the request in ‘Helping now’ and hit ‘Mark done’. Need a walkthrough?”
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
