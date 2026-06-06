type CampaignPostIdentity = {
  channel?: string | null;
  provider_message_id?: string | number | null;
  provider_response?: any;
};

const PLATFORM_MAP: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  x: "twitter",
  twitter: "twitter",
  linkedin: "linkedin",
  youtube: "youtube",
  tiktok: "tiktok",
};

export const normalizePostId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

export const platformForCampaignChannel = (channel?: string | null): string => {
  const key = String(channel || "").toLowerCase();
  return PLATFORM_MAP[key] || key;
};

export const getCampaignPostIds = (campaign: CampaignPostIdentity): string[] => {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    const id = normalizePostId(value);
    if (id) ids.add(id);
  };

  add(campaign.provider_message_id);

  const response = campaign.provider_response || {};
  const flatPostIds = Array.isArray(response?.postIds) ? response.postIds : [];
  const wrappedPostIds = Array.isArray(response?.posts)
    ? response.posts.flatMap((post: any) => (Array.isArray(post?.postIds) ? post.postIds : []))
    : [];
  const allPostIds = [...flatPostIds, ...wrappedPostIds];
  const platform = platformForCampaignChannel(campaign.channel);

  // Ayrshare returns a native `id` (e.g. "AFNkABkomz1Bnpbud7Ui") in addition
  // to the platform-native fbId. Some downstream rows (ai replies posted via
  // ayrshare-comment-reply, etc.) store that native id in `external_post_id`,
  // so include both forms.
  if (Array.isArray(response?.posts)) {
    response.posts.forEach((post: any) => {
      add(post?.id);
      add(post?.fbId);
      add(post?.postId);
      add(post?.post_id);
    });
  }

  allPostIds.forEach((post: any) => {
    const postPlatform = String(post?.platform || "").toLowerCase();
    if (!postPlatform || postPlatform === platform) {
      add(post?.id ?? post?.postId ?? post?.post_id);
    }
  });

  return Array.from(ids);
};


export const campaignMatchesExternalPost = (
  campaign: CampaignPostIdentity,
  externalPostId: unknown,
): boolean => {
  const id = normalizePostId(externalPostId);
  return !!id && getCampaignPostIds(campaign).includes(id);
};