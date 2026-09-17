/** @jest-environment jsdom */
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import LandingPage from '@/app/page';

describe('LandingPage', () => {
  it('renders the hero heading and primary CTA', () => {
    render(<LandingPage />);
    expect(screen.getByText('Turn Crypto Into Airtime Instantly')).toBeInTheDocument();
    expect(screen.getByText('Buy Airtime Now')).toBeInTheDocument();
  });

  it('toggles the mobile nav open and closed via the hamburger button', () => {
    render(<LandingPage />);
    const toggle = screen.getByLabelText('Toggle menu');
    // Find the FAQs nav link inside the <nav> element to check its container's open state indirectly.
    const faqsLink = screen.getAllByText('FAQs')[0];
    const navEl = faqsLink.closest('nav')!;

    expect(navEl.className).not.toMatch(/navOpen/);
    fireEvent.click(toggle);
    expect(navEl.className).toMatch(/navOpen/);
    fireEvent.click(toggle);
    expect(navEl.className).not.toMatch(/navOpen/);
  });

  it('closes the nav when the "How It Works" link is clicked', () => {
    render(<LandingPage />);
    const toggle = screen.getByLabelText('Toggle menu');
    const faqsLink = screen.getAllByText('FAQs')[0];
    const navEl = faqsLink.closest('nav')!;

    fireEvent.click(toggle);
    expect(navEl.className).toMatch(/navOpen/);

    fireEvent.click(within(navEl).getByText('How It Works'));
    expect(navEl.className).not.toMatch(/navOpen/);
  });

  it('closes the nav when the FAQs link is clicked', () => {
    render(<LandingPage />);
    const toggle = screen.getByLabelText('Toggle menu');
    const faqsLink = screen.getAllByText('FAQs')[0];
    const navEl = faqsLink.closest('nav')!;

    fireEvent.click(toggle);
    fireEvent.click(within(navEl).getByText('FAQs'));
    expect(navEl.className).not.toMatch(/navOpen/);
  });

  it('closes the nav when the "Open App" link is clicked', () => {
    render(<LandingPage />);
    const toggle = screen.getByLabelText('Toggle menu');
    const faqsLink = screen.getAllByText('FAQs')[0];
    const navEl = faqsLink.closest('nav')!;

    fireEvent.click(toggle);
    fireEvent.click(within(navEl).getByText('Open App'));
    expect(navEl.className).not.toMatch(/navOpen/);
  });

  it('shows a "coming soon" popup when Blogs is clicked, and hides it again after 3 seconds', () => {
    jest.useFakeTimers();
    render(<LandingPage />);

    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Blogs'));
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});
