"use client";
"use client";
"use client";
import { useEffect, useState } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAccount } from 'wagmi'
import styles from "./page.module.css";

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amountKes, setAmountKes] = useState("");
  const [order, setOrder] = useState<any>(null);
  const { address } = useAccount();

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  // Fetch latest price
  const { data: priceData } = useQuery({
    queryKey: ["price"],
    queryFn: () => fetch("/api/prices").then((res) => res.json()),
    refetchInterval: 30000, // every 30s
  });

  const price = priceData?.price || 0;
  const amountUsdc = amountKes ? (parseFloat(amountKes) / price).toFixed(6) : "0";

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

  // Send airtime mutation (mock payment)
  const sendAirtimeMutation = useMutation({
    mutationFn: (orderRef: string) =>
      fetch("/api/airtime/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderRef }),
      }).then((res) => res.json()),
  });

  const handleCreateOrder = () => {
    if (!phoneNumber || !amountKes || !address) return;
    createOrderMutation.mutate({
      phoneNumber,
      amountKes: parseFloat(amountKes),
      walletAddress: address,
    });
  };

  const handlePay = () => {
    if (!order) return;
    // Mock: directly send airtime
    sendAirtimeMutation.mutate(order.orderRef);
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
            <input
              type="tel"
              placeholder="Phone Number (e.g. +254711XXXYYY)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className={styles.input}
            />
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
            <button onClick={handlePay} className={styles.button}>
              Pay & Send Airtime
            </button>
            {sendAirtimeMutation.isSuccess && <p>Airtime sent successfully!</p>}
            {sendAirtimeMutation.isError && <p>Error sending airtime</p>}
          </div>
        )}
      </div>
    </div>
  );
}
