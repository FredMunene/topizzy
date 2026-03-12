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

      {/* Features Section */}
      <section className={styles.features}>
        <div className={styles.sectionContent}>
          <h2 className={styles.sectionTitle}>Why Choose Topizzy?</h2>

          <div className={styles.featuresList}>
            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              <h3>Instant Top-Up</h3>
              <p>Delivered in seconds</p>
            </div>

            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5s-5 2.24-5 5v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/>
                </svg>
              </div>
              <h3>Secure Payment</h3>
              <p>With blockchain verification</p>
            </div>

            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
              </div>
              <h3>24/7 Support</h3>
              <p>Help whenever you need it</p>
            </div>

            <div className={styles.featureItem}>
              <div className={styles.featureIcon}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                </svg>
              </div>
              <h3>Available 24/7</h3>
              <p>Day or night</p>
            </div>
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
