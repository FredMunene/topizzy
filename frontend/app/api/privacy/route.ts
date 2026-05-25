import { NextResponse } from 'next/server';

const PRIVACY = {
  lastUpdated: '2026-05-25',
  sections: [
    {
      heading: '1. Information We Collect',
      body: [
        'Wallet address: collected when you connect your wallet to initiate a transaction. Used solely to process and track your payment.',
        'Phone number: collected when you enter a number to top up. Used to deliver airtime or data bundles to the correct recipient.',
        'Transaction data: order reference, amount in local currency and USDC, service fee, on-chain transaction hash, and order status are stored in our database to fulfil your order and provide support.',
        'Location (country): we use your IP address to auto-detect your country and pre-select the correct dial code. We do not store your IP address beyond the request.',
        'Usage data: we log API errors and anonymised event data to monitor service health. No personally identifiable information is included in these logs.',
      ],
    },
    {
      heading: '2. How We Use Your Information',
      body: [
        'To process your airtime or data bundle purchase and deliver it to the phone number you provide.',
        'To calculate the correct exchange rate and service fee for your transaction.',
        'To detect and prevent fraud or abuse of the Service.',
        'To respond to support requests you initiate via WhatsApp or email.',
        'To monitor and improve the reliability and performance of the platform.',
      ],
    },
    {
      heading: '3. Data Sharing',
      body: [
        'Airtime providers: your phone number and the top-up amount are shared with the relevant mobile network operator or airtime aggregator to fulfil your order. No wallet or payment data is shared.',
        'Blockchain: your wallet address and transaction hash are recorded on the Base blockchain, which is a public ledger. This data is visible to anyone.',
        'Service providers: we use Supabase (database), Coinbase (exchange rates), and Vercel (hosting). Each provider processes only the data necessary for their function and is bound by their own privacy policies.',
        'We do not sell, rent, or trade your personal information to third parties for marketing purposes.',
      ],
    },
    {
      heading: '4. Data Retention',
      body: [
        'Order records (phone number, wallet address, amounts, status) are retained for a minimum of 12 months to support dispute resolution and regulatory compliance.',
        'You may request deletion of your data by contacting us at hello@topizzy.com. Note that transaction data recorded on the blockchain cannot be deleted.',
      ],
    },
    {
      heading: '5. Security',
      body: [
        'Payments are processed through an audited smart contract on Base. Topizzy never has custody of your USDC or access to your private keys.',
        'We use industry-standard encryption (TLS) for all data in transit and follow security best practices for data at rest.',
        'Despite these measures, no internet transmission or storage system is 100% secure. Use the Service at your own risk.',
      ],
    },
    {
      heading: '6. Your Rights',
      body: [
        'You have the right to access, correct, or request deletion of personal data we hold about you (subject to legal retention obligations).',
        'To exercise these rights, contact us at hello@topizzy.com with the subject line "Data Request". We will respond within 30 days.',
      ],
    },
    {
      heading: '7. Cookies',
      body: [
        'We do not use tracking or advertising cookies. The platform may use essential session-related browser storage to maintain your wallet connection state within a single session.',
      ],
    },
    {
      heading: '8. Children\'s Privacy',
      body: [
        'The Service is not directed at anyone under the age of 18. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us immediately.',
      ],
    },
    {
      heading: '9. Changes to This Policy',
      body: [
        'We may update this Privacy Policy from time to time. The "Last Updated" date at the top of this page reflects the most recent revision. Continued use of the Service after changes are posted constitutes your acceptance of the revised Policy.',
      ],
    },
    {
      heading: '10. Contact',
      body: [
        'For privacy-related questions or requests, contact us at hello@topizzy.com or via WhatsApp at +254 769 007 848.',
      ],
    },
  ],
};

export async function GET() {
  return NextResponse.json(PRIVACY, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
