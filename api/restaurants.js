const KAKAO_LOCAL_API_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";

// 카카오 장소 검색이 메뉴판 전체를 제공하지 않으므로 대표 동의어로 검색 범위를 넓힙니다.
const menuSearchKeywords = {
  소바: ["소바", "메밀국수", "냉모밀"],
  냉면: ["냉면", "평양냉면", "함흥냉면"],
  국밥: ["국밥", "돼지국밥", "순대국밥"],
  덮밥: ["덮밥", "돈부리"],
  라멘: ["라멘", "일본라멘"],
  돈까스: ["돈까스", "돈카츠"],
  쌀국수: ["쌀국수", "베트남쌀국수"],
  제육볶음: ["제육볶음", "제육"],
  순두부찌개: ["순두부찌개", "순두부"],
  삼겹살: ["삼겹살", "고기집"],
  초밥: ["초밥", "스시"],
  떡볶이: ["떡볶이", "분식"],
  감자탕: ["감자탕", "뼈해장국"],
  설렁탕: ["설렁탕", "곰탕"],
  갈비탕: ["갈비탕", "갈비전골"],
  보쌈: ["보쌈", "보쌈정식"],
  족발: ["족발", "족발보쌈"],
  찜닭: ["찜닭", "안동찜닭"],
  김밥: ["김밥", "분식"],
  규동: ["규동", "일본식 소고기덮밥"],
  회: ["횟집", "회", "사시미"],
  양꼬치: ["양꼬치", "양고기"],
  훠궈: ["훠궈", "중국식 샤브샤브"],
  꿔바로우: ["꿔바로우", "중식당"],
  케밥: ["케밥", "터키음식"],
  리조또: ["리조또", "이탈리안 레스토랑"],
  스테이크: ["스테이크", "스테이크하우스"],
  브리또: ["브리또", "멕시칸 음식"],
};

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

  try {
    const normalizedMenu = menu.trim();
    const keywords = menuSearchKeywords[normalizedMenu] || [normalizedMenu];
    const kakaoResponses = await Promise.all(
      keywords.map((keyword) => {
        const params = new URLSearchParams({
          query: keyword,
          category_group_code: "FD6",
          x: String(longitudeNumber),
          y: String(latitudeNumber),
          radius: "5000",
          size: "15",
          sort: "distance",
        });

        return fetch(`${KAKAO_LOCAL_API_URL}?${params}`, {
          headers: { Authorization: `KakaoAK ${kakaoRestApiKey}` },
        });
      }),
    );

    if (kakaoResponses.some((kakaoResponse) => !kakaoResponse.ok)) {
      console.error(
        "Kakao Local API error:",
        kakaoResponses.map((kakaoResponse) => kakaoResponse.status),
      );
      return response.status(502).json({ error: "Restaurant search provider failed." });
    }

    const searchResults = await Promise.all(
      kakaoResponses.map((kakaoResponse) => kakaoResponse.json()),
    );
    const uniquePlaces = new Map();

    searchResults.forEach(({ documents }) => {
      documents.forEach((place) => uniquePlaces.set(place.id, place));
    });

    const restaurants = [...uniquePlaces.values()]
      .sort((first, second) => Number(first.distance) - Number(second.distance))
      .slice(0, 10)
      .map((place) => ({
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
