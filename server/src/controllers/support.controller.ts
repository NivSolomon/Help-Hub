import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env';

const escalateSchema = z.object({
  steps: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string().min(1),
        answerSummary: z.string().optional()
      })
    )
    .min(1),
  followUp: z.string().min(1).max(1200).optional()
});

const SYSTEM_PROMPT = `You are HelpHub Local's support assistant.
HelpHub Local is a neighbourhood favour-exchange app where neighbours post small tasks (carry a box, pick up a parcel) and helpers volunteer.
Provide calm, clear, actionable instructions that align with safety and trust guidelines. Avoid making up product behaviour—if you don't know, suggest contacting human support.
Keep responses under 180 words and use numbered steps for instructions.`;

export async function escalateSupportHandler(req: Request, res: Response) {
  const parse = escalateSchema.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({ message: 'Invalid request payload.' });
  }

  if (!env.OPENAI_API_KEY) {
    return res
      .status(503)
      .json({ message: 'Support assistant is temporarily unavailable.' });
  }

  const { steps, followUp } = parse.data;

  const userContext = [
    `Customer path:`,
    ...steps.map(
      (step, index) =>
        `${index + 1}. ${step.prompt}${
          step.answerSummary ? ` → Provided guidance: ${step.answerSummary}` : ''
        }`
    ),
    followUp ? `Additional details from user: ${followUp}` : undefined
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `A user still needs help after a decision-tree flow.\n${userContext}`
          }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        'OpenAI API error',
        response.status,
        response.statusText,
        text
      );
      return res
        .status(502)
        .json({ message: 'Could not reach the support assistant right now.' });
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const message =
      data.choices?.[0]?.message?.content?.trim() ??
      'The support assistant could not generate a response.';

    return res.json({ message });
  } catch (error) {
    console.error('Support escalation failed', error);
    return res
      .status(500)
      .json({ message: 'Unexpected error contacting the support assistant.' });
  }
}


