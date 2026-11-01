/**
 * Link shapes the Yad2 importers accept. Kept in one place so the on-screen rule
 * ("show the import button only for a valid link") and the request that reaches
 * the discovery function can never disagree.
 */

/** A single ad page: an item page or one of the short share forms the importer resolves. */
export const yad2ItemUrlPattern = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/(?:(?:realestate\/)?item\/\S+|s\/\S+|share\/\S+)/i;

/** An office page: https://<sub.>yad2.co.il/realestate/agency/<id>. */
export const yad2AgencyUrlPattern = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*yad2\.co\.il\/realestate\/agency\/[^/?#\s]+/i;

export const isYad2ItemUrl = (raw: string) => yad2ItemUrlPattern.test(raw.trim());

export const isYad2AgencyUrl = (raw: string) => yad2AgencyUrlPattern.test(raw.trim());

/** The discovery function requires a full https URL, so pasted links get the scheme back. */
export const agencyUrlForRequest = (raw: string) => {
  const value = raw.trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};
