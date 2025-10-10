# Airtime Crypto MVP

This is an MVP service that allows users to **buy airtime using USDC on Base**.  
It is designed to scale later to support other digital products (e.g., token gifting, bill payments).  

---

## System Overview  

- **Frontend (Next.js)**:  
  Users enter phone number + airtime amount, get a USDC equivalent, and confirm purchase.  

- **Backend (Next.js API + Supabase)**:  
  - Generates short, unguessable `order_ref` IDs.  
  - Stores all orders and their state transitions.  
  - Fetches live token → KES prices from [Coingecko](https://www.coingecko.com/) every few seconds and stores them in Supabase.  
  - Uses the stored prices for pricing, to avoid API rate-limit issues.  

- **Smart Contract (Solidity on Base)**:  
  - Accepts USDC payments with an attached `order_ref`.  
  - Emits `OrderPaid(order_ref, payer, amount)`.  
  - Provides `refund(order_ref)` and `withdrawTreasury()` functions.  

- **Airtime Provider Integration (Africa's Talking)**:  
  - Backend calls the airtime API after payment is detected.  
  - Updates order status → `fulfilled` or `refunded` accordingly.  
  - Handles validation and status callbacks from Africa’s Talking.  

---

## Database Schema (Supabase / Postgres)

```sql
-- prices table
create table prices (
  id bigserial primary key,
  token text not null,
  currency text not null,
  price numeric(18,6) not null,
  created_at timestamptz default now()
);

-- orders table
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_ref text unique not null,
  phone_number text not null,
  product_type text not null,
  amount numeric(18,2) not null,
  amount_usdc numeric(18,6) not null,
  status text not null default 'pending',
  tx_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- airtime transactions table
create table airtime_transactions (
  id bigserial primary key,
  order_id uuid references orders(id) on delete cascade,
  phone_number text not null,
  amount numeric(18,2) not null,
  provider_request_id text,
  provider_status text,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## Price Fetching  

The backend runs a cron/loop that fetches token prices from Coingecko:  

```bash
curl -X GET "https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=kes"   -H "accept: application/json"
```

- Fetched price is inserted into `prices` table.  
- All airtime purchases are priced based on the **last saved price**, not a direct API call.  

---

## Airtime API Integration  

- **Send Airtime**  
  Endpoint:  
  - Live: `https://api.africastalking.com/version1/airtime/send`  
  - Sandbox: `https://api.sandbox.africastalking.com/version1/airtime/send`  

  Example Request:  
  ```json
  {
    "username": "yourAppUsername",
    "recipients": [
      {
        "phoneNumber": "+254711XXXYYY",
        "amount": "KES 100.00"
      }
    ],
    "maxNumRetry": 3,
    "requestMetadata": {
      "orderRef": "abc123"
    }
  }
  ```

- **Validation Callback**  
  Africa’s Talking can POST to your `/api/airtime/validate` endpoint to confirm requests.  
  Response expected:  
  ```json
  { "status": "Validated" }
  ```

- **Status Callback**  
  Africa’s Talking sends transaction status updates (Success or Failed) to your `/api/airtime/status` endpoint.  

  Example:  
  ```json
  {
    "phoneNumber":"+254711XXXYYY",
    "description":"Airtime Delivered Successfully",
    "status":"Success",
    "requestId":"ATQid_SampleTxnId123",
    "discount":"KES 0.6000",
    "value":"KES 100.0000"
  }
  ```

- **Query Transaction Status**  
  ```bash
  curl -X GET 'https://api.africastalking.com/query/transaction/find?username=MyAppUserName&transactionId=ATQid_XXXV'     -H 'Accept: application/json'     -H 'Content-Type: application/json'     -H 'apiKey: MyAppAPIKey'
  ```

---

## Roadmap  

- [x] MVP: Airtime purchase flow (USDC → Airtime).  
- [ ] Add refund handling.  
- [ ] Extend to token gifting.  
- [ ] Multi-currency support.  
- [ ] Improve monitoring + logging.  

---