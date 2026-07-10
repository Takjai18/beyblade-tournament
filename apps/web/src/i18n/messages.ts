/** Phase 1 i18n skeleton — 繁中 + English keys ready for full i18n later */

export type Locale = "zh-Hant" | "en";

export const messages = {
  "zh-Hant": {
    appName: "陀螺賽事通",
    appNameEn: "BladeArena",
    createTournament: "建立賽事",
    myTournaments: "我的賽事",
    players: "玩家",
    addPlayer: "新增玩家",
    hostLogin: "主辦登入",
    share: "分享",
    watchMode: "觀眾模式",
    loading: "載入中…",
    notFound: "找不到賽事",
  },
  en: {
    appName: "BladeArena",
    appNameEn: "BeybladeX Tournament Manager",
    createTournament: "Create Tournament",
    myTournaments: "My Tournaments",
    players: "Players",
    addPlayer: "Add Player",
    hostLogin: "Host Login",
    share: "Share",
    watchMode: "Watch Mode",
    loading: "Loading…",
    notFound: "Tournament not found",
  },
} as const;

export type MessageKey = keyof (typeof messages)["zh-Hant"];

export function t(key: MessageKey, locale: Locale = "zh-Hant"): string {
  return messages[locale][key] ?? messages["zh-Hant"][key] ?? key;
}
