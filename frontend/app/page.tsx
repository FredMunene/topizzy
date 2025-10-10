"use client";
import { useEffect, useState, useMemo } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount, useWalletClient } from 'wagmi'
import { parseUnits } from 'viem'
import { generatePermitSignature } from '@/lib/permit-signature'
import { AIRTIME_ABI } from '@/lib/airtime-abi'
import styles from "./page.module.css";

// Custom hook for debouncing
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}` // Base USDC
const AIRTIME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS! as `0x${string}`

const countries = [
  { code: 'KE', name: 'Kenya', prefix: '+254' },
  { code: 'RW', name: 'Rwanda', prefix: '+250' },
  { code: 'UG', name: 'Uganda', prefix: '+256' },
  { code: 'TZ', name: 'Tanzania', prefix: '+255' }
];

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amountKes, setAmountKes] = useState("");
  const [order, setOrder] = useState<{ orderRef: string; amountKes: number; amountUsdc: number } | null>(null);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const fullPhoneNumber = selectedCountry.prefix + phoneNumber;

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  // Debounce amount input for price fetching
  const debouncedAmount = useDebounce(amountKes, 500);

  // Fetch latest price with debounced amount
  const { data: priceData } = useQuery({
    queryKey: ["price", selectedCountry.code, debouncedAmount],
    queryFn: () => {
      const currencyMap: { [key: string]: string } = {
        "KE": "KES",
        "TZ": "TZS",
        "UG": "UGX",
        "RW": "RWF",
      };
      const currency = currencyMap[selectedCountry.code] || "KES";
      return fetch(`/api/prices?currency=${currency}`).then((res) => res.json());
    },
    enabled: !!debouncedAmount && parseFloat(debouncedAmount) > 0,
    refetchInterval: 30000, // every 30s
  });

  const price = priceData?.price || 0;
  const amountUsdc = amountKes && price > 0 ? (parseFloat(amountKes) / price).toFixed(6) : "0";

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: (data: { phoneNumber: string; amountKes: number; walletAddress: string }) =>
      fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((res) => res.json()),
    onSuccess: (data) => {
      setOrder(data);
    },
  });

  // Pay with permit and send airtime
  const payAndSendMutation = useMutation({
    mutationFn: async (order: { orderRef: string; amountKes: number; amountUsdc: number }) => {
      if (!walletClient || !address) throw new Error('No wallet client available');
      
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const amountWei = parseUnits(order.amountUsdc.toString(), 6); // USDC has 6 decimals
      
      // Generate permit signature
      const permitSig = await generatePermitSignature({
        tokenAddress: USDC_ADDRESS,
        owner: address,
        spender: AIRTIME_CONTRACT_ADDRESS,
        value: amountWei,
        deadline,
        walletClient,
        chainId: 8453 // Base mainnet
      });
      
      if (permitSig.error) throw new Error(permitSig.error);
      if (!permitSig.v || !permitSig.r || !permitSig.s) throw new Error('Invalid permit signature');
      
      // Call smart contract (token address now stored in contract)
      const txHash = await walletClient.writeContract({
        address: AIRTIME_CONTRACT_ADDRESS,
        abi: AIRTIME_ABI,
        functionName: 'depositWithPermit',
        args: [
          order.orderRef,
          amountWei,
          BigInt(deadline),
          permitSig.v,
          permitSig.r,
          permitSig.s
        ]
      });
      
      // Now send airtime
      const airtimeResponse = await fetch("/api/airtime/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          orderRef: order.orderRef,
          txHash 
        }),
      });
      
      return airtimeResponse.json();
    },
  });

  const handleCreateOrder = () => {
    if (!phoneNumber || !amountKes || !address) return;
    createOrderMutation.mutate({
      phoneNumber: fullPhoneNumber,
      amountKes: parseFloat(amountKes),
      walletAddress: address,
    });
  };

  const handlePay = () => {
    if (!order) return;
    payAndSendMutation.mutate(order);
  };

  return (
    <div className={styles.container}>
      <header className={styles.headerWrapper}>
        <Wallet />
      </header>

      <div className={styles.content}>
        <h1 className={styles.title}>Buy Airtime with USDC</h1>

        {!order ? (
          <div className={styles.form}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select 
                value={selectedCountry.code}
                onChange={(e) => setSelectedCountry(countries.find(c => c.code === e.target.value)!)}
                className={styles.input}
                style={{ width: '150px' }}
              >
                {countries.map(country => (
                  <option key={country.code} value={country.code}>
                    {country.name} ({country.prefix})
                  </option>
                ))}
              </select>
              <input
                type="tel"
                placeholder="711XXXYYY"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className={styles.input}
                style={{ flex: 1 }}
              />
            </div>
            <p style={{ fontSize: '14px', color: '#666' }}>Full number: {fullPhoneNumber}</p>
            <input
              type="number"
              placeholder="Amount in KES"
              value={amountKes}
              onChange={(e) => setAmountKes(e.target.value)}
              className={styles.input}
            />
            {price > 0 && amountKes && (
              <p>Equivalent USDC: {amountUsdc}</p>
            )}
            <button
              onClick={handleCreateOrder}
              disabled={createOrderMutation.isPending || !address}
              className={styles.button}
            >
              {createOrderMutation.isPending
                ? "Creating..."
                : address
                ? "Create Order"
                : "Connect Wallet"}
            </button>
            {!address && <p>Connect your wallet to create an order.</p>}
          </div>
        ) : (
          <div className={styles.order}>
            <h2>Order Created</h2>
            <p>Order Ref: {order.orderRef}</p>
            <p>Amount: {order.amountKes} KES ({order.amountUsdc} USDC)</p>
            <button 
              onClick={handlePay} 
              disabled={payAndSendMutation.isPending}
              className={styles.button}
            >
              {payAndSendMutation.isPending ? 'Processing Payment...' : 'Pay & Send Airtime'}
            </button>
            {payAndSendMutation.isSuccess && <p>Payment successful! Airtime sent!</p>}
            {payAndSendMutation.isError && <p>Error: {payAndSendMutation.error?.message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
