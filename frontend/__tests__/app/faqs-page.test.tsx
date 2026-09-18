/** @jest-environment jsdom */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FaqsPage from '@/app/faqs/page';

const FAQS = [
  { id: 1, question: 'What is Topizzy?', answer: 'An onchain airtime app.', category: 'general' },
  { id: 2, question: 'What currency do I pay in?', answer: 'USDC.', category: 'payments' },
];

describe('FaqsPage', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ faqs: FAQS }),
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows a loading state before the FAQs arrive', async () => {
    render(<FaqsPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    // Let the fetch settle before the test ends, so React doesn't warn about
    // an unwrapped state update after this test has already torn down.
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  });

  it('renders the fetched FAQ questions once loaded', async () => {
    render(<FaqsPage />);
    await waitFor(() => expect(screen.getByText('What is Topizzy?')).toBeInTheDocument());
    expect(screen.getByText('What currency do I pay in?')).toBeInTheDocument();
    expect(screen.queryByText('An onchain airtime app.')).not.toBeInTheDocument();
  });

  it('toggles an answer open and closed when its question is clicked', async () => {
    render(<FaqsPage />);
    const question = await screen.findByText('What is Topizzy?');
    const button = question.closest('button')!;

    fireEvent.click(button);
    expect(screen.getByText('An onchain airtime app.')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(button);
    expect(screen.queryByText('An onchain airtime app.')).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders an empty list gracefully when the API returns no faqs field', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ json: async () => ({}) });
    render(<FaqsPage />);
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
    expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
  });
});
