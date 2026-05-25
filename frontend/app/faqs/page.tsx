'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './faqs.module.css';

type Faq = { id: number; question: string; answer: string; category: string };

export default function FaqsPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/faqs')
      .then(r => r.json())
      .then(data => setFaqs(data.faqs ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}>
          <Image src="/topizzy_logo.png" alt="Topizzy" width={36} height={36} priority />
          <span>Topizzy</span>
        </Link>
        <Link href="/platform" className={styles.openApp}>Open App</Link>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Frequently Asked Questions</h1>
        <p className={styles.subtitle}>Everything you need to know about Topizzy</p>

        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : (
          <div className={styles.list}>
            {faqs.map(faq => (
              <div key={faq.id} className={`${styles.item} ${openId === faq.id ? styles.itemOpen : ''}`}>
                <button
                  type="button"
                  className={styles.question}
                  onClick={() => setOpenId(openId === faq.id ? null : faq.id)}
                  aria-expanded={openId === faq.id}
                >
                  <span>{faq.question}</span>
                  <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {openId === faq.id && (
                  <p className={styles.answer}>{faq.answer}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={styles.contact}>
          <p>Still have questions?</p>
          <a href="https://wa.me/254769007848" target="_blank" rel="noopener noreferrer" className={styles.contactBtn}>
            Chat with us on WhatsApp
          </a>
        </div>
      </main>
    </div>
  );
}
