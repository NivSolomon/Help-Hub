import React from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import AuthGate from "../components/AuthGate";
import beaverStanding from "../assets/BeaverStanding.png";
import RequestLifecycleDiagram from "../components/RequestLifecycleDiagram";

const pillars = [
  {
    icon: "🤝",
    title: "Trust-first community",
    description:
      "Every request begins with verified profiles, transparent reviews, and real conversations. You always know who you’re teaming up with.",
  },
  {
    icon: "⚡",
    title: "Moments, not months",
    description:
      "From idea to action in minutes. Drop a request, watch nearby helpers respond, and close the loop with gratitude and reviews.",
  },
  {
    icon: "🌍",
    title: "Hyper-local impact",
    description:
      "The more we help each other, the stronger every street becomes. Coffee couriers, toolbox heroes, errand ninjas—this is your network.",
  },
];

const timeline = [
  {
    year: "2023",
    headline: "A neighborhood experiment",
    copy: "We launched in Tel Aviv to connect neighbors who needed a spare pair of hands with those who had a few minutes to help.",
  },
  {
    year: "2024",
    headline: "From chats to friendships",
    copy: "Dozens of communities embraced HelpHub Local, sharing 3.4k+ finished requests, countless coffees, and real connections.",
  },
  {
    year: "Today",
    headline: "You’re part of the story",
    copy: "With every request you post—or every time you say ‘I can help’—you’re building the kind of neighborhood we all want to live in.",
  },
];

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

export default function AboutPage() {
  const navigate = useNavigate();

  return (
    <AuthGate>
      <Navbar />
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-emerald-50">
        <div className="pointer-events-none absolute inset-0">
          <span className="absolute -left-24 top-16 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
          <span className="absolute right-[-12%] top-32 h-64 w-64 rounded-full bg-emerald-200/35 blur-3xl" />
          <span className="absolute bottom-[-14%] left-[25%] h-80 w-80 rounded-full bg-purple-200/30 blur-3xl" />
        </div>

        <main className="relative mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            className="rounded-[32px] border border-white/50 bg-white/95 p-8 shadow-[0_30px_90px_rgba(15,23,42,0.18)] backdrop-blur-xl"
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-4 lg:max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-500">
                  About HelpHub Local
                </p>
                <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                  We connect neighbors so everyday tasks feel lighter.
                </h1>
                <p className="text-sm text-gray-600 sm:text-base">
                  From quick errands to last-minute help, HelpHub Local keeps the
                  right people in the loop at the right moment. It’s not just an
                  app—it’s a community operating system powered by you.
                </p>
                <div className="grid gap-3 text-xs sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-gray-600 shadow-sm">
                    <div className="text-gray-500">Requests completed</div>
                    <div className="text-lg font-semibold text-gray-900">3.4k+</div>
                  </div>
                  <div className="rounded-2xl border border-white/60 bg-white/80 px-4 py-3 text-gray-600 shadow-sm">
                    <div className="text-gray-500">Avg response time</div>
                    <div className="text-lg font-semibold text-gray-900">&lt; 10 minutes</div>
                  </div>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 240, damping: 22 }}
                className="mx-auto flex w-full max-w-[260px] items-end justify-center lg:mx-0"
              >
                <img
                  src={beaverStanding}
                  alt="HelpHub Local mascot"
                  className="w-full max-w-[220px] object-contain"
                  loading="lazy"
                />
              </motion.div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {pillars.map((pillar) => (
                <motion.article
                  key={pillar.title}
                  whileHover={{ y: -4 }}
                  className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm"
                >
                  <div className="text-2xl">{pillar.icon}</div>
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">
                    {pillar.title}
                  </h3>
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                    {pillar.description}
                  </p>
                </motion.article>
              ))}
            </div>
          </motion.section>

          <RequestLifecycleDiagram
            heading="What happens after you post?"
            subheading="From first tap to thankful review, every stage has cues that keep neighbors coordinated and safe."
          />

          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 24 }}
            className="rounded-[32px] border border-white/50 bg-white/90 px-6 py-8 shadow-xl backdrop-blur"
          >
            <h2 className="text-lg font-semibold text-gray-900">How we got here</h2>
            <p className="mt-1 text-sm text-gray-600">
              HelpHub Local grew from one block to a city-wide network thanks to
              everyday people who decided helping should feel natural.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {timeline.map((step) => (
                <div
                  key={step.year}
                  className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-sm"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                    {step.year}
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-gray-900">
                    {step.headline}
                  </h3>
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                    {step.copy}
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

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
                  We’re a tiny core team backed by moderators, volunteers, and
                  generous beta testers. Every release, every new idea—comes from
                  you.
                </p>
              </div>
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 self-start rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600"
              >
                Back to dashboard
              </button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {team.map((member) => (
                <div
                  key={member.name}
                  className="rounded-2xl border border-gray-100 bg-gradient-to-br from-indigo-50/70 via-white to-white p-4 shadow-sm"
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {member.name}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-indigo-500">
                    {member.role}
                  </div>
                  <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                    “{member.quote}”
                  </p>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, type: "spring", stiffness: 220, damping: 24 }}
            className="rounded-[32px] border border-indigo-200 bg-indigo-50/80 px-6 py-8 text-indigo-900 shadow-xl backdrop-blur"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl space-y-2">
                <h2 className="text-lg font-semibold">Ready to launch your next request?</h2>
                <p className="text-sm text-indigo-800">
                  Whether you need a quick favor or want to offer a hand, HelpHub
                  Local is strongest when the feed stays active.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => navigate("/")}
                  className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  View requests
                </button>
                <button
                  onClick={() => navigate("/", { state: { openNewRequest: true } })}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-500"
                >
                  Create new request
                </button>
              </div>
            </div>
          </motion.section>
        </main>
      </div>
    </AuthGate>
  );
}
