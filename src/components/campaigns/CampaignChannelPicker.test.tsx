import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CampaignChannelPicker, DISTRIBUTION_CHANNELS } from './CampaignChannelPicker';

vi.mock('@/hooks/useCampaignPricing', () => ({ useCampaignPricing: () => ({ data: [], isLoading: false, isError: false }) }));
vi.mock('./CampaignServiceIcon', () => ({ CampaignServiceIcon: () => null }));
afterEach(cleanup);

it.each(DISTRIBUTION_CHANNELS)('selects only the requested $id channel', ({ id, label }) => {
  const onSelect = vi.fn();
  render(<CampaignChannelPicker selected={null} onSelect={onSelect} onBack={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: `בחירת ${label}` }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(id);
});

it('returns to channel selection without selecting a different channel', () => {
  const onBack = vi.fn();
  const onSelect = vi.fn();
  render(<CampaignChannelPicker selected="sms" onSelect={onSelect} onBack={onBack} />);
  fireEvent.click(screen.getByRole('button', { name: 'חזרה לבחירת ערוץ' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
});