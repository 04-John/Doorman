# Doorman

**Know Your Agent for PayPal merchants.** Doorman lets real customers' AI agents shop a store, keeps scalper bots out, and ends every agent purchase with the customer approving the payment in PayPal.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Work in progress.

## Run it locally

Requires Node.js 22 or newer.

1. Copy `.env.example` to `.env` and fill in your PayPal sandbox app's Client ID and Secret.
2. Install dependencies: `npm install`
3. Check your PayPal keys: `npm run check:paypal`
4. Start the server: `npm run dev:server`, then open http://localhost:8787/health

## License

MIT
