import { ContributionTrace } from "../types";
import { createTrace } from "../trace";

export interface HotelResult {
  hotels: HotelOption[];
  trace: ContributionTrace;
}

export interface HotelOption {
  id: string;
  name: string;
  area: string;
  rating: number;
  price_cny_per_night: number;
  total_cny: number;
  amenities: string[];
  adopted: boolean;
}

const MOCK_HOTELS: HotelOption[] = [
  {
    id: "HT001",
    name: "Hotel Gracery Shinjuku",
    area: "新宿",
    rating: 4.3,
    price_cny_per_night: 680,
    total_cny: 2040,
    amenities: ["Wi-Fi", "早餐", "交通便利"],
    adopted: true,
  },
  {
    id: "HT002",
    name: "Shibuya Stream Excel Hotel Tokyu",
    area: "涩谷",
    rating: 4.5,
    price_cny_per_night: 850,
    total_cny: 2550,
    amenities: ["Wi-Fi", "健身房", "高层景观"],
    adopted: true,
  },
  {
    id: "HT003",
    name: "Asakusa View Hotel",
    area: "浅草",
    rating: 4.1,
    price_cny_per_night: 550,
    total_cny: 1650,
    amenities: ["Wi-Fi", "温泉", "浅草寺步行可达"],
    adopted: true,
  },
  {
    id: "HT004",
    name: "APA Hotel Akihabara",
    area: "秋叶原",
    rating: 3.8,
    price_cny_per_night: 420,
    total_cny: 1260,
    amenities: ["Wi-Fi", "大浴场"],
    adopted: false,
  },
];

export async function runHotelAgent(taskId: string): Promise<HotelResult> {
  // Simulate API latency
  await new Promise((r) => setTimeout(r, 600));

  const adopted = MOCK_HOTELS.filter((h) => h.adopted);

  const trace = await createTrace(taskId, "hotel", "search_hotels", {
    input_tokens: 60,
    output_tokens: 380,
    latency_ms: 600,
    entities_returned: MOCK_HOTELS.length,
    entities_adopted: adopted.length,
    constraints_met: true,
  });

  return { hotels: MOCK_HOTELS, trace };
}
