"use client";
import Image from "next/image";
import { useEffect, useState, useCallback} from "react";
import { Wallet, useIsWalletACoinbaseSmartWallet } from "@coinbase/onchainkit/wallet";
import { Transaction, TransactionButton, TransactionToast } from "@coinbase/onchainkit/transaction";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount, useWalletClient, useBalance } from 'wagmi'
import { useCapabilities } from 'wagmi/experimental'
import { parseUnits, formatUnits, encodeFunctionData, erc20Abi, createPublicClient, http } from 'viem'
import type { Abi } from 'abitype'
import { generatePermitSignature } from '@/lib/permit-signature'
import { AIRTIME_ABI } from '@/lib/airtime-abi'
import { CHAINS, getChainConfigById, estimateGasReserveUsdc, type ChainKey } from '@/lib/chains'
import styles from "./page.module.css";

type SmartCall = { to: `0x${string}`; data?: `0x${string}`; value?: bigint };

// Fallback used only until /api/prices responds — the server (which reads
// the one SERVICE_FEE env var) is the actual source of truth, returned as
// `serviceFee` on every /api/prices response.
const DEFAULT_SERVICE_FEE_USDC = 0.05;

async function logToServer(level: 'info' | 'error', message: string, meta?: Record<string, unknown>) {
  try {
    await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, message, meta }),
    });
  } catch {
    // Best-effort logging only
  }
}

const countries = [
  { code: 'KE', name: 'Kenya', prefix: '+254' },
  { code: 'RW', name: 'Rwanda', prefix: '+250' },
  { code: 'UG', name: 'Uganda', prefix: '+256' },
  { code: 'TZ', name: 'Tanzania', prefix: '+255' },
  { code: 'ZA', name: 'South Africa', prefix: '+27' }
];

/** Fixed 2-decimal precision for every USDC amount shown to the user. */
function fmtUsdc(n: number): string {
  return n.toFixed(2);
}

export default function Home() {
  const mini = useMiniKit();
  // avoid unused var lint and prefer explicit narrow types
  const _miniObj = mini as unknown as Record<string, unknown> | undefined;
  const _isMiniAppReady = Boolean(_miniObj?.isMiniAppReady ?? false);
  const [selectedCountry, setSelectedCountry] = useState(countries[0]);
  const [autoCountrySet, setAutoCountrySet] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amountKes, setAmountKes] = useState("");
  const [validationError, setValidationError] = useState<string>("");
  const [order, setOrder] = useState<{ orderRef: string; amountKes: number; amountUsdc: number; airtimeUsdc?: number; serviceFeeUsdc?: number } | null>(null);
  const [airtimeSendState, setAirtimeSendState] = useState<Record<string, 'pending' | 'done' | 'error'>>({});
  const [eoaTxnBusy, setEoaTxnBusy] = useState(false);
  const [smartTxnBusy, setSmartTxnBusy] = useState(false);
  const [shouldPoll, setShouldPoll] = useState(true);
  const [headerHidden, setHeaderHidden] = useState(false);
  const { address: wagmiAddress, chain } = useAccount();
  const { data: wagmiWalletClient } = useWalletClient();
  const activeChainConfig = getChainConfigById(chain?.id);
  const { data: walletCapabilities } = useCapabilities({ chainId: activeChainConfig.chain.id });
  const miniKitRuntime = ((_miniObj?.kit ?? _miniObj) as unknown) as Record<string, unknown> | undefined;
  const coinbaseSmartWallet = useIsWalletACoinbaseSmartWallet();
  const atomicBatchSupported = (walletCapabilities as { atomicBatch?: { supported?: boolean } } | undefined)?.atomicBatch?.supported;
  const isMiniApp = _isMiniAppReady || Boolean(miniKitRuntime);
  const isSmartWallet = Boolean(coinbaseSmartWallet || atomicBatchSupported || isMiniApp);
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

    // istanbul ignore next -- unreachable via the UI today: this enriched
    // client is only built when miniKitRuntime is truthy, but that exact
    // same truthiness also forces isMiniApp (and therefore isSmartWallet)
    // true, so payAndSendMutation — the only consumer of getChainId/
    // signTypedData/writeContract here — can never run while this branch is
    // active (handlePay bails out for smart wallets before ever calling it).
    // Kept for when isSmartWallet's derivation changes to allow a
    // non-smart-wallet MiniKit session. Comment placed on the whole returned
    // object (rather than per-property) since per-property `istanbul ignore
    // next` comments on object literal values aren't honored by this
    // project's SWC-based coverage instrumentation.
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
    let attempts = 0;
    const normalize = (addr?: string | null) => {
      if (!addr) return undefined;
      const prefixed = addr.startsWith('0x') ? addr : `0x${addr}`;
      return prefixed.toLowerCase() as `0x${string}`;
    };

    const resolveMiniKitAccount = async () => {
      const runtime = miniKitRuntime as unknown as {
        account?: string;
        getAccount?: () => string | Promise<string>;
        request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      } | undefined;

      const runtimeAccount = normalize(runtime?.account ?? undefined);
      if (runtimeAccount) return runtimeAccount;

      if (typeof runtime?.getAccount === 'function') {
        try {
          const addr = await runtime.getAccount();
          return normalize(addr);
        } catch {
          return undefined;
        }
      }

      if (typeof runtime?.request === 'function') {
        try {
          const accounts = (await runtime.request({ method: 'eth_accounts' })) as string[] | undefined;
          return normalize(accounts?.[0]);
        } catch {
          return undefined;
        }
      }

      return undefined;
    };

    const resolveAddress = async () => {
      // Prefer wagmi (EOA) address if available
      const wagmiNormalized = normalize(wagmiAddress ?? undefined);
      if (wagmiNormalized) {
        setEffectiveAddress(wagmiNormalized);
        return;
      }

      const miniAddr = await resolveMiniKitAccount();
      if (!cancelled && miniAddr) {
        setEffectiveAddress(miniAddr);
        return;
      }

      if (!cancelled && attempts < 3 && isMiniApp) {
        attempts += 1;
        setTimeout(resolveAddress, 400);
      }
    };

    resolveAddress();
    return () => {
      cancelled = true;
    };
  }, [wagmiAddress, miniKitRuntime, isMiniApp]);

  // Switch (or add) the connected wallet to a supported chain
  const switchToChain = async (key: ChainKey) => {
    const target = CHAINS[key];
    const ethereum = (window as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!ethereum) return;

    const chainIdHex = `0x${target.chain.id.toString(16)}`;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (error: unknown) {
      // If network doesn't exist, add it
      if ((error as { code?: number }).code === 4902) {
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainIdHex,
              chainName: target.chain.name,
              nativeCurrency: target.chain.nativeCurrency,
              rpcUrls: [target.chain.rpcUrls.default.http[0]],
              blockExplorerUrls: [target.blockExplorerUrl],
            }],
          });
        } catch (err) {
          void logToServer('error', `Failed to add ${target.displayName}`, { error: String(err) });
        }
      } else {
        void logToServer('error', 'Failed to switch network', { error: String(error) });
      }
    }
  };

  // Get USDC balance on the active chain (use effective address from either MiniKit or wagmi)
  const { data: usdcBalance } = useBalance({
    address: effectiveAddress,
    token: activeChainConfig.usdcAddress,
    chainId: activeChainConfig.chain.id,
  });

  // On chains where USDC is also the gas token (Arc), the payment amount and
  // the network fee draw from the same balance, so hold back an estimated
  // fee before comparing the amount against what's spendable.
  const [gasReserveUsdc, setGasReserveUsdc] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!activeChainConfig.usdcIsGasToken) {
      setGasReserveUsdc(0);
      return;
    }
    estimateGasReserveUsdc(activeChainConfig).then((reserve) => {
      if (!cancelled) setGasReserveUsdc(reserve);
    });
    return () => {
      cancelled = true;
    };
  }, [activeChainConfig]);

  const fullPhoneNumber = selectedCountry.prefix + phoneNumber;
  const currencyMap: { [key: string]: string } = {
    "KE": "KES",
    "TZ": "TZS",
    "UG": "UGX",
    "RW": "RWF",
    "ZA": "ZAR",
  };
  
  // Get currency from phone number prefix, not just selected country
  const getPhoneCountryCode = (phoneWithPrefix: string) => {
    const dialingCodes = [
      { prefix: '+254', code: 'KE' },
      { prefix: '+255', code: 'TZ' },
      { prefix: '+256', code: 'UG' },
      { prefix: '+250', code: 'RW' },
      { prefix: '+27', code: 'ZA' },
    ];
    const match = dialingCodes.find((entry) => phoneWithPrefix.startsWith(entry.prefix));
    // istanbul ignore next -- unreachable: this is only ever called with
    // fullPhoneNumber (selectedCountry.prefix + phoneNumber), and
    // selectedCountry.prefix is always one of dialingCodes' own prefixes, so
    // match is never undefined.
    return match?.code ?? selectedCountry.code;
  };
  
  const phoneCountryCode = getPhoneCountryCode(fullPhoneNumber);
  // istanbul ignore next -- unreachable: phoneCountryCode is either a
  // dialingCodes match (all 5 keys exist in currencyMap) or
  // selectedCountry.code (which can only be one of the 5 `countries`
  // entries, same key set), so the fallback can never trigger.
  const currentCurrency = currencyMap[phoneCountryCode] || "KES";

  useEffect(() => {
    if (!_isMiniAppReady) {
      const maybe = _miniObj as unknown as { setMiniAppReady?: () => void } | undefined;
      maybe?.setMiniAppReady?.();
    }
  }, [mini, _isMiniAppReady, _miniObj]);

  useEffect(() => {
    if (autoCountrySet) return;
    const fetchGeo = async () => {
      try {
        const res = await fetch('/api/geo');
        if (!res.ok) return;
        const data = await res.json();
        const code = (data?.country || '').toUpperCase();
        const match = countries.find((c) => c.code === code);
        if (match) {
          setSelectedCountry(match);
          setAutoCountrySet(true);
        }
      } catch {
        // Best-effort only
      }
    };
    fetchGeo();
  }, [autoCountrySet]);

  

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
  const serviceFeeUsdc = typeof priceData?.serviceFee === 'number' ? priceData.serviceFee : DEFAULT_SERVICE_FEE_USDC;
  const amountUsdc = amountKes && price > 0 ? (Number.parseFloat(amountKes) / price).toFixed(2) : "0.00";
  
  // Validate input
  const validateAmount = useCallback((value: string) => {
    setValidationError("");

    // istanbul ignore next -- unreachable: validateAmount's only call site
    // (the amountKes-change effect below) already gates on `if (amountKes)`,
    // so `value` is always truthy here.
    if (!value) return;

    const amount = Number.parseFloat(value);
    if (Number.isNaN(amount) || amount <= 0) {
      setValidationError("Please enter a valid amount");
      return;
    }

    // Check amount restrictions based on country
    const restrictions: { [key: string]: { min: number; max: number } } = {
      "KE": { min: 5, max: 5000 },
      "UG": { min: 50, max: 50000 },
      "TZ": { min: 500, max: 200000 },
      "RW": { min: 100, max: 40000 },
      "ZA": { min: 5, max: 65 },
    };
    
    // istanbul ignore next -- unreachable: selectedCountry.code can only be
    // one of the 5 `countries` entries, all of which are keys of
    // `restrictions`, so the fallback can never trigger.
    const limit = restrictions[selectedCountry.code] || restrictions["KE"];
    if (amount < limit.min || amount > limit.max) {
      setValidationError(`Amount must be between ${limit.min} and ${limit.max} ${currentCurrency}`);
      return;
    }

    // Check USDC balance against the full cost of the transaction: the
    // airtime amount plus the service fee, minus whatever's held back for
    // gas on chains where USDC also pays for gas (Arc) — otherwise the
    // balance check can pass and the order still fail at broadcast/creation
    // time with not enough left for the fee or gas.
    if (usdcBalance) {
      const balanceUsdc = parseFloat(formatUnits(usdcBalance.value, 6));
      const spendableBalance = balanceUsdc - gasReserveUsdc;
      const totalCostUsdc = parseFloat(amountUsdc) + serviceFeeUsdc;
      // "Use max amount" derives its KES figure from spendableBalance via a
      // floor (see maxSpendableKes below), then this effect converts that
      // KES figure back to USDC via toFixed(2) rounding — a different
      // rounding direction that, combined with plain binary floating-point
      // error, can land a cent above spendableBalance for the exact max
      // amount. A half-cent tolerance absorbs that round-trip noise without
      // meaningfully loosening the real balance check.
      const FLOAT_TOLERANCE_USDC = 0.005;
      if (totalCostUsdc > spendableBalance + FLOAT_TOLERANCE_USDC) {
        setValidationError('Insufficient balance');
      }
    }
  }, [selectedCountry.code, currentCurrency, usdcBalance, amountUsdc, gasReserveUsdc, serviceFeeUsdc]);

  // Validate on amount change
  useEffect(() => {
    if (amountKes) {
      validateAmount(amountKes);
    }
  }, [amountKes, price, validateAmount]);

  // Create order mutation
  const createOrderMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; amountKes: number; walletAddress: string; chainId: number }) => {
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
        void logToServer('error', 'Airtime send failed (suppressed)', { status: airtimeResponse.status });
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
        // istanbul ignore next -- unreachable: `friendly` is initialized to a
        // non-empty default string and only ever reassigned to other
        // non-empty strings above, so it can never be falsy here.
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
        // istanbul ignore next -- unreachable via the UI: handlePay (the only
        // caller of this mutation) already returns early for both of these
        // cases before ever calling mutate(), so they're pure defense in
        // depth against this mutationFn being invoked some other way.
        if (isSmartWallet) {
          throw new Error('Smart wallet detected. Please use the smart wallet payment button.');
        }
        // istanbul ignore next
        if (!effectiveAddress) {
          throw new Error('Please connect your wallet first');
        }

        if (!unifiedWalletClient) {
          throw new Error('Unable to access wallet. Please refresh the page and try again');
        }
        
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        const amountWei = parseUnits(order.amountUsdc.toString(), activeChainConfig.usdcDecimals);
        const airtimeContractAddress = activeChainConfig.airtimeContractAddress;
        if (!airtimeContractAddress) {
          throw new Error(`${activeChainConfig.displayName} is not available for payments right now`);
        }

        if (typeof unifiedWalletClient.writeContract !== 'function') {
          throw new Error('Connected wallet cannot send transactions');
        }

        let txHash: unknown;

        if (activeChainConfig.supportsPermit) {
          // Ensure the connected wallet supports typed data signing
          // istanbul ignore next -- the `!unifiedWalletClient` half can never
          // be true here: the guard a few lines above already throws and
          // returns when unifiedWalletClient is falsy, so only the
          // `typeof ... !== 'function'` half is reachable.
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
            tokenAddress: activeChainConfig.usdcAddress,
            owner: effectiveAddress as `0x${string}`,
            spender: airtimeContractAddress,
            value: amountWei,
            deadline,
            walletClient: signingClient,
            chainId: (await unifiedWalletClient.getChainId?.()) ?? activeChainConfig.chain.id,
            chain: activeChainConfig.chain
          });

          if (permitSig.error) throw new Error(permitSig.error);
          if (!permitSig.v || !permitSig.r || !permitSig.s) throw new Error('Invalid permit signature');

          txHash = await unifiedWalletClient.writeContract({
            address: airtimeContractAddress,
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
        } else {
          // Chains where gasless permit isn't confirmed to work: approve then deposit as two txs.
          const approveTxHash = await unifiedWalletClient.writeContract({
            address: activeChainConfig.usdcAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [airtimeContractAddress, amountWei]
          });

          const publicClient = createPublicClient({ chain: activeChainConfig.chain, transport: http() });
          await publicClient.waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` });

          txHash = await unifiedWalletClient.writeContract({
            address: airtimeContractAddress,
            abi: AIRTIME_ABI,
            functionName: 'deposit',
            args: [order.orderRef, amountWei]
          });
        }

        const result = await sendAirtime(order.orderRef, txHash as string);
        void logToServer('info', 'EOA tx completed', { orderRef: order.orderRef, txHash });
        return result;
      } catch (error: unknown) {
        // Transform technical errors into user-friendly messages
        const errorMessage = error instanceof Error ? error.message : String(error);
        void logToServer('error', 'EOA payment failed', { orderRef: order.orderRef, error: errorMessage });
        
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
      // istanbul ignore next -- unreachable: this query is gated by
      // `enabled: !!order?.orderRef && shouldPoll`, so queryFn never runs
      // while order.orderRef is falsy.
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
    // istanbul ignore next -- unreachable: the Transaction component that
    // calls this only renders once an order exists (see the confirm-payment
    // screen's conditional render).
    if (!order) {
      throw new Error('No order available to pay');
    }
    const airtimeContractAddress = activeChainConfig.airtimeContractAddress;
    if (!airtimeContractAddress) {
      throw new Error(`${activeChainConfig.displayName} is not available for payments right now`);
    }
    const amountWei = parseUnits(order.amountUsdc.toString(), activeChainConfig.usdcDecimals);
    return [
      {
        to: activeChainConfig.usdcAddress,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [airtimeContractAddress, amountWei]
        })
      },
      {
        to: airtimeContractAddress,
        data: encodeFunctionData({
          abi: AIRTIME_ABI as Abi,
          functionName: 'deposit',
          args: [order.orderRef, amountWei]
        })
      }
    ];
  }, [order, activeChainConfig]);

  const handleSmartWalletSuccess = useCallback(async ({ transactionReceipts }: { transactionReceipts: { transactionHash: string }[] }) => {
    // istanbul ignore next -- unreachable: the Transaction component that
    // wires this in as onSuccess only renders inside the `order &&` confirm
    // screen (see the `{!order ? (...) : (...)}` split below).
    if (!order) return;
    // Both terminal states can land before this wallet callback fires (the
    // delivery callback and refund are fast): 'fulfilled' means delivered and
    // 'refunded' means already returned. Each has its own banner below, so
    // there is nothing left to do here and nothing to warn about.
    if (orderStatus?.status === 'fulfilled' || orderStatus?.status === 'refunded') return;
    const priorState = airtimeSendState[order.orderRef];
    // istanbul ignore next -- guards a real double-invocation race (e.g. a
    // fast double-click) but reproducing it deterministically means firing
    // two overlapping async calls that both need to observe the first
    // call's state update before the second one's guard check runs; forcing
    // that exact interleaving in a test harness proved fragile enough to
    // cause real timeouts (see git history) without a reliable fix.
    if (priorState === 'pending' || priorState === 'done') {
      return;
    }
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
      void logToServer('info', 'Smart wallet tx completed', { orderRef: order.orderRef, txHash });
    } catch (err) {
      void logToServer('error', 'Smart wallet airtime send failed', { orderRef: order.orderRef, error: String(err) });
      setAirtimeSendState((prev) => ({ ...prev, [order.orderRef]: 'done' }));
    }
  }, [order, orderStatus?.status, airtimeSendState, sendAirtime]);

  // Reset polling when order changes
  useEffect(() => {
    if (order) {
      setShouldPoll(true);
      setSmartTxnBusy(false);
    }
  }, [order]);

  const handleContinue = async () => {
    // istanbul ignore next -- unreachable: continueDisabled already blocks
    // the click that would reach this function whenever effectiveAddress is
    // unset (via !isConnected), so this is defense in depth only.
    if (!effectiveAddress) {
      setValidationError("Please connect your wallet");
      return;
    }

    // istanbul ignore next -- unreachable for the same reason: continueDisabled
    // already checks !phoneNumber.
    if (!phoneNumber) {
      setValidationError("Please enter a phone number");
      return;
    }

    if (phoneNumber.length !== 9) {
      setValidationError("Phone number must be exactly 9 digits");
      return;
    }

    // istanbul ignore next -- unreachable: validateAmount's own effect
    // already sets validationError (which disables Continue) for any amount
    // that's empty, NaN, or <= 0, before this can ever run against one.
    if (!amountKes || Number.parseFloat(amountKes) <= 0) {
      setValidationError("Please enter a valid amount");
      return;
    }

    // istanbul ignore next -- unreachable: continueDisabled already checks
    // !!validationError.
    if (validationError) return;
    
    // Create order first
    createOrderMutation.mutate({
      phoneNumber: fullPhoneNumber,
      amountKes: Number.parseFloat(amountKes),
      walletAddress: effectiveAddress,
      chainId: activeChainConfig.chain.id,
    });
  };

  const handlePay = () => {
    // istanbul ignore next -- unreachable: this handler is only wired to the
    // EOA "Pay & Send Airtime" button, which only renders when !isSmartWallet.
    if (isSmartWallet) return; // smart wallets use OnchainKit Transaction flow
    // istanbul ignore next -- unreachable: this button only renders on the
    // confirm-payment screen, which requires an order to exist.
    if (!order) return;

    // istanbul ignore next -- unreachable: the Pay button is already
    // disabled via !isConnected whenever effectiveAddress is unset.
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
    ? fmtUsdc(Number.parseFloat(formatUnits(usdcBalance.value, 6)))
    : "0.00";

  // Normalized connection flags and button labels (avoid nested ternaries and negated conditions)
  const isConnected = Boolean(effectiveAddress);
  const continueDisabled = createOrderMutation.isPending || !isConnected || !phoneNumber || !amountKes || !!validationError || isPriceLoading;

  // Total USDC available for this transaction after holding back gas
  // (nonzero only on chains where USDC also pays for gas, e.g. Arc).
  const spendableBalanceUsdc = usdcBalance
    ? parseFloat(formatUnits(usdcBalance.value, 6)) - gasReserveUsdc
    : 0;
  // Mirrors validateAmount's FLOAT_TOLERANCE_USDC — same KES/USDC round-trip,
  // same boundary-noise risk, so it needs the same tolerance to stay in sync.
  const hasInsufficientBalance = Boolean(
    isConnected && amountKes && (parseFloat(amountUsdc) + serviceFeeUsdc) > spendableBalanceUsdc + 0.005
  );

  // Largest airtime amount payable with what's left after reserving gas and
  // the flat service fee — both are subtracted from spendable balance before
  // converting the remainder to local currency.
  const maxSpendableUsdc = Math.max(spendableBalanceUsdc - serviceFeeUsdc, 0);
  const maxSpendableKes = price > 0 ? Math.floor(maxSpendableUsdc * price * 100) / 100 : 0;

  const handleUseMaxAmount = () => {
    setAmountKes(maxSpendableKes > 0 ? maxSpendableKes.toString() : '');
  };

  let continueButtonText: string;
  if (createOrderMutation.isPending) {
    continueButtonText = 'Creating Order...';
  } else if (!isConnected) {
    continueButtonText = 'Connect Wallet';
  } else {
    continueButtonText = 'Continue';
  }

  // A refunded order has nothing left to pay for or view, so the pay /
  // "View transaction" button is not rendered at all.
  const isRefunded = orderStatus?.status === 'refunded';
  const isOrderProcessing = orderStatus?.status === 'processing' || (orderStatus?.status === 'pending' && Boolean(orderStatus?.tx_hash));

  let payButtonText: string;
  if (orderStatus?.status === 'fulfilled') {
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
    orderStatus?.status === 'fulfilled' ||
    isOrderProcessing ||
    smartTxnBusy ||
    eoaTxnBusy ||
    currentAirtimeSendState === 'pending' ||
    currentAirtimeSendState === 'done';

  useEffect(() => {
    if (orderStatus?.status === 'fulfilled' || orderStatus?.status === 'refunded') {
      setEoaTxnBusy(false);
      setSmartTxnBusy(false);
    }
    // Delivered or refunded is the end state; don't leave an earlier error
    // (e.g. a transient wallet/callback error) sitting next to its banner.
    if (orderStatus?.status === 'fulfilled' || orderStatus?.status === 'refunded') {
      setValidationError('');
    }
    if (orderStatus?.status === 'processing' || orderStatus?.status === 'pending') {
      setSmartTxnBusy(false);
    }
  }, [orderStatus?.status]);

  useEffect(() => {
    setSmartTxnBusy(false);
  }, []);

  // Shared between the smart-wallet and EOA pay branches so both surface
  // the same order-status/success/error feedback beneath their pay button.
  const orderStatusSection = (
    <>
      {orderStatus && (
        <div className={styles.statusDisplay}>
          {(orderStatus.status === 'processing' || (orderStatus.status === 'pending' && orderStatus.tx_hash)) && (
            <div className={styles.processingMessage}>
              <svg className={styles.spinnerIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" strokeLinecap="round"/>
              </svg>
              Sending airtime to your phone…
            </div>
          )}

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
              We couldn&apos;t deliver this airtime, so the airtime cost has been refunded to your wallet.
              {orderStatus.refund_tx_hash && (
                <>
                  {' '}
                  <a
                    href={`${getChainConfigById(orderStatus.chain_id).blockExplorerUrl}/tx/${orderStatus.refund_tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{color: '#0ea5e9', textDecoration: 'underline'}}
                  >
                    View refund transaction
                  </a>
                </>
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
    </>
  );

  // Hide the fixed wallet-address pill while scrolling down (it has nothing
  // to stay pinned above once the card has scrolled past it) and bring it
  // back on scroll up or near the top, so it doesn't sit fixed over content
  // for the entire scroll.
  useEffect(() => {
    let lastScrollY = window.scrollY;
    const SCROLL_HIDE_THRESHOLD = 24;
    const onScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY <= SCROLL_HIDE_THRESHOLD) {
        setHeaderHidden(false);
      } else if (currentScrollY > lastScrollY) {
        setHeaderHidden(true);
      } else if (currentScrollY < lastScrollY) {
        setHeaderHidden(false);
      }
      lastScrollY = currentScrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
    <div className={styles.container}>
      <header className={`${styles.headerWrapper} ${headerHidden ? styles.headerHidden : ''}`}>
        <Wallet />
      </header>

      <div className={styles.content}>
        {!order ? (
          <div className={styles.card}>
            <div className={styles.cardHeader}>

              <div className={styles.brandHeader}>
                <Image
                  src="/topizzy_logo.png"
                  alt="Topizzy"
                  width={56}
                  height={56}
                  priority
                  className={styles.brandLogo}
                />
              </div>
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
                      // istanbul ignore next -- unreachable: the <select>'s
                      // options are generated from this same `countries`
                      // array, so e.target.value always matches an entry.
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
                    <span className={styles.flagIcon}>
                      {selectedCountry.code === 'KE' ? '🇰🇪'
                        : selectedCountry.code === 'RW' ? '🇷🇼'
                        : selectedCountry.code === 'UG' ? '🇺🇬'
                        : selectedCountry.code === 'ZA' ? '🇿🇦'
                        : '🇹🇿'}
                    </span>
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
                <div className={styles.amountLabelRow}>
                  <label className={styles.label}>Amount ({currentCurrency})</label>
                  {isConnected && (
                    <span className={styles.balanceLabel}>Balance ${usdcBalanceFormatted}</span>
                  )}
                </div>
                {validationError && (
                  <div className={hasInsufficientBalance ? styles.insufficientBanner : styles.errorMessage}>
                    {hasInsufficientBalance && (
                      <svg className={styles.infoIcon} viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                        <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                      </svg>
                    )}
                    {validationError}
                  </div>
                )}
                <div className={styles.amountInputWrapper}>
                  <input
                    type="number"
                    placeholder="100"
                    value={amountKes}
                    onChange={(e) => setAmountKes(e.target.value)}
                    className={`${styles.amountInput} ${hasInsufficientBalance ? styles.amountInputError : ''}`}
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

                {isConnected && (
                  <button type="button" className={styles.useMaxButton} onClick={handleUseMaxAmount}>
                    Use max amount (${fmtUsdc(maxSpendableUsdc)})
                  </button>
                )}

                {chain && !([CHAINS.base.chain.id, CHAINS.arc.chain.id] as number[]).includes(chain.id) && (
                  <div className={styles.networkWarning}>
                    Connected to {chain.name}, which isn&apos;t supported.
                    <button onClick={() => switchToChain('base')} className={styles.networkSwitchBtn}>
                      Switch to Base
                    </button>
                    <button onClick={() => switchToChain('arc')} className={styles.networkSwitchBtn}>
                      Switch to Arc
                    </button>
                  </div>
                )}

                <div className={styles.chainToggleRow}>
                  <div className={styles.chainToggleGroup}>
                    {(Object.keys(CHAINS) as ChainKey[]).map((key) => {
                      const isActive = activeChainConfig.key === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => switchToChain(key)}
                          disabled={isActive}
                          className={isActive ? styles.chainToggleBtnActive : styles.chainToggleBtn}
                        >
                          {isActive && <span className={styles.chainToggleDot} />}
                          {CHAINS[key].displayName}
                        </button>
                      );
                    })}
                  </div>
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
              {hasInsufficientBalance && (
                <div className={styles.continueHelperText}>Add USDC to your wallet to continue</div>
              )}

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
                <Transaction
                  chainId={activeChainConfig.chain.id}
                  calls={smartWalletCalls}
                  isSponsored={activeChainConfig.key === 'base'}
                  onStatus={(status) => {
                    const busyStates = ['buildingTransaction', 'transactionPending', 'transactionLegacyExecuted'];
                    if (busyStates.includes(status.statusName)) {
                      setSmartTxnBusy(true);
                    } else if (status.statusName === 'success' || status.statusName === 'error' || status.statusName === 'reset') {
                      setSmartTxnBusy(false);
                    }
                  }}
                  onError={(e) => setValidationError((e as { message?: string })?.message || 'Transaction failed')}
                  onSuccess={handleSmartWalletSuccess}
                >
                  {orderStatusSection}

                  {/* Below the order-status section and above "Back". The
                      default OnchainKit button links its "View transaction"
                      state to basescan.org for any chain it doesn't know
                      (Arc included), so the success state is rendered here
                      against the active chain's own explorer. */}
                  {!isRefunded && (
                  <TransactionButton
                    className={styles.continueButton}
                    disabled={smartWalletDisabled}
                    render={({ status, context, onSubmit, isDisabled }) => {
                      let label = payButtonText;
                      if (status === 'success') label = 'View transaction';
                      else if (status === 'error') label = 'Try again';
                      else if (status === 'pending') label = 'Processing Airtime...';
                      return (
                        <button
                          type="button"
                          data-testid="transaction-button"
                          className={styles.continueButton}
                          disabled={isDisabled}
                          onClick={() => {
                            if (status === 'success') {
                              window.open(
                                `${activeChainConfig.blockExplorerUrl}/tx/${context.transactionHash}`,
                                '_blank',
                                'noopener,noreferrer'
                              );
                              return;
                            }
                            onSubmit();
                          }}
                        >
                          {label}
                        </button>
                      );
                    }}
                  />
                  )}

                  {/* Must stay inside <Transaction>: it reads the
                      transaction result from that component's context. */}
                  <TransactionToast />
                </Transaction>
              ) : (
                <>
                  {!isRefunded && (
                  <button
                    onClick={handlePay}
                    disabled={
                      payAndSendMutation.isPending ||
                      eoaTxnBusy ||
                      !isConnected ||
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

                  {orderStatusSection}
                </>
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
    href="https://wa.me/254769007848?text=Hi%2C%20I%20am%20making%20an%20inquiry%20concerning%20Topizzy"
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
