'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './landing.module.css';

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className={styles.landingContainer}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.logo}>
            <Image 
              src="/logo.png" 
              alt="Topizzy Logo" 
              width={32} 
              height={32}
              priority
            />
            <span>Topizzy</span>
          </div>

          <nav className={`${styles.nav} ${isMenuOpen ? styles.navOpen : ''}`}>
            <a href="#how-it-works" className={styles.navLink}>How It Works</a>
            <a href="#faq" className={styles.navLink}>FAQs</a>
            <Link href="/platform" className={styles.ctaButton}>Connect Wallet</Link>
          </nav>

          <button 
            className={styles.hamburger}
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>Turn Crypto Into Airtime Instantly</h1>
            <p className={styles.heroSubtitle}>
              Easily buy mobile airtime using USDC for any phone number in Kenya.
            </p>
            <div className={styles.heroButtons}>
              <Link href="/platform" className={styles.primaryButton}>
                Buy Airtime Now
              </Link>
            </div>
            <div className={styles.networks}>
              
              <div className={styles.networkLogos}>
                <div className={styles.networkLogo}>
                  <Image
                    src="/safaricomLogo.png"
                    alt="Safaricom Logo"
                    width={80}
                    height={80}
                  />
                </div>
                <div className={styles.networkLogo}>
                  <Image
                    src="/airtelLogo.png"
                    alt="Airtel Logo"
                    width={80}
                    height={80}
                  />
                </div>
                <div className={styles.networkLogo}>
                  <Image
                    src="/vodacomLogo.png"
                    alt="Vodacom Logo"
                    width={80}
                    height={80}
                  />
                </div>
                <div className={styles.networkLogo}>
                  <Image
                    src="/mtnLogo.png"
                    alt="MTN Logo"
                    width={80}
                    height={80}
                  />
                </div>
              </div>
              <p className={styles.networksLabel}>Works with all mobile networks</p>
            </div>
          </div>

          <div className={styles.heroImage}>
            <div className={styles.imageWrapper}>
              <Image
                src="/circleBg.png"
                alt="Circle background"
                width={800}
                height={800}
                className={styles.circleBg}
                priority
              />
              <Image
                src="/hero-landing.png"
                alt="Topizzy Landing Hero"
                width={1000}
                height={850}
                className={styles.mainHero}
                priority
                style={{ objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className={styles.howItWorks}>
        <div className={styles.sectionContent}>
          <h2 className={styles.sectionTitle}>How It Works</h2>
          <p className={styles.sectionSubtitle}>Buy Airtime in 3 Easy Steps</p>

          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
                  <path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H7zm5 19c-2.76 0-5-2.24-5-5V8c0-2.76 2.24-5 5-5s5 2.24 5 5v8c0 2.76-2.24 5-5 5z"/>
                </svg>
              </div>
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Enter Phone Number</h3>
              <p className={styles.stepDescription}>
                Enter the phone number you want to recharge
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
                  <path d="M9 11l3 3L22 4l-1.41-1.41L12 11.17 6.41 5.59 5 7l4 4z"/>
                </svg>
              </div>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Enter Amount</h3>
              <p className={styles.stepDescription}>
                Choose the amount in your desired currency for the top-up
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" aria-hidden="true">
                  <path d="M21 7H3C1.9 7 1 7.9 1 9v10c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 12H3V9h18v10zm-9-3H6v-2h6v2zm9-4h-7V9h7v3z"/>
                </svg>
              </div>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Pay with USDC</h3>
              <p className={styles.stepDescription}>
                Connect your crypto wallet and pay securely in USDC
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Use Topizzy Section */}
      <section className={styles.features}>
        <div className={styles.sectionContent}>
          <h2 className={styles.sectionTitle}>Why Use Topizzy?</h2>

          <div className={styles.whyGrid}>
            <div className={styles.decorCircle} aria-hidden="true" />
            <div className={styles.decorCircleSmall} aria-hidden="true" />

            <svg
              className={styles.pathSvg}
              viewBox="0 0 1200 400"
              aria-hidden="true"
              preserveAspectRatio="none"
            >
              <defs>
                <marker
                  id="arrow"
                  markerWidth="10"
                  markerHeight="10"
                  refX="7"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10" fill="rgba(99,102,241,0.5)" />
                </marker>
              </defs>
              <path
                d="M 120 340 C 360 330 500 210 680 240 S 960 260 1060 120"
                fill="none"
                stroke="rgba(99,102,241,0.45)"
                strokeWidth="10"
                strokeLinecap="round"
                markerEnd="url(#arrow)"
              />
            </svg>

            <div className={`${styles.whyItem} ${styles.item1}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zM12 17c-2.76 0-5-2.24-5-5V8.5l5-2.22 5 2.22V12c0 2.76-2.24 5-5 5z"/>
                </svg>
              </div>
              <h3>Simple &amp; Secure</h3>
              <p>Use your crypto wallet to buy airtime securely</p>
            </div>

            <div className={`${styles.whyItem} ${styles.item2}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M13 2H6c-1.1 0-2 .9-2 2v16l4-4h5c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H8l-2 2V4h7v10zm8-7h-5v2h5v11H7v2h14c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
              <h3>Fast Delivery</h3>
              <p>Top up instantly 24/7 with no delays.</p>
            </div>

            <div className={`${styles.whyItem} ${styles.item3}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 2.5 1.46 4.66 3.62 5.8L10 22l2-2h3c3.87 0 7-3.13 7-7s-3.13-7-7-7zm0 12c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                  <circle cx="12" cy="9" r="2" fill="white" opacity="0.9" />
                </svg>
              </div>
              <h3>ALL Networks Supported</h3>
              <p>Works with Safaricom, Airtel, MTN, Vodacom and more</p>
            </div>

            <div className={`${styles.whyItem} ${styles.item4}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20 7h-3V5c0-1.1-.9-2-2-2H9C7.9 3 7 3.9 7 5v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm-8 9c-1.66 0-3-1.34-3-3 0-1.3.84-2.4 2-2.82V11h2v-.82c1.16.42 2 1.52 2 2.82 0 1.66-1.34 3-3 3z"/>
                </svg>
              </div>
              <h3>No Banks or Cards</h3>
              <p>Just your wallet and phone number: it&apos;s that easy</p>
            </div>

            <div className={`${styles.stepBadge} ${styles.step1}`}>01</div>
            <div className={`${styles.stepBadge} ${styles.step2}`}>02</div>
            <div className={`${styles.stepBadge} ${styles.step3}`}>03</div>
            <div className={`${styles.stepBadge} ${styles.step4}`}>04</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.finalCta}>
        <div className={styles.sectionContent}>
          <h2>Ready to get started?</h2>
          <p>Convert your USDC to airtime in seconds</p>
          <Link href="/platform" className={styles.primaryButton}>
            Connect Wallet & Buy Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.sectionContent}>
          <div className={styles.footerContent}>
            <div className={styles.footerSection}>
              <h4>About Topizzy</h4>
              <p>The easiest way to buy airtime with crypto</p>
            </div>
            <div className={styles.footerSection}>
              <h4>Support</h4>
              <a href="https://wa.me/254743913802" target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
            <div className={styles.footerSection}>
              <h4>Legal</h4>
              <a href="#privacy">Privacy Policy</a>
              <a href="#terms">Terms of Service</a>
            </div>
          </div>
          <div className={styles.footerBottom}>
            <p>&copy; 2024 Topizzy. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
