'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from '../legal.module.css';

type Section = { heading: string; body: string[] };
type Terms = { lastUpdated: string; sections: Section[] };

export default function TermsPage() {
  const [data, setData] = useState<Terms | null>(null);

  useEffect(() => {
    fetch('/api/terms').then(r => r.json()).then(setData);
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
        <span className={styles.eyebrow}>Legal</span>
        <h1 className={styles.title}>Terms &amp; Conditions</h1>
        {data && <p className={styles.meta}>Last updated: {data.lastUpdated}</p>}
        <hr className={styles.divider} />

        {data ? (
          <div className={styles.sections}>
            {data.sections.map((s, i) => (
              <div key={i} className={styles.section}>
                <h2 className={styles.heading}>{s.heading}</h2>
                {s.body.map((p, j) => (
                  <p key={j} className={styles.para}>{p}</p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.para}>Loading…</p>
        )}

        <div className={styles.contact}>
          <p>Questions about these terms?</p>
          <p>
            Email us at <a href="mailto:hello@topizzy.com">hello@topizzy.com</a> or{' '}
            <a href="https://wa.me/254769007848" target="_blank" rel="noopener noreferrer">
              chat on WhatsApp
            </a>.
          </p>
        </div>
      </main>
    </div>
  );
}
