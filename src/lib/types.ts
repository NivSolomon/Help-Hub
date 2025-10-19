export type HHUser = {
  uid: string;
  displayName: string | null;
  photoURL: string | null;
  email: string | null;
  createdAt: number;
};

export type HelpRequest = {
  id: string;
  title: string;
  description: string;
  category: "errand" | "carry" | "fix" | "other";
  reward?: string;
  requesterId: string;
  helperId?: string;
  status: "open" | "accepted" | "done";
  location?: { lat: number; lng: number };
  createdAt: number;
  address?: {
    street?: string;
    houseNumber?: string;
    city?: string;
    postalCode?: string;
    notes?: string;
  };
};

export type Chat = {
  id: string;
  requestId: string;
  participants: string[]; // [requesterId, helperId]
  createdAt: number;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: number;
};

/** ----------------------------------------------------------------
 *  Categories (shared between NewRequestModal, Filters, etc.)
 *  ---------------------------------------------------------------- */
export const CATEGORIES = ["errand", "carry", "fix", "other"] as const;
export type Category = typeof CATEGORIES[number];
