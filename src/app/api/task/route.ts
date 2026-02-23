import { NextRequest } from "next/server";
import { streamPlanner } from "@/lib/agents/planner";
import { runFlightAgent } from "@/lib/agents/flight";
import { runHotelAgent } from "@/lib/agents/hotel";
import { calculateShapley } from "@/lib/shapley";
import { verifyTrace } from "@/lib/trace";
import { SSEEvent, ContributionTrace } from "@/lib/types";

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const { query, payment_usdc } = await request.json();
  const taskId = `task-${Date.now().toString(36)}`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: SSEEvent) => {
        controller.enqueue(encoder.encode(sseEncode(event)));
      };

      try {
        const traces: ContributionTrace[] = [];

        // --- Phase 1: Run Flight and Hotel agents in parallel ---
        send({ type: "agent_start", agent: "flight", action: "search_flights" });
        send({ type: "agent_start", agent: "hotel", action: "search_hotels" });

        const [flightResult, hotelResult] = await Promise.all([
          runFlightAgent(taskId),
          runHotelAgent(taskId),
        ]);

        // Send flight results as chunks
        const adoptedFlights = flightResult.flights.filter((f) => f.adopted);
        for (const flight of flightResult.flights) {
          const marker = flight.adopted ? " [ADOPTED]" : "";
          send({
            type: "agent_chunk",
            agent: "flight",
            content: `${flight.airline} | ${flight.departure} → ${flight.arrival} | ${flight.departure_time}-${flight.arrival_time} | ¥${flight.price_cny} | ${flight.duration}${marker}\n`,
          });
          await new Promise((r) => setTimeout(r, 200));
        }
        send({
          type: "agent_done",
          agent: "flight",
          trace: flightResult.trace,
        });
        traces.push(flightResult.trace);

        // Send hotel results
        for (const hotel of hotelResult.hotels) {
          const marker = hotel.adopted ? " [ADOPTED]" : "";
          send({
            type: "agent_chunk",
            agent: "hotel",
            content: `${hotel.name} | ${hotel.area} | ★${hotel.rating} | ¥${hotel.price_cny_per_night}/晚 (共¥${hotel.total_cny})${marker}\n`,
          });
          await new Promise((r) => setTimeout(r, 200));
        }
        send({
          type: "agent_done",
          agent: "hotel",
          trace: hotelResult.trace,
        });
        traces.push(hotelResult.trace);

        // --- Phase 2: Run Planner agent (streams) ---
        send({
          type: "agent_start",
          agent: "planner",
          action: "generate_itinerary",
        });

        const plannerGen = streamPlanner(taskId, query);
        let plannerResult: { content: string; trace: ContributionTrace } | undefined;

        while (true) {
          const { done, value } = await plannerGen.next();
          if (done) {
            plannerResult = value;
            break;
          }
          send({ type: "agent_chunk", agent: "planner", content: value });
        }

        if (plannerResult) {
          send({
            type: "agent_done",
            agent: "planner",
            trace: plannerResult.trace,
          });
          traces.push(plannerResult.trace);
        }

        // --- Phase 3: Verify traces and calculate Shapley ---
        // Verify all signatures
        for (const trace of traces) {
          const valid = verifyTrace(trace);
          if (!valid) {
            send({
              type: "error",
              message: `Invalid signature for agent ${trace.agent}`,
            });
            controller.close();
            return;
          }
        }

        // Calculate Shapley values
        const shapleyResult = calculateShapley(taskId, payment_usdc || 10);
        send({ type: "shapley_result", result: shapleyResult });

        // Task complete
        send({ type: "task_complete", task_id: taskId });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
