"use strict";

let supabaseClient = null;

async function initializeSupabase() {
  try {
    const response = await fetch("/api/config");

    if (!response.ok) {
      throw new Error(`설정 요청 실패: ${response.status}`);
    }

    const { supabaseUrl, supabasePublishableKey } = await response.json();

    if (!supabaseUrl || !supabasePublishableKey) {
      throw new Error("Supabase 설정값이 비어 있습니다.");
    }

    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );
    supabaseClient = createClient(supabaseUrl, supabasePublishableKey);
    return supabaseClient;
  } catch (error) {
    // 설정 또는 라이브러리를 불러오지 못해도 메뉴 추천 기능은 계속 동작합니다.
    console.error("Supabase 초기화에 실패했습니다:", error);
    return null;
  }
}

// 향후 모든 DB 저장 함수는 이 Promise를 기다린 후 client 존재 여부를 확인합니다.
const supabaseReady = initializeSupabase();

async function getSupabaseClientForDatabase() {
  const client = await supabaseReady;

  if (!client) {
    console.error("Supabase가 준비되지 않아 DB 작업을 실행하지 않습니다.");
    return null;
  }

  return client;
}

const userAnswers = {
  hunger: null,
  mood: null,
  budget: null,
};

const RECOMMENDATION_VERSION = "v1";
const ALGORITHM_REVISION = "v2";

function createSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const randomValue = Math.floor(Math.random() * 16);
    const value = character === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getMealPeriod(date = new Date()) {
  const hour = date.getHours();

  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 21) return "dinner";
  return "late_night";
}

const sessionData = {
  sessionId: createSessionId(),
  startedAt: new Date().toISOString(),
  recommendationVersion: RECOMMENDATION_VERSION,
  mealPeriod: getMealPeriod(),
  answers: userAnswers,
  recommendationHistory: [],
  firstRecommendedMenu: null,
  selectedMenu: null,
  acceptedFirstRecommendation: false,
  reRecommendCount: 0,
  feedback: null,
  feedbackReason: null,
  completed: false,
  location: {
    latitude: null,
    longitude: null,
    accuracy: null,
  },
};

// 각 조건은 질문 버튼의 data-value와 같은 값을 사용합니다.
const menus = [
  { name: "김치찌개", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🥘" },
  { name: "된장찌개", hunger: ["적당히 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍲" },
  { name: "제육볶음", hunger: ["엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🥘" },
  { name: "삼겹살", hunger: ["엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🥓" },
  { name: "국밥", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍚" },
  { name: "냉면", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["깔끔하고 가벼운 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍜" },
  { name: "비빔밥", hunger: ["적당히 배고파"], mood: ["깔끔하고 가벼운 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍚" },
  { name: "돈까스", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍛" },
  { name: "라멘", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍜" },
  { name: "초밥", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["깔끔하고 가벼운 거", "평소랑 다른 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍣" },
  { name: "우동", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍜" },
  { name: "소바", hunger: ["가볍게 먹고 싶어"], mood: ["깔끔하고 가벼운 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🥢" },
  { name: "마라탕", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "평소랑 다른 거"], budget: ["1~2만원", "가격 상관없어"], emoji: "🌶️" },
  { name: "짜장면", hunger: ["적당히 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "가격 상관없어"], emoji: "🍜" },
  { name: "짬뽕", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🌶️" },
  { name: "볶음밥", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "가격 상관없어"], emoji: "🍳" },
  { name: "파스타", hunger: ["적당히 배고파"], mood: ["평소랑 다른 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍝" },
  { name: "피자", hunger: ["엄청 배고파"], mood: ["따뜻하고 든든한 거", "평소랑 다른 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍕" },
  { name: "햄버거", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍔" },
  { name: "샌드위치", hunger: ["가볍게 먹고 싶어"], mood: ["깔끔하고 가벼운 거"], budget: ["1만원 이하", "가격 상관없어"], emoji: "🥪" },
  { name: "샐러드", hunger: ["가볍게 먹고 싶어"], mood: ["깔끔하고 가벼운 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🥗" },
  { name: "포케", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["깔끔하고 가벼운 거", "평소랑 다른 거"], budget: ["1~2만원", "가격 상관없어"], emoji: "🥗" },
  { name: "쌀국수", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["깔끔하고 가벼운 거", "평소랑 다른 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍜" },
  { name: "타코", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["자극적이고 매운 거", "평소랑 다른 거"], budget: ["1~2만원", "가격 상관없어"], emoji: "🌮" },
  { name: "카레", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍛" },
  { name: "닭갈비", hunger: ["엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍗" },
  { name: "떡볶이", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["자극적이고 매운 거"], budget: ["1만원 이하", "가격 상관없어"], emoji: "🌶️" },
  { name: "치킨", hunger: ["엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍗" },
  { name: "덮밥", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍚" },
  { name: "순두부찌개", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍲" },
  { name: "월남쌈", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["깔끔하고 가벼운 거", "평소랑 다른 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🥬" },
  { name: "샤브샤브", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["깔끔하고 가벼운 거", "따뜻하고 든든한 거"], budget: ["2만원 이상", "가격 상관없어"], emoji: "🍲" },
  { name: "부대찌개", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍲" },
  { name: "감자탕", hunger: ["엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🥘" },
  { name: "설렁탕", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍲" },
  { name: "갈비탕", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍖" },
  { name: "보쌈", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["깔끔하고 가벼운 거", "따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🥬" },
  { name: "족발", hunger: ["엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍖" },
  { name: "찜닭", hunger: ["엄청 배고파"], mood: ["자극적이고 매운 거", "따뜻하고 든든한 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍗" },
  { name: "김밥", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["깔끔하고 가벼운 거"], budget: ["1만원 이하", "가격 상관없어"], emoji: "🍙" },
  { name: "오므라이스", hunger: ["적당히 배고파"], mood: ["따뜻하고 든든한 거", "평소랑 다른 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍳" },
  { name: "규동", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["따뜻하고 든든한 거", "평소랑 다른 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🍚" },
  { name: "회", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["깔끔하고 가벼운 거", "평소랑 다른 거"], budget: ["2만원 이상", "가격 상관없어"], emoji: "🐟" },
  { name: "양꼬치", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "평소랑 다른 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍢" },
  { name: "훠궈", hunger: ["엄청 배고파"], mood: ["자극적이고 매운 거", "평소랑 다른 거"], budget: ["2만원 이상", "가격 상관없어"], emoji: "🌶️" },
  { name: "꿔바로우", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "평소랑 다른 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🥠" },
  { name: "케밥", hunger: ["가볍게 먹고 싶어", "적당히 배고파"], mood: ["평소랑 다른 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🥙" },
  { name: "리조또", hunger: ["적당히 배고파"], mood: ["따뜻하고 든든한 거", "평소랑 다른 거"], budget: ["1~2만원", "2만원 이상", "가격 상관없어"], emoji: "🍚" },
  { name: "스테이크", hunger: ["엄청 배고파"], mood: ["따뜻하고 든든한 거", "평소랑 다른 거"], budget: ["2만원 이상", "가격 상관없어"], emoji: "🥩" },
  { name: "브리또", hunger: ["적당히 배고파", "엄청 배고파"], mood: ["자극적이고 매운 거", "평소랑 다른 거"], budget: ["1만원 이하", "1~2만원", "가격 상관없어"], emoji: "🌯" },
];

// 조건별 가중치는 데이터 분석 결과에 따라 이 값만 바꾸면 됩니다.
const scoreWeights = {
  hunger: 3,
  mood: 3,
  budget: 2,
};

const screens = {
  start: document.querySelector("#start-screen"),
  hunger: document.querySelector("#hunger-screen"),
  mood: document.querySelector("#mood-screen"),
  budget: document.querySelector("#budget-screen"),
  result: document.querySelector("#result-screen"),
  feedback: document.querySelector("#feedback-screen"),
  feedbackReason: document.querySelector("#feedback-reason-screen"),
  locationGuide: document.querySelector("#location-guide-screen"),
  locationLoading: document.querySelector("#location-loading-screen"),
  locationSuccess: document.querySelector("#location-success-screen"),
  locationError: document.querySelector("#location-error-screen"),
};

const nextScreen = { hunger: "mood", mood: "budget" };
let currentRecommendedMenu = null;

function showScreen(screenName) {
  Object.values(screens).forEach((screen) => {
    screen.hidden = true;
    screen.classList.remove("is-active");
  });

  const activeScreen = screens[screenName];
  activeScreen.hidden = false;
  activeScreen.classList.add("is-active");
  activeScreen.querySelector("h1, h2").focus();
}

function navigateBack(targetScreen, sourceScreen) {
  if (targetScreen === "start") {
    resetSession();
  } else if (targetScreen === "hunger") {
    userAnswers.hunger = null;
    userAnswers.mood = null;
    userAnswers.budget = null;
  } else if (targetScreen === "mood") {
    userAnswers.mood = null;
    userAnswers.budget = null;
  } else if (targetScreen === "budget") {
    userAnswers.budget = null;
    sessionData.recommendationHistory = [];
    sessionData.firstRecommendedMenu = null;
    sessionData.selectedMenu = null;
    sessionData.acceptedFirstRecommendation = false;
    sessionData.reRecommendCount = 0;
    currentRecommendedMenu = null;
  } else if (targetScreen === "result" && sourceScreen === "feedback-screen") {
    sessionData.selectedMenu = null;
    sessionData.feedback = null;
    sessionData.feedbackReason = null;
  } else if (targetScreen === "feedback") {
    sessionData.feedback = null;
    sessionData.feedbackReason = null;
  }

  showScreen(targetScreen);
}

function calculateMenuScore(menu, answers) {
  return Object.keys(scoreWeights).reduce((score, condition) => {
    const isMatch = menu[condition].includes(answers[condition]);
    return score + (isMatch ? scoreWeights[condition] : 0);
  }, 0);
}

function recommendMenu() {
  const previouslyRecommendedMenus = new Set(
    sessionData.recommendationHistory.map(({ menu }) => menu),
  );
  const unseenMenus = menus.filter(
    (menu) => !previouslyRecommendedMenus.has(menu.name),
  );
  // 모든 메뉴를 확인한 극단적인 경우에만 전체 후보를 다시 사용합니다.
  const candidates = unseenMenus.length > 0 ? unseenMenus : menus;
  const scoredMenus = candidates.map((menu) => ({
    menu,
    score: calculateMenuScore(menu, userAnswers),
  }));
  const highestScore = Math.max(...scoredMenus.map(({ score }) => score));
  const bestMenus = scoredMenus.filter(({ score }) => score === highestScore);
  const randomIndex = Math.floor(Math.random() * bestMenus.length);

  return bestMenus[randomIndex].menu;
}

function createRecommendationReason(menu) {
  const hungerText = {
    "가볍게 먹고 싶어": "가볍게 먹고 싶은",
    "적당히 배고파": "적당히 배고픈",
    "엄청 배고파": "많이 배고픈",
  }[userAnswers.hunger];

  const moodText = {
    "자극적이고 매운 거": "자극적인 음식이 땡기는",
    "따뜻하고 든든한 거": "따뜻하고 든든한 음식이 필요한",
    "깔끔하고 가벼운 거": "깔끔하고 가벼운 음식이 땡기는",
    "평소랑 다른 거": "색다른 음식이 궁금한",
  }[userAnswers.mood];

  return `${hungerText} 데다 ${moodText} 지금, ${menu.name}이 잘 어울려요.`;
}

function displayRecommendation(isReRecommendation = false) {
  currentRecommendedMenu = recommendMenu();
  const recommendationScore = calculateMenuScore(currentRecommendedMenu, userAnswers);

  sessionData.recommendationHistory.push({
    menu: currentRecommendedMenu.name,
    score: recommendationScore,
    order: sessionData.recommendationHistory.length + 1,
    algorithmRevision: ALGORITHM_REVISION,
    recommendedAt: new Date().toISOString(),
    feedback: null,
    feedbackReason: null,
  });

  if (!isReRecommendation) {
    sessionData.firstRecommendedMenu = currentRecommendedMenu.name;
  }

  document.querySelector("#recommended-menu").textContent = `${currentRecommendedMenu.emoji} ${currentRecommendedMenu.name}`;
  document.querySelector("#recommendation-reason").textContent = createRecommendationReason(currentRecommendedMenu);
  document.querySelector("#recommendation-content").hidden = false;
  document.querySelector("#confirmation-content").hidden = true;
  showScreen("result");
}

function resetSession() {
  Object.keys(userAnswers).forEach((key) => {
    userAnswers[key] = null;
  });
  sessionData.sessionId = createSessionId();
  sessionData.startedAt = new Date().toISOString();
  sessionData.recommendationVersion = RECOMMENDATION_VERSION;
  sessionData.mealPeriod = getMealPeriod();
  sessionData.recommendationHistory = [];
  sessionData.firstRecommendedMenu = null;
  sessionData.selectedMenu = null;
  sessionData.acceptedFirstRecommendation = false;
  sessionData.reRecommendCount = 0;
  sessionData.feedback = null;
  sessionData.feedbackReason = null;
  sessionData.completed = false;
  sessionData.location = {
    latitude: null,
    longitude: null,
    accuracy: null,
  };
  sessionSavePromise = Promise.resolve();
  currentRecommendedMenu = null;
  document.querySelector("#restaurant-search-message").hidden = true;
  document.querySelector("#restaurant-results").hidden = true;
  document.querySelector("#restaurant-list").replaceChildren();
}

function showLocationError(message) {
  document.querySelector("#location-error-message").textContent = message;
  showScreen("locationError");
}

function handleLocationSuccess(position) {
  const { latitude, longitude, accuracy } = position.coords;

  sessionData.location = { latitude, longitude, accuracy };
  void trackSessionEvent("location_confirmed", {
    latitude: Number(latitude.toFixed(3)),
    longitude: Number(longitude.toFixed(3)),
    accuracy,
  });

  // 좌표는 개발 확인용으로만 화면에 표시하며 외부로 전송하지 않습니다.
  document.querySelector("#latitude-value").textContent = latitude.toFixed(6);
  document.querySelector("#longitude-value").textContent = longitude.toFixed(6);
  showScreen("locationSuccess");
}

function handleLocationError(error) {
  const errorMessages = {
    1: "위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용한 뒤 다시 시도해주세요.",
    2: "현재 위치 정보를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
    3: "위치 요청 시간이 초과되었습니다. 다시 시도해주세요.",
  };

  showLocationError(errorMessages[error.code] || "위치를 가져오는 중 문제가 발생했습니다. 다시 시도해주세요.");
}

function requestCurrentLocation() {
  if (!("geolocation" in navigator)) {
    showLocationError("현재 브라우저에서는 위치 기능을 사용할 수 없습니다.");
    return;
  }

  showScreen("locationLoading");
  navigator.geolocation.getCurrentPosition(
    handleLocationSuccess,
    handleLocationError,
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
  );
}

let sessionSavePromise = Promise.resolve();

function buildSessionRecord() {
  return {
    session_id: sessionData.sessionId,
    started_at: sessionData.startedAt,
    recommendation_version: sessionData.recommendationVersion,
    meal_period: sessionData.mealPeriod,
    answers: { ...sessionData.answers },
    recommendation_history: [...sessionData.recommendationHistory],
    first_recommended_menu: sessionData.firstRecommendedMenu,
    selected_menu: sessionData.selectedMenu,
    accepted_first_recommendation: sessionData.acceptedFirstRecommendation,
    re_recommend_count: sessionData.reRecommendCount,
    feedback: sessionData.feedback,
    feedback_reason: sessionData.feedbackReason,
    completed: sessionData.completed,
  };
}

async function saveSessionToDatabase() {
  const client = await getSupabaseClientForDatabase();
  if (!client) return false;

  const { error } = await client
    .from("recommendation_sessions")
    .insert(buildSessionRecord());

  if (error) {
    console.error("추천 세션 저장 실패:", error);
    return false;
  }

  return true;
}

async function trackSessionEvent(eventType, eventData = {}) {
  await sessionSavePromise;
  const client = await getSupabaseClientForDatabase();
  if (!client) return false;

  const { error } = await client.from("recommendation_events").insert({
    session_id: sessionData.sessionId,
    event_type: eventType,
    event_data: eventData,
  });

  if (error) {
    console.error("추천 이벤트 저장 실패:", error);
    return false;
  }

  return true;
}

function completeFeedback(feedbackReason = null) {
  sessionData.feedbackReason = feedbackReason;
  sessionData.completed = true;
  console.log("Current Session Data:", sessionData);
  showConfirmedMenu();
  sessionSavePromise = saveSessionToDatabase();
}

function rejectRecommendationAndContinue(feedbackReason) {
  const latestRecommendation = sessionData.recommendationHistory.at(-1);

  if (latestRecommendation) {
    latestRecommendation.feedback = "dislike";
    latestRecommendation.feedbackReason = feedbackReason;
  }

  sessionData.selectedMenu = null;
  sessionData.feedback = null;
  sessionData.feedbackReason = null;
  sessionData.acceptedFirstRecommendation = false;
  sessionData.reRecommendCount += 1;
  displayRecommendation(true);
}

function saveFeedback(feedback) {
  sessionData.feedback = feedback;

  if (feedback === "dislike") {
    showScreen("feedbackReason");
    return;
  }

  const latestRecommendation = sessionData.recommendationHistory.at(-1);
  if (latestRecommendation) {
    latestRecommendation.feedback = "like";
  }

  completeFeedback();
}

function showConfirmedMenu() {
  document.querySelector("#recommendation-content").hidden = true;
  document.querySelector("#confirmation-content").hidden = false;
  document.querySelector("#confirmation-message").textContent = `오늘은 ${sessionData.selectedMenu}으로 결정!`;
  document.querySelector("#find-nearby-button").textContent = `내 주변 ${sessionData.selectedMenu}집 찾기 📍`;
  showScreen("result");
}

function formatDistance(distanceInMeters) {
  if (distanceInMeters < 1000) {
    return `${distanceInMeters}m`;
  }

  return `${(distanceInMeters / 1000).toFixed(1)}km`;
}

function renderRestaurants(restaurants) {
  const results = document.querySelector("#restaurant-results");
  const list = document.querySelector("#restaurant-list");
  list.replaceChildren();

  restaurants.forEach((restaurant) => {
    const item = document.createElement("li");
    item.className = "restaurant-card";

    const top = document.createElement("div");
    top.className = "restaurant-card-top";

    const name = document.createElement("h4");
    name.textContent = restaurant.name;

    const distance = document.createElement("span");
    distance.className = "restaurant-distance";
    distance.textContent = formatDistance(restaurant.distance);

    const address = document.createElement("p");
    address.textContent = restaurant.address || "주소 정보 없음";

    const link = document.createElement("a");
    link.className = "restaurant-link";
    link.href = restaurant.placeUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "카카오맵에서 보기 →";
    link.addEventListener("click", () => {
      void trackSessionEvent("restaurant_clicked", {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        distance: restaurant.distance,
      });
    });

    top.append(name, distance);
    item.append(top, address);

    if (restaurant.phone) {
      const phone = document.createElement("p");
      phone.textContent = restaurant.phone;
      item.append(phone);
    }

    item.append(link);
    list.append(item);
  });

  document.querySelector("#restaurant-menu-name").textContent = sessionData.selectedMenu;
  results.hidden = false;
}

async function searchNearbyRestaurants() {
  const button = document.querySelector("#search-restaurants-button");
  const message = document.querySelector("#restaurant-search-message");
  const { latitude, longitude } = sessionData.location;

  if (latitude === null || longitude === null || !sessionData.selectedMenu) {
    message.textContent = "위치 또는 메뉴 정보가 없습니다. 처음부터 다시 시도해주세요.";
    message.hidden = false;
    return;
  }

  button.disabled = true;
  button.textContent = "주변 음식점을 찾고 있어요...";
  message.hidden = true;
  document.querySelector("#restaurant-results").hidden = true;

  const params = new URLSearchParams({
    menu: sessionData.selectedMenu,
    latitude: String(latitude),
    longitude: String(longitude),
  });

  try {
    void trackSessionEvent("restaurant_search_started", {
      menu: sessionData.selectedMenu,
    });
    const response = await fetch(`/api/restaurants?${params}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "음식점 검색 요청에 실패했습니다.");
    }

    if (data.restaurants.length === 0) {
      message.textContent = "반경 5km 안에서 해당 메뉴를 판매하는 음식점을 찾지 못했어요.";
      message.hidden = false;
      void trackSessionEvent("restaurant_results_viewed", {
        menu: sessionData.selectedMenu,
        resultCount: 0,
        status: "empty",
      });
      return;
    }

    renderRestaurants(data.restaurants);
    void trackSessionEvent("restaurant_results_viewed", {
      menu: sessionData.selectedMenu,
      resultCount: data.restaurants.length,
      status: "success",
    });
  } catch (error) {
    console.error("음식점 검색 실패:", error);
    message.textContent = "음식점 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
    message.hidden = false;
    void trackSessionEvent("restaurant_results_viewed", {
      menu: sessionData.selectedMenu,
      resultCount: 0,
      status: "error",
    });
  } finally {
    button.disabled = false;
    button.textContent = "주변 음식점 다시 검색하기";
  }
}

document.querySelector("#start-button").addEventListener("click", () => {
  showScreen("hunger");
});

document.querySelectorAll("[data-back-to]").forEach((button) => {
  button.addEventListener("click", () => {
    const sourceScreen = button.closest(".screen").id;
    navigateBack(button.dataset.backTo, sourceScreen);
  });
});

document.querySelectorAll("[data-answer]").forEach((button) => {
  button.addEventListener("click", () => {
    const answerType = button.dataset.answer;
    userAnswers[answerType] = button.dataset.value;

    if (answerType === "budget") {
      displayRecommendation();
      return;
    }

    showScreen(nextScreen[answerType]);
  });
});

document.querySelector("#recommend-again-button").addEventListener("click", () => {
  const latestRecommendation = sessionData.recommendationHistory.at(-1);
  if (latestRecommendation && !latestRecommendation.feedback) {
    latestRecommendation.feedback = "skip";
    latestRecommendation.feedbackReason = "manual_reroll";
  }

  sessionData.reRecommendCount += 1;
  displayRecommendation(true);
});

document.querySelector("#confirm-button").addEventListener("click", () => {
  sessionData.selectedMenu = currentRecommendedMenu.name;
  sessionData.acceptedFirstRecommendation = sessionData.reRecommendCount === 0;
  showScreen("feedback");
});

document.querySelectorAll("[data-feedback-reason]").forEach((button) => {
  button.addEventListener("click", () => {
    rejectRecommendationAndContinue(button.dataset.feedbackReason);
  });
});

document.querySelectorAll("[data-feedback]").forEach((button) => {
  button.addEventListener("click", () => {
    saveFeedback(button.dataset.feedback);
  });
});

document.querySelector("#find-nearby-button").addEventListener("click", () => {
  showScreen("locationGuide");
});

document.querySelector("#use-location-button").addEventListener("click", requestCurrentLocation);
document.querySelector("#retry-location-button").addEventListener("click", requestCurrentLocation);

document.querySelector("#search-restaurants-button").addEventListener("click", searchNearbyRestaurants);

document.querySelector("#restart-button").addEventListener("click", () => {
  resetSession();
  showScreen("start");
});
