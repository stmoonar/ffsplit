import { ContributionTrace } from "../types";
import { createTrace } from "../trace";

export interface FlightResult {
  flights: FlightOption[];
  trace: ContributionTrace;
}

export interface FlightOption {
  id: string;
  airline: string;
  departure: string;
  arrival: string;
  departure_time: string;
  arrival_time: string;
  price_cny: number;
  duration: string;
  adopted: boolean;
}

const MOCK_FLIGHTS: FlightOption[] = [
  {
    id: "FL001",
    airline: "ANA 全日空",
    departure: "PVG 上海浦东",
    arrival: "NRT 成田",
    departure_time: "08:30",
    arrival_time: "12:15",
    price_cny: 2800,
    duration: "2h45m",
    adopted: true,
  },
  {
    id: "FL002",
    airline: "JAL 日本航空",
    departure: "PVG 上海浦东",
    arrival: "HND 羽田",
    departure_time: "10:00",
    arrival_time: "13:30",
    price_cny: 3200,
    duration: "2h30m",
    adopted: true,
  },
  {
    id: "FL003",
    airline: "Spring Airlines 春秋航空",
    departure: "PVG 上海浦东",
    arrival: "NRT 成田",
    departure_time: "14:00",
    arrival_time: "17:45",
    price_cny: 1500,
    duration: "2h45m",
    adopted: false,
  },
  {
    id: "FL004",
    airline: "China Eastern 东方航空",
    departure: "PVG 上海浦东",
    arrival: "NRT 成田",
    departure_time: "09:15",
    arrival_time: "13:00",
    price_cny: 2600,
    duration: "2h45m",
    adopted: true,
  },
  {
    id: "FL005",
    airline: "Peach Aviation 乐桃",
    departure: "PVG 上海浦东",
    arrival: "KIX 关西",
    departure_time: "07:00",
    arrival_time: "10:30",
    price_cny: 1200,
    duration: "2h30m",
    adopted: false,
  },
];

export async function runFlightAgent(taskId: string): Promise<FlightResult> {
  // Simulate API latency
  await new Promise((r) => setTimeout(r, 800));

  const adopted = MOCK_FLIGHTS.filter((f) => f.adopted);

  const trace = await createTrace(taskId, "flight", "search_flights", {
    input_tokens: 80,
    output_tokens: 450,
    latency_ms: 800,
    entities_returned: MOCK_FLIGHTS.length,
    entities_adopted: adopted.length,
    constraints_met: true, // All within budget
  });

  return { flights: MOCK_FLIGHTS, trace };
}
