export type SupportContextStep = {
  id: string;
  prompt: string;
  answerSummary?: string;
};

type EscalatePayload = {
  steps: SupportContextStep[];
  followUp?: string;
};

type EscalateResponse =
  | {
      type: "ok";
      message: string;
    }
  | {
      type: "error";
      message: string;
    };

export async function escalateSupport(
  payload: EscalatePayload
): Promise<EscalateResponse> {
  try {
    const res = await fetch("/api/v1/support/escalate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        type: "error",
        message:
          text || "Something went wrong while contacting the support assistant.",
      };
    }

    const data = (await res.json()) as { message?: string };
    return {
      type: "ok",
      message:
        data.message ??
        "Our support assistant is currently unavailable. Please try again shortly.",
    };
  } catch (error) {
    console.error("escalateSupport failed:", error);
    return {
      type: "error",
      message: "Network error while contacting the support assistant.",
    };
  }
}


