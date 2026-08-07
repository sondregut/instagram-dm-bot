import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

let cachedSecret: string | null = null;

export async function getMindsetConversionSecret(): Promise<string | null> {
  if (cachedSecret) return cachedSecret;

  const environmentSecret = process.env.MINDSET_CONVERSION_SECRET?.trim();
  if (environmentSecret) {
    cachedSecret = environmentSecret;
    return cachedSecret;
  }

  try {
    const projectId = process.env.GCLOUD_PROJECT || 'instagram-dm-bot-app';
    const client = new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({
      name: `projects/${projectId}/secrets/MINDSET_CONVERSION_SECRET/versions/latest`,
    });
    cachedSecret = version.payload?.data?.toString().trim() || null;
    return cachedSecret;
  } catch (error) {
    console.error('[Mindset] Conversion secret unavailable:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}
