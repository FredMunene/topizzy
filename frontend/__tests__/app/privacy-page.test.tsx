/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import PrivacyPage from '@/app/privacy/page';

const PRIVACY_DATA = {
  lastUpdated: '2026-05-25',
  sections: [
    { heading: '1. Information We Collect', body: ['We collect your wallet address.', 'We collect your phone number.'] },
  ],
};

describe('PrivacyPage', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ json: async () => PRIVACY_DATA });
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows a loading state before the policy arrives', async () => {
    render(<PrivacyPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  });

  it('renders the fetched sections and last-updated date', async () => {
    render(<PrivacyPage />);
    await waitFor(() => expect(screen.getByText('1. Information We Collect')).toBeInTheDocument());
    expect(screen.getByText(/Last updated: 2026-05-25/)).toBeInTheDocument();
    expect(screen.getByText('We collect your wallet address.')).toBeInTheDocument();
    expect(screen.getByText('We collect your phone number.')).toBeInTheDocument();
  });
});
