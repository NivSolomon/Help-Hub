import { motion } from "framer-motion";

const LIFECYCLE_STEPS = [
  {
    id: "post",
    title: "Request posted",
    description: "A neighbor publishes what they need with location, timing, and notes.",
    details: [
      "Auto-notifies nearby helpers",
      "Checks for duplicate or risky phrasing",
    ],
    icon: "📝",
  },
  {
    id: "match",
    title: "Helper matches",
    description: "Helpers nearby get the ping, ask questions, and commit to help.",
    details: [
      "One-tap accept with ETA",
      "Built-in chat keeps personal numbers private",
    ],
    icon: "🤝",
  },
  {
    id: "in-progress",
    title: "In progress",
    description: "Everyone stays synced while the task is underway.",
    details: [
      "Live status updates & reminders",
      "Optional location check-in for pickups",
    ],
    icon: "🚶",
  },
  {
    id: "wrap",
    title: "Wrap-up & review",
    description: "Mark it done, leave a thank-you, and highlight great helpers.",
    details: [
      "Mutual reviews unlock future requests faster",
      "Confetti + impact stats keep motivation high",
    ],
    icon: "🎉",
  },
] as const;

const NUMBER_BADGES = ["1", "2", "3", "4"];

const pulseTransition = {
  repeat: Infinity,
  repeatType: "loop" as const,
  duration: 2,
  ease: "easeInOut" as const,
};

export default function RequestLifecycleDiagram({
  heading = "How a request comes to life",
  subheading = "A quick look at the built-in guardrails and touchpoints.",
}: {
  heading?: string;
  subheading?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: [0.22, 0.7, 0.36, 1] }}
      className="relative overflow-hidden rounded-[32px] border border-indigo-100 bg-white/90 px-6 py-8 shadow-xl backdrop-blur"
    >
      <div className="absolute right-[-40%] top-[-40%] h-72 w-72 rounded-full bg-indigo-300/10 blur-3xl" aria-hidden />
      <div className="absolute left-[-30%] bottom-[-30%] h-72 w-72 rounded-full bg-emerald-300/10 blur-3xl" aria-hidden />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
          <p className="text-sm text-gray-600">{subheading}</p>
        </div>
      </div>

      <div className="relative mt-8">
        <div className="pointer-events-none absolute left-[8%] right-[8%] top-[52px] hidden h-px bg-gradient-to-r from-indigo-200 via-violet-200 to-emerald-200 md:block" aria-hidden />

        <div className="grid gap-4 md:grid-cols-4">
          {LIFECYCLE_STEPS.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: index * 0.08, duration: 0.45, ease: [0.22, 0.7, 0.36, 1] }}
              className="group relative flex h-full flex-col gap-3 rounded-3xl border border-white/70 bg-white/80 p-5 shadow-sm backdrop-blur"
            >
              <span className="absolute -top-3 left-1/2 inline-flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-indigo-500 text-xs font-semibold text-white shadow-lg">
                {NUMBER_BADGES[index]}
              </span>
              {index < LIFECYCLE_STEPS.length - 1 && (
                <span className="pointer-events-none absolute right-[-18px] top-10 hidden h-9 w-9 rounded-full bg-gradient-to-br from-indigo-200/50 via-white to-emerald-200/70 shadow-lg md:inline-flex" aria-hidden />
              )}

              <div className="relative inline-flex items-center justify-center">
                <motion.span
                  className="absolute h-12 w-12 rounded-full bg-indigo-200/40"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={pulseTransition}
                  aria-hidden
                />
                <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-indigo-200 bg-white text-lg">
                  {step.icon}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                <p className="text-xs text-gray-600">{step.description}</p>
              </div>

              <ul className="mt-auto space-y-2 text-xs text-gray-600">
                {step.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-2">
                    <span className="mt-[3px] text-indigo-400" aria-hidden>
                      •
                    </span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>

              <motion.span
                className="pointer-events-none absolute inset-x-4 bottom-3 h-1 rounded-full bg-gradient-to-r from-indigo-200 via-white to-emerald-200 opacity-0"
                whileHover={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                aria-hidden
              />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
