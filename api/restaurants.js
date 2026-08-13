const KAKAO_LOCAL_API_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  const kakaoRestApiKey = process.env.KAKAO_REST_API_KEY;
  const { menu, latitude, longitude } = request.query;
  const latitudeNumber = Number(latitude);
  const longitudeNumber = Number(longitude);

  if (!kakaoRestApiKey) {
    return response.status(500).json({ error: "Restaurant search is not configured." });
  }

  if (
    typeof menu !== "string" ||
    !menu.trim() ||
    menu.length > 50 ||
    !Number.isFinite(latitudeNumber) ||
    !Number.isFinite(longitudeNumber) ||
    latitudeNumber < -90 ||
    latitudeNumber > 90 ||
    longitudeNumber < -180 ||
    longitudeNumber > 180
  ) {
    return response.status(400).json({ error: "Invalid search parameters." });
  }

  const params = new URLSearchParams({
    query: `${menu.trim()} 음식점`,
    category_group_code: "FD6",
    x: String(longitudeNumber),
    y: String(latitudeNumber),
    radius: "5000",
    size: "10",
    sort: "distance",
  });

  try {
    const kakaoResponse = await fetch(`${KAKAO_LOCAL_API_URL}?${params}`, {
      headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
    });

    if (!kakaoResponse.ok) {
      console.error("Kakao Local API error:", kakaoResponse.status);
      return response.status(502).json({ error: "Restaurant search provider failed." });
    }

    const data = await kakaoResponse.json();
    const restaurants = data.documents.map((place) => ({
      id: place.id,
      name: place.place_name,
      category: place.category_name,
      address: place.road_address_name || place.address_name,
      phone: place.phone,
      distance: Number(place.distance),
      placeUrl: place.place_url,
    }));

    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ restaurants });
  } catch (error) {
    console.error("Restaurant search error:", error);
    return response.status(500).json({ error: "Restaurant search failed." });
  }
}
