# Architecture Overview

This document provides an overview of the project's architecture, logic flow, and API endpoints.

## Database Schema

### `orders`

| Column         | Type      | Description                               |
| -------------- | --------- | ----------------------------------------- |
| id             | UUID      | Unique order identifier                   |
| order_ref      | TEXT      | Order reference number                    |
| phone_number   | TEXT      | Phone number for airtime                  |
| product_type   | TEXT      | Type of product (e.g., "airtime")        |
| amount_kes     | NUMERIC   | Amount in KES                             |
| amount_usdc    | NUMERIC   | Amount in USDC                            |
| status         | TEXT      | Order status (e.g., "pending", "fulfilled", "refunded") |
| wallet_address | TEXT      | User's wallet address                     |
| created_at     | TIMESTAMP | Order creation timestamp                |
| updated_at     | TIMESTAMP | Order update timestamp                  |
| tx_hash        | TEXT      | Blockchain transaction hash               |

### `prices`

| Column     | Type      | Description                     |
| ---------- | --------- | ------------------------------- |
| id         | UUID      | Unique price identifier         |
| token      | TEXT      | Token symbol (e.g., "USDC")     |
| currency   | TEXT      | Currency code (e.g., "KES")     |
| price      | NUMERIC   | Price of the token in currency  |
| created_at | TIMESTAMP | Price creation timestamp        |

### `airtime_transactions`

| Column              | Type      | Description                                     |
| ------------------- | --------- | ----------------------------------------------- |
| id                  | UUID      | Unique transaction identifier                   |
| order_id            | UUID      | Foreign key referencing the `orders` table      |
| phone_number        | TEXT      | Phone number for airtime                        |
| amount_kes          | NUMERIC   | Amount in KES                                   |
| provider_request_id | TEXT      | Africa's Talking request ID                     |
| provider_status     | TEXT      | Status from Africa's Talking (e.g., "Success", "Failed") |
| created_at          | TIMESTAMP | Transaction creation timestamp                  |
| updated_at          | TIMESTAMP | Transaction update timestamp                    |
| error_message       | TEXT      | Error message if the transaction failed         |

## Smart Contracts

### `Airtime.sol`

This contract manages the airtime distribution process.

*   **Events:**
    *   `OrderPaid(string orderRef, address payer, uint256 amount)`:  Emitted when an order is paid.
    *   `Refunded(string orderRef, address receiver, uint256 amount)`: Emitted when a refund is issued.
    *   `TreasuryWithdrawal(address receiver, uint256 amount)`: Emitted when the treasury withdraws funds.
*   **State Variables:**
    *   `treasury`: Address of the treasury, which can withdraw funds and issue refunds.
    *   `depositCounter`: Counter for the number of deposits.
    *   `contractAddress`: Address of the contract, set by the deployer.
*   **Modifiers:**
    *   `onlyTreasury`:  Restricts function access to the treasury address.
*   **Functions:**
    *   `constructor(address _contractAddress)`: Sets the treasury and contract address.
        *   **Parameters:**
            *   `_contractAddress`: The address of the contract.
    *   `depositWithPermit(string memory depositRef, address token, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)`: Allows users to deposit tokens using a permit signature for gasless approval.
        *   **Parameters:**
            *   `depositRef`: The reference of the deposit.
            *   `token`: Address of the token being deposited.
            *   `amount`: Amount of tokens to deposit.
            *   `deadline`: Deadline for the permit signature.
            *   `v, r, s`: Components of the permit signature.
        *   **Returns:**
            *   `depositId`: The ID of the deposit.
        *   **Emits:**
            *   `OrderPaid(depositRef, msg.sender, amount)`
    *   `refund(string memory orderRef, address receiver, uint256 amount, address tokenAddress) external onlyTreasury nonReentrant`: Allows the treasury to refund tokens to a receiver.
        *   **Parameters:**
            *   `orderRef`: Reference of the order being refunded.
            *   `receiver`: Address to receive the refund.
            *   `amount`: Amount of tokens to refund.
            *   `tokenAddress`: Address of the token to refund.
        *   **Emits:**
            *   `Refunded(orderRef, receiver, amount)`
    *   `withdrawTreasury(address receiver, uint256 amount) external onlyTreasury`: Allows the treasury to withdraw tokens.
        *   **Parameters:**
            *   `receiver`: Address to receive the withdrawn tokens.
            *   `amount`: Amount of tokens to withdraw.
        *   **Emits:**
            *   `TreasuryWithdrawal(receiver, amount)`

## Frontend API Endpoints

The frontend uses Next.js API routes to interact with the smart contract and other services.

### `/api/airtime/send`

*   **Method:** `POST`
*   **Description:** Sends airtime to a phone number using Africa's Talking API.
*   **Request Body:**
    *   `orderRef`:  (string, required) The order reference.
    *   `txHash`: (string, required) The transaction hash from the smart contract.
*   **Response:**
    *   **Success (200):** `{ success: true, requestId: string }`
    *   **Error (400, 404, 500):** `{ error: string, details?: string }`

### `/api/airtime/status`

*   **Method:** `POST`
*   **Description:** Updates the status of an airtime transaction.
*   **Request Body:**
    *   `requestId`: (string, required) The Africa's Talking request ID.
    *   `status`: (string, required) The status of the transaction (`Success` or `Failed`).
*   **Response:**
    *   **Success (200):** `{ success: true }`
    *   **Error (404, 500):** `{ error: string }`

### `/api/airtime/validate`

*   **Method:** `POST`
*   **Description:** Validates an airtime transaction callback from Africa's Talking.
*   **Request Body:**
    *   `transactionId`: (string, required) The Africa's Talking transaction ID.
    *   `phoneNumber`: (string, required) The phone number.
    *   `sourceIpAddress`: (string, required) The IP address of the request.
    *   `currencyCode`: (string, required) The currency code.
    *   `amount`: (string, required) The amount.
*   **Response:**
    *   **Success (200):** `{ status: 'Validated' }`
    *   **Error (400, 403, 404, 500):** `{ status: 'Failed' }`

### `/api/auth`

*   **Method:** `GET`
*   **Description:** Authenticates a user using Farcaster Quick Auth.
*   **Request Headers:**
    *   `Authorization`: `Bearer <token>` (required)
*   **Response:**
    *   **Success (200):** `{ userFid: string }`
    *   **Error (401, 500):** `{ message: string }`

### `/api/orders`

*   **Method:** `POST`
*   **Description:** Creates a new order.
*   **Request Body:**
    *   `phoneNumber`: (string, required) The phone number.
    *   `amountKes`: (number, required) The amount in KES (will be converted to the appropriate currency based on the phone number's country code).
    *   `walletAddress`: (string, required) The user's wallet address.
*   **Response:**
    *   **Success (200):**
        ```json
        {
          "orderRef": "string",
          "amountKes": number,
          "amountUsdc": number,
          "price": number,
          "orderId": number
        }
        ```
    *   **Error (400):** `{ error: string }` (e.g., "Missing phoneNumber, amountKes, or walletAddress", "Amount must be between ...")
    *   **Error (500):** `{ error: string }`

### `/api/prices`

*   **Method:** `GET`
*   **Description:** Retrieves the latest price of USDC in a specified currency.
*   **Query Parameters:**
    *   `currency`: (optional) The currency to retrieve the price in (e.g., "KES", "UGX", "TZS", "RWF"). Defaults to "KES".
*   **Response:**
    *   **Success (200):** `{ success: true, price: number }`
    *   **Error (500):** `{ success: false, price: 0 }`

## Logic Flow

1.  The user initiates an order on the frontend, providing their phone number, amount, and wallet address.
2.  The frontend sends a `POST` request to `/api/orders` to create a new order.
3.  The `/api/orders` endpoint determines the country code from the phone number and uses it to:
    *   Determine the currency to use (KES, TZS, UGX, RWF).
    *   Enforce amount restrictions based on the country.
    *   Fetch the latest price of USDC in the determined currency from the database.
4.  The `/api/orders` endpoint calculates the equivalent amount in USDC and stores the order details in the Supabase database with a `pending` status. It then returns the order ID and the amount of USDC to pay to the frontend.
5.  The frontend receives the order ID and the amount of USDC to pay from the `/api/orders` endpoint.
6.  The frontend uses the order ID and amount to trigger the Metamask popup, prompting the user to pay the USDC amount. The `depositWithPermit` function in the smart contract is called with the amount to be paid. 
7.  The smart contract returns the deposit ID and the amount paid. The frontend also stores the transaction hash and deposit ID.
8.  After the payment is confirmed on the blockchain, the frontend sends a `POST` request to `/api/airtime/send` with the order reference and transaction hash. The amount to be paid is also checked against the order ID.
9.   If the airtime transaction fails, the order status is updated to `refunded` in the `orders` table.
10. The `/api/airtime/send` endpoint updates the Supabase record with the transaction hash.
11. The `/api/airtime/send` endpoint uses the Africa's Talking API to send airtime to the user's phone number.
12. Africa's Talking sends a callback to `/api/airtime/validate` to validate the transaction. The `/api/airtime/validate` endpoint verifies the callback data against the data stored in the `airtime_transactions` table.
13. The Africa's Talking API sends status updates to `/api/airtime/status`.
14. The `/api/airtime/status` endpoint updates the order status in the Supabase database based on the Africa's Talking status.

## Tracking Refunds

Refunds are tracked through the following mechanisms:

*   **`Refunded` event:** The `Airtime.sol` contract emits the `Refunded` event when a refund is issued.
*   **`orders` table:** The `status` column in the `orders` table is updated to `refunded` when a refund is processed.
*   **`airtime_transactions` table:** The `error_message` column in the `airtime_transactions` table may contain information about the reason for the refund.

## Multiple Entries from the Frontend

The frontend interacts with the backend through multiple API endpoints, as described above. Each endpoint handles a specific part of the airtime purchase and distribution process. The main entry points from the frontend are:

*   `/api/orders`: To create a new order.
*   `/api/airtime/send`: To initiate the airtime sending process after payment.
*   `/api/prices`: To get the latest USDC/KES exchange rate.
*   `/api/auth`: To authenticate users using Farcaster.