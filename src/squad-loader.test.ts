import { describe, expect, it } from "vitest";

import { getStageSquadPacket, loadSoftwareFactoryContext } from "./squad-loader.js";

describe("squad-loader", () => {
  it("loads bundled software factory context", () => {
    const squad = loadSoftwareFactoryContext();

    expect(squad.code).toBe("software-factory");
    expect(squad.party.length).toBeGreaterThan(10);
    expect(squad.agentsById["product-owner"]?.name).toBe("Otavio Objetivo");
    expect(squad.pipelineSteps.length).toBeGreaterThan(20);
  });

  it("builds a PRD stage packet with real agents and steps", () => {
    const packet = getStageSquadPacket("prd");

    expect(packet.relevantSteps.some((step) => step.agent === "product-owner")).toBe(true);
    expect(packet.relevantAgents.some((agent) => agent.id === "product-owner")).toBe(true);
    expect(packet.runnerSummary.length).toBeGreaterThan(0);
  });
});
