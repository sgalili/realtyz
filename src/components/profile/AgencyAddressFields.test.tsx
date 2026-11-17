import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgencyAddressFields } from './AgencyAddressFields';
import { ISRAEL_SETTLEMENTS_RESOURCE, ISRAEL_STREETS_RESOURCE } from '@/lib/israelAddress';

afterEach(() => vi.unstubAllGlobals());

describe('AgencyAddressFields', () => {
  it('selects national city and street suggestions and saves a separate numeric house number', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input);
      const resource = url.searchParams.get('resource_id');
      return { ok: true, json: async () => ({ success: true, result: { records: resource === ISRAEL_SETTLEMENTS_RESOURCE
        ? [{ 'סמל_ישוב': '5000', 'שם_ישוב': 'תל אביב - יפו' }]
        : resource === ISRAEL_STREETS_RESOURCE ? [{ 'סמל_רחוב': 934, 'שם_רחוב': 'ארלוזורוב' }] : [],
      } }) };
    }));
    const onSave = vi.fn();
    function Harness() {
      const [details, setDetails] = useState({ city: '', address: '' });
      return <AgencyAddressFields city={details.city} address={details.address} disabled={false} onSave={async (city, address) => {
        onSave(city, address);
        setDetails({ city, address });
        return true;
      }} />;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    const city = screen.getByLabelText('עיר / יישוב');
    fireEvent.click(city);
    fireEvent.change(city, { target: { value: 'תל אביב' } });
    fireEvent.click(await screen.findByRole('button', { name: 'תל אביב - יפו' }));
    expect(onSave).toHaveBeenLastCalledWith('תל אביב - יפו', '');
    const street = await screen.findByLabelText('רחוב');
    await vi.waitFor(() => expect(street).toBeEnabled());
    fireEvent.focus(street);
    fireEvent.change(street, { target: { value: 'ארלו' } });
    fireEvent.click(await screen.findByRole('button', { name: 'ארלוזורוב' }));
    expect(onSave).toHaveBeenLastCalledWith('תל אביב - יפו', 'ארלוזורוב');
    const house = screen.getByLabelText('מספר בית');
    await vi.waitFor(() => expect(house).toBeEnabled());
    fireEvent.change(house, { target: { value: '1א2' } });
    expect(house).toHaveValue('12');
    fireEvent.blur(house);
    await vi.waitFor(() => expect(onSave).toHaveBeenLastCalledWith('תל אביב - יפו', 'ארלוזורוב 12'));
  });
});
