export default function handler(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  response.setHeader("Cache-Control", "no-store");

  if (!supabaseUrl || !supabasePublishableKey) {
    return response.status(500).json({
      error: "Supabase environment variables are not configured.",
    });
  }

  return response.status(200).json({
    supabaseUrl,
    supabasePublishableKey,
  });
}
