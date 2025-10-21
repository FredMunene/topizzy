"use client";
import { useEffect, useState, useCallback } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount, useWalletClient, useBalance } from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { generatePermitSignature } from '@/lib/permit-signature'
import { AIRTIME_ABI } from '@/lib/airtime-abi'
import styles from "./page.module.css";

const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as `0x${string}` // Base Sepolia USDC
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
  const [validationError, setValidationError] = useState<string>("");
  const [order, setOrder] = useState<{ orderRef: string; amountKes: number; amountUsdc: number } | null>(null);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Get USDC balance
  const { data: usdcBalance } = useBalance({
    address: address,
    token: USDC_ADDRESS,
  });

  const fullPhoneNumber = selectedCountry.prefix + phoneNumber;
  const currencyMap: { [key: string]: string } = {
    "KE": "KES",
    "TZ": "TZS",
    "UG": "UGX",
    "RW": "RWF",
  };
  const currentCurrency = currencyMap[selectedCountry.code] || "KES";

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  

  // Fetch latest price
  const { data: priceData, isLoading: isPriceLoading, error: priceError } = useQuery({
    queryKey: ["price", selectedCountry.code],
    queryFn: async () => {
      const response = await fetch(`/api/prices?currency=${currentCurrency}`);
      if (!response.ok) throw new Error('Failed to fetch price');
      return response.json();
    },
    refetchInterval: 15000, // every 15s
    retry: 3,
  });

  const price = priceData?.price || 0;
  const amountUsdc = amountKes && price > 0 ? (Number.parseFloat(amountKes) / price).toFixed(2) : "0.00";
  
  // Validate input
  const validateAmount = useCallback((value: string) => {
    setValidationError("");
    
    if (!value) return;
    
    const amount = Number.parseFloat(value);
    if (Number.isNaN(amount) || amount <= 0) {
      setValidationError("Please enter a valid amount");
      return;
    }

    // Check amount restrictions based on country
    const restrictions: { [key: string]: { min: number; max: number } } = {
      "KE": { min: 5, max: 5000 },
      "UG": { min: 50, max: 200000 },
      "TZ": { min: 500, max: 200000 },
      "RW": { min: 100, max: 40000 },
    };
    
    const limit = restrictions[selectedCountry.code] || restrictions["KE"];
    if (amount < limit.min || amount > limit.max) {
      setValidationError(`Amount must be between ${limit.min} and ${limit.max} ${currentCurrency}`);
      return;
    }

    // Check USDC balance
    if (usdcBalance && parseFloat(amountUsdc) > parseFloat(formatUnits(usdcBalance.value, 6))) {
      const diff = (parseFloat(amountUsdc) - parseFloat(formatUnits(usdcBalance.value, 6))).toFixed(2);
      setValidationError(`Amount exceed balance. You can transact $ -${diff}`);
    }
  }, [selectedCountry.code, currentCurrency, usdcBalance, amountUsdc]);

  // Validate on amount change
  useEffect(() => {
    if (amountKes) {
      validateAmount(amountKes);
    }
  }, [amountKes, price, validateAmount]);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; amountKes: number; walletAddress: string }) => {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create order');
      }
      
      return result;
    },
    onSuccess: (data) => {
      setOrder(data);
    },
    onError: (error: Error) => {
      setValidationError(error.message);
    },
  });

  // Pay with permit and send airtime
  const payAndSendMutation = useMutation({
    mutationFn: async (order: { orderRef: string; amountKes: number; amountUsdc: number }) => {
      if (!address) {
        throw new Error('Please connect your wallet first');
      }
      
      if (!walletClient) {
        throw new Error('Unable to access wallet. Please refresh the page and try again');
      }
      
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
        chainId: (await walletClient.getChainId?.()) ?? 84532 // use wallet chainId when available
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

  const handleContinue = async () => {
    if (!address) {
      setValidationError("Please connect your wallet");
      return;
    }
    
    if (!phoneNumber) {
      setValidationError("Please enter a phone number");
      return;
    }
    
    if (!amountKes || Number.parseFloat(amountKes) <= 0) {
      setValidationError("Please enter a valid amount");
      return;
    }
    
    if (validationError) return;
    
    // Create order first
    createOrderMutation.mutate({
      phoneNumber: fullPhoneNumber,
      amountKes: Number.parseFloat(amountKes),
      walletAddress: address,
    });
  };

  const handlePay = () => {
    if (!order) return;
    
    if (!address) {
      setValidationError("Please connect your wallet first");
      return;
    }
    
    // Clear any previous errors
    setValidationError("");
    
    // The mutation will handle walletClient errors with better messages
    payAndSendMutation.mutate(order);
  };

  const usdcBalanceFormatted = usdcBalance 
    ? Number.parseFloat(formatUnits(usdcBalance.value, 6)).toFixed(2)
    : "0.00";

  return (
    <div className={styles.container}>
      <header className={styles.headerWrapper}>
        <Wallet />
      </header>

      <div className={styles.content}>
        {!order ? (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h1 className={styles.cardTitle}>Buy Airtime</h1>
            </div>

            <div className={styles.cardBody}>
              {/* Phone Number */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Phone Number</label>
                <div className={styles.phoneInputWrapper}>
                  <input
                    type="tel"
                    placeholder="743913802"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value.replaceAll(/\D/g, ''))}
                    className={styles.phoneInput}
                  />
                  <button 
                    className={styles.countryButton}
                    onClick={() => {
                      const currentIndex = countries.findIndex(c => c.code === selectedCountry.code);
                      const nextIndex = (currentIndex + 1) % countries.length;
                      setSelectedCountry(countries[nextIndex]);
                    }}
                  >
                    {selectedCountry.prefix}
                  </button>
                </div>
                <div className={styles.helperText}>
                  <svg className={styles.infoIcon} viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                    <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                  </svg>
                  All mobile networks are supported.
                </div>
              </div>

              {/* Amount */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Amount ({currentCurrency})</label>
                {validationError && (
                  <div className={styles.errorMessage}>{validationError}</div>
                )}
                <div className={styles.amountInputWrapper}>
                  <input
                    type="number"
                    placeholder="100"
                    value={amountKes}
                    onChange={(e) => setAmountKes(e.target.value)}
                    className={styles.amountInput}
                    min="0"
                    step="any"
                  />
                  <button 
                    className={`${styles.balanceButton} ${
                      !amountKes ? '' : 
                      validationError ? styles.balanceButtonError : 
                      styles.balanceButtonSuccess
                    }`}
                    type="button"
                  >
                    {!amountKes ? (
                      // Blank/empty when no value
                      <span></span>
                    ) : validationError ? (
                      // Red/Orange X or warning icon when error
                      <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
                      </svg>
                    ) : (
                      // Green tick when valid
                      <svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
                        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                      </svg>
                    )}
                  </button>
                </div>
                <div className={styles.balanceInfo}>
                  <svg className={styles.infoIcon} viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1" fill="none"/>
                    <text x="8" y="11" fontSize="10" textAnchor="middle" fill="currentColor">i</text>
                  </svg>
                  wallet balance USDC {usdcBalanceFormatted}
                  <span className={styles.exchangeRate}>
                    1 USDC = {currentCurrency} {price > 0 ? price.toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>

              {/* You will pay */}
              <div className={styles.paymentPreview}>
                <span className={styles.paymentLabel}>You will pay</span>
                <span className={styles.paymentAmount}>
                  {isPriceLoading ? (
                    <span className={styles.loadingDots}>...</span>
                  ) : (
                    amountUsdc
                  )} USDC
                </span>
              </div>

              {/* Continue Button */}
              <button
                onClick={handleContinue}
                disabled={
                  createOrderMutation.isPending || 
                  !address || 
                  !phoneNumber || 
                  !amountKes || 
                  !!validationError ||
                  isPriceLoading
                }
                className={styles.continueButton}
              >
                {createOrderMutation.isPending ? (
                  <span>Creating Order...</span>
                ) : !address ? (
                  <span>Connect Wallet</span>
                ) : (
                  <span>Continue</span>
                )}
              </button>

              {/* Warning */}
              <div className={styles.warning}>
                <svg className={styles.warningIcon} viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                  <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                </svg>
                Payment to wrong phone number is non-refundable.
              </div>

              {priceError && (
                <div className={styles.errorBanner}>
                  Failed to fetch current price. Please try again.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Confirm Payment</h2>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.orderSummary}>
                <div className={styles.summaryRow}>
                  <span>Order Reference:</span>
                  <span className={styles.summaryValue}>{order.orderRef}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Phone Number:</span>
                  <span className={styles.summaryValue}>{fullPhoneNumber}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Amount ({currentCurrency}):</span>
                  <span className={styles.summaryValue}>{order.amountKes}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>You will pay:</span>
                  <span className={styles.summaryValueLarge}>{Number(order.amountUsdc).toFixed(2)} USDC</span>
                </div>
              </div>

              {validationError && (
                <div className={styles.errorMessage}>{validationError}</div>
              )}

              <button
                onClick={handlePay}
                disabled={payAndSendMutation.isPending || !address}
                className={styles.continueButton}
              >
                {payAndSendMutation.isPending ? (
                  'Processing Payment...'
                ) : !address ? (
                  'Connect Wallet to Pay'
                ) : (
                  'Pay & Send Airtime'
                )}
              </button>

              {payAndSendMutation.isSuccess && (
                <div className={styles.successMessage}>
                  <svg className={styles.successIcon} viewBox="0 0 16 16" fill="currentColor">
                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                  </svg>
                  Payment successful! Airtime sent!
                </div>
              )}

              {payAndSendMutation.isError && (
                <div className={styles.errorBanner}>
                  Error: {payAndSendMutation.error?.message}
                </div>
              )}

              <button
                onClick={() => {
                  setOrder(null);
                  setValidationError("");
                  payAndSendMutation.reset();
                }}
                className={styles.backButton}
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
