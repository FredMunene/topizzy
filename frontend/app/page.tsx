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
              </div>
              <p className={styles.networksLabel}>Works with all mobile networks</p>
            </div>
          </div>

          <div className={styles.heroImage}>
            <Image
              src="/hero-landing.png"
              alt="Topizzy Landing Hero"
              width={600}
              height={480}
              priority
              style={{ objectFit: 'contain' }}
            />
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
              <div className={styles.stepNumber}>1</div>
              <h3 className={styles.stepTitle}>Enter Phone Number</h3>
              <p className={styles.stepDescription}>
                Enter the phone number you want to recharge
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <h3 className={styles.stepTitle}>Enter Amount</h3>
              <p className={styles.stepDescription}>
                Enter the phone number you want to recharge
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <h3 className={styles.stepTitle}>Complete Payment</h3>
              <p className={styles.stepDescription}>
                Enter the phone number you want to recharge
              </p>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
}
