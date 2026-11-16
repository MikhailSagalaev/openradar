/**
 * Adapters that put the employer in `author`. Everywhere else the author is a person,
 * a handle, or a channel title, and is not an employer.
 * One list for the index threshold and for JobPosting.
 */
export const EMPLOYER_AUTHOR_KINDS = new Set([
  'ats',
  'adzuna',
  'arbeitnow',
  'alexandria',
  'workingnomads',
  'hh',
  'remoteok',
  'remotive',
  'trudvsem',
  'sitemap',
  'json',
]);
