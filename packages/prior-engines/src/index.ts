export interface PriorProfileInput {
  fullName?: string;
  gender?: string;
  birthDate?: string;
  birthTime?: string;
  birthLocation?: string;
  childhoodLocations?: string[];
  mbti?: string;
  birthLatitude?: number;
  birthLongitude?: number;
  timezoneOffsetHours?: number;
}

export interface PriorHint {
  system: "mbti" | "bazi" | "ziwei" | "astrology" | "yijing";
  summary: string;
  confidence: number;
  suggestedQuestions: string[];
}

export type PriorSkillId =
  | "dzcmemory_bazi_ziwei"
  | "jinchenma_bazi"
  | "astrology_skill"
  | "yijing_skill";

export type PriorSkillSystem = "bazi_ziwei" | "bazi" | "astrology" | "yijing";

export interface PriorSkillOutput {
  id: string;
  skillId: PriorSkillId;
  system: PriorSkillSystem;
  requestedSourceUrl: string;
  resolvedSourceUrl: string;
  engineSourceUrl?: string;
  availability: "direct" | "fallback";
  status: "ready" | "error";
  generatedAt: string;
  confidence: number;
  authority: "low";
  summary: string;
  structuredSignals: string[];
  suggestedQuestions: string[];
  disclaimers: string[];
  notes: string[];
  rawInput: Record<string, unknown>;
  rawResult?: unknown;
  rawPrompt?: string;
  error?: string;
}

export function buildPriorHints(
  input: PriorProfileInput,
  skillOutputs: PriorSkillOutput[] = []
): PriorHint[] {
  const hints: PriorHint[] = [];

  if (input.mbti) {
    hints.push({
      system: "mbti",
      summary: `User reported MBTI ${input.mbti}. Treat it as a low-authority self-description that may help frame early questions about decision style, energy recovery, and collaboration preference.`,
      confidence: 0.25,
      suggestedQuestions: [
        "When money is tight, do you prefer stable work or flexible upside?",
        "Do you make better progress alone, with a partner, or with structured accountability?"
      ]
    });
  }

  if (input.birthDate && input.birthLocation) {
    hints.push({
      system: "astrology",
      summary:
        "Birth information is available for optional later prior generation. Any resulting output should be translated into low-authority personality hypotheses, not prediction.",
      confidence: 0.1,
      suggestedQuestions: [
        "Which recent decision felt most like the real you?",
        "When work goes well, what kind of environment are you usually in?"
      ]
    });
  }

  for (const output of skillOutputs) {
    if (output.status !== "ready") continue;
    hints.push({
      system: mapSkillSystemToHintSystem(output.system),
      summary: `${describeSkillSource(output)}: ${output.summary}`,
      confidence: output.confidence,
      suggestedQuestions: output.suggestedQuestions
    });
  }

  return hints;
}

export function deriveTimeIndex(birthTime?: string): number | null {
  if (!birthTime) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(birthTime.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;

  if (hour === 23) return 12;
  if (hour === 0) return 0;
  if (hour <= 2) return 1;
  if (hour <= 4) return 2;
  if (hour <= 6) return 3;
  if (hour <= 8) return 4;
  if (hour <= 10) return 5;
  if (hour <= 12) return 6;
  if (hour <= 14) return 7;
  if (hour <= 16) return 8;
  if (hour <= 18) return 9;
  if (hour <= 20) return 10;
  return 11;
}

export function deriveAstrologyCoordinates(input: PriorProfileInput): {
  latitude: number;
  longitude: number;
  timezone: number;
  locationName: string;
  confidence: number;
  notes: string[];
} | null {
  if (typeof input.birthLatitude === "number" && typeof input.birthLongitude === "number") {
    return {
      latitude: input.birthLatitude,
      longitude: input.birthLongitude,
      timezone: input.timezoneOffsetHours ?? 8,
      locationName: input.birthLocation ?? "User provided coordinates",
      confidence: 0.8,
      notes: ["Astrology coordinates were provided directly in the user profile."]
    };
  }

  const birthLocation = input.birthLocation ?? "";
  const cityMatches = [
    { match: /上海/i, latitude: 31.2304, longitude: 121.4737, locationName: "上海市（近似坐标）" },
    { match: /北京/i, latitude: 39.9042, longitude: 116.4074, locationName: "北京市（近似坐标）" },
    { match: /广州/i, latitude: 23.1291, longitude: 113.2644, locationName: "广州市（近似坐标）" },
    { match: /深圳/i, latitude: 22.5431, longitude: 114.0579, locationName: "深圳市（近似坐标）" },
    { match: /杭州/i, latitude: 30.2741, longitude: 120.1551, locationName: "杭州市（近似坐标）" },
    { match: /成都/i, latitude: 30.5728, longitude: 104.0668, locationName: "成都市（近似坐标）" },
    { match: /西安/i, latitude: 34.3416, longitude: 108.9398, locationName: "西安市（近似坐标）" }
  ];

  const matchedCity = cityMatches.find((item) => item.match.test(birthLocation));
  if (matchedCity) {
    return {
      latitude: matchedCity.latitude,
      longitude: matchedCity.longitude,
      timezone: input.timezoneOffsetHours ?? 8,
      locationName: matchedCity.locationName,
      confidence: 0.45,
      notes: ["Astrology coordinates were approximated from the birth-location text at city level."]
    };
  }

  return null;
}

export function deriveDeterministicYijingNumber(input: PriorProfileInput): number | null {
  const key = [input.birthDate, input.birthTime, input.birthLocation]
    .filter((value): value is string => Boolean(value))
    .join("|")
    .replace(/\D/g, "");

  if (!key) return null;

  let accumulator = 0;
  for (const char of key) {
    accumulator = (accumulator * 31 + Number(char)) % 900;
  }
  return accumulator + 100;
}

function mapSkillSystemToHintSystem(
  system: PriorSkillSystem
): "bazi" | "ziwei" | "astrology" | "yijing" {
  switch (system) {
    case "bazi_ziwei":
      return "ziwei";
    case "bazi":
      return "bazi";
    case "astrology":
      return "astrology";
    case "yijing":
      return "yijing";
  }
}

function describeSkillSource(output: PriorSkillOutput): string {
  return output.availability === "direct"
    ? `${output.skillId} prior`
    : `${output.skillId} prior via fallback engine`;
}
