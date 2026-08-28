-- Stop automatic Yad2 / Bright Data scraping. Scraping now runs only when a
-- user explicitly triggers it from the app, so paid credits are never burned
-- by background jobs.
select cron.alter_job((select jobid from cron.job where jobname = 'listings-metadata-backfill-nightly'), active := false);
select cron.alter_job((select jobid from cron.job where jobname = 'properties-scheduled-sync'), active := false);