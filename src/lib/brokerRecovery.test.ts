import { describe, expect, it, vi } from 'vitest';
import { brokerUserError, recoverBrokerWhatsAppJobs } from '../../supabase/functions/_shared/brokerRecovery';

describe('auxiliary broker recovery', () => {
  it('retries returned connection reset and thrown transport error then succeeds', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({error:{message:'connection reset'}})
      .mockRejectedValueOnce(new TypeError('error sending request (SendRequest)'))
      .mockResolvedValueOnce({error:null});
    const wait = vi.fn().mockResolvedValue(undefined);
    expect(await recoverBrokerWhatsAppJobs({rpc},wait)).toEqual({recovered:true,attempts:3,transient:false});
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledWith('recover_broker_whatsapp_jobs');
    expect(wait.mock.calls).toEqual([[250],[750]]);
  });
  it('returns a deferred outcome after exactly three failures without throwing', async () => {
    const rpc=vi.fn().mockRejectedValue(new TypeError('connection reset'));
    expect(await recoverBrokerWhatsAppJobs({rpc},async()=>{})).toEqual({recovered:false,attempts:3,transient:true});
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it('does not retry authorization or database validation failures', async () => {
    const rpc=vi.fn().mockResolvedValue({error:{code:'42501',message:'forbidden'}});
    const wait=vi.fn();
    expect(await recoverBrokerWhatsAppJobs({rpc},wait)).toEqual({recovered:false,attempts:1,transient:false});
    expect(wait).not.toHaveBeenCalled();
  });
  it('does not expose transport URLs, IP addresses or socket details', () => {
    const original='TypeError: error sending request https://private.test/rest/v1/rpc/recover_broker_whatsapp_jobs 127.0.0.1:443 connection reset';
    const safe=brokerUserError(new TypeError(original));
    expect(safe).not.toMatch(/TypeError|https?:|127\.0\.0\.1|443|connection reset|recover_broker/);
    expect(safe).toMatch(/[א-ת]/);
  });
});