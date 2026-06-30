import { NextResponse } from 'next/server';

const TERMS = {
  lastUpdated: '2026-05-25',
  sections: [
    {
      heading: '1. Acceptance of Terms',
      body: [
        'By accessing or using Topizzy ("the Service"), you agree to be bound by these Terms and Conditions. If you do not agree, please do not use the Service.',
        'These Terms apply to all users of the Service, including visitors, customers, and other parties who access or use the Service.',
      ],
    },
    {
      heading: '2. Description of Service',
      body: [
        'Topizzy is a crypto-to-airtime platform that enables users to purchase mobile airtime and data bundles for phone numbers across Africa using USDC on the Base blockchain.',
        'We currently support airtime top-ups in Kenya, Uganda, Tanzania, Rwanda, and South Africa, and data bundles in Kenya, Uganda, South Africa, Ghana, and Nigeria. Supported countries and networks may change at any time.',
      ],
    },
    {
      heading: '3. Eligibility',
      body: [
        'You must be at least 18 years old to use the Service.',
        'You must have a compatible crypto wallet funded with USDC on the Base network.',
        'The Service is only available for top-ups in the countries and on the mobile networks listed on the platform at the time of your transaction.',
      ],
    },
    {
      heading: '4. Wallet & Account',
      body: [
        'Topizzy does not create or manage user accounts. You interact with the Service using your own self-custodial crypto wallet.',
        'You are solely responsible for the security of your wallet and private keys. Topizzy has no ability to recover lost wallets or reverse transactions.',
        'By connecting your wallet you confirm that you are its authorised owner.',
      ],
    },
    {
      heading: '5. Payments',
      body: [
        'All payments are made in USDC on the Base blockchain. A flat service fee of 0.05 USDC applies to every transaction.',
        'Exchange rates are sourced live from Coinbase and displayed to you before you confirm. A small operational spread is applied to the market rate to cover costs.',
        'Payments are processed through an audited smart contract. Once a transaction is submitted to the blockchain it cannot be stopped or reversed.',
      ],
    },
    {
      heading: '6. Refund Policy',
      body: [
        'Payments sent to an incorrect phone number are non-refundable. You are solely responsible for verifying the phone number before confirming your transaction.',
        'If your payment confirms on-chain but the airtime or data bundle is not delivered within a reasonable time, your USDC will be automatically refunded to your wallet by the smart contract.',
        'Topizzy reserves the right to issue or deny refunds in circumstances outside normal operation, including but not limited to network outages, suspended networks, or regulatory issues.',
      ],
    },
    {
      heading: '7. Prohibited Activities',
      body: [
        'You may not use the Service to: (a) top up phone numbers that you are not authorised to use; (b) engage in any fraudulent or deceptive activity; (c) circumvent any technical measures or access controls; (d) resell or commercialise the Service without our written consent.',
        'We reserve the right to block any wallet address or phone number that we reasonably believe is being used in violation of these Terms.',
      ],
    },
    {
      heading: '8. Intellectual Property',
      body: [
        'All content, branding, and software on the Topizzy platform is owned by or licensed to Topizzy and is protected by applicable intellectual property laws.',
        'You may not reproduce, distribute, or create derivative works without our prior written consent.',
      ],
    },
    {
      heading: '9. Limitation of Liability',
      body: [
        'To the maximum extent permitted by law, Topizzy is not liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the Service.',
        'Our total liability for any claim arising out of or relating to these Terms shall not exceed the amount you paid in service fees in the three months preceding the claim.',
        'We do not warrant that the Service will be uninterrupted, error-free, or free from security vulnerabilities.',
      ],
    },
    {
      heading: '10. Governing Law',
      body: [
        'These Terms are governed by and construed in accordance with the laws of Kenya. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Kenya.',
      ],
    },
    {
      heading: '11. Changes to These Terms',
      body: [
        'We may update these Terms from time to time. The "Last Updated" date at the top of this page reflects the most recent revision.',
        'Continued use of the Service after changes are posted constitutes your acceptance of the revised Terms.',
      ],
    },
    {
      heading: '12. Contact',
      body: [
        'For questions about these Terms, contact us at hello@topizzy.com or via WhatsApp at +254 769 007 848.',
      ],
    },
  ],
};

export async function GET() {
  return NextResponse.json(TERMS, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
