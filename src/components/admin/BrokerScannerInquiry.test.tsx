import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { BrokerScannerInquiry } from './BrokerScannerInquiry';
vi.mock('./BrokerScannerPanel', () => ({ scannerCall: vi.fn().mockImplementation(async () => new Promise(() => {})) }));
vi.mock('./BrokerNumberEditor', () => ({ BrokerNumberEditor: () => null }));
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('decrements a queue ETA every 1000ms and does not reset on an unchanged server poll', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-24T00:00:00Z'));
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const data = { job: { id: 'job', status: 'ready' }, settings: { daily_cap: 15, jitter_min_seconds: 45, jitter_max_seconds: 180, enabled: true, paused: false }, used_today: 0, queue_ahead: 1 };
  qc.setQueryData(['broker-wa-scanner-job','broker'], data);
  const view = render(<QueryClientProvider client={qc}><BrokerScannerInquiry brokerId="broker" hasWhatsApp={false} /></QueryClientProvider>);
  expect(view.container.textContent).toContain('00:01:52');
  act(() => vi.advanceTimersByTime(1000)); expect(view.container.textContent).toContain('00:01:51');
  act(() => { qc.setQueryData(['broker-wa-scanner-job','broker'], {...data}); vi.advanceTimersByTime(60000); });
  expect(view.container.textContent).toContain('00:00:51');
});