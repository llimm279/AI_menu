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

// 추후 Supabase에 한 세션의 기록으로 저장하기 쉬운 형태입니다.
const sessionData = {
  answers: userAnswers,
  firstRecommendedMenu: null,
  selectedMenu: null,
  reRecommendCount: 0,
  feedback: null,
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

function calculateMenuScore(menu, answers) {
  return Object.keys(scoreWeights).reduce((score, condition) => {
    const isMatch = menu[condition].includes(answers[condition]);
    return score + (isMatch ? scoreWeights[condition] : 0);
  }, 0);
}

function recommendMenu(excludedMenuName = null) {
  const candidates = menus.filter((menu) => menu.name !== excludedMenuName);
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
  const excludedName = currentRecommendedMenu?.name ?? null;
  currentRecommendedMenu = recommendMenu(excludedName);

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
  sessionData.firstRecommendedMenu = null;
  sessionData.selectedMenu = null;
  sessionData.reRecommendCount = 0;
  sessionData.feedback = null;
  sessionData.location = {
    latitude: null,
    longitude: null,
    accuracy: null,
  };
  currentRecommendedMenu = null;
  document.querySelector("#restaurant-search-message").hidden = true;
}

function showLocationError(message) {
  document.querySelector("#location-error-message").textContent = message;
  showScreen("locationError");
}

function handleLocationSuccess(position) {
  const { latitude, longitude, accuracy } = position.coords;

  sessionData.location = { latitude, longitude, accuracy };

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

// 피드백 저장 부분은 추후 DB 저장 호출을 연결하기 쉽도록 분리했습니다.
function saveFeedback(feedback) {
  sessionData.feedback = feedback;
  console.log("Current Session Data:", sessionData);
}

function showConfirmedMenu() {
  document.querySelector("#recommendation-content").hidden = true;
  document.querySelector("#confirmation-content").hidden = false;
  document.querySelector("#confirmation-message").textContent = `오늘은 ${sessionData.selectedMenu}으로 결정!`;
  document.querySelector("#find-nearby-button").textContent = `내 주변 ${sessionData.selectedMenu}집 찾기 📍`;
  showScreen("result");
}

document.querySelector("#start-button").addEventListener("click", () => {
  showScreen("hunger");
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
  sessionData.reRecommendCount += 1;
  displayRecommendation(true);
});

document.querySelector("#confirm-button").addEventListener("click", () => {
  sessionData.selectedMenu = currentRecommendedMenu.name;
  showScreen("feedback");
});

document.querySelectorAll("[data-feedback]").forEach((button) => {
  button.addEventListener("click", () => {
    saveFeedback(button.dataset.feedback);
    showConfirmedMenu();
  });
});

document.querySelector("#find-nearby-button").addEventListener("click", () => {
  showScreen("locationGuide");
});

document.querySelector("#use-location-button").addEventListener("click", requestCurrentLocation);
document.querySelector("#retry-location-button").addEventListener("click", requestCurrentLocation);

document.querySelector("#search-restaurants-button").addEventListener("click", () => {
  const message = document.querySelector("#restaurant-search-message");
  message.textContent = "음식점 검색 기능은 다음 단계에서 추가됩니다.";
  message.hidden = false;
});

document.querySelector("#restart-button").addEventListener("click", () => {
  resetSession();
  showScreen("start");
});
