# DecisionMate v1 prototype

A self-contained browser prototype for a guided **Think → Decide → Check in → Reflect** experience.

## Run with the AI conversation

The app uses one server-side model through Cloudflare Workers AI: Meta Llama 3.1 8B Instruct FP8 Fast. The model name and provider remain out of the student UI. The chat sends the current session transcript to the Worker. Completed conversations are saved in the student's browser storage and are not uploaded as app history or synced to other devices. Cloudflare says it does not use Workers AI customer content to train models or improve its services.

1. Create a Cloudflare account and install Node.js.
2. From this folder, run `npx wrangler login` and sign in to Cloudflare.
3. Run `npx wrangler dev` and open the local URL Wrangler prints. This uses the remote Workers AI binding, so it consumes the account’s AI allowance.
4. Run `npx wrangler deploy` to publish the app and its `/api/chat` endpoint.

Cloudflare’s Free plan currently includes 10,000 AI Neurons per day. That allowance is shared with other Workers AI use on the account; if it is exhausted, model calls stop until the quota resets. The Worker caps replies at 110 tokens. Check the account’s quota before a student pilot.

The page tells students that messages are sent to the AI and asks them not to enter names or contact details. Don’t put credentials in frontend files.

## Open without Cloudflare

The static app files are in `public/`. Without the Worker, opening `public/index.html` in a modern browser shows the interface; the chat falls back to guided prompts and displays a notice that AI replies are unavailable.

## What’s included

- Five optional student dilemma starters plus free text.
- An adaptive six-question Think flow, followed by the student's decision and satisfaction check.
- Page navigation from the result to the conversation and then back home.
- An explicit “So, what do you decide?” prompt, followed by “Are you satisfied with your current decision?” A yes answer shows an affirmation and the decision style; a no answer ends with a thank-you message.
- A three-stage conversation meter for outsourced, consultative, and empowered decision making, plus one highlighted emoji style on the result page: undecided, consultative, or empowered.
- Conversation guidance that adapts to the student's formal, casual, or gently playful writing style.
- A subtly darker overall palette, a conversation background that shifts with a local tone impression, and a small animated emoji beside each student message, including a happy reaction when the student states a decision.
- A final decision snapshot with a print-to-PDF download action.
- Completed conversations are saved in the current browser's local storage. Students can open a past conversation or revisit a decision; each revisit is stored as a separate conversation linked to its earlier versions. Saved conversations do not sync across browsers or devices and can be cleared from the home page.
- Responsive layouts and a one-click new session.

## Prototype boundary

When the Worker is running, the model generates the conversation prompts. If it is unavailable, the browser uses guided prompts. Decision styles and the conversation meter use local phrase rules; they are rough reflections, not validated assessments. The Worker limits prompt size and reply length and does not log conversation text. This prototype does not yet include per-student authentication or durable rate limiting, so add those before a public student pilot.

The PDF refers to five existing dilemma starters but doesn’t enumerate their wording, so the prototype uses representative student scenarios. Replace the starter data in `public/app.js` with the approved copy when available.
