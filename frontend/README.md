

## Getting Started

Install dependencies:

```bash
npm install
```

Set up environment variables:

```bash
cp .env.example .env.local
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_AFRICASTALKING_USERNAME`
- `NEXT_AFRICASTALKING_API_KEY`
- `NEXT_AFRICASTALKING_URL`

## API Routes

- `/api/orders` - Create and manage orders
- `/api/airtime/send` - Send airtime to phone numbers
- `/api/airtime/status` - Check airtime transaction status
- `/api/prices` - Get current airtime prices
