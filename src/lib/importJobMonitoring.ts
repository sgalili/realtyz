export function importJobPollInterval(jobs: { status: string }[] | undefined): number | false {
  return jobs?.some(job => job.status === 'pending' || job.status === 'running') ? 4000 : false;
}

export function importJobTargetKind(checkpoint: { autoDevelopers?: boolean; totalDeveloperUrls?: number; totalBrokerUrls?: number } | undefined): 'brokers' | 'developers' | 'links' {
  if (checkpoint?.autoDevelopers || (checkpoint?.totalDeveloperUrls && !checkpoint.totalBrokerUrls)) return 'developers';
  return checkpoint?.totalDeveloperUrls ? 'links' : 'brokers';
}