"use client";
import { useEffect, useState, useCallback} from "react";
import { Wallet, useIsWalletACoinbaseSmartWallet } from "@coinbase/onchainkit/wallet";
import { Transaction, TransactionButton, TransactionToast } from "@coinbase/onchainkit/transaction";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount, useWalletClient, useBalance } from 'wagmi'
import { useCapabilities } from 'wagmi/experimental'
import { parseUnits, formatUnits, encodeFunctionData, erc20Abi } from 'viem'
import type { Abi } from 'abitype'
import { generatePermitSignature } from '@/lib/permit-signature'
import { AIRTIME_ABI } from '@/lib/airtime-abi'
import styles from "./page.module.css";

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}` // Base Mainnet USDC
const AIRTIME_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_AIRTIME_CONTRACT_ADDRESS! as `0x${string}`
type SmartCall = { to: `0x${string}`; data?: `0x${string}`; value?: bigint };

const countries = [
  { code: 'KE', name: 'Kenya', prefix: '+254' },
  { code: 'RW', name: 'Rwanda', prefix: '+250' },
  { code: 'UG', name: 'Uganda', prefix: '+256' },
  { code: 'TZ', name: 'Tanzania', prefix: '+255' }
];

export default function Home() {
  const mini = useMiniKit();
  // avoid unused var lint and prefer explicit narrow types
  const _miniObj = mini as unknown as Record<string, unknown> | undefined;
  const _isMiniAppReady = Boolean(_miniObj?.isMiniAppReady ?? false);
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amountKes, setAmountKes] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const [order, setOrder] = useState<{ orderRef: string; amountKes: number; amountUsdc: number; airtimeUsdc?: number; serviceFeeUsdc?: number } | null>(null);
  const [airtimeSendState, setAirtimeSendState] = useState<Record<string, 'pending' | 'done' | 'error'>>({});
  const [eoaTxnBusy, setEoaTxnBusy] = useState(false);
  const [smartFlowStarted, setSmartFlowStarted] = useState(false);
  const [smartTxnBusy, setSmartTxnBusy] = useState(false);
  const [shouldPoll, setShouldPoll] = useState(true);
  const { address: wagmiAddress, chain } = useAccount();
  const { data: wagmiWalletClient } = useWalletClient();
  const { data: walletCapabilities } = useCapabilities({ chainId: 8453 });
  const coinbaseSmartWallet = useIsWalletACoinbaseSmartWallet();
  const isSmartWallet = Boolean(
    coinbaseSmartWallet ||
    (walletCapabilities as { atomicBatch?: { supported?: boolean } } | undefined)?.atomicBatch?.supported
  );
  const currentAirtimeSendState = order ? airtimeSendState[order.orderRef] : undefined;

  // Build a unified wallet client that prefers MiniKit's kit when available,
  // otherwise falls back to the wagmi wallet client.
  // Narrow runtime shape and avoid explicit `any`
  type SignTypedDataParams = { account?: string; domain?: unknown; types?: unknown; primaryType?: string; message?: unknown };
  type WriteContractArgs = { address: string; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] };
  type UnifiedWalletClient = {
    account?: string | (() => string | Promise<string>);
    getChainId?: () => Promise<number>;
    signTypedData?: (params: SignTypedDataParams) => Promise<string>;
    request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    writeContract?: (args: WriteContractArgs) => Promise<unknown>;
  } | undefined;

  const miniKitRuntime = ((_miniObj?.kit ?? _miniObj) as unknown) as Record<string, unknown> | undefined;

  const unifiedWalletClient: UnifiedWalletClient = (function () {
    if (!miniKitRuntime) return wagmiWalletClient as unknown as UnifiedWalletClient;

    const runtime = miniKitRuntime as unknown as {
      signTypedData?: (params: SignTypedDataParams) => Promise<string>;
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      writeContract?: (args: WriteContractArgs) => Promise<unknown>;
      getAccount?: () => string | Promise<string>;
      getChainId?: () => Promise<number> | number;
      account?: string;
    };

    const hasApi = typeof runtime.signTypedData === 'function' || typeof runtime.request === 'function' || typeof runtime.writeContract === 'function';
    if (!hasApi) return wagmiWalletClient as unknown as UnifiedWalletClient;

    // Helper to ensure addresses are 0x-prefixed and properly typed
    const normalizeAddress = (addr: string | undefined): `0x${string}` | undefined => {
      if (!addr) return undefined;
      const prefixed = addr.startsWith('0x') ? addr : `0x${addr}`;
      return prefixed.toLowerCase() as `0x${string}`;
    };

    // Extract and normalize account
    const runtimeAccount = runtime.account ?? (typeof runtime.getAccount === 'function' ? runtime.getAccount() : undefined);
    const normalizedAccount = typeof runtimeAccount === 'string' ? normalizeAddress(runtimeAccount) : runtimeAccount;

    return {
      account: normalizedAccount,
      getChainId: async () => {
        if (typeof runtime.getChainId === 'function') return await runtime.getChainId();
        if (typeof runtime.request === 'function') {
          const chainHex = (await runtime.request({ method: 'eth_chainId' })) as string;
          return Number.parseInt(chainHex, 16);
        }
        return 8453;
      },
      signTypedData: async (params: SignTypedDataParams) => {
        if (typeof runtime.signTypedData === 'function') return await runtime.signTypedData(params);
        const addr = normalizeAddress(params.account ?? runtime.account);
        const payload = JSON.stringify({ domain: params.domain, types: params.types, primaryType: params.primaryType, message: params.message });
        if (typeof runtime.request !== 'function') throw new Error('Runtime does not support request fallback');
        return (await runtime.request({ method: 'eth_signTypedData_v4', params: [addr, payload] })) as string;
      },
      writeContract: async ({ address, abi, functionName, args }: WriteContractArgs) => {
        if (typeof runtime.writeContract === 'function') return await runtime.writeContract({ address, abi, functionName, args });
        if (typeof runtime.request !== 'function') throw new Error('Runtime does not support request fallback');
        const data = encodeFunctionData({ abi: abi as Abi, functionName, args: args as unknown as readonly unknown[] });
        return (await runtime.request({ method: 'eth_sendTransaction', params: [{ to: address, data }] })) as unknown;
      },
    } as UnifiedWalletClient;
  })();

  const [effectiveAddress, setEffectiveAddress] = useState<`0x${string}` | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const normalize = (addr?: string | null) => {
      if (!addr) return undefined;
      const prefixed = addr.startsWith('0x') ? addr : `0x${addr}`;
      return prefixed.toLowerCase() as `0x${string}`;
    };

    const resolveAddress = async () => {
      // Prefer wagmi (EOA) address if available
      const wagmiNormalized = normalize(wagmiAddress ?? undefined);
      if (wagmiNormalized) {
        setEffectiveAddress(wagmiNormalized);
        return;
      }

      // Fallback to MiniKit runtime if present
      const runtime = miniKitRuntime as unknown as { account?: string; getAccount?: () => string | Promise<string> } | undefined;
      const runtimeAccount = normalize(runtime?.account ?? undefined);
      if (runtimeAccount) {
        setEffectiveAddress(runtimeAccount);
        return;
      }

      if (typeof runtime?.getAccount === 'function') {
        try {
          const addr = await runtime.getAccount();
          if (!cancelled) {
            setEffectiveAddress(normalize(addr));
          }
        } catch (err) {
          console.warn('Failed to resolve MiniKit account', err);
        }
      }
    };

    resolveAddress();
    return () => {
      cancelled = true;
    };
  }, [wagmiAddress, miniKitRuntime]);

  // Switch to Base Mainnet
  const switchToBaseMainnet = async () => {
    const ethereum = (window as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) return;
    
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x2105' }], // 8453 in hex
      });
    } catch (error: unknown) {
      // If network doesn't exist, add it
      if ((error as { code?: number }).code === 4902) {
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x2105',
              chainName: 'Base Mainnet',
              nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: ['https://mainnet.base.org'],
              blockExplorerUrls: ['https://basescan.org'],
            }],
          });
        } catch (addError: unknown) {
          console.error('Failed to add Base Mainnet:', addError);
        }
      } else {
        console.error('Failed to switch network:', error);
      }
    }
  };

  // Get USDC balance (use effective address from either MiniKit or wagmi)
  const { data: usdcBalance } = useBalance({
    address: effectiveAddress,
    token: USDC_ADDRESS,
  });



  const fullPhoneNumber = selectedCountry.prefix + phoneNumber;
  const currencyMap: { [key: string]: string } = {
    "KE": "KES",
    "TZ": "TZS", 
    "UG": "UGX",
    "RW": "RWF",
  };
  
  // Get currency from phone number prefix, not just selected country
  const getPhoneCountryCode = (phoneWithPrefix: string) => {
    if (phoneWithPrefix.startsWith('+254')) return 'KE';
    if (phoneWithPrefix.startsWith('+255')) return 'TZ';
    if (phoneWithPrefix.startsWith('+256')) return 'UG';
    if (phoneWithPrefix.startsWith('+250')) return 'RW';
    return selectedCountry.code;
  };
  
  const phoneCountryCode = getPhoneCountryCode(fullPhoneNumber);
  const currentCurrency = currencyMap[phoneCountryCode] || "KES";

  useEffect(() => {
    if (!_isMiniAppReady) {
      const maybe = _miniObj as unknown as { setMiniAppReady?: () => void } | undefined;
      maybe?.setMiniAppReady?.();
    }
  }, [mini, _isMiniAppReady, _miniObj]);

  

  // Fetch latest price
  const { data: priceData, isLoading: isPriceLoading, error: priceError } = useQuery({
    queryKey: ["price", selectedCountry.code],
    queryFn: async () => {
      const response = await fetch(`/api/prices?currency=${currentCurrency}`);
      if (!response.ok) throw new Error('Failed to fetch price');
      return response.json();
    },
    refetchInterval: 30000, // every 30s
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

  const sendAirtime = useCallback(async (orderRef: string, txHash: string, opts?: { suppressErrors?: boolean }) => {
    const airtimeResponse = await fetch("/api/airtime/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        orderRef,
        txHash 
      }),
    });
    
    if (!airtimeResponse.ok) {
      if (opts?.suppressErrors) {
        console.warn('Airtime send returned non-200 status (suppressed):', airtimeResponse.status);
        return null;
      }
      let friendly = 'We are processing your payment. Please wait a moment.';
      try {
        const data = await airtimeResponse.json();
        if (typeof data.error === 'string') {
          friendly = data.error;
        } else if (typeof data.message === 'string') {
          friendly = data.message;
        }
      } catch {
        // ignore JSON parse errors; fall back to status-based message
      }
      if (airtimeResponse.status === 429) {
        friendly = 'We are already processing this order. Please wait a few minutes before trying again.';
      } else if (airtimeResponse.status === 409) {
        friendly = 'This order was already processed. If you do not see the airtime, please create a new order.';
      } else if (airtimeResponse.status === 400) {
        friendly = friendly || 'This order is no longer pending. Please start a new order.';
      } else if (airtimeResponse.status >= 500) {
        friendly = 'Airtime service is temporarily unavailable. Please try again shortly.';
      }
      throw new Error(friendly);
    }
    
    return airtimeResponse.json();
  }, []);

  // Pay with permit and send airtime
  const payAndSendMutation = useMutation({
    mutationFn: async (order: { orderRef: string; amountKes: number; amountUsdc: number }) => {
      try {
        if (isSmartWallet) {
          throw new Error('Smart wallet detected. Please use the smart wallet payment button.');
        }
        if (!effectiveAddress) {
          throw new Error('Please connect your wallet first');
        }

        if (!unifiedWalletClient) {
          throw new Error('Unable to access wallet. Please refresh the page and try again');
        }
        
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const amountWei = parseUnits(order.amountUsdc.toString(), 6); // USDC has 6 decimals
        
        // Ensure the connected wallet supports typed data signing
        if (!unifiedWalletClient || typeof unifiedWalletClient.signTypedData !== 'function') {
          throw new Error('Connected wallet does not support EIP-712 signing');
        }

        // Adapter to satisfy the strict walletClient.signTypedData type expected by generatePermitSignature
        const signingClient: { signTypedData: (params: { account: `0x${string}`; domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown>; }) => Promise<string>; } = {
          signTypedData: async (params) => {
            const accountParam = (params.account ?? effectiveAddress) as `0x${string}`;
            // Delegate to unifiedWalletClient.signTypedData which accepts a looser param shape
            return await (unifiedWalletClient.signTypedData as (p: SignTypedDataParams) => Promise<string>)(
              { ...params, account: accountParam } as unknown as SignTypedDataParams
            );
          }
        };

        // Generate permit signature
        const permitSig = await generatePermitSignature({
          tokenAddress: USDC_ADDRESS,
          owner: effectiveAddress as `0x${string}`,
          spender: AIRTIME_CONTRACT_ADDRESS,
          value: amountWei,
          deadline,
          walletClient: signingClient,
          chainId: (await unifiedWalletClient.getChainId?.()) ?? 8453 // use wallet chainId when available
        });
        
        if (permitSig.error) throw new Error(permitSig.error);
        if (!permitSig.v || !permitSig.r || !permitSig.s) throw new Error('Invalid permit signature');
        
        // Call smart contract (token address now stored in contract)
        if (typeof unifiedWalletClient.writeContract !== 'function') {
          throw new Error('Connected wallet cannot send transactions');
        }

        const txHash = await unifiedWalletClient.writeContract({
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
        
        const result = await sendAirtime(order.orderRef, txHash as string);
        return result;
      } catch (error: unknown) {
        // Transform technical errors into user-friendly messages
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('User rejected') || errorMessage.includes('user rejected')) {
          throw new Error('Transaction cancelled. Please try again when ready to complete the payment.');
        }
        if (errorMessage.includes('insufficient funds')) {
          throw new Error('Insufficient USDC balance. Please add more USDC to your wallet.');
        }
        if (errorMessage.includes('network')) {
          throw new Error('Network error. Please check your connection and try again.');
        }
        // Re-throw the original error if it's already user-friendly
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
  });

  // Poll order status
  const { data: orderStatus } = useQuery({
    queryKey: ['orderStatus', order?.orderRef],
    queryFn: async () => {
      if (!order?.orderRef) return null;
      const response = await fetch(`/api/orders/${order.orderRef}`);
      if (!response.ok) throw new Error('Failed to fetch order status');
      const data = await response.json();
      
      // Stop polling if order reaches final state
      if (data.status === 'fulfilled' || data.status === 'refunded') {
        setShouldPoll(false);
      }
      
      return data;
    },
    enabled: !!order?.orderRef && shouldPoll,
    refetchInterval: shouldPoll ? 2000 : false,
    refetchIntervalInBackground: true,
  });

  const smartWalletCalls = useCallback(async (): Promise<SmartCall[]> => {
    if (!order) {
      throw new Error('No order available to pay');
    }
    const amountWei = parseUnits(order.amountUsdc.toString(), 6);
    return [
      {
        to: USDC_ADDRESS,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [AIRTIME_CONTRACT_ADDRESS, amountWei]
        })
      },
      {
        to: AIRTIME_CONTRACT_ADDRESS,
        data: encodeFunctionData({
          abi: AIRTIME_ABI as Abi,
          functionName: 'deposit',
          args: [order.orderRef, amountWei]
        })
      }
    ];
  }, [order]);

  const handleSmartWalletSuccess = useCallback(async ({ transactionReceipts }: { transactionReceipts: { transactionHash: string }[] }) => {
    if (!order) return;
    if (orderStatus?.status && orderStatus.status !== 'pending') {
      setValidationError('This order is no longer pending. Please create a new order.');
      return;
    }
    const priorState = airtimeSendState[order.orderRef];
    if (priorState === 'pending' || priorState === 'done') {
      return;
    }
    setSmartFlowStarted(false);
    setAirtimeSendState((prev) => ({ ...prev, [order.orderRef]: 'pending' }));
    const txHash = transactionReceipts[0]?.transactionHash;
    if (!txHash) {
      setValidationError('Missing transaction hash from wallet');
      setAirtimeSendState((prev) => ({ ...prev, [order.orderRef]: 'error' }));
      return;
    }
    try {
      await sendAirtime(order.orderRef, txHash, { suppressErrors: true });
      setAirtimeSendState((prev) => ({ ...prev, [order.orderRef]: 'done' }));
      setValidationError('');
    } catch (err: unknown) {
      console.warn('Airtime send error (smart wallet suppressed):', err);
      setAirtimeSendState((prev) => ({ ...prev, [order.orderRef]: 'done' }));
    }
  }, [order, orderStatus?.status, airtimeSendState, sendAirtime]);

  // Reset polling when order changes
  useEffect(() => {
    if (order) {
      setShouldPoll(true);
      setSmartFlowStarted(false);
      setSmartTxnBusy(false);
    }
  }, [order]);

  const handleContinue = async () => {
    if (!effectiveAddress) {
      setValidationError("Please connect your wallet");
      return;
    }
    
    if (!phoneNumber) {
      setValidationError("Please enter a phone number");
      return;
    }
    
    if (phoneNumber.length !== 9) {
      setValidationError("Phone number must be exactly 9 digits");
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
      walletAddress: effectiveAddress,
    });
  };

  const handlePay = () => {
    if (isSmartWallet) return; // smart wallets use OnchainKit Transaction flow
    if (!order) return;
    
    if (!effectiveAddress) {
      setValidationError("Please connect your wallet first");
      return;
    }
    
    // Clear any previous errors
    setValidationError("");
    setEoaTxnBusy(true);
    
    // The mutation will handle walletClient errors with better messages
    payAndSendMutation.mutate(order, {
      onError: () => setEoaTxnBusy(false),
      onSuccess: () => setEoaTxnBusy(false),
      onSettled: () => undefined
    });
  };

  const usdcBalanceFormatted = usdcBalance 
    ? Number.parseFloat(formatUnits(usdcBalance.value, 6)).toFixed(2)
    : "0.00";

  // Normalized connection flags and button labels (avoid nested ternaries and negated conditions)
  const isConnected = Boolean(effectiveAddress);
  const continueDisabled = createOrderMutation.isPending || !isConnected || !phoneNumber || !amountKes || !!validationError || isPriceLoading;
  let continueButtonText: string;
  if (createOrderMutation.isPending) {
    continueButtonText = 'Creating Order...';
  } else if (!isConnected) {
    continueButtonText = 'Connect Wallet';
  } else {
    continueButtonText = 'Continue';
  }

  const isOrderProcessing = orderStatus?.status === 'processing' || (orderStatus?.status === 'pending' && Boolean(orderStatus?.tx_hash));

  let payButtonText: string;
  if (orderStatus?.status === 'refunded') {
    payButtonText = 'Order Refunded';
  } else if (orderStatus?.status === 'fulfilled') {
    payButtonText = 'Order Completed';
  } else if (isOrderProcessing) {
    payButtonText = 'Processing Airtime...';
  } else if (payAndSendMutation.isPending) {
    payButtonText = 'Processing Payment...';
  } else if (!isConnected) {
    payButtonText = 'Connect Wallet to Pay';
  } else {
    payButtonText = 'Pay & Send Airtime';
  }
  const smartWalletDisabled =
    !isConnected ||
    orderStatus?.status === 'refunded' ||
    orderStatus?.status === 'fulfilled' ||
    isOrderProcessing ||
    smartTxnBusy ||
    eoaTxnBusy ||
    currentAirtimeSendState === 'pending' ||
    currentAirtimeSendState === 'done';

  useEffect(() => {
    if (orderStatus?.status === 'fulfilled' || orderStatus?.status === 'refunded') {
      setEoaTxnBusy(false);
      setSmartFlowStarted(false);
      setSmartTxnBusy(false);
    }
    if (orderStatus?.status === 'processing' || orderStatus?.status === 'pending') {
      setSmartFlowStarted(false);
      setSmartTxnBusy(false);
    }
  }, [orderStatus?.status]);

  useEffect(() => {
    setSmartFlowStarted(false);
    setSmartTxnBusy(false);
  }, []);

  return (
    <>
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
                  <select 
                    className={styles.countrySelect}
                    value={selectedCountry.code}
                    onChange={(e) => {
                      const country = countries.find(c => c.code === e.target.value);
                      if (country) setSelectedCountry(country);
                    }}
                  >
                    {countries.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.prefix}
                      </option>
                    ))}
                  </select>
                  <div className={styles.phoneInputWithFlag}>
                    <span className={styles.flagIcon}>{selectedCountry.code === 'KE' ? '🇰🇪' : selectedCountry.code === 'RW' ? '🇷🇼' : selectedCountry.code === 'UG' ? '🇺🇬' : '🇹🇿'}</span>
                    <input
                      type="tel"
                      placeholder="743913802"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replaceAll(/\D/g, ''))}
                      className={styles.phoneInput}
                      maxLength={9}
                    />
                  </div>
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
                  {chain && chain.id !== 8453 && (
                    <div style={{color: 'orange', fontSize: '12px'}}>
                      Connected to {chain.name}. 
                      <button 
                        onClick={switchToBaseMainnet}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'orange',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: 0,
                          marginLeft: '4px'
                        }}
                      >
                        Switch to Base Mainnet
                      </button>
                    </div>
                  )}
                  <span className={styles.exchangeRate}>
                    1 USDC = {currentCurrency} {price > 0 ? price.toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>

              {/* You will pay */}
              <div className={styles.paymentPreview}>
                <span className={styles.paymentLabel}>Airtime Cost</span>
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
                disabled={continueDisabled}
                className={styles.continueButton}
              >
                <span>{continueButtonText}</span>
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
                  <span>Airtime cost:</span>
                  <span className={styles.summaryValue}>{order.airtimeUsdc ? Number(order.airtimeUsdc).toFixed(2) : '0.00'} USDC</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Service fee:</span>
                  <span className={styles.summaryValue}>{order.serviceFeeUsdc ? Number(order.serviceFeeUsdc).toFixed(2) : '0.00'} USDC</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>You will pay:</span>
                  <span className={styles.summaryValueLarge}>{Number(order.amountUsdc).toFixed(2)} USDC</span>
                </div>
              </div>

              {validationError && (
                <div className={styles.errorMessage}>{validationError}</div>
              )}

              {isSmartWallet ? (
                smartFlowStarted ? (
                  <Transaction
                    chainId={8453}
                    calls={smartWalletCalls}
                    isSponsored
                    onStatus={(status) => {
                      const busyStates = ['buildingTransaction', 'transactionPending', 'transactionLegacyExecuted'];
                      if (busyStates.includes(status.statusName)) {
                        setSmartTxnBusy(true);
                      } else if (status.statusName === 'success' || status.statusName === 'error' || status.statusName === 'reset') {
                        setSmartTxnBusy(false);
                        setSmartFlowStarted(false);
                      }
                    }}
                    onError={(e) => setValidationError((e as { message?: string })?.message || 'Transaction failed')}
                    onSuccess={handleSmartWalletSuccess}
                    className={styles.continueButton}
                  >
                    <TransactionButton
                      className={styles.continueButton}
                      disabled={smartWalletDisabled}
                      text={payButtonText}
                      pendingOverride={{ text: 'Processing Airtime...' }}
                    />
                    <TransactionToast />
                  </Transaction>
                ) : (
                  <button
                    onClick={() => {
                      setValidationError('');
                      setSmartFlowStarted(true);
                    }}
                    disabled={smartWalletDisabled}
                    className={styles.continueButton}
                  >
                    {payButtonText}
                  </button>
                )
              ) : (
                <button
                  onClick={handlePay}
                  disabled={
                    payAndSendMutation.isPending ||
                    eoaTxnBusy ||
                    !isConnected ||
                    orderStatus?.status === 'refunded' ||
                    orderStatus?.status === 'fulfilled' ||
                    isOrderProcessing ||
                    currentAirtimeSendState === 'pending' ||
                    currentAirtimeSendState === 'done'
                  }
                  className={styles.continueButton}
                >
                  {payButtonText}
                </button>
              )}

              {/* Order Status Display */}
              {orderStatus && (
                <div className={styles.statusDisplay}>
                  
                  
                  {orderStatus.status === 'fulfilled' && (
                    <div className={styles.successMessage}>
                      <svg className={styles.successIcon} viewBox="0 0 16 16" fill="currentColor">
                        <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                      </svg>
                      Airtime delivered successfully!
                    </div>
                  )}
                  
                  {orderStatus.status === 'refunded' && (
                    <div className={styles.errorMessage}>
                      {orderStatus.refund_tx_hash && (
                        <div style={{marginTop: '8px', fontSize: '12px'}}>
                          <a 
                            href={`https://basescan.org/tx/${orderStatus.refund_tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{color: '#0ea5e9', textDecoration: 'underline'}}
                          >
                            View refund transaction
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {payAndSendMutation.isSuccess && !orderStatus && (
                <div className={styles.successMessage}>
                  <svg className={styles.successIcon} viewBox="0 0 16 16" fill="currentColor">
                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                  </svg>
                  Payment successful! Processing airtime...
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
                  setAirtimeSendState({});
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
    <a
    href="https://wa.me/254743913802?text=Hi%2C%20I%20am%20making%20an%20inquiry%20concerning%20Topizzy"
      target="_blank"
      rel="noopener noreferrer"
      className={styles.whatsappFab}
      aria-label="Contact us on WhatsApp"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M20.52 3.48A11.7 11.7 0 0 0 12 .25 11.75 11.75 0 0 0 1.18 16.25L.04 23.75l7.7-1.98a11.73 11.73 0 0 0 4.28.82h.01a11.75 11.75 0 0 0 8.49-20.1Zm-8.5 16.8h-.01a9.8 9.8 0 0 1-4.2-.97l-.3-.14-4.58 1.18 1.22-4.47-.15-.31a9.8 9.8 0 1 1 18.02-4.26 9.75 9.75 0 0 1-9.8 8.97Zm5.38-7.35c-.29-.15-1.7-.84-1.97-.93-.26-.1-.45-.14-.64.15-.19.29-.74.92-.9 1.1-.17.19-.33.21-.62.07-.29-.14-1.24-.46-2.36-1.47-.87-.77-1.46-1.72-1.63-2-.17-.29-.02-.44.13-.58.13-.13.29-.33.43-.5.14-.17.19-.29.29-.48.1-.19.05-.36-.03-.5-.07-.15-.63-1.5-.86-2.05-.22-.53-.45-.46-.62-.47-.16-.01-.36-.02-.56-.02-.2 0-.52.07-.79.36-.26.29-1.02.99-1.02 2.41 0 1.42 1.04 2.79 1.18 2.98.15.19 2.05 3.13 4.96 4.39.69.3 1.22.48 1.64.61.69.22 1.33.19 1.83.11.56-.08 1.7-.69 1.94-1.36.24-.67.24-1.24.17-1.36-.07-.12-.26-.19-.55-.34Z" />
      </svg>
    </a>
    </>
  );
}
