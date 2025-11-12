export type SupportOption = {
  id: string;
  label: string;
  next: string;
  description?: string;
};

export type SupportAnswer = {
  title: string;
  summary: string;
  steps?: string[];
  links?: Array<{ label: string; href: string }>;
};

export type SupportNode = {
  id: string;
  prompt: string;
  options?: SupportOption[];
  answer?: SupportAnswer;
};

type SupportTree = Record<string, SupportNode>;

export const SUPPORT_TREE: SupportTree = {
  root: {
    id: "root",
    prompt: "What can we help you with today?",
    options: [
      {
        id: "post-request",
        label: "Posting a new request",
        next: "post-request",
        description: "Creating or managing a help request you opened",
      },
      {
        id: "helping-request",
        label: "Helping on someone else's request",
        next: "helper-flow",
        description: "Issues while accepting or completing a request",
      },
      {
        id: "account-profile",
        label: "Account & profile details",
        next: "account-profile",
        description: "Verification, profile edits, notifications",
      },
      {
        id: "other",
        label: "Something else",
        next: "other",
        description: "Anything not covered above",
      },
    ],
  },
  "post-request": {
    id: "post-request",
    prompt: "Pick the issue that matches best:",
    options: [
      {
        id: "post-validation",
        label: "The request form keeps blocking me",
        next: "post-validation-answer",
      },
      {
        id: "post-location",
        label: "Map or location pin looks wrong",
        next: "post-location-answer",
      },
      {
        id: "post-edit",
        label: "I need to edit or cancel a request",
        next: "post-edit-answer",
      },
    ],
  },
  "post-validation-answer": {
    id: "post-validation-answer",
    prompt: "Form validation tips",
    answer: {
      title: "Form blocked? Do a quick checklist.",
      summary:
        "Requests fail to submit most often because a required field is blank or the address couldn’t be verified.",
      steps: [
        "Make sure the title and description have at least 10 characters. Mention what, when, and any access info.",
        "Confirm the city, street, and house number fields are filled. The address chip needs to turn green (“Address verified ✓”).",
        "Drop the map pin inside your neighbourhood radius. If the pin is far off, we block the request for safety.",
        "Still blocked? Refresh the page, try again, and if it persists share the exact error using the button below.",
      ],
    },
  },
  "post-location-answer": {
    id: "post-location-answer",
    prompt: "Location troubleshooting",
    answer: {
      title: "Fixing map and pin problems",
      summary:
        "Here’s how to correct a pin that’s drifting or a map that doesn’t show your area.",
      steps: [
        "Use the “My location” target button once to centre the map on you.",
        "Drag the map and click once where help is needed—avoid double tapping (it zooms instead of placing).",
        "If the pin jumps, zoom in closer and try again. Pins snap to the street centre lines at high zoom.",
        "When the pin is in place, the coordinates preview updates underneath. Copy those when chatting with helpers.",
      ],
    },
  },
  "post-edit-answer": {
    id: "post-edit-answer",
    prompt: "Editing or cancelling requests",
    answer: {
      title: "Update or cancel an existing request",
      summary:
        "You can change the details as long as no helper is currently marked as in-progress.",
      steps: [
        "Open the Home board and select the request from the sidebar list.",
        "Click “Edit request” for small text changes or “Cancel request” if you no longer need help.",
        "If a helper already accepted it, message them first. Cancelling too late can impact your reliability score.",
      ],
    },
  },
  "helper-flow": {
    id: "helper-flow",
    prompt: "What’s blocking you as a helper?",
    options: [
      {
        id: "helper-accept",
        label: "I can’t accept a request",
        next: "helper-accept-answer",
      },
      {
        id: "helper-chat",
        label: "Chat is missing or messages won’t send",
        next: "helper-chat-answer",
      },
      {
        id: "helper-mark",
        label: "Marking a favor as done",
        next: "helper-done-answer",
      },
    ],
  },
  "helper-accept-answer": {
    id: "helper-accept-answer",
    prompt: "Accepting requests",
    answer: {
      title: "Why “I can help” might be greyed out",
      summary:
        "We stop helpers from joining if they’re missing profile fields or someone else already accepted.",
      steps: [
        "Check the status badge. If it says “Accepted” or “In progress”, another helper beat you to it.",
        "Verify your profile is complete (birthdate, phone, address). Incomplete profiles can’t accept.",
        "If you recently completed a request, wait a minute—the list auto-refreshes with open slots.",
      ],
    },
  },
  "helper-chat-answer": {
    id: "helper-chat-answer",
    prompt: "Chat assistance",
    answer: {
      title: "Restoring chat access",
      summary:
        "Chats open automatically the moment you or the requester accepts each other.",
      steps: [
        "From Home > Active conversations, pick the relevant request to reopen chat.",
        "If the panel is empty, refresh: you might be signed out in another tab.",
        "Still nothing? The requester may have cancelled. You’ll get a notification if they re-open.",
      ],
    },
  },
  "helper-done-answer": {
    id: "helper-done-answer",
    prompt: "Marking completion",
    answer: {
      title: "Finishing the favor properly",
      summary:
        "Only the requester can officially mark a request as done, but helpers can nudge them.",
      steps: [
        "Send a quick chat message letting them know everything is finished.",
        "If they’re unresponsive for 12 hours, the system auto-prompts them again.",
        "Once marked done, you’ll both get the review prompt—respond within 48 hours to keep your streak.",
      ],
    },
  },
  "account-profile": {
    id: "account-profile",
    prompt: "Choose the account topic:",
    options: [
      {
        id: "account-verify",
        label: "Verification or sign-in issues",
        next: "account-verify-answer",
      },
      {
        id: "account-notifications",
        label: "Notifications or reminders",
        next: "account-notifications-answer",
      },
      {
        id: "account-profile-edit",
        label: "Updating my profile info",
        next: "account-profile-edit-answer",
      },
    ],
  },
  "account-verify-answer": {
    id: "account-verify-answer",
    prompt: "Verification tips",
    answer: {
      title: "Finish verification to unlock everything",
      summary:
        "We ask for phone, email, and a quick selfie to keep the community safe.",
      steps: [
        "Open Profile > Edit profile. Make sure phone and address fields are filled.",
        "Tap “Verify phone” to re-run SMS verification if you missed it earlier.",
        "If the selfie step fails, use natural lighting and remove hats or masks.",
      ],
    },
  },
  "account-notifications-answer": {
    id: "account-notifications-answer",
    prompt: "Managing notifications",
    answer: {
      title: "Control your reminders",
      summary:
        "You can pick which alerts arrive by email or push notifications.",
      steps: [
        "Go to Profile > Settings > Notifications.",
        "Toggle request updates, chat messages, and review reminders individually.",
        "Muting everything for more than 7 days will pause new helper invites.",
      ],
    },
  },
  "account-profile-edit-answer": {
    id: "account-profile-edit-answer",
    prompt: "Editing profile info",
    answer: {
      title: "Keep your profile current",
      summary:
        "Edit your name, bio, and address from the profile page and the changes sync instantly.",
      steps: [
        "Visit Profile and tap “Edit profile”.",
        "Update your bio with what you’re good at helping with—it improves matches.",
        "If you move neighbourhoods, update your address to see the right map radius.",
      ],
    },
  },
  other: {
    id: "other",
    prompt: "Other issues",
    answer: {
      title: "We’ll take it from here",
      summary:
        "If none of the above topics fit, share a short description and we’ll route it to the support assistant.",
      steps: [
        "Click “Still need help” below.",
        "Add a sentence with what you expected to happen versus what occurred.",
        "We’ll include your previous selections so the assistant has context.",
      ],
    },
  },
};

export const ROOT_NODE_ID = "root";


