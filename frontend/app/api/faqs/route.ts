import { NextResponse } from 'next/server';

// Static FAQ data. Future: migrate to DB table so content can be managed
// without a redeploy (tracked in GitHub issue #faqs-cms).
const FAQS = [
  {
    id: 1,
    question: 'What is Topizzy?',
    answer:
      'Topizzy lets you convert USDC crypto into mobile airtime and data bundles instantly for phone numbers across Africa. No bank account or card needed — just a crypto wallet and a phone number.',
    category: 'general',
  },
  {
    id: 2,
    question: 'Which countries are supported?',
    answer:
      'Airtime: Kenya, Uganda, Tanzania, Rwanda, and South Africa. ' +
      'Data bundles: Kenya, Uganda, South Africa, Ghana, and Nigeria. More countries are on the way.',
    category: 'general',
  },
  {
    id: 3,
    question: 'Which mobile networks are supported?',
    answer:
      'We support all major networks including Safaricom, Airtel, MTN, and Vodacom. Enter any valid local number and we detect the network automatically.',
    category: 'general',
  },
  {
    id: 4,
    question: 'What do I need to get started?',
    answer:
      'A crypto wallet (Coinbase Wallet, MetaMask, or any WalletConnect-compatible wallet) loaded with USDC on the Base network, and the phone number you want to top up.',
    category: 'getting-started',
  },
  {
    id: 5,
    question: 'What currency do I pay in?',
    answer:
      'All payments are made in USDC on the Base blockchain. USDC is a US dollar stablecoin 1 USDC ≈ $1 USD, so your costs are predictable.',
    category: 'payments',
  },
  {
    id: 6,
    question: 'What is the service fee?',
    answer:
      'We charge a flat fee of 0.05 USDC per transaction. The exchange rate applied is a live Coinbase rate with a small operational spread, always shown before you confirm.',
    category: 'payments',
  },
  {
    id: 7,
    question: 'What exchange rate is used?',
    answer:
      'We pull live rates from Coinbase, refreshed every 15 seconds, and apply a small operational spread. The exact rate is always displayed before you pay.',
    category: 'payments',
  },
  {
    id: 8,
    question: 'How long does delivery take?',
    answer:
      'Airtime and data bundles are typically delivered within seconds of your payment confirming on-chain.',
    category: 'delivery',
  },
  {
    id: 9,
    question: 'What if I enter the wrong phone number?',
    answer:
      'Payments to incorrect phone numbers are non-refundable. Please double-check the number carefully before confirming your transaction.',
    category: 'delivery',
  },
  {
    id: 10,
    question: 'What happens if my transaction fails?',
    answer:
      'If your payment confirms on-chain but airtime is not delivered, your USDC is automatically refunded to your wallet. You can also reach us on WhatsApp for immediate support.',
    category: 'delivery',
  },
  {
    id: 11,
    question: 'Is Topizzy secure?',
    answer:
      'Yes. Payments are processed through an independently audited smart contract on Base. We never hold your private keys — you sign every transaction directly from your own wallet.',
    category: 'security',
  },
  {
    id: 12,
    question: 'How do I contact support?',
    answer:
      "Reach us on WhatsApp at +254 769 007 848 or email hello@topizzy.com. We're available 24/7.",
    category: 'support',
  },
];

export async function GET() {
  return NextResponse.json({ faqs: FAQS });
}
