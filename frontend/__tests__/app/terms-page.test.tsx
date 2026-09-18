/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import TermsPage from '@/app/terms/page';

const TERMS_DATA = {
  lastUpdated: '2026-05-25',
  sections: [
    { heading: '1. Acceptance of Terms', body: ['By using Topizzy you agree to these terms.'] },
  ],
};

describe('TermsPage', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ json: async () => TERMS_DATA });
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows a loading state before the terms arrive', async () => {
    render(<TermsPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  });

  it('renders the fetched sections and last-updated date', async () => {
    render(<TermsPage />);
    await waitFor(() => expect(screen.getByText('1. Acceptance of Terms')).toBeInTheDocument());
    expect(screen.getByText(/Last updated: 2026-05-25/)).toBeInTheDocument();
    expect(screen.getByText('By using Topizzy you agree to these terms.')).toBeInTheDocument();
  });
});
