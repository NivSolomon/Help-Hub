import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import {
  ROOT_NODE_ID,
  SUPPORT_TREE,
  type SupportNode,
  type SupportOption,
} from "../lib/supportTree";
import { escalateSupport } from "../lib/support";
import beaverIllustration from "../assets/BeaverCartoon.png";

type EscalationState =
  | { status: "idle" }
  | { status: "input" }
  | { status: "loading" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export default function Support() {
  const [path, setPath] = React.useState<string[]>([ROOT_NODE_ID]);
  const [escalation, setEscalation] = React.useState<EscalationState>({
    status: "idle",
  });
  const [followUp, setFollowUp] = React.useState("");

  const currentId = path[path.length - 1] ?? ROOT_NODE_ID;
  const currentNode: SupportNode = SUPPORT_TREE[currentId] ?? SUPPORT_TREE.root;

  const isAnswer = Boolean(currentNode.answer);

  const options: SupportOption[] = currentNode.options ?? [];

  function goTo(nextId: string) {
    setPath((prev) => [...prev, nextId]);
    setEscalation({ status: "idle" });
    setFollowUp("");
  }

  function goBack() {
    if (path.length <= 1) return;
    setPath((prev) => prev.slice(0, -1));
    setEscalation({ status: "idle" });
    setFollowUp("");
  }

  async function handleEscalate() {
    if (escalation.status === "loading") return;
    setEscalation({ status: "loading" });

    const steps = path.map((id) => {
      const node = SUPPORT_TREE[id];
      return {
        id,
        prompt: node?.prompt ?? id,
        answerSummary: node?.answer?.summary,
      };
    });

    const response = await escalateSupport({
      steps,
      followUp: followUp.trim() || undefined,
    });

    if (response.type === "ok") {
      setEscalation({ status: "done", message: response.message });
    } else {
      setEscalation({ status: "error", message: response.message });
    }
  }

  const breadcrumbs = path
    .map((id) => SUPPORT_TREE[id]?.prompt ?? "")
    .filter(Boolean);

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen bg-gradient-to-br from-indigo-50 via-white to-emerald-50 pb-16">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute -left-24 top-32 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl" />
          <span className="absolute right-[-10%] top-48 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
          <span className="absolute bottom-[-12%] left-1/3 h-64 w-64 rounded-full bg-purple-200/35 blur-3xl" />
        </div>

        <div className="relative mx-auto flex max-w-4xl flex-col gap-6 px-4 pt-10 sm:px-6">
          <header className="rounded-3xl border border-white/50 bg-white/90 p-6 shadow-xl backdrop-blur">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 22 }}
                className="mx-auto flex w-full max-w-[220px] items-center justify-center sm:mx-0 sm:max-w-[260px]"
              >
                <img
                  src={beaverIllustration}
                  alt="HelpHub support beaver"
                  className="w-full max-w-[220px] sm:max-w-none"
                  loading="lazy"
                />
              </motion.div>
              <div className="max-w-2xl space-y-3 text-center sm:text-left">
                <h1 className="text-3xl font-bold text-gray-900">
                  HelpHub Support
                </h1>
                <p className="text-sm text-gray-600">
                  Answer a couple of quick questions so we can share the right fix.
                  If the suggestions don’t solve it, we’ll connect you with the
                  support assistant.
                </p>
              </div>
            </div>
          </header>

          <div className="rounded-3xl border border-white/50 bg-white/95 p-6 shadow-xl backdrop-blur">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={`${crumb}-${index}`}>
                  <span>{crumb}</span>
                  {index < breadcrumbs.length - 1 && (
                    <span className="text-gray-300">›</span>
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  {currentNode.prompt}
                </h2>

                <button
                  onClick={goBack}
                  disabled={path.length <= 1}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Back
                </button>
              </div>

              {!isAnswer && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {options.map((option) => (
                    <motion.button
                      key={option.id}
                      onClick={() => goTo(option.next)}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex flex-col items-start gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-4 text-left text-sm shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                    >
                      <span className="font-semibold text-gray-900">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="text-xs text-gray-600">
                          {option.description}
                        </span>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}

              {isAnswer && currentNode.answer && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/80 p-5 shadow-inner">
                    <h3 className="text-lg font-semibold text-indigo-800">
                      {currentNode.answer.title}
                    </h3>
                    <p className="mt-2 text-sm text-indigo-700">
                      {currentNode.answer.summary}
                    </p>
                  </div>

                  {currentNode.answer.steps && (
                    <ol className="space-y-3 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
                      {currentNode.answer.steps.map((step, idx) => (
                        <li key={idx} className="flex gap-3 text-sm text-gray-700">
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600">
                            {idx + 1}
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {currentNode.answer.links && (
                    <div className="flex flex-wrap gap-2">
                      {currentNode.answer.links.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white/90 p-5 shadow-sm">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Still need help?
                      </p>
                      <p className="text-xs text-gray-500">
                        We can share your answers with the support assistant for
                        a tailored reply.
                      </p>
                    </div>

                    <AnimatePresence mode="wait">
                      {escalation.status === "input" && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="space-y-3"
                        >
                          <textarea
                            value={followUp}
                            onChange={(e) => setFollowUp(e.target.value)}
                            placeholder="Add any extra context so the assistant knows what you tried."
                            className="h-24 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                          <button
                            onClick={handleEscalate}
                            disabled={escalation.status === "loading"}
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {escalation.status === "loading"
                              ? "Contacting assistant..."
                              : "Send to support assistant"}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {escalation.status === "idle" && (
                      <button
                        onClick={() => setEscalation({ status: "input" })}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-indigo-200 px-4 py-2 text-xs font-semibold text-indigo-600 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50"
                      >
                        Ask the support assistant
                      </button>
                    )}

                    {escalation.status === "done" && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
                        {escalation.message}
                      </div>
                    )}

                    {escalation.status === "error" && (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
                        {escalation.message}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}


