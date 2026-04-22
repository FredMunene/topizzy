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
              src="/topizzy_logo.png" 
              alt="Topizzy Logo" 
              width={120} 
              height={120}
              priority
            />
            <span>Topizzy</span>
          </div>

          <nav className={`${styles.nav} ${isMenuOpen ? styles.navOpen : ''}`}>
            <a href="#how-it-works" className={styles.navLink} onClick={() => setIsMenuOpen(false)}>How It Works</a>
            <a href="#faq" className={styles.navLink} onClick={() => setIsMenuOpen(false)}>FAQs</a>
            <Link href="/platform" className={styles.ctaButton} onClick={() => setIsMenuOpen(false)}>Connect Wallet</Link>
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
              <div className={styles.infoCard}>
                <div className={styles.infoCardIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className={styles.infoCardText}>
                  <div className={styles.infoCardTitle}>Instant Airtime Top-Up</div>
                  <div className={styles.infoCardSubtitle}>Delivered in seconds</div>
                </div>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardSecondary}`}>
                <div className={`${styles.infoCardIcon} ${styles.infoCardIconSecondary}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L3 14h9l-1 8L21 10h-9l1-8z" />
                  </svg>
                </div>
                <div className={styles.infoCardText}>
                  <div className={styles.infoCardTitle}>Available 24/7</div>
                  <div className={styles.infoCardSubtitle}>Top up anytime, day or night</div>
                </div>
              </div>
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
              viewBox="0 0 1200 800"
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
                  <path d="M0,0 L10,5 L0,10" fill="rgba(124, 134, 255, 0.5)" />
                </marker>
              </defs>
              {/* Arrow 1: Item 1 to Item 2 */}
              <path
                d="M 150 760 Q 250 800 350 590"
                fill="none"
                stroke="rgba(124, 134, 255, 0.4)"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#arrow)"
              />
              {/* Arrow 2: Item 2 to Item 3 */}
              <path
                d="M 450 568 Q 550 608 650 398"
                fill="none"
                stroke="rgba(124, 134, 255, 0.4)"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#arrow)"
              />
              {/* Arrow 3: Item 3 to Item 4 */}
              <path
                d="M 750 368 Q 820 408 950 224"
                fill="none"
                stroke="rgba(124, 134, 255, 0.4)"
                strokeWidth="4"
                strokeLinecap="round"
                markerEnd="url(#arrow)"
              />
            </svg>

            <div className={`${styles.whyItem} ${styles.item1}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <div className={styles.whyItemText}>
                <h3>Simple &amp; Secure</h3>
                <p>Use your crypto wallet to buy airtime securely</p>
              </div>
            </div>

            <div className={`${styles.whyItem} ${styles.item2}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M7 2v11h3v9l7-12h-4l4-8z"/>
                </svg>
              </div>
              <div className={styles.whyItemText}>
                <h3>Fast Delivery</h3>
                <p>Top up instantly 24/7 with no delays.</p>
              </div>
            </div>

            <div className={`${styles.whyItem} ${styles.item3}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
              </div>
              <div className={styles.whyItemText}>
                <h3>ALL Networks Supported</h3>
                <p>Works with Safaricom, Airtel, MTN, Vodacom and more</p>
              </div>
            </div>

            <div className={`${styles.whyItem} ${styles.item4}`}>
              <div className={styles.whyIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V6h18v12zm-9-7c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
              </div>
              <div className={styles.whyItemText}>
                <h3>No Banks or Cards</h3>
                <p>Just your wallet and phone number: it&apos;s that easy</p>
              </div>
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
          <h2>Ready to Top Up with Crypto?</h2>
          <p className={styles.ctaSubtitle}>Turn your USDC into airtime in seconds.<br />Works with all Kenya networks</p>
          <Link href="/platform" className={styles.ctaButton}>
            Get Started Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrand}>
              <div className={styles.footerBrandHeader}>
                <div className={styles.footerLogo}>
                  <Image src="/topizzy_logo.png" alt="Topizzy Logo" width={120} height={120} />
                </div>
                <div className={styles.footerBrandName}>Topizzy</div>
              </div>
              <div className={styles.footerTagline}>Turn crypto into mobile airtime instantly</div>
              <div className={styles.footerSocial}>
                <a href="https://wa.me/254743913802" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">
                  <Image src="/whatsappLogo.png" alt="WhatsApp" width={32} height={32} />
                </a>
                <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X">
                  <Image src="/xLogo.png" alt="X" width={32} height={32} />
                </a>
              </div>
            </div>

            <div className={styles.footerLinks}>
              <div className={styles.footerColumn}>
                <div className={styles.columnTitle}>Product</div>
                <a href="#">Buy Airtime</a>
                <a href="#">Download App</a>
              </div>
              <div className={styles.footerColumn}>
                <div className={styles.columnTitle}>Company</div>
                <a href="#">Benefits</a>
                <a href="#">Contact</a>
              </div>
              <div className={styles.footerColumn}>
                <div className={styles.columnTitle}>Resources</div>
                <a href="#how-it-works">How it Works</a>
                <a href="#faq">FAQs</a>
              </div>
              <div className={styles.footerColumn}>
                <div className={styles.columnTitle}>Customer Support</div>
                <a href="#">Help Center</a>
                <a href="#">Security Tips</a>
              </div>
            </div>
          </div>

          <hr className={styles.footerDivider} />

          <div className={styles.footerBottom}>
            <p>&copy; 2024 Topizzy. All rights reserved.</p>
            <div className={styles.footerLegal}>
              <a href="#terms">Terms &amp; Conditions</a>
              <a href="#privacy">Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
