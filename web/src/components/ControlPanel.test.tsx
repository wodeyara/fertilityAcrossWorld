import { render, screen, fireEvent } from "@testing-library/react";
import { ControlPanel } from "./ControlPanel";
import type { FactorMeta } from "../types";

const factors: FactorMeta[] = [
  { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" },
  { id: "urbanisation", label: "Urbanisation", group: "Structure", unit: "%", direction: "negative", source: "WB" },
];

test("renders grouped factors and reports toggles", () => {
  const onToggle = vi.fn();
  render(
    <ControlPanel factors={factors} selected={new Set(["gdp_pc"])} onToggleFactor={onToggle}
      mode="residual" onSetMode={() => {}} r2={0.71} n={150} />,
  );
  expect(screen.getByText("Economic")).toBeInTheDocument();
  expect(screen.getByText("71%")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Urbanisation"));
  expect(onToggle).toHaveBeenCalledWith("urbanisation");
});

test("shows em dash when r2 is null", () => {
  render(
    <ControlPanel factors={factors} selected={new Set()} onToggleFactor={() => {}}
      mode="raw" onSetMode={() => {}} r2={null} n={0} />,
  );
  expect(screen.getByTestId("r2-readout")).toHaveTextContent("—");
});
